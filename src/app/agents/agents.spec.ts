import { CheckerEngine } from '../engine';
import { activeEngine } from '../engine/test-fixtures';
import { AGENT_REGISTRY, DEFAULT_AGENT_ID, findAgentRegistration } from './agent-registry';
import { AlphaBetaAgent } from './alpha-beta-agent';
import { HumanAgent } from './human-agent';
import { MinimaxAgent } from './minimax-agent';
import { RandomBot } from './random-bot';
import { AgentTurnContext, TurnCancellationSource } from './agent-api';

function context(engine: CheckerEngine): AgentTurnContext {
    const snapshot = engine.getSnapshot();
    return Object.freeze({
        turnId: `test-${snapshot.revision}`,
        revision: snapshot.revision,
        player: snapshot.activePlayer,
        snapshot,
        legalMoves: snapshot.legalMoves,
        simulation: engine.createSimulationSeed()
    });
}

describe('HumanAgent', () => {
    it('selects only an active piece and resolves a highlighted destination', async () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const agent = new HumanAgent();
        const choice = agent.chooseMove(context(engine), new TurnCancellationSource());
        expect(agent.selectSquare(1).selectedSquare).toBeNull();
        expect(agent.selectSquare(5)).toEqual({ selectedSquare: 5, highlightedSquares: [9, 10] });
        agent.selectSquare(9);
        expect(await choice).toEqual({ from: 5, to: 9 });
    });

    it('clears selection after an impermissible destination', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const agent = new HumanAgent();
        agent.chooseMove(context(engine), new TurnCancellationSource());
        agent.selectSquare(5);
        expect(agent.selectSquare(10)).toEqual({ selectedSquare: null, highlightedSquares: [] });
    });

    it('clears pending interaction on cancellation', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const agent = new HumanAgent();
        const cancellation = new TurnCancellationSource();
        agent.chooseMove(context(engine), cancellation);
        cancellation.cancel();
        expect(agent.selectSquare(5)).toEqual({ selectedSquare: null, highlightedSquares: [] });
    });
});

describe('RandomBot', () => {
    it('uses only the public legal move list and an injectable random source', async () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const bot = new RandomBot({ next: () => 0.999 });
        const gameContext = context(engine);
        const choice = await bot.chooseMove(gameContext, new TurnCancellationSource());
        const expected = gameContext.legalMoves[gameContext.legalMoves.length - 1];
        expect(choice).toEqual({ from: expected.from, to: expected.to });
    });

    it('cannot mutate live state through snapshot or simulation seed copies', () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const gameContext = context(engine);
        const before = engine.getSnapshot();
        gameContext.simulation.position.blackMen = 0;
        expect(engine.getSnapshot()).toEqual(before);
        expect(Object.isFrozen(gameContext.snapshot.pieces)).toBeTrue();
        expect(Object.isFrozen(gameContext.legalMoves)).toBeTrue();
    });
});

describe('Search agents', () => {
    it('validates configured depth', () => {
        expect(() => new MinimaxAgent({ depth: 0 })).toThrowError('Search depth must be a positive integer.');
        expect(() => new AlphaBetaAgent({ depth: 1.5 })).toThrowError('Search depth must be a positive integer.');
    });

    it('chooses an immediate terminal win over non-terminal alternatives', async () => {
        const engine = activeEngine({ blackKings: [7], whiteMen: [8] });
        const choice = await new MinimaxAgent({ depth: 1, random: { next: () => 0 } })
            .chooseMove(context(engine), new TurnCancellationSource());
        expect(choice).toEqual({ from: 7, to: 4 });
    });

    it('searches a forced multi-jump without consuming another turn of depth', async () => {
        const engine = activeEngine({ blackMen: [9, 10], whiteMen: [13, 22, 32] });
        const choice = await new MinimaxAgent({ depth: 1, random: { next: () => 0 } })
            .chooseMove(context(engine), new TurnCancellationSource());
        expect(choice).toEqual({ from: 9, to: 18 });
    });

    it('uses injected randomness only to choose among equally scored root moves', async () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const gameContext = context(engine);
        const first = await new MinimaxAgent({ depth: 1, random: { next: () => 0 } })
            .chooseMove(gameContext, new TurnCancellationSource());
        const last = await new MinimaxAgent({ depth: 1, random: { next: () => 0.999 } })
            .chooseMove(gameContext, new TurnCancellationSource());
        expect(first).toEqual({ from: gameContext.legalMoves[0].from, to: gameContext.legalMoves[0].to });
        const lastLegal = gameContext.legalMoves[gameContext.legalMoves.length - 1];
        expect(last).toEqual({ from: lastLegal.from, to: lastLegal.to });
    });

    it('makes alpha-beta agree with minimax while pruning branches', async () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const gameContext = context(engine);
        const minimax = new MinimaxAgent({ depth: 3, random: { next: () => 0 } });
        const alphaBeta = new AlphaBetaAgent({ depth: 3, random: { next: () => 0 } });
        expect(await alphaBeta.chooseMove(gameContext, new TurnCancellationSource()))
            .toEqual(await minimax.chooseMove(gameContext, new TurnCancellationSource()));
        expect(alphaBeta.getLastSearchStatistics().branchesPruned).toBeGreaterThan(0);
        expect(alphaBeta.getLastSearchStatistics().nodesVisited)
            .toBeLessThan(minimax.getLastSearchStatistics().nodesVisited);
    });

    it('rejects cancelled and empty turns without mutating the simulation seed', async () => {
        const engine = CheckerEngine.createThaiGame();
        engine.start();
        const gameContext = context(engine);
        const before = gameContext.simulation.createSession().getPosition();
        const cancellation = new TurnCancellationSource();
        cancellation.cancel();
        await expectAsync(new MinimaxAgent().chooseMove(gameContext, cancellation))
            .toBeRejectedWithError('Turn was cancelled.');
        await expectAsync(new AlphaBetaAgent().chooseMove(
            { ...gameContext, legalMoves: [] },
            new TurnCancellationSource()
        )).toBeRejectedWithError('No legal move is available.');
        expect(gameContext.simulation.createSession().getPosition()).toEqual(before);
    });
});

describe('Agent registry', () => {
    it('uses unique stable IDs and defaults to Human Agent', () => {
        const ids = AGENT_REGISTRY.map((registration) => registration.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(DEFAULT_AGENT_ID).toBe('human');
        expect(findAgentRegistration(DEFAULT_AGENT_ID).label).toBe('Human Agent');
    });

    it('returns fresh independent agent instances from factories', () => {
        AGENT_REGISTRY.forEach((registration) => {
            expect(registration.create()).not.toBe(registration.create());
        });
    });
});
