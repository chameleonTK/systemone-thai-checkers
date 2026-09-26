import { CheckerEngine, CommandResult, GameSnapshot, PlayerConfig } from '../engine';
import { PdnMovetextCodec, PdnResolveResult, PdnResult } from './pdn-movetext-codec';

export class PlaybackController {
    private reviewEngine: CheckerEngine | null = null;
    private moves: ReadonlyArray<{ readonly from: number; readonly to: number }> = [];
    private cursor = 0;
    private importedResult: PdnResult | null = null;

    constructor(
        private readonly codec: PdnMovetextCodec = new PdnMovetextCodec(),
        private readonly players?: ReadonlyArray<PlayerConfig>
    ) {}

    load(text: string): PdnResolveResult {
        const resolved = this.codec.resolve(text, this.players);
        if (!resolved.ok) {
            return resolved;
        }
        const engine = CheckerEngine.createThaiGame(this.players);
        engine.start();
        this.reviewEngine = engine;
        this.moves = Object.freeze(resolved.value.turns.reduce(
            (all, turn) => all.concat(turn),
            [] as Array<{ readonly from: number; readonly to: number }>
        ));
        this.cursor = 0;
        this.importedResult = resolved.value.game.result;
        return resolved;
    }

    canStepForward(): boolean {
        return this.reviewEngine !== null && this.cursor < this.moves.length;
    }

    canStepBack(): boolean {
        return this.reviewEngine !== null && this.cursor > 0;
    }

    stepForward(): CommandResult | null {
        if (!this.reviewEngine || !this.canStepForward()) {
            return null;
        }
        const result = this.reviewEngine.applyMove(
            this.moves[this.cursor],
            this.reviewEngine.getSnapshot().revision
        );
        if (result.accepted) {
            this.cursor += 1;
        }
        return result;
    }

    stepBack(): CommandResult | null {
        if (!this.reviewEngine || !this.canStepBack()) {
            return null;
        }
        const result = this.reviewEngine.rewind();
        if (result.accepted) {
            this.cursor -= 1;
        }
        return result;
    }

    getSnapshot(): GameSnapshot | null {
        return this.reviewEngine ? this.reviewEngine.getSnapshot() : null;
    }

    getResult(): PdnResult | null {
        return this.importedResult;
    }

    getCursor(): number {
        return this.cursor;
    }

    getLength(): number {
        return this.moves.length;
    }

    dispose(): void {
        this.reviewEngine = null;
        this.moves = [];
        this.cursor = 0;
        this.importedResult = null;
    }
}
