import {
    CheckerEngine,
    GameResult,
    GameSnapshot,
    MoveCodec,
    PlayerConfig,
    PublicTurnRecord,
    RuleValidator
} from '../engine';

export type PdnResult = '1-0' | '0-1' | '1/2-1/2' | '0-0' | '*';

export interface SourceSpan {
    readonly offset: number;
    readonly line: number;
    readonly column: number;
    readonly token: string;
}

export interface PdnTurnPath {
    readonly squares: ReadonlyArray<number>;
    readonly moveNumber: string | null;
    readonly span: SourceSpan;
}

export interface PdnGame {
    readonly turns: ReadonlyArray<PdnTurnPath>;
    readonly result: PdnResult | null;
}

export interface PdnDiagnostic extends SourceSpan {
    readonly code: string;
    readonly message: string;
    readonly turnIndex?: number;
    readonly expected?: ReadonlyArray<string>;
}

export type PdnParseResult =
    | { readonly ok: true; readonly game: PdnGame }
    | { readonly ok: false; readonly diagnostic: PdnDiagnostic };

export interface ResolvedPdnGame {
    readonly game: PdnGame;
    readonly turns: ReadonlyArray<ReadonlyArray<{ readonly from: number; readonly to: number }>>;
    readonly finalSnapshot: GameSnapshot;
}

export type PdnResolveResult =
    | { readonly ok: true; readonly value: ResolvedPdnGame }
    | { readonly ok: false; readonly diagnostic: PdnDiagnostic };

const RESULT_TOKENS: ReadonlyArray<PdnResult> = ['1/2-1/2', '1-0', '0-1', '0-0', '*'];
type EngineFactory = (players?: ReadonlyArray<PlayerConfig>) => CheckerEngine;

export class PdnMovetextCodec {
    private readonly rules = new RuleValidator();

    constructor(private readonly createEngine: EngineFactory = (players) => CheckerEngine.createThaiGame(players)) {}

    parse(text: string): PdnParseResult {
        const turns: PdnTurnPath[] = [];
        let offset = 0;
        let pendingMoveNumber: string | null = null;
        let result: PdnResult | null = null;

        while (offset < text.length) {
            offset = this.skipWhitespace(text, offset);
            if (offset >= text.length) {
                break;
            }
            const unsupported = this.unsupportedAt(text, offset);
            if (unsupported) {
                return { ok: false, diagnostic: this.diagnostic(text, offset, unsupported.code, unsupported.message) };
            }

            const resultToken = RESULT_TOKENS.find((candidate) => text.substr(offset, candidate.length) === candidate);
            if (resultToken) {
                if (pendingMoveNumber !== null) {
                    return { ok: false, diagnostic: this.diagnostic(
                        text, offset, 'PDN_EXPECTED_MOVE', 'A move number must be followed by a move path.') };
                }
                result = resultToken;
                offset += resultToken.length;
                const trailing = this.skipWhitespace(text, offset);
                if (trailing !== text.length) {
                    return { ok: false, diagnostic: this.diagnostic(
                        text,
                        trailing,
                        resultToken === '*' ? 'PDN_MULTIPLE_GAMES' : 'PDN_TRAILING_TOKEN',
                        'No token may follow the final result marker.'
                    ) };
                }
                offset = trailing;
                break;
            }

            if (!this.isDigit(text[offset])) {
                return { ok: false, diagnostic: this.diagnostic(
                    text, offset, 'PDN_UNEXPECTED_TOKEN', 'Expected a numeric move path.') };
            }
            const numberStart = offset;
            while (offset < text.length && this.isDigit(text[offset])) {
                offset += 1;
            }
            const firstNumberText = text.slice(numberStart, offset);
            if (text[offset] === '.') {
                let dots = 0;
                while (text[offset] === '.') {
                    dots += 1;
                    offset += 1;
                }
                if (dots !== 1 && dots !== 3) {
                    return { ok: false, diagnostic: this.diagnostic(
                        text, numberStart, 'PDN_INVALID_MOVE_NUMBER', 'Move numbers use one or three dots.') };
                }
                if (firstNumberText[0] === '0') {
                    return { ok: false, diagnostic: this.diagnostic(
                        text, numberStart, 'PDN_INVALID_MOVE_NUMBER', 'Move numbers must be positive.') };
                }
                pendingMoveNumber = firstNumberText + '.'.repeat(dots);
                continue;
            }
            if (firstNumberText.length > 1 && firstNumberText[0] === '0') {
                return { ok: false, diagnostic: this.diagnostic(
                    text, numberStart, 'PDN_LEADING_ZERO', 'Squares may not contain leading zeroes.') };
            }

            const squares: number[] = [+firstNumberText];
            while (text[offset] === '-') {
                offset += 1;
                const squareStart = offset;
                while (offset < text.length && this.isDigit(text[offset])) {
                    offset += 1;
                }
                if (squareStart === offset) {
                    return { ok: false, diagnostic: this.diagnostic(
                        text, offset, 'PDN_EXPECTED_SQUARE', 'Expected a square after the separator.') };
                }
                const squareText = text.slice(squareStart, offset);
                if (squareText.length > 1 && squareText[0] === '0') {
                    return { ok: false, diagnostic: this.diagnostic(
                        text, squareStart, 'PDN_LEADING_ZERO', 'Squares may not contain leading zeroes.') };
                }
                squares.push(+squareText);
            }
            if (squares.length < 2) {
                const code = text[offset] === 'x' || text[offset] === ':'
                    ? 'PDN_INVALID_SEPARATOR'
                    : 'PDN_EXPECTED_PATH';
                return { ok: false, diagnostic: this.diagnostic(
                    text, offset, code, 'Type-31 move paths use the hyphen separator.') };
            }
            const outOfRange = squares.find((square) => square < 1 || square > 32);
            if (outOfRange !== undefined) {
                return { ok: false, diagnostic: this.diagnostic(
                    text,
                    numberStart,
                    'PDN_SQUARE_OUT_OF_RANGE',
                    `Square ${outOfRange} is outside 1..32.`
                ) };
            }
            const token = text.slice(numberStart, offset);
            turns.push({
                squares: Object.freeze(squares),
                moveNumber: pendingMoveNumber,
                span: this.span(text, numberStart, token)
            });
            pendingMoveNumber = null;
        }

        if (pendingMoveNumber !== null) {
            return { ok: false, diagnostic: this.diagnostic(
                text, text.length, 'PDN_EXPECTED_MOVE', 'A move number must be followed by a move path.') };
        }
        if (turns.length === 0) {
            return { ok: false, diagnostic: this.diagnostic(
                text, 0, 'PDN_EMPTY_GAME', 'A PDN game must contain at least one move.') };
        }
        return { ok: true, game: Object.freeze({ turns: Object.freeze(turns), result }) };
    }

