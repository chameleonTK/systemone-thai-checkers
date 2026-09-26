# Testing Strategy and Traceability

This document specifies tests for the future implementation. No test in this phase is added to the current legacy classes because doing so would couple acceptance criteria to APIs that the redesign replaces.

Pure engine, rules, history, agent, simulation, geometry, and PDN tests use Jasmine directly without Angular `TestBed`. Angular `TestBed` is reserved for component/presenter integration. Browser-level flows remain in Protractor while the repository remains on Angular 11.

## Planned suites

| Suite | Responsibility |
| --- | --- |
| `board-geometry.spec.ts` | All 32 PDN mappings, playable coordinates, bounds, orientation, and precomputed diagonal rays |
| `initial-position.spec.ts` | Ready snapshot, sixteen men, player metadata, Black-first start, and initial repetition registration |
| `rule-validator-men.spec.ts` | Forward quiet moves/captures and rejection cases |
| `rule-validator-kings.spec.ts` | Flying movement, blockers, first-opponent capture, and immediate landing |
| `rule-validator-captures.spec.ts` | Global compulsory capture, choice, forced same-piece continuation, and capture-chain completion |
| `rule-validator-promotion.spec.ts` | Back ranks, promotion flags, and immediate turn end |
| `rule-validator-results.spec.ts` | No-pieces/no-moves wins, resignation, repetition, and 50-turn draw |
| `checker-engine.spec.ts` | Lifecycle, command atomicity, snapshots, revision, and indexes |
| `game-history.spec.ts` | Atomic undo records, turn grouping, counters, repetition deltas, and rewind restoration |
| `agent-contract.spec.ts` | Immutable information, dispatch, stale results, cancellation, illegal moves, and exceptions |
| `search-session.spec.ts` | Live parity, make/unmake, branch isolation, deep result checks, and reusable buffers |
| `pdn-movetext-codec.spec.ts` | Grammar subset, diagnostics, path resolution, ambiguity, export, and round trips |
| `playback-controller.spec.ts` | Transactional loading, review navigation, result metadata, and live isolation |
| `game-presenter.spec.ts` | Immutable state to legacy-shaped board/player/control view models |
| Existing Angular component specs | Start, board clicks, highlighting, labels, history, dialogs, and review controls |
| `e2e/src/app.e2e-spec.ts` | Complete human-visible start/play/rewind/end/review journeys |

Test fixtures use a compact builder that accepts PDN squares rather than directly manipulating masks:

```ts
const position = positionFixture({
    blackMen: [9],
    blackKings: [],
    whiteMen: [14, 22],
    whiteKings: [],
    sideToMove: 'black'
});
```

The builder is test-only and verifies that masks are disjoint and squares are in range.

## Core acceptance cases

### Setup and ordinary pieces

- `creates_ready_type31_initial_position`: 8×8 geometry, 32 playable squares, eight Black men, eight White men, no kings, and no overlap.
- `does_not_dispatch_before_start`: a ready engine has no active agent request.
- `starts_black_after_setup_animation`: session calls engine start only after the animation promise resolves.
- `man_moves_one_forward_diagonal`: accept both forward diagonals when empty.
- `man_rejects_backward_sideways_occupied_and_off_board_moves`.
- `man_captures_one_forward_opponent_to_immediate_empty_landing`.
- `man_rejects_backward_capture_friendly_capture_and_occupied_landing`.

### Kings and capture enforcement

- `king_moves_any_unblocked_distance_in_four_diagonal_directions`.
- `king_captures_first_opponent_after_zero_or_more_empty_squares`.
- `king_lands_only_on_immediate_square_after_captured_piece`.
- `king_cannot_cross_friendly_piece_or_second_occupied_square`.
- `global_capture_removes_all_quiet_legal_moves`.
- `any_available_capture_route_is_legal_even_when_shorter`.
- `capture_removes_piece_immediately`.
- `capture_continuation_restricts_moves_to_same_piece`.
- `capture_chain_cannot_stop_early`.

### Promotion and terminal rules

