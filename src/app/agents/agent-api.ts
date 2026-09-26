import { GameSnapshot, MoveIntent, MoveOption, PlayerId, SimulationSeed } from '../engine';

export interface TurnCancellation {
    readonly cancelled: boolean;
    onCancel(callback: () => void): () => void;
}

export class TurnCancellationSource implements TurnCancellation {
    private callbacks: Array<() => void> = [];
    private isCancelled = false;

    get cancelled(): boolean {
        return this.isCancelled;
    }

    onCancel(callback: () => void): () => void {
        if (this.isCancelled) {
            callback();
            return () => undefined;
        }
        this.callbacks.push(callback);
        return () => {
            this.callbacks = this.callbacks.filter((candidate) => candidate !== callback);
        };
    }

    cancel(): void {
        if (this.isCancelled) {
            return;
        }
        this.isCancelled = true;
        const callbacks = this.callbacks.slice();
        this.callbacks.length = 0;
        callbacks.forEach((callback) => callback());
    }
}

export interface AgentTurnContext {
    readonly turnId: string;
    readonly revision: number;
    readonly player: PlayerId;
    readonly snapshot: GameSnapshot;
    readonly legalMoves: ReadonlyArray<MoveOption>;
    readonly simulation: SimulationSeed;
    readonly reportProgress?: (progress: AgentProgress | null) => void;
}

export interface AgentProgress {
    readonly label: string;
    readonly loaded?: number;
    readonly total?: number;
}

export interface PlayableAgent {
    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent>;
}

export interface PreparableAgent extends PlayableAgent {
    prepare(reportProgress: (progress: AgentProgress) => void): Promise<void>;
}

export interface SelectionState {
    readonly selectedSquare: number | null;
    readonly highlightedSquares: ReadonlyArray<number>;
}

export interface InteractiveAgent extends PlayableAgent {
    selectSquare(square: number): SelectionState;
    getSelection(): SelectionState;
}

export function isInteractiveAgent(agent: PlayableAgent): agent is InteractiveAgent {
    return typeof (agent as InteractiveAgent).selectSquare === 'function';
}

export function isPreparableAgent(agent: PlayableAgent): agent is PreparableAgent {
    return typeof (agent as PreparableAgent).prepare === 'function';
}
