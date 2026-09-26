# Thai Checkers Test Checklist

This checklist is the human-readable acceptance list for the redesigned engine. Checked automated items are covered by the colocated Jasmine specs under `src/app/`. Unchecked items are visual or exploratory checks that still require a person in a real browser.

## Automated verification commands

- [x] `npm test -- --watch=false --browsers=ChromeHeadless` — all Jasmine tests pass.
- [x] `npm run lint` — application and test sources pass TSLint.
- [x] `npm run build -- --configuration production` — the Angular production build succeeds.
- [x] `tsc -p tsconfig.app.json --noEmit` — application types compile.
- [x] `tsc -p tsconfig.spec.json --noEmit` — test types compile.

## Board and initial game

- [x] The board contains 8 rows, 8 columns, and exactly 32 playable squares.
- [x] Every PDN square from 1 through 32 maps to one playable tile and round-trips to the same number.
- [x] Type-31/N2 corner orientation and 180-degree coordinate conversion are correct.
- [x] Non-playable and off-board coordinates are rejected.
- [x] Each player starts with exactly eight ordinary pieces and no kings.
- [x] The ready state already exposes the initial position, but exposes no playable move.
- [x] Black becomes the active player only after `start()`.
- [x] Starting, moving, resigning, or rewinding in an invalid lifecycle state is rejected without mutation.

## Ordinary-piece rules

- [x] Black ordinary pieces move one diagonal square toward increasing rows.
- [x] White ordinary pieces move one diagonal square toward decreasing rows.
- [x] Backward, sideways, occupied-destination, malformed, and off-board quiet moves are rejected.
- [x] An ordinary piece captures one forward opponent into the immediately following empty square.
- [x] Backward captures, friendly-piece captures, and captures onto occupied landing squares are rejected.
- [x] A capture anywhere on the board suppresses all quiet moves.
- [x] A player may choose any legal capture route; the longest route is not mandatory.

## King rules

- [x] Kings move any unobstructed diagonal distance in all four directions.
- [x] Kings may cross empty squares before the first captured opponent.
- [x] A king lands immediately beyond the captured piece.
- [x] A friendly piece blocks a king's move and capture ray.
- [x] A king cannot jump across two occupied squares in one atomic move.
- [x] The engine supports any number of kings up to the physical board limit.

## Capture chains, promotion, and turn boundaries

- [x] A multi-jump restricts continuation to the same piece.
- [x] A player cannot stop a multi-jump while another capture remains.
- [x] Captured pieces are removed immediately after each atomic jump.
- [x] Intermediate jumps do not change the active player or completed-turn count.
- [x] A complete multi-jump increments the completed-turn count exactly once.
- [x] Black and White promote only on the opponent's back rank.
- [x] A piece remains ordinary before reaching the back rank.
- [x] Promotion ends the turn immediately, even if the new king could capture.

## Explicit non-rules

- [x] Huffing is not used; available captures are compulsory.
- [x] Ordinary pieces cannot capture backward.
- [x] Maximum-capture selection is not required.
- [x] A newly promoted piece cannot continue moving during that turn.
- [x] A capturing king cannot choose a landing square farther than the square immediately beyond its victim.
- [x] Capture removal is not delayed until the end of a turn.

## Terminal and draw rules

- [x] Capturing the opponent's final piece produces a no-pieces win.
- [x] Leaving the opponent with pieces but no legal move produces a no-legal-move win.
- [x] Resignation awards the win to the opponent and rejects resignation by the wrong player.
- [x] The third occurrence of an exact position produces a draw.
- [x] The initial position is counted as the first repetition occurrence.
- [x] Repetition identity includes all four piece masks and the side to move.
- [x] The 49th no-progress completed turn remains ongoing and the 50th draws.
- [x] A capture resets the no-progress counter.
- [x] An ordinary-piece advance resets the no-progress counter.
- [x] A multi-jump counts as one completed turn for the 50-turn rule.

## History and rewind

- [x] One Rewind reverses one atomic quiet move or jump.
- [x] Rewind restores ordinary and king captures with the correct piece type.
- [x] Rewind reverses promotion and restores the ordinary piece.
- [x] Rewinding the final jump of a chain restores the same-player forced-continuation state.
- [x] Rewind restores counters, active side, legal moves, phase, and result.
- [x] Rewinding an ended game restores an active game.
- [x] Rewind stops safely at the initial position.
- [x] Revision always advances on rewind, invalidating delayed agent output.
- [x] Public history groups all atomic jumps in a chain into one completed player turn.

## Agent API and session orchestration

