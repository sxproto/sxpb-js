import { expect, test } from "vitest";
import { canFormatAsAnonymousDiscriminatedString } from "../src/serializer.js";

test("canFormatAsAnonymousDiscriminatedString", () => {
  // Should allow simple space-separated plain words
  expect(canFormatAsAnonymousDiscriminatedString("a b")).toBe(true);
  expect(canFormatAsAnonymousDiscriminatedString("hello world")).toBe(true);
  expect(canFormatAsAnonymousDiscriminatedString("one two three")).toBe(true);
  expect(canFormatAsAnonymousDiscriminatedString("key.value another-key")).toBe(true);

  // Should reject single words (no space)
  expect(canFormatAsAnonymousDiscriminatedString("hello")).toBe(false);

  // Should reject empty string
  expect(canFormatAsAnonymousDiscriminatedString("")).toBe(false);

  // Should reject leading spaces
  expect(canFormatAsAnonymousDiscriminatedString(" hello")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString(" hello world")).toBe(false);

  // Should reject trailing spaces
  expect(canFormatAsAnonymousDiscriminatedString("hello ")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("hello world ")).toBe(false);

  // Should reject double spaces
  expect(canFormatAsAnonymousDiscriminatedString("hello  world")).toBe(false);

  // Should reject control characters
  expect(canFormatAsAnonymousDiscriminatedString("hello\nworld")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("hello\tworld")).toBe(false);

  // Should reject special characters that require quoting
  expect(canFormatAsAnonymousDiscriminatedString("hello;world")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("hello; world")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString('hello "world"')).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("puts(\"hello world\");")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("(parens)")).toBe(false);
  expect(canFormatAsAnonymousDiscriminatedString("parens )")).toBe(false);

  // Edge cases
  expect(canFormatAsAnonymousDiscriminatedString("a+b c-d")).toBe(true); // + and - are plain
  expect(canFormatAsAnonymousDiscriminatedString("1 2")).toBe(true);
  expect(canFormatAsAnonymousDiscriminatedString("+true +false")).toBe(true);
});
