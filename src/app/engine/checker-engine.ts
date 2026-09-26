// tslint:disable:no-bitwise
import { GameHistory } from './game-history';
import { MoveCodec } from './move-codec';
import { countBits, hasBit, positionKey } from './position-utils';
import { RuleValidator } from './rule-validator';
import { SimulationSeed } from './search-session';
import {
    clonePosition,
    CommandResult,
    GamePhase,
    GamePosition,
    GameResult,
    GameSnapshot,
    MoveIntent,
    MoveOption,
    ONGOING_RESULT,
    PieceState,
    PlayerConfig,
    PlayerState
} from './types';

const DEFAULT_PLAYERS: ReadonlyArray<PlayerConfig> = [
    { id: 'black', name: 'Player 1', color: '#444444' },
    { id: 'white', name: 'Player 2', color: '#e26b6b' }
];

export class CheckerEngine {
    private position: GamePosition;
    private phase: GamePhase;
    private result: GameResult = ONGOING_RESULT;
    private revision = 0;
    private readonly players: ReadonlyArray<PlayerConfig>;
    private readonly rules: RuleValidator;
    private readonly history: GameHistory;

    constructor(
        position: GamePosition = CheckerEngine.initialPosition(),
        players: ReadonlyArray<PlayerConfig> = DEFAULT_PLAYERS,
        phase: GamePhase = 'ready',
        rules: RuleValidator = new RuleValidator()
    ) {
        if (players.length !== 2 || players[0].id !== 'black' || players[1].id !== 'white') {
            throw new Error('Exactly two players ordered as black and white are required.');
        }
        this.position = clonePosition(position);
        this.players = players.map((player) => ({ ...player }));
        this.phase = phase;
        this.rules = rules;
        this.history = new GameHistory(positionKey(this.position));
    }

    static createThaiGame(players: ReadonlyArray<PlayerConfig> = DEFAULT_PLAYERS): CheckerEngine {
        return new CheckerEngine(CheckerEngine.initialPosition(), players, 'ready');
    }

    static initialPosition(): GamePosition {
        return {
            blackMen: 0x000000ff,
            blackKings: 0,
            whiteMen: 0xff000000 >>> 0,
            whiteKings: 0,
            sideToMove: 'black',
            forcedSquare: -1,
            completedTurns: 0,
            noProgressTurns: 0,
            turnHadCapture: false,
            turnMovedMan: false
        };
    }

    start(): CommandResult {
        if (this.phase !== 'ready') {
            return this.reject('not-ready');
        }
        this.phase = 'active';
        this.revision += 1;
        return this.accept({ kind: 'start' });
    }

    applyMove(intent: MoveIntent, expectedRevision: number): CommandResult {
        if (this.phase !== 'active') {
            return this.reject('not-active');
        }
        if (expectedRevision !== this.revision) {
            return this.reject('stale-revision');
        }
        const move = this.rules.validateAtomicMove(this.position, intent);
        if (move === null) {
            return this.reject('illegal-move');
        }

        const before = clonePosition(this.position);
        const beforePhase = this.phase;
        const beforeResult = this.result;
        const facts = this.rules.applyValidatedMove(this.position, move);
        let repetitionKey: string | null = null;
        let repetitionCount = 0;
        if (facts.turnCompleted) {
            repetitionKey = positionKey(this.position);
            repetitionCount = this.history.recordPosition(repetitionKey);
            this.result = this.rules.evaluateResult(this.position, { repetitionCount });
            if (this.result.status !== 'ongoing') {
                this.phase = 'ended';
            }
        }
        this.history.recordStep(
            before,
            beforePhase,
            beforeResult,
            move,
            facts.turnCompleted,
            repetitionKey
        );
        this.revision += 1;
        return this.accept({ kind: 'move', move: MoveCodec.toOption(move) });
    }

