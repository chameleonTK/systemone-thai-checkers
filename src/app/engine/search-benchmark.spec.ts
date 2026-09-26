import { CheckerEngine } from './checker-engine';
import { SearchSession } from './search-session';

describe('SearchSession deterministic benchmark', () => {
    function countLeaves(session: SearchSession, depth: number, buffers: number[][]): number {
        if (depth === 0 || session.getResult().status !== 'ongoing') {
            return 1;
        }
        const moves = buffers[depth];
        session.legalMoves(moves);
        let leaves = 0;
        for (const move of moves) {
            session.makeMove(move);
            leaves += countLeaves(session, depth - 1, buffers);
            session.unmakeMove();
        }
        return leaves;
    }

    it('reports stable depth-six throughput without imposing a timing threshold', () => {
        const session = CheckerEngine.createThaiGame().createSimulationSeed().createSession();
        const root = session.getPosition();
        const buffers = Array.from({ length: 7 }, () => [] as number[]);
        const started = performance.now();
        const leaves = countLeaves(session, 6, buffers);
        const elapsedMilliseconds = Math.max(performance.now() - started, 0.01);
        const nodesPerSecond = Math.round(leaves * 1000 / elapsedMilliseconds);

        expect(leaves).toBe(218695);
        expect(session.getPosition()).toEqual(root);
        expect(nodesPerSecond).toBeGreaterThan(0);
        // This is intentionally informational: absolute browser timing is too noisy for a CI gate.
        // tslint:disable-next-line:no-console
        console.info(`Search benchmark: ${leaves} leaves in ${elapsedMilliseconds.toFixed(1)} ms (${nodesPerSecond}/s)`);
    });
});
