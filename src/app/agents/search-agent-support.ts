// tslint:disable:no-bitwise
import { countBits, GamePosition, GameResult, PlayerId } from '../engine';
import { MathRandomSource, RandomSource } from './random-source';

export const DEFAULT_SEARCH_DEPTH = 4;
export const TERMINAL_SCORE = 1000000;

export interface SearchAgentOptions {
    readonly depth?: number;
    readonly random?: RandomSource;
}

export interface ResolvedSearchAgentOptions {
    readonly depth: number;
    readonly random: RandomSource;
}

export interface SearchStatistics {
    readonly nodesVisited: number;
    readonly branchesPruned: number;
}

export function resolveSearchOptions(options: SearchAgentOptions = {}): ResolvedSearchAgentOptions {
    const depth = options.depth === undefined ? DEFAULT_SEARCH_DEPTH : options.depth;
    if (!Number.isInteger(depth) || depth < 1) {
        throw new Error('Search depth must be a positive integer.');
    }
    return { depth, random: options.random || new MathRandomSource() };
}

export function evaluatePosition(position: GamePosition, player: PlayerId): number {
    const ownMen = countBits(player === 'black' ? position.blackMen : position.whiteMen);
    const ownKings = countBits(player === 'black' ? position.blackKings : position.whiteKings);
    const opponentMen = countBits(player === 'black' ? position.whiteMen : position.blackMen);
    const opponentKings = countBits(player === 'black' ? position.whiteKings : position.blackKings);
    return ownMen + ownKings - opponentMen - opponentKings + 10 * ownKings;
}

export function evaluateResult(result: GameResult, player: PlayerId, remainingDepth: number): number | null {
    if (result.status === 'ongoing') {
        return null;
    }
    if (result.status === 'draw') {
        return 0;
    }
    return result.winner === player
        ? TERMINAL_SCORE + remainingDepth
        : -TERMINAL_SCORE - remainingDepth;
}

export function chooseRandom<T>(values: ReadonlyArray<T>, random: RandomSource): T {
    const index = Math.min(values.length - 1, Math.floor(random.next() * values.length));
    return values[index];
}
