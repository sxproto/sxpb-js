export interface SxpbDict {
  [key: string]: SxpbValue;
}

export type SxpbValue = string | number | bigint | boolean | SxpbDict | SxpbList | SxpbLone | SxpbMany | SxpbValue[];

export class SxpbList extends Array<SxpbValue> {
  constructor(items?: number | SxpbValue[]) {
    if (typeof items === "number") {
      super(items);
    } else {
      super();
      if (items && items.length > 0) {
        // Optimize: Use push for smaller arrays, or direct assignment/concatenation strategies
        // for very large arrays to avoid stack overflow with spread.
        // However, standard push(...items) also uses stack.
        // Best for large arrays is to loop or use concat.
        // But we are extending Array, so we are the array.

        // Strategy: Initialize with length and copy.
        // This is much faster and safe.
        this.length = items.length;
        for (let i = 0; i < items.length; i++) {
          this[i] = items[i];
        }
      }
    }
    Object.setPrototypeOf(this, SxpbList.prototype);
  }

  toList() {
    return Array.from(this);
  }
}

export class SxpbLone {
  constructor(public value: { [key: string]: SxpbValue }) {}

  toDict() {
    return this.value;
  }
}

export class SxpbMany {
  constructor(public value: SxpbValue[] = []) {}

  toList() {
    return this.value;
  }
}

export const SxPBTypes = {
  List: SxpbList,
  Lone: SxpbLone,
  Many: SxpbMany
} as const;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SxPBTypes {
  export type List = SxpbList;
  export type Lone = SxpbLone;
  export type Many = SxpbMany;
  export type Dict = SxpbDict;
  export type Value = SxpbValue;
}
