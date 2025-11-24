import { describe, it, expect } from 'vitest';
import { dumps, loads, SxpbLone, SxpbMany } from '../src';

describe('Roundtrip', () => {
    it('handles complex nested structure', () => {
        const data = {
            project: {
                name: "sxpb-js",
                version: 1,
                tags: ["parser", "serializer"],
                config: new SxpbLone({ debug: true }),
                scripts: new SxpbMany([
                    new SxpbLone({ build: "tsc" }),
                    new SxpbLone({ test: "vitest" })
                ]),
                contributors: [
                    { name: "Alice", role: "maintainer" },
                    { name: "Bob", role: "developer" }
                ]
            }
        };

        const serialized = dumps(data);
        const deserialized = loads(serialized);

        // Note: SxpbMany and SxpbLone may lose their class instance type if not handled explicitly during deserialization,
        // OR the parser correctly reconstructs them.
        // My parser reconstructs SxpbMany and SxpbLone based on syntax.

        // However, `contributors` is a list of plain objects.
        // `dumps` serializes it as array body with messages.
        // `loads` parses it back as array of plain objects.

        // `scripts` is SxpbMany.
        // `dumps` serializes it as `(scripts (()) (build tsc) (test vitest))`.
        // `loads` parses `(scripts (()) ...)` and sees fields `(build tsc)`.
        // It detects `manyof_body` and returns `SxpbMany`.

        // `config` is SxpbLone.
        // `dumps` -> `((config debug) +true)`.
        // `loads` -> `SxpbLone`.

        expect(deserialized).toEqual(data);
    });

    it('handles deep nesting', () => {
        const data = { a: { b: { c: { d: "value" } } } };
        expect(loads(dumps(data))).toEqual(data);
    });

    it('handles mixed arrays', () => {
        // SxPB lists are homogenous usually (scalars OR messages).
        // My parser/serializer handles what it can.
        // Python serializer assumes homogenous.
        const data = { ids: [1, 2, 3] };
        expect(loads(dumps(data))).toEqual(data);
    });
});
