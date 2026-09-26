import { BoardGeometry } from './board-geometry';
import { MoveCodec } from './move-codec';
import {
    ApplyFacts,
    clonePosition,
    GamePosition,
    GameResult,
    MoveIntent,
    ONGOING_RESULT,
    opponent,
    PlayerId,
    RuleEvaluationContext
} from './types';
import {
    addBit,
    hasBit,
    kindAt,
    occupancy,
    opponentMask,
    ownerAt,
    playerMask,
    removeBit
} from './position-utils';

const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1]
];

export class RuleValidator {
    private readonly continuationBuffer: number[] = [];
    private readonly resultBuffer: number[] = [];

    generateLegalMoves(position: GamePosition, buffer: number[] = []): number {
        buffer.length = 0;

        if (position.forcedSquare >= 0) {
            this.generateCapturesFor(position, position.forcedSquare, buffer);
            return buffer.length;
        }

        const owned = playerMask(position, position.sideToMove);
        for (let index = 0; index < BoardGeometry.PLAYABLE_SQUARES; index += 1) {
            if (hasBit(owned, index)) {
                this.generateCapturesFor(position, index, buffer);
            }
        }
        if (buffer.length > 0) {
            return buffer.length;
        }

        for (let index = 0; index < BoardGeometry.PLAYABLE_SQUARES; index += 1) {
            if (hasBit(owned, index)) {
                this.generateQuietMovesFor(position, index, buffer);
            }
        }
        return buffer.length;
    }

    validateAtomicMove(position: GamePosition, intent: MoveIntent): number | null {
        if (!Number.isInteger(intent.from) || !Number.isInteger(intent.to)) {
            return null;
        }
        if (intent.from < 1 || intent.from > 32 || intent.to < 1 || intent.to > 32) {
            return null;
        }
        const moves: number[] = [];
        this.generateLegalMoves(position, moves);
        const fromIndex = intent.from - 1;
        const toIndex = intent.to - 1;
        const move = moves.find((candidate) =>
            MoveCodec.fromIndex(candidate) === fromIndex && MoveCodec.toIndex(candidate) === toIndex);
        return move === undefined ? null : move;
    }

    applyValidatedMove(position: GamePosition, move: number): ApplyFacts {
        const player = position.sideToMove;
        const from = MoveCodec.fromIndex(move);
        const to = MoveCodec.toIndex(move);
        const movingKind = kindAt(position, from);
        if (movingKind === null || ownerAt(position, from) !== player) {
            throw new Error('Encoded move source does not contain the active player piece.');
        }

        this.removePiece(position, player, movingKind, from);
        if (MoveCodec.isCapture(move)) {
            const captured = MoveCodec.capturedIndex(move);
            const capturedOwner = ownerAt(position, captured);
            const capturedKind = kindAt(position, captured);
            if (capturedOwner !== opponent(player) || capturedKind === null) {
                throw new Error('Encoded capture does not identify an opponent piece.');
            }
            this.removePiece(position, capturedOwner, capturedKind, captured);
            position.turnHadCapture = true;
        }

        const resultingKind = MoveCodec.isPromotion(move) ? 'king' : movingKind;
        this.addPiece(position, player, resultingKind, to);
        if (movingKind === 'man') {
            position.turnMovedMan = true;
        }

        if (MoveCodec.isCapture(move) && !MoveCodec.isPromotion(move)) {
            this.continuationBuffer.length = 0;
            this.generateCapturesFor(position, to, this.continuationBuffer);
            if (this.continuationBuffer.length > 0) {
                position.forcedSquare = to;
                return { move, turnCompleted: false, sideChanged: false };
            }
        }

        position.forcedSquare = -1;
        position.sideToMove = opponent(player);
        position.completedTurns += 1;
        position.noProgressTurns = position.turnHadCapture || position.turnMovedMan
            ? 0
            : Math.min(50, position.noProgressTurns + 1);
        position.turnHadCapture = false;
        position.turnMovedMan = false;
        return { move, turnCompleted: true, sideChanged: true };
    }

    evaluateResult(position: GamePosition, context: RuleEvaluationContext): GameResult {
        const player = position.sideToMove;
        if (playerMask(position, player) === 0) {
            return { status: 'win', winner: opponent(player), loser: player, reason: 'no-pieces' };
        }

        this.generateLegalMoves(position, this.resultBuffer);
        if (this.resultBuffer.length === 0) {
            return { status: 'win', winner: opponent(player), loser: player, reason: 'no-legal-move' };
        }
        if (context.repetitionCount >= 3) {
            return { status: 'draw', reason: 'threefold-repetition' };
        }
        if (position.noProgressTurns >= 50) {
            return { status: 'draw', reason: 'fifty-turn-rule' };
        }
        return ONGOING_RESULT;
    }

