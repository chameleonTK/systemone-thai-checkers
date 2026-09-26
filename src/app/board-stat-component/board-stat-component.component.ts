import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AgentRegistration } from '../agents';
import { Lang } from '../Lang';
import { GameViewModel, PlayerView } from '../presentation';

@Component({
    selector: 'app-board-stat',
    templateUrl: './board-stat-component.component.html',
    styleUrls: ['./board-stat-component.component.css']
})
export class BoardStatComponentComponent {
    @Input() model: GameViewModel;
    @Input() pdnText = '';
    @Input() diagnostic = '';
    @Input() agentOptions: ReadonlyArray<AgentRegistration> = [];
    @Input() selectedAgentId = '';
    @Output() pdnTextChange = new EventEmitter<string>();
    @Output() opponentAgentChange = new EventEmitter<string>();
    @Output() startGame = new EventEmitter<void>();
    @Output() rewindGame = new EventEmitter<void>();
    @Output() resignGame = new EventEmitter<void>();
    @Output() openReview = new EventEmitter<void>();
    @Output() reviewForward = new EventEmitter<void>();
    @Output() reviewBack = new EventEmitter<void>();
    @Output() playReview = new EventEmitter<void>();
    @Output() returnToLive = new EventEmitter<void>();

    readonly lang = new Lang();

    txt(key: string): string {
        return this.lang.txt(key);
    }

    getBackgroundColor(player: PlayerView): string {
        return player.active ? player.color : '#fff';
    }

    getTextColor(player: PlayerView): string {
        return player.active ? '#fff' : player.color;
    }

    displayedPlayers(): ReadonlyArray<PlayerView> {
        return this.model ? [...this.model.players].reverse() : [];
    }

    playerNumber(player: PlayerView): number {
        return player.id === 'black' ? 1 : 2;
    }

    playerType(player: PlayerView): string {
        return player.id === 'black' ? 'Human Agent' : this.selectedAgentLabel();
    }

    updatePdn(value: string): void {
        this.pdnTextChange.emit(value);
    }

    selectedAgentLabel(): string {
        const selected = this.agentOptions.find((agent) => agent.id === this.selectedAgentId);
        return selected ? selected.label : 'Human Agent';
    }
}
