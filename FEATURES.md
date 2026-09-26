# Current Engine Features

This document inventories the behavior implemented by the redesigned Thai checkers application. Architecture details and diagrams live in [`design/`](design/), while executable and manual acceptance coverage is listed in [`TEST_CHECKLIST.md`](TEST_CHECKLIST.md).

## Game setup and lifecycle

- Creates an 8×8 board with 32 numbered playable squares using PDN type-31/N2 orientation.
- Creates two configurable player seats with stable identity, display name, color, and any `PlayableAgent` implementation.
- Places eight ordinary pieces per player on the first two rows from each player's perspective.
- Exposes the initial position in `READY`, allowing the UI to animate setup before activating the engine.
- Starts Black after setup animation and follows the `READY → ACTIVE → ENDED` lifecycle.
- Supports resignation, one-step Rewind, and restoration of an ended game to active play.

## Pieces and movement

- Supports ordinary pieces (shown as “knights” in the existing UI) and promoted kings.
- Ordinary pieces move one diagonal square forward into an empty square.
- Ordinary pieces capture forward over one opponent into the immediately following empty square.
- Kings move diagonally forward or backward across any number of empty squares.
- A king may cross empty squares before capturing the first opponent it encounters and must land immediately beyond it.
- Friendly pieces and a second occupied square block a king's path.
- Supports any physically possible number of kings.

## Captures, promotion, and turns

- Enforces captures globally: when any active piece can capture, quiet moves are unavailable.
- Allows any legal capture alternative; a player is not required to maximize the capture count.
- Removes captured pieces immediately after each atomic jump.
- Requires consecutive captures by the same piece while another capture remains.
- Promotes an ordinary piece on the opponent's back rank.
- Ends the turn immediately on promotion, even if the new king could capture.
- Alternates the active player after a quiet move or completed capture chain.
- Counts a complete multi-jump chain as one player turn while retaining each jump as an atomic history step.

## Selection and validation

- `RuleValidator` is the single authority for move generation, validation, continuation, promotion, and terminal results.
- Only an active piece present in the supplied legal-move list can be selected.
- Selecting a piece highlights its legal destinations without mutating game state.
- Selecting an invalid destination clears selection and highlights.
- Forced continuation automatically reselects the capturing piece and exposes only its next legal destinations.
- Illegal and stale commands leave the engine unchanged and return typed rejection codes.

## Game completion

- Declares a win when the opponent has no pieces or no legal move.
- Allows the active player to resign and awards the win to the opponent.
- Declares a draw on the third occurrence of an exact position; identity includes every piece mask and side to move.
- Counts the initial position as the first repetition occurrence.
- Declares a draw after 50 completed player turns without a capture or ordinary-piece advance.
- Resets the no-progress count after any capture or ordinary-piece advance.
- Exposes typed ongoing/win/draw results; the presenter derives user-facing text and configured winner names.

## History, Rewind, and logging

- Records each quiet move or jump as a reversible atomic history entry.
- Preserves captured square/type, promotion, forced continuation, side to move, counters, repetition state, phase, and result.
- Rewind reverses one atomic step and always advances the revision so delayed agent answers become stale.
- Public history groups a completed capture chain into one player turn.
- Exports headerless PDN 3.0 type-31 movetext using numeric squares and the `-` separator.
- Imports optional move numbers and Default result tokens with line, column, token, and turn diagnostics.
- Resolves shortened capture notation from position legality and requires intermediate landing squares when a path is ambiguous.
- Rejects unsupported headers, comments, variations, annotations, setup/FEN commands, alphabetic squares, and multiple games.
- Runs playback in an isolated review engine with forward/back navigation and return-to-live.

## Player agents and UI integration

- Defines an asynchronous `PlayableAgent.chooseMove(context, cancellation)` contract for humans and bots.
- Supplies immutable public state, legal moves, history, counters, revision, turn ID, and a copied simulation seed.
- Includes a click-driven `HumanAgent`, a `RandomBot`, `MinimaxAgent`, and `AlphaBetaAgent`, with injectable randomness for stable tests.
- Includes Kev, Laya, and OpenThai ONNX System One choice agents with shared move mapping, validation, cancellation, and preparation behavior.
- Loads the large model runtimes and revision-pinned artifacts on demand, reports aggregate download progress, retains browser-cached files, and releases the previous model session when switching.
- Defaults the Laya and OpenThai agents to typed `int8` precision while allowing either registry factory or constructor to select `int4` without adding precision UI.
- Registers independent agents through one factory-based registry and exposes them in a split Start/opponent control.
- Searches a configurable number of completed turns (four by default), preserving forced multi-jumps within the same depth.
- Keeps player identity/state separate from agent behavior, so either seat may bind any agent implementation.
- Cancels pending work after rewind, resignation, review entry, session destruction, or a completed turn.
- Ignores delayed responses and safely reports illegal or failed agents without manufacturing a rules result.
- Keeps the established board styling while adding Start, Rewind, resignation, PDN input/review controls, diagnostics, and winner display.
- Keeps rendering, animations, timers, Angular, RxJS, and DOM access outside the engine.

## Lightweight bot simulation

- Stores hot game state as four unsigned 32-bit piece masks plus numeric/boolean turn fields.
- Packs atomic moves into numbers containing source, destination, capture, captured square, and promotion data.
- Creates `SearchSession` from an isolated copied `SimulationSeed`.
- Provides reusable-buffer `legalMoves`, reversible `makeMove`/`unmakeMove`, result lookup, material evaluation, and independent root cloning.
- Uses the same `RuleValidator` in live games and search, including continuation and draw rules.
- Avoids UI projections, PDN, observables, promises, agents, rendering, animation, and timers in the search loop.
- Includes a deterministic, non-gating depth-six traversal benchmark for correctness and comparative throughput.

## Intentional boundaries

- Ordinary pieces cannot capture backward.
- Huffing, maximum-capture selection, delayed capture removal, and continued movement after promotion are not part of this ruleset.
- A king cannot choose an arbitrary landing square beyond a captured piece.
- The application has no backend, persistence, redo-after-rewind stack, clocks, configurable rulesets, or interactive PDN variations.
- The supported PDN format is headerless type-31 movetext, not a compatibility layer for the old `A1` log strings.
