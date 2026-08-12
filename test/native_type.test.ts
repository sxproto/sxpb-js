import { describe, it, expect } from "vitest";
import { parse, SxpbList, SxpbMany, SxpbLone } from "../src/index.js";

describe("SxPB Native Types and BigInt", () => {
  it("parse() returns native types by default", () => {
    // (k (()) 1 2) -> SxpbList internally -> [1, 2] natively
    const text = "(k (()) 1 2)";
    const parsed = parse(text) as any;
    expect(parsed.k).not.toBeInstanceOf(SxpbList);
    expect(Array.isArray(parsed.k)).toBe(true);
    expect(parsed.k).toEqual([1, 2]);
  });

  it("parse() unwraps SxpbLone and SxpbMany by default", () => {
    // ((config debug) +true) -> SxpbLone({debug: true}) -> {debug: true}
    const textLone = "((config debug) +true)";
    const parsedLone = parse(textLone) as any;
    expect(parsedLone.config).not.toBeInstanceOf(SxpbLone);
    expect(parsedLone.config).toEqual({debug: true});

    // (properties (()) (k1 "v1") (k2 "v2")) -> SxpbMany([SxpbLone, SxpbLone]) -> [{k1: "v1"}, {k2: "v2"}]
    const textMany = '(properties (()) (k1 "v1") (k2 "v2"))';
    const parsedMany = parse(textMany) as any;
    expect(parsedMany.properties).not.toBeInstanceOf(SxpbMany);
    expect(Array.isArray(parsedMany.properties)).toBe(true);
    expect(parsedMany.properties).toEqual([{k1: "v1"}, {k2: "v2"}]);
  });

  it("parse(..., true) preserves special types", () => {
    const text = "(k (()) 1 2)";
    const parsed = parse(text, true) as any;
    expect(parsed.k).toBeInstanceOf(SxpbList);
  });

  it("rejects repeated list fields in native mode", () => {
    const text = "(k (()) 1 2) (k (()) 3 4)";
    expect(() => parse(text)).toThrow(/Duplicate field name/);
  });

  it("BigInt: precise=true parses large integers as BigInt", () => {
    const text = "(k 9007199254740993)"; // MAX_SAFE_INTEGER + 2
    const parsed = parse(text, true) as any;
    expect(typeof parsed.k).toBe("bigint");
    expect(parsed.k).toBe(9007199254740993n);
  });

  it("BigInt: precise=true parses small integers as Number", () => {
    const text = "(k 123)";
    const parsed = parse(text, true) as any;
    expect(typeof parsed.k).toBe("number");
    expect(parsed.k).toBe(123);
  });

  it("BigInt: precise=false parses large integers as Number (lossy)", () => {
    const text = "(k 9007199254740993)";
    const parsed = parse(text, false) as any;
    expect(typeof parsed.k).toBe("number");
    // 9007199254740993 -> 9007199254740992
    expect(parsed.k).toBe(9007199254740992);
  });
});
