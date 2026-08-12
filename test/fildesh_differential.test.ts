import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "../src/index.js";

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
  "((choice) 1 (named (x 2)) 3)"
];

const rejectedCases = [
  '(a (()) 1 "word")',
  "(a (()) 1 +true)",
  "(a (()) +true 2)",
  "(a (()) 1 ())",
  "((choice) 1 (named word) +true)",
  "((choice) +true (named word) 2)",
  "((choice) one (named 1) ())",
  "((choice) () (named 1) one)"
];

function runFildesh(source: string) {
  return spawnSync(fildeshBin!, ["-as", "sxpb2sxpb"], {
    input: source,
    encoding: "utf8"
  });
}

describeWithFildesh("local Fildesh differential conformance", () => {
  it.each(acceptedCases)("agrees on acceptance and accepts JS output: %s", source => {
    const precise = parse(source, true);
    const fildesh = runFildesh(source);

    expect(fildesh.status, fildesh.stderr).toBe(0);

    // Canonical text is deliberately not compared while the pending local
    // Fildesh stack still differs on float spelling and anonymous messages.
    const jsThroughFildesh = runFildesh(stringify(precise, 0));
    expect(jsThroughFildesh.status, jsThroughFildesh.stderr).toBe(0);
  });

  it.each(rejectedCases)("agrees on rejection: %s", source => {
    expect(() => parse(source, true)).toThrow();
    const fildesh = runFildesh(source);
    expect(fildesh.status).not.toBe(0);
  });
});
