import { SxpbList, SxpbLone, SxpbMany, type SxpbValue } from "../src/index.js";

const list = (...items: SxpbValue[]) => new SxpbList(items);
const lone = (key: string, value: SxpbValue) => new SxpbLone({ [key]: value });
const many = (...items: SxpbLone[]) => new SxpbMany(items);

export const acceptedAppendCases: [string, SxpbValue][] = [
  [
    "(m (a (()) 1 2 3))((+. m a) (()) 4 5 6)",
    { m: { a: list(1, 2, 3, 4, 5, 6) } }
  ],
  [
    "(outer (m (a (()) 1)) ((+. m a) (()) 2))",
    { outer: { m: { a: list(1, 2) } } }
  ],
  [
    "(outer (d () (entry (a (()) 1))) ((+. d entry a) (()) 2))",
    { outer: { d: { entry: { a: list(1, 2) } } } }
  ],
  [
    "(a (()) one)((+. a) (()) 02 +true)",
    { a: list("one", "02", "+true") }
  ],
  [
    "(a (()) +true)((+. a) (()) 00 +01 +false)",
    { a: list(true, false, true, false) }
  ],
  [
    "(a (()) (() (x 1)))((+. a) (()) () (() (x 2)))",
    { a: list({ x: 1 }, {}, { x: 2 }) }
  ],
  [
    "(messages (()) (() (a (()) 1) ((+. a) (()) 2)))",
    { messages: list({ a: list(1, 2) }) }
  ],
  [
    "(a (()))((+. a) (()) 1 2)((+. a) (()) 3)",
    { a: list(1, 2, 3) }
  ],
  [
    "(a (()) 1 2)((+. a) (()))",
    { a: list(1, 2) }
  ],
  [
    '("m m" ("a a" (()) 1))((+. "m m" "a a") (()) 2)',
    { "m m": { "a a": list(1, 2) } }
  ],
  [
    "((m) (a 1) (b 2))((+. m) (()) (c 3) 4 5)",
    { m: many(lone("a", 1), lone("b", 2), lone("c", 3), lone("", 4), lone("", 5)) }
  ],
  [
    "((m))((+. m) (()) (named 1) one 02 +true)",
    { m: many(lone("named", 1), lone("", "one"), lone("", "02"), lone("", "+true")) }
  ],
  [
    "((m) (named 1))((+. m) (()) () (other 2) (() (x 3)))",
    { m: many(lone("named", 1), lone("", {}), lone("other", 2), lone("", { x: 3 })) }
  ],
  [
    "(outer ((m) (named 1)) ((+. m) (()) 2 3))",
    { outer: { m: many(lone("named", 1), lone("", 2), lone("", 3)) } }
  ]
];

export const rejectedAppendCases = [
  "(a (()) 1)(a (()) 2)",
  "((m) (a 1))((m) (b 2))",
  "(x 1)(x 2)",
  "(m (a (()) 1))((+. m missing) (()) 2)",
  "((+. missing) (()) 1)",
  "((+. later) (()) 1)(later (()))",
  "(m (x 1))((+. m x) (()) 2)",
  "(m (x 1))((+. m) (()) 2)",
  "(d () (x 1))((+. d) (()) 2)",
  "((choice option) 1)((+. choice) (()) 2)",
  "(m (x 1))((+. m x y) (()) 2)",
  "(m ((x choice) 1))((+. m x y) (()) 2)",
  '(n ("") leaf)((+. n) (()) other)',
  "(m (a (()) 1))((+. m a) 2)",
  "(m (a (()) 1))((+.) (()) 2)",
  "(a (()) 1)((+. a) (()) word)",
  "(a (()) 1)((+. a) (()) +true)",
  "(a (()) ())((+. a) (()) 1)",
  "(a (()) 1)((+. a) (()) ())",
  "(a (()))((+. a) (()) (named 1))",
  "((m) 1)((+. m) (()) +true)",
  "((m) ())((+. m) (()) 1)",
  "((m))((+. m) (()) (()))"
];
