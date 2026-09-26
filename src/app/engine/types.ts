// tslint:disable:no-bitwise
export type PlayerId = 'black' | 'white';
export type PieceKind = 'man' | 'king';
export type GamePhase = 'ready' | 'active' | 'ended';

export interface PlayerConfig {
    readonly id: PlayerId;
    readonly name: string;
    readonly color: string;
}

export interface PlayerState extends PlayerConfig {
    readonly orientation: 'forward' | 'backward';
    readonly active: boolean;
    readonly manCount: number;
    readonly kingCount: number;
}

export interface GamePosition {
    blackMen: number;
    blackKings: number;
    whiteMen: number;
    whiteKings: number;
    sideToMove: PlayerId;
    forcedSquare: number;
    completedTurns: number;
    noProgressTurns: number;
    turnHadCapture: boolean;
    turnMovedMan: boolean;
}

export interface MoveIntent {
    readonly from: number;
    readonly to: number;
}

export interface MoveOption extends MoveIntent {
    readonly code: number;
    readonly capture: boolean;
    readonly capturedSquare: number | null;
    readonly promotion: boolean;
}

export type WinReason = 'no-pieces' | 'no-legal-move' | 'resignation';
export type DrawReason = 'threefold-repetition' | 'fifty-turn-rule';

export type GameResult =
    | { readonly status: 'ongoing' }
    | {
        readonly status: 'win';
        readonly winner: PlayerId;
        readonly loser: PlayerId;
        readonly reason: WinReason;
      }
    | { readonly status: 'draw'; readonly reason: DrawReason };

export const ONGOING_RESULT: GameResult = { status: 'ongoing' };

export interface PieceState {
    readonly square: number;
    readonly player: PlayerId;
    readonly kind: PieceKind;
}

export interface PublicStepRecord {
    readonly from: number;
    readonly to: number;
    readonly capture: boolean;
    readonly capturedSquare: number | null;
    readonly capturedKind: PieceKind | null;
    readonly promotion: boolean;
}

export interface PublicTurnRecord {
    readonly player: PlayerId;
    readonly steps: ReadonlyArray<PublicStepRecord>;
    readonly completed: boolean;
}

export interface GameSnapshot {
    readonly phase: GamePhase;
    readonly revision: number;
    readonly stepIndex: number;
    readonly completedTurns: number;
    readonly activePlayer: PlayerId;
    readonly forcedSquare: number | null;
    readonly players: ReadonlyArray<PlayerState>;
    readonly pieces: ReadonlyArray<PieceState>;
    readonly legalMoves: ReadonlyArray<MoveOption>;
    readonly history: ReadonlyArray<PublicTurnRecord>;
    readonly noProgressTurns: number;
    readonly repetitionCount: number;
    readonly result: GameResult;
}

export interface GameTransition {
    readonly kind: 'start' | 'move' | 'rewind' | 'resign';
    readonly move?: MoveOption;
}

export type RejectionCode =
    | 'not-ready'
    | 'not-active'
    | 'stale-revision'
    | 'illegal-move'
    | 'wrong-player'
    | 'nothing-to-rewind';

export type CommandResult =
    | {
        readonly accepted: true;
        readonly snapshot: GameSnapshot;
        readonly transition: GameTransition;
      }
    | {
        readonly accepted: false;
        readonly code: RejectionCode;
        readonly snapshot: GameSnapshot;
      };

export interface RuleEvaluationContext {
    readonly repetitionCount: number;
}

export interface ApplyFacts {
    readonly move: number;
    readonly turnCompleted: boolean;
    readonly sideChanged: boolean;
}

export interface SimulationSeedValue {
    readonly position: GamePosition;
    readonly repetitions: ReadonlyArray<readonly [string, number]>;
}

export function opponent(player: PlayerId): PlayerId {
    return player === 'black' ? 'white' : 'black';
}

export function clonePosition(position: GamePosition): GamePosition {
    return {
        blackMen: position.blackMen >>> 0,
        blackKings: position.blackKings >>> 0,
        whiteMen: position.whiteMen >>> 0,
        whiteKings: position.whiteKings >>> 0,
        sideToMove: position.sideToMove,
        forcedSquare: position.forcedSquare,
        completedTurns: position.completedTurns,
        noProgressTurns: position.noProgressTurns,
        turnHadCapture: position.turnHadCapture,
        turnMovedMan: position.turnMovedMan
    };
}
