import { AgentProgress } from '../agents/agent-api';
import { GamePhase, GameResult, PieceKind, PlayerId } from '../engine';

export type SessionMode = 'live' | 'review';

export interface TileView {
    readonly row: number;
    readonly column: number;
    readonly square: number | null;
    readonly playable: boolean;
    readonly highlighted: boolean;
}

export interface PieceView {
    readonly square: number;
    readonly row: number;
    readonly column: number;
    readonly player: PlayerId;
    readonly kind: PieceKind;
    readonly color: string;
    readonly selected: boolean;
    readonly enabled: boolean;
}

export interface BoardView {
    readonly tiles: ReadonlyArray<ReadonlyArray<TileView>>;
    readonly pieces: ReadonlyArray<PieceView>;
}

export interface PlayerView {
    readonly id: PlayerId;
    readonly name: string;
    readonly color: string;
    readonly active: boolean;
    readonly manCount: number;
    readonly kingCount: number;
}

export interface ControlState {
    readonly canStart: boolean;
    readonly canRewind: boolean;
    readonly canResign: boolean;
    readonly canReviewStepForward: boolean;
    readonly canReviewStepBack: boolean;
    readonly canReturnToLive: boolean;
}

export interface GameViewModel {
    readonly mode: SessionMode;
    readonly phase: GamePhase;
    readonly revision: number;
    readonly stepIndex: number;
    readonly completedTurns: number;
    readonly activePlayer: PlayerId;
    readonly players: ReadonlyArray<PlayerView>;
    readonly board: BoardView;
    readonly historyText: ReadonlyArray<string>;
    readonly noProgressTurns: number;
    readonly result: GameResult;
    readonly resultText: string;
    readonly controls: ControlState;
    readonly setupAnimating: boolean;
    readonly agentPreparing: boolean;
    readonly reviewCursor: number;
    readonly reviewLength: number;
    readonly agentProgress: AgentProgress | null;
}

export interface SessionDiagnostic {
    readonly code: string;
    readonly message: string;
}
