import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BoardView, PieceView, TileView } from '../presentation';

@Component({
    selector: 'app-board',
    templateUrl: './board-component.component.html',
    styleUrls: ['./board-component.component.css']
})
export class BoardComponentComponent {
    @Input() board: BoardView;
    @Input() setupAnimating = false;
    @Input() hidePieces = false;
    @Output() squareClick = new EventEmitter<number>();

    getRowTileClassName(row: number): string {
        return `tile-row-${row}`;
    }

    getClassTile(tile: TileView): string {
        return [
            `tile-col-${tile.column}`,
            tile.playable ? 'tile-white' : 'tile-black',
            tile.highlighted ? 'highlight' : ''
        ].join(' ');
    }

    getStyleTile(tile: TileView): { [key: string]: string } {
        return { left: `${tile.column * 10}vmin`, top: `${tile.row * 10}vmin` };
    }

    onClickTile(tile: TileView): void {
        if (tile.square !== null) {
            this.squareClick.emit(tile.square);
        }
    }

    getClassPiece(piece: PieceView): string {
        return [
            piece.enabled ? 'active' : '',
            piece.kind === 'king' ? 'token-king' : '',
            piece.selected ? 'selected' : '',
            this.setupAnimating ? 'setup-enter' : '',
            this.hidePieces ? 'prestart-hidden' : ''
        ].join(' ');
    }

    getStylePiece(piece: PieceView): { [key: string]: string } {
        return { left: `${piece.column * 10}vmin`, top: `${piece.row * 10}vmin` };
    }

    getInnerStylePiece(piece: PieceView): { [key: string]: string } {
        return {
            'box-shadow': piece.selected ? `0 0 20px 0 ${piece.color}` : '',
            'background-color': piece.kind === 'king' ? `${piece.color}80` : piece.color,
            'border-color': piece.color
        };
    }

    onClickPiece(piece: PieceView): void {
        this.squareClick.emit(piece.square);
    }
}
