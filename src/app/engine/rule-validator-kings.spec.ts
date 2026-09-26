import { MoveCodec } from './move-codec';
import { RuleValidator } from './rule-validator';
import { positionFixture } from './test-fixtures';

describe('RuleValidator kings', () => {
    const rules = new RuleValidator();

    it('moves any unobstructed distance in all diagonal directions', () => {
        const position = positionFixture({ blackKings: [14], whiteMen: [32] });
        const moves: number[] = [];
        rules.generateLegalMoves(position, moves);
        const destinations = moves.map((move) => MoveCodec.toIndex(move) + 1).sort((a, b) => a - b);
        expect(destinations).toEqual([1, 4, 5, 7, 10, 11, 18, 19, 21, 23, 25, 28]);
    });

    it('passes empty squares and captures the first opponent with immediate landing', () => {
        const position = positionFixture({ blackKings: [14], whiteMen: [21, 32] });
        const moves: number[] = [];
        rules.generateLegalMoves(position, moves);
        expect(moves.length).toBe(1);
        expect(MoveCodec.toOption(moves[0])).toEqual(jasmine.objectContaining({
            from: 14, to: 25, capture: true, capturedSquare: 21
        }));
        expect(rules.validateAtomicMove(position, { from: 14, to: 29 })).toBeNull();
    });

    it('cannot cross a friendly piece', () => {
        const position = positionFixture({ blackKings: [14], blackMen: [18], whiteMen: [21] });
        expect(rules.validateAtomicMove(position, { from: 14, to: 25 })).toBeNull();
    });

    it('cannot capture through two occupied squares', () => {
        const position = positionFixture({ blackKings: [14], whiteMen: [21, 25] });
        const moves: number[] = [];
        rules.generateLegalMoves(position, moves);
        expect(moves.some((move) => MoveCodec.isCapture(move))).toBeFalse();
    });

    it('supports any number of kings without a special cap', () => {
        const position = positionFixture({ blackKings: [1, 2, 3, 4, 5, 6, 7, 8], whiteKings: [32] });
        const moves: number[] = [];
        expect(() => rules.generateLegalMoves(position, moves)).not.toThrow();
        expect(moves.length).toBeGreaterThan(0);
    });
});
