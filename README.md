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

The redesigned architecture and public contracts are documented in [`design/`](design/). See [`FEATURES.md`](FEATURES.md) for the implemented feature inventory and [`TEST_CHECKLIST.md`](TEST_CHECKLIST.md) for automated and manual acceptance coverage. To build and register another bot, follow [Adding a Checker Agent](design/adding-checker-agent.md).

## System One agents

The opponent dropdown includes three in-browser System One decision models:

- **System One [Kev] Agent** uses the [Kev.js](https://github.com/ai-ecoverse/kev.js) 0.8B `q8f32` bundle (about 822 MB).
- **System One [Laya] Agent** uses the revision-pinned [Laya ONNX exports](https://huggingface.co/techtheist/laya-onnx), derived from [ConvAI Innovations' Laya](https://huggingface.co/convaiinnovations/laya). Its default INT8 graph is about 582 MB; INT4 is about 275 MB.
- **System One [OpenThai ONNX] Agent** uses the revision-pinned [OpenThai System One ONNX](https://huggingface.co/imtk/OpenThai-SystemOne-ONNX). Its default INT8 graph and external data total about 1.59 GB; INT4 totals about 1.41 GB. Both new model sources retain their upstream Apache-2.0 attribution.

A sole legal move is played without model inference. Other turns use the same Kev-compatible `systemOne(request)` choice contract and compact move descriptions. Kev and OpenThai consider up to 128 sampled legal moves; Laya considers up to 16 so its option head remains within its 192-token budget.

After Start is clicked, the selected bundle is downloaded with aggregate progress. Laya and OpenThai URLs include their pinned revisions, and all model files are cached by URL (therefore by model, revision, and precision) in the browser cache. Switching models releases the previous ONNX session while retaining downloaded cache entries. Failed downloads can be retried with Start. Chrome or Edge with WebGPU is recommended; ONNX Runtime Web falls back to WASM on unsupported systems, although the large OpenThai model may exceed practical WASM memory limits. Precision is never changed automatically after an error.

Both new agents default to `int8`. There is intentionally no precision control in the UI. To select INT4, change the corresponding registry factory in [`src/app/agents/agent-registry.ts`](src/app/agents/agent-registry.ts) from `{ precision: 'int8' }` to `{ precision: 'int4' }`. The same setting is available programmatically through `new LayaAgent({ precision: 'int4' })` and `new OpenThaiAgent({ precision: 'int4' })`.

The browser loads pinned Kev.js, ONNX Runtime Web 1.30, and the Hugging Face tokenizer implementation only when one of these agents is selected, keeping them out of Angular's initial bundle. The esm.sh, jsDelivr, and Hugging Face origins must be allowed by the deployment's Content Security Policy.

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
