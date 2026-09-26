import { MoveIntent, PlayerId, SearchSession } from '../engine';
import { AgentTurnContext, PlayableAgent, TurnCancellation } from './agent-api';
import { RandomSource } from './random-source';
import {
    chooseRandom,
    evaluatePosition,
    evaluateResult,
    resolveSearchOptions,
    SearchAgentOptions,
    SearchStatistics
} from './search-agent-support';

export class AlphaBetaAgent implements PlayableAgent {
    private readonly depth: number;
    private readonly random: RandomSource;
    private statistics: SearchStatistics = Object.freeze({ nodesVisited: 0, branchesPruned: 0 });
    private nodesVisited = 0;
    private branchesPruned = 0;

    constructor(options: SearchAgentOptions = {}) {
        const resolved = resolveSearchOptions(options);
        this.depth = resolved.depth;
        this.random = resolved.random;
    }

    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        if (cancellation.cancelled) {
            return Promise.reject(new Error('Turn was cancelled.'));
        }
        if (context.legalMoves.length === 0) {
            return Promise.reject(new Error('No legal move is available.'));
        }

        try {
            this.nodesVisited = 0;
            this.branchesPruned = 0;
            const session = context.simulation.createSession();
            const scored = context.legalMoves.map((move) => {
                this.ensureActive(cancellation);
                const sideBefore = session.getPosition().sideToMove;
                session.makeMove(move.code);
                const remainingDepth = this.nextDepth(this.depth, sideBefore, session.getPosition().sideToMove);
                const score = this.search(
                    session,
                    remainingDepth,
                    context.player,
                    cancellation,
                    Number.NEGATIVE_INFINITY,
                    Number.POSITIVE_INFINITY
                );
                session.unmakeMove();
                return { move: move.code, score };
            });
            this.statistics = Object.freeze({
                nodesVisited: this.nodesVisited,
                branchesPruned: this.branchesPruned
            });
            const bestScore = Math.max(...scored.map((candidate) => candidate.score));
            const bestMoves = scored.filter((candidate) => candidate.score === bestScore);
            return Promise.resolve(session.moveToIntent(chooseRandom(bestMoves, this.random).move));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    getLastSearchStatistics(): SearchStatistics {
        return this.statistics;
    }

    private search(
        session: SearchSession,
        depth: number,
        player: PlayerId,
        cancellation: TurnCancellation,
        alpha: number,
        beta: number
    ): number {
        this.ensureActive(cancellation);
        this.nodesVisited += 1;
        const resultScore = evaluateResult(session.getResult(), player, depth);
        if (resultScore !== null) {
            return resultScore;
        }
        if (depth === 0) {
            return evaluatePosition(session.getPosition(), player);
        }

        const position = session.getPosition();
        const maximizing = position.sideToMove === player;
        let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        let lowerBound = alpha;
        let upperBound = beta;
        const moves: number[] = [];
        session.legalMoves(moves);
        for (let index = 0; index < moves.length; index += 1) {
            const sideBefore = session.getPosition().sideToMove;
            session.makeMove(moves[index]);
            const score = this.search(
                session,
                this.nextDepth(depth, sideBefore, session.getPosition().sideToMove),
                player,
                cancellation,
                lowerBound,
                upperBound
            );
            session.unmakeMove();

            if (maximizing) {
                best = Math.max(best, score);
                lowerBound = Math.max(lowerBound, best);
            } else {
                best = Math.min(best, score);
                upperBound = Math.min(upperBound, best);
            }
            if (upperBound <= lowerBound) {
                this.branchesPruned += moves.length - index - 1;
                break;
            }
        }
        return best;
    }

    private nextDepth(depth: number, before: PlayerId, after: PlayerId): number {
        return before === after ? depth : depth - 1;
    }

    private ensureActive(cancellation: TurnCancellation): void {
        if (cancellation.cancelled) {
            throw new Error('Turn was cancelled.');
        }
    }
}
