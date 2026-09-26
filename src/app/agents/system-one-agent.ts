import { GameSnapshot, MoveIntent, MoveOption } from '../engine';
import { AgentProgress, AgentTurnContext, DisposableAgent, PreparableAgent, TurnCancellation } from './agent-api';
import { MathRandomSource, RandomSource } from './random-source';
import { SystemOneClientLease } from './system-one-browser';

export const SYSTEM_ONE_MOVE_LIMIT = 128;

export type SystemOnePrecision = 'int8' | 'int4';

export interface SystemOneChoiceAnswer {
    readonly type: string;
    readonly choice: string;
    readonly confidence?: number;
    readonly probabilities?: { readonly [option: string]: number };
}

export interface SystemOneResponse {
    readonly answers: { readonly [question: string]: SystemOneChoiceAnswer };
}

export interface SystemOneClient {
    systemOne(request: unknown): Promise<SystemOneResponse>;
    release?(): Promise<void>;
}

export interface SystemOneAgentOptions {
    readonly client?: SystemOneClient;
    readonly loadClient?: (reportProgress?: (progress: AgentProgress) => void) => Promise<SystemOneClient>;
    readonly acquireClient?: (reportProgress?: (progress: AgentProgress) => void) => Promise<SystemOneClientLease>;
    readonly random?: RandomSource;
    readonly moveLimit?: number;
}

export interface SystemOneAgentConfig extends SystemOneAgentOptions {
    readonly modelLabel: string;
    readonly defaultMoveLimit?: number;
}

function moveDescription(move: MoveOption): string {
    const details: string[] = [`${move.from} to ${move.to}`];
    if (move.capture) {
        details.push(`capture ${move.capturedSquare}`);
    }
    if (move.promotion) {
        details.push('promote');
    }
    return details.join('; ');
}

function boardState(snapshot: GameSnapshot): unknown {
    return {
        game: 'Thai checkers',
        goal: 'Choose the strongest legal move for the side to move.',
        rules: [
            'Captures are compulsory.',
            'A forced square means the same piece must continue its multi-jump.',
            'Men move forward but capture in either direction.',
            'Kings slide diagonally and may land any distance beyond one captured piece.',
            'Promotion ends the turn immediately.'
        ],
        sideToMove: snapshot.activePlayer,
        forcedSquare: snapshot.forcedSquare,
        completedTurns: snapshot.completedTurns,
        noProgressTurns: snapshot.noProgressTurns,
        pieces: snapshot.pieces.map((piece) => ({
            side: piece.player,
            kind: piece.kind,
            square: piece.square
        }))
    };
}

export class SystemOneAgent implements PreparableAgent, DisposableAgent {
    private readonly acquireClient: (reportProgress?: (progress: AgentProgress) => void) => Promise<SystemOneClientLease>;
    private readonly random: RandomSource;
    private readonly moveLimit: number;
    private readonly modelLabel: string;
    private leasePromise: Promise<SystemOneClientLease> | null = null;
    private disposed = false;

    constructor(config: SystemOneAgentConfig) {
        const maximum: number = config.defaultMoveLimit || SYSTEM_ONE_MOVE_LIMIT;
        const moveLimit: number = config.moveLimit === undefined ? maximum : config.moveLimit;
        if (!Number.isInteger(moveLimit) || moveLimit < 1 || moveLimit > maximum) {
            throw new Error(`System One move limit must be an integer between 1 and ${maximum}.`);
        }
        const loadClient = config.client
            ? () => Promise.resolve(config.client as SystemOneClient)
            : config.loadClient;
        const acquireClient = config.acquireClient || (loadClient
            ? async (reportProgress?: (progress: AgentProgress) => void) => ({
                client: await loadClient(reportProgress),
                release: () => Promise.resolve()
            })
            : undefined);
        if (!acquireClient) {
            throw new Error(`${config.modelLabel} client loader is required.`);
        }
        this.acquireClient = acquireClient;
        this.random = config.random || new MathRandomSource();
        this.moveLimit = moveLimit;
        this.modelLabel = config.modelLabel;
    }

