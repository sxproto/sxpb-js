import { SxPBTypes as SxPB } from "./types.js";

// See https://grencez.dev/2024/sxpb-string-grammar-20240717/ for string grammar rules.

function isPlainString(s: string): boolean {
  if (!s) return false;
  return /^[^ \t\n\v\f\r;"()]+$/.test(s);
}

function hasBarePrefix(s: string): boolean {
  if (!s) return false;

  // `+true` / `+false` are booleans.
  if (s === "+true" || s === "+false") return false;

  // Check against number regexes.
  // If it looks like a number, it must be quoted to remain a string.
  if (/^[+-]?\d+$/.test(s)) return false; // Int
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false; // Float

  const startPattern = /^([-.]?[^-+.0123456789 \t\n\v\f\r;"()]|--|\.\.)/;
  return startPattern.test(s);
}

function formatAtom(v: SxPB.Value): string {
  if (typeof v === "boolean") {
    return v ? "+true" : "+false";
  }
  if (typeof v === "number") {
    return v.toString();
  }
  if (typeof v === "bigint") {
    return v.toString();
  }
  if (typeof v === "string") {
    if (!v) return '""';

    // In array, we quote if it contains space (already covered by isPlainString check usually, but let's be safe)
    // Actually isPlainString checks for spaces.

    if (isPlainString(v) && hasBarePrefix(v)) {
      return v;
    }
    return JSON.stringify(v);
  }
  throw new Error(`Unsupported atom type: ${typeof v}`);
}

function joinCondensed(parts: string[]): string {
  if (parts.length === 0) return "";
  const filtered = parts.filter(p => p);
  if (filtered.length === 0) return "";

  const result = [filtered[0]];
  for (let i = 1; i < filtered.length; i++) {
    const prev = result[result.length - 1];
    const curr = filtered[i];
    if (prev.endsWith("(") || prev.endsWith(")") || curr.startsWith("(") || curr.startsWith(")")) {
      result.push(curr);
    } else {
      result.push(" ");
      result.push(curr);
    }
  }
  return result.join("");
}

function serializeMessageBody(d: SxPB.Dict, indent: number, level: number): string {
  const parts = Object.entries(d).map(([k, v]) => serializeField(k, v, indent, level));

  if (indent > 0) {
    return parts.join("\n");
  }
  if (indent === 0) {
    return parts.join(" ");
  }
  return joinCondensed(parts);
}

function serializeListBody(lst: SxPB.Value[], indent: number, level: number): string {
  const isMessageArray = lst.length > 0 && typeof lst[0] === "object" && !Array.isArray(lst[0]) && !(lst[0] instanceof SxPB.Lone) && !(lst[0] instanceof SxPB.Many);

  if (isMessageArray && indent < 0) {
    const bodies = lst.map(item => {
      const b = serializeMessageBody(item as SxPB.Dict, indent, level + 1);
      return b ? `(()${b})` : "()";
    });
    return joinCondensed(bodies);
  }

  const items: string[] = [];
  for (const item of lst) {
    if (isMessageArray) {
      const body = serializeMessageBody(item as SxPB.Dict, indent, level + 1);
      if (indent > 0) {
        const pad = " ".repeat(indent * level);
        items.push(body ? `${pad}(()\n${body}\n${pad})` : `${pad}()`);
      } else {
        items.push(body ? `(() ${body})` : "()");
      }
    } else {
      // Scalar
      const atom = formatAtom(item);
      if (indent > 0) {
        const pad = " ".repeat(indent * level);
        items.push(`${pad}${atom}`);
      } else {
        items.push(atom);
      }
    }
  }

  return indent > 0 ? items.join("\n") : items.join(" ");
}


function serializeField(key: string, value: SxPB.Value, indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  if (value instanceof SxPB.Many) {
    // manyof_field
    // We need to support variants.
    // If items are Lone with specific structure, we might choose variant.
    // Default to `(key (()) items...)` variant 1 as it is most generic?

    // Check if items are "simple" to decide variant?
    // Python implementation of `manyof_field` transformer creates `SxpbMany` of `SxpbLone`.
    // It seems `manyof_body` always uses `(())`.
    // `manyof_field` variant 2: `((name) items...)`.
    // Let's use `(key (()) items...)` for consistency with Python if possible.

    const items = value.value as SxPB.Lone[];
    if (items.length === 0) {
      return `${pad}((${key}))`;
    }

    const parts = items.map(lone => {
      // each lone is {subkey: val} or {value: val} (if scalar atom)
      const k = Object.keys(lone.value)[0];
      const v = lone.value[k];

      if (k === "value" && Object.keys(lone.value).length === 1) {
        // It was a scalar item in manyof_field variant 2?
        // Or it is just a field named "value"?
        // Ambiguity.
        // If we want to support `((key) item item)`, items are scalars.
        // But `SxpbMany` stores `SxpbLone`.
        // If `SxpbLone` has key "value", it might be a trick.

        // Let's just serialize as fields: `(key val)`.
        return serializeField(k, v, indent, level + 1);
      }
      return serializeField(k, v, indent, level + 1);
    });

    let bodyStr = "";
    if (indent > 0) bodyStr = parts.join("\n");
    else if (indent === 0) bodyStr = parts.join(" ");
    else bodyStr = joinCondensed(parts);

    if (indent > 0) {
      return `${pad}(${key} (())\n${bodyStr}\n${pad})`;
    }
    const joiner = indent < 0 ? "" : " ";
    return `(${key}${joiner}(())${joiner}${bodyStr})`;
  }

  if (value instanceof SxPB.Lone) {
    // loneof_field `((key subkey) value)`
    const [subkey, loneValue] = Object.entries(value.value)[0];
    if (typeof loneValue === "object" && loneValue !== null && !Array.isArray(loneValue) && !(loneValue instanceof SxPB.Many) && !(loneValue instanceof SxPB.Lone)) {
      // Nested message
      const body = serializeMessageBody(loneValue as SxPB.Dict, indent, level + 1);
      if (indent > 0) {
        return body
          ? `${pad}((${key} ${subkey})\n${body}\n${pad})`
          : `${pad}((${key} ${subkey}))`;
      }
      const keyPart = indent === 0 ? `(${key} ${subkey})` : `(${joinCondensed([key, subkey])})`;
      return `((${joinCondensed([keyPart, body])}))`;
    } else {
      const atom = formatAtom(loneValue as SxPB.Value);
      if (indent > 0) {
        return `${pad}((${key} ${subkey}) ${atom})`;
      }
      const keyPart = indent === 0 ? `(${key} ${subkey})` : `(${joinCondensed([key, subkey])})`;
      return `((${joinCondensed([keyPart, atom])}))`;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof SxPB.Many)) {
    // Message aka SxPB.Dict
    const body = serializeMessageBody(value as SxPB.Dict, indent, level + 1);
    if (!body) return `${pad}(${key})`;

    if (indent > 0) {
      return `${pad}(${key}\n${body}\n${pad})`;
    }
    const joiner = (indent === 0 || (indent < 0 && !body.startsWith("("))) ? " " : "";
    return `(${key}${joiner}${body})`;
  }

  if (Array.isArray(value)) {
    // List aka SxPB.List -> array_body
    const listBody = serializeListBody(value, indent, level + 1);
    if (indent > 0) {
      return listBody
        ? `${pad}(${key} (())\n${listBody}\n${pad})`
        : `${pad}(${key} (()))`;
    }
    const joiner = indent < 0 ? "" : " ";
    return `(${key}${joiner}(())${joiner}${listBody})`;
  }

  // Scalar
  const atom = formatAtom(value);
  return `${pad}(${key} ${atom})`;
}

export function stringify(obj: SxPB.Value, indent: number = 1): string {
  if (obj && typeof obj === "object" && !Array.isArray(obj) && !(obj instanceof SxPB.Lone) && !(obj instanceof SxPB.Many)) {
    return serializeMessageBody(obj as SxPB.Dict, indent, 0);
  }

  if (Array.isArray(obj) || obj instanceof SxPB.Many) {
    // Top level list
    const items = Array.isArray(obj) ? obj : obj.value;
    if (items.length === 0) return "(())";

    // Top level is list of messages (usually) or manyof fields.
    // Grammar start: message_body | array_body | manyof_body.
    // If we pass an Array, we treat it as an array_body, which requires `(())` header.

    if (Array.isArray(obj)) {
      const body = serializeListBody(obj, indent, 0);
      // Prepend `(())` for valid `array_body`.
      if (indent > 0) return `(())\n${body}`;
      if (indent === 0) return `(()) ${body}`;
      return `(())${body}`;
    }

    if (obj instanceof SxPB.Many) {
      // manyof_body
      // similar to array_body but with fields.
      // Reuse serializeField logic for items?
      const parts = (obj.value as SxPB.Lone[]).map(lone => {
        const k = Object.keys(lone.value)[0];
        const v = lone.value[k];
        return serializeField(k, v, indent, 0);
      });

      let body = "";
      if (indent > 0) body = parts.join("\n");
      else if (indent === 0) body = parts.join(" ");
      else body = joinCondensed(parts);

      if (indent > 0) return `(())\n${body}`;
      if (indent === 0) return `(()) ${body}`;
      return `(())${body}`;
    }
  }

  throw new Error("Top-level object must be a message/dict or a list/array");
}
