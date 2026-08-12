import { describe, expect, it } from "vitest";
import { parse, stringify } from "../src/index.js";

describe("singleton punctuation atoms", () => {
  it("accepts the valid bare spellings", () => {
    expect(parse("(dash -) (dot .) (slash /) (- dash) (. dot) (double_dash --) (double_dot ..)")).toEqual({
      dash: "-",
      dot: ".",
      slash: "/",
      "-": "dash",
      ".": "dot",
      double_dash: "--",
      double_dot: ".."
    });
  });

  it.each([
    "(value +)",
    "(+ value)"
  ])("rejects a lone plus: %s", source => {
    expect(() => parse(source)).toThrow(/PLAIN/);
    expect(() => parse(source, true)).toThrow(/PLAIN/);
  });

  it("allows reserved spellings only after string context exists", () => {
    expect(parse("(value word +)")).toEqual({ value: "word +" });
    expect(parse("(a (()) word + +trueish -.x)")).toEqual({
      a: ["word", "+", "+trueish", "-.x"]
    });
    expect(parse("((choice) word +)")).toEqual({
      choice: [{ value: "word" }, { value: "+" }]
    });
    expect(parse('(my_nest ("") +)')).toEqual({ my_nest: ["+"] });
  });

  it.each([
    "(value +almost)",
    "(-. value)",
    "(a (()) 1word)",
    "(a (()) +trueish)"
  ])("rejects a reserved-prefix starter: %s", source => {
    expect(() => parse(source)).toThrow();
    expect(() => parse(source, true)).toThrow();
  });

  it("does not tokenize boolean prefixes inside longer atoms", () => {
    expect(() => parse("(value +trueish)")).toThrow();
    expect(parse("(value word +trueish)")).toEqual({ value: "word +trueish" });
  });

  it("prints only valid singleton punctuation bare", () => {
    const value = {
      dash: "-",
      dot: ".",
      slash: "/",
      "-": "dash",
      ".": "dot",
      plus: "+"
    };
    const printed = stringify(value, 0);

    expect(printed).toBe('(dash -) (dot .) (slash /) (- dash) (. dot) (plus "+")');
    expect(parse(printed)).toEqual(value);
  });
});
