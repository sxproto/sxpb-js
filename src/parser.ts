import { SxPBTypes as SxPB } from "./types.js";

// Token Types
enum TokenType {
  LPAREN,
  RPAREN,
  STRING,
  NUMBER,
  BOOLEAN,
  BARE,
  EOF
}

interface Token {
  type: TokenType;
  value: string | number | boolean | bigint;
  line: number;
  column: number;
}

class Lexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  private precise: boolean;

  constructor(input: string, precise: boolean) {
    this.input = input;
    this.precise = precise;
  }

  private peek(): string {
    return this.pos < this.input.length ? this.input[this.pos] : "";
  }

  private advance(): string {
    const char = this.peek();
    if (char === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    this.pos++;
    return char;
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private skipWhitespaceAndComments() {
    while (true) {
      const char = this.peek();
      if (char === "") break;

      if (this.isWhitespace(char)) {
        this.advance();
      } else if (char === ";") {
        while (this.peek() !== "\n" && this.peek() !== "") {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  getNextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.input.length) {
      return { type: TokenType.EOF, value: "", line: this.line, column: this.col };
    }

    const startLine = this.line;
    const startCol = this.col;
    const char = this.peek();

    if (char === "(") {
      this.advance();
      return { type: TokenType.LPAREN, value: "(", line: startLine, column: startCol };
    }

    if (char === ")") {
      this.advance();
      return { type: TokenType.RPAREN, value: ")", line: startLine, column: startCol };
    }

    if (char === '"') {
      return this.readString();
    }

    // Try to match boolean
    if (this.input.startsWith("+true", this.pos)) {
      this.pos += 5; this.col += 5;
      return { type: TokenType.BOOLEAN, value: true, line: startLine, column: startCol };
    }
    if (this.input.startsWith("+false", this.pos)) {
      this.pos += 6; this.col += 6;
      return { type: TokenType.BOOLEAN, value: false, line: startLine, column: startCol };
    }

    const atom = this.readAtom();

    // Check if atom matches number regex completely
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(atom)) {
      if (this.precise && /^[+-]?\d+$/.test(atom)) {
        // Check if it's an integer
        const bigIntVal = BigInt(atom);
        if (bigIntVal >= Number.MIN_SAFE_INTEGER && bigIntVal <= Number.MAX_SAFE_INTEGER) {
          return { type: TokenType.NUMBER, value: Number(bigIntVal), line: startLine, column: startCol };
        } else {
          return { type: TokenType.NUMBER, value: bigIntVal, line: startLine, column: startCol };
        }
      }
      const num = parseFloat(atom);
      return { type: TokenType.NUMBER, value: num, line: startLine, column: startCol };
    }

    return { type: TokenType.BARE, value: atom, line: startLine, column: startCol };
  }

  private readString(): Token {
    const startLine = this.line;
    const startCol = this.col;

    // Check for triple quote
    if (this.input.startsWith('"""', this.pos)) {
      this.pos += 3; this.col += 3;
      let val = "";
      while (this.pos < this.input.length && !this.input.startsWith('"""', this.pos)) {
        val += this.advance();
      }
      if (this.input.startsWith('"""', this.pos)) {
        this.pos += 3; this.col += 3;
      }

      if (val.startsWith("\\\n")) {
        val = val.substring(2);
      } else if (val.startsWith("\n")) {
        val = val.substring(1);
      }

      val = this.dedent(val);
      val = val.replace(/\\"/g, '"');
      return { type: TokenType.STRING, value: val, line: startLine, column: startCol };
    }

    this.advance(); // consume "
    let val = "";
    while (this.pos < this.input.length) {
      const c = this.peek();
      if (c === '"') {
        this.advance();
        break;
      }
      if (c === "\\") {
        this.advance();
        const escaped = this.advance();
        if (escaped === "n") val += "\n";
        else if (escaped === "r") val += "\r";
        else if (escaped === "t") val += "\t";
        else if (escaped === '"') val += '"';
        else if (escaped === "\\") val += "\\";
        else val += escaped;
      } else {
        val += this.advance();
      }
    }
    return { type: TokenType.STRING, value: val, line: startLine, column: startCol };
  }

  private dedent(text: string): string {
    const lines = text.split("\n");
    let minIndent = Infinity;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length === 0) continue;
      const match = lines[i].match(/^ */);
      const indent = match ? match[0].length : 0;
      if (indent < minIndent) minIndent = indent;
    }

    if (minIndent === Infinity) return text;

    return lines.map(line => {
      if (line.trim().length === 0) return line;
      return line.startsWith(" ".repeat(minIndent)) ? line.substring(minIndent) : line;
    }).join("\n");
  }

  private readAtom(): string {
    let val = "";
    while (this.pos < this.input.length) {
      const c = this.peek();
      if (this.isWhitespace(c) || c === "(" || c === ")" || c === ";" || c === '"') {
        break;
      }
      val += this.advance();
    }
    return val;
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(input: string, precise: boolean = false) {
    const lexer = new Lexer(input, precise);
    this.tokens = [];
    let token = lexer.getNextToken();
    while (token.type !== TokenType.EOF) {
      this.tokens.push(token);
      token = lexer.getNextToken();
    }
    this.tokens.push(token); // EOF
  }

  private peek(offset: number = 0): Token {
    if (this.pos + offset >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1];
    }
    return this.tokens[this.pos + offset];
  }

  private match(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private consume(type?: TokenType): Token {
    if (type !== undefined && !this.match(type)) {
      const current = this.peek();
      throw new Error(`Expected ${TokenType[type]} but got ${TokenType[current.type]} (${current.value}) at line ${current.line}:${current.column}`);
    }
    return this.tokens[this.pos++];
  }

  private isUnquoted(token: Token): boolean {
    return token.type === TokenType.BARE || token.type === TokenType.NUMBER || token.type === TokenType.BOOLEAN;
  }

  public parse(): SxPB.Value {
    if (this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) {

      return this.parseArrayBodyOrManyOfBody();

    } else {
      return this.parseMessageBody();
    }
  }

  private isNextTokenAnArrayBodyItem(): boolean {
    // Look ahead to determine if the body content is an array_body or manyof_body.
    // array_body items can be:
    // 1. Scalar (NUMBER, BOOLEAN, STRING, BARE)
    // 2. Empty message: `()`
    // 3. Anonymous discriminated string: `("" ...)`
    // 4. Anonymous discriminated message: `(() ...)`
    //
    // manyof_body items are fields: `(key ...)` or `((key) ...)`

    const t4 = this.peek(4); // Token after `(())`

    if (
      t4.type === TokenType.STRING ||
      t4.type === TokenType.NUMBER ||
      t4.type === TokenType.BOOLEAN ||
      t4.type === TokenType.BARE
    ) {
      return true; // Scalar value
    }

    if (t4.type === TokenType.LPAREN) {
      const t5 = this.peek(5);
      if (t5.type === TokenType.RPAREN) {
        return true; // `()`
      }
      if (t5.type === TokenType.STRING && t5.value === "") {
        // `("" ...)` -> anonymous discriminated string
        return true;
      }
      if (t5.type === TokenType.LPAREN) {
        const t6 = this.peek(6);
        if (t6.type === TokenType.RPAREN) {
          return true; // `(()` -> anonymous discriminated message
        }
      }
    }

    return false;
  }

  private parseArrayBodyOrManyOfBody(): SxPB.List | SxPB.Many {
    if (this.peek(4).type === TokenType.EOF) {
      this.consumeHeader();
      return new SxPB.List([]);
    }

    if (this.isNextTokenAnArrayBodyItem()) {
      return this.parseArrayBody();
    } else {
      return this.parseManyOfBody();
    }
  }

  private consumeHeader() {
    this.consume(TokenType.LPAREN);
    this.consume(TokenType.LPAREN);
    this.consume(TokenType.RPAREN);
    this.consume(TokenType.RPAREN);
  }

  private parseScalar(): SxPB.Value {
    const t = this.peek();

    // Check for NUMBER or BOOLEAN first as they are strict scalars in this context.
    // string_body (which includes BARE) cannot start with digit or +true/+false.
    // So if it looks like NUMBER or BOOLEAN, it matches scalar_body rule for those types, NOT string_body.

    if (t.type === TokenType.NUMBER || t.type === TokenType.BOOLEAN) {
      return this.consume().value;
    }

    if (t.type === TokenType.STRING || t.type === TokenType.BARE) {
      return this.parseStringBody();
    }

    throw new Error(`Expected scalar, got ${TokenType[t.type]} at line ${t.line}:${t.column}`);
  }

  private parseStringBody(): string {
    const parts: string[] = [];
    let prevWasUnquoted = false;

    while (
      this.match(TokenType.STRING) ||
      this.match(TokenType.BARE) ||
      this.match(TokenType.NUMBER) ||
      this.match(TokenType.BOOLEAN)
    ) {
      const t = this.consume();
      const isUnquoted = this.isUnquoted(t);

      // Only insert space if BOTH previous and current are unquoted
      if (parts.length > 0 && prevWasUnquoted && isUnquoted) {
        parts.push(" ");
      }

      let valStr: string;
      if (t.type === TokenType.BOOLEAN) {
        valStr = t.value ? "+true" : "+false";
      } else {
        valStr = String(t.value);
      }
      parts.push(valStr);
      prevWasUnquoted = isUnquoted;
    }

    return parts.join("");
  }

  private parseAnonymousDiscriminatedStringBody(): string {
    const parts: string[] = [];

    while (
      this.match(TokenType.STRING) ||
      this.match(TokenType.BARE) ||
      this.match(TokenType.NUMBER) ||
      this.match(TokenType.BOOLEAN)
    ) {
      const t = this.consume();
      let valStr: string;
      if (t.type === TokenType.BOOLEAN) {
        valStr = t.value ? "+true" : "+false";
      } else {
        valStr = String(t.value);
      }
      parts.push(valStr);
    }

    return parts.join(" "); // ALWAYS JOIN WITH SPACE
  }

  private parseMessageBody(): SxPB.Dict {
    const message: SxPB.Dict = {};
    while (!this.match(TokenType.EOF) && !this.match(TokenType.RPAREN)) {
      const field = this.parseField();
      const key = Object.keys(field)[0];
      const val = field[key];

      if (key in message) {
        const existing = message[key];
        const isNativeArray = Array.isArray(existing) && !(existing instanceof SxPB.List);

        if (isNativeArray) {
          (message[key] as SxPB.Value[]).push(val);
        } else {
          message[key] = [existing as SxPB.Value, val];
        }
      } else {
        message[key] = val;
      }
    }
    return message;
  }

  private parseField(): SxPB.Dict {
    this.consume(TokenType.LPAREN);

    if (this.match(TokenType.LPAREN)) {
      // `((` -> loneof or manyof variant
      this.consume(TokenType.LPAREN);
      const name1 = this.parseFieldName();

      if (this.match(TokenType.RPAREN)) {
        // `((name) ...)` -> manyof_field variant 2
        this.consume(TokenType.RPAREN);
        const items: SxPB.Value[] = [];

        // manyof_field variant 2 body: (manyof_item | any_field)*
        while (!this.match(TokenType.RPAREN)) {
          if (this.match(TokenType.LPAREN)) {
            // any_field
            const f = this.parseField();
            items.push(new SxPB.Lone(f));
          } else {
            // manyof_item (scalar)
            // parseScalar() potentially merges items into one string (string_body),
            // but manyof_item expects individual items.
            // Grammar: manyof_item: SIGNED_NUMBER | ESCAPED_STRING | MULTILINE_STRING | BARE | BOOLEAN
            // Thus it does NOT support string_body (concatenated) here.

            const t = this.peek();
            if (t.type === TokenType.NUMBER || t.type === TokenType.BOOLEAN || t.type === TokenType.STRING || t.type === TokenType.BARE) {
              // consume one atom
              const atomToken = this.consume();
              items.push(new SxPB.Lone({ value: atomToken.value }));
            } else {
              throw new Error(`Expected scalar or field in manyof variant 2, got ${TokenType[t.type]}`);
            }
          }
        }
        this.consume(TokenType.RPAREN);
        return { [name1]: new SxPB.Many(items) };
      } else {
        // `((key subkey) ...)` -> loneof_field
        const subkey = this.parseFieldName();
        this.consume(TokenType.RPAREN);

        const value = this.parseValue();
        this.consume(TokenType.RPAREN);
        return { [name1]: new SxPB.Lone({ [subkey]: value }) };
      }
    } else {
      // `(name ...)`
      const name = this.parseFieldName();

      // Check for `(())` to detect manyof_field variant 1 or regular_field with array_body
      if (this.match(TokenType.LPAREN) &&
                 this.peek(1).type === TokenType.LPAREN &&
                 this.peek(2).type === TokenType.RPAREN &&
                 this.peek(3).type === TokenType.RPAREN) {

        const body = this.parseArrayBodyOrManyOfBody();
        this.consume(TokenType.RPAREN);
        return { [name]: body };

      } else {
        // regular_field
        const value = this.parseValue();
        this.consume(TokenType.RPAREN);
        return { [name]: value };
      }
    }
  }

  private parseFieldName(): string {
    const t = this.consume();
    if (t.type === TokenType.BARE || t.type === TokenType.STRING) {
      return String(t.value);
    }
    throw new Error(`Expected field name, got ${TokenType[t.type]} at line ${t.line}:${t.column}`);
  }

  private parseValue(): SxPB.Value {
    if (this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) {
      // It's `(())`
      return this.parseArrayBodyOrManyOfBody();
    }

    if (this.match(TokenType.LPAREN)) {
      return this.parseMessageBody();
    }

    return this.parseScalar();
  }

  private parseManyOfBody(): SxPB.Many {
    this.consumeHeader();
    return this.parseManyOfBodyItems();
  }

  private parseManyOfBodyItems(): SxPB.Many {
    const items: SxPB.Value[] = [];
    while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const f = this.parseField();
      items.push(new SxPB.Lone(f));
    }
    return new SxPB.Many(items);
  }

  private parseArrayBody(): SxPB.List {
    this.consumeHeader();
    let items: SxPB.Value[] = [];

    // Parse items individually
    while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const t = this.peek();

      if (t.type === TokenType.NUMBER) {
        items.push(this.consume().value);
      } else if (t.type === TokenType.BOOLEAN) {
        items.push(this.consume().value);
      } else if (t.type === TokenType.STRING || t.type === TokenType.BARE) {
        items.push(String(this.consume().value));
      } else if (t.type === TokenType.LPAREN) {
        // Could be empty message `()` or anonymous discriminated message `(() ...)` or `anonymous discriminated string` `("" ...)`
        if (this.peek(1).type === TokenType.RPAREN) {
          // `()` -> empty message
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.RPAREN);
          items.push({});
        } else if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          // `("" ...)` -> anonymous discriminated string
          // Structure: LPAREN, STRING(""), (ESCAPED_STRING | MULTILINE_STRING | PLAIN)+, RPAREN
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.STRING); // Consume ""

          // Special handling for anonymous discriminated string body (always space separated)
          const strBody = this.parseAnonymousDiscriminatedStringBody();

          this.consume(TokenType.RPAREN);
          items.push(strBody);
        } else if (this.peek(1).type === TokenType.LPAREN && this.peek(2).type === TokenType.RPAREN) {
          // `(() ...)` -> anonymous discriminated message
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LPAREN); // (
          this.consume(TokenType.RPAREN); // )
          const msg = this.parseMessageBody();
          this.consume(TokenType.RPAREN); // closing )
          items.push(msg);
        } else {
          throw new Error("Invalid array body item. Unexpected '(' sequence.");
        }
      } else {
        throw new Error(`Invalid array body item type: ${TokenType[t.type]}`);
      }
    }

    // Post-processing to enforce homogeneity and string conversion
    // 1. If any item is a String (or BARE which is treated as string here), or anonymous discriminated string result
    //    Convert all scalars (Number, Boolean) to String.
    // 2. If all are Number -> ok.
    // 3. If all are Boolean -> ok.
    // 4. If all are Message (Objects) -> ok.
    // Mixed Message and Scalar is invalid (grammar separates them), but we can just leave it or fail.

    // Check if we have any strings
    const hasString = items.some(i => typeof i === "string");

    if (hasString) {
      // Promote all scalars to string
      items = items.map(i => {
        if (typeof i === "number") return String(i);
        if (typeof i === "boolean") return i ? "+true" : "+false";
        return i;
      });
    }

    return new SxPB.List(items);
  }
}

function unwrap(value: SxPB.Value): SxPB.Value {
  if (value instanceof SxPB.List) {
    return Array.from(value).map(unwrap);
  }
  if (value instanceof SxPB.Many) {
    return value.value.map(unwrap);
  }
  if (value instanceof SxPB.Lone) {
    return unwrap(value.value);
  }
  if (Array.isArray(value)) {
    return value.map(unwrap);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const newDict: SxPB.Dict = {};
    for (const k in value) {
      newDict[k] = unwrap((value as SxPB.Dict)[k]);
    }
    return newDict;
  }
  return value;
}

export function parse(text: string, precise: boolean = false): SxPB.Value {
  const parser = new Parser(text, precise);
  const result = parser.parse();
  if (!precise) {
    return unwrap(result);
  }
  return result;
}
