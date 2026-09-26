// tslint:disable:no-bitwise
import { CheckerEngine } from './checker-engine';
import { addBit } from './position-utils';
import { GamePhase, GamePosition, PlayerId } from './types';

export interface PositionFixture {
    readonly blackMen?: ReadonlyArray<number>;
    readonly blackKings?: ReadonlyArray<number>;
    readonly whiteMen?: ReadonlyArray<number>;
    readonly whiteKings?: ReadonlyArray<number>;
    readonly sideToMove?: PlayerId;
    readonly forcedSquare?: number | null;
    readonly completedTurns?: number;
    readonly noProgressTurns?: number;
    readonly turnHadCapture?: boolean;
    readonly turnMovedMan?: boolean;
}

export function squareMask(squares: ReadonlyArray<number> = []): number {
    return squares.reduce((mask, square) => addBit(mask, square - 1), 0) >>> 0;
}

export function positionFixture(value: PositionFixture): GamePosition {
    return {
        blackMen: squareMask(value.blackMen),
        blackKings: squareMask(value.blackKings),
        whiteMen: squareMask(value.whiteMen),
        whiteKings: squareMask(value.whiteKings),
        sideToMove: value.sideToMove || 'black',
        forcedSquare: value.forcedSquare == null ? -1 : value.forcedSquare - 1,
        completedTurns: value.completedTurns || 0,
        noProgressTurns: value.noProgressTurns || 0,
        turnHadCapture: !!value.turnHadCapture,
        turnMovedMan: !!value.turnMovedMan
    };
}

export function activeEngine(value: PositionFixture, phase: GamePhase = 'active'): CheckerEngine {
    return new CheckerEngine(positionFixture(value), undefined, phase);
}
