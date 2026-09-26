import { MoveIntent } from '../engine';
import { AgentTurnContext, PlayableAgent, TurnCancellation } from './agent-api';

export interface RandomSource {
    next(): number;
}

export class MathRandomSource implements RandomSource {
    next(): number {
        return Math.random();
    }
}

export class RandomBot implements PlayableAgent {
    constructor(private readonly random: RandomSource = new MathRandomSource()) {}

    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        if (cancellation.cancelled) {
            return Promise.reject(new Error('Turn was cancelled.'));
        }
        if (context.legalMoves.length === 0) {
            return Promise.reject(new Error('No legal move is available.'));
        }
        const index = Math.min(
            context.legalMoves.length - 1,
            Math.floor(this.random.next() * context.legalMoves.length)
        );
        const move = context.legalMoves[index];
        return Promise.resolve({ from: move.from, to: move.to });
    }
}
