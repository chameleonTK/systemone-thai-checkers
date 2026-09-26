import { CheckerEngine } from './checker-engine';
import { activeEngine } from './test-fixtures';

describe('CheckerEngine lifecycle and history', () => {
    it('starts ready with eight men each and activates Black only after start', () => {
        const engine = CheckerEngine.createThaiGame();
        const ready = engine.getSnapshot();
        expect(ready.phase).toBe('ready');
        expect(ready.players.map((player) => player.manCount)).toEqual([8, 8]);
        expect(ready.players.map((player) => player.kingCount)).toEqual([0, 0]);
        expect(ready.legalMoves.length).toBe(0);

        const started = engine.start();
        expect(started.accepted).toBeTrue();
        expect(engine.getSnapshot().activePlayer).toBe('black');
        expect(engine.getSnapshot().legalMoves.length).toBeGreaterThan(0);
    });

    it('rejects illegal and stale moves without mutation', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const before = engine.getSnapshot();
        expect(engine.applyMove({ from: 1, to: 5 }, before.revision).accepted).toBeFalse();
        expect(engine.applyMove({ from: 5, to: 9 }, before.revision - 1).accepted).toBeFalse();
        expect(engine.getSnapshot()).toEqual(before);
    });

    it('rewinds a quiet move and increases revision while decreasing step index', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [32] });
        engine.applyMove({ from: 9, to: 13 }, 0);
        const moved = engine.getSnapshot();
        const rewind = engine.rewind();
        expect(rewind.accepted).toBeTrue();
        const restored = engine.getSnapshot();
        expect(restored.pieces).toContain(jasmine.objectContaining({ square: 9, player: 'black', kind: 'man' }));
        expect(restored.activePlayer).toBe('black');
        expect(restored.stepIndex).toBe(moved.stepIndex - 1);
        expect(restored.revision).toBeGreaterThan(moved.revision);
    });

    it('rewinds a capture and restores a captured king', () => {
        const engine = activeEngine({ blackMen: [9], whiteKings: [13, 32] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        engine.rewind();
        expect(engine.getSnapshot().pieces).toContain(jasmine.objectContaining({
            square: 13, player: 'white', kind: 'king'
        }));
    });

    it('rewinds promotion and demotes the restored piece', () => {
        const engine = activeEngine({ blackMen: [25], whiteMen: [4] });
        engine.applyMove({ from: 25, to: 29 }, 0);
        engine.rewind();
        expect(engine.getSnapshot().pieces).toContain(jasmine.objectContaining({
            square: 25, player: 'black', kind: 'man'
        }));
    });

    it('rewinds the final jump to the forced continuation state', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        engine.applyMove({ from: 18, to: 27 }, 1);
        engine.rewind();
        const snapshot = engine.getSnapshot();
        expect(snapshot.activePlayer).toBe('black');
        expect(snapshot.forcedSquare).toBe(18);
        expect(snapshot.legalMoves).toEqual([
            jasmine.objectContaining({ from: 18, to: 27, capturedSquare: 22 })
        ]);
    });

    it('rewinds a terminal move back to active', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        expect(engine.getSnapshot().phase).toBe('ended');
        engine.rewind();
        expect(engine.getSnapshot().phase).toBe('active');
        expect(engine.getSnapshot().result.status).toBe('ongoing');
    });

    it('stops safely at the initial history boundary', () => {
        const engine = CheckerEngine.createThaiGame();
        const before = engine.getSnapshot();
        const result = engine.rewind();
        expect(result.accepted).toBeFalse();
        expect(engine.getSnapshot()).toEqual(before);
    });

    it('groups atomic capture steps into one public turn', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        expect(engine.getSnapshot().history.length).toBe(1);
        expect(engine.getSnapshot().history[0].completed).toBeFalse();
        engine.applyMove({ from: 18, to: 27 }, 1);
        expect(engine.getSnapshot().history.length).toBe(1);
        expect(engine.getSnapshot().history[0].steps.length).toBe(2);
        expect(engine.getSnapshot().history[0].completed).toBeTrue();
    });

    it('restores completed-turn and no-progress counters exactly', () => {
        const engine = activeEngine({
            blackKings: [1], whiteKings: [4], completedTurns: 12, noProgressTurns: 48
        });
        engine.applyMove({ from: 1, to: 5 }, 0);
        expect(engine.getSnapshot().completedTurns).toBe(13);
        expect(engine.getSnapshot().noProgressTurns).toBe(49);
        engine.rewind();
        expect(engine.getSnapshot().completedTurns).toBe(12);
        expect(engine.getSnapshot().noProgressTurns).toBe(48);
    });

    it('rejects resignation by the inactive player without mutation', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const before = engine.getSnapshot();
        expect(engine.resign('white').accepted).toBeFalse();
        expect(engine.getSnapshot()).toEqual(before);
    });
});