    adjudicateResignation(player: PlayerId): GameResult {
        return { status: 'win', winner: opponent(player), loser: player, reason: 'resignation' };
    }

    enumerateTurnPaths(position: GamePosition): number[][] {
        const result: number[][] = [];
        const moves: number[] = [];
        this.generateLegalMoves(position, moves);
        const originalPlayer = position.sideToMove;
        moves.forEach((move) => {
            const child = clonePosition(position);
            this.applyValidatedMove(child, move);
            this.collectTurnPaths(child, originalPlayer, [move], result);
        });
        return result;
    }

    private collectTurnPaths(
        position: GamePosition,
        originalPlayer: PlayerId,
        path: number[],
        result: number[][]
    ): void {
        if (position.sideToMove !== originalPlayer) {
            result.push(path);
            return;
        }
        const moves: number[] = [];
        this.generateLegalMoves(position, moves);
        moves.forEach((move) => {
            const child = clonePosition(position);
            this.applyValidatedMove(child, move);
            this.collectTurnPaths(child, originalPlayer, path.concat(move), result);
        });
    }

    private generateQuietMovesFor(position: GamePosition, index: number, buffer: number[]): void {
        const player = position.sideToMove;
        const kind = kindAt(position, index);
        if (kind === null || ownerAt(position, index) !== player) {
            return;
        }
        if (kind === 'man') {
            const rowDelta = player === 'black' ? 1 : -1;
            [-1, 1].forEach((columnDelta) => {
                const destination = BoardGeometry.step(index, rowDelta, columnDelta);
                if (destination >= 0 && !hasBit(occupancy(position), destination)) {
                    buffer.push(MoveCodec.encode(index, destination, -1, this.promotes(player, destination)));
                }
            });
            return;
        }

        DIAGONALS.forEach((direction) => {
            let destination = BoardGeometry.step(index, direction[0], direction[1]);
            while (destination >= 0) {
                if (hasBit(occupancy(position), destination)) {
                    break;
                }
                buffer.push(MoveCodec.encode(index, destination, -1, false));
                destination = BoardGeometry.step(destination, direction[0], direction[1]);
            }
        });
    }

    private generateCapturesFor(position: GamePosition, index: number, buffer: number[]): void {
        const player = position.sideToMove;
        const kind = kindAt(position, index);
        if (kind === null || ownerAt(position, index) !== player) {
            return;
        }
        if (kind === 'man') {
            const rowDelta = player === 'black' ? 1 : -1;
            [-1, 1].forEach((columnDelta) => {
                const captured = BoardGeometry.step(index, rowDelta, columnDelta);
                const destination = captured < 0
                    ? -1
                    : BoardGeometry.step(captured, rowDelta, columnDelta);
                if (captured >= 0 && destination >= 0
                    && hasBit(opponentMask(position, player), captured)
                    && !hasBit(occupancy(position), destination)) {
                    buffer.push(MoveCodec.encode(index, destination, captured, this.promotes(player, destination)));
                }
            });
            return;
        }

        DIAGONALS.forEach((direction) => {
            let square = BoardGeometry.step(index, direction[0], direction[1]);
            while (square >= 0) {
                if (!hasBit(occupancy(position), square)) {
                    square = BoardGeometry.step(square, direction[0], direction[1]);
                    continue;
                }
                if (hasBit(playerMask(position, player), square)) {
                    break;
                }
                const landing = BoardGeometry.step(square, direction[0], direction[1]);
                if (landing >= 0 && !hasBit(occupancy(position), landing)) {
                    buffer.push(MoveCodec.encode(index, landing, square, false));
                }
                break;
            }
        });
    }

    private promotes(player: PlayerId, destination: number): boolean {
        const coordinate = BoardGeometry.toCoordinate(destination + 1);
        return !!coordinate && (player === 'black' ? coordinate.row === 7 : coordinate.row === 0);
    }

    private removePiece(position: GamePosition, player: PlayerId, kind: 'man' | 'king', index: number): void {
        const property = player === 'black'
            ? (kind === 'man' ? 'blackMen' : 'blackKings')
            : (kind === 'man' ? 'whiteMen' : 'whiteKings');
        position[property] = removeBit(position[property], index);
    }

    private addPiece(position: GamePosition, player: PlayerId, kind: 'man' | 'king', index: number): void {
        const property = player === 'black'
            ? (kind === 'man' ? 'blackMen' : 'blackKings')
            : (kind === 'man' ? 'whiteMen' : 'whiteKings');
        position[property] = addBit(position[property], index);
    }
}
