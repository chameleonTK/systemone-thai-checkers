import { BoardGeometry } from './board-geometry';

describe('BoardGeometry', () => {
    it('maps exactly 32 playable squares on an 8 by 8 board', () => {
        const squares: number[] = [];
        for (let row = 0; row < 8; row += 1) {
            for (let column = 0; column < 8; column += 1) {
                const square = BoardGeometry.toSquare(row, column);
                if (square !== null) {
                    squares.push(square);
                }
            }
        }
        expect(squares).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
    });

    it('round trips every PDN square', () => {
        for (let square = 1; square <= 32; square += 1) {
            const coordinate = BoardGeometry.toCoordinate(square);
            expect(coordinate).not.toBeNull();
            expect(BoardGeometry.toSquare(coordinate.row, coordinate.column)).toBe(square);
        }
    });

    it('uses the N2 type-31 corner mapping', () => {
        expect(BoardGeometry.toSquare(0, 0)).toBe(1);
        expect(BoardGeometry.toSquare(0, 6)).toBe(4);
        expect(BoardGeometry.toSquare(7, 1)).toBe(29);
        expect(BoardGeometry.toSquare(7, 7)).toBe(32);
    });

    it('rejects non-playable and out-of-board coordinates', () => {
        expect(BoardGeometry.toSquare(0, 1)).toBeNull();
        expect(BoardGeometry.toSquare(-1, 0)).toBeNull();
        expect(BoardGeometry.toSquare(8, 0)).toBeNull();
        expect(BoardGeometry.toCoordinate(0)).toBeNull();
        expect(BoardGeometry.toCoordinate(33)).toBeNull();
    });

    it('converts an on-board coordinate through 180 degrees', () => {
        expect(BoardGeometry.changePerspective(0, 0)).toEqual({ row: 7, column: 7 });
        expect(BoardGeometry.changePerspective(2, 4)).toEqual({ row: 5, column: 3 });
        expect(BoardGeometry.changePerspective(8, 0)).toBeNull();
    });
});
