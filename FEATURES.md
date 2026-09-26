# Current Engine Features

This document inventories behavior implemented by the current engine in `src/app/`. It is a baseline for the redesign, not a statement that every behavior is correct or should be retained.

## Game Setup

- Creates an 8×8 board with alternating playable and non-playable tiles.
- Creates exactly two players, each with a name, index, color, orientation, active state, and collection of pieces.
- Places eight ordinary pieces per player on the first two rows from each player's perspective.
- Starts Player 1 and immediately asks the active player agent to play.
- Tracks pieces both globally on the board and per player.
- Provides board-boundary checks, coordinate lookup, and 180-degree coordinate conversion for the opposing perspective.

## Pieces and Movement

- Supports ordinary pieces (called “knights” in the code/UI) and promoted kings.
- Ordinary pieces move one diagonal square forward into an empty square.
- Ordinary pieces capture forward by jumping over one opposing piece into the empty square immediately beyond it.
- Kings move diagonally forward or backward across any number of empty squares.
- A king may pass over empty squares before capturing the first opposing piece it encounters, landing on the square immediately beyond it.
- Friendly pieces block movement and capture paths.
- Move generation returns a `Move` object containing the piece, source, destination, capture status, and captured piece.

## Captures, Promotion, and Turns

- Enforces captures globally: a non-capturing move is rejected when any piece owned by the active player can capture.
- Removes captured pieces from both the board and their owner's collection.
- Requires consecutive captures by the same piece while another capture remains available.
- Disables the player's other pieces during a capture sequence.
- Promotes an ordinary piece that reaches the opponent's back rank.
- Ends the turn immediately on promotion, even if the newly promoted king could capture again.
- Alternates active players after an ordinary move or a completed capture sequence.
- Exposes a turn index; in the current implementation it advances after every individual move, including each jump in a multi-capture sequence.

## Selection and Validation

- Only active, enabled pieces can be selected.
- Selecting a piece calculates and highlights its legal destination tiles.
- Only a highlighted destination can be played.
- Clears previous piece/tile selection and cached moves when selection or turn state changes.
- Reports compulsory-capture and malformed-capture errors through an optional callback.

## Game Completion

- Declares a loss when a player has no pieces remaining.
- Declares a loss when a player has no legal move.
- Declares a draw when the latest serialized board position has occurred at least three times.
- Declares a draw after 50 logged moves without a capture.
- Allows the active player to resign (“give up”).
- Disables every piece when the game ends and reports the result through an optional callback.
- Stores the winner, loser, end flag, and human-readable cause in the current game state.

## History and Undo

- Records moves using coordinates such as `1.A1-B2` (move) and `1.A1xC3` (capture).
- Adds `*` when the captured piece was a king and `$` when the moving piece was promoted.
- Serializes board positions for repetition detection and retains the latest 50 position snapshots.
- Converts between numeric coordinates and labels (`A1`, `B2`, and so on).
- The method and UI label named `redo` actually undo the most recent move: it moves the piece back, restores a captured piece and its king status, reverses promotion, restores the active player, and adjusts piece availability for capture chains.

## Player Agents and UI Integration

- Defines a `PlayableAgent` interface for human or automated players.
- Includes a passive `Player` implementation and a `PlayerRandomBot` implementation.
- The random bot waits 500 ms, chooses a random legal move, and prioritizes captures.
- The current `Checker` constructor hard-codes two random bots; using human players requires changing the constructor.
- Exposes state and commands used by the Angular UI: board/piece rendering, selected moves, active-player styling, piece counts, move history, undo, resignation, and end/error dialogs.
- Includes a small translation helper that maps several Thai UI labels to English.

## Known Behavioral Boundaries

- Only a small subset of setup behavior is covered by automated engine tests.
- Ordinary pieces cannot capture backward.
- For king captures, only the square immediately beyond the captured piece is offered as a landing square.
- Capture choice is unrestricted; the engine does not require the route that captures the most pieces.
- The 50-move draw check resets only on capture, not when an ordinary piece advances.
- Position repetition compares board contents only; it does not encode the active player or other turn state.
- Undo does not decrement the turn index, recompute/reset the current game state, or restart the restored active agent.
- There is no redo-after-undo stack, save/load format, deterministic random seed, or configurable ruleset.
