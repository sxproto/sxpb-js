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

  it.each([
    [
      "((choice) (named 9) one (middle +false) 02 +true)",
      [{ named: 9 }, { "": "one" }, { middle: false }, { "": "02" }, { "": "+true" }]
    ],
    [
      "((choice) (named one) 1 (middle +true) 2.5)",
      [{ named: "one" }, { "": 1 }, { middle: true }, { "": 2.5 }]
    ],
    [
      "(choice (()) (named one) +true (middle 9) 00 +01 +false)",
      [{ named: "one" }, { "": true }, { middle: 9 }, { "": false }, { "": true }, { "": false }]
    ],
    [
      "((choice) () (named 1) (() (x 2)))",
      [{ "": {} }, { named: 1 }, { "": { x: 2 } }]
    ],
    [
      "((choice) 1 (named (x 2)) 3)",
      [{ "": 1 }, { named: { x: 2 } }, { "": 3 }]
    ]
  ])("uses the first anonymous element to normalize a manyof", (source, expected) => {
    const parsed = parse(source, true) as { choice: SxpbMany };
    expect(parsed.choice.value.map(item => (item as SxpbLone).value)).toEqual(expected);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it.each([
    "((choice) 1 (named word) +true)",
    "((choice) +true (named word) 2)",
    "((choice) one (named 1) ())",
    "((choice) () (named 1) one)",
    "((choice) 1 (named word) (() (x 2)))",
    "((choice) (() (x 1)) (named word) 2)",
    '((choice) 1 "")',
    '((choice) "" ())'
  ])("rejects incompatible anonymous manyof kinds: %s", source => {
    expect(() => parse(source, true)).toThrow();
  });

  it("names an anonymous first top-level entry to preserve the manyof container", () => {
    const value = new SxpbMany([
      new SxpbLone({ "": 1 }),
      new SxpbLone({ "": 2 })
    ]);

    expect(stringify(value, 0)).toBe("(()) (value 1) 2");
    const reparsed = parse(stringify(value, 0), true);
    expect(reparsed).toBeInstanceOf(SxpbMany);
    expect((reparsed as SxpbMany).value.map(item => (item as SxpbLone).value)).toEqual([
      { value: 1 },
      { "": 2 }
    ]);
  });

  it("prints anonymous manyof messages with anonymous-message syntax", () => {
    const parsed = parse("((choice) () (named 1) (() (x 2)))", true);
    expect(stringify(parsed, 0)).toBe("((choice) () (named 1) (() (x 2)))");
    expect(stringify(parsed, 2)).toBe(
      "((choice)\n" +
      "  ()\n" +
      "  (named 1)\n" +
      "  (()\n" +
      "    (x 2)\n" +
      "  )\n" +
      ")"
    );
  });
});
