import { parse } from "./parser.js";
import { stringify } from "./serializer.js";
import { SxPBTypes } from "./types.js";

export * from "./parser.js";
export * from "./serializer.js";
export { SxpbList, SxpbLone, SxpbMany, SxpbDict } from "./types.js";

export const SxPB = {
  ...SxPBTypes,
  parse,
  stringify
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SxPB {
  export type List = SxPBTypes.List;
  export type Lone = SxPBTypes.Lone;
  export type Many = SxPBTypes.Many;
  export type Dict = SxPBTypes.Dict;
}

export default SxPB;
