import { describe, it, expect } from 'vitest';
import { loads } from '../src/parser';
import { SxpbLone, SxpbMany } from '../src/types';

describe('SxPB Parser', () => {
  it('parses empty message', () => {
    expect(loads('')).toEqual({});
  });

  it('parses simple scalar fields', () => {
    const input = `
      (name "test")
      (id 123)
      (active +true)
    `;
    expect(loads(input)).toEqual({
      name: "test",
      id: 123,
      active: true
    });
  });

  it('parses nested message', () => {
    const input = `(user (name "Alice") (age 30))`;
    expect(loads(input)).toEqual({
      user: {
        name: "Alice",
        age: 30
      }
    });
  });

  it('parses array of scalars', () => {
      const input = `(tags (()) "a" "b" "c")`;
      expect(loads(input)).toEqual({
          tags: ["a", "b", "c"]
      });
  });

  it('parses array of messages', () => {
      // Note: `((name "a"))` is `( () (name "a") )` -- unnamed message field
      // Wait, unnamed message field is `( () message_body )`.
      // `message_body` is `(name "a")`.
      // So input should be `(users (()) ( () (name "a") ) ( () (name "b") ) )`?

      // Let's check parser logic for array body messages.
      // `parseArrayBodyMessages` expects `( () ... )` or `()`.
      // `( () message_body )`

      const input2 = `(users (()) (() (name "a")) (() (name "b")))`;

      expect(loads(input2)).toEqual({
          users: [{name: "a"}, {name: "b"}]
      });
  });

  it('parses manyof field', () => {
      // (name (()) (k1 v1) (k2 v2))
      const input = `(properties (()) (k1 "v1") (k2 "v2"))`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = loads(input) as any;
      expect(result.properties).toBeInstanceOf(SxpbMany);
      expect(result.properties.value).toHaveLength(2);
      expect(result.properties.value[0]).toBeInstanceOf(SxpbLone);
      expect(result.properties.value[0].value).toEqual({k1: "v1"});
  });

  it('parses loneof field', () => {
      // ((key subkey) value)
      const input = `((config debug) +true)`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = loads(input) as any;
      expect(result.config).toBeInstanceOf(SxpbLone);
      expect(result.config.value).toEqual({debug: true});
  });
});
