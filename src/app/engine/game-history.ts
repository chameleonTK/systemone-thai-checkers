import { MoveCodec } from './move-codec';
import { kindAt } from './position-utils';
import {
    clonePosition,
    GamePhase,
    GamePosition,
    GameResult,
    PlayerId,
    PublicStepRecord,
    PublicTurnRecord
} from './types';

export interface UndoRecord {
    readonly before: GamePosition;
    readonly beforePhase: GamePhase;
    readonly beforeResult: GameResult;
    readonly move: number;
    readonly player: PlayerId;
    readonly turnId: number;
    readonly turnCompleted: boolean;
    readonly recordedRepetitionKey: string | null;
    readonly publicStep: PublicStepRecord;
}

export class GameHistory {
    private readonly undoRecords: UndoRecord[] = [];
    private readonly repetitions = new Map<string, number>();

    constructor(initialPositionKey: string) {
        this.repetitions.set(initialPositionKey, 1);
    }

    get stepCount(): number {
        return this.undoRecords.length;
    }

    recordStep(
        before: GamePosition,
        beforePhase: GamePhase,
        beforeResult: GameResult,
        move: number,
        turnCompleted: boolean,
        recordedRepetitionKey: string | null
    ): void {
        const capturedIndex = MoveCodec.capturedIndex(move);
        const publicStep: PublicStepRecord = {
            from: MoveCodec.fromIndex(move) + 1,
            to: MoveCodec.toIndex(move) + 1,
            capture: MoveCodec.isCapture(move),
            capturedSquare: capturedIndex >= 0 ? capturedIndex + 1 : null,
            capturedKind: capturedIndex >= 0 ? kindAt(before, capturedIndex) : null,
            promotion: MoveCodec.isPromotion(move)
        };
        this.undoRecords.push({
            before: clonePosition(before),
            beforePhase,
            beforeResult,
            move,
            player: before.sideToMove,
            turnId: before.completedTurns,
            turnCompleted,
            recordedRepetitionKey,
            publicStep
        });
    }

    popStep(): UndoRecord | null {
        const record = this.undoRecords.pop();
        if (!record) {
            return null;
        }
        if (record.recordedRepetitionKey !== null) {
            const count = this.repetitions.get(record.recordedRepetitionKey) || 0;
            if (count <= 1) {
                this.repetitions.delete(record.recordedRepetitionKey);
            } else {
                this.repetitions.set(record.recordedRepetitionKey, count - 1);
            }
        }
        return record;
    }

    recordPosition(key: string): number {
        const count = (this.repetitions.get(key) || 0) + 1;
        this.repetitions.set(key, count);
        return count;
    }

    repetitionCount(key: string): number {
        return this.repetitions.get(key) || 0;
    }

    repetitionEntries(): Array<readonly [string, number]> {
        return Array.from(this.repetitions.entries());
    }

    publicTurns(): PublicTurnRecord[] {
        const turns: PublicTurnRecord[] = [];
        let currentTurnId = -1;
        this.undoRecords.forEach((record) => {
            const current = turns[turns.length - 1];
            if (!current || record.turnId !== currentTurnId) {
                turns.push({ player: record.player, steps: [record.publicStep], completed: record.turnCompleted });
                currentTurnId = record.turnId;
                return;
            }
            const steps = current.steps.concat(record.publicStep);
            turns[turns.length - 1] = { player: current.player, steps, completed: record.turnCompleted };
        });
        return turns;
    }
}
