export interface SxpbDict {
  [key: string]: SxpbValue;
}

export type SxpbValue = string | number | boolean | SxpbDict | SxpbList | SxpbLone | SxpbMany;

export class SxpbList extends Array<SxpbValue> {
  constructor(items: SxpbValue[] = []) {
    super(...items);
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
