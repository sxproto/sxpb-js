import { SxpbLone, SxpbMany, SxpbValue, SxpbDict, SxpbList } from './types';

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
    value: string | number | boolean;
    line: number;
    column: number;
}

class Lexer {
    private input: string;
    private pos: number = 0;
    private line: number = 1;
    private col: number = 1;

    constructor(input: string) {
        this.input = input;
    }

    private peek(): string {
        return this.pos < this.input.length ? this.input[this.pos] : '';
    }

    private advance(): string {
        const char = this.peek();
        if (char === '\n') {
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
            if (char === '') break;

            if (this.isWhitespace(char)) {
                this.advance();
            } else if (char === ';') {
                while (this.peek() !== '\n' && this.peek() !== '') {
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
            return { type: TokenType.EOF, value: '', line: this.line, column: this.col };
        }

        const startLine = this.line;
        const startCol = this.col;
        const char = this.peek();

        if (char === '(') {
            this.advance();
            return { type: TokenType.LPAREN, value: '(', line: startLine, column: startCol };
        }

        if (char === ')') {
            this.advance();
            return { type: TokenType.RPAREN, value: ')', line: startLine, column: startCol };
        }

        if (char === '"') {
            return this.readString();
        }

        // Try to match boolean
        if (this.input.startsWith('+true', this.pos)) {
             this.pos += 5; this.col += 5;
             return { type: TokenType.BOOLEAN, value: true, line: startLine, column: startCol };
        }
        if (this.input.startsWith('+false', this.pos)) {
             this.pos += 6; this.col += 6;
             return { type: TokenType.BOOLEAN, value: false, line: startLine, column: startCol };
        }

        const atom = this.readAtom();

        // Check if atom matches number regex completely
        if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(atom)) {
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
            let val = '';
            while (this.pos < this.input.length && !this.input.startsWith('"""', this.pos)) {
                val += this.advance();
            }
            if (this.input.startsWith('"""', this.pos)) {
                this.pos += 3; this.col += 3;
            }

            if (val.startsWith('\\\n')) {
                val = val.substring(2);
            } else if (val.startsWith('\n')) {
                val = val.substring(1);
            }

            val = this.dedent(val);
            val = val.replace(/\\"/g, '"');
            return { type: TokenType.STRING, value: val, line: startLine, column: startCol };
        }

        this.advance(); // consume "
        let val = '';
        while (this.pos < this.input.length) {
            const c = this.peek();
            if (c === '"') {
                this.advance();
                break;
            }
            if (c === '\\') {
                this.advance();
                const escaped = this.advance();
                if (escaped === 'n') val += '\n';
                else if (escaped === 'r') val += '\r';
                else if (escaped === 't') val += '\t';
                else if (escaped === '"') val += '"';
                else if (escaped === '\\') val += '\\';
                else val += escaped;
            } else {
                val += this.advance();
            }
        }
        return { type: TokenType.STRING, value: val, line: startLine, column: startCol };
    }

    private dedent(text: string): string {
        const lines = text.split('\n');
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
             return line.startsWith(' '.repeat(minIndent)) ? line.substring(minIndent) : line;
        }).join('\n');
    }

