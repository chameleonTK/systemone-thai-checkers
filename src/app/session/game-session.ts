import {
    AgentProgress,
    AgentTurnContext,
    isInteractiveAgent,
    isPreparableAgent,
    PlayableAgent,
    SelectionState,
    TurnCancellationSource
} from '../agents';
import { CheckerEngine, CommandResult, GameSnapshot, PlayerConfig } from '../engine';
import { PdnMovetextCodec, PdnResolveResult, PlaybackController } from '../pdn';
import { GamePresenter, GameViewModel, SessionDiagnostic, SessionMode } from '../presentation';

const EMPTY_SELECTION: SelectionState = Object.freeze({
    selectedSquare: null,
    highlightedSquares: Object.freeze([] as number[])
});

export interface RendererPort {
    render(model: GameViewModel): void;
    animateSetup(model: GameViewModel): Promise<void>;
    animateTransition(model: GameViewModel): Promise<void>;
    showDiagnostic(diagnostic: SessionDiagnostic): void;
}

export interface SeatBinding {
    readonly player: PlayerConfig;
    readonly agent: PlayableAgent;
    readonly minimumResponseDelayMs?: number;
}

export interface GameSessionConfig {
    readonly seats: ReadonlyArray<SeatBinding>;
    readonly renderer: RendererPort;
    readonly engine?: CheckerEngine;
    readonly delay?: (milliseconds: number) => Promise<void>;
}

export class GameSession {
    private readonly seats: ReadonlyArray<SeatBinding>;
    private readonly renderer: RendererPort;
    private readonly engine: CheckerEngine;
    private readonly presenter = new GamePresenter();
    private readonly playback: PlaybackController;
    private readonly delay: (milliseconds: number) => Promise<void>;
    private mode: SessionMode = 'live';
    private pendingCancellation: TurnCancellationSource | null = null;
    private turnSerial = 0;
    private starting = false;
    private playingReview = false;
    private agentProgress: AgentProgress | null = null;

    constructor(config: GameSessionConfig) {
        if (config.seats.length !== 2) {
            throw new Error('A game session requires exactly two seats.');
        }
        this.seats = config.seats;
        this.renderer = config.renderer;
        this.engine = config.engine || CheckerEngine.createThaiGame(config.seats.map((seat) => seat.player));
        this.playback = new PlaybackController(
            new PdnMovetextCodec(),
            config.seats.map((seat) => seat.player)
        );
        this.delay = config.delay || ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
        this.render();
    }

