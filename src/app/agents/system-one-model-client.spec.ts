import {
    buildLayaChoiceBatch,
    buildOpenThaiChoiceBatch,
    LayaSystemOneClient,
    LAYA_MODEL_SPECS,
    OpenThaiSystemOneClient,
    OPENTHAI_MODEL_SPECS,
    serializeSystemOneValue,
    TokenizerPort,
    validateOpenThaiManifest
} from './system-one-model-client';
import { SystemOneBrowserModules } from './system-one-browser';

class RecordingTokenizer implements TokenizerPort {
    readonly texts: string[] = [];
    private readonly special: { [token: string]: number } = {
        '[CLS]': 1,
        '[SEP]': 2,
        '[MASK]': 3,
        '[PAD]': 0,
        '<|ts_answer|>': 10
    };

    encode(text: string): number[] {
        this.texts.push(text);
        const exact: number | undefined = this.special[text];
        if (exact !== undefined) {
            return [exact];
        }
        const answer = '<|ts_answer|>';
        const output: number[] = [];
        let remaining = text;
        while (remaining.length > 0) {
            const position: number = remaining.indexOf(answer);
            if (position < 0) {
                output.push(...Array.from(remaining).map((character) => character.charCodeAt(0) + 100));
                break;
            }
            output.push(...Array.from(remaining.slice(0, position)).map((character) => character.charCodeAt(0) + 100));
            output.push(this.special[answer]);
            remaining = remaining.slice(position + answer.length);
        }
        return output;
    }

    tokenId(token: string): number {
        const id: number | undefined = this.special[token];
        if (id === undefined) {
            throw new Error(`Unknown test token ${token}`);
        }
        return id;
    }
}

