import { CheckerEngine } from '../engine';
import { GamePresenter } from './game-presenter';

describe('GamePresenter', () => {
    const emptySelection = { selectedSquare: null, highlightedSquares: [] as number[] };

    it('creates the legacy-shaped 8 by 8 board view only at presentation time', () => {
        const engine = CheckerEngine.createThaiGame();
        const model = new GamePresenter().project(engine.getSnapshot(), {
            mode: 'live', selection: emptySelection
        });
        expect(model.board.tiles.length).toBe(8);
        expect(model.board.tiles.every((row) => row.length === 8)).toBeTrue();
        expect(model.board.pieces.length).toBe(16);
        expect(model.controls.canStart).toBeTrue();
    });

    it('merges transient selection without modifying the snapshot', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const snapshot = engine.getSnapshot();
        const model = new GamePresenter().project(snapshot, {
            mode: 'live', selection: { selectedSquare: 5, highlightedSquares: [9] }
        });
        expect(model.board.pieces.find((piece) => piece.square === 5).selected).toBeTrue();
        expect(model.board.tiles[2][0].highlighted).toBeTrue();
        expect(snapshot.pieces.some((piece) => (piece as any).selected)).toBeFalse();
    });

    it('disables live piece input in review mode', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const model = new GamePresenter().project(engine.getSnapshot(), {
            mode: 'review', selection: emptySelection, reviewCursor: 0, reviewLength: 2
        });
        expect(model.board.pieces.every((piece) => !piece.enabled)).toBeTrue();
        expect(model.controls.canReviewStepForward).toBeTrue();
        expect(model.controls.canReturnToLive).toBeTrue();
    });

    it('uses the configured winner name in terminal text', () => {
        const engine = CheckerEngine.createThaiGame([
            { id: 'black', name: 'Somchai', color: '#000' },
            { id: 'white', name: 'Mali', color: '#fff' }
        ]);
        engine.start();
        engine.resign('black');
        const model = new GamePresenter().project(engine.getSnapshot(), {
            mode: 'live', selection: emptySelection
        });
        expect(model.resultText).toBe('Mali wins: opponent resigned');
    });
});
