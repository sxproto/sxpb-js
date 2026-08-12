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
  text?: string;
  line: number;
  column: number;
}

type ScalarListKind = "string" | "number" | "boolean";

class ScalarListNormalizer {
  private kind?: ScalarListKind;

  get stringFirst(): boolean {
    return this.kind === "string";
  }

  normalize(value: SxPB.Value, token: Token): SxPB.Value {
    if (this.kind === undefined) {
      if (typeof value === "string") {
        this.kind = "string";
      } else if (typeof value === "boolean") {
        this.kind = "boolean";
      } else {
        this.kind = "number";
      }
    }

    if (this.kind === "string") {
      if (token.type === TokenType.NUMBER || token.type === TokenType.BOOLEAN) {
        return token.text ?? String(token.value);
      }
      if (typeof value === "string") {
        return value;
      }
      throw new Error(`Unexpected literal type at line ${token.line}:${token.column}`);
    }

    if (this.kind === "number") {
      if (typeof value === "number" || typeof value === "bigint") {
        return value;
      }
      throw new Error(`Unexpected literal type at line ${token.line}:${token.column}`);
    }

    if (typeof value === "boolean") {
      return value;
    }
    if ((typeof value === "number" || typeof value === "bigint") &&
        token.text !== undefined &&
        /^\+?\d+$/.test(token.text) &&
        (value === 0 || value === 1 || value === 0n || value === 1n)) {
      return value === 1 || value === 1n;
    }
    throw new Error(`Expected a bool, not another literal at line ${token.line}:${token.column}`);
  }
}

function isMessageValue(value: SxPB.Value): value is SxPB.Dict {
  return value !== null &&
         typeof value === "object" &&
         value.constructor === Object;
}

class AnonymousListNormalizer {
  private kind?: "scalar" | "message";
  private scalar = new ScalarListNormalizer();

  get stringFirst(): boolean {
    return this.kind === "scalar" && this.scalar.stringFirst;
  }

