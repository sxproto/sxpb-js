import { describe, expect, it } from "vitest";
import { parse, stringify } from "../src/index.js";
import { acceptedAppendCases, rejectedAppendCases } from "./append_case.js";

describe("explicit append operations", () => {
  it.each(acceptedAppendCases)("appends and preserves precise collection types: %s", (source, expected) => {
    const parsed = parse(source, true);

    expect(parsed).toEqual(expected);
    const canonical = stringify(parsed, 0);
    expect(canonical).not.toContain("+.");
    expect(parse(canonical, true)).toEqual(expected);
  });

  it.each(rejectedAppendCases)("rejects invalid append or duplicate input: %s", source => {
    expect(() => parse(source, true)).toThrow();
    expect(() => parse(source)).toThrow();
  });

  it("accepts a no-op append on a manyof", () => {
    const source = "((m) (named 1))((+. m) (()))";
    const parsed = parse(source, true);

    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("supports quoted prototype-related path components safely", () => {
    const source =
      '("__proto__" (a (()) 1))' +
      '(m ("constructor" ignored) (a (()) 2))' +
      '((+. "__proto__" a) (()) 3)' +
      "((+. m a) (()) 4)";

    const parsed = parse(source, true) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["__proto__", "m"]);
    expect(parsed["__proto__"]).toEqual({ a: [1, 3] });
    expect(parsed.m).toEqual({ constructor: "ignored", a: [2, 4] });
    const native = parse(source) as Record<string, unknown>;
    expect(Object.keys(native)).toEqual(["__proto__", "m"]);
    expect(native["__proto__"]).toEqual({ a: [1, 3] });
    expect(native.m).toEqual({ constructor: "ignored", a: [2, 4] });
  });

  it.each([
    '("__proto__" 1)("__proto__" 2)',
    "(a (()))((+. a) (()) (()))",
    "(a (()) ())((+. a) (()) () (()))",
    '((m))((+. m) (()) (""))',
    "(a (()) 1)((+. a) (()) 2))"
  ])("rejects malformed hidden append edge cases: %s", source => {
    expect(() => parse(source, true)).toThrow();
  });
});

describe("ordinary duplicate fields", () => {
  it.each([
    "(a 1)(a 2)",
    "(outer (a 1) (a 2))",
    "(d () (a 1) (a 2))",
    "(a (x 1))(a (y 2))",
    '(n ("") (x y))(n ("") (z w))',
    "((config debug) +true)((config debug) +false)",
    "(outer (a 1) (a (()) 2))",
    "(a (()) 1)(a (()) 2)",
    "((m) 1)((m) 2)",
    "(a (()) 1)(a (()) 2)(a (()) 3)"
  ])("rejects rather than implicitly merging: %s", source => {
    expect(() => parse(source, true)).toThrow(/Duplicate field name/);
    expect(() => parse(source)).toThrow(/Duplicate field name/);
  });
});
