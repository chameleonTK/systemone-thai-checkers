import { BoardStatComponentComponent } from './board-stat-component.component';
import { AGENT_REGISTRY } from '../agents';

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

    it('shows the selected registered agent and emits opponent changes', () => {
        const component = new BoardStatComponentComponent();
        component.agentOptions = AGENT_REGISTRY;
        component.selectedAgentId = 'human';
        expect(component.selectedAgentLabel()).toBe('Human Agent');
        spyOn(component.opponentAgentChange, 'emit');
        component.opponentAgentChange.emit('alpha-beta');
        expect(component.opponentAgentChange.emit).toHaveBeenCalledWith('alpha-beta');
    });

    it('shows Player 2 above Player 1 and updates the opponent type from the selection', () => {
        const component = new BoardStatComponentComponent();
        const black = {
            id: 'black' as const, name: 'Player 1', color: '#444', active: false, manCount: 8, kingCount: 0
        };
        const white = {
            id: 'white' as const, name: 'Opponent', color: '#e66', active: false, manCount: 8, kingCount: 0
        };
        component.model = { players: [black, white] } as any;
        component.agentOptions = AGENT_REGISTRY;
        component.selectedAgentId = 'random';

        expect(component.displayedPlayers()).toEqual([white, black]);
        expect(component.playerNumber(white)).toBe(2);
        expect(component.playerType(white)).toBe('Random Agent');
        expect(component.playerType(black)).toBe('Human Agent');

        component.selectedAgentId = 'minimax';
        expect(component.playerType(white)).toBe('Minimax Agent');
    });

    it('shows both selected agent types in Watch mode and emits seat changes', () => {
        const component = new BoardStatComponentComponent();
        const black = {
            id: 'black' as const, name: 'Player 1', color: '#444', active: false, manCount: 8, kingCount: 0
        };
        const white = {
            id: 'white' as const, name: 'Player 2', color: '#e66', active: false, manCount: 8, kingCount: 0
        };
        component.model = { players: [black, white] } as any;
        component.gameMode = 'watch';
        component.agentOptions = AGENT_REGISTRY;
        component.selectedWatchBlackAgentId = 'random';
        component.selectedWatchWhiteAgentId = 'alpha-beta';

        expect(component.playerType(black)).toBe('Random Agent');
        expect(component.playerType(white)).toBe('Minimax with Alpha-Beta Pruning Agent');
        spyOn(component.watchBlackAgentChange, 'emit');
        spyOn(component.watchWhiteAgentChange, 'emit');
        component.watchBlackAgentChange.emit('minimax');
        component.watchWhiteAgentChange.emit('random');
        expect(component.watchBlackAgentChange.emit).toHaveBeenCalledWith('minimax');
        expect(component.watchWhiteAgentChange.emit).toHaveBeenCalledWith('random');
    });

    it('calculates bounded model-loading progress and supports an indeterminate state', () => {
        const component = new BoardStatComponentComponent();
        component.model = { agentProgress: { label: 'Loading Kev model' } } as any;
        expect(component.loadingPercent()).toBeNull();
        component.model = { agentProgress: { label: 'Downloading', loaded: 25, total: 100 } } as any;
        expect(component.loadingPercent()).toBe(25);
        component.model = { agentProgress: { label: 'Downloading', loaded: 120, total: 100 } } as any;
        expect(component.loadingPercent()).toBe(100);
    });
});
