import { CheckerEngine } from '../engine';
import { HumanAgent } from './human-agent';
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
