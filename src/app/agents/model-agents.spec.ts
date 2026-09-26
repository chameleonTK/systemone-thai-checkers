import { CheckerEngine, MoveOption } from '../engine';
import { AgentTurnContext, TurnCancellationSource } from './agent-api';
import { LayaAgent, LAYA_MOVE_LIMIT } from './laya-agent';
import { OpenThaiAgent } from './openthai-agent';
import { SystemOneClient } from './system-one-agent';

function activeContext(): AgentTurnContext {
    const engine: CheckerEngine = CheckerEngine.createThaiGame();
    engine.start();
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

describe('Additional System One agents', () => {
    it('defaults both model agents to INT8 and accepts INT4 as a constructor parameter', () => {
        const client: SystemOneClient = {
            systemOne: () => Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } })
        };
        expect(new LayaAgent({ client }).precision).toBe('int8');
        expect(new LayaAgent({ client, precision: 'int4' }).precision).toBe('int4');
        expect(new OpenThaiAgent({ client }).precision).toBe('int8');
        expect(new OpenThaiAgent({ client, precision: 'int4' }).precision).toBe('int4');
        expect(() => new LayaAgent({ client, moveLimit: LAYA_MOVE_LIMIT + 1 }))
            .toThrowError(`System One move limit must be an integer between 1 and ${LAYA_MOVE_LIMIT}.`);
    });

    it('samples Laya requests to its responsive 16-move limit', async () => {
        const gameContext: AgentTurnContext = activeContext();
        const moves: MoveOption[] = Array.from({ length: LAYA_MOVE_LIMIT + 2 }, (_, index: number) => ({
            code: index,
            from: Math.floor(index / 32) + 1,
            to: (index % 32) + 1,
            capture: false,
            capturedSquare: null,
            promotion: false
        }));
        let optionCount = 0;
        const client: SystemOneClient = {
            systemOne: (input: any) => {
                optionCount = Object.keys(input.questions.move.criteria).length;
                return Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } });
            }
        };
        const choice = await new LayaAgent({ client, random: { next: () => 0.999 } }).chooseMove(
            { ...gameContext, legalMoves: moves },
            new TurnCancellationSource()
        );
        expect(optionCount).toBe(LAYA_MOVE_LIMIT);
        expect(moves.some((move) => move.from === choice.from && move.to === choice.to)).toBeTrue();
    });

    it('clears a failed preparation so the same agent can retry', async () => {
        const client: SystemOneClient = {
            systemOne: () => Promise.resolve({ answers: { move: { type: 'choice', choice: 'move_1' } } })
        };
        let attempts = 0;
        const agent = new OpenThaiAgent({
            loadClient: () => {
                attempts += 1;
                return attempts === 1 ? Promise.reject(new Error('load failed')) : Promise.resolve(client);
            }
        });
        await expectAsync(agent.prepare(() => undefined)).toBeRejectedWithError('load failed');
        await expectAsync(agent.prepare(() => undefined)).toBeResolved();
        expect(attempts).toBe(2);
    });

    it('rejects malformed answers rather than accepting their choice field', async () => {
        const client: SystemOneClient = {
            systemOne: () => Promise.resolve({
                answers: { move: { type: 'score', choice: 'move_1' } }
            })
        };
        await expectAsync(new OpenThaiAgent({ client }).chooseMove(activeContext(), new TurnCancellationSource()))
            .toBeRejectedWithError('OpenThai returned an unknown move option.');
    });
});