    private readAtom(): string {
        let val = '';
        while (this.pos < this.input.length) {
            const c = this.peek();
            if (this.isWhitespace(c) || c === '(' || c === ')' || c === ';' || c === '"') {
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

    constructor(input: string) {
        const lexer = new Lexer(input);
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

    public parse(): SxpbValue {
        if (this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) {

            // Disambiguate array_body vs manyof_body (if top level could be either?)
            // But top level usually message_body or array_body.
            // If it starts with `(())`, it is array_body or manyof_body.
            // For top level, `manyof_body` is also just a list of fields?
            // Actually `manyof_body` is used inside `manyof_field`.
            // Top level is `start`.
            // `start: message_body | array_body | manyof_body`.

            // If we have `(())` at start:
            // Check items.
            return this.parseArrayBodyOrManyOfBody();

        } else {
            return this.parseMessageBody();
        }
    }

    private parseArrayBodyOrManyOfBody(): SxpbList | SxpbMany {
        // Assume we are at `(())`
        // Lookahead to decide.
        // If next tokens are scalars -> array_body.
        // If next tokens are `( ()` or `()` -> array_body (list of messages).
        // If next tokens are `( name` -> manyof_body (list of fields).
        // If EOF/Empty -> array_body (default to empty list).

        const t4 = this.peek(4); // Token after `(())`

        if (t4.type === TokenType.EOF) {
             this.consumeHeader();
             return [];
        }

        if (t4.type === TokenType.STRING || t4.type === TokenType.NUMBER || t4.type === TokenType.BOOLEAN || t4.type === TokenType.BARE) {
             return this.parseArrayBody();
        }

        if (t4.type === TokenType.LPAREN) {
             const t5 = this.peek(5);
             if (t5.type === TokenType.RPAREN) {
                 // `()` -> empty message -> array_body
                 return this.parseArrayBody();
             }
             if (t5.type === TokenType.LPAREN) {
                 // `( (` -> `( ()`?
                 const t6 = this.peek(6);
                 if (t6.type === TokenType.RPAREN) {
                     // `( () ...` -> array_body
                     return this.parseArrayBody();
                 }
                 // `( (name) ...` -> manyof_field variant?
                 // `( (key subkey) ...` -> loneof_field?
                 // If it is `( ( ... )` it could be `any_field` (loneof/manyof variant).
                 // It could also be `unnamed_message_field` which starts with `( ()`.
                 // If t6 is NOT RPAREN, e.g. `( (key` -> loneof -> manyof_body.

                 // So if `( ()`, it is array_body.
                 // If `( (not_rparen` -> manyof_body.
                 return this.parseManyOfBody();
             }

             // `( name ...` -> manyof_body
             return this.parseManyOfBody();
        }

        // Default to array_body if unsure?
        return this.parseArrayBody();
    }

    private consumeHeader() {
        this.consume(TokenType.LPAREN);
        this.consume(TokenType.LPAREN);
        this.consume(TokenType.RPAREN);
        this.consume(TokenType.RPAREN);
    }

    private parseScalar(): SxpbValue {
        const t = this.consume();
        if (t.type === TokenType.NUMBER || t.type === TokenType.BOOLEAN || t.type === TokenType.STRING) {
            return t.value;
        }
        if (t.type === TokenType.BARE) {
            return String(t.value);
        }
        throw new Error(`Expected scalar, got ${TokenType[t.type]}`);
    }

    private parseMessageBody(): SxpbDict {
        const message: SxpbDict = {};
        while (!this.match(TokenType.EOF) && !this.match(TokenType.RPAREN)) {
            const field = this.parseField();
            const key = Object.keys(field)[0];
            const val = field[key];

            if (key in message) {
                const existing = message[key];

                // If existing is already a LIST OF ITEMS (meaning we already encountered repetition)
                // We just append to it.
                // But wait, how do we distinguish `[item1, item2]` (repetition) from `[item1, item2]` (single list value)?
                // Reviewer said: merging list should not flatten.
                // If I have `(k (()) 1 2)`. Val is `SxpbList([1, 2])`.
                // `message[k] = SxpbList([1, 2])`.
                // Next `(k (()) 3 4)`. Val is `SxpbList([3, 4])`.
                // Existing is `SxpbList([1, 2])`.
                // If we treat existing as the "container for repeated values".
                // We should append `val` to it? `[1, 2, [3, 4]]`? No.

                // We need to upgrade `existing` to a container if it's not one?
                // But `SxpbList` IS a container (of values 1, 2).
                // If we want `[[1, 2], [3, 4]]`.
                // Then `existing` must become `[[1, 2]]`.
                // And then we push `[3, 4]`.

                // But `message[k]` was just `SxpbList([1, 2])`.
                // We can't know if it's "final" or "part of repeated".

                // So when repetition occurs:
                // If existing is `SxpbList` (from array body).
                // And val is `SxpbList`.
                // We create a NEW list (native array?) `[existing, val]`.
                // `message[k] = [existing, val]`.

                // What if existing is ALREADY a native array (repetition container)?
                // `message[k]` is `[[1, 2], [3, 4]]`.
                // Next `(k (()) 5 6)`. Val `SxpbList([5, 6])`.
                // We should push to existing.

                // So we need to distinguish `SxpbList` (single value) from `Array` (repetition container).
                // I introduced `SxpbList` class for this.

                if (Array.isArray(existing) && !(existing instanceof SxpbList) && !(existing instanceof SxpbMany) && !(existing instanceof SxpbLone)) {
                    // It is a NATIVE array (repetition container)
                    // Just push.
                    (message[key] as Array<SxpbValue>).push(val);
                } else {
                    // It is SxpbList or SxpbMany or Scalar or Dict.
                    // It is a single value.
                    // Create repetition container.
                    message[key] = [existing, val];
                }
            } else {
                message[key] = val;
            }
        }
        return message;
    }

    private parseField(): SxpbDict {
        this.consume(TokenType.LPAREN);

        if (this.match(TokenType.LPAREN)) {
            // loneof or manyof variant
            this.consume(TokenType.LPAREN);
            const name1 = this.parseFieldName();

            if (this.match(TokenType.RPAREN)) {
                // `( (name) ... )` -> manyof_field
                this.consume(TokenType.RPAREN);
                const items: SxpbValue[] = [];
                while (!this.match(TokenType.RPAREN)) {
                    if (this.match(TokenType.LPAREN)) {
                         const f = this.parseField();
                         items.push(new SxpbLone(f));
                    } else {
                         const s = this.parseScalar();
                         items.push(new SxpbLone({ value: s }));
                    }
                }
                this.consume(TokenType.RPAREN);
                return { [name1]: new SxpbMany(items) };
            } else {
                // `( (key subkey) ... )` -> loneof_field
                const subkey = this.parseFieldName();
                this.consume(TokenType.RPAREN);
                const value = this.parseValue();
                this.consume(TokenType.RPAREN);
                return { [name1]: new SxpbLone({ [subkey]: value }) };
            }
        } else {
             // `( name ... )`
             const name = this.parseFieldName();

             // Check for `(())` to detect manyof_field
             if (this.match(TokenType.LPAREN) &&
                 this.peek(1).type === TokenType.LPAREN &&
                 this.peek(2).type === TokenType.RPAREN &&
                 this.peek(3).type === TokenType.RPAREN) {

                 // Ambiguity: `( name (()) ... )`.
                 // Could be `manyof_field` or `regular_field` with `array_body`.
                 // Use `parseArrayBodyOrManyOfBody` logic to check items.

                 const body = this.parseArrayBodyOrManyOfBody();

                 // If body is SxpbMany, it was manyof_body.
                 // If body is SxpbList, it was array_body.
                 // But parseArrayBodyOrManyOfBody returns List or Many.
                 // Wait, `manyof_field` MUST have `SxpbMany` value.
                 // `regular_field` with `array_body` MUST have `SxpbList` value.
                 // So we can just trust the return type?
                 // But my `parseArrayBody` returns `SxpbList`.
                 // `parseManyOfBody` returns `SxpbMany`.
                 // So yes.

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
        throw new Error(`Expected field name, got ${TokenType[t.type]}`);
    }

    private parseValue(): SxpbValue {
        if (this.match(TokenType.LPAREN) &&
            this.peek(1).type === TokenType.LPAREN &&
            this.peek(2).type === TokenType.RPAREN &&
            this.peek(3).type === TokenType.RPAREN) {
             // It's `(())`. Use disambiguation.
             return this.parseArrayBodyOrManyOfBody();
        }

        if (this.match(TokenType.LPAREN)) {
             return this.parseMessageBody();
        }

        return this.parseScalar();
    }

    private parseManyOfBody(): SxpbMany {
        this.consumeHeader();
        return this.parseManyOfBodyItems();
    }

    private parseManyOfBodyItems(): SxpbMany {
        const items: SxpbValue[] = [];
        while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
             const f = this.parseField();
             items.push(new SxpbLone(f));
        }
        return new SxpbMany(items);
    }

    private parseArrayBody(): SxpbList {
        this.consumeHeader();
        const items: SxpbValue[] = [];

        if (this.match(TokenType.STRING) || this.match(TokenType.NUMBER) || this.match(TokenType.BOOLEAN) || this.match(TokenType.BARE)) {
             while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
                 items.push(this.parseScalar());
             }
        } else {
             while(!this.match(TokenType.RPAREN) && !this.match(TokenType.EOF)) {
                 if (this.match(TokenType.LPAREN)) {
                     this.consume(TokenType.LPAREN);
                     if (this.match(TokenType.RPAREN)) {
                         this.consume(TokenType.RPAREN);
                         items.push({});
                     } else if (this.match(TokenType.LPAREN) && this.peek(1).type === TokenType.RPAREN) {
                         this.consume(TokenType.LPAREN);
                         this.consume(TokenType.RPAREN);
                         const msg = this.parseMessageBody();
                         this.consume(TokenType.RPAREN);
                         items.push(msg);
                     } else {
                         throw new Error("Invalid unnamed message field");
                     }
                 } else {
                      throw new Error("Invalid array body item");
                 }
             }
        }
        return new SxpbList(items);
    }
}

export function loads(text: string): SxpbValue {
    const parser = new Parser(text);
    return parser.parse();
}
