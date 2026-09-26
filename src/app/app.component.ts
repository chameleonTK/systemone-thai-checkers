import { Component, Inject, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import {
    AGENT_REGISTRY,
    AgentRegistration,
    DEFAULT_AGENT_ID,
    findAgentRegistration,
    HumanAgent
} from './agents';
import { GameViewModel, SessionDiagnostic } from './presentation';
import { GameSession, RendererPort } from './session';

export interface DialogData {
    title: string;
    subtitle: string;
}

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
    selectedAgentId = DEFAULT_AGENT_ID;
    private session: GameSession;
    private shownEndRevision = -1;

    constructor(public dialog: MatDialog) {
        this.session = this.createSession(this.selectedAgent);
    }

    get selectedAgent(): AgentRegistration {
        return findAgentRegistration(this.selectedAgentId)
            || findAgentRegistration(DEFAULT_AGENT_ID) as AgentRegistration;
    }

    render(model: GameViewModel): void {
        this.model = model;
        if (model.mode === 'live' && model.phase === 'ended' && model.revision !== this.shownEndRevision) {
            this.shownEndRevision = model.revision;
            this.openDialog('Game Over', model.resultText);
        }
    }

    private createSession(opponent: AgentRegistration): GameSession {
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

    animateSetup(model: GameViewModel): Promise<void> {
        this.model = model;
        return new Promise<void>((resolve) => setTimeout(resolve, 600));
    }

    animateTransition(model: GameViewModel): Promise<void> {
        this.model = model;
        return Promise.resolve();
    }

    showDiagnostic(diagnostic: SessionDiagnostic): void {
        this.diagnostic = `${diagnostic.code}: ${diagnostic.message}`;
    }

    start(): void {
        this.diagnostic = '';
        if (!this.model.controls.canStart || this.model.setupAnimating) {
            return;
        }
        this.session.destroy();
        this.session = this.createSession(this.selectedAgent);
        this.session.start();
    }

    selectOpponentAgent(id: string): void {
        if (!this.model.controls.canStart || this.model.setupAnimating || !findAgentRegistration(id)) {
            return;
        }
        this.selectedAgentId = id;
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
