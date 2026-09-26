import { NgZone, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
    let fixture: ComponentFixture<AppComponent>;
    const dialog = { open: jasmine.createSpy('open') };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [AppComponent],
            providers: [{ provide: MatDialog, useValue: dialog }],
            schemas: [NO_ERRORS_SCHEMA]
        }).compileComponents();
        fixture = TestBed.createComponent(AppComponent);
    });

    it('creates a ready game without starting an agent turn', () => {
        const app = fixture.componentInstance;
        expect(app).toBeTruthy();
        expect(app.model.phase).toBe('ready');
        expect(app.model.controls.canStart).toBeTrue();
        expect(app.model.board.pieces.length).toBe(16);
    });

    it('retains the application title', () => {
        expect(fixture.componentInstance.title).toBe('app');
    });

    it('moves renderer updates from native callbacks back into the Angular zone', () => {
        const zone = TestBed.inject(NgZone);
        const run = spyOn(zone, 'run').and.callThrough();
        const app = fixture.componentInstance;
        zone.runOutsideAngular(() => app.render({
            ...app.model,
            agentProgress: { label: 'Downloading Kev model', loaded: 42, total: 100 }
        }));
        expect(run).toHaveBeenCalled();
        expect(app.model.agentProgress.loaded).toBe(42);
    });

    it('defaults to Human Agent and changes the opponent without starting', () => {
        const app = fixture.componentInstance;
        expect(app.selectedAgentId).toBe('human');
        app.selectOpponentAgent('minimax');
        expect(app.selectedAgent.label).toBe('Minimax Agent');
        expect(app.model.phase).toBe('ready');
    });

    it('starts with a fresh instance of the selected White agent', fakeAsync(() => {
        const app = fixture.componentInstance;
        app.selectOpponentAgent('alpha-beta');
        app.start();
        expect(app.model.agentPreparing).toBeTrue();
        expect(app.model.setupAnimating).toBeFalse();
        expect(app.model.players[1].name).toBe('Minimax with Alpha-Beta Pruning Agent');
        tick(600);
        expect(app.model.phase).toBe('active');
        expect(app.model.controls.canStart).toBeFalse();
        app.ngOnDestroy();
    }));

    it('shows PDN diagnostics without replacing the live model', () => {
        const app = fixture.componentInstance;
        const revision = app.model.revision;
        app.pdnText = '[GameType "31"] 5-9';
        app.review();
        expect(app.diagnostic).toContain('PDN_UNSUPPORTED_HEADER');
        expect(app.model.mode).toBe('live');
        expect(app.model.revision).toBe(revision);
    });
});