    rewind(): CommandResult {
        const undo = this.history.popStep();
        if (!undo) {
            return this.reject('nothing-to-rewind');
        }
        this.position = clonePosition(undo.before);
        this.phase = undo.beforePhase;
        this.result = undo.beforeResult;
        this.revision += 1;
        return this.accept({ kind: 'rewind', move: MoveCodec.toOption(undo.move) });
    }

    resign(playerId: 'black' | 'white'): CommandResult {
        if (this.phase !== 'active') {
            return this.reject('not-active');
        }
        if (playerId !== this.position.sideToMove) {
            return this.reject('wrong-player');
        }
        this.result = this.rules.adjudicateResignation(playerId);
        this.phase = 'ended';
        this.revision += 1;
        return this.accept({ kind: 'resign' });
    }

    getSnapshot(): GameSnapshot {
        const legalCodes: number[] = [];
        if (this.phase === 'active' && this.result.status === 'ongoing') {
            this.rules.generateLegalMoves(this.position, legalCodes);
        }
        const legalMoves = legalCodes.map((move) => Object.freeze(MoveCodec.toOption(move)));
        const pieces = this.pieceStates();
        const players = this.playerStates();
        const history = this.history.publicTurns().map((turn) => Object.freeze({
            player: turn.player,
            completed: turn.completed,
            steps: Object.freeze(turn.steps.map((step) => Object.freeze({ ...step })))
        }));
        const snapshot: GameSnapshot = {
            phase: this.phase,
            revision: this.revision,
            stepIndex: this.history.stepCount,
            completedTurns: this.position.completedTurns,
            activePlayer: this.position.sideToMove,
            forcedSquare: this.position.forcedSquare >= 0 ? this.position.forcedSquare + 1 : null,
            players: Object.freeze(players),
            pieces: Object.freeze(pieces),
            legalMoves: Object.freeze(legalMoves),
            history: Object.freeze(history),
            noProgressTurns: this.position.noProgressTurns,
            repetitionCount: this.history.repetitionCount(positionKey(this.position)),
            result: Object.freeze({ ...this.result }) as GameResult
        };
        return Object.freeze(snapshot);
    }

    createSimulationSeed(): SimulationSeed {
        return new SimulationSeed(this.position, this.history.repetitionEntries());
    }

    private pieceStates(): PieceState[] {
        const pieces: PieceState[] = [];
        for (let index = 0; index < 32; index += 1) {
            if (hasBit(this.position.blackMen, index)) {
                pieces.push(Object.freeze({ square: index + 1, player: 'black', kind: 'man' }));
            } else if (hasBit(this.position.blackKings, index)) {
                pieces.push(Object.freeze({ square: index + 1, player: 'black', kind: 'king' }));
            } else if (hasBit(this.position.whiteMen, index)) {
                pieces.push(Object.freeze({ square: index + 1, player: 'white', kind: 'man' }));
            } else if (hasBit(this.position.whiteKings, index)) {
                pieces.push(Object.freeze({ square: index + 1, player: 'white', kind: 'king' }));
            }
        }
        return pieces;
    }

    private playerStates(): PlayerState[] {
        return this.players.map((player) => Object.freeze({
            ...player,
            orientation: player.id === 'black' ? 'forward' as const : 'backward' as const,
            active: this.phase === 'active' && player.id === this.position.sideToMove,
            manCount: countBits(player.id === 'black' ? this.position.blackMen : this.position.whiteMen),
            kingCount: countBits(player.id === 'black' ? this.position.blackKings : this.position.whiteKings)
        }));
    }

    private accept(transition: { kind: 'start' | 'move' | 'rewind' | 'resign'; move?: MoveOption }): CommandResult {
        return { accepted: true, snapshot: this.getSnapshot(), transition };
    }

    private reject(code: 'not-ready' | 'not-active' | 'stale-revision' | 'illegal-move' |
        'wrong-player' | 'nothing-to-rewind'): CommandResult {
        return { accepted: false, code, snapshot: this.getSnapshot() };
    }
}
