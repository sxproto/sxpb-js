import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { stringify } from "../src/serializer.js";
import { SxPBTypes as SxPB } from "../src/types.js";

// Ported tests from sxproto/sxpb-py/test/content_test.py and test_empty_serialization.py

describe("SxPB Python Compatibility Tests", () => {
  it("parses unquoted array string", () => {
    // From content_test.py: test_unquoted_array_string_parsing
    const sxpb_string = `
        (my_array (())
         ("" this is a "multi-word" string)
         ("" so is this)
         these
         are
         not
        )
    `;
    const expected_data = {
      my_array: ["this is a multi-word string", "so is this", "these", "are", "not"],
    };
    const parsed_data = parse(sxpb_string);
    expect(parsed_data).toEqual(expected_data);
  });

  it("parses and serializes empty structures correctly", () => {
    // From test_empty_serialization.py
    const data = {
      "empty_message": {},
      "empty_array": [],
      "array_with_empty_message": [{}],
      "empty_manyof": new SxPB.Many([]),
      "empty_loneof": new SxPB.Lone({"subkey": {}}),
    };

    const s = stringify(data);
    expect(s).toContain("(empty_message)");
    expect(s).toContain("(empty_array (()))");
    expect(s).toMatch(/\(array_with_empty_message \(\(\)\)\s*\(\)\s*\)/);
    expect(s).toContain("((empty_manyof))");
    expect(s).toContain("((empty_loneof subkey))");
  });

  it("handles string body concatenation with mixed types", () => {
    // (key "" 1 " string" +true)
    // "" (Q), 1 (U). Q+U -> No space. "1"
    // 1 (U), " string" (Q). U+Q -> No space. "1 string"
    // " string" (Q), +true (U). Q+U -> No space. "1 string+true"
    const input = "(key \"\" 1 \" string\" +true)";
    expect(parse(input)).toEqual({ key: "1 string+true" });

    // (key "" 1 2) -> "1 2" (U+U -> Space)
    const input2 = "(key \"\" 1 2)";
    expect(parse(input2)).toEqual({ key: "1 2" });

    // (key "a" "b") -> "ab" (Q+Q -> No space)
    const input3 = "(key \"a\" \"b\")";
    expect(parse(input3)).toEqual({ key: "ab" });

    // (key "a" 1) -> "a1" (Q+U -> No space)
    expect(parse('(key "a" 1)')).toEqual({ key: "a1" });

    // (key 1 "b") -> "1b" (U+Q -> No space)
    // Needs "" start to allow 1 as first token of string body
    expect(parse('(key "" 1 "b")')).toEqual({ key: "1b" });
  });

  it("uses the first array element to establish its scalar kind", () => {
    expect(parse("(a (()) 1 2 3)")).toEqual({ a: [1, 2, 3] });
    expect(parse("(a (()) +true +false)")).toEqual({ a: [true, false] });
    expect(parse('(a (()) "1" 2)')).toEqual({ a: ["1", "2"] });
    expect(() => parse('(a (()) 1 "2")')).toThrow();
    expect(() => parse('(a (()) +true "false")')).toThrow();
    expect(() => parse("(a (()) 1 bare)")).toThrow();
  });
});
