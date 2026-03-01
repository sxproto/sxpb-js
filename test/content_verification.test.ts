import { describe, it, expect } from "vitest";
import { parse } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";

describe("Content Verification Tests", () => {
  const contentDir = path.join(__dirname, "content");

  if (!fs.existsSync(contentDir)) {
    // This might happen if the test is run in an environment where the content dir isn't set up yet,
    // but in this repo it should exist.
    throw new Error(`Content directory not found at ${contentDir}`);
  }

  const files = fs.readdirSync(contentDir);
  const sxpbFiles = files.filter((f) => f.endsWith(".sxpb"));

  sxpbFiles.forEach((sxpbFile) => {
    const baseName = path.basename(sxpbFile, ".sxpb");
    const jsonFile = `${baseName}.json`;

    if (files.includes(jsonFile)) {
      it(`verifies ${baseName}`, () => {
        const sxpbPath = path.join(contentDir, sxpbFile);
        const jsonPath = path.join(contentDir, jsonFile);

        const sxpbContent = fs.readFileSync(sxpbPath, "utf-8");
        const jsonContent = fs.readFileSync(jsonPath, "utf-8");

        const parsedSxpb = parse(sxpbContent);
        const parsedJson = JSON.parse(jsonContent);

        expect(parsedSxpb).toEqual(parsedJson);
      });
    }
  });
});
