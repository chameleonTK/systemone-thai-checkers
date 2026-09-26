import { HumanAgent, PlayableAgent, TurnCancellation } from '../agents';
import { AgentTurnContext } from '../agents/agent-api';
import { CheckerEngine, MoveIntent } from '../engine';
import { activeEngine } from '../engine/test-fixtures';
import { GameViewModel, SessionDiagnostic } from '../presentation';
import { GameSession, RendererPort } from './game-session';

class TestRenderer implements RendererPort {
    models: GameViewModel[] = [];
    diagnostics: SessionDiagnostic[] = [];
    setupGate: Promise<void> = Promise.resolve();

    render(model: GameViewModel): void {
        this.models.push(model);
    }

    animateSetup(model: GameViewModel): Promise<void> {
        this.models.push(model);
        return this.setupGate;
    }

    animateTransition(model: GameViewModel): Promise<void> {
        this.models.push(model);
        return Promise.resolve();
    }

    showDiagnostic(diagnostic: SessionDiagnostic): void {
        this.diagnostics.push(diagnostic);
    }
}

class DeferredAgent implements PlayableAgent {
    context: AgentTurnContext;
    cancellation: TurnCancellation;
    private resolveChoice: (intent: MoveIntent) => void;
    private rejectChoice: (error: Error) => void;

    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        this.context = context;
        this.cancellation = cancellation;
        return new Promise<MoveIntent>((resolve, reject) => {
            this.resolveChoice = resolve;
            this.rejectChoice = reject;
        });
    }

    resolve(intent: MoveIntent): void {
        this.resolveChoice(intent);
    }

    reject(message: string): void {
        this.rejectChoice(new Error(message));
    }
}

class PreparingAgent extends DeferredAgent {
    prepareCalled = false;
    private resolvePreparation: () => void;

    prepare(reportProgress: (progress: { label: string; loaded?: number; total?: number }) => void): Promise<void> {
        this.prepareCalled = true;
        reportProgress({ label: 'Loading test model', loaded: 25, total: 100 });
        return new Promise<void>((resolve) => this.resolvePreparation = resolve);
    }

    finishPreparation(): void {
        this.resolvePreparation();
    }
}