- [x] A custom agent needs only `chooseMove(context, cancellation)`.
- [x] Agents receive immutable snapshots, legal moves, public history, counters, revision, turn ID, and a copied simulation seed.
- [x] Mutating a simulation seed cannot mutate the live engine.
- [x] Human selection accepts only an active piece with legal moves.
- [x] Human selection exposes only destinations from the supplied turn context.
- [x] Selecting an impermissible destination clears selection and highlights without changing the engine.
- [x] Selecting a permissible destination submits exactly one atomic step.
- [x] Cancellation clears pending human input.
- [x] The random bot is deterministic with an injected random source and uses only the public context.
- [x] Setup animation completes before engine activation and Black dispatch.
- [x] A failed setup animation leaves the engine ready and surfaces a diagnostic.
- [x] Illegal bot output leaves state unchanged, emits a diagnostic, and redispatches the turn.
- [x] A rejecting agent leaves state unchanged and surfaces a diagnostic without creating a game result.
- [x] Delayed output after cancellation or review entry is ignored.
- [x] Review navigation never changes the preserved live session.

## Lightweight simulation

- [x] Live and search sessions produce identical legal encoded moves for tactical fixtures.
- [x] Search uses the same `RuleValidator` as live play.
- [x] `makeMove()` followed by `unmakeMove()` restores every compact position field.
- [x] Sibling branches cannot observe one another's mutations.
- [x] `cloneRoot()` creates an independent session at the original root.
- [x] Draw counters and terminal results are evaluated in search.
- [x] Material evaluation runs from bit masks without constructing UI projections.
- [x] Legal-move generation accepts reusable output buffers.
- [x] A deterministic depth-six traversal reaches 218,695 leaves, restores the exact root, and reports nodes per second without a flaky timing threshold.
- [x] Engine and search sources have no Angular, renderer, RxJS, DOM, animation, timer, PDN, or agent dependency.

## PDN type-31 movetext

- [x] Headerless numeric paths use the type-31 `-` separator.
- [x] Optional one-dot/three-dot move numbers, whitespace, and Default result markers parse.
- [x] All supported result markers parse: `1-0`, `0-1`, `1/2-1/2`, `0-0`, and `*`.
- [x] Headers, comments, variations, NAGs, annotations, setup/FEN commands, alphabetic squares, and `x` separators are rejected.
- [x] Leading-zero and out-of-range squares are rejected.
- [x] Empty games, incomplete paths, trailing tokens, and multiple games produce source-positioned diagnostics.
- [x] Every imported atomic segment is validated by `RuleValidator`.
- [x] Illegal replay moves report the failing turn.
- [x] Complete multi-capture landing paths resolve and export with grouped turn history.
- [x] A two-square capture path is accepted only when position legality identifies one route; ambiguous routes require intermediate landings.
- [x] Exported movetext round-trips through the parser and resolver.
- [x] Playback supports forward and backward atomic navigation.
- [x] Invalid input is transactional and does not install a partial review game.
- [x] Imported result conflicts with a rules-derived terminal result are rejected.

## UI projection and Angular components

- [x] Rich 8×8 tile and piece objects are created only by the presenter, outside the engine/search path.
- [x] Selection and highlights can be merged into a view without mutating the source snapshot.
- [x] Review projections disable live piece input.
- [x] Playable tile and piece clicks emit the correct square; non-playable tile clicks do not.
- [x] Selected kings receive the expected active, king, selected, setup-animation, and player-color styling data.
- [x] The status panel preserves translated labels and active-player coloring.
- [x] The status panel emits PDN edits and all session commands through outputs.
- [x] The application initializes in ready state and displays PDN diagnostics without replacing the live model.
- [x] Winner text is derived from configured player names outside the engine.

## Manual browser regression checks

- [ ] Confirm the existing board, pieces, colors, spacing, and responsive layout remain visually consistent.
- [ ] Click Start and confirm pieces animate onto the board before Black becomes interactive.
- [ ] Play a quiet move and a capture; confirm movement and capture-removal transitions look correct.
- [ ] Trigger a forced continuation; confirm the same piece is reselected and only its legal destinations are highlighted.
- [ ] Click a non-permissible destination and confirm all highlights disappear.
- [ ] Finish and resign games; confirm input stops and the configured winner name appears in the dialog.
- [ ] Use Rewind after quiet moves, each jump of a chain, promotion, and game end; confirm the visible board and status restore correctly.
- [ ] Paste valid and invalid PDN; confirm diagnostics are readable and include the relevant source location.
- [ ] Play, step forward, and step backward in review; confirm live input is disabled.
- [ ] Return from review and confirm the live match is exactly where it was left.
- [ ] Configure Human vs RandomBot and bot vs bot seats in `AppComponent`; confirm both use the same session contract.