    async start(): Promise<void> {
        const snapshot = this.engine.getSnapshot();
        if (this.starting || this.mode !== 'live' || snapshot.phase !== 'ready') {
            return;
        }
        this.starting = true;
        this.render();
        try {
            await this.prepareAgents();
        } catch (error) {
            this.starting = false;
            this.agentProgress = null;
            this.renderer.showDiagnostic({
                code: 'AGENT_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
            this.render();
            return;
        }
        this.agentProgress = null;
        try {
            await this.renderer.animateSetup(this.model(snapshot, EMPTY_SELECTION, true));
        } catch (error) {
            this.starting = false;
            this.renderer.showDiagnostic({
                code: 'SETUP_ANIMATION_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
            this.render();
            return;
        }
        if (this.mode !== 'live') {
            this.starting = false;
            return;
        }
        const result = this.engine.start();
        this.starting = false;
        if (result.accepted) {
            this.render();
            this.dispatchTurn();
        }
    }

    selectSquare(square: number): void {
        if (this.mode !== 'live') {
            return;
        }
        const seat = this.activeSeat();
        if (!seat || !isInteractiveAgent(seat.agent)) {
            return;
        }
        seat.agent.selectSquare(square);
        this.render();
    }

    rewind(): void {
        if (this.mode === 'review') {
            this.playback.stepBack();
            this.render();
            return;
        }
        this.cancelPendingTurn();
        const result = this.engine.rewind();
        this.handleImmediateResult(result);
    }

    resign(): void {
        if (this.mode !== 'live') {
            return;
        }
        this.cancelPendingTurn();
        const snapshot = this.engine.getSnapshot();
        this.handleImmediateResult(this.engine.resign(snapshot.activePlayer));
    }

    openReview(text: string): PdnResolveResult {
        const result = this.playback.load(text);
        if (result.ok === false) {
            this.renderer.showDiagnostic({ code: result.diagnostic.code, message: result.diagnostic.message });
            return result;
        }
        this.cancelPendingTurn();
        this.mode = 'review';
        this.playingReview = false;
        this.render();
        return result;
    }

    reviewStepForward(): void {
        if (this.mode !== 'review') {
            return;
        }
        this.playback.stepForward();
        this.render();
    }

    reviewStepBack(): void {
        if (this.mode !== 'review') {
            return;
        }
        this.playback.stepBack();
        this.render();
    }

    async playReview(): Promise<void> {
        if (this.mode !== 'review' || this.playingReview) {
            return;
        }
        this.playingReview = true;
        while (this.mode === 'review' && this.playingReview && this.playback.canStepForward()) {
            const result = this.playback.stepForward();
            if (!result || !result.accepted) {
                break;
            }
            this.render();
            await this.renderer.animateTransition(this.currentModel());
            await this.delay(350);
        }
        this.playingReview = false;
    }

    pauseReview(): void {
        this.playingReview = false;
    }

    returnToLive(): void {
        if (this.mode !== 'review') {
            return;
        }
        this.playingReview = false;
        this.playback.dispose();
        this.mode = 'live';
        this.render();
        this.dispatchTurn();
    }

    retryTurn(): void {
        if (this.mode === 'live') {
            this.dispatchTurn();
        }
    }

    getLiveSnapshot(): GameSnapshot {
        return this.engine.getSnapshot();
    }

    destroy(): void {
        this.playingReview = false;
        this.cancelPendingTurn();
        this.playback.dispose();
    }

    private dispatchTurn(): void {
        if (this.mode !== 'live') {
            return;
        }
        const snapshot = this.engine.getSnapshot();
        if (snapshot.phase !== 'active' || snapshot.result.status !== 'ongoing') {
            return;
        }
        this.cancelPendingTurn();
        const seat = this.activeSeat();
        if (!seat) {
            return;
        }
        const cancellation = new TurnCancellationSource();
        this.pendingCancellation = cancellation;
        this.turnSerial += 1;
        const context: AgentTurnContext = Object.freeze({
            turnId: `${snapshot.revision}:${this.turnSerial}`,
            revision: snapshot.revision,
            player: snapshot.activePlayer,
            snapshot,
            legalMoves: snapshot.legalMoves,
            simulation: this.engine.createSimulationSeed(),
            reportProgress: (progress) => {
                if (!cancellation.cancelled && this.pendingCancellation === cancellation) {
                    this.agentProgress = progress;
                    this.render();
                }
            }
        });

        let choice: Promise<{ readonly from: number; readonly to: number }>;
        try {
            choice = seat.agent.chooseMove(context, cancellation);
        } catch (error) {
            this.pendingCancellation = null;
            this.renderer.showDiagnostic({
                code: 'AGENT_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
            this.render();
            return;
        }
        this.render();
        choice.then(async (intent) => {
            this.agentProgress = null;
            const wait = seat.minimumResponseDelayMs || 0;
            if (wait > 0) {
                await this.delay(wait);
            }
            if (cancellation.cancelled || this.mode !== 'live'
                || this.engine.getSnapshot().revision !== context.revision) {
                return;
            }
            const result = this.engine.applyMove(intent, context.revision);
            if (result.accepted === false) {
                this.renderer.showDiagnostic({ code: result.code, message: 'The submitted move was rejected.' });
                this.render();
                if (result.code === 'illegal-move') {
                    this.dispatchTurn();
                }
                return;
            }
            cancellation.cancel();
            await this.renderer.animateTransition(this.model(result.snapshot, EMPTY_SELECTION));
            this.render();
            this.dispatchTurn();
        }).catch((error) => {
            this.agentProgress = null;
            if (cancellation.cancelled) {
                return;
            }
            this.pendingCancellation = null;
            this.renderer.showDiagnostic({
                code: 'AGENT_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
            this.render();
        });
    }

    private async prepareAgents(): Promise<void> {
        const preparations: Array<Promise<void>> = this.seats
            .filter((seat) => isPreparableAgent(seat.agent))
            .map((seat) => isPreparableAgent(seat.agent)
                ? seat.agent.prepare((progress: AgentProgress) => {
                    if (this.starting) {
                        this.agentProgress = progress;
                        this.render();
                    }
                })
                : Promise.resolve());
        await Promise.all(preparations);
    }

    private handleImmediateResult(result: CommandResult): void {
        if (result.accepted === false) {
            this.renderer.showDiagnostic({ code: result.code, message: 'The command could not be applied.' });
            this.render();
            return;
        }
        this.render();
        this.dispatchTurn();
    }

    private activeSeat(): SeatBinding | null {
        const active = this.engine.getSnapshot().activePlayer;
        return this.seats.find((seat) => seat.player.id === active) || null;
    }

    private cancelPendingTurn(): void {
        if (this.pendingCancellation) {
            this.pendingCancellation.cancel();
            this.pendingCancellation = null;
        }
        this.agentProgress = null;
    }

    private render(): void {
        this.renderer.render(this.currentModel());
    }

    private currentModel(): GameViewModel {
        if (this.mode === 'review') {
            const snapshot = this.playback.getSnapshot();
            if (snapshot) {
                return this.model(snapshot, EMPTY_SELECTION);
            }
        }
        const seat = this.activeSeat();
        const selection = seat && isInteractiveAgent(seat.agent) ? seat.agent.getSelection() : EMPTY_SELECTION;
        return this.model(this.engine.getSnapshot(), selection);
    }

    private model(
        snapshot: GameSnapshot,
        selection: SelectionState,
        setupAnimating = false
    ): GameViewModel {
        return this.presenter.project(snapshot, {
            mode: this.mode,
            selection,
            setupAnimating: setupAnimating || this.starting,
            reviewCursor: this.playback.getCursor(),
            reviewLength: this.playback.getLength(),
            agentProgress: this.agentProgress
        });
    }
}