    async prepare(reportProgress: (progress: AgentProgress) => void): Promise<void> {
        if (this.disposed) {
            throw new Error(`${this.modelLabel} agent was disposed.`);
        }
        if (!this.leasePromise) {
            reportProgress({ label: `Loading ${this.modelLabel} model`, loaded: 0, total: 100 });
            this.leasePromise = this.acquireClient(reportProgress).then(async (lease: SystemOneClientLease) => {
                if (this.disposed) {
                    await lease.release();
                    throw new Error(`${this.modelLabel} agent was disposed.`);
                }
                return lease;
            }).catch((error: unknown) => {
                this.leasePromise = null;
                throw error;
            });
        }
        await this.leasePromise;
    }

    async chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        this.assertTurnCanContinue(context, cancellation);
        if (context.legalMoves.length === 1) {
            return this.intent(context.legalMoves[0]);
        }

        const candidates: MoveOption[] = this.sample(context.legalMoves);
        const criteria: { [option: string]: string } = {};
        const movesByOption: { [option: string]: MoveOption } = {};
        candidates.forEach((move: MoveOption, index: number) => {
            const option = `move_${index + 1}`;
            criteria[option] = moveDescription(move);
            movesByOption[option] = move;
        });

        if (!this.leasePromise) {
            await this.prepare((progress: AgentProgress) => {
                if (context.reportProgress) {
                    context.reportProgress(progress);
                }
            });
            if (context.reportProgress) {
                context.reportProgress(null);
            }
        }
        const lease: SystemOneClientLease = await this.leasePromise as SystemOneClientLease;
        const client: SystemOneClient = lease.client;
        if (cancellation.cancelled) {
            throw new Error('Turn was cancelled.');
        }
        const response: SystemOneResponse = await client.systemOne({
            state: boardState(context.snapshot),
            questions: {
                move: {
                    type: 'choice',
                    instructions: 'Select the legal move most likely to lead the side to move to victory.',
                    criteria
                }
            }
        });
        if (cancellation.cancelled) {
            throw new Error('Turn was cancelled.');
        }
        const answer: SystemOneChoiceAnswer | undefined = response && response.answers && response.answers.move;
        const selected: MoveOption | undefined = answer && answer.type === 'choice'
            ? movesByOption[answer.choice]
            : undefined;
        if (!selected) {
            throw new Error(`${this.modelLabel} returned an unknown move option.`);
        }
        return this.intent(selected);
    }

    async dispose(): Promise<void> {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (!this.leasePromise) {
            return;
        }
        try {
            const lease: SystemOneClientLease = await this.leasePromise;
            await lease.release();
        } catch {
            // Failed or cancelled loading owns no live lease.
        }
    }

    private assertTurnCanContinue(context: AgentTurnContext, cancellation: TurnCancellation): void {
        if (this.disposed) {
            throw new Error(`${this.modelLabel} agent was disposed.`);
        }
        if (cancellation.cancelled) {
            throw new Error('Turn was cancelled.');
        }
        if (context.legalMoves.length === 0) {
            throw new Error('No legal move is available.');
        }
    }

    private sample(moves: ReadonlyArray<MoveOption>): MoveOption[] {
        const candidates: MoveOption[] = moves.slice();
        if (candidates.length <= this.moveLimit) {
            return candidates;
        }
        const count: number = Math.min(candidates.length, this.moveLimit);
        for (let index = 0; index < count; index += 1) {
            const remaining: number = candidates.length - index;
            const offset: number = Math.min(remaining - 1, Math.floor(this.random.next() * remaining));
            const selectedIndex: number = index + offset;
            const selected: MoveOption = candidates[selectedIndex];
            candidates[selectedIndex] = candidates[index];
            candidates[index] = selected;
        }
        return candidates.slice(0, count);
    }

    private intent(move: MoveOption): MoveIntent {
        return { from: move.from, to: move.to };
    }
}
