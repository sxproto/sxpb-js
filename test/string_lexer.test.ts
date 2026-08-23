import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

describe("quoted string lexing", () => {
  it("decodes the basic escape set", () => {
    const source = String.raw`(value "\"\\\t\n\v\f\r")`;
    expect(parse(source)).toEqual({ value: '"\\\t\n\v\f\r' });
  });

  it.each([
    '(value "\\q")',
    '(value """\\q""")'
  ])("rejects an unknown escape in %s", source => {
    expect(() => parse(source)).toThrow(/Unknown escape sequence/);
  });

  it("accepts LF and CRLF continuations but rejects a lone CR continuation", () => {
    const lf = '(value "a\\' + "\n" + 'b")';
    const crlf = '(value "a\\' + "\r\n" + 'b")';
    const cr = '(value "a\\' + "\r" + 'b")';

    expect(parse(lf)).toEqual({ value: "ab" });
    expect(parse(crlf)).toEqual({ value: "ab" });
    expect(() => parse(cr)).toThrow(/Unknown escape sequence/);
  });

  it("drops raw carriage returns without dropping line feeds", () => {
    const source = '(single "a\rb") (multi """c\r\nd""")';
    expect(parse(source)).toEqual({ single: "ab", multi: "c\nd" });
  });

  it("preserves multiline indentation", () => {
    const source = '(value """\\' + "\n" + '  first\n second\n""")';
    expect(parse(source)).toEqual({ value: "  first\n second\n" });
  });

  it.each([
    '(value "unterminated)',
    '(value """unterminated)'
  ])("rejects an unterminated string in %s", source => {
    expect(() => parse(source)).toThrow(/Unterminated/);
  });
});

describe("anonymous discriminated strings", () => {
  it("adds spaces only between adjacent unquoted segments", () => {
    const source = [
      "(values (())",
      '("" a b)',
      '("" a "b")',
      '("" "a" b)',
      '("" "a" "b")',
      '("" a "b" c d)',
      ")"
    ].join(" ");

    expect(parse(source)).toEqual({
      values: ["a b", "ab", "ab", "ab", "abc d"]
    });
  });

  it("rejects an empty anonymous discriminated string as an array item", () => {
    expect(() => parse('(values (()) (""))')).toThrow(
      /Unexpected empty anonymous string as array element/
    );
  });
});
