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
    @Input() gameMode: 'play' | 'watch' = 'play';
    @Input() pdnText = '';
    @Input() diagnostic = '';
    @Input() agentOptions: ReadonlyArray<AgentRegistration> = [];
    @Input() automatedAgentOptions: ReadonlyArray<AgentRegistration> = [];
    @Input() selectedAgentId = '';
    @Input() selectedWatchBlackAgentId = '';
    @Input() selectedWatchWhiteAgentId = '';
    @Input() cacheClearing = false;
    @Output() pdnTextChange = new EventEmitter<string>();
    @Output() opponentAgentChange = new EventEmitter<string>();
    @Output() watchBlackAgentChange = new EventEmitter<string>();
    @Output() watchWhiteAgentChange = new EventEmitter<string>();
    @Output() startGame = new EventEmitter<void>();
    @Output() restartWatchGame = new EventEmitter<void>();
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
        if (this.gameMode === 'watch') {
            return this.agentLabel(player.id === 'black'
                ? this.selectedWatchBlackAgentId
                : this.selectedWatchWhiteAgentId);
        }
        return player.id === 'black' ? 'Human Agent' : this.selectedAgentLabel();
    }

    loadingPercent(): number | null {
        const progress = this.model && this.model.agentProgress;
        if (!progress || progress.loaded === undefined || !progress.total) {
            return null;
        }
        return Math.max(0, Math.min(100, Math.round(progress.loaded * 100 / progress.total)));
    }

    updatePdn(value: string): void {
        this.pdnTextChange.emit(value);
    }

    selectedAgentLabel(): string {
        return this.agentLabel(this.selectedAgentId);
    }

    agentLabel(id: string): string {
        const selected = this.agentOptions.find((agent) => agent.id === id);
        return selected ? selected.label : 'Human Agent';
    }
}
