import { Component, Inject, NgZone, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import {
    AGENT_REGISTRY,
    AgentRegistration,
    DEFAULT_AGENT_ID,
    clearSystemOneModelCache,
    findAgentRegistration,
    HumanAgent
} from './agents';
import { GameViewModel, SessionDiagnostic } from './presentation';
import { GameSession, RendererPort } from './session';

export interface DialogData {
    title: string;
    subtitle: string;
}

export type GameMode = 'play' | 'watch';

@Component({ selector: 'app-endgame-dialog', templateUrl: 'endgame-dialog.html' })
export class EndgameDialogComponent {
    constructor(@Inject(MAT_DIALOG_DATA) public data: DialogData) {}
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css']
})
export class AppComponent implements RendererPort, OnDestroy {
    readonly title = 'app';
    model: GameViewModel;
    pdnText = '';
    diagnostic = '';
    readonly agentOptions = AGENT_REGISTRY;
    readonly automatedAgentOptions = AGENT_REGISTRY.filter((agent) => agent.kind === 'automated');
    gameMode: GameMode = 'play';
    selectedAgentId = DEFAULT_AGENT_ID;
    selectedWatchBlackAgentId = 'random';
    selectedWatchWhiteAgentId = 'random';
    clearingModelCache = false;
    private session: GameSession;
    private shownEndRevision = -1;

    constructor(public dialog: MatDialog, private readonly zone: NgZone) {
        this.session = this.createSession();
    }

    get selectedAgent(): AgentRegistration {
        return findAgentRegistration(this.selectedAgentId)
            || findAgentRegistration(DEFAULT_AGENT_ID) as AgentRegistration;
    }

    render(model: GameViewModel): void {
        this.zone.run(() => {
            this.model = model;
            if (model.mode === 'live' && model.phase === 'ended' && model.revision !== this.shownEndRevision) {
                this.shownEndRevision = model.revision;
                this.openDialog('Game Over', model.resultText);
            }
        });
    }

    private createSession(): GameSession {
        if (this.gameMode === 'watch') {
            const black = this.watchAgent(this.selectedWatchBlackAgentId);
            const white = this.watchAgent(this.selectedWatchWhiteAgentId);
            return new GameSession({
                seats: [
                    {
                        player: { id: 'black', name: 'Player 1', color: '#444444' },
                        agent: black.create(),
                        minimumResponseDelayMs: black.minimumResponseDelayMs
                    },
                    {
                        player: { id: 'white', name: 'Player 2', color: '#e26b6b' },
                        agent: white.create(),
                        minimumResponseDelayMs: white.minimumResponseDelayMs
                    }
                ],
                renderer: this
            });
        }
        const opponent = this.selectedAgent;
        return new GameSession({
            seats: [
                { player: { id: 'black', name: 'Player 1', color: '#444444' }, agent: new HumanAgent() },
                {
                    player: { id: 'white', name: opponent.label, color: '#e26b6b' },
                    agent: opponent.create(),
                    minimumResponseDelayMs: opponent.minimumResponseDelayMs
                }
            ],
            renderer: this
        });
    }

    private watchAgent(id: string): AgentRegistration {
        return this.automatedAgentOptions.find((agent) => agent.id === id)
            || this.automatedAgentOptions[0];
    }

    private resetSession(): void {
        const previous = this.session;
        previous.destroy().catch((error: unknown) => this.showDiagnostic({
            code: 'AGENT_DISPOSAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        }));
        this.shownEndRevision = -1;
        this.session = this.createSession();
    }

    animateSetup(model: GameViewModel): Promise<void> {
        return this.zone.run(() => {
            this.model = model;
            return new Promise<void>((resolve) => setTimeout(resolve, 600));
        });
    }

    animateTransition(model: GameViewModel): Promise<void> {
        return this.zone.run(() => {
            this.model = model;
            return Promise.resolve();
        });
    }

    showDiagnostic(diagnostic: SessionDiagnostic): void {
        this.zone.run(() => {
            this.diagnostic = `${diagnostic.code}: ${diagnostic.message}`;
        });
    }

    start(): void {
        this.diagnostic = '';
        if (this.clearingModelCache || !this.model.controls.canStart
            || this.model.setupAnimating || this.model.agentPreparing) {
            return;
        }
        this.resetSession();
        this.session.start();
    }

    async clearModelCache(): Promise<void> {
        if (this.clearingModelCache) {
            return;
        }
        this.clearingModelCache = true;
        this.diagnostic = '';
        const previous = this.session;
        this.shownEndRevision = -1;
        this.session = this.createSession();
        try {
            await previous.destroy();
            const removed = await clearSystemOneModelCache();
            this.showDiagnostic({
                code: 'MODEL_CACHE_CLEARED',
                message: removed === 1 ? 'Removed 1 cached model file.' : `Removed ${removed} cached model files.`
            });
        } catch (error) {
            this.showDiagnostic({
                code: 'MODEL_CACHE_ERROR',
                message: error instanceof Error ? error.message : String(error)
            });
        } finally {
            this.clearingModelCache = false;
        }
    }

    selectGameMode(mode: GameMode): void {
        if (mode === this.gameMode) {
            return;
        }
        this.diagnostic = '';
        this.gameMode = mode;
        this.resetSession();
    }

    selectOpponentAgent(id: string): void {
        if (!this.model.controls.canStart || this.model.setupAnimating || this.model.agentPreparing
            || !findAgentRegistration(id)) {
            return;
        }
        this.selectedAgentId = id;
    }

    selectWatchAgent(player: 'black' | 'white', id: string): void {
        if (!this.model.controls.canStart || this.model.setupAnimating || this.model.agentPreparing
            || !this.automatedAgentOptions.some((agent) => agent.id === id)) {
            return;
        }
        if (player === 'black') {
            this.selectedWatchBlackAgentId = id;
        } else {
            this.selectedWatchWhiteAgentId = id;
        }
    }

    restartWatch(): void {
        if (this.gameMode !== 'watch' || this.model.phase === 'ready') {
            return;
        }
        this.diagnostic = '';
        this.resetSession();
    }

    selectSquare(square: number): void {
        this.diagnostic = '';
        this.session.selectSquare(square);
    }

    rewind(): void {
        this.diagnostic = '';
        this.session.rewind();
    }

    resign(): void {
        this.diagnostic = '';
        this.session.resign();
    }

    review(): void {
        this.diagnostic = '';
        this.session.openReview(this.pdnText);
    }

    reviewForward(): void {
        this.session.reviewStepForward();
    }

    reviewBack(): void {
        this.session.reviewStepBack();
    }

    playReview(): void {
        this.session.playReview();
    }

    returnToLive(): void {
        this.session.returnToLive();
    }

    openDialog(title: string, subtitle: string): void {
        this.dialog.open(EndgameDialogComponent, { data: { title, subtitle } });
    }

    ngOnDestroy(): void {
        this.session.destroy();
    }
}
