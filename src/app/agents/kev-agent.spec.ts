import { CheckerEngine, MoveOption } from '../engine';
import { AgentTurnContext, TurnCancellationSource } from './agent-api';
import { KevAgent, KevSystemOneClient, KEV_MOVE_LIMIT } from './kev-agent';

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

function activeContext(): AgentTurnContext {
    const engine: CheckerEngine = CheckerEngine.createThaiGame();
    engine.start();
    return context(engine);
}

describe('KevAgent', () => {
    it('plays the sole legal move without loading Kev', async () => {
        const gameContext: AgentTurnContext = activeContext();
        const onlyMove: MoveOption = gameContext.legalMoves[0];
        const loadClient: jasmine.Spy = jasmine.createSpy('loadClient');
        const choice = await new KevAgent({ loadClient }).chooseMove(
            { ...gameContext, legalMoves: [onlyMove] },
            new TurnCancellationSource()
        );
        expect(choice).toEqual({ from: onlyMove.from, to: onlyMove.to });
        expect(loadClient).not.toHaveBeenCalled();
    });

    it('asks System One to choose from the legal moves', async () => {
        const gameContext: AgentTurnContext = activeContext();
        let request: any;
        const client: KevSystemOneClient = {
            systemOne: (input: unknown) => {
                request = input;
                return Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_2' } } });
            }
        };
        const choice = await new KevAgent({ client }).chooseMove(gameContext, new TurnCancellationSource());
        expect(choice).toEqual({
            from: gameContext.legalMoves[1].from,
            to: gameContext.legalMoves[1].to
        });
        expect(request.questions.move.type).toBe('choice');
        expect(Object.keys(request.questions.move.criteria).length).toBe(gameContext.legalMoves.length);
        expect(request.state.sideToMove).toBe(gameContext.player);
    });

    it('prepares the model once before later move choices', async () => {
        const gameContext: AgentTurnContext = activeContext();
        const client: KevSystemOneClient = {
            systemOne: () => Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } })
        };
        const loadClient: jasmine.Spy = jasmine.createSpy('loadClient').and.returnValue(Promise.resolve(client));
        const progress: number[] = [];
        const agent = new KevAgent({ loadClient });
        await agent.prepare((update) => progress.push(update.loaded));
        await agent.chooseMove(gameContext, new TurnCancellationSource());
        expect(loadClient).toHaveBeenCalledTimes(1);
        expect(progress).toEqual([0]);
    });

    it('randomly samples no more than 128 legal moves without changing the source list', async () => {
        const gameContext: AgentTurnContext = activeContext();
        const moves: MoveOption[] = Array.from({ length: KEV_MOVE_LIMIT + 2 }, (_, index: number) => ({
            code: index,
            from: Math.floor(index / 32) + 1,
            to: (index % 32) + 1,
            capture: false,
            capturedSquare: null,
            promotion: false
        }));
        const original: MoveOption[] = moves.slice();
        let optionCount = 0;
        const client: KevSystemOneClient = {
            systemOne: (input: any) => {
                optionCount = Object.keys(input.questions.move.criteria).length;
                return Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } });
            }
        };
        const choice = await new KevAgent({ client, random: { next: () => 0.999 } }).chooseMove(
            { ...gameContext, legalMoves: moves },
            new TurnCancellationSource()
        );
        expect(optionCount).toBe(KEV_MOVE_LIMIT);
        expect(choice).toEqual({ from: 5, to: 2 });
        expect(moves).toEqual(original);
    });

    it('rejects cancelled, empty, and invalid model choices', async () => {
        const gameContext: AgentTurnContext = activeContext();
        const cancelled = new TurnCancellationSource();
        cancelled.cancel();
        await expectAsync(new KevAgent().chooseMove(gameContext, cancelled))
            .toBeRejectedWithError('Turn was cancelled.');
        await expectAsync(new KevAgent().chooseMove(
            { ...gameContext, legalMoves: [] },
            new TurnCancellationSource()
        )).toBeRejectedWithError('No legal move is available.');

        const client: KevSystemOneClient = {
            systemOne: () => Promise.resolve({
                answers: { move: { type: 'choice', choice: 'not_a_move' } }
            })
        };
        await expectAsync(new KevAgent({ client }).chooseMove(gameContext, new TurnCancellationSource()))
            .toBeRejectedWithError('Kev returned an unknown move option.');
    });
});
