import { BoardStatComponentComponent } from './board-stat-component.component';

describe('BoardStatComponentComponent', () => {
    it('preserves translated labels', () => {
        const component = new BoardStatComponentComponent();
        expect(component.txt('หมากฮอส')).toBe('Checkers');
        expect(component.txt('อัศวิน')).toBe('Knight');
    });

    it('styles only the active player with their color', () => {
        const component = new BoardStatComponentComponent();
        const active = {
            id: 'black' as const, name: 'A', color: '#111', active: true, manCount: 8, kingCount: 0
        };
        const inactive = { ...active, active: false };
        expect(component.getBackgroundColor(active)).toBe('#111');
        expect(component.getTextColor(active)).toBe('#fff');
        expect(component.getBackgroundColor(inactive)).toBe('#fff');
    });

    it('emits edited PDN text', () => {
        const component = new BoardStatComponentComponent();
        spyOn(component.pdnTextChange, 'emit');
        component.updatePdn('5-9 *');
        expect(component.pdnTextChange.emit).toHaveBeenCalledWith('5-9 *');
    });
});
