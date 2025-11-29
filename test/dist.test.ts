import { describe, it, expect } from "vitest";
import SxPB from "../dist/index.js";

describe("Distribution Build Artifact", () => {
  it("should successfully parse and stringify using the compiled distribution code", () => {
    // This test ensures that the `dist/` folder contains a working library
    // and that the default export behaves as expected.
    const sxpbString = '(key "value with space")';

    // Test Parse
    const data = SxPB.parse(sxpbString);
    expect(data).toEqual({ key: "value with space" });

    // Test Stringify
    const output = SxPB.stringify(data);
    expect(output).toBe('(key "value with space")');
  });
});
