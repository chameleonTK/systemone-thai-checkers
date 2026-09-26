import { CheckerEngine } from './checker-engine';
import { MoveCodec } from './move-codec';
import { RuleValidator } from './rule-validator';
import { activeEngine, positionFixture } from './test-fixtures';

describe('Capture chains and promotion', () => {
    const rules = new RuleValidator();

    it('forces the same piece to complete a multi-jump', () => {
        const position = positionFixture({ blackMen: [9, 10], whiteMen: [13, 22, 32] });
        const first = rules.validateAtomicMove(position, { from: 9, to: 18 });
        expect(first).not.toBeNull();
        const facts = rules.applyValidatedMove(position, first as number);
        expect(facts.turnCompleted).toBeFalse();
        expect(position.sideToMove).toBe('black');
        expect(position.forcedSquare).toBe(17);
        const continuations: number[] = [];
        rules.generateLegalMoves(position, continuations);
        expect(continuations.map((move) => MoveCodec.toOption(move))).toEqual([
            jasmine.objectContaining({ from: 18, to: 27, capturedSquare: 22 })
        ]);
        expect(rules.validateAtomicMove(position, { from: 10, to: 14 })).toBeNull();
    });

    it('removes a captured piece immediately during a chain', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22, 32] });
        const result = engine.applyMove({ from: 9, to: 18 }, 0);
        expect(result.accepted).toBeTrue();
        const snapshot = engine.getSnapshot();
        expect(snapshot.pieces.some((piece) => piece.square === 13)).toBeFalse();
        expect(snapshot.forcedSquare).toBe(18);
        expect(snapshot.completedTurns).toBe(0);
    });

    it('promotes Black and White only on the opponent back rank', () => {
        const black = activeEngine({ blackMen: [25], whiteMen: [4] });
        black.applyMove({ from: 25, to: 29 }, 0);
        expect(black.getSnapshot().pieces).toContain(jasmine.objectContaining({
            square: 29, player: 'black', kind: 'king'
        }));

        const white = activeEngine({ blackMen: [29], whiteMen: [8], sideToMove: 'white' });
        white.applyMove({ from: 8, to: 4 }, 0);
        expect(white.getSnapshot().pieces).toContain(jasmine.objectContaining({
            square: 4, player: 'white', kind: 'king'
        }));
    });

    it('does not promote before the back rank', () => {
        const engine = activeEngine({ blackMen: [21], whiteMen: [4] });
        engine.applyMove({ from: 21, to: 25 }, 0);
        expect(engine.getSnapshot().pieces).toContain(jasmine.objectContaining({ square: 25, kind: 'man' }));
    });

    it('ends the turn on promotion even if the new king could capture', () => {
        const engine = activeEngine({ blackMen: [22], whiteMen: [19, 26] });
        const result = engine.applyMove({ from: 22, to: 29 }, 0);
        expect(result.accepted).toBeTrue();
        const snapshot = engine.getSnapshot();
        expect(snapshot.activePlayer).toBe('white');
        expect(snapshot.forcedSquare).toBeNull();
        expect(snapshot.pieces).toContain(jasmine.objectContaining({ square: 29, kind: 'king' }));
    });
});

describe('Terminal rules', () => {
    it('wins after capturing the opponent last piece', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        expect(engine.getSnapshot().result).toEqual({
            status: 'win', winner: 'black', loser: 'white', reason: 'no-pieces'
        });
    });

    it('wins when the opponent still has a piece but no legal move', () => {
        const engine = activeEngine({ blackKings: [32], whiteMen: [1] });
        engine.applyMove({ from: 32, to: 28 }, 0);
        expect(engine.getSnapshot().result).toEqual({
            status: 'win', winner: 'black', loser: 'white', reason: 'no-legal-move'
        });
    });

    it('awards the opponent a resignation win', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        engine.resign('black');
        expect(engine.getSnapshot().result).toEqual({
            status: 'win', winner: 'white', loser: 'black', reason: 'resignation'
        });
    });

    it('draws on the third completed-turn occurrence including the initial position', () => {
        const engine = activeEngine({ blackKings: [1], whiteKings: [4] });
        const cycle = [[1, 5], [4, 8], [5, 1], [8, 4]];
        for (let repeat = 0; repeat < 2; repeat += 1) {
            cycle.forEach((move) => {
                const result = engine.applyMove(
                    { from: move[0], to: move[1] }, engine.getSnapshot().revision);
                expect(result.accepted).toBeTrue();
            });
        }
        expect(engine.getSnapshot().result).toEqual({ status: 'draw', reason: 'threefold-repetition' });
    });

    it('distinguishes the same masks with a different side to move', () => {
        const black = positionFixture({ blackKings: [1], whiteKings: [4], sideToMove: 'black' });
        const white = positionFixture({ blackKings: [1], whiteKings: [4], sideToMove: 'white' });
        const rules = new RuleValidator();
        expect(rules.evaluateResult(black, { repetitionCount: 3 }).status).toBe('draw');
        expect(rules.evaluateResult(white, { repetitionCount: 1 }).status).toBe('ongoing');
    });

    it('continues at 49 no-progress turns and draws on the 50th', () => {
        const at48 = activeEngine({ blackKings: [1], whiteKings: [4], noProgressTurns: 48 });
        at48.applyMove({ from: 1, to: 5 }, 0);
        expect(at48.getSnapshot().noProgressTurns).toBe(49);
        expect(at48.getSnapshot().result.status).toBe('ongoing');

        const at49 = activeEngine({ blackKings: [1], whiteKings: [4], noProgressTurns: 49 });
        at49.applyMove({ from: 1, to: 5 }, 0);
        expect(at49.getSnapshot().result).toEqual({ status: 'draw', reason: 'fifty-turn-rule' });
    });

    it('resets the no-progress counter on a man advance or capture', () => {
        const advance = activeEngine({ blackMen: [9], whiteKings: [32], noProgressTurns: 49 });
        advance.applyMove({ from: 9, to: 13 }, 0);
        expect(advance.getSnapshot().noProgressTurns).toBe(0);

        const capture = activeEngine({ blackMen: [9], whiteMen: [13], whiteKings: [32], noProgressTurns: 49 });
        capture.applyMove({ from: 9, to: 18 }, 0);
        expect(capture.getSnapshot().noProgressTurns).toBe(0);
    });

    it('counts a multi-jump chain as one completed turn', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        expect(engine.getSnapshot().completedTurns).toBe(0);
        engine.applyMove({ from: 18, to: 27 }, 1);
        expect(engine.getSnapshot().completedTurns).toBe(1);
    });
});