describe('System One browser model formatting', () => {
    it('maps both precisions to the pinned Laya and OpenThai artifacts', () => {
        expect(LAYA_MODEL_SPECS.int8.graph.path).toBe('model_int8.onnx');
        expect(LAYA_MODEL_SPECS.int4.graph.path).toBe('model_int4.onnx');
        expect(OPENTHAI_MODEL_SPECS.int8.data.path).toBe('onnx/model.int8.onnx.data');
        expect(OPENTHAI_MODEL_SPECS.int4.data.path).toBe('onnx/model.int4.onnx.data');
    });

    it('validates OpenThai manifest paths and aggregate artifact sizes', () => {
        const spec = OPENTHAI_MODEL_SPECS.int8;
        const data = spec.data;
        expect(() => validateOpenThaiManifest({ variants: { int8: {
            graph: spec.graph.path,
            external_data: data.path,
            size_bytes: spec.graph.bytes + data.bytes
        } } }, 'int8')).not.toThrow();
        expect(() => validateOpenThaiManifest({ variants: { int8: {
            graph: spec.graph.path,
            external_data: data.path,
            size_bytes: 1
        } } }, 'int8')).toThrowError('OpenThai int8 artifact manifest does not match the pinned model files.');
    });

    it('serializes structured state using Python JSON spacing and Unicode', () => {
        expect(serializeSystemOneValue({ text: 'ภาษาไทย', count: 2, values: [true, null] }))
            .toBe('{"text": "ภาษาไทย", "count": 2, "values": [true, null]}');
    });

    it('builds Laya marker tensors and attention masks for each choice question', () => {
        const tokenizer = new RecordingTokenizer();
        const batch = buildLayaChoiceBatch(tokenizer, { side: 'white' }, [{
            id: 'move',
            instructions: 'Pick a move',
            keys: ['move_1', 'move_2'],
            descriptions: ['1 to 5', '2 to 6']
        }]);
        expect(batch.inputIds.length).toBe(1);
        expect(batch.markerPositions[0].length).toBe(2);
        expect(batch.markerMask[0]).toEqual([true, true]);
        expect(batch.optionCounts).toEqual([2]);
        expect(batch.attentionMask[0].every((value) => value === 1)).toBeTrue();
    });

    it('keeps all 16 Laya option markers inside the option-head budget', () => {
        const tokenizer = new RecordingTokenizer();
        const keys: string[] = Array.from({ length: 16 }, (_, index) => `move_${index}`);
        const batch = buildLayaChoiceBatch(tokenizer, 'state', [{
            id: 'move', instructions: 'Pick', keys, descriptions: keys
        }]);
        expect(batch.markerPositions[0].length).toBe(16);
        expect(batch.markerPositions[0].every((position) => position < batch.inputIds[0].length)).toBeTrue();
    });

    it('builds OpenThai answer positions and sanitizes injected control-token prefixes', () => {
        const tokenizer = new RecordingTokenizer();
        const batch = buildOpenThaiChoiceBatch(tokenizer, '<|ts_answer|> user text', [{
            id: 'move',
            instructions: 'Pick <|ts_answer|>',
            keys: ['move_1', 'move_2'],
            descriptions: ['1 to 5', '2 to 6']
        }]);
        expect(batch.answerPositions.length).toBe(1);
        expect(batch.inputIds[batch.answerPositions[0]]).toBe(10);
        expect(batch.optionCounts).toEqual([2]);
        expect(tokenizer.texts.some((text) => text.indexOf('<\u200b|ts_answer|>') >= 0)).toBeTrue();
    });

    it('runs Laya with the expected tensor contract and calibrated temperature bucket', async () => {
        let feeds: any;
        const session: any = {
            run: (input: any) => {
                feeds = input;
                return Promise.resolve({ logits: { dims: [1, 2], data: new Float32Array([0, 2]) } });
            },
            release: () => Promise.resolve()
        };
        const client = new LayaSystemOneClient(fakeModules(), session, new RecordingTokenizer(), {
            max_len: 512,
            head_max_len: 192,
            temperature: [1],
            temperature_by_options: { 'choice:2': 2 }
        });
        const response = await client.systemOne(choiceRequest());
        const probabilities: any = response.answers.move.probabilities;
        expect(response.answers.move.choice).toBe('move_2');
        expect(probabilities.move_1).toBeCloseTo(0.269, 3);
        expect(probabilities.move_2).toBeCloseTo(0.731, 3);
        expect(feeds.input_ids.type).toBe('int64');
        expect(feeds.input_ids.dims[0]).toBe(1);
        expect(feeds.marker_pos.dims).toEqual([1, 2]);
        expect(feeds.marker_mask.type).toBe('bool');
        expect(feeds.qtype.dims).toEqual([1]);
    });

    it('runs OpenThai with batched choice tensors and renormalizes without abstain', async () => {
        let feeds: any;
        const output = new Float32Array(256);
        output[0] = 0.1;
        output[1] = 0.3;
        output[255] = 0.6;
        const session: any = {
            run: (input: any) => {
                feeds = input;
                return Promise.resolve({
                    logits: { dims: [1, 1, 256], data: new Float32Array(256).fill(99) },
                    probabilities: { dims: [1, 1, 256], data: output }
                });
            },
            release: () => Promise.resolve()
        };
        const client = new OpenThaiSystemOneClient(fakeModules(), session, new RecordingTokenizer());
        const response = await client.systemOne(choiceRequest());
        const probabilities: any = response.answers.move.probabilities;
        expect(response.answers.move.choice).toBe('move_2');
        expect(probabilities.move_1).toBeCloseTo(0.25, 6);
        expect(probabilities.move_2).toBeCloseTo(0.75, 6);
        expect(feeds.input_ids.dims[0]).toBe(1);
        expect(feeds.answer_positions.dims).toEqual([1, 1]);
        expect(feeds.option_counts.dims).toEqual([1, 1]);
        expect(feeds.qtypes.dims).toEqual([1, 1]);
    });
});

function fakeModules(): SystemOneBrowserModules {
    class FakeTensor {
        constructor(readonly type: string, readonly data: any, readonly dims: number[]) {}
    }
    return {
        kev: { validate: (request: unknown) => request },
        ort: { Tensor: FakeTensor },
        Tokenizer: undefined
    };
}

function choiceRequest(): unknown {
    return {
        state: { side: 'white' },
        questions: {
            move: {
                type: 'choice',
                instructions: 'Pick a move',
                criteria: { move_1: '1 to 5', move_2: '2 to 6' }
            }
        }
    };
}
