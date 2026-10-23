// A tiny TS/TSX tokenizer for the diff stream: keywords, strings, comments,
// numbers, JSX tags and punctuation. Not a parser; good enough to color code
// the way an editor would at a glance.

export type TokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'tag' | 'punct';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of',
  'in', 'while', 'switch', 'case', 'break', 'continue', 'new', 'type', 'interface', 'extends', 'implements', 'as',
  'async', 'await', 'true', 'false', 'null', 'undefined', 'typeof', 'keyof', 'readonly', 'class', 'this', 'try',
  'catch', 'finally', 'throw', 'void', 'satisfies',
]);

const PATTERNS: Array<[TokenKind | 'word', RegExp]> = [
  ['comment', /^\/\/.*/],
  ['comment', /^\/\*[\s\S]*?(\*\/|$)/],
  ['string', /^'(?:[^'\\]|\\.)*'?/],
  ['string', /^"(?:[^"\\]|\\.)*"?/],
  ['string', /^`(?:[^`\\]|\\.)*`?/],
  ['tag', /^<\/?[A-Za-z][\w.]*/],
  ['number', /^\d[\d_.]*(?:e\d+)?/],
  ['word', /^[A-Za-z_$][\w$]*/],
  ['punct', /^(?:=>|[{}()[\];,.:?=<>+\-*/%!&|^~@])/],
  ['plain', /^\s+/],
];

/** Tokenize source into lines of tokens. Block comments may span lines. */
export function tokenizeLines(source: string): Token[][] {
  const lines = source.split('\n');
  const out: Token[][] = [];
  let inBlockComment = false;

  for (const line of lines) {
    const tokens: Token[] = [];
    let rest = line;
    if (inBlockComment) {
      const end = rest.indexOf('*/');
      if (end === -1) {
        out.push([{ kind: 'comment', text: rest }]);
        continue;
      }
      tokens.push({ kind: 'comment', text: rest.slice(0, end + 2) });
      rest = rest.slice(end + 2);
      inBlockComment = false;
    }
    while (rest.length > 0) {
      let matched = false;
      for (const [kind, re] of PATTERNS) {
        const m = re.exec(rest);
        if (!m || m[0].length === 0) continue;
        const text = m[0];
        if (kind === 'word') tokens.push({ kind: KEYWORDS.has(text) ? 'keyword' : 'plain', text });
        else tokens.push({ kind, text });
        if (kind === 'comment' && text.startsWith('/*') && !text.endsWith('*/')) inBlockComment = true;
        rest = rest.slice(text.length);
        matched = true;
        break;
      }
      if (!matched) {
        tokens.push({ kind: 'plain', text: rest[0]! });
        rest = rest.slice(1);
      }
    }
    out.push(tokens);
  }
  return out;
}
