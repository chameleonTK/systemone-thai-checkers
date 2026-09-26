# PDN Type-31 Movetext and Playback

This project implements a deliberately narrow, headerless subset of Portable Draughts Notation 3.0. It uses the Thai draughts definition `GameType "31,B,8,8,N2,0"` from the [PDN GameType table](https://wiegerw.github.io/pdn/gametype.html) and follows the move-path and ambiguity requirements in the [PDN 3.0 grammar](https://wiegerw.github.io/pdn/grammar.html).

This is an interchange and review format. The engine stores structured atomic history and does not parse or serialize PDN in its move/search hot path.

## Type-31 interpretation

| Field | Meaning in this project |
| --- | --- |
| `31` | Thai draughts |
| `B` | Black is the starting side |
| `8,8` | Eight columns and eight rows |
| `N2` | Numeric notation, with square 1 at the top-left from the starting player's view; numbering proceeds horizontally |
| `0` | The bottom-left board corner is playable |
| Result type | Default: `1-0`, `0-1`, `1/2-1/2`, `0-0`, or `*` |
| Move/capture separator | `-` for type 31 |

Because type 31 uses `-` for both ordinary movement and capture paths, syntax alone does not decide whether `9-18` is quiet or capturing. The current position and `RuleValidator` decide its meaning.

## Square mapping

Rows and columns below are zero-based engine coordinates. The top row is Black's home side and Black moves toward increasing row numbers.

```text
       column
       0   1   2   3   4   5   6   7
row 0  1   .   2   .   3   .   4   .
row 1  .   5   .   6   .   7   .   8
row 2  9   .  10   .  11   .  12   .
row 3  .  13   .  14   .  15   .  16
row 4 17   .  18   .  19   .  20   .
row 5  .  21   .  22   .  23   .  24
row 6 25   .  26   .  27   .  28   .
row 7  .  29   .  30   .  31   .  32
```

For a playable coordinate:

```ts
square = row * 4 + Math.floor(column / 2) + 1;
row = Math.floor((square - 1) / 4);
column = 2 * ((square - 1) % 4) + (row % 2 === 0 ? 0 : 1);
```

`BoardGeometry` is the single implementation of this conversion. Parser, writer, snapshots, UI projection, rules fixtures, and all 32 mapping tests use it rather than duplicating formulas.

## Accepted grammar

Whitespace may occur between tokens but never inside a move path or result token.

```ebnf
Movetext    = Whitespace*, Turn, (Whitespace+, Turn)*,
              (Whitespace+, Result)?, Whitespace* ;
Turn        = MoveNumber?, Whitespace*, MovePath ;
MoveNumber  = Digit+, "." | Digit+, "..." ;
MovePath    = Square, "-", Square, ("-", Square)* ;
Square      = NonZeroDigit, Digit? ;
Result      = "1-0" | "0-1" | "1/2-1/2" | "0-0" | "*" ;
Whitespace  = " " | "\\t" | "\\r" | "\\n" ;
```

Additional semantic restrictions:

- squares are in `1..32` and have no leading zero;
- a quiet move has exactly two squares;
- a capture path describes exactly one complete player turn;
- an optional move number must immediately precede a move, not the result;
- move numbers are presentation labels and do not select the side to move; legality always follows the replay position;
- numeric labels must be positive, but import does not reject a legal record merely because labels are skipped or repeated;
- only one trailing result is allowed, and no token may follow it.

Canonical export follows common draughts scoresheets: `1.` precedes the first Black/White pair, `2.` the next pair, and so on. A three-dot token remains accepted by the PDN grammar for partial-score notation, but the headerless subset always replays from the initial Black-to-move position. Import also accepts omitted move numbers, which is the preferred compact form for this UI.

Examples:

```text
9-13 24-20 13-17 *
```

```text
1. 9-13 24-20 2. 13-17 *
```

```text
9-18-27 24-15 1/2-1/2
```

The examples illustrate syntax only; playback still rejects any path that is illegal in the position reached by prior moves.

## Explicitly rejected constructs

The parser reports these constructs rather than silently ignoring them:

| Construct | Example | Diagnostic code |
| --- | --- | --- |
| Any tag/header, including `GameType` | `[GameType "31"]` | `PDN_UNSUPPORTED_HEADER` |
| Brace or percent comment | `{note}` or `% note` | `PDN_UNSUPPORTED_COMMENT` |
| Variation | `(9-13 24-20)` | `PDN_UNSUPPORTED_VARIATION` |
| Move-strength annotation | `9-13!`, `9-13(?)` | `PDN_UNSUPPORTED_ANNOTATION` |
| Numeric annotation glyph | `$1` | `PDN_UNSUPPORTED_NAG` |
| FEN/setup command | `/FEN "..."/` | `PDN_UNSUPPORTED_SETUP` |
| Alphabetic square | `a3-b4` | `PDN_INVALID_SQUARE_FORMAT` |
| Alternate separator | `9x18` or `9:18` | `PDN_INVALID_SEPARATOR` |
| Leading zero | `09-13` | `PDN_LEADING_ZERO` |
| Multiple games/separator in the middle | `9-13 * 24-20` | `PDN_MULTIPLE_GAMES` |

A final `*` is the unfinished-game result, not permission to append a second game.

## Parsing and semantic resolution

Parsing is split into two stages so diagnostics remain precise and rules remain centralized.

### Stage 1 — lexical and syntax parsing

`PdnMovetextCodec.parse` produces `PdnTurnPath[]`, an optional `PdnResult`, and source spans. It performs no board mutation. Every token retains byte/UTF-16 offset, one-based line and column, and original text.

### Stage 2 — rule resolution

Starting from a fresh type-31 position, the resolver handles each path as follows:

1. Ask `RuleValidator.enumerateTurnPaths` for every legal complete player-turn path.
2. For a two-square imported path, filter legal paths by the same source and final destination.
3. For a path with intermediate squares, require an exact match of every atomic landing square.
4. Accept exactly one match and expand it into atomic `MoveIntent` values.
5. If no path matches, return `PDN_ILLEGAL_MOVE` at that path.
6. If multiple paths match the abbreviated source/final form, return `PDN_AMBIGUOUS_MOVE` and list the required full paths.
7. Apply the resolved atomic values to the temporary review engine before resolving the next turn.

For Thai rules, every landing after a captured piece is immediate, so a full imported path contains every atomic landing of the chain. Promotion terminates a path even if the new king would otherwise have another capture.

Resolution is transactional. The temporary review engine and parsed data are discarded on the first diagnostic, leaving the live engine and visible session unchanged.

## Canonical export

The writer consumes completed `TurnRecord` values, never UI strings:

1. Convert every atomic source/destination to squares `1..32`.
2. For a quiet turn, write `source-destination`.
3. For a capture, determine whether source/final alone uniquely identifies the recorded legal path from its pre-turn position.
4. Write source/final when unique; otherwise write every atomic landing square.
5. Insert normalized single spaces and, when requested, one canonical `n.` label before each Black/White pair.
6. Append the result token when one is requested; otherwise append `*` for an unfinished record.

Promotion and captured-piece type are reconstructed by replay and are not encoded with the legacy `$` or `*` suffixes. A final `*` has only the PDN unfinished-result meaning.

`parse(write(history))` must resolve to the same sequence of encoded atomic moves and the same final position.

## Result handling

The result token is review metadata rather than a command to the live rules engine:

- `1-0` means White won and `0-1` means Black won, even though Black moves first in type 31;
- `1/2-1/2` is a draw;
- `0-0` records a double forfeit, which is not a result produced by this live ruleset;
- `*` means unfinished or unknown.

If replay reaches a result derivable by `RuleValidator`, a contradictory token produces `PDN_RESULT_MISMATCH`. A compatible token is retained. If the final replay position is ongoing, a decisive token is retained as external review metadata—for example, a historical resignation—but does not manufacture a live engine result.

## Diagnostics

```ts
interface PdnDiagnostic {
    readonly code: string;
    readonly message: string;
    readonly offset: number;
    readonly line: number;
    readonly column: number;
    readonly token: string;
    readonly turnIndex?: number;
    readonly expected?: readonly string[];
}
```

The parser should recover only far enough to identify the most specific first error. The UI highlights the associated source span and shows the message without switching to review mode.

Representative messages:

- `PDN_SQUARE_OUT_OF_RANGE at 3:8: square 33 is outside 1..32.`
- `PDN_AMBIGUOUS_MOVE at 1:14: 9-27 matches multiple captures; use 9-18-27 or 9-14-27.`
- `PDN_ILLEGAL_MOVE at 2:1: 24-20 is not legal for White in this position.`
- `PDN_RESULT_MISMATCH at 4:10: record says 1-0, but the rules produce 0-1.`

## Review behavior

- Successful loading creates a separate `CheckerEngine`, resolves the complete record once, and rewinds that engine to its initial review cursor.
- Play advances validated atomic steps with existing move animation. Step Forward completes one atomic step; Step Back uses the review engine's atomic rewind.
- The log display groups atomic steps by PDN player turn and marks the current atomic landing within a capture chain.
- Human board clicks, live agents, resignation, and live Start are disabled in review mode.
- Return to Live disposes review state, renders the untouched live snapshot, and dispatches its active agent with a fresh cancellation token.
