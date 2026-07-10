import { describe, it, expect } from "vitest";
import { stringify } from "../src/serializer.js";
import { parse } from "../src/parser.js";
import { SxpbLone, SxpbMany, SxpbNest } from "../src/types.js";

describe("SxPB Serializer", () => {
  it("serializes simple message", () => {
    const obj = { name: "test", id: 123 };
    const output = stringify(obj);
    // Bare strings are allowed and preferred
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
    // Expected: (tags (()) "a" "b") or split lines
    // Bare strings a and b
    expect(output).toMatch(/\(tags \(\(\)\)/);
    expect(output).toMatch(/a/);
    expect(output).toMatch(/b/);
  });

  it("serializes list of messages", () => {
    const obj = { users: [{name: "a"}, {name: "b"}] };
    const output = stringify(obj);
    expect(output).toMatch(/\(users \(\(\)\)/);
    // Bare strings
    expect(output).toMatch(/\(\(\)\s+\(name a\)/);
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

  it("serializes SxpbLone array option", () => {
    const obj = {
      my_key: new SxpbLone({my_loneof_array_option: [1, 2, 3]})
    };
    expect(stringify(obj, 0)).toBe(
      "((my_key my_loneof_array_option) (()) 1 2 3)"
    );
  });

  it("serializes SxpbLone empty many option", () => {
    const obj = {
      choice: new SxpbLone({array: new SxpbMany([])})
    };
    expect(stringify(obj, 0)).toBe("((choice array) (()))");
  });

  it("roundtrips simple object", () => {
    const obj = { name: "test", count: 1 };
    const s = stringify(obj);
    const o = parse(s);
    expect(o).toEqual(obj);
  });

  it("serializes canonical string atoms", () => {
    const obj = {
      strings: ["1", "two words", "bare"],
      flag_strings: ["+true", "+false", "true"],
      needs_quote: "1 2"
    };
    expect(stringify(obj, 0)).toBe(
      '(strings (()) "1" "two words" bare) ' +
      '(flag_strings (()) "+true" "+false" true) ' +
      '(needs_quote "1 2")'
    );
  });

  it("serializes canonical quoted field names", () => {
    expect(stringify({"two words": "ok", "1": "one"}, 0)).toBe(
      '("1" one) ("two words" ok)'
    );
  });

  it("serializes canonical top-level nest", () => {
    const nest = new SxpbNest({
      black: null,
      white: new SxpbNest({bear: null}),
      grass: new SxpbNest({green: null, verdant: null})
    });
    expect(stringify(nest, 1)).toBe(
      '("")\nblack\n(white bear)\n(grass green verdant)'
    );
  });

  it("serializes canonical anonymous nest", () => {
    const nest = new SxpbNest({
      "": new SxpbNest({content: null}),
      empty: new SxpbNest({})
    });
    expect(stringify(nest, 1)).toBe(
      '("")\n("" ("") content)\n(empty)'
    );
  });
});
