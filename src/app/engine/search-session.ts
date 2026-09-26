import { MoveCodec } from './move-codec';
import { countBits, positionKey } from './position-utils';
import { RuleValidator } from './rule-validator';
import {
    clonePosition,
    GamePosition,
    GameResult,
    ONGOING_RESULT,
    PlayerId,
    SimulationSeedValue
} from './types';

interface SearchUndo {
    position: GamePosition;
    result: GameResult;
    recordedKey: string | null;
}

export class SimulationSeed implements SimulationSeedValue {
    readonly position: GamePosition;
    readonly repetitions: ReadonlyArray<readonly [string, number]>;

    constructor(position: GamePosition, repetitions: ReadonlyArray<readonly [string, number]>) {
        this.position = clonePosition(position);
        this.repetitions = repetitions.map((entry) => [entry[0], entry[1]] as const);
    }

    createSession(): SearchSession {
        return new SearchSession(this);
    }
}

export class SearchSession {
    private position: GamePosition;
    private result: GameResult = ONGOING_RESULT;
    private readonly repetitions: Map<string, number>;
    private readonly undoStack: SearchUndo[] = [];
    private readonly validationBuffer: number[] = [];
    private undoDepth = 0;
    private readonly root: SimulationSeed;
    private readonly rules: RuleValidator;

    constructor(seed: SimulationSeed, rules: RuleValidator = new RuleValidator()) {
        this.root = new SimulationSeed(seed.position, seed.repetitions);
        this.position = clonePosition(seed.position);
        this.repetitions = new Map<string, number>(seed.repetitions as Array<[string, number]>);
        this.rules = rules;
    }

    legalMoves(buffer: number[] = []): number {
        if (this.result.status !== 'ongoing') {
            buffer.length = 0;
            return 0;
        }
        return this.rules.generateLegalMoves(this.position, buffer);
    }

    makeMove(move: number): GameResult {
        if (this.result.status !== 'ongoing') {
            throw new Error('Cannot move after the simulated game has ended.');
        }
        this.rules.generateLegalMoves(this.position, this.validationBuffer);
        if (this.validationBuffer.indexOf(move) < 0) {
            throw new Error('The encoded move is not legal in this simulated position.');
        }

        const undo = this.undoStack[this.undoDepth] || {
            position: clonePosition(this.position), result: this.result, recordedKey: null
        };
        this.copyPosition(this.position, undo.position);
        undo.result = this.result;
        undo.recordedKey = null;
        this.undoStack[this.undoDepth] = undo;
        this.undoDepth += 1;
        const facts = this.rules.applyValidatedMove(this.position, move);
        let recordedKey: string | null = null;
        let repetitionCount = 0;
        if (facts.turnCompleted) {
            recordedKey = positionKey(this.position);
            repetitionCount = (this.repetitions.get(recordedKey) || 0) + 1;
            this.repetitions.set(recordedKey, repetitionCount);
            this.result = this.rules.evaluateResult(this.position, { repetitionCount });
        }
        undo.recordedKey = recordedKey;
        return this.result;
    }

    unmakeMove(): void {
        if (this.undoDepth === 0) {
            throw new Error('There is no simulated move to unmake.');
        }
        this.undoDepth -= 1;
        const undo = this.undoStack[this.undoDepth];
        if (undo.recordedKey !== null) {
            const count = this.repetitions.get(undo.recordedKey) || 0;
            if (count <= 1) {
                this.repetitions.delete(undo.recordedKey);
            } else {
                this.repetitions.set(undo.recordedKey, count - 1);
            }
        }
        this.copyPosition(undo.position, this.position);
        this.result = undo.result;
    }

    getResult(): GameResult {
        return this.result;
    }

    getPosition(): GamePosition {
        return clonePosition(this.position);
    }

    evaluateMaterial(player: PlayerId): number {
        const black = countBits(this.position.blackMen) + 3 * countBits(this.position.blackKings);
        const white = countBits(this.position.whiteMen) + 3 * countBits(this.position.whiteKings);
        return player === 'black' ? black - white : white - black;
    }

    cloneRoot(): SearchSession {
        return new SearchSession(this.root, this.rules);
    }

    moveToIntent(move: number): { from: number; to: number } {
        return { from: MoveCodec.fromIndex(move) + 1, to: MoveCodec.toIndex(move) + 1 };
    }

    private copyPosition(source: GamePosition, target: GamePosition): void {
        target.blackMen = source.blackMen;
        target.blackKings = source.blackKings;
        target.whiteMen = source.whiteMen;
        target.whiteKings = source.whiteKings;
        target.sideToMove = source.sideToMove;
        target.forcedSquare = source.forcedSquare;
        target.completedTurns = source.completedTurns;
        target.noProgressTurns = source.noProgressTurns;
        target.turnHadCapture = source.turnHadCapture;
        target.turnMovedMan = source.turnMovedMan;
    }
}
