import { SxPBTypes as SxPB } from "./types.js";

// Token Types
enum TokenType {
  LPAREN,
  RPAREN,
  STRING,
  NUMBER,
  BOOLEAN,
  BARE,
  PLAIN,
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

  seed(value: SxPB.Value, token: Token): void {
    if (typeof value === "string") {
      this.kind = "string";
    } else if (typeof value === "boolean") {
      this.kind = "boolean";
    } else if (typeof value === "number" || typeof value === "bigint") {
      this.kind = "number";
    } else {
      throw new Error(
        `Inconsistent existing append target element types at line ${token.line}:${token.column}`
      );
    }
  }

  normalize(value: SxPB.Value, token: Token): SxPB.Value {
    if (this.kind === undefined) {
      this.seed(value, token);
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

function isMessageValue(value: SxPB.Value): value is SxPB.Mesg | SxPB.Dict {
  if (value instanceof SxPB.Dict) return true;
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function setMessageField(message: SxPB.Mesg, key: string, value: SxPB.Value): void {
  Object.defineProperty(message, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
}

class AnonymousListNormalizer {
  private kind?: "scalar" | "message";
  private scalar = new ScalarListNormalizer();

  get stringFirst(): boolean {
    return this.kind === "scalar" && this.scalar.stringFirst;
  }

  seed(value: SxPB.Value, token: Token): void {
    this.kind = isMessageValue(value) ? "message" : "scalar";
    if (this.kind === "scalar") {
      this.scalar.seed(value, token);
    }
  }

  normalize(value: SxPB.Value, token: Token): SxPB.Value {
    const incomingKind = isMessageValue(value) ? "message" : "scalar";
    if (this.kind === undefined) {
      this.seed(value, token);
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

    const atom = this.readAtom();

    if (atom === "+true" || atom === "+false") {
      return {
        type: TokenType.BOOLEAN,
        value: atom === "+true",
        text: atom,
        line: startLine,
        column: startCol
      };
    }

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

    const isBare = /^(--[^ \t\n\v\f\r;"()]*|\.\.[^ \t\n\v\f\r;"()]*|-|\.|[-.]?[^-+.0123456789 \t\n\v\f\r;"()][^ \t\n\v\f\r;"()]*)$/.test(atom);
    return {
      type: isBare ? TokenType.BARE : TokenType.PLAIN,
      value: atom,
      text: atom,
      line: startLine,
      column: startCol
    };
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
    return token.type === TokenType.BARE ||
           token.type === TokenType.PLAIN ||
           token.type === TokenType.NUMBER ||
           token.type === TokenType.BOOLEAN;
  }

  public parse(): SxPB.Value {
    let result: SxPB.Value;
    if (this.match(TokenType.LPAREN) && this.peek(1).type === TokenType.RPAREN) {
      this.consume(TokenType.LPAREN);
      this.consume(TokenType.RPAREN);
      result = new SxPB.Dict(this.parseMessageBody());
    } else if ((this.match(TokenType.LPAREN) &&
                   this.peek(1).type === TokenType.LPAREN &&
                   this.peek(2).type === TokenType.RPAREN &&
                   this.peek(3).type === TokenType.RPAREN) ||
               this.isNestHeader()) {
      result = this.parseArrayBodyOrManyOfBody();
    } else {
      result = this.parseMessageBody();
    }

    if (!this.match(TokenType.EOF)) {
      const token = this.peek();
      throw new Error(
        `Unexpected trailing token ${TokenType[token.type]} at line ${token.line}:${token.column}`
      );
    }
    return result;
  }

  private isNestHeader(): boolean {
    return this.match(TokenType.LPAREN) &&
           this.peek(1).type === TokenType.STRING &&
           this.peek(1).value === "" &&
           this.peek(2).type === TokenType.RPAREN;
  }

  private isCurrentTokenAnArrayBodyItem(): boolean {
    const token = this.peek();
    if (token.type === TokenType.STRING ||
        token.type === TokenType.NUMBER ||
        token.type === TokenType.BOOLEAN ||
        token.type === TokenType.BARE) {
      return true;
    }

    if (token.type !== TokenType.LPAREN) {
      return false;
    }
    if (this.peek(1).type === TokenType.RPAREN) {
      return true;
    }
    if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
      return true;
    }
    return this.peek(1).type === TokenType.LPAREN &&
           this.peek(2).type === TokenType.RPAREN;
  }

  private parseArrayBodyOrManyOfBody(): SxPB.List | SxPB.Many | SxPB.Nest {
    if (this.isNestHeader()) {
      return this.parseArrayBody();
    }

    this.consumeHeader();
    if (this.match(TokenType.EOF) || this.match(TokenType.RPAREN)) {
      return new SxPB.List([]);
    }
    if (this.isCurrentTokenAnArrayBodyItem()) {
      return this.parseArrayBody();
    }
    return this.parseManyOfBodyItems();
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
      this.match(TokenType.PLAIN) ||
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
      this.match(TokenType.PLAIN) ||
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

  private parseMessageBody(): SxPB.Mesg {
    const message: SxPB.Mesg = {};
    while (!this.match(TokenType.EOF) && !this.match(TokenType.RPAREN)) {
      if (this.isAppendOperator()) {
        this.parseAppendField(message);
        continue;
      }

      const field = this.parseField();
      const key = Object.keys(field)[0];
      const val = field[key];

      if (Object.prototype.hasOwnProperty.call(message, key)) {
        throw new Error(
          `Duplicate field name '${key}'. Use explicit append syntax for list fields.`
        );
      }
      setMessageField(message, key, val);
    }
    return message;
  }

  private isAppendOperator(): boolean {
    return this.match(TokenType.LPAREN) &&
           this.peek(1).type === TokenType.LPAREN &&
           this.peek(2).type === TokenType.PLAIN &&
           this.peek(2).value === "+.";
  }

  private resolveAppendTarget(message: SxPB.Mesg, path: string[], operator: Token): SxPB.List | SxPB.Many {
    let current: SxPB.Value = message;
    for (const key of path) {
      if (!isMessageValue(current)) {
        throw new Error(
          `Expected message or dict in append operation keypath at line ${operator.line}:${operator.column}`
        );
      }
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        throw new Error(`Unknown append target at line ${operator.line}:${operator.column}`);
      }
      current = current[key];
    }

    if (current instanceof SxPB.List || current instanceof SxPB.Many) {
      return current;
    }
    throw new Error(
      `Expected append target to be an array or manyof at line ${operator.line}:${operator.column}`
    );
  }

  private parseAppendField(message: SxPB.Mesg): void {
    this.consume(TokenType.LPAREN);
    this.consume(TokenType.LPAREN);
    const operator = this.consume(TokenType.PLAIN);

    const path: string[] = [];
    while (!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const name = this.parseFieldName();
      if (name.length === 0) {
        throw new Error(
          `Expected a nonempty field name in the append keypath at line ${operator.line}:${operator.column}`
        );
      }
      path.push(name);
    }
    if (path.length === 0) {
      throw new Error(
        `Expected a field name in the append keypath at line ${operator.line}:${operator.column}`
      );
    }
    this.consume(TokenType.RPAREN);

    const target = this.resolveAppendTarget(message, path, operator);
    if (!(this.match(TokenType.LPAREN) &&
          this.peek(1).type === TokenType.LPAREN &&
          this.peek(2).type === TokenType.RPAREN &&
          this.peek(3).type === TokenType.RPAREN)) {
      const token = this.peek();
      throw new Error(
        `Expected (()) discriminator before append elements at line ${token.line}:${token.column}`
      );
    }
    this.consumeHeader();

    let staged: SxPB.Value[];
    if (target instanceof SxPB.Many) {
      const normalizer = new AnonymousListNormalizer();
      for (let i = target.value.length - 1; i >= 0; i--) {
        const element = target.value[i];
        if (!(element instanceof SxPB.Lone)) continue;
        const entries = Object.entries(element.value);
        if (entries.length === 1 && entries[0][0] === "") {
          normalizer.seed(entries[0][1], operator);
          break;
        }
      }
      staged = this.parseManyOfBodyItems(normalizer).value;
    } else {
      const seed = target.length > 0 ? target[0] : undefined;
      const parsed = this.parseArrayBody(seed, false);
      if (!(parsed instanceof SxPB.List)) {
        throw new Error(
          `Expected append elements for an array at line ${operator.line}:${operator.column}`
        );
      }
      staged = parsed;
    }

    // Validate the complete operation, including its closing delimiter, before
    // mutating the already-parsed target collection.
    this.consume(TokenType.RPAREN);
    const destination = target instanceof SxPB.Many ? target.value : target;
    for (const item of staged) {
      destination.push(item);
    }
  }

  private parseField(): SxPB.Mesg {
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

        let value: SxPB.Value;
        if (this.match(TokenType.RPAREN)) {
          // Valueless loneof header: the value is an empty message.
          value = {};
        } else {
          value = this.parseValue();
        }
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
      return new SxPB.Dict(this.parseMessageBody());
    }

    if (this.match(TokenType.LPAREN)) {
      return this.parseMessageBody();
    }

    return this.parseScalar();
  }

  private parseManyOfBodyItems(
    normalizer: AnonymousListNormalizer = new AnonymousListNormalizer()
  ): SxPB.Many {
    const items: SxPB.Value[] = [];

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
          if (this.peek(3).type === TokenType.RPAREN) {
            throw new Error(
              `Unexpected list discriminator as manyof element at line ${token.line}:${token.column}`
            );
          }
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.LPAREN);
          this.consume(TokenType.RPAREN);
          const message = this.parseMessageBody();
          this.consume(TokenType.RPAREN);
          items.push(new SxPB.Lone({ "": normalizer.normalize(message, token) }));
          continue;
        }

        if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          if (this.peek(2).type === TokenType.RPAREN) {
            throw new Error(
              `Unexpected nest discriminator as manyof element at line ${token.line}:${token.column}`
            );
          }
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

      if (token.type === TokenType.PLAIN && !normalizer.stringFirst) {
        throw new Error(
          `A bare word cannot begin with a reserved prefix at line ${token.line}:${token.column}`
        );
      }
      if (token.type === TokenType.NUMBER ||
          token.type === TokenType.BOOLEAN ||
          token.type === TokenType.STRING ||
          token.type === TokenType.BARE ||
          token.type === TokenType.PLAIN) {
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
    if (this.match(TokenType.RPAREN)) {
      throw new Error("Nest can only hold nests and strings.");
    }
    const items: SxPB.Value[] = [];
    let hasExplicitNestDiscriminator = false;
    while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
      const t = this.peek();
      if (t.type === TokenType.LPAREN) {
        // Check for an anonymous discriminated string `("" ...)` or empty anonymous nest `("")`.
        if (this.peek(1).type === TokenType.STRING && this.peek(1).value === "") {
          if (this.peek(2).type === TokenType.RPAREN) {
            // `("")` immediately after the key starts the nested nest body.
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING);
            this.consume(TokenType.RPAREN);
            if (items.length === 0) {
              // `(("") ...)` is an anonymous nested nest.
              items.push("");
            } else if (items.length === 1 && !hasExplicitNestDiscriminator) {
              // `(key ("") ...)` explicitly discriminates the named subnest.
              hasExplicitNestDiscriminator = true;
            } else {
              throw new Error(
                `Unexpected nest discriminator at line ${t.line}:${t.column}`
              );
            }
          } else if (this.isPureAnonymousString(2)) {
            if (items.length === 0) {
              throw new Error("Nest can only hold nests and strings.");
            }
            // `("" ...)` -> Anonymous Discriminated String
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.STRING);
            items.push(this.parseAnonymousDiscriminatedStringBody());
            this.consume(TokenType.RPAREN);
          } else {
            items.push(this.parseGenericList());
          }
        } else {
          if (items.length === 0) {
            throw new Error("Expected a subnest name, not a nested collection.");
          }
          items.push(this.parseGenericList());
        }
      } else if (t.type === TokenType.STRING && t.value === "") {
        this.consume();
        if (hasExplicitNestDiscriminator) {
          // Bare `""` is one item in an explicitly discriminated nest body.
          items.push("");
        } else {
          // `(key "" words...)` is one discriminated string.
          items.push(this.parseAnonymousDiscriminatedStringBody());
        }
      } else if (t.type === TokenType.STRING ||
                 t.type === TokenType.BARE ||
                 t.type === TokenType.PLAIN ||
                 t.type === TokenType.NUMBER ||
                 t.type === TokenType.BOOLEAN) {
        if (items.length === 0 &&
            t.type !== TokenType.STRING &&
            this.hasSpecialSubnestPrefix(String(t.text ?? t.value))) {
          throw new Error(`Unexpected special prefix of plain subnest name '${t.value}'`);
        }
        const atomToken = this.consume();
        items.push(atomToken.text ?? String(atomToken.value));
      } else {
        throw new Error(`Unexpected token in generic list: ${TokenType[t.type]}`);
      }
    }
    this.consume(TokenType.RPAREN);
    return new SxPB.List(items);
  }

