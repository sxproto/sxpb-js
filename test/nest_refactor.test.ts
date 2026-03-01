import { expect, test } from "vitest";
import { SxPBTypes as SxPB } from "../src/types.js";
import { parse, stringify } from "../src/index.js";

test("User Example - Nest as List", () => {
  const sxpbInput = `(my_nest ("")
 these are strings
 (this "" is a named string)
 (this is a nest)
 (this is also a nest (with more nesting))
)`;

  // Parse with precise=false (default)
  const parsed = parse(sxpbInput);

  const expectedJson = {
    "my_nest": [
      "these", "are", "strings",
      {"this": ["is a named string"]},
      {"this": ["is", "a", "nest"]},
      {"this": ["is", "also", "a", "nest", {"with": ["more", "nesting"]}]}
    ]
  };

  expect(parsed).toEqual(expectedJson);

  // Stringify back to SxPB
  // Note: formatting might slightly differ (whitespace, etc) but semantic content should be same.
  // The serializer handles formatting.
  const serialized = stringify(parsed);
  // We can re-parse to verify round-trip
  const reparsed = parse(serialized);
  expect(reparsed).toEqual(expectedJson);
});

test("Nest Structure with precise=true", () => {
  const sxpbInput = `(my_nest ("")
 these are strings
 (this "" is a named string)
 (this is a nest)
 (this is also a nest (with more nesting))
)`;

  const parsed = parse(sxpbInput, true) as SxPB.Dict;
  const nest = parsed["my_nest"] as SxPB.Nest;

  expect(nest).toBeInstanceOf(SxPB.Nest);
  expect(nest).toBeInstanceOf(Array); // It extends Array now
  expect(nest.length).toBe(6);

  // "these"
  expect(nest[0]).toBe("these");
  // "are"
  expect(nest[1]).toBe("are");
  // "strings"
  expect(nest[2]).toBe("strings");

  // (this "" is a named string) -> {"this": ["is a named string"]}
  // parsed item: { "this": SxPB.Nest(["is a named string"]) }
  const item3 = nest[3] as { [key: string]: SxPB.Nest };
  expect(item3).toHaveProperty("this");
  const subNest3 = item3["this"];
  expect(subNest3).toBeInstanceOf(SxPB.Nest);
  expect(subNest3[0]).toBe("is a named string");

  // (this is a nest) -> {"this": ["is", "a", "nest"]}
  const item4 = nest[4] as { [key: string]: SxPB.Nest };
  expect(item4).toHaveProperty("this");
  const subNest4 = item4["this"];
  expect(subNest4).toBeInstanceOf(SxPB.Nest);
  expect(subNest4[0]).toBe("is");
  expect(subNest4[1]).toBe("a");
  expect(subNest4[2]).toBe("nest");

  // (this is also a nest (with more nesting))
  const item5 = nest[5] as { [key: string]: SxPB.Nest };
  expect(item5).toHaveProperty("this");
  const subNest5 = item5["this"];
  expect(subNest5[0]).toBe("is");
  expect(subNest5[3]).toBe("nest");

  // Nested part: (with more nesting) -> {"with": ["more", "nesting"]}
  const subItem5 = subNest5[4] as { [key: string]: SxPB.Nest };
  expect(subItem5).toHaveProperty("with");
  const subSubNest = subItem5["with"];
  expect(subSubNest[0]).toBe("more");
  expect(subSubNest[1]).toBe("nesting");
});