- `black_man_promotes_on_row_seven` and `white_man_promotes_on_row_zero`.
- `man_does_not_promote_before_opponent_back_rank`.
- `promotion_ends_turn_despite_new_king_capture`.
- `no_opponent_pieces_is_a_win`.
- `opponent_with_pieces_but_no_legal_move_is_a_win`.
- `active_player_resignation_awards_opponent_win`.
- `third_completed_turn_occurrence_is_a_draw`.
- `same_masks_with_different_side_to_move_are_distinct`.
- `initial_position_counts_as_first_repetition_occurrence`.
- `forty_ninth_no_progress_turn_continues_and_fiftieth_draws`.
- `capture_resets_no_progress_counter`.
- `quiet_man_advance_resets_no_progress_counter`.
- `multi_jump_counts_as_one_completed_turn`.

### History and agent safety

- Rewind fixtures restore a quiet move, every point within a capture chain, a captured king, a promotion, a draw/win, repetition deltas, and the no-progress counter.
- Rewinding a final chain jump restores the mover and forced piece; rewinding an ended step restores `ACTIVE`.
- Rewind at the initial position returns `nothing-to-rewind` without changing revision or state.
- Accepted rewind increases revision while decreasing step index; an old agent response is then stale.
- Snapshot, legal move list, history, player metadata, and simulation seed mutation attempts cannot affect the live engine.
- Illegal current-revision agent output is rejected without mutation; cancellation suppresses delayed output; exceptions pause dispatch and expose Retry Turn.

### Simulation and performance

- A table of quiet, forced-capture, king, promotion, continuation, repetition, and 49-turn positions returns identical encoded legal moves and results in live and search paths.
- For every legal move in those positions, `makeMove` followed by `unmakeMove` restores all masks, scalar fields, repetition entries, result, and hash exactly.
- Deterministically selected legal games reach identical positions through `CheckerEngine` and `SearchSession`.
- Exploring one child, undoing it, and exploring a sibling cannot leak masks, counters, or repetition state.
- Reusing a `MoveBuffer` preserves its identity through a fixed-depth traversal.
- Spies prove search does not call snapshot projection, PDN, renderer, logger, Angular, RxJS, promise, animation, or timer code.

A separate non-gating benchmark runs fixed positions at fixed depths, verifies the node count first, warms up the JavaScript runtime, and reports median nodes/second over repeated runs. Its checked-in output records runtime/browser, hardware label, fixture, depth, node count, elapsed time, and throughput. The initial redesign establishes the baseline; later changes report relative movement without a machine-dependent absolute pass/fail threshold.

## README rule traceability

| ID | `README.md` rule | Executable cases |
| --- | --- | --- |
| R01 | Men and kings; eight initial men each | `creates_ready_type31_initial_position`, promotion tests |
| R02 | Men move one diagonal space forward | `man_moves_one_forward_diagonal`, rejection table |
| R03 | Forward jump over opponent to empty landing | man capture acceptance/rejection table |
| R04 | Consecutive captures | `capture_continuation_restricts_moves_to_same_piece` and chain fixtures |
| R05 | Captures are compulsory | `global_capture_removes_all_quiet_legal_moves` |
| R06 | A continuing capture must continue in the same turn | `capture_chain_cannot_stop_early` |
| R07 | Any capture alternative may be chosen | `any_available_capture_route_is_legal_even_when_shorter` |
| R08 | Reaching the opposing back rank promotes | both-side promotion fixtures |
| R09 | Promotion ends the turn | `promotion_ends_turn_despite_new_king_capture` |
| R10 | Kings move any diagonal distance both ways | king movement and blocker fixtures |
| R11 | No limit on kings | fixture with all surviving pieces promoted; legal generation remains unchanged |
| R12 | Win by no pieces or no moves | both terminal win fixtures |
| R13 | Third exact position is a draw | third-occurrence, initial-count, and side-to-move fixtures |
| R14 | 50 turns since capture or man advance is a draw | 49/50 boundary, both reset cases, and multi-jump count |

The `README.md` “Interesting rules” describe alternatives that this ruleset does **not** adopt:

| ID | Alternative ruled out | Executable case |
| --- | --- | --- |
| I01 | Optional capture plus huffing | compulsory-capture rejection; no huff command/API exists |
| I02 | Backward man capture | `man_rejects_backward_capture_friendly_capture_and_occupied_landing` |
| I03 | Must choose maximum capture | shorter legal capture route fixture |
| I04 | Continue after promotion | promotion turn-end fixture |
| I05 | King may land arbitrarily after capture | immediate-landing-only king fixture |
| I06 | Delay captured-piece removal to turn end | immediate removal and continuation-position fixture |

## `FEATURES.md` traceability

The feature inventory includes known defects and implementation details. “Preserved” below means preserving the user-visible capability, while rows marked “corrected” deliberately replace the defective behavior.

| ID | Feature or boundary | Target behavior and test |
| --- | --- | --- |
| F01 | 8×8 alternating board | Geometry and presenter assert 64 tiles/32 playable squares. |
| F02 | Two players and metadata | Ready snapshot contains exactly two named/color/oriented player states. |
| F03 | Eight pieces on first two rows per side | Initial-position square-set fixture. |
| F04 | Player 1 starts and agent is asked | Corrected: no constructor dispatch; after setup animation, Black is activated and dispatched exactly once. |
| F05 | Global and per-player piece tracking | Snapshot totals and per-player filtered counts agree after moves/captures/rewind. |
| F06 | Bounds, coordinate lookup, perspective | All squares, invalid bounds, and 180-degree presentation orientation tests. |
| F07 | Men and kings | Piece-kind snapshot and promotion tests. |
| F08 | Forward man movement | Man movement table. |
| F09 | Forward man capture | Man capture table. |
| F10 | Flying king movement | King ray fixtures. |
| F11 | King passes empties and captures first opponent | King capture fixtures. |
| F12 | Friendly blockers | Man and king friendly-blocker fixtures. |
| F13 | Rich move information | `MoveOption`/decoded move exposes source, destination, capture square/type, and promotion. |
| F14 | Global compulsory capture | Legal-list and rejected-command tests. |
| F15 | Remove captured piece from all views | Masks, snapshot totals, and projection update immediately. |
| F16 | Same-piece consecutive capture | Forced-square and context tests. |
| F17 | Disable other pieces during chain | Their moves are absent and their `PieceView.enabled` is false. |
| F18 | Back-rank promotion | Both-side promotion fixtures. |
| F19 | Promotion ends turn | Promotion continuation fixture. |
| F20 | Alternate after quiet/completed capture | Side-to-move sequences for quiet, single capture, and multi-jump. |
| F21 | Index advances on each individual step | Replaced by explicit `stepIndex` per atomic step plus `completedTurns` per player turn. |
| F22 | Only active/enabled pieces selectable | HumanAgent selection table. |
| F23 | Selection highlights legal destinations | Presenter highlights exactly context destinations. |
| F24 | Only highlighted destination plays | Valid click submits; invalid click does not call engine. |
| F25 | Clear selection caches | Invalid click, accepted move, turn change, rewind, cancellation, and review switch tests. |
| F26 | Compulsory/malformed errors | Typed engine/PDN diagnostics are rendered through the application port. |
| F27 | Loss with no pieces | Terminal result fixture. |
| F28 | Loss with no legal move | Terminal result fixture. |
| F29 | Threefold draw | Corrected canonical completed-turn identity fixtures. |
| F30 | 50-move draw | Corrected 50 completed turns with both reset conditions. |
| F31 | Give up | `resign` winner/reason and UI control test. |
| F32 | Disable play and report end | No further move/dispatch; view disables pieces and shows result. |
| F33 | Winner, loser, end, cause | Typed `GameResult`; presenter derives human text including configured winner name. |
| F34 | Coordinate move records | Migrated to type-31 numeric PDN export and UI history. |
| F35 | Captured king/promotion suffixes | Migrated to structured records; round-trip replay reconstructs both without legacy suffixes. |
| F36 | Repetition snapshots | Compact exact repetition entries are retained for the reversible history segment, not arbitrarily sliced at 50. |
| F37 | Coordinate conversion | One BoardGeometry implementation; all 32 mappings tested. |
| F38 | Undo recent move | Renamed Rewind and expanded to restore every recorded field for one atomic step. |
| F39 | Human/automated agent interface | HumanAgent, RandomBot, and custom bot contract tests. |
| F40 | Passive player and random bot | Player state separated from agents; both provided agent implementations are configurable. |
| F41 | Random bot waits and prioritizes captures | Legal list already enforces capture; live seat configuration applies a 500 ms presentation delay outside core/search. |
| F42 | Hard-coded two bots | Corrected through two injected `SeatBinding` values. |
| F43 | UI state and commands | Presenter/Session expose board, active styling, counts, history, Rewind, resignation, and diagnostics. |
| F44 | Thai/English helper | Existing translation helper and labels receive component regression tests. |
| F45 | Sparse legacy coverage | Replaced by all named pure and UI suites in this document. |
| F46 | No backward man capture | Negative rule fixture. |
| F47 | Immediate king landing | Negative arbitrary-landing fixture. |
| F48 | No maximum-capture rule | Alternative route fixture. |
| F49 | Counter failed to reset on man advance | Corrected reset fixture. |
| F50 | Repetition omitted active side | Corrected side-to-move identity fixture. |
| F51 | Undo omitted index/result/redispatch | Corrected restoration, revision, and dispatch fixtures. |
| F52 | No redo, persistence, seeded UI random, configurable rules | Remains out of scope; injectable test `RandomSource` is allowed, and PDN is review interchange rather than persistence. |