  private hasSpecialSubnestPrefix(name: string): boolean {
    if (name.startsWith("+")) return true;
    if (!name.startsWith("-") && !name.startsWith(".")) return false;
    if (name.length === 1 || name[1] === name[0]) return false;
    return name[1] === "+" || name[1] === "-" || name[1] === ".";
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

  private parseArrayBody(
    seedValue?: SxPB.Value,
    allowLeadingHeader: boolean = true
  ): SxPB.List | SxPB.Nest {
    if (allowLeadingHeader &&
        this.match(TokenType.LPAREN) &&
        this.peek(1).type === TokenType.LPAREN &&
        this.peek(2).type === TokenType.RPAREN &&
        this.peek(3).type === TokenType.RPAREN) {
      this.consumeHeader();
    }

    const items: SxPB.Value[] = [];
    const scalarNormalizer = new ScalarListNormalizer();
    let arrayKind: "scalar" | "message" | undefined;
    let isNest = false;

    if (seedValue !== undefined) {
      if (isMessageValue(seedValue)) {
        arrayKind = "message";
      } else {
        arrayKind = "scalar";
        scalarNormalizer.seed(seedValue, this.peek());
      }
    }

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

        if (this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) {
          if (isNest) {
            throw new Error("Nest can only hold nests and strings.");
          }
          throw new Error(
            `Unexpected list discriminator as array element at line ${t.line}:${t.column}`
          );
        }

        if (this.peek(1).type === TokenType.RPAREN) {
          if (isNest) {
            throw new Error("Nest can only hold nests and strings.");
          }
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
            if (isNest) {
              throw new Error("Nest can only hold nests and strings.");
            }
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
          if (isNest) {
            throw new Error("Nest can only hold nests and strings.");
          }
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
        const token = this.consume();
        item = isNest ? (token.text ?? String(token.value)) : token.value;
      } else if (t.type === TokenType.BOOLEAN) {
        const token = this.consume();
        item = isNest ? (token.text ?? String(token.value)) : token.value;
      } else if (t.type === TokenType.STRING || t.type === TokenType.BARE) {
        item = String(this.consume().value);
      } else if (t.type === TokenType.PLAIN) {
        if (!isNest && !scalarNormalizer.stringFirst) {
          throw new Error(
            `A bare word cannot begin with a reserved prefix at line ${t.line}:${t.column}`
          );
        }
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
        if (arr.length === 0) {
          throw new Error("Nest can only hold nests and strings.");
        }
        const key = String(arr[0]); // Force key to string
        const subItems = arr.slice(1);
        nestItems.push({ [key]: this.listToNest(subItems) });
      } else {
        throw new Error("Nest can only hold nests and strings.");
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
  if (isMessageValue(value)) {
    const newDict: SxPB.Mesg = {};
    for (const k of Object.keys(value)) {
      setMessageField(newDict, k, unwrap(value[k]));
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
