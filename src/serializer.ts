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

  // If it looks like a number, it must be quoted to remain a string.
  if (/^[+-]?\d+$/.test(s)) return false;
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false;

  const startPattern = /^([-.]?[^-+.0123456789 \t\n\v\f\r;"()]|--|\.\.)/;
  return startPattern.test(s);
}

function isDict(v: SxPB.Value): v is SxPB.Dict {
  return !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof SxPB.List) &&
    !(v instanceof SxPB.Lone) &&
    !(v instanceof SxPB.Many) &&
    !(v instanceof SxPB.Nest);
}

function formatAtom(v: SxPB.Value): string {
  if (typeof v === "boolean") {
    return v ? "+true" : "+false";
  }
  if (typeof v === "number" || typeof v === "bigint") {
    return v.toString();
  }
  if (typeof v === "string") {
    if (!v) return '""';
    if (isPlainString(v) && hasBarePrefix(v)) {
      return v;
    }
    return JSON.stringify(v);
  }
  throw new Error(`Unsupported atom type: ${typeof v}`);
}

function formatKey(key: string): string {
  return formatAtom(key);
}

function joinCondensed(parts: string[]): string {
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

export function canFormatAsAnonymousDiscriminatedString(s: string): boolean {
  return /^[^ \t\n\v\f\r;"()]+( [^ \t\n\v\f\r;"()]+)+$/.test(s);
}

function formatNestString(s: string): string {
  if (!s) return "";
  return s.split(" ").join(" ");
}

function formatNestLeaf(s: string): string {
  if (!s) return '("" "")';
  if (canFormatAsAnonymousDiscriminatedString(s)) return `("" ${formatNestString(s)})`;
  return formatAtom(s);
}

function serializeAnonymousNestEntry(nest: SxPB.Nest, indent: number, level: number, pad: string): string {
  const body = serializeNestBody(nest, indent, level + 1);
  if (!body) return '("" (""))';
  if (indent > 0) {
    if (!body.includes("\n")) return `("" ("") ${body.trimStart()})`;
    return `("" ("")\n${body}\n${pad})`;
  }
  return `("" ("") ${body})`;
}

function serializeNestEntry(key: string, value: SxPB.Nest | null, indent: number, level: number, pad: string): string {
  if (value === null) {
    return formatNestLeaf(key);
  }

  if (key === "") {
    return serializeAnonymousNestEntry(value, indent, level, pad);
  }

  const keyAtom = formatKey(key);
  const childEntries = value.pairs();
  if (childEntries.length === 0) return `(${keyAtom})`;

  if (childEntries.length === 1) {
    const [childKey, childValue] = childEntries[0];
    if (childValue === null) {
      if (canFormatAsAnonymousDiscriminatedString(childKey)) {
        return `(${keyAtom} "" ${formatNestString(childKey)})`;
      }
      return `(${keyAtom} ${formatAtom(childKey)})`;
    }
  }

  const body = serializeNestBody(value, indent, level + 1);
  if (indent > 0) {
    if (!body.includes("\n")) return `(${keyAtom} ${body.trimStart()})`;
    return `(${keyAtom}\n${body}\n${pad})`;
  }
  return `(${keyAtom} ${body})`;
}

function serializeNestBody(nest: SxPB.Nest, indent: number, level: number): string {
  const entries = nest.pairs();
  if (entries.length === 0) return "";

  const pad = indent > 0 ? " ".repeat(indent * level) : "";
  const parts = entries.map(([key, value]) => serializeNestEntry(key, value, indent, level, pad));
  const shouldCondense = entries.length >= 1 && entries.length <= 3 && entries.every(([, value]) => value === null);

  if (shouldCondense || indent <= 0) {
    return parts.join(" ");
  }
  return parts.map(part => `${pad}${part}`).join("\n");
}

function isNativeNestEntry(v: SxPB.Value): v is SxPB.Dict {
  return isDict(v) && Object.keys(v).length === 1 && Array.isArray(Object.values(v)[0]);
}

function isNativeNestArray(v: SxPB.Value): v is SxPB.Value[] {
  return Array.isArray(v) && !(v instanceof SxPB.List) && v.some(isNativeNestEntry);
}

