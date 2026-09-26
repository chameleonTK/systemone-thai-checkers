# Thai Checkers


✅ There are two types of pieces: knight and king. Each player will start with 8 knights each.

✅ Knights can only move one diagonal space forward (towards their opponents pieces).

✅ To capture an opposing piece, a piece "jump" over it by moving two diagonal spaces in the direction of the the opposing piece. Note that the space on the other side of the captured piece must be empty for you to capture it.

✅ A piece may jump consecutively over an opponent's pieces to capture all of them at the same time.

✅ Jumps are compulsory. As long as you have an opportunity to capture, you must take it no matter what.

✅ If a piece can continue to jump once it has jumped, it must do so in the same turn.

✅ If there is more than one alternative for capture, you may choose which one to take. It need not be the path that takes the most pieces.

✅ If your piece reaches the last row on the opponent's side, it will be promoted into a king.

✅ When a knight is kinged, the turn automatically ends, even if the king can continue to jump.

✅ Kings can only move diagonally but any number of space at a time. They may move diagonally forward or backwards.

✅ There is no limit to how many king pieces a player may have

✅ The game is won when all the opponent's pieces are captured or (putting them into a position where they cannot move).

✅ If an exact board position is repeated a third time, the game automatically ends in a draw.

✅ If 50 completed player turns have taken place since the last capture or advancement of a regular checker, the game ends in a draw. A multi-jump chain counts as one turn.

Ref: [https://github.com/kschuetz/checkers](https://github.com/kschuetz/checkers)

The redesigned architecture and public contracts are documented in [`design/`](design/). See [`FEATURES.md`](FEATURES.md) for the implemented feature inventory and [`TEST_CHECKLIST.md`](TEST_CHECKLIST.md) for automated and manual acceptance coverage.

## Interesting rules
*  Jumps are not compulsory but if a player refused to make an available jump, the opposing player could remove the piece that should have jumped. It is called "huff"
*  International Checkers: knight can jump backward to capture the opponent's piece.
*  International Checkers: if there is more than one alternative for capture, a player needs to choose the path that takes the most pieces.
*  International Checkers: when a knight is kinged, the turn does not automatically ends.
*  International Checkers: the King can move any distance along a diagonal. **This holds true whether jumping over a piece or not**. So after jumping over a piece, you can choose how far beyond that piece to land.
*  International Checkers: captured pieces need to be removed once a turn is finished.

## Development server

Run `npm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Build

Run `npm run build -- --prod` to build. The build artifacts will be stored in the `dist/` directory.