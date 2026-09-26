// tslint:disable:no-bitwise
import { MoveOption } from './types';

const FROM_MASK = 0x1f;
const TO_SHIFT = 5;
const CAPTURED_SHIFT = 10;
const CAPTURE_FLAG = 1 << 15;
const PROMOTION_FLAG = 1 << 16;

export class MoveCodec {
    static encode(fromIndex: number, toIndex: number, capturedIndex: number, promotion: boolean): number {
        let value = (fromIndex & FROM_MASK) | ((toIndex & FROM_MASK) << TO_SHIFT);
        if (capturedIndex >= 0) {
            value |= (capturedIndex & FROM_MASK) << CAPTURED_SHIFT;
            value |= CAPTURE_FLAG;
        }
        if (promotion) {
            value |= PROMOTION_FLAG;
        }
        return value >>> 0;
    }

    static fromIndex(move: number): number {
        return move & FROM_MASK;
    }

    static toIndex(move: number): number {
        return (move >>> TO_SHIFT) & FROM_MASK;
    }

    static capturedIndex(move: number): number {
        return this.isCapture(move) ? (move >>> CAPTURED_SHIFT) & FROM_MASK : -1;
    }

    static isCapture(move: number): boolean {
        return (move & CAPTURE_FLAG) !== 0;
    }

    static isPromotion(move: number): boolean {
        return (move & PROMOTION_FLAG) !== 0;
    }

    static toOption(move: number): MoveOption {
        return {
            code: move >>> 0,
            from: this.fromIndex(move) + 1,
            to: this.toIndex(move) + 1,
            capture: this.isCapture(move),
            capturedSquare: this.isCapture(move) ? this.capturedIndex(move) + 1 : null,
            promotion: this.isPromotion(move)
        };
    }
}
