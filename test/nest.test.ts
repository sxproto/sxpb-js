import { expect, test } from "vitest";
import { SxPB } from "../src/index.js";

test("user example", () => {
  const sxpb_text = `
    (my_nest ("")
     t
     ("" u v)
     (w a b)
     (x "" c d)
     ("y z" "" e f)
     (quoted_value "puts(\\"hello world\\");")
    )
  `;
  const data = SxPB.parse(sxpb_text, true) as SxPB.Dict;
  expect(data.my_nest).toBeDefined();

  const nest = data.my_nest as SxPB.Nest;
  expect(nest).toBeInstanceOf(SxPB.Nest);

  // t
  expect(nest.value["t"]).toBeNull();

  // ("" u v) -> "u v"
  expect(nest.value["u v"]).toBeNull();

  // (w a b) -> w -> {a: None, b: None}
  const w = nest.value["w"];
  expect(w).toBeInstanceOf(SxPB.Nest);
  expect(w!.value["a"]).toBeNull();
  expect(w!.value["b"]).toBeNull();

  // (x "" c d) -> x -> {"c d": None}
  const x = nest.value["x"];
  expect(x).toBeInstanceOf(SxPB.Nest);
  expect(x!.value["c d"]).toBeNull();

  // ("y z" "" e f) -> "y z" -> {"e f": None}
  const yz = nest.value["y z"];
  expect(yz).toBeInstanceOf(SxPB.Nest);
  expect(yz!.value["e f"]).toBeNull();

  // (quoted_value "puts(\"hello world\");") -> quoted_value -> {"puts(\"hello world\");": None}
  const qv = nest.value["quoted_value"];
  expect(qv).toBeInstanceOf(SxPB.Nest);
  expect(qv!.value['puts("hello world");']).toBeNull();

  // Serialization test
  const generated_sxpb = SxPB.stringify(data, 1);

  expect(generated_sxpb).toContain('(my_nest ("")');
  expect(generated_sxpb).toContain(" t");
  expect(generated_sxpb).toContain(' ("" u v)');
  expect(generated_sxpb).toContain(" (w a b)");
  expect(generated_sxpb).toContain(' (x "" c d)');
  expect(generated_sxpb).toContain(' ("y z" "" e f)');
  expect(generated_sxpb).toContain(' (quoted_value "puts(\\"hello world\\");")');
});

test("nest roundtrip", () => {
  const nest = new SxPB.Nest({
    "simple": null,
    "sub": new SxPB.Nest({
      "key1": null,
      "key2": null
    }),
    "str_field": new SxPB.Nest({
      "some string value": null
    }),
    "quoted string": null,
    "empty_str": new SxPB.Nest({
      "": null
    })
  });

  const data = { "my_nest": nest };
  const serialized = SxPB.stringify(data, 1);

  expect(serialized).toContain('(my_nest ("")');
  expect(serialized).toContain(" simple");
  expect(serialized).toContain("(sub key1 key2)");
  expect(serialized).toContain('(str_field "" some string value)');
  expect(serialized).toContain('("" quoted string)');
  expect(serialized).toContain('(empty_str "")');

  const loaded = SxPB.parse(serialized, true) as SxPB.Dict;
  // Deep equality check needed. Jest/Vitest handles recursive object matching.
  // Note: SxPB.Nest instances match if properties match.
  expect(loaded["my_nest"]).toEqual(nest);
});

test("formatting rules", () => {
  // 4 strings -> multiline
  const nest = new SxPB.Nest({"a": null, "b": null, "c": null, "d": null});
  const data = {"test": nest};
  const serialized = SxPB.stringify(data, 1);
  expect(serialized).toContain('(test ("")');
  expect(serialized).toContain("\n a");
  expect(serialized).toContain("\n b");
  expect(serialized).toContain("\n c");
  expect(serialized).toContain("\n d");

  // 3 strings -> inline (heuristic check)
  const nest3 = new SxPB.Nest({"a": null, "b": null, "c": null});
  const data3 = {"test": nest3};
  const serialized3 = SxPB.stringify(data3, 1);
  expect(serialized3).toContain('(test ("") a b c)');

  // subnest -> multiline
  const nest_mixed = new SxPB.Nest({"a": null, "sub": new SxPB.Nest({"x": null})});
  const data_mixed = {"test": nest_mixed};
  const serialized_mixed = SxPB.stringify(data_mixed, 1);
  expect(serialized_mixed).toContain('(test ("")');
  expect(serialized_mixed).toContain("\n a");
  expect(serialized_mixed).toContain("\n (sub x)");
});

test("toplevel nest", () => {
  const sxpb_text = `
    ("")
    key1
    (key2 val2)
  `;
  const data = SxPB.parse(sxpb_text, true) as SxPB.Nest;
  expect(data).toBeInstanceOf(SxPB.Nest);
  expect(data.value["key1"]).toBeNull();

  const key2 = data.value["key2"];
  expect(key2).toBeInstanceOf(SxPB.Nest);
  expect(key2!.value["val2"]).toBeNull();

  // Roundtrip
  const serialized = SxPB.stringify(data, 1);
  expect(serialized.trim().startsWith('("")')).toBe(true);
  expect(serialized).toContain("key1");
  expect(serialized).toContain("(key2 val2)");

  const loaded = SxPB.parse(serialized, true);
  expect(loaded).toEqual(data);
});
