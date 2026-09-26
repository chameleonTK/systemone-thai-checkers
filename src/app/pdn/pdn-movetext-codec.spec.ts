import { CheckerEngine } from '../engine';
import { activeEngine, positionFixture } from '../engine/test-fixtures';
import { PdnMovetextCodec } from './pdn-movetext-codec';
import { PlaybackController } from './playback-controller';

describe('PdnMovetextCodec', () => {
    const codec = new PdnMovetextCodec();

    it('parses paths, optional move numbers, whitespace, and a result', () => {
        const result = codec.parse('  1. 5-9\n28-24 2. 6-10   * ');
        expect(result.ok).toBeTrue();
        if (result.ok) {
            expect(result.game.turns.map((turn) => turn.squares)).toEqual([[5, 9], [28, 24], [6, 10]]);
            expect(result.game.turns[0].moveNumber).toBe('1.');
            expect(result.game.result).toBe('*');
        }
    });

    it('accepts complete type-31 capture paths and all standard results', () => {
        ['1-0', '0-1', '1/2-1/2', '0-0', '*'].forEach((resultToken) => {
            const result = codec.parse(`9-18-27 ${resultToken}`);
            expect(result.ok).withContext(resultToken).toBeTrue();
        });
    });

    [
        ['[GameType "31"] 5-9', 'PDN_UNSUPPORTED_HEADER'],
        ['{note} 5-9', 'PDN_UNSUPPORTED_COMMENT'],
        ['% note\n5-9', 'PDN_UNSUPPORTED_COMMENT'],
        ['(5-9) *', 'PDN_UNSUPPORTED_VARIATION'],
        ['$1 5-9', 'PDN_UNSUPPORTED_NAG'],
        ['/FEN "B:W:B"/ 5-9', 'PDN_UNSUPPORTED_SETUP'],
        ['a3-b4 *', 'PDN_INVALID_SQUARE_FORMAT'],
        ['05-9 *', 'PDN_LEADING_ZERO'],
        ['5x9 *', 'PDN_INVALID_SEPARATOR'],
        ['5-9! *', 'PDN_UNSUPPORTED_ANNOTATION'],
        ['5- *', 'PDN_EXPECTED_SQUARE'],
        ['1.', 'PDN_EXPECTED_MOVE'],
        ['5-33 *', 'PDN_SQUARE_OUT_OF_RANGE'],
        ['5-9 * 28-24', 'PDN_MULTIPLE_GAMES'],
        ['5-9 1-0 trailing', 'PDN_TRAILING_TOKEN']
    ].forEach(([text, code]) => {
        it(`rejects unsupported input with ${code}`, () => {
            const result = codec.parse(text);
            expect(result.ok).toBeFalse();
            if (result.ok === false) {
                expect(result.diagnostic.code).toBe(code);
                expect(result.diagnostic.line).toBeGreaterThan(0);
                expect(result.diagnostic.column).toBeGreaterThan(0);
            }
        });
    });

    it('rejects an empty game', () => {
        const result = codec.parse(' \n ');
        expect(result.ok).toBeFalse();
        if (result.ok === false) {
            expect(result.diagnostic.code).toBe('PDN_EMPTY_GAME');
        }
    });

    it('resolves legal movetext from the standard initial position', () => {
        const result = codec.resolve('1. 5-9 28-24 2. 6-10 *');
        expect(result.ok).toBeTrue();
        if (result.ok) {
            expect(result.value.turns.length).toBe(3);
            expect(result.value.finalSnapshot.stepIndex).toBe(3);
            expect(result.value.finalSnapshot.activePlayer).toBe('white');
        }
    });

    it('reports an illegal replay move at its turn', () => {
        const result = codec.resolve('1-5 *');
        expect(result.ok).toBeFalse();
        if (result.ok === false) {
            expect(result.diagnostic.code).toBe('PDN_ILLEGAL_MOVE');
            expect(result.diagnostic.turnIndex).toBe(0);
        }
    });

    it('exports grouped turn history and round trips legal play', () => {
        const engine = activeEngine({ blackMen: [9], whiteMen: [13, 22], whiteKings: [32] });
        engine.applyMove({ from: 9, to: 18 }, 0);
        engine.applyMove({ from: 18, to: 27 }, 1);
        expect(codec.write(engine.getSnapshot().history, engine.getSnapshot().result)).toBe('9-18-27 *');
    });

    it('requires intermediate landings when source and destination match multiple capture paths', () => {
        const ambiguousCodec = new PdnMovetextCodec(() => new CheckerEngine(positionFixture({
            blackKings: [10], whiteMen: [5, 12, 14]
        })));
        const ambiguous = ambiguousCodec.resolve('10-8 *');
        expect(ambiguous.ok).toBeFalse();
        if (ambiguous.ok === false) {
            expect(ambiguous.diagnostic.code).toBe('PDN_AMBIGUOUS_MOVE');
            expect(ambiguous.diagnostic.expected).toContain('10-1-19-8');
            expect(ambiguous.diagnostic.expected).toContain('10-19-8');
        }
        expect(ambiguousCodec.resolve('10-1-19-8 *').ok).toBeTrue();
    });

    it('rejects a result marker that conflicts with a rules-derived ending', () => {
        const whiteWin = [
            '6-11', '28-24', '8-12', '31-28', '12-16', '27-22', '11-14', '25-21', '16-20', '24-15',
            '4-8', '15-11', '14-19', '11-4', '5-9', '22-15', '2-6', '21-17', '6-11', '4-14', '8-12',
            '15-8', '3-6', '29-25', '9-13', '17-10-3', '1-5', '14-1', '0-1'
        ].join(' ');
        const result = codec.resolve(whiteWin);
        expect(result.ok).toBeFalse();
        if (result.ok === false) {
            expect(result.diagnostic.code).toBe('PDN_RESULT_MISMATCH');
        }
    });
});

describe('PlaybackController', () => {
    it('loads transactionally and supports forward/back navigation', () => {
        const playback = new PlaybackController();
        const loaded = playback.load('5-9 28-24 *');
        expect(loaded.ok).toBeTrue();
        expect(playback.getCursor()).toBe(0);
        expect(playback.getSnapshot().stepIndex).toBe(0);
        playback.stepForward();
        expect(playback.getCursor()).toBe(1);
        expect(playback.getSnapshot().stepIndex).toBe(1);
        playback.stepBack();
        expect(playback.getCursor()).toBe(0);
        expect(playback.getSnapshot().stepIndex).toBe(0);
    });

    it('does not install a review engine for invalid input', () => {
        const playback = new PlaybackController();
        expect(playback.load('1-5 *').ok).toBeFalse();
        expect(playback.getSnapshot()).toBeNull();
    });
});
