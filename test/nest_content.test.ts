import { expect, test } from "vitest";
import { SxPB } from "../src/index.js";

test("nest content read-write-read-compare", () => {
  const sxpb_content = `; The toplevel structure is a nest,
; which is a free-form recursive string dict
; that is useful for structuring descriptions into a hierarchy.
("")

("black bear"
 (color cinnamon)
 ("" clawing at the bark of a Douglas fir)
)

("grizzly bear" "" foraging for honeyberries)

(meadow
 (grass
  green
  verdant
  (swaying "" gently in the breeze)
 )
 (wildflowers
  blooming
  (fragrance sweet subtle)
 )
)`;

  // Parse
  const data = SxPB.parse(sxpb_content, true);
  expect(data).toBeInstanceOf(SxPB.Nest);

  // Serialize
  const generated = SxPB.stringify(data, 1);

  // Parse again
  const data2 = SxPB.parse(generated, true);

  // Compare
  expect(data2).toEqual(data);

  // Manual check of structure
  const nest = data as SxPB.Nest;

  // black bear
  const blackBear = nest.value["black bear"];
  expect(blackBear).toBeInstanceOf(SxPB.Nest);
  expect(blackBear!.value["color"]).toBeInstanceOf(SxPB.Nest);
  expect(blackBear!.value["color"]!.value["cinnamon"]).toBeNull();
  // `("" clawing ...)` implies `clawing ...` is a key pointing to an empty nest (empty list of items), not null (leaf).
  expect(blackBear!.value["clawing at the bark of a Douglas fir"]).toBeInstanceOf(SxPB.Nest);

  // grizzly bear
  const grizzly = nest.value["grizzly bear"];
  expect(grizzly).toBeInstanceOf(SxPB.Nest);
  expect(grizzly!.value["foraging for honeyberries"]).toBeNull();

  // meadow
  const meadow = nest.value["meadow"];
  expect(meadow).toBeInstanceOf(SxPB.Nest);

  const grass = meadow!.value["grass"];
  expect(grass).toBeInstanceOf(SxPB.Nest);
  expect(grass!.value["green"]).toBeNull();
  expect(grass!.value["verdant"]).toBeNull();

  const swaying = grass!.value["swaying"];
  expect(swaying).toBeInstanceOf(SxPB.Nest);
  expect(swaying!.value["gently in the breeze"]).toBeNull();

  const wildflowers = meadow!.value["wildflowers"];
  expect(wildflowers).toBeInstanceOf(SxPB.Nest);
  expect(wildflowers!.value["blooming"]).toBeNull();

  const fragrance = wildflowers!.value["fragrance"];
  expect(fragrance).toBeInstanceOf(SxPB.Nest);
  expect(fragrance!.value["sweet"]).toBeNull();
  expect(fragrance!.value["subtle"]).toBeNull();
});
