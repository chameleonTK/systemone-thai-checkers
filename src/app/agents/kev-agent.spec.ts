import { CheckerEngine, MoveOption } from '../engine';
import { activeEngine } from '../engine/test-fixtures';
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
        expect(request.questions.move.instructions)
            .toBe('Select the legal move most likely to lead the black side to move to victory.');
        expect(request.state).toBe([
            'Goal: Choose the strongest provided legal move for the black side to move.',
            '',
            'Rules:',
            '- Captures are compulsory.',
            '- Men move and capture diagonally forward.',
            '- During a multi-jump, the same piece must continue capturing.',
            '- Kings slide diagonally, capture one opposing piece, and land on the immediately following empty square.',
            '- Promotion ends the turn immediately.',
            '',
            'Orientation:',
            '- Squares 01–04 are White\'s promotion edge.',
            '- Squares 29–32 are Black\'s promotion edge.',
            '- Black moves toward larger square numbers.',
            '- White moves toward smaller square numbers.',
            '',
            'Legend:',
            'BM = black man',
            'BK = black king',
            'WM = white man',
            'WK = white king',
            '-- = empty playable square',
            '',
            'Board:',
            '[01:BM][    ][02:BM][    ][03:BM][    ][04:BM][    ]',
            '[    ][05:BM][    ][06:BM][    ][07:BM][    ][08:BM]',
            '[09:--][    ][10:--][    ][11:--][    ][12:--][    ]',
            '[    ][13:--][    ][14:--][    ][15:--][    ][16:--]',
            '[17:--][    ][18:--][    ][19:--][    ][20:--][    ]',
            '[    ][21:--][    ][22:--][    ][23:--][    ][24:--]',
            '[25:WM][    ][26:WM][    ][27:WM][    ][28:WM][    ]',
            '[    ][29:WM][    ][30:WM][    ][31:WM][    ][32:WM]',
            '',
            'Your side:',
            'Black'
        ].join('\n'));
        expect(request.state).not.toContain('Options:');
        expect(request.state).not.toContain('move_1');
    });

    it('renders men, kings, empty squares, and the white side dynamically', async () => {
        const gameContext: AgentTurnContext = context(activeEngine({
            blackMen: [1],
            blackKings: [6],
            whiteMen: [27],
            whiteKings: [32],
            sideToMove: 'white'
        }));
        let request: any;
        const client: KevSystemOneClient = {
            systemOne: (input: any) => {
                request = input;
                return Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } });
            }
        };

        await new KevAgent({ client }).chooseMove(gameContext, new TurnCancellationSource());

        expect(request.state).toContain('Goal: Choose the strongest provided legal move for the white side to move.');
        expect(request.state).toContain('[01:BM]');
        expect(request.state).toContain('[06:BK]');
        expect(request.state).toContain('[27:WM]');
        expect(request.state).toContain('[32:WK]');
        expect(request.state).toContain('[02:--]');
        expect(request.state).toContain('Your side:\nWhite');
        expect(request.questions.move.instructions)
            .toBe('Select the legal move most likely to lead the white side to move to victory.');
    });

    it('offers only continuations from the forced piece during a multi-jump', async () => {
        const gameContext: AgentTurnContext = context(activeEngine({
            blackMen: [10, 18],
            whiteMen: [21, 22, 32],
            forcedSquare: 18
        }));
        let request: any;
        const client: KevSystemOneClient = {
            systemOne: (input: any) => {
                request = input;
                return Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } });
            }
        };

        await new KevAgent({ client }).chooseMove(gameContext, new TurnCancellationSource());

        expect(gameContext.legalMoves.length).toBe(2);
        expect(Object.keys(request.questions.move.criteria).map((key) => request.questions.move.criteria[key]))
            .toEqual(['18 to 25; capture 21', '18 to 27; capture 22']);
        expect(request.state).not.toContain('forcedSquare');
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
