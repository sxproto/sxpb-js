import { describe, expect, it } from "vitest";
import { parse, stringify, SxpbDict, SxpbList, SxpbLone, SxpbMany } from "../src/index.js";

describe("dict/message kind preservation", () => {
  it("keeps dict kind distinct from message kind in precise mode", () => {
    const dict = parse("(d () (a 1))", true) as { d: SxpbDict };
    const mesg = parse("(d (a 1))", true) as { d: { a: number } };

    expect(dict.d).toBeInstanceOf(SxpbDict);
    expect(mesg.d).not.toBeInstanceOf(SxpbDict);
    expect(Object.entries(dict.d)).toEqual([["a", 1]]);
    expect(Object.entries(mesg.d)).toEqual([["a", 1]]);
  });

  it("round-trips the dict discriminator", () => {
    const input = "(d () (a 1))";
    const parsed = parse(input, true);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("round-trips an empty dict field distinctly from an empty message field", () => {
    const dict = parse("(d ())", true);
    const mesg = parse("(d)", true);
    expect(stringify(dict, 0)).toBe("(d ())");
    expect(stringify(mesg, 0)).toBe("(d)");
    expect(parse("(d ())", true)).toEqual(dict);
    expect(parse("(d)", true)).toEqual(mesg);
    expect((dict as { d: SxpbDict }).d).toBeInstanceOf(SxpbDict);
    expect((mesg as { d: object }).d).not.toBeInstanceOf(SxpbDict);
  });

  it("preserves nested dict kinds", () => {
    const input = "(d () (inner () (x 1)))";
    const parsed = parse(input, true) as { d: SxpbDict };
    expect(parsed.d).toBeInstanceOf(SxpbDict);
    expect((parsed.d as unknown as { inner: SxpbDict }).inner).toBeInstanceOf(SxpbDict);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("parses a top-level dict discriminator", () => {
    const parsed = parse("() (a 1)", true);
    expect(parsed).toBeInstanceOf(SxpbDict);
    expect(stringify(parsed, 0)).toBe("() (a 1)");
    expect(stringify(parsed)).toBe("()\n(a 1)");
    expect(parse(stringify(parsed), true)).toEqual(parsed);
  });

  it("wraps dict bodies in hostile field names safely", () => {
    const parsed = parse('(d () ("__proto__" 1) ("constructor" 2))', true) as { d: SxpbDict };
    expect(parsed.d).toBeInstanceOf(SxpbDict);
    expect(Object.entries(parsed.d)).toEqual([["__proto__", 1], ["constructor", 2]]);
    expect(Object.getPrototypeOf(parsed.d)).toBe(SxpbDict.prototype);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("allows explicit append through a dict keypath", () => {
    const parsed = parse("(d () (a (()) 1))\n((+. d a) (()) 2)", true) as { d: SxpbDict };
    expect(parsed.d).toBeInstanceOf(SxpbDict);
    expect((parsed.d as unknown as { a: SxpbList }).a).toBeInstanceOf(SxpbList);
    expect(Array.from((parsed.d as unknown as { a: SxpbList }).a)).toEqual([1, 2]);
  });

  it("drops the kind distinction in non-precise mode", () => {
    expect(parse("(d () (a 1))")).toEqual({ d: { a: 1 } });
    expect(parse("() (a 1)")).toEqual({ a: 1 });
  });

  it("holds manyof and loneof fields inside dict bodies", () => {
    const input = "(d () ((mode turbo) +true) ((flags) 1 2))";
    const parsed = parse(input, true) as { d: SxpbDict };
    const d = parsed.d as unknown as { mode: SxpbLone; flags: SxpbMany };
    expect(parsed.d).toBeInstanceOf(SxpbDict);
    expect(d.mode).toBeInstanceOf(SxpbLone);
    expect(d.flags).toBeInstanceOf(SxpbMany);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });
});

describe("empty-value loneof", () => {
  it("accepts a valueless loneof header at top level", () => {
    const input = "((event words_chosen))";
    const parsed = parse(input, true) as { event: SxpbLone };
    expect(parsed.event).toBeInstanceOf(SxpbLone);
    expect(Object.entries(parsed.event.value)).toEqual([["words_chosen", {}]]);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
    expect(parse(input)).toEqual({ event: { words_chosen: {} } });
  });

  it("accepts an empty-value loneof inside a dict body", () => {
    const input = "(d () ((event go)))";
    const parsed = parse(input, true) as { d: SxpbDict };
    expect(parsed.d).toBeInstanceOf(SxpbDict);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("accepts an empty-value loneof as a manyof element", () => {
    const input = "((events) ((a b)))";
    const parsed = parse(input, true) as { events: SxpbMany };
    const element = parsed.events.value[0] as SxpbLone;
    const inner = (Object.entries(element.value)[0][1]) as SxpbLone;
    expect(inner).toBeInstanceOf(SxpbLone);
    expect(Object.entries(inner.value)).toEqual([["b", {}]]);
    expect(stringify(parsed, 0)).toBe(input);
    expect(parse(stringify(parsed, 0), true)).toEqual(parsed);
  });

  it("keeps a dict-valued loneof distinct from a message-valued loneof", () => {
    const dictLone = parse("((q p1) () (x 1))", true) as { q: SxpbLone };
    const mesgLone = parse("((q p1) (x 1))", true) as { q: SxpbLone };
    const dictValue = Object.entries(dictLone.q.value)[0][1];
    const mesgValue = Object.entries(mesgLone.q.value)[0][1];
    expect(dictValue).toBeInstanceOf(SxpbDict);
    expect(mesgValue).not.toBeInstanceOf(SxpbDict);
    expect(stringify(dictLone, 0)).toBe("((q p1) () (x 1))");
    expect(stringify(mesgLone, 0)).toBe("((q p1) (x 1))");
  });

  it.each([
    "((q p1) 1)",
    "((q p1) (x 1))",
    "((q p1) () (x 1))"
  ])("round-trips nonempty loneofs in condensed mode: %s", source => {
    const parsed = parse(source, true);
    const condensed = stringify(parsed, -1);
    expect(parse(condensed, true)).toEqual(parsed);
  });
});

describe("programmatic dict values", () => {
  it("rejects dicts in lists instead of dropping their discriminator", () => {
    const dict = new SxpbDict({ x: 1 });
    expect(() => stringify(new SxpbList([dict]), 0)).toThrow(/Dict values cannot be list elements/);
    expect(() => stringify(new SxpbList([{ x: 0 }, dict]), 0)).toThrow(
      /Dict values cannot be list elements/
    );
  });
});