## Interaction requirement traceability

| ID | Interaction | Acceptance scenario |
| --- | --- | --- |
| U01 | Start button and setup animation | Start is initially enabled; pieces animate; Black dispatch happens only after completion. |
| U02 | Black first | First active snapshot/context is Black. |
| U03 | Select own piece and highlight permissible tiles | HumanAgent/presenter selection fixture. |
| U04 | Click permissible target, move/capture, advance | Quiet and capture component flows; chain does not prematurely advance. |
| U05 | Click impermissible target clears selection | Component test verifies no engine call and requires reselection. |
| U06 | Stop and show winner name | Terminal flow disables input and dialog/view text uses configured name. |
| U07 | Rewind one step | Button reverses one atomic step and re-renders restored selection/turn state. |
| U08 | Log accepts and plays records | Valid headerless type-31 input opens isolated animated review. |
| U09 | Preserve live game during review | Before/after snapshot equality plus fresh active-agent dispatch on return. |

## PDN acceptance matrix

- Mapping: table-driven round trip for every square `1..32` and every playable coordinate.
- Syntax accepted: paths with/without move numbers, mixed whitespace, every Default result, two-square and full capture paths.
- Syntax rejected: every construct listed in `pdn-playback.md`, missing/extra separators, range errors, empty input, trailing tokens, and duplicate results.
- Semantics: quiet moves, single captures, ambiguous/non-ambiguous multi-captures, promotion, wrong side, compulsory capture, incomplete chain, illegal intermediate landing, and result mismatch.
- Round trip: unfinished, win, loss, draw, captured king, promotion, and ambiguous capture history resolve to identical encoded steps and final state.
- Diagnostics: exact code, offending token, offset, line, column, turn index, and candidate paths where applicable.

## Architecture checks

The future change is not complete until automated checks establish that:

- core source has no imports from Angular, RxJS, components, renderer, agent implementations, browser APIs, or PDN;
- agent implementations receive no `CheckerEngine` reference;
- only `RuleValidator` constructs terminal live results;
- no rule logic is duplicated in components, `HumanAgent`, bots, presenter, or PDN parser;
- search uses the same validator instance/type as live play and produces no presentation/history strings;
- all public snapshot collections are readonly copies and no engine-owned mask/array is exposed.

## Commands used after implementation

```sh
npm test -- --watch=false --browsers=ChromeHeadless
npm run lint
npm run build -- --configuration production
```

The benchmark is a separate explicitly invoked command so ordinary CI correctness is not made flaky by shared-runner timing.
