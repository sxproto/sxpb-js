import { describe, it, expect } from "vitest";
import { stringify, parse, SxpbLone, SxpbMany, SxpbList } from "../src";

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
    // Array body with anonymous discriminated messages
    const input = "(users (()) (() (name \"a\")) (() (name \"b\")))";
    expect(parse(input)).toEqual({
      users: [{name: "a"}, {name: "b"}]
    });
  });

  it("parses array of empty messages", () => {
    const input = "(users (()) () ())";
    expect(parse(input)).toEqual({
      users: [{}, {}]
    });
  });

  it("parses manyof field variant 1", () => {
    // (name (()) (k1 v1) (k2 v2))
    const input = "(properties (()) (k1 \"v1\") (k2 \"v2\"))";
    const result = parse(input, true) as any;
    expect(result.properties).toBeInstanceOf(SxpbMany);
    expect(result.properties.value).toHaveLength(2);
    expect(result.properties.value[0]).toBeInstanceOf(SxpbLone);
    expect(result.properties.value[0].value).toEqual({k1: "v1"});
  });

  it("parses manyof field variant 2", () => {
    // ((name) item1 item2)
    // Test with fields
    const input = "((properties) (k1 \"v1\") (k2 \"v2\"))";
    const result = parse(input, true) as any;
    expect(result.properties).toBeInstanceOf(SxpbMany);
    expect(result.properties.value).toHaveLength(2);
    expect(result.properties.value[0].value).toEqual({k1: "v1"});

    // Test with scalars (if supported by grammar/parser implementation detail)
    // Precise parsing keeps anonymous scalars distinct from an explicit `value` field.
    const inputScalars = "((tags) \"a\" \"b\")";
    const resultScalars = parse(inputScalars, true) as any;
    expect(resultScalars.tags).toBeInstanceOf(SxpbMany);
    expect(resultScalars.tags.value[0].value).toEqual({"": "a"});
  });

  it("parses loneof field", () => {
    // ((key subkey) value)
    const input = "((config debug) +true)";
    const result = parse(input, true) as any;
    expect(result.config).toBeInstanceOf(SxpbLone);
    expect(result.config.value).toEqual({debug: true});
  });

  it("disambiguates array_body vs manyof_body correctly", () => {
    // Case 1: Array of scalars -> array_body
    const input1 = "(arr (()) 1 2)";
    const res1 = parse(input1, true) as any;
    expect(res1.arr).toBeInstanceOf(SxpbList);

    // Case 2: Array of messages -> array_body
    // `anonymous discriminated message` -> `()` or `(() ...)`.
    // So `(() (key val))` is valid.
    const input3 = "(arr (()) (() (k v)))";
    const res3 = parse(input3, true) as any;
    expect(res3.arr).toBeInstanceOf(SxpbList);

    // Case 3: Manyof body (fields)
    const input4 = "(many (()) (k v))";
    const res4 = parse(input4, true) as any;
    expect(res4.many).toBeInstanceOf(SxpbMany);
  });

  it("handles BARE strings correctly", () => {
    expect(parse("(k bareword)")).toEqual({k: "bareword"});
    expect(() => parse("(k 1.2.3)")).toThrow();
    expect(parse("(k --option)")).toEqual({k: "--option"});
    // Special chars in bare
    expect(parse("(k a-b.c)")).toEqual({k: "a-b.c"});
  });
});

describe("SxPB Serializer", () => {
  it("serializes simple message", () => {
    const obj = { name: "test", id: 123 };
    const output = stringify(obj);
    expect(output).toContain("(name test)");
    expect(output).toContain("(id 123)");
  });

  it("serializes nested message", () => {
    const obj = { user: { name: "Alice" } };
    const output = stringify(obj);
    expect(output).toContain("(user");
    expect(output).toContain("(name Alice)");
  });

  it("serializes list of scalars", () => {
    const obj = { tags: ["a", "b"] };
    const output = stringify(obj);
    // (tags (()) a b)
    expect(output).toMatch(/\(tags \(\(\)\)/);
    expect(output).toMatch(/a/);
    expect(output).toMatch(/b/);
  });

  it("serializes list of messages", () => {
    const obj = { users: [{name: "a"}, {name: "b"}] };
    const output = stringify(obj);
    // Matches whitespace leniently.
    // The output contains redundant spaces inside empty messages sometimes due to formatting logic.
    // We normalize spaces to single space and trim.

    // Let's rely on regex match instead.
    expect(output).toMatch(/users\s+\(\(\)\)/);
    expect(output).toMatch(/\(\(\)\s+\(name a\)/);
    expect(output).toMatch(/\(\(\)\s+\(name b\)/);
  });

  it("serializes SxpbMany", () => {
    const obj = {
      properties: new SxpbMany([
        new SxpbLone({k1: "v1"}),
        new SxpbLone({k2: "v2"})
      ])
    };
    const output = stringify(obj);
    // ((properties) (k1 v1) (k2 v2))
    expect(output).toContain("((properties)");
    expect(output).toContain("(k1 v1)");
    expect(output).toContain("(k2 v2)");
  });

  it("serializes SxpbLone", () => {
    const obj = { config: new SxpbLone({debug: true}) };
    const output = stringify(obj);
    // ((config debug) +true)
    expect(output).toContain("((config debug) +true)");
  });

  it("quotes strings correctly", () => {
    expect(stringify({k: "123"})).toContain('(k "123")'); // Number-like string quoted
    expect(stringify({k: "true"})).toContain("(k true)"); // "true" is valid bare word (boolean is "+true")
    expect(stringify({k: "+true"})).toContain('(k "+true")'); // looks like bool, quoted if string

    expect(stringify({k: "a b"})).toContain('(k "a b")'); // space, quoted
    expect(stringify({k: "(a)"})).toContain('(k "(a)")'); // parens, quoted
    expect(stringify({k: ""})).toContain('(k "")'); // empty, quoted
  });

  it("roundtrips simple object", () => {
    const obj = { name: "test", count: 1 };
    const s = stringify(obj);
    const o = parse(s);
    expect(o).toEqual(obj);
  });

  it("serializes large array using SxpbList correctly", () => {
    const largeArray = Array.from({length: 1000}, (_, i) => i);
    const obj = { data: new SxpbList(largeArray) };
    // Should not stack overflow
    const s = stringify(obj);
    expect(s).toContain("(data (())");
    expect(s).toContain("999");
  });
});
