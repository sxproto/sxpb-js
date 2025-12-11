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

function formatNestAtom(s: string, wrapInParens: boolean): string {
  // If string contains spaces or special characters that would require quotes,
  // we prefer `"" ...` (anonymous discriminated string) format if possible.

  if (!s) return '""'; // Empty string -> ""

  // Check if string needs quotes or special handling
  if (isPlainString(s) && hasBarePrefix(s)) {
    return s;
  }

  if (s.includes(" ") && !/[\t\n\v\f\r]/.test(s) && !s.includes("  ")) {
    const parts = s.split(" ");
    const serializedParts = parts.map(formatAtom);
    const body = `"" ${serializedParts.join(" ")}`;
    return wrapInParens ? `(${body})` : body;
  }

  return formatAtom(s);
}

function serializeNestBody(nest: SxPB.Nest, indent: number, level: number): string {
  const list = nestToList(nest, true);

  const items: string[] = [];
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  for (const item of list) {
    if ((item as any)._isNestMarker) {
      items.push('("")');
    } else if (typeof item === "string") {
      // Top level nest items (keys) should be wrapped in parens if they are anonymous discriminated strings
      // to avoid being parsed as multiple items.
      items.push(formatNestAtom(item, true));
    } else if (Array.isArray(item) || item instanceof SxPB.List) {
      const innerBody = serializeNestListInternal(item as SxPB.Value[], indent, level + 1);
      items.push(`(${innerBody})`);
    }
  }

  if (indent > 0) {
    // Heuristic: items > 4 or contains sub-list -> multiline
    // items[0] is `("")`.
    const hasSubList = items.some((item, index) => index > 0 && item.startsWith("("));

    if (items.length > 4 || hasSubList) {
      // Multiline
      if (items[0] === '("")') {
        const rest = items.slice(1);
        const restStr = rest.map(s => `${pad}${s}`).join("\n");
        return `("")\n${restStr}`;
      }
      const restStr = items.map(s => `${pad}${s}`).join("\n");
      return restStr;
    } else {
      // Inline
      return items.join(" ");
    }
  }

  return items.join(" ");
}

function serializeNestListInternal(lst: SxPB.Value[], indent: number, level: number): string {
  const items: string[] = [];
  for (let i = 0; i < lst.length; i++) {
    const item = lst[i];
    if (typeof item === "string") {
      if (i === 0) {
        items.push(formatAtom(item));
      } else {
        items.push(formatNestAtom(item, false));
      }
    } else if ((item as any)._isNestMarker) {
      items.push('("")');
    } else if (Array.isArray(item) || item instanceof SxPB.List) {
      const innerBody = serializeNestListInternal(item as SxPB.Value[], indent, level + 1);
      items.push(`(${innerBody})`);
    }
  }
  return items.join(" ");
}


function serializeField(key: string, value: SxPB.Value, indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  if (value instanceof SxPB.Many) {
    // manyof_field
    const items = value.value as SxPB.Lone[];
    if (items.length === 0) {
      return `${pad}((${key}))`;
    }

    const parts = items.map(lone => {
      const k = Object.keys(lone.value)[0];
      const v = lone.value[k];

      if (k === "value" && Object.keys(lone.value).length === 1) {
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
    const [subkey, loneValue] = Object.entries(value.value)[0];
    if (typeof loneValue === "object" && loneValue !== null && !Array.isArray(loneValue) && !(loneValue instanceof SxPB.Many) && !(loneValue instanceof SxPB.Lone)) {
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

  if (value instanceof SxPB.Nest) {
    const body = serializeNestBody(value, indent, level + 1);
    // Nest body includes `("")` if present.
    // We wrap: `(${key} ${body})`.

    // If the nest body is multiline, format with the key on the first line and the body following.
    if (indent > 0 && body.includes("\n")) {
      return `${pad}(${key} ${body}\n${pad})`;
    }

    return `${pad}(${key} ${body})`;
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
  if (obj && typeof obj === "object" && !Array.isArray(obj) && !(obj instanceof SxPB.Lone) && !(obj instanceof SxPB.Many) && !(obj instanceof SxPB.Nest)) {
    return serializeMessageBody(obj as SxPB.Dict, indent, 0);
  }

  if (obj instanceof SxPB.Nest) {
    const body = serializeNestBody(obj, indent, 0);
    // Top level nest
    return body; // Already contains `("")` and formatting
  }

  if (Array.isArray(obj) || obj instanceof SxPB.Many) {
    // Top level list
    const items = Array.isArray(obj) ? obj : obj.value;
    if (items.length === 0) return "(())";

    if (Array.isArray(obj)) {
      const body = serializeListBody(obj, indent, 0);
      if (indent > 0) return `(())\n${body}`;
      if (indent === 0) return `(()) ${body}`;
      return `(())${body}`;
    }

    if (obj instanceof SxPB.Many) {
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

function nestToList(nest: SxPB.Nest, includeMarker: boolean): SxPB.Value[] {
  const items: SxPB.Value[] = [];
  if (includeMarker) {
    items.push({ _isNestMarker: true } as any);
  }

  for (const k in nest.value) {
    const v = nest.value[k];
    if (v === null) {
      items.push(k);
    } else {
      // v is SxpbNest
      // Flatten into [k, ...v_entries]
      // Note: recursively call nestToList WITHOUT marker for the sub-list
      const subItems = nestToList(v, false);
      items.push(new SxPB.List([k, ...subItems]));
    }
  }
  return items;
}
