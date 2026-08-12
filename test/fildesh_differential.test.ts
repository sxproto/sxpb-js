import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "../src/index.js";
import { acceptedAppendCases, rejectedAppendCases } from "./append_case.js";

const fildeshBin = process.env.FILDESH_BIN;
const describeWithFildesh = fildeshBin ? describe : describe.skip;

const acceptedCases = [
  "(a (()) one 02 +03 4.0 +true)",
  "(a (()) 1 2.5 3)",
  "(a (()) +true 00 +01 +false)",
  "((choice) (named 9) one (middle +false) 02 +true)",
  "((choice) (named one) 1 (middle +true) 2.5)",
  "(choice (()) (named one) +true (middle 9) 00 +01 +false)",
  "((choice) () (named 1) (() (x 2)))",
  "((choice) 1 (named (x 2)) 3)",
  "(dash -) (dot .) (slash /)",
  '(my_nest ("") (my_subnest ("") "" three leaves))',
  '(my_nest ("") (my_subnest "" this is one discriminated string))',
  '(my_nest ("") (my_subnest ("") ("" (""))))',
  "(value word +)",
  "(a (()) word + +trueish -.x)",
  "((choice) word +)",
  '(my_nest ("") +)',
  '(nest ("") +true +false +1 -.5 (01 leaf) (1word mixed) (-- one) (.. two))',
  '(nest ("") ("+name" leaf) ("-.name" leaf))',
  ...acceptedAppendCases.map(([source]) => source),
  '("__proto__" (a (()) 1))((+. "__proto__" a) (()) 2)',
  '(m ("constructor" ignored) (a (()) 1))((+. m a) (()) 2)'
];

const rejectedCases = [
  '(a (()) 1 "word")',
  "(a (()) 1 +true)",
  "(a (()) +true 2)",
  "(a (()) 1 ())",
  "((choice) 1 (named word) +true)",
  "((choice) +true (named word) 2)",
  "((choice) one (named 1) ())",
  "((choice) () (named 1) one)",
  "(value +)",
  "(value +almost)",
  "(-. value)",
  "(a (()) 1word)",
  "(a (()) +trueish)",
  '(my_nest ("") (+ child))',
  '(my_nest ("") (+true child))',
  '(my_nest ("") (+trueish child))',
  '(my_nest ("") (+1 child))',
  '(my_nest ("") (-. child))',
  '(my_nest ("") (-.5 child))',
  '(my_nest ("") (my_subnest ("") ("")))',
  '(nest ("") ())',
  '(nest ("") (child ()))',
  '("") ()',
  '(nest ("") (()))',
  '(nest ("") (() (x 1)))',
  '(nest ("") (""))',
  '(nest ("") (("" two words)))',
  ...rejectedAppendCases,
  '("__proto__" 1)("__proto__" 2)',
  "(a (()))((+. a) (()) (()))",
  "(a (()) ())((+. a) (()) () (()))",
  "(a (()) 1)((+. a) (()) 2))"
];

function runFildesh(source: string) {
  return spawnSync(fildeshBin!, ["-as", "sxpb2sxpb"], {
    input: source,
    encoding: "utf8"
  });
}

describeWithFildesh("local Fildesh differential conformance", () => {
  it.each(acceptedCases)("preserves the precise value through both printers: %s", source => {
    const precise = parse(source, true);
    const fildesh = runFildesh(source);

    expect(fildesh.status, fildesh.stderr).toBe(0);
    expect(parse(fildesh.stdout, true)).toEqual(precise);

    // Canonical text may differ because Fildesh normalizes float spelling.
    const jsThroughFildesh = runFildesh(stringify(precise, 0));
    expect(jsThroughFildesh.status, jsThroughFildesh.stderr).toBe(0);
    expect(parse(jsThroughFildesh.stdout, true)).toEqual(precise);
  });

  it.each(rejectedCases)("agrees on rejection: %s", source => {
    expect(() => parse(source, true)).toThrow();
    const fildesh = runFildesh(source);
    expect(fildesh.status).not.toBe(0);
  });
});