function serializeNativeNestEntry(item: SxPB.Value, indent: number, level: number, pad: string): string {
  if (typeof item === "string") return formatNestLeaf(item);
  if (!isNativeNestEntry(item)) return formatAtom(item);

  const [key, rawValue] = Object.entries(item)[0];
  const value = rawValue as SxPB.Value[];
  if (key === "") {
    const body = serializeNativeNestBody(value, indent, level + 1);
    if (!body) return '("" (""))';
    if (indent > 0) {
      if (!body.includes("\n")) return `("" ("") ${body.trimStart()})`;
      return `("" ("")\n${body}\n${pad})`;
    }
    return `("" ("") ${body})`;
  }

  const keyAtom = formatKey(key);
  if (value.length === 0) return `(${keyAtom})`;
  if (value.length === 1 && typeof value[0] === "string") {
    const childKey = value[0];
    if (canFormatAsAnonymousDiscriminatedString(childKey)) {
      return `(${keyAtom} "" ${formatNestString(childKey)})`;
    }
    return `(${keyAtom} ${formatAtom(childKey)})`;
  }

  const body = serializeNativeNestBody(value, indent, level + 1);
  if (indent > 0) {
    if (!body.includes("\n")) return `(${keyAtom} ${body.trimStart()})`;
    return `(${keyAtom}\n${body}\n${pad})`;
  }
  return `(${keyAtom} ${body})`;
}

function serializeNativeNestBody(items: SxPB.Value[], indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";
  const parts = items.map(item => serializeNativeNestEntry(item, indent, level, pad));
  const shouldCondense = items.length >= 1 &&
    items.length <= 3 &&
    items.every(item => typeof item === "string");

  if (shouldCondense || indent <= 0) return parts.join(" ");
  return parts.map(part => `${pad}${part}`).join("\n");
}

function serializeMessageBody(d: SxPB.Dict, indent: number, level: number): string {
  const parts = Object.entries(d).map(([k, v]) => serializeField(k, v, indent, level));

  if (indent > 0) return parts.join("\n");
  if (indent === 0) return parts.join(" ");
  return joinCondensed(parts);
}