describe('GameSession', () => {
    async function flush(): Promise<void> {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    }

    it('waits for setup animation before starting and dispatching Black', async () => {
        const renderer = new TestRenderer();
        let release: () => void;
        renderer.setupGate = new Promise<void>((resolve) => release = resolve);
        const black = new DeferredAgent();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ],
            renderer
        });
        const starting = session.start();
        expect(session.getLiveSnapshot().phase).toBe('ready');
        expect(black.context).toBeUndefined();
        release();
        await starting;
        expect(session.getLiveSnapshot().phase).toBe('active');
        expect(black.context.player).toBe('black');
        session.destroy();
    });

    it('loads a preparable agent after Start and before dispatching its first turn', async () => {
        const renderer = new TestRenderer();
        const black = new PreparingAgent();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        const starting = session.start();
        expect(black.prepareCalled).toBeTrue();
        expect(black.context).toBeUndefined();
        expect(session.getLiveSnapshot().phase).toBe('ready');
        expect(renderer.models[renderer.models.length - 1].agentProgress).toEqual({
            label: 'Loading test model', loaded: 25, total: 100
        });
        expect(renderer.models[renderer.models.length - 1].setupAnimating).toBeFalse();
        expect(renderer.models[renderer.models.length - 1].agentPreparing).toBeTrue();
        black.finishPreparation();
        await starting;
        expect(black.context.player).toBe('black');
        expect(renderer.models[renderer.models.length - 1].agentProgress).toBeNull();
        session.destroy();
    });

    it('routes human selection through legal highlights and submits a move', async () => {
        const renderer = new TestRenderer();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ],
            renderer
        });
        await session.start();
        session.selectSquare(5);
        expect(renderer.models[renderer.models.length - 1].board.tiles[5][7].highlighted).toBeTrue();
        session.selectSquare(9);
        await flush();
        expect(session.getLiveSnapshot().pieces).toContain(jasmine.objectContaining({ square: 9, player: 'black' }));
        expect(session.getLiveSnapshot().activePlayer).toBe('white');
        session.destroy();
    });

    it('clears highlights after an impermissible destination', async () => {
        const renderer = new TestRenderer();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        session.selectSquare(5);
        session.selectSquare(10);
        const model = renderer.models[renderer.models.length - 1];
        expect(model.board.tiles.some((row) => row.some((tile) => tile.highlighted))).toBeFalse();
        expect(session.getLiveSnapshot().stepIndex).toBe(0);
        session.destroy();
    });

    it('ignores a delayed answer after review cancels the turn', async () => {
        const renderer = new TestRenderer();
        const black = new DeferredAgent();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        const liveBefore = session.getLiveSnapshot();
        expect(session.openReview('5-9 *').ok).toBeTrue();
        expect(black.cancellation.cancelled).toBeTrue();
        black.resolve({ from: 5, to: 9 });
        await flush();
        expect(session.getLiveSnapshot()).toEqual(liveBefore);
        session.returnToLive();
        session.destroy();
    });

    it('keeps live state unchanged while navigating review', async () => {
        const renderer = new TestRenderer();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        session.selectSquare(5);
        session.selectSquare(9);
        await flush();
        const live = session.getLiveSnapshot();
        session.openReview('5-9 28-24 *');
        session.reviewStepForward();
        session.reviewStepForward();
        session.reviewStepBack();
        expect(session.getLiveSnapshot()).toEqual(live);
        session.returnToLive();
        expect(session.getLiveSnapshot()).toEqual(live);
        session.destroy();
    });

    it('surfaces agent exceptions without ending or mutating the game', async () => {
        const renderer = new TestRenderer();
        const black = new DeferredAgent();
        const engine = CheckerEngine.createThaiGame([
            { id: 'black', name: 'Black', color: '#000' },
            { id: 'white', name: 'White', color: '#fff' }
        ]);
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer, engine
        });
        await session.start();
        const before = session.getLiveSnapshot();
        black.reject('broken bot');
        await flush();
        expect(session.getLiveSnapshot()).toEqual(before);
        expect(renderer.diagnostics).toContain(jasmine.objectContaining({
            code: 'AGENT_ERROR', message: 'broken bot'
        }));
        session.destroy();
    });

    it('renders agent progress and clears it when the move resolves', async () => {
        const renderer = new TestRenderer();
        const black = new DeferredAgent();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        black.context.reportProgress({ label: 'Downloading Kev model', loaded: 50, total: 100 });
        expect(renderer.models[renderer.models.length - 1].agentProgress).toEqual({
            label: 'Downloading Kev model', loaded: 50, total: 100
        });
        const move = black.context.legalMoves[0];
        black.resolve({ from: move.from, to: move.to });
        await flush();
        expect(renderer.models[renderer.models.length - 1].agentProgress).toBeNull();
        session.destroy();
    });

    it('rejects illegal bot output, preserves state, and requests the turn again', async () => {
        const renderer = new TestRenderer();
        const black = new DeferredAgent();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: black },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        const before = session.getLiveSnapshot();
        const firstTurnId = black.context.turnId;
        black.resolve({ from: 1, to: 5 });
        await flush();
        expect(session.getLiveSnapshot()).toEqual(before);
        expect(renderer.diagnostics).toContain(jasmine.objectContaining({ code: 'illegal-move' }));
        expect(black.context.turnId).not.toBe(firstTurnId);
        session.destroy();
    });

    it('keeps the game ready and reports a failed setup animation', async () => {
        const renderer = new TestRenderer();
        renderer.setupGate = Promise.reject(new Error('animation failed'));
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer
        });
        await session.start();
        expect(session.getLiveSnapshot().phase).toBe('ready');
        expect(renderer.diagnostics).toContain(jasmine.objectContaining({
            code: 'SETUP_ANIMATION_ERROR', message: 'animation failed'
        }));
        session.destroy();
    });

    it('automatically reselects and highlights the forced continuation piece', async () => {
        const renderer = new TestRenderer();
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32] });
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ], renderer, engine
        });
        session.retryTurn();
        session.selectSquare(9);
        session.selectSquare(18);
        await flush();
        const model = renderer.models[renderer.models.length - 1];
        expect(model.board.pieces.find((piece) => piece.square === 18).selected).toBeTrue();
        expect(model.board.tiles.some((row) => row.some((tile) => tile.square === 27 && tile.highlighted))).toBeTrue();
        session.destroy();
    });

    it('plays every imported review step while preserving the live match', async () => {
        const renderer = new TestRenderer();
        const session = new GameSession({
            seats: [
                { player: { id: 'black', name: 'Black', color: '#000' }, agent: new HumanAgent() },
                { player: { id: 'white', name: 'White', color: '#fff' }, agent: new HumanAgent() }
            ],
            renderer,
            delay: () => Promise.resolve()
        });
        await session.start();
        const live = session.getLiveSnapshot();
        expect(session.openReview('5-9 28-24 6-10 *').ok).toBeTrue();
        await session.playReview();
        const model = renderer.models[renderer.models.length - 1];
        expect(model.mode).toBe('review');
        expect(model.reviewCursor).toBe(3);
        expect(model.reviewLength).toBe(3);
        expect(session.getLiveSnapshot()).toEqual(live);
        session.destroy();
    });
});
