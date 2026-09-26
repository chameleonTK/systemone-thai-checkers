export interface Coordinate {
    readonly row: number;
    readonly column: number;
}

export class BoardGeometry {
    static readonly BOARD_SIZE = 8;
    static readonly PLAYABLE_SQUARES = 32;

    static onBoard(row: number, column: number): boolean {
        return row >= 0 && row < this.BOARD_SIZE && column >= 0 && column < this.BOARD_SIZE;
    }

    static isPlayable(row: number, column: number): boolean {
        return this.onBoard(row, column) && (row + column) % 2 === 0;
    }

    static toSquare(row: number, column: number): number | null {
        if (!this.isPlayable(row, column)) {
            return null;
        }
        return row * 4 + Math.floor(column / 2) + 1;
    }

    static toIndex(row: number, column: number): number {
        const square = this.toSquare(row, column);
        return square === null ? -1 : square - 1;
    }

    static toCoordinate(square: number): Coordinate | null {
        if (!Number.isInteger(square) || square < 1 || square > this.PLAYABLE_SQUARES) {
            return null;
        }
        const index = square - 1;
        const row = Math.floor(index / 4);
        const column = 2 * (index % 4) + (row % 2 === 0 ? 0 : 1);
        return { row, column };
    }

    static changePerspective(row: number, column: number): Coordinate | null {
        if (!this.onBoard(row, column)) {
            return null;
        }
        return { row: this.BOARD_SIZE - row - 1, column: this.BOARD_SIZE - column - 1 };
    }

    static step(index: number, rowDelta: number, columnDelta: number): number {
        const coordinate = this.toCoordinate(index + 1);
        if (!coordinate) {
            return -1;
        }
        return this.toIndex(coordinate.row + rowDelta, coordinate.column + columnDelta);
    }

    static ray(index: number, rowDelta: number, columnDelta: number): number[] {
        const result: number[] = [];
        let next = this.step(index, rowDelta, columnDelta);
        while (next >= 0) {
            result.push(next);
            next = this.step(next, rowDelta, columnDelta);
        }
        return result;
    }
}