  normalize(value: SxPB.Value, token: Token): SxPB.Value {
    const incomingKind = isMessageValue(value) ? "message" : "scalar";
    if (this.kind === undefined) {
      this.kind = incomingKind;
    } else if (this.kind !== incomingKind) {
      throw new Error(`Incompatible anonymous manyof element at line ${token.line}:${token.column}`);
    }

    if (incomingKind === "message") {
      return value;
    }
    return this.scalar.normalize(value, token);
  }
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
      return { type: TokenType.BOOLEAN, value: true, text: "+true", line: startLine, column: startCol };
    }
    if (this.input.startsWith("+false", this.pos)) {
      this.pos += 6; this.col += 6;
      return { type: TokenType.BOOLEAN, value: false, text: "+false", line: startLine, column: startCol };
    }

    const atom = this.readAtom();

    // Check if atom matches number regex completely
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(atom)) {
      if (this.precise && /^[+-]?\d+$/.test(atom)) {
        // Check if it's an integer
        const bigIntVal = BigInt(atom);
        if (bigIntVal >= Number.MIN_SAFE_INTEGER && bigIntVal <= Number.MAX_SAFE_INTEGER) {
          return { type: TokenType.NUMBER, value: Number(bigIntVal), text: atom, line: startLine, column: startCol };
        } else {
          return { type: TokenType.NUMBER, value: bigIntVal, text: atom, line: startLine, column: startCol };
        }
      }
      const num = parseFloat(atom);
      return { type: TokenType.NUMBER, value: num, text: atom, line: startLine, column: startCol };
    }

    return { type: TokenType.BARE, value: atom, text: atom, line: startLine, column: startCol };
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
  private precise: boolean;

  constructor(input: string, precise: boolean = false) {
    this.precise = precise;
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
    if (this.match(TokenType.LPAREN) && this.peek(1).type === TokenType.RPAREN) {
      this.consume(TokenType.LPAREN);
      this.consume(TokenType.RPAREN);
      return this.parseMessageBody();
    }

    if ((this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) ||
        this.isNestHeader()) {

      return this.parseArrayBodyOrManyOfBody();

    } else {
      return this.parseMessageBody();
    }
  }

  private isNestHeader(): boolean {
    return this.match(TokenType.LPAREN) &&
           this.peek(1).type === TokenType.STRING &&
           this.peek(1).value === "" &&
           this.peek(2).type === TokenType.RPAREN;
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

  private parseArrayBodyOrManyOfBody(): SxPB.List | SxPB.Many | SxPB.Nest {
    if (this.peek(4).type === TokenType.EOF ||
        this.peek(4).type === TokenType.RPAREN) {
      this.consumeHeader();
      return new SxPB.List([]);
    }

    if (this.isNestHeader()) {
      return this.parseArrayBody();
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
      if (t.type === TokenType.STRING) {
        valStr = String(t.value);
      } else if (t.text !== undefined) {
        valStr = t.text;
      } else if (t.type === TokenType.BOOLEAN) {
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
      if (t.type === TokenType.STRING) {
        valStr = String(t.value);
      } else if (t.text !== undefined) {
        valStr = t.text;
      } else if (t.type === TokenType.BOOLEAN) {
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

        if (existing instanceof SxPB.List && val instanceof SxPB.List) {
          existing.push(...val);
        } else if (isNativeArray) {
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
        const many = this.parseManyOfBodyItems();
        this.consume(TokenType.RPAREN);
        return { [name1]: many };
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

      if (this.match(TokenType.RPAREN)) {
        this.consume(TokenType.RPAREN);
        return { [name]: {} };
      }

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
        if (this.match(TokenType.RPAREN)) {
          this.consume(TokenType.RPAREN);
          return { [name]: {} };
        }

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
    if ((this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) ||
        this.isNestHeader()) {
      // It's `(())` or `("")`
      return this.parseArrayBodyOrManyOfBody();
    }

    if (this.match(TokenType.LPAREN) && this.peek(1).type === TokenType.RPAREN) {
      // Dict discriminator: `()`, followed by message-body fields.
      this.consume(TokenType.LPAREN);
      this.consume(TokenType.RPAREN);
      return this.parseMessageBody();
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
    const normalizer = new AnonymousListNormalizer();

    while (!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const token = this.peek();

      if (token.type === TokenType.LPAREN) {
        if (this.peek(1).type === TokenType.RPAREN) {
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.RPAREN);
          items.push(new SxPB.Lone({ "": normalizer.normalize({}, token) }));
          continue;
        }

        if (this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN) {
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.RPAREN);
          const message = this.parseMessageBody();
          this.consume(TokenType.RPAREN);
          items.push(new SxPB.Lone({ "": normalizer.normalize(message, token) }));
          continue;
        }

        if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.STRING);
          const value = this.parseAnonymousDiscriminatedStringBody();
          this.consume(TokenType.RPAREN);
          items.push(new SxPB.Lone({ "": normalizer.normalize(value, token) }));
          continue;
        }

        items.push(new SxPB.Lone(this.parseField()));
        continue;
      }

      if (token.type === TokenType.NUMBER ||
          token.type === TokenType.BOOLEAN ||
          token.type === TokenType.STRING ||
          token.type === TokenType.BARE) {
        this.consume();
        items.push(new SxPB.Lone({ "": normalizer.normalize(token.value, token) }));
        continue;
      }

      throw new Error(`Unexpected manyof element at line ${token.line}:${token.column}`);
    }

    return new SxPB.Many(items);
  }

  private parseGenericList(): SxPB.List {
    if (this.match(TokenType.LPAREN) &&
        this.peek(1).type === TokenType.LPAREN &&
        this.peek(2).type === TokenType.RPAREN &&
        this.peek(3).type === TokenType.RPAREN) {
      throw new Error("Nest can only hold nests and strings.");
    }

    this.consume(TokenType.LPAREN);
    const items: SxPB.Value[] = [];
    while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const t = this.peek();
      if (t.type === TokenType.LPAREN) {
        // Check if it's an anonymous discriminated string `("" ...)` or empty anonymous nest `("")`.
        if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          if (this.peek(2).type === TokenType.RPAREN) {
            // `("")` -> Empty Anonymous Nest (List)
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING);
            this.consume(TokenType.RPAREN);
            items.push(new SxPB.List([]));
          } else if (this.isPureAnonymousString(2)) {
            // `("" ...)` -> Anonymous Discriminated String
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING);
            items.push(this.parseAnonymousDiscriminatedStringBody());
            this.consume(TokenType.RPAREN);
          } else {
            items.push(this.parseGenericList());
          }
        } else {
          items.push(this.parseGenericList());
        }
      } else if (t.type === TokenType.STRING && t.value === "") {
        // Anonymous discriminated string inside generic list?
        // e.g. `("" a b)`
        this.consume(); // Consume ""
        items.push(this.parseAnonymousDiscriminatedStringBody());
      } else if (t.type === TokenType.STRING || t.type === TokenType.BARE || t.type === TokenType.NUMBER || t.type === TokenType.BOOLEAN) {
        // Scalar atom
        const atomToken = this.consume();
        if (atomToken.type === TokenType.BOOLEAN) {
          items.push(atomToken.value ? "+true" : "+false");
        } else {
          items.push(String(atomToken.value));
        }
      } else {
        throw new Error(`Unexpected token in generic list: ${TokenType[t.type]}`);
      }
    }
    this.consume(TokenType.RPAREN);
    return new SxPB.List(items);
  }

  private isPureAnonymousString(offset: number): boolean {
    let i = offset;
    while (true) {
      const t = this.peek(i);
      if (t.type === TokenType.EOF) return false;
      if (t.type === TokenType.RPAREN) return true;
      if (t.type === TokenType.LPAREN) return false;
      i++;
    }
  }

  private parseArrayBody(): SxPB.List | SxPB.Nest {
    if (this.match(TokenType.LPAREN) &&
        this.peek(1).type === TokenType.LPAREN &&
        this.peek(2).type === TokenType.RPAREN &&
        this.peek(3).type === TokenType.RPAREN) {
      this.consumeHeader();
    }

    const items: SxPB.Value[] = [];
    const scalarNormalizer = new ScalarListNormalizer();
    let arrayKind: "scalar" | "message" | undefined;
    let isNest = false;

    // Parse items individually
    while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const t = this.peek();
      let item: SxPB.Value | undefined;
      let fromDiscriminatedEmptyString = false;

      // Special handling for Nest items: they can be generic lists `( ... )`.
      // But standard array body items must be `(() ...)` or `()`.
      // If we are in a Nest (`isNest` is true), we allow generic lists.
      // `isNest` is set AFTER detecting `("")` (which happens in the loop for first item).
      //
      // Also, detecting `("")` happens via `LPAREN, STRING(""), ...`.

      if (t.type === TokenType.LPAREN) {
        // Could be empty message `()` or anonymous discriminated message `(() ...)` or `anonymous discriminated string` `("" ...)`
        // OR generic list if isNest is true.

        if (this.peek(1).type === TokenType.RPAREN) {
          // `()` -> empty message
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.RPAREN);
          item = {};
        } else if (isNest &&
                   this.peek(1).type === TokenType.STRING &&
                   this.peek(1).value === "" &&
                   this.peek(2).type === TokenType.LPAREN &&
                   this.peek(3).type === TokenType.STRING &&
                   this.peek(3).value === "" &&
                   this.peek(4).type === TokenType.RPAREN) {
          // `("" ("") ...)` -> anonymous nest entry.
          item = this.parseGenericList();
        } else if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          // `("" ...)` -> anonymous discriminated string OR generic list starting with "" (in Nest)

          if (this.peek(2).type === TokenType.RPAREN) {
            // `("")` -> Empty Anonymous Nest (List) OR Nest Marker (Empty String)
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING);
            this.consume(TokenType.RPAREN);

            if (items.length === 0) {
              // If it's the first item, it's the Nest Marker `""`
              item = "";
              fromDiscriminatedEmptyString = true;
            } else {
              // Otherwise it's an empty nest
              item = new SxPB.List([]);
            }
          } else if (this.isPureAnonymousString(2)) {
            // `("" ...)` -> anonymous discriminated string
            // Structure: LPAREN, STRING(""), (ESCAPED_STRING | MULTILINE_STRING | PLAIN)+, RPAREN
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING); // Consume ""

            // Special handling for anonymous discriminated string body (always space separated)
            const strBody = this.parseAnonymousDiscriminatedStringBody();

            this.consume(TokenType.RPAREN);
            item = strBody;

            if (strBody === "") {
              fromDiscriminatedEmptyString = true;
            }
          } else if (isNest) {
            // Treat as generic list
            item = this.parseGenericList();
          } else {
            throw new Error("Invalid anonymous string: contains nested items.");
          }
        } else if (this.peek(1).type === TokenType.LPAREN && this.peek(2).type === TokenType.RPAREN) {
          // `(() ...)` -> anonymous discriminated message
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LPAREN); // (
          this.consume(TokenType.RPAREN); // )
          const msg = this.parseMessageBody();
          this.consume(TokenType.RPAREN); // closing )
          item = msg;
        } else {
          // Unexpected sequence for standard array body.
          // BUT valid for Nest generic list?
          if (isNest) {
            // Treat as generic list
            item = this.parseGenericList();
          } else {
            throw new Error("Invalid array body item. Unexpected '(' sequence.");
          }
        }
      } else if (t.type === TokenType.NUMBER) {
        item = this.consume().value;
      } else if (t.type === TokenType.BOOLEAN) {
        item = this.consume().value;
      } else if (t.type === TokenType.STRING || t.type === TokenType.BARE) {
        item = String(this.consume().value);
      } else {
        throw new Error(`Invalid array body item type: ${TokenType[t.type]}`);
      }

      // Check for Nest marker
      if (items.length === 0 && fromDiscriminatedEmptyString) {
        isNest = true;
        // Do NOT add the marker to items
        continue;
      }

      if (item !== undefined) {
        if (isNest) {
          items.push(item);
          continue;
        }

        if (isMessageValue(item)) {
          if (arrayKind === "scalar") {
            throw new Error(`Unexpected message array element at line ${t.line}:${t.column}`);
          }
          arrayKind = "message";
          items.push(item);
        } else {
          if (arrayKind === "message") {
            throw new Error(`Unexpected literal type at line ${t.line}:${t.column}`);
          }
          arrayKind = "scalar";
          items.push(scalarNormalizer.normalize(item, t));
        }
      }
    }

    if (isNest) {
      return this.listToNest(items);
    }

    return new SxPB.List(items);
  }

  private listToNest(items: SxPB.Value[]): SxPB.Nest {
    const nestItems: SxPB.NestItem[] = [];

    for (const item of items) {
      if (typeof item === "string") {
        nestItems.push(item);
      } else if (item instanceof SxPB.List || Array.isArray(item)) {
        // [Key, ...SubItems]
        const arr = Array.isArray(item) ? item : (item as SxPB.List).toList();
        if (arr.length > 0) {
          const key = String(arr[0]); // Force key to string
          const subItems = arr.slice(1);
          nestItems.push({ [key]: this.listToNest(subItems) });
        }
      } else {
        // Treat numbers and booleans as string keys.
        if (typeof item === "number" || typeof item === "boolean") {
          nestItems.push(String(item));
        }
        // Ignore unexpected Dict/Message items in Nest list.
        // Note: `()` is parsed as an empty Dict `{}` by parseArrayBody, so it falls here and is ignored.
      }
    }

    return new SxPB.Nest(nestItems);
  }
}

function unwrap(value: SxPB.Value): SxPB.Value {
  if (value instanceof SxPB.Nest) {
    // Unwrap SxPB.Nest to native Array
    return Array.from(value).map((item: SxPB.NestItem) => {
      if (typeof item === "string") {
        return item;
      } else {
        const key = Object.keys(item)[0];
        const val = item[key];
        return { [key]: unwrap(val) };
      }
    });
  }
  if (value instanceof SxPB.List) {
    return Array.from(value).map(unwrap);
  }
  if (value instanceof SxPB.Many) {
    return value.value.map(unwrap);
  }
  if (value instanceof SxPB.Lone) {
    return unwrap(value.toDict());
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