    resolve(text: string, players?: ReadonlyArray<PlayerConfig>): PdnResolveResult {
        const parsed = this.parse(text);
        if (parsed.ok === false) {
            return { ok: false, diagnostic: parsed.diagnostic };
        }
        const engine = this.createEngine(players);
        engine.start();
        const resolvedTurns: Array<Array<{ readonly from: number; readonly to: number }>> = [];

        for (let turnIndex = 0; turnIndex < parsed.game.turns.length; turnIndex += 1) {
            const turn = parsed.game.turns[turnIndex];
            const position = engine.createSimulationSeed().position;
            const legalPaths = this.rules.enumerateTurnPaths(position);
            const matches = legalPaths.filter((path) => this.pathMatches(turn.squares, path));
            if (matches.length === 0) {
                return { ok: false, diagnostic: {
                    ...turn.span,
                    code: 'PDN_ILLEGAL_MOVE',
                    message: `${turn.span.token} is not legal for the active player in this position.`,
                    turnIndex
                } };
            }
            if (matches.length > 1) {
                return { ok: false, diagnostic: {
                    ...turn.span,
                    code: 'PDN_AMBIGUOUS_MOVE',
                    message: `${turn.span.token} matches multiple capture paths.`,
                    turnIndex,
                    expected: matches.map((path) => this.pathText(path))
                } };
            }
            const intents = matches[0].map((move) => ({
                from: MoveCodec.fromIndex(move) + 1,
                to: MoveCodec.toIndex(move) + 1
            }));
            for (const intent of intents) {
                const applied = engine.applyMove(intent, engine.getSnapshot().revision);
                if (!applied.accepted) {
                    return { ok: false, diagnostic: {
                        ...turn.span,
                        code: 'PDN_ILLEGAL_MOVE',
                        message: `${turn.span.token} could not be applied.`,
                        turnIndex
                    } };
                }
            }
            resolvedTurns.push(intents);
        }

        const finalSnapshot = engine.getSnapshot();
        const mismatch = this.resultMismatch(parsed.game.result, finalSnapshot.result);
        if (mismatch) {
            const resultText = parsed.game.result as string;
            const offset = text.lastIndexOf(resultText);
            return { ok: false, diagnostic: this.diagnostic(
                text, offset, 'PDN_RESULT_MISMATCH', mismatch) };
        }
        return { ok: true, value: Object.freeze({
            game: parsed.game,
            turns: Object.freeze(resolvedTurns.map((turn) => Object.freeze(turn))),
            finalSnapshot
        }) };
    }

