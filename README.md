# sxpb-js

A TypeScript library to read and write SxPB content, modeled after the `sxpb-py` Python library.

## Installation

The package is not yet available on npm, so your `package.json` must reference the git repository.
```json
{
  "dependencies": {
    "@sxproto/sxpb": "github:sxproto/sxpb-js#COMMIT_HASH"
  }
}
```

## Usage

```typescript
import SxPB from "@sxproto/sxpb";

// Parsing SxPB string to object
const sxpbString = '(key "value with space")';
const data = SxPB.parse(sxpbString);
console.log(data);
// Output: { key: "value with space" }

// Serializing object to SxPB string
const output = SxPB.stringify(data);
console.log(output);
// Output: (key "value with space")

// Working with lists
// Input: (items (()) "one" "two")
const listData = SxPB.parse('(items (()) "one" "two")');
// Result: { items: ["one", "two"] }

// Working with nested messages
// Input: (parent (child "grandchild"))
const nested = SxPB.parse('(parent (child "grandchild"))');
// Result: { parent: { child: "grandchild" } }
```

## Precise parsing

Pass `true` as the second argument to preserve SxPB-specific runtime types instead of flattening them to native JavaScript objects and arrays:

```typescript
const data = SxPB.parse('(config () (enabled +true))', true) as SxPB.Mesg;
console.log(data.config instanceof SxPB.Dict); // true
console.log(SxPB.stringify(data, 0)); // (config () (enabled +true))
```

Messages remain plain objects. Dict values, which carry an explicit `()` discriminator, are instances of `SxpbDict` (also available as `SxPB.Dict`) so that parsing and serialization preserve the distinction. The exported `SxpbMesg` type describes a plain message record.

## Explicit append

Use `((+. path...) (()) items...)` to append to an array or manyof that has already been declared in the containing message:

```typescript
const data = SxPB.parse(`
  (message (items (()) 1 2))
  ((+. message items) (()) 3 4)
`);
// Result: { message: { items: [1, 2, 3, 4] } }
```

Append paths are relative to the message containing the operation. Path components may be bare or quoted field names. Every path component must already exist; intermediate values must be messages or dicts, and the target must be an array or manyof. The `(())` discriminator is required even when no items are appended.

Appended values must match the target collection's anonymous element kind. Empty collections acquire their kind from the first appended anonymous item. Named manyof entries are preserved and do not determine the anonymous element kind.

Serialization emits the resulting combined collection, not the `+.` operation.

## Duplicate fields

Ordinary duplicate field declarations are rejected, including repeated arrays and manyofs. Use explicit append when extending an existing collection:

```typescript
SxPB.parse('(items (()) 1)(items (()) 2)');
// Throws: Duplicate field name 'items'. Use explicit append syntax for list fields.

SxPB.parse('(items (()) 1)((+. items) (()) 2)');
// Result: { items: [1, 2] }
```
