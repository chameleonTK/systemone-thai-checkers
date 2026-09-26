import { MoveCodec } from './move-codec';
import { activeEngine } from './test-fixtures';

describe('SearchSession', () => {
    it('returns the same legal moves as the live engine', () => {
        const engine = activeEngine({ blackMen: [9, 10], blackKings: [14], whiteMen: [13, 22, 32] });
        const live = engine.getSnapshot().legalMoves.map((move) => move.code).sort((a, b) => a - b);
        const search = engine.createSimulationSeed().createSession();
        const simulated: number[] = [];
        search.legalMoves(simulated);
        expect(simulated.sort((a, b) => a - b)).toEqual(live);
    });

    it('make then unmake restores every compact position field', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32], noProgressTurns: 12 });
        const search = engine.createSimulationSeed().createSession();
        const before = search.getPosition();
        const moves: number[] = [];
        search.legalMoves(moves);
        search.makeMove(moves[0]);
        search.unmakeMove();
        expect(search.getPosition()).toEqual(before);
        expect(search.getResult().status).toBe('ongoing');
    });

    it('keeps sibling branches isolated', () => {
        const engine = activeEngine({ blackMen: [10], whiteMen: [32] });
        const search = engine.createSimulationSeed().createSession();
        const root = search.getPosition();
        const moves: number[] = [];
        search.legalMoves(moves);
        expect(moves.length).toBe(2);
        search.makeMove(moves[0]);
        search.unmakeMove();
        search.makeMove(moves[1]);
        expect(MoveCodec.toIndex(moves[0])).not.toBe(MoveCodec.toIndex(moves[1]));
        search.unmakeMove();
        expect(search.getPosition()).toEqual(root);
    });

    it('cloneRoot creates an independent session at the original root', () => {
        const engine = activeEngine({ blackMen: [10], whiteMen: [32] });
        const search = engine.createSimulationSeed().createSession();
        const moves: number[] = [];
        search.legalMoves(moves);
        search.makeMove(moves[0]);
        const clone = search.cloneRoot();
        expect(clone.getPosition()).not.toEqual(search.getPosition());
        expect(clone.getPosition()).toEqual(engine.createSimulationSeed().position);
    });

    it('evaluates material without constructing a UI snapshot', () => {
        const engine = activeEngine({ blackMen: [9, 10], blackKings: [14], whiteMen: [32] });
        const search = engine.createSimulationSeed().createSession();
        expect(search.evaluateMaterial('black')).toBe(4);
        expect(search.evaluateMaterial('white')).toBe(-4);
    });

    it('enforces draw counters in search', () => {
        const engine = activeEngine({ blackKings: [1], whiteKings: [4], noProgressTurns: 49 });
        const search = engine.createSimulationSeed().createSession();
        const moves: number[] = [];
        search.legalMoves(moves);
        search.makeMove(moves.find((move) => MoveCodec.toIndex(move) + 1 === 5) as number);
        expect(search.getResult()).toEqual({ status: 'draw', reason: 'fifty-turn-rule' });
    });
});
