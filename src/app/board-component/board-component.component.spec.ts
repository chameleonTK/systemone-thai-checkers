import { CheckerEngine } from '../engine';
import { GamePresenter } from '../presentation';
import { BoardComponentComponent } from './board-component.component';

describe('BoardComponentComponent', () => {
    it('emits playable tile and piece squares', () => {
        const component = new BoardComponentComponent();
        const engine = CheckerEngine.createThaiGame();
        component.board = new GamePresenter().project(engine.getSnapshot(), {
            mode: 'live', selection: { selectedSquare: null, highlightedSquares: [] }
        }).board;
        spyOn(component.squareClick, 'emit');
        component.onClickTile(component.board.tiles[2][0]);
        component.onClickPiece(component.board.pieces[0]);
        expect(component.squareClick.emit).toHaveBeenCalledWith(9);
        expect(component.squareClick.emit).toHaveBeenCalledWith(1);
    });

    it('does not emit non-playable tiles', () => {
        const component = new BoardComponentComponent();
        const engine = CheckerEngine.createThaiGame();
        component.board = new GamePresenter().project(engine.getSnapshot(), {
            mode: 'live', selection: { selectedSquare: null, highlightedSquares: [] }
        }).board;
        spyOn(component.squareClick, 'emit');
        component.onClickTile(component.board.tiles[0][1]);
        expect(component.squareClick.emit).not.toHaveBeenCalled();
    });

    it('renders selected kings with active classes and player color', () => {
        const component = new BoardComponentComponent();
        const piece = {
            square: 1, row: 0, column: 0, player: 'black' as const, kind: 'king' as const,
            color: '#123456', selected: true, enabled: true
        };
        expect(component.getClassPiece(piece)).toContain('token-king');
        expect(component.getClassPiece(piece)).toContain('selected');
        expect(component.getInnerStylePiece(piece)['border-color']).toBe('#123456');
    });
});