function serializeListBody(lst: SxPB.Value[], indent: number, level: number): string {
  const isMessageArray = lst.length > 0 && isDict(lst[0]);

  if (isMessageArray && indent < 0) {
    const bodies = lst.map(item => {
      const body = serializeMessageBody(item as SxPB.Dict, indent, level + 1);
      return body ? `(()${body})` : "()";
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

function manyofParts(value: SxPB.Many, indent: number, level: number): string[] {
  return value.value.map(item => {
    if (item instanceof SxPB.Lone) {
      const entries = Object.entries(item.value);
      if (entries.length === 1 &&
          entries[0][0] === "" &&
          (entries[0][1] === null || typeof entries[0][1] !== "object")) {
        const pad = indent > 0 ? " ".repeat(indent * (level + 1)) : "";
        return `${pad}${formatAtom(entries[0][1])}`;
      }
      const [itemKey, itemValue] = entries[0];
      return serializeField(itemKey, itemValue, indent, level + 1);
    }
    if (isDict(item)) return serializeMessageBody(item, indent, level + 1);
    return formatAtom(item);
  });
}

function serializeManyofField(key: string, value: SxPB.Many, indent: number, level: number, pad: string): string {
  if (value.value.length === 0) return `${pad}((${key}))`;

  const parts = manyofParts(value, indent, level);
  if (indent > 0) {
    const body = parts.join("\n");
    return `${pad}((${key})\n${body}\n${pad})`;
  }
  if (indent === 0) {
    return `((${key}) ${parts.join(" ")})`;
  }
  return `((${key})${joinCondensed(parts)})`;
}

function serializeLoneofField(key: string, value: SxPB.Lone, indent: number, level: number, pad: string): string {
  const [subkeyText, loneValue] = Object.entries(value.value)[0];
  const subkey = formatKey(subkeyText);
  const body = serializeFieldBody(loneValue, indent, level);

  if (!body) {
    return `${pad}((${key} ${subkey}))`;
  }
  if (indent > 0) {
    return `${pad}((${key} ${subkey})${body})`;
  }
  if (indent === 0) {
    return `((${key} ${subkey})${body})`;
  }

  const keyPart = `(${joinCondensed([key, subkey])})`;
  return `((${joinCondensed([keyPart, body])}))`;
}

function serializeFieldBody(value: SxPB.Value, indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";

  if (value instanceof SxPB.Nest) {
    const body = serializeNestBody(value, indent, level + 1);
    if (indent > 0) {
      if (!body) return ' ("")';
      if (!body.includes("\n")) return ` ("") ${body.trimStart()}`;
      return ` ("")\n${body}\n${pad}`;
    }
    return body ? ` ("") ${body}` : ' ("")';
  }

  if (value instanceof SxPB.Many) {
    const parts = manyofParts(value, indent, level);
    if (indent > 0) return parts.length > 0 ? ` (())\n${parts.join("\n")}\n${pad}` : " (())";
    if (indent === 0) return parts.length > 0 ? ` (()) ${parts.join(" ")}` : " (())";
    return parts.length > 0 ? `(())${joinCondensed(parts)}` : "(())";
  }

  if (isDict(value)) {
    const body = serializeMessageBody(value, indent, level + 1);
    if (!body) return "";
    if (indent > 0) return `\n${body}\n${pad}`;
    const joiner = (indent === 0 || (indent < 0 && !body.startsWith("("))) ? " " : "";
    return `${joiner}${body}`;
  }

  if (isNativeNestArray(value)) {
    const body = serializeNativeNestBody(value, indent, level + 1);
    if (indent > 0) {
      if (!body) return ' ("")';
      if (!body.includes("\n")) return ` ("") ${body.trimStart()}`;
      return ` ("")\n${body}\n${pad}`;
    }
    return body ? ` ("") ${body}` : ' ("")';
  }

  if (Array.isArray(value)) {
    const listBody = serializeListBody(value, indent, level + 1);
    if (indent > 0) return listBody ? ` (())\n${listBody}\n${pad}` : " (())";
    const joiner = indent < 0 ? "" : " ";
    return listBody ? `${joiner}(())${joiner}${listBody}` : `${joiner}(())`;
  }

  return ` ${formatAtom(value)}`;
}

function serializeField(keyText: string, value: SxPB.Value, indent: number, level: number): string {
  const pad = indent > 0 ? " ".repeat(indent * level) : "";
  const key = formatKey(keyText);

  if (value instanceof SxPB.Many) {
    return serializeManyofField(key, value, indent, level, pad);
  }
  if (value instanceof SxPB.Lone) {
    return serializeLoneofField(key, value, indent, level, pad);
  }
  return `${pad}(${key}${serializeFieldBody(value, indent, level)})`;
}

export function stringify(obj: SxPB.Value, indent: number = 1): string {
  if (isDict(obj)) {
    return serializeMessageBody(obj, indent, 0);
  }

  if (obj instanceof SxPB.Nest) {
    const body = serializeNestBody(obj, indent, 0);
    if (!body) return '("")';
    if (indent > 0) return `("")\n${body}`;
    if (indent === 0) return `("") ${body}`;
    return `("")${body}`;
  }

  if (isNativeNestArray(obj)) {
    const body = serializeNativeNestBody(obj, indent, 0);
    if (!body) return '("")';
    if (indent > 0) return `("")\n${body}`;
    if (indent === 0) return `("") ${body}`;
    return `("")${body}`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "(())";
    const body = serializeListBody(obj, indent, 0);
    if (indent > 0) return `(())\n${body}`;
    if (indent === 0) return `(()) ${body}`;
    return `(())${body}`;
  }

  if (obj instanceof SxPB.Many) {
    if (obj.value.length === 0) return "(())";
    const parts = manyofParts(obj, indent, 0);
    if (indent > 0) return `(())\n${parts.join("\n")}`;
    if (indent === 0) return `(()) ${parts.join(" ")}`;
    return `(())${joinCondensed(parts)}`;
  }

  throw new Error("Top-level object must be a message/dict or a list/array");
}
