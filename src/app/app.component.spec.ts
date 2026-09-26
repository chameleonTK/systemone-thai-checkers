import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
