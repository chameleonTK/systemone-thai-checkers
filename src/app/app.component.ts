import { Component, Inject, OnDestroy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { HumanAgent } from './agents';
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
    private readonly session: GameSession;
    private shownEndRevision = -1;

    constructor(public dialog: MatDialog) {
        this.session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Player 1', color: '#444444' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'Player 2', color: '#e26b6b' }, agent: new HumanAgent() }
            ],
            renderer: this
        });
    }

    render(model: GameViewModel): void {
        this.model = model;
        if (model.mode === 'live' && model.phase === 'ended' && model.revision !== this.shownEndRevision) {
            this.shownEndRevision = model.revision;
            this.openDialog('Game Over', model.resultText);
        }
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
        this.session.start();
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
