import { describe, expect, it } from "vitest";
import { parse, stringify, SxpbLone, SxpbMany } from "../src/index.js";

describe("manyof element keys", () => {
  it("distinguishes anonymous scalars from an explicit value field", () => {
    const input = "((m) 1 (value 2) (count 3) 4)";
    const parsed = parse(input, true) as { m: SxpbMany };

    expect(parsed.m).toBeInstanceOf(SxpbMany);
    expect(parsed.m.value.map(item => (item as SxpbLone).value)).toEqual([
      { "": 1 },
      { value: 2 },
      { count: 3 },
      { "": 4 }
    ]);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("preserves anonymous keys around named entries in nested manyofs", () => {
    const input = "(outer ((m) before (kind middle) (value explicit) after))";
    const parsed = parse(input, true) as {
      outer: { m: SxpbMany };
    };

    expect(parsed.outer.m.value.map(item => (item as SxpbLone).value)).toEqual([
      { "": "before" },
      { kind: "middle" },
      { value: "explicit" },
      { "": "after" }
    ]);
    expect(stringify(parsed, 0)).toBe(input);
  });

  it("uses value only at the native conversion boundary", () => {
    const input = "((m) 1 (value 2) (count 3) 4)";

    expect(parse(input)).toEqual({
      m: [
        { value: 1 },
        { value: 2 },
        { count: 3 },
        { value: 4 }
      ]
    });
  });

  it("indents anonymous and named entries at the same level", () => {
    const parsed = parse("((m) 1 (value 2) 3)", true);

    expect(stringify(parsed, 2)).toBe(
      "((m)\n" +
      "  1\n" +
      "  (value 2)\n" +
      "  3\n" +
      ")"
    );
  });

  it("round-trips an anonymous empty string without erasing its key", () => {
    const input = '((m) "" (value ""))';
    const parsed = parse(input, true) as { m: SxpbMany };

    expect((parsed.m.value[0] as SxpbLone).value).toEqual({ "": "" });
    expect((parsed.m.value[1] as SxpbLone).value).toEqual({ value: "" });
    expect(stringify(parsed, 0)).toBe(input);
  });
});
