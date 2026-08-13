import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";

describe("U+FEFF handling", () => {
  it("rejects a leading BOM instead of silently discarding it", () => {
    expect(() => parse("\uFEFF(a 1)")).toThrow();
    expect(() => parse("\uFEFF(a 1)", true)).toThrow();
  });

  it("rejects repeated leading BOMs", () => {
    expect(() => parse("\uFEFF\uFEFF(a 1)")).toThrow();
  });

  it("rejects a BOM at a structural position between fields", () => {
    expect(() => parse("(a 1)\uFEFF(b 2)")).toThrow();
  });

  it("keeps a standalone BOM in value position as content", () => {
    expect(parse("(a \uFEFF 1)")).toEqual({ a: "\uFEFF 1" });
  });

  it("keeps a BOM inside a bare atom as content", () => {
    expect(parse("(a x\uFEFFy)")).toEqual({ a: "x\uFEFFy" });
  });

  it("keeps a BOM inside a quoted string as content", () => {
    expect(parse('(a "\uFEFF")')).toEqual({ a: "\uFEFF" });
  });
});
