import { MoveCodec } from './move-codec';
import { RuleValidator } from './rule-validator';
import { positionFixture } from './test-fixtures';

describe('RuleValidator ordinary pieces', () => {
    const rules = new RuleValidator();

    function options(value: Parameters<typeof positionFixture>[0]): Array<{ from: number; to: number; capture: boolean }> {
        const moves: number[] = [];
        rules.generateLegalMoves(positionFixture(value), moves);
        return moves.map((move) => ({
            from: MoveCodec.fromIndex(move) + 1,
            to: MoveCodec.toIndex(move) + 1,
            capture: MoveCodec.isCapture(move)
        }));
    }

    it('moves a black man one diagonal row forward', () => {
        expect(options({ blackMen: [10], whiteMen: [32] })).toEqual([
            { from: 10, to: 13, capture: false },
            { from: 10, to: 14, capture: false }
        ]);
    });

    it('moves a white man toward decreasing rows', () => {
        expect(options({ blackMen: [1], whiteMen: [23], sideToMove: 'white' })).toEqual([
            { from: 23, to: 19, capture: false },
            { from: 23, to: 20, capture: false }
        ]);
    });

    it('does not move a man backward, sideways, onto an occupied square, or off board', () => {
        const position = positionFixture({ blackMen: [10, 13], whiteMen: [32] });
        expect(rules.validateAtomicMove(position, { from: 10, to: 6 })).toBeNull();
        expect(rules.validateAtomicMove(position, { from: 10, to: 11 })).toBeNull();
        expect(rules.validateAtomicMove(position, { from: 10, to: 13 })).toBeNull();
        expect(rules.validateAtomicMove(position, { from: 10, to: 33 })).toBeNull();
    });

    it('captures one forward opponent onto the immediate empty landing square', () => {
        const moves = options({ blackMen: [9], whiteMen: [13, 32] });
        expect(moves).toEqual([{ from: 9, to: 18, capture: true }]);
    });

    it('rejects backward captures, friendly captures, and occupied landings', () => {
        expect(rules.validateAtomicMove(
            positionFixture({ blackMen: [9], whiteMen: [5, 32] }), { from: 9, to: 2 })).toBeNull();
        expect(rules.validateAtomicMove(
            positionFixture({ blackMen: [9, 13], whiteMen: [32] }), { from: 9, to: 18 })).toBeNull();
        expect(rules.validateAtomicMove(
            positionFixture({ blackMen: [9, 18], whiteMen: [13, 32] }), { from: 9, to: 18 })).toBeNull();
    });

    it('removes every quiet option when any friendly piece can capture', () => {
        const moves = options({ blackMen: [8, 9], whiteMen: [13, 32] });
        expect(moves).toEqual([{ from: 9, to: 18, capture: true }]);
    });

    it('allows a shorter capture route when another route captures more pieces', () => {
        const moves = options({ blackMen: [10], whiteMen: [13, 14, 22] });
        expect(moves).toContain(jasmine.objectContaining({ from: 10, to: 17, capture: true }));
        expect(moves).toContain(jasmine.objectContaining({ from: 10, to: 19, capture: true }));
    });
});
