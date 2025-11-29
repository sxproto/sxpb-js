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
