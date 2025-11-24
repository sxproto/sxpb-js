# sxpb-js

A TypeScript library to read and write SxPB content, modeled after the `sxpb-py` Python library.

## Installation

```bash
npm install sxpb-js
```

*Note: If the package is not yet available on npm, you can install it from the git repository or local source.*

## Usage

```typescript
import { loads, dumps } from 'sxpb-js';

// Parsing SxPB string to object
const sxpbString = '(key "value")';
const data = loads(sxpbString);
console.log(data);
// Output: { key: "value" }

// Serializing object to SxPB string
const output = dumps(data);
console.log(output);
// Output: (key "value")

// Working with lists
// Input: (items (()) "one" "two")
const listData = loads('(items (()) "one" "two")');
// Result: { items: ["one", "two"] } (where the array is an instance of SxpbList)

// Working with nested messages
// Input: (parent (child "grandchild"))
const nested = loads('(parent (child "grandchild"))');
// Result: { parent: { child: "grandchild" } }
```
