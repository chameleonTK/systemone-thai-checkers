import { BoardGeometry, GameSnapshot } from '../engine';
import { AgentProgress, SelectionState } from '../agents';
import {
    BoardView,
    GameViewModel,
    PieceView,
    PlayerView,
    SessionMode,
    TileView
} from './view-model';

export interface PresentationState {
    readonly mode: SessionMode;
    readonly selection: SelectionState;
    readonly setupAnimating?: boolean;
    readonly reviewCursor?: number;
    readonly reviewLength?: number;
    readonly agentProgress?: AgentProgress | null;
}

export class GamePresenter {
    project(snapshot: GameSnapshot, state: PresentationState): GameViewModel {
        const players: PlayerView[] = snapshot.players.map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            active: state.mode === 'live' && player.active,
            manCount: player.manCount,
            kingCount: player.kingCount
        }));
        const board = this.board(snapshot, state, players);
        return Object.freeze({
            mode: state.mode,
            phase: snapshot.phase,
            revision: snapshot.revision,
            stepIndex: snapshot.stepIndex,
            completedTurns: snapshot.completedTurns,
            activePlayer: snapshot.activePlayer,
            players: Object.freeze(players),
            board,
            historyText: Object.freeze(snapshot.history.map((turn) => {
                const squares = [turn.steps[0].from].concat(turn.steps.map((step) => step.to));
                return `${turn.player === 'black' ? 'B' : 'W'} ${squares.join('-')}${turn.completed ? '' : ' …'}`;
            })),
            noProgressTurns: snapshot.noProgressTurns,
            result: snapshot.result,
            resultText: this.resultText(snapshot),
            controls: Object.freeze({
                canStart: state.mode === 'live' && snapshot.phase === 'ready',
                canRewind: state.mode === 'live'
                    ? snapshot.stepIndex > 0
                    : (state.reviewCursor || 0) > 0,
                canResign: state.mode === 'live' && snapshot.phase === 'active',
                canReviewStepForward: state.mode === 'review'
                    && (state.reviewCursor || 0) < (state.reviewLength || 0),
                canReviewStepBack: state.mode === 'review' && (state.reviewCursor || 0) > 0,
                canReturnToLive: state.mode === 'review'
            }),
            setupAnimating: !!state.setupAnimating,
            reviewCursor: state.reviewCursor || 0,
            reviewLength: state.reviewLength || 0,
            agentProgress: state.agentProgress || null
        });
    }

    private board(snapshot: GameSnapshot, state: PresentationState, players: ReadonlyArray<PlayerView>): BoardView {
        const highlights = new Set<number>(state.selection.highlightedSquares);
        const tiles: TileView[][] = [];
        for (let row = 0; row < 8; row += 1) {
            const tileRow: TileView[] = [];
            for (let column = 0; column < 8; column += 1) {
                const logicalCoordinate = BoardGeometry.changePerspective(row, column) as { row: number; column: number };
                const square = BoardGeometry.toSquare(logicalCoordinate.row, logicalCoordinate.column);
                tileRow.push(Object.freeze({
                    row,
                    column,
                    square,
                    playable: square !== null,
                    highlighted: square !== null && highlights.has(square)
                }));
            }
            tiles.push(Object.freeze(tileRow) as TileView[]);
        }
        const pieces: PieceView[] = snapshot.pieces.map((piece) => {
            const logicalCoordinate = BoardGeometry.toCoordinate(piece.square) as { row: number; column: number };
            const coordinate = BoardGeometry.changePerspective(
                logicalCoordinate.row,
                logicalCoordinate.column
            ) as { row: number; column: number };
            const player = players.find((candidate) => candidate.id === piece.player) as PlayerView;
            return Object.freeze({
                square: piece.square,
                row: coordinate.row,
                column: coordinate.column,
                player: piece.player,
                kind: piece.kind,
                color: player.color,
                selected: state.selection.selectedSquare === piece.square,
                enabled: state.mode === 'live'
                    && snapshot.phase === 'active'
                    && snapshot.legalMoves.some((move) => move.from === piece.square)
            });
        });
        return Object.freeze({
            tiles: Object.freeze(tiles),
            pieces: Object.freeze(pieces)
        });
    }

    private resultText(snapshot: GameSnapshot): string {
        const result = snapshot.result;
        if (result.status === 'ongoing') {
            return '';
        }
        if (result.status === 'draw') {
            return result.reason === 'threefold-repetition'
                ? 'Draw by threefold repetition'
                : 'Draw after 50 turns without capture or man advance';
        }
        const winner = snapshot.players.find((player) => player.id === result.winner);
        const reason = result.reason === 'no-pieces'
            ? 'opponent has no pieces'
            : result.reason === 'no-legal-move'
                ? 'opponent has no legal move'
                : 'opponent resigned';
        return `${winner ? winner.name : result.winner} wins: ${reason}`;
    }
}
