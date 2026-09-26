import { MoveIntent, MoveOption } from '../engine';
import {
    AgentTurnContext,
    InteractiveAgent,
    SelectionState,
    TurnCancellation
} from './agent-api';

interface PendingTurn {
    readonly context: AgentTurnContext;
    readonly resolve: (intent: MoveIntent) => void;
}

const EMPTY_SELECTION: SelectionState = Object.freeze({
    selectedSquare: null,
    highlightedSquares: Object.freeze([] as number[])
});

export class HumanAgent implements InteractiveAgent {
    private pending: PendingTurn | null = null;
    private selection: SelectionState = EMPTY_SELECTION;

    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        this.pending = null;
        this.selection = context.snapshot.forcedSquare === null
            ? EMPTY_SELECTION
            : this.selectionFor(context.snapshot.forcedSquare, context.legalMoves);

        return new Promise<MoveIntent>((resolve) => {
            this.pending = { context, resolve };
            cancellation.onCancel(() => {
                this.pending = null;
                this.selection = EMPTY_SELECTION;
            });
        });
    }

    selectSquare(square: number): SelectionState {
        if (!this.pending) {
            this.selection = EMPTY_SELECTION;
            return this.selection;
        }
        const context = this.pending.context;
        if (this.selection.selectedSquare !== null) {
            const chosen = context.legalMoves.find((move) =>
                move.from === this.selection.selectedSquare && move.to === square);
            if (chosen) {
                const resolve = this.pending.resolve;
                this.pending = null;
                this.selection = EMPTY_SELECTION;
                resolve({ from: chosen.from, to: chosen.to });
                return this.selection;
            }
        }

        const selectedMoves = context.legalMoves.filter((move) => move.from === square);
        const piece = context.snapshot.pieces.find((candidate) => candidate.square === square);
        if (piece && piece.player === context.player && selectedMoves.length > 0) {
            this.selection = this.selectionFor(square, selectedMoves);
        } else {
            this.selection = EMPTY_SELECTION;
        }
        return this.selection;
    }

    getSelection(): SelectionState {
        return this.selection;
    }

    private selectionFor(square: number, moves: ReadonlyArray<MoveOption>): SelectionState {
        return Object.freeze({
            selectedSquare: square,
            highlightedSquares: Object.freeze(moves.filter((move) => move.from === square).map((move) => move.to))
        });
    }
}
