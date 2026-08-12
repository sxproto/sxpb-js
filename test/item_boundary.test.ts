import { describe, expect, it } from "vitest";
import { parse, stringify, SxpbNest } from "../src/index.js";

describe("nest item boundaries", () => {
  it("keeps bare empty strings separate after an explicit subnest discriminator", () => {
    const source = '(my_nest ("") (my_subnest ("") "" three leaves))';
    const expected = {
      my_nest: new SxpbNest([
        { my_subnest: new SxpbNest(["", "three", "leaves"]) }
      ])
    };

    expect(parse(source, true)).toEqual(expected);
    expect(parse(source)).toEqual({
      my_nest: [{ my_subnest: ["", "three", "leaves"] }]
    });
    expect(parse(stringify(expected), true)).toEqual(expected);
  });

  it("preserves the explicit anonymous empty-nest form", () => {
    const source = '(my_nest ("") (my_subnest ("") ("" (""))))';
    const expected = {
      my_nest: new SxpbNest([
        {
          my_subnest: new SxpbNest([
            { "": new SxpbNest([]) }
          ])
        }
      ])
    };

    expect(parse(source, true)).toEqual(expected);
    expect(parse(stringify(expected), true)).toEqual(expected);
  });

  it("rejects a late naked nest discriminator", () => {
    expect(() => parse(
      '(my_nest ("") (my_subnest ("") ("")))',
      true
    )).toThrow(/Unexpected nest discriminator/);
  });

  it.each([
    '(my_nest ("") (+ child))',
    '(my_nest ("") (+true child))',
    '(my_nest ("") (+trueish child))',
    '(my_nest ("") (+1 child))',
    '(my_nest ("") (-. child))',
    '(my_nest ("") (-.5 child))'
  ])("rejects a reserved-prefix plain subnest name: %s", source => {
    expect(() => parse(source, true)).toThrow(/special prefix/);
  });

  it("preserves nest atom spellings and valid doubled-prefix names", () => {
    const source = '(nest ("") +true +false +1 -.5 (01 leaf) (1word mixed) (-- one) (.. two))';
    const parsed = parse(source, true) as { nest: SxpbNest };

    expect(parsed.nest).toEqual(new SxpbNest([
      "+true",
      "+false",
      "+1",
      "-.5",
      { "01": new SxpbNest(["leaf"]) },
      { "1word": new SxpbNest(["mixed"]) },
      { "--": new SxpbNest(["one"]) },
      { "..": new SxpbNest(["two"]) }
    ]));
    expect(parse(stringify(parsed), true)).toEqual(parsed);
  });

  it("roundtrips quoted special-prefix subnest names", () => {
    const source = '(nest ("") ("+name" leaf) ("-.name" leaf))';
    const parsed = parse(source, true);

    expect(parse(stringify(parsed), true)).toEqual(parsed);
  });

  it.each([
    '(nest ("") ())',
    '(nest ("") (child ()))',
    '("") ()',
    '(nest ("") (()))',
    '(nest ("") (() (x 1)))',
    '(nest ("") (""))',
    '(nest ("") (("" two words)))'
  ])("rejects a non-nest collection inside a nest: %s", source => {
    expect(() => parse(source, true)).toThrow("Nest can only hold nests and strings.");
  });

  it("retains the unparenthesized discriminated-string form", () => {
    const source = '(my_nest ("") (my_subnest "" this is one discriminated string))';
    const expected = {
      my_nest: new SxpbNest([
        { my_subnest: new SxpbNest(["this is one discriminated string"]) }
      ])
    };

    expect(parse(source, true)).toEqual(expected);
    expect(parse(stringify(expected), true)).toEqual(expected);
  });
});
