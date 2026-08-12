import { describe, it, expect } from "vitest";
import SxPBDefault, { SxPB, SxpbDict, parse, stringify } from "../src/index.js";

describe("Interface", () => {
  it("default export has all methods", () => {
    expect(SxPBDefault.parse).toBeDefined();
    expect(SxPBDefault.stringify).toBeDefined();
    expect((SxPBDefault as any).loads).toBeUndefined();
    expect((SxPBDefault as any).dumps).toBeUndefined();
  });

  it("named SxPB export has its runtime API", () => {
    expect(SxPB.parse).toBeDefined();
    expect(SxPB.stringify).toBeDefined();
    expect(SxPB.Dict).toBe(SxpbDict);
    expect((SxPB as any).loads).toBeUndefined();
    expect((SxPB as any).dumps).toBeUndefined();
  });

  it("named function exports work", () => {
    expect(parse).toBeDefined();
    expect(stringify).toBeDefined();
  });

  it("aliases are correct", () => {
    expect(SxPBDefault).toBe(SxPB);
  });

  it("works with simple data", () => {
    const data = { foo: "bar" };
    const serialized = SxPB.stringify(data);
    expect(serialized).toContain("foo");
    expect(serialized).toContain("bar");

    const parsed = SxPB.parse(serialized);
    expect(parsed).toEqual(data);
  });
});
