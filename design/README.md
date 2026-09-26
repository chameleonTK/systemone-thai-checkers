# Thai Checkers Redesign

This directory is the architecture specification for the next implementation of the Thai checkers engine. It is deliberately documentation-only: the current Angular application and the legacy classes remain unchanged until the design is implemented and tested.

## Reading order

| Level | Document | Purpose |
| --- | --- | --- |
| C4 Level 1–3 | [C4 architecture](c4-architecture.md) | People, runtime boundaries, components, and dependency rules |
| C4 Level 4 | [Class model](class-model.md) | Public contracts, state ownership, simulation, history, and UI projections |
| Runtime | [Runtime flows](runtime-flows.md) | Lifecycle and sequence diagrams for play, rewind, cancellation, and review |
| Interchange | [PDN playback](pdn-playback.md) | Supported type-31 movetext, mapping, parsing, validation, and export |
| Verification | [Testing strategy](testing-strategy.md) | Executable suite design and requirements-to-tests traceability |

## Design goals

1. The engine is a synchronous, framework-neutral TypeScript library. It must not import Angular, RxJS, browser APIs, renderers, animations, agents, timers, or PDN code.
2. `RuleValidator` is the sole authority for legal play and live game results. Live play and bot search use the same implementation.
3. A player seat and a decision-making agent are different concepts. Any `PlayableAgent` can be bound to either seat without changing the engine.
4. Agents receive all public game information through immutable values. They never receive the live engine or mutable state.
5. Search uses compact numeric state, packed moves, reusable buffers, and reversible mutation. Object-rich board models are created only at the presentation boundary.
6. The Angular UI is passive: it renders a view model, forwards user intents, and runs animations requested by the application coordinator.
7. One rewind reverses one atomic move or jump. A complete capture chain is nevertheless one player turn and one PDN move.
8. Imported games run in an isolated review session; the live match remains available and unchanged.

## Terminology

| Term | Meaning |
| --- | --- |
| Man | An unpromoted piece. The legacy source and UI call this a "knight". |
| King | A promoted piece. |
| Atomic step | One quiet move or one jump from one landing square to the next. This is the unit of engine mutation and rewind. |
| Player turn | One quiet move or a complete compulsory capture chain. This is the unit used by the 50-turn counter and PDN. |
| Revision | A monotonically increasing mutation identifier. It increases after moves, rewind, start, and resignation and never moves backward. |
| Step index | The cursor in atomic history. Unlike revision, it decreases when rewinding. |
| Position key | Four piece masks plus side to move. Repetition is recorded only at completed-turn boundaries. |
| Live session | The playable game bound to agents. |
| Review session | An isolated, read-only engine used to animate imported PDN. |

## Key decisions

| Topic | Decision |
| --- | --- |
| Initial state | A `READY` engine already contains all sixteen pieces. The UI animates that snapshot before `start()` activates Black. |
| Board representation | Four unsigned 32-bit masks represent black men, black kings, white men, and white kings. |
| Public state | `GameSnapshot` and `AgentTurnContext` contain defensive, readonly values and no references to engine internals. |
| Move unit | Agents submit one atomic `MoveIntent`; forced continuations generate another context for the same player and piece. |
| Draw counter | Fifty completed player turns without a capture or man advance. A capture chain counts once. |
| Repetition | The initial position is occurrence one. Only completed-turn positions are counted; side to move is part of identity. |
| Logs | Headerless PDN 3.0 type-31 movetext replaces the legacy `1.A1-B2` wire format. |
| PDN scope | Move numbers, numeric paths, whitespace, and one optional result are accepted. All other PDN constructs are rejected with source locations. |
| Review | Import never replaces or advances the live match. |
| Errors | Illegal input is non-mutating. Stale results are ignored. An agent exception pauses dispatch and becomes an application diagnostic, not a game result. |

## Legacy-to-new mapping

| Legacy responsibility | New owner |
| --- | --- |
| `Checker` lifecycle, rules, callbacks, selection, and agents | `GameSession` coordinates; `CheckerEngine` mutates game state; `RuleValidator` decides legality/results; `HumanAgent` owns selection |
| `Board`, `Tile`, and `Token` mutable graph | `GamePosition` in the core; `BoardGeometry` for mapping; immutable `BoardView`, `TileView`, and `PieceView` for Angular |
| `Player` as state, rule generator, and agent | `PlayerState`, `PlayableAgent`, and `RuleValidator` |
| `PlayerRandomBot` calling `Checker` | `RandomBot.chooseMove()` returning a `MoveIntent` |
| `Log` as notation, draw tracker, and undo implementation | `GameHistory`, repetition/no-progress fields, and `PdnMovetextCodec` |
| `redo()` and the “Redo” button | `rewind()` and “Rewind” |
| Callback strings | Typed `CommandResult`, `GameResult`, and `SessionDiagnostic`; presentation maps them to text |

The legacy A1 strings and their `*`/`$` suffixes are intentionally not a compatibility API. Their capabilities—move history, captured-piece identity, promotion, repetition, and rewind—remain available as structured state and standard type-31 movetext.

## Requirement ownership

| Requirement | Primary design owner | Verification |
| --- | --- | --- |
| UI separated from engine | `RendererPort`, `GameSession`, UI projections | Architecture and component tests |
| Human and bot agents are interchangeable | `PlayableAgent`, `SeatBinding` | Agent contract tests and custom-bot example |
| Validator owns legality and termination | `RuleValidator` | Rule, result, and live/search parity suites |
| Agents can read every public fact | `AgentTurnContext`, `GameSnapshot` | Snapshot completeness and isolation tests |
| Agent decisions are independent | Promise-based move return plus cancellation token | Stale, illegal, delayed, and throwing-agent tests |
| Preserve the existing UI | Angular renderer/view-model adapter | Component and end-to-end regression tests |
| Preserve `FEATURES.md` behavior | Migration table and compatibility fixtures | Feature traceability table |
| Cover all `README.md` rules | Rule fixtures | Rule traceability table |
| Fast state-tree exploration | `GamePosition`, `EncodedMove`, `SearchSession` | Perft parity, make/unmake, isolation, and benchmark suites |
| Start, selection, winner, rewind, and playback flows | `GameSession`, `HumanAgent`, `PlaybackController` | Runtime sequence and UI tests |

## Scope boundaries

The redesign does not add a backend, persistence, clocks, configurable rule variants, redo-after-rewind, interactive PDN variations, or a general PDN document parser. Angular 11 and the existing visual styling stay in place. Future implementation may make the minimal template and binding changes required for Start, Rewind, PDN review, winner display, and corrected behavior.
