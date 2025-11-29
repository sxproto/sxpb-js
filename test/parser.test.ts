import { describe, it, expect } from "vitest";
import { parse } from "../src/parser.js";
import { SxpbLone, SxpbMany } from "../src/types.js";

describe("SxPB Parser", () => {
  it("parses empty message", () => {
    expect(parse("")).toEqual({});
  });

  it("parses simple scalar fields", () => {
    const input = `
      (name "test")
      (id 123)
      (active +true)
    `;
    expect(parse(input)).toEqual({
      name: "test",
      id: 123,
      active: true
    });
  });

  it("parses nested message", () => {
    const input = "(user (name \"Alice\") (age 30))";
    expect(parse(input)).toEqual({
      user: {
        name: "Alice",
        age: 30
      }
    });
  });

  it("parses array of scalars", () => {
    const input = "(tags (()) \"a\" \"b\" \"c\")";
    expect(parse(input)).toEqual({
      tags: ["a", "b", "c"]
    });
  });

  it("parses array of messages", () => {
    const input2 = "(users (()) (() (name \"a\")) (() (name \"b\")))";

    expect(parse(input2)).toEqual({
      users: [{name: "a"}, {name: "b"}]
    });
  });

  it("parses manyof field", () => {
    // (name (()) (k1 v1) (k2 v2))
    const input = "(properties (()) (k1 \"v1\") (k2 \"v2\"))";
    const result = parse(input, true) as any;
    expect(result.properties).toBeInstanceOf(SxpbMany);
    expect(result.properties.value).toHaveLength(2);
    expect(result.properties.value[0]).toBeInstanceOf(SxpbLone);
    expect(result.properties.value[0].value).toEqual({k1: "v1"});
  });

  it("parses loneof field", () => {
    // ((key subkey) value)
    const input = "((config debug) +true)";
    const result = parse(input, true) as any;
    expect(result.config).toBeInstanceOf(SxpbLone);
    expect(result.config.value).toEqual({debug: true});
  });

  it("disambiguates array_body and manyof_body", () => {
    // Case 1: Array of scalars
    const input1 = "(data (()) 1 2 3)";
    expect(parse(input1)).toEqual({data: [1, 2, 3]});

    // Case 2: Array of empty messages
    const input2 = "(data (()) () ())";
    expect(parse(input2)).toEqual({data: [{}, {}]});

    // Case 3: Array of messages
    const input3 = "(data (()) (() (f 1)) (() (f 2)))";
    expect(parse(input3)).toEqual({data: [{f: 1}, {f: 2}]});

    // Case 4: manyof_body with a field
    const input4 = "(data (()) (f 1))";
    const result = parse(input4, true) as any;
    expect(result.data).toBeInstanceOf(SxpbMany);
    expect(result.data.value[0].value).toEqual({f: 1});
  });
});