    write(
        turns: ReadonlyArray<PublicTurnRecord>,
        result: GameResult,
        includeMoveNumbers = false
    ): string {
        const tokens: string[] = [];
        turns.forEach((turn, turnIndex) => {
            if (turn.steps.length === 0) {
                return;
            }
            if (includeMoveNumbers && turnIndex % 2 === 0) {
                tokens.push(`${Math.floor(turnIndex / 2) + 1}.`);
            }
            const squares = [turn.steps[0].from].concat(turn.steps.map((step) => step.to));
            tokens.push(squares.join('-'));
        });
        tokens.push(this.resultToken(result));
        return tokens.join(' ');
    }

    private pathMatches(squares: ReadonlyArray<number>, path: ReadonlyArray<number>): boolean {
        if (path.length === 0) {
            return false;
        }
        const full = [MoveCodec.fromIndex(path[0]) + 1].concat(path.map((move) => MoveCodec.toIndex(move) + 1));
        if (squares.length === 2) {
            return squares[0] === full[0] && squares[1] === full[full.length - 1];
        }
        return squares.length === full.length && squares.every((square, index) => square === full[index]);
    }

    private pathText(path: ReadonlyArray<number>): string {
        return [MoveCodec.fromIndex(path[0]) + 1]
            .concat(path.map((move) => MoveCodec.toIndex(move) + 1))
            .join('-');
    }

    private resultMismatch(result: PdnResult | null, actual: GameResult): string | null {
        if (!result || result === '*' || result === '0-0' || actual.status === 'ongoing') {
            return null;
        }
        const expected = actual.status === 'draw'
            ? '1/2-1/2'
            : (actual.winner === 'white' ? '1-0' : '0-1');
        return result === expected ? null : `Record says ${result}, but the rules produce ${expected}.`;
    }

    private resultToken(result: GameResult): PdnResult {
        if (result.status === 'ongoing') {
            return '*';
        }
        if (result.status === 'draw') {
            return '1/2-1/2';
        }
        return result.winner === 'white' ? '1-0' : '0-1';
    }

    private unsupportedAt(text: string, offset: number): { code: string; message: string } | null {
        const value = text[offset];
        if (value === '[' || value === ']') {
            return { code: 'PDN_UNSUPPORTED_HEADER', message: 'PDN headers are not supported.' };
        }
        if (value === '{' || value === '%' || value === ';') {
            return { code: 'PDN_UNSUPPORTED_COMMENT', message: 'PDN comments are not supported.' };
        }
        if (value === '(' || value === ')') {
            return { code: 'PDN_UNSUPPORTED_VARIATION', message: 'PDN variations are not supported.' };
        }
        if (value === '$') {
            return { code: 'PDN_UNSUPPORTED_NAG', message: 'PDN annotations are not supported.' };
        }
        if (value === '/') {
            return { code: 'PDN_UNSUPPORTED_SETUP', message: 'PDN setup commands are not supported.' };
        }
        if (value === '!' || value === '?') {
            return { code: 'PDN_UNSUPPORTED_ANNOTATION', message: 'Move annotations are not supported.' };
        }
        if (/[A-Za-z]/.test(value)) {
            return { code: 'PDN_INVALID_SQUARE_FORMAT', message: 'Type-31 uses numeric squares 1..32.' };
        }
        return null;
    }

    private skipWhitespace(text: string, offset: number): number {
        let next = offset;
        while (next < text.length && /\s/.test(text[next])) {
            next += 1;
        }
        return next;
    }

    private isDigit(value: string): boolean {
        return value >= '0' && value <= '9';
    }

    private diagnostic(text: string, offset: number, code: string, message: string): PdnDiagnostic {
        const token = text.slice(offset).match(/^\S+/);
        return { ...this.span(text, offset, token ? token[0] : ''), code, message };
    }

    private span(text: string, offset: number, token: string): SourceSpan {
        const before = text.slice(0, Math.max(0, offset));
        const lines = before.split(/\r?\n/);
        return {
            offset,
            line: lines.length,
            column: lines[lines.length - 1].length + 1,
            token
        };
    }
}
