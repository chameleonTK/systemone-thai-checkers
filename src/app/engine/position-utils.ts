// tslint:disable:no-bitwise
import { GamePosition, PieceKind, PlayerId } from './types';

export function bit(index: number): number {
    return (1 << index) >>> 0;
}

export function hasBit(mask: number, index: number): boolean {
    return ((mask >>> 0) & bit(index)) !== 0;
}

export function addBit(mask: number, index: number): number {
    return (mask | bit(index)) >>> 0;
}

export function removeBit(mask: number, index: number): number {
    return (mask & ~bit(index)) >>> 0;
}

export function occupancy(position: GamePosition): number {
    return (position.blackMen | position.blackKings | position.whiteMen | position.whiteKings) >>> 0;
}

export function playerMask(position: GamePosition, player: PlayerId): number {
    return player === 'black'
        ? (position.blackMen | position.blackKings) >>> 0
        : (position.whiteMen | position.whiteKings) >>> 0;
}

export function opponentMask(position: GamePosition, player: PlayerId): number {
    return playerMask(position, player === 'black' ? 'white' : 'black');
}

export function kindAt(position: GamePosition, index: number): PieceKind | null {
    if (hasBit(position.blackMen | position.whiteMen, index)) {
        return 'man';
    }
    if (hasBit(position.blackKings | position.whiteKings, index)) {
        return 'king';
    }
    return null;
}

export function ownerAt(position: GamePosition, index: number): PlayerId | null {
    if (hasBit(position.blackMen | position.blackKings, index)) {
        return 'black';
    }
    if (hasBit(position.whiteMen | position.whiteKings, index)) {
        return 'white';
    }
    return null;
}

export function countBits(mask: number): number {
    let value = mask >>> 0;
    let count = 0;
    while (value !== 0) {
        value = (value & (value - 1)) >>> 0;
        count += 1;
    }
    return count;
}

export function positionKey(position: GamePosition): string {
    return [
        position.blackMen >>> 0,
        position.blackKings >>> 0,
        position.whiteMen >>> 0,
        position.whiteKings >>> 0,
        position.sideToMove
    ].join(':');
}
