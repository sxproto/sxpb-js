import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parse,
  stringify,
  SxpbList,
  SxpbLone,
  SxpbMany
} from "../src/index.js";

function readCorpusFile(kind: "golden" | "idempotent", name: string): string {
  return readFileSync(new URL(`./corpus/${kind}/${name}`, import.meta.url), "utf8");
}

function withoutTerminalLf(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

describe("shared SxPB corpus", () => {
  it("enumerates every checked-in fixture", () => {
    const corpusDir = new URL("./corpus/", import.meta.url);

    expect(readdirSync(new URL("golden/", corpusDir)).sort()).toEqual([
      "atom_spelling.sxpb",
      "item_boundary.sxpb"
    ]);
    expect(readdirSync(new URL("idempotent/", corpusDir)).sort()).toEqual([
      "name.sxpb",
      "scalar.sxpb"
    ]);
  });

  it.each([
    [
      "atom_spelling.sxpb",
      { dash: "-", dot: "." }
    ],
    [
      "item_boundary.sxpb",
      {
        empty_items: new SxpbList(["", "tail"]),
        choices: new SxpbMany([
          new SxpbLone({ named: 1 }),
          new SxpbLone({ "": "two words" }),
          new SxpbLone({ "": "" }),
          new SxpbLone({ "": "tail" })
        ])
      }
    ]
  ])("preserves the precise value of golden/%s", (name, expected) => {
    const parsed = parse(readCorpusFile("golden", name), true);
    expect(parsed).toEqual(expected);
    expect(parse(stringify(parsed), true)).toEqual(parsed);
  });

  it.each([
    "name.sxpb",
    "scalar.sxpb"
  ])("prints idempotent/%s exactly", name => {
    const source = readCorpusFile("idempotent", name);
    const parsed = parse(source, true);
    const printed = stringify(parsed);

    expect(withoutTerminalLf(printed)).toBe(withoutTerminalLf(source));
    expect(parse(printed, true)).toEqual(parsed);
  });
});
