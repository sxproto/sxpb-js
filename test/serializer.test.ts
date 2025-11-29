import { describe, it, expect } from "vitest";
import { stringify } from "../src/serializer.js";
import { parse } from "../src/parser.js";
import { SxpbLone, SxpbMany } from "../src/types.js";

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
    // (properties (()) (k1 v1) (k2 v2))
    expect(output).toContain("(properties (())");
    expect(output).toContain("(k1 v1)");
    expect(output).toContain("(k2 v2)");
  });

  it("serializes SxpbLone", () => {
    const obj = { config: new SxpbLone({debug: true}) };
    const output = stringify(obj);
    // ((config debug) +true)
    expect(output).toContain("((config debug) +true)");
  });

  it("roundtrips simple object", () => {
    const obj = { name: "test", count: 1 };
    const s = stringify(obj);
    const o = parse(s);
    expect(o).toEqual(obj);
  });
});
