import { expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { SxPB } from "../src/index.js";

test("nest content matches json and roundtrips", () => {
  const sxpb_path = path.join(process.cwd(), "test/content/nest.sxpb");
  const json_path = path.join(process.cwd(), "test/content/nest.json");

  const sxpb_content = fs.readFileSync(sxpb_path, "utf-8");
  const json_content = fs.readFileSync(json_path, "utf-8");

  // Parse SXPB (default precise=false returns native objects)
  const sxpb_parsed = SxPB.parse(sxpb_content);

  // Parse JSON
  const json_parsed = JSON.parse(json_content);

  // Assert equivalence
  expect(sxpb_parsed).toEqual(json_parsed);

  // Roundtrip check
  const serialized = SxPB.stringify(sxpb_parsed);
  const re_parsed = SxPB.parse(serialized);

  expect(re_parsed).toEqual(sxpb_parsed);
});
