import { GameSnapshot, MoveIntent, MoveOption } from '../engine';
import { AgentProgress, AgentTurnContext, PreparableAgent, TurnCancellation } from './agent-api';
import { MathRandomSource, RandomSource } from './random-source';

export const KEV_MOVE_LIMIT = 128;
export const DEFAULT_KEV_MODEL_URL =
    'https://huggingface.co/ai-ecoverse/kev.js/resolve/main/kev-0.8b';

interface KevChoiceAnswer {
    readonly type: string;
    readonly choice: string;
}

interface KevSystemOneResponse {
    readonly answers: { readonly [question: string]: KevChoiceAnswer };
}

export interface KevSystemOneClient {
    systemOne(request: unknown): Promise<KevSystemOneResponse>;
}

export interface KevAgentOptions {
    readonly client?: KevSystemOneClient;
    readonly loadClient?: (reportProgress?: (progress: AgentProgress) => void) => Promise<KevSystemOneClient>;
    readonly random?: RandomSource;
    readonly moveLimit?: number;
}

let sharedClient: Promise<KevSystemOneClient> | null = null;

function loadDefaultClient(reportProgress?: (progress: AgentProgress) => void): Promise<KevSystemOneClient> {
    if (!sharedClient) {
        if (reportProgress) {
            reportProgress({ label: 'Loading Kev runtime', loaded: 0, total: 100 });
        }
        sharedClient = loadBrowserModules().then((modules: any) => modules.kev.loadKev(
            DEFAULT_KEV_MODEL_URL,
            {
                ort: modules.ort,
                variant: 'q8f32',
                onPhase: (phase: string) => {
                    if (reportProgress) {
                        const loaded: number = phase === 'manifest'
                            ? 1
                            : phase === 'session' ? 99 : phase === 'ready' ? 100 : 2;
                        reportProgress({
                            label: phase === 'session' ? 'Starting Kev model' : 'Loading Kev model',
                            loaded,
                            total: 100
                        });
                    }
                },
                onProgress: (progress: { file: string; loaded: number; total: number }) => {
                    if (reportProgress) {
                        const total: number = progress.total > 0 ? progress.total : 1;
                        reportProgress({
                            label: `Downloading Kev model: ${progress.file}`,
                            loaded: Math.min(progress.loaded, total),
                            total
                        });
                    }
                }
            }
        ))
            .catch((error: unknown) => {
                sharedClient = null;
                throw error;
            });
    }
    return sharedClient;
}

function loadBrowserModules(): Promise<any> {
    const browserWindow: any = window;
    if (browserWindow.kevBrowserModules) {
        return Promise.resolve(browserWindow.kevBrowserModules);
    }
    return new Promise<any>((resolve, reject) => {
        const script: HTMLScriptElement = document.createElement('script');
        script.type = 'module';
        script.src = 'assets/kev-loader.js';
        script.onload = () => browserWindow.kevBrowserModules
            ? resolve(browserWindow.kevBrowserModules)
            : reject(new Error('Kev browser modules did not initialize.'));
        script.onerror = () => reject(new Error('Kev browser modules could not be loaded.'));
        document.head.appendChild(script);
    });
}

function moveDescription(move: MoveOption): string {
    const details: string[] = [`Move from square ${move.from} to square ${move.to}`];
    if (move.capture) {
        details.push(`capture the piece on square ${move.capturedSquare}`);
    }
    if (move.promotion) {
        details.push('promote the moving man to a king');
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

export class KevAgent implements PreparableAgent {
    private readonly loadClient: (reportProgress?: (progress: AgentProgress) => void) => Promise<KevSystemOneClient>;
    private readonly random: RandomSource;
    private readonly moveLimit: number;
    private clientPromise: Promise<KevSystemOneClient> | null = null;

    constructor(options: KevAgentOptions = {}) {
        if (options.moveLimit !== undefined
            && (!Number.isInteger(options.moveLimit) || options.moveLimit < 1 || options.moveLimit > KEV_MOVE_LIMIT)) {
            throw new Error(`Kev move limit must be an integer between 1 and ${KEV_MOVE_LIMIT}.`);
        }
        this.loadClient = options.client
            ? () => Promise.resolve(options.client as KevSystemOneClient)
            : options.loadClient || loadDefaultClient;
        this.random = options.random || new MathRandomSource();
        this.moveLimit = options.moveLimit || KEV_MOVE_LIMIT;
    }

    async prepare(reportProgress: (progress: AgentProgress) => void): Promise<void> {
        if (!this.clientPromise) {
            reportProgress({ label: 'Loading Kev model', loaded: 0, total: 100 });
            this.clientPromise = this.loadClient(reportProgress).catch((error: unknown) => {
                this.clientPromise = null;
                throw error;
            });
        }
        await this.clientPromise;
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

        if (!this.clientPromise) {
            await this.prepare((progress: AgentProgress) => {
                if (context.reportProgress) {
                    context.reportProgress(progress);
                }
            });
            if (context.reportProgress) {
                context.reportProgress(null);
            }
        }
        const client: KevSystemOneClient = await this.clientPromise as KevSystemOneClient;
        if (cancellation.cancelled) {
            throw new Error('Turn was cancelled.');
        }
        const response: KevSystemOneResponse = await client.systemOne({
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
        const answer: KevChoiceAnswer | undefined = response.answers && response.answers.move;
        const selected: MoveOption | undefined = answer && movesByOption[answer.choice];
        if (!selected) {
            throw new Error('Kev returned an unknown move option.');
        }
        return this.intent(selected);
    }

    private assertTurnCanContinue(context: AgentTurnContext, cancellation: TurnCancellation): void {
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
