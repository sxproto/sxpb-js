export interface SxpbDict {
  [key: string]: SxpbValue;
}

export type SxpbValue = string | number | bigint | boolean | SxpbDict | SxpbList | SxpbLone | SxpbMany | SxpbNest | SxpbValue[];

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
    const entries = Object.entries(this.value);
    if (entries.length === 1 && entries[0][0] === "") {
      const anonymousValue = entries[0][1];
      if (anonymousValue === null || typeof anonymousValue !== "object") {
        return { value: anonymousValue };
      }
    }
    return this.value;
  }
}

export class SxpbMany {
  constructor(public value: SxpbValue[] = []) {}

  toList() {
    return this.value;
  }
}

export type SxpbNestItem = string | { [key: string]: SxpbNest };

export class SxpbNest extends Array<SxpbNestItem> {
  constructor(items?: number | SxpbNestItem[] | Record<string, SxpbNest | null>) {
    if (typeof items === "number") {
      super(items);
    } else if (Array.isArray(items)) {
      super();
      if (items.length > 0) {
        this.length = items.length;
        for (let i = 0; i < items.length; i++) {
          this[i] = items[i];
        }
      }
    } else if (items && typeof items === "object") {
      super();
      const keys = Object.keys(items);
      for (const key of keys) {
        const val = items[key];
        if (val === null) {
          this.push(key);
        } else {
          this.push({ [key]: val });
        }
      }
    } else {
      super();
    }
    Object.setPrototypeOf(this, SxpbNest.prototype);
  }

  pairs(): [string, SxpbNest | null][] {
    const result: [string, SxpbNest | null][] = [];
    for (const item of this) {
      if (typeof item === "string") {
        result.push([item, null]);
      } else {
        const key = Object.keys(item)[0];
        result.push([key, item[key]]);
      }
    }
    return result;
  }

  get value(): Record<string, SxpbNest | null> {
    const dict: Record<string, SxpbNest | null> = {};
    for (const [k, v] of this.pairs()) {
      dict[k] = v;
    }
    return dict;
  }
}

export const SxPBTypes = {
  List: SxpbList,
  Lone: SxpbLone,
  Many: SxpbMany,
  Nest: SxpbNest
} as const;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SxPBTypes {
  export type Dict = SxpbDict;
  export type List = SxpbList;
  export type Lone = SxpbLone;
  export type Many = SxpbMany;
  export type Nest = SxpbNest;
  export type Value = SxpbValue;
  export type NestItem = SxpbNestItem;
}
