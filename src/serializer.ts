import { SxPBTypes as SxPB } from "./types.js";

// See https://grencez.dev/2024/sxpb-string-grammar-20240717/ for string grammar rules.

export function canFormatAsAnonymousDiscriminatedString(s: string): boolean {
  // Must contain spaces to be worth it.
  // Must NOT contain characters that would require quoting the parts (e.g., quotes, parens, semicolons).
  // Must NOT contain control characters (newlines, tabs, etc.).
  // Must NOT start or end with spaces, nor contain double spaces.
  // This strict regex ensures the string consists of two or more space-separated "plain words".
  return /^[^ \t\n\v\f\r;"()]+(?: [^ \t\n\v\f\r;"()]+)+$/.test(s);
}

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

function isLikeNest(lst: any[]): boolean {
  // Heuristic: A list is a nest if it contains a mix of strings and objects (Nest items),
  // OR if it contains objects that look like Nest items (single key mapping to array).
  if (lst.length === 0) return false;

  let hasString = false;
  let hasObject = false;
  let hasScalar = false; // number, boolean

  for (const item of lst) {
    if (typeof item === "string") {
      hasString = true;
    } else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
      hasObject = true;
      // Check if it looks like a Nest Item { key: Array }
      const keys = Object.keys(item);
      if (keys.length === 1 && Array.isArray(item[keys[0]])) {
        // Definitely looks like a nest item
      }
    } else if (typeof item === "number" || typeof item === "boolean") {
      hasScalar = true;
    }
  }

  // Purely mixed string + object is definitely a nest (SxPB generic lists don't allow this).
  if (hasString && hasObject) return true;

  // List of objects where objects have array values?
  // [{a: [...]}] -> could be nest.
  if (hasObject && !hasString && !hasScalar) {
    // If all objects have array values, treat as nest?
    // Ambiguous with list of messages.
    // However, list of messages usually has scalar values or sub-messages.
    // If we see { key: Array }, it is likely a Nest structure (unwrapped).
    const allArrayValues = lst.every(item => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
      const keys = Object.keys(item);
      if (keys.length !== 1) return false;
      return Array.isArray(item[keys[0]]);
    });
    if (allArrayValues) return true;
  }

  return false;
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

  if (!s) return '("" "")'; // Empty string -> ("" "")

  // Check if string needs quotes or special handling
  if (isPlainString(s) && hasBarePrefix(s)) {
    return s;
  }

  if (canFormatAsAnonymousDiscriminatedString(s)) {
    const parts = s.split(" ");
    const serializedParts = parts.map(formatAtom);
    const body = `"" ${serializedParts.join(" ")}`;
    return wrapInParens ? `(${body})` : body;
  }

  return formatAtom(s);
}

function serializeNestBody(nest: SxPB.Nest, indent: number, level: number): string {
  const items: string[] = [];
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  items.push('("")'); // Marker

  for (const item of nest) {
    if (typeof item === "string") {
      items.push(formatNestAtom(item, true));
    } else {
      // { key: SubNest }
      const key = Object.keys(item)[0];
      const subNest = item[key];
      const innerBody = serializeNestListInternal(key, subNest, indent, level + 1);
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

function serializeNestListInternal(key: string, nest: SxPB.Nest, indent: number, level: number): string {
  const items: string[] = [];
  items.push(formatAtom(key));

  // If key is empty string (Anonymous Nest), we MUST insert `("")` (Empty List)
  // to ensure it is parsed as a Generic List and not an Anonymous Discriminated String.
  // This is required if the content consists only of scalars (which otherwise forms a valid string body).
  // Adding `("")` is safe because it parses to an empty list which is ignored by listToNest.
  if (key === "") {
    items.push('("")');
  }

  // If nest contains exactly one string item, format it directly to avoid anonymous discriminated string format
  if (nest.length === 1 && typeof nest[0] === "string") {
    const s = nest[0];
    if (canFormatAsAnonymousDiscriminatedString(s)) {
      // Use inline anonymous discriminated string format: `"" part1 part2`
      items.push(formatNestAtom(s, false));
    } else {
      // Use quoted string format: `"quoted string"`
      items.push(formatAtom(s));
    }
    return items.join(" ");
  }

  for (const item of nest) {
    if (typeof item === "string") {
      items.push(formatNestAtom(item, true));
    } else {
      // { key: SubNest }
      const subKey = Object.keys(item)[0];
      const subNest = item[subKey];
      const innerBody = serializeNestListInternal(subKey, subNest, indent, level + 1);
      items.push(`(${innerBody})`);
    }
  }
  return items.join(" ");
}


function serializeField(key: string, value: SxPB.Value, indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  if (Array.isArray(value)) {
    // Check if it looks like a Nest (mixed content or nest-structure)
    if (isLikeNest(value)) {
      // Treat as Nest
      // We cast to SxPB.Nest because serializeNestBody iterates it like an array, which native array satisfies.
      // But we need to ensure the items are valid Nest items.
      const body = serializeNestBody(value as any, indent, level + 1);

      if (indent > 0 && body.includes("\n")) {
        return `${pad}(${key} ${body}\n${pad})`;
      }
      return `${pad}(${key} ${body})`;
    }
  }

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
      // Check for Nest heuristic
      if (isLikeNest(obj)) {
        return serializeNestBody(obj as any, indent, 0);
      }

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

