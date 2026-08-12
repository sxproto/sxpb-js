import { describe, expect, it } from "vitest";
import { parse, SxpbList } from "../src/index.js";

describe("array element kinds", () => {
  it.each([
    ["(a (()) one 02 +03 4.0 +true)", ["one", "02", "+03", "4.0", "+true"]],
    ['(a (()) "one" 2 +true)', ["one", "2", "+true"]],
    ['(a (()) ("" one) 2 +true)', ["one", "2", "+true"]],
    ['(a (()) "" one 02 +true)', ["", "one", "02", "+true"]]
  ])("uses a string first element to preserve later source spellings", (source, expected) => {
    expect(parse(source)).toEqual({ a: expected });
    const precise = parse(source, true) as { a: SxpbList };
    expect(precise.a).toBeInstanceOf(SxpbList);
    expect(Array.from(precise.a)).toEqual(expected);
  });

  it("keeps number-first arrays numeric", () => {
    expect(parse("(a (()) 1 2.5 3)")).toEqual({ a: [1, 2.5, 3] });
  });

  it("coerces nonnegative integer spellings in boolean-first arrays", () => {
    expect(parse("(a (()) +true 00 +01 +false)")).toEqual({
      a: [true, false, true, false]
    });
  });

  it.each([
    '(a (()) 1 "word")',
    "(a (()) 1 word)",
    "(a (()) 1 +true)",
    "(a (()) +true word)",
    "(a (()) +true 2)",
    "(a (()) +true -0)",
    "(a (()) +true 0.0)",
    "(a (()) 1 ())",
    "(a (()) () 1)",
    "(a (()) 1 (() (x 2)))",
    "(a (()) (() (x 2)) 1)"
  ])("rejects incompatible scalar and message kinds: %s", source => {
    expect(() => parse(source, true)).toThrow();
  });

  it("keeps nested empty discriminated lists as arrays", () => {
    const parsed = parse("(a (()))", true) as { a: SxpbList };
    expect(parsed.a).toBeInstanceOf(SxpbList);
    expect(parsed.a).toHaveLength(0);
  });
});

describe("redundant array discriminators", () => {
  it.each([
    "(a (()) (()) 1)",
    "(a (()) (()))",
    "(outer (a (()) (()) 1))"
  ])("rejects a second list discriminator instead of swallowing it: %s", source => {
    expect(() => parse(source, true)).toThrow(/Unexpected list discriminator as array element/);
    expect(() => parse(source)).toThrow(/Unexpected list discriminator as array element/);
  });
});
