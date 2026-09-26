import { AgentProgress } from './agent-api';
import { SystemOneBrowserModules } from './system-one-browser';
import { SystemOneClient, SystemOnePrecision, SystemOneResponse } from './system-one-agent';

export const LAYA_REVISION = '6ca7822091b315d260f5cb7bfa82f6acc94bbffc';
export const OPENTHAI_REVISION = '19103378b5aeaa0e60cf592464e71dba1e7e88f4';
export const LAYA_MODEL_BASE = `https://huggingface.co/techtheist/laya-onnx/resolve/${LAYA_REVISION}/en`;
export const OPENTHAI_MODEL_BASE =
    `https://huggingface.co/imtk/OpenThai-SystemOne-ONNX/resolve/${OPENTHAI_REVISION}`;

export interface ModelFileSpec {
    readonly path: string;
    readonly bytes: number;
}

export interface QuantizedModelSpec {
    readonly graph: ModelFileSpec;
    readonly data?: ModelFileSpec;
}

export const LAYA_MODEL_SPECS: Readonly<Record<SystemOnePrecision, QuantizedModelSpec>> = Object.freeze({
    int8: Object.freeze({ graph: Object.freeze({ path: 'model_int8.onnx', bytes: 581587812 }) }),
    int4: Object.freeze({ graph: Object.freeze({ path: 'model_int4.onnx', bytes: 275146608 }) })
});

export const OPENTHAI_MODEL_SPECS: Readonly<Record<SystemOnePrecision, QuantizedModelSpec>> = Object.freeze({
    int8: Object.freeze({
        graph: Object.freeze({ path: 'onnx/model.int8.onnx', bytes: 2552645 }),
        data: Object.freeze({ path: 'onnx/model.int8.onnx.data', bytes: 1585394688 })
    }),
    int4: Object.freeze({
        graph: Object.freeze({ path: 'onnx/model.int4.onnx', bytes: 428762 }),
        data: Object.freeze({ path: 'onnx/model.int4.onnx.data', bytes: 1406555136 })
    })
});

interface ChoiceQuestion {
    readonly id: string;
    readonly instructions: string;
    readonly keys: string[];
    readonly descriptions: unknown[];
}

interface ChoiceRequest {
    readonly state: unknown;
    readonly questions: ChoiceQuestion[];
}

export interface TokenizerPort {
    encode(text: string): number[];
    tokenId(token: string): number;
}

export interface LayaChoiceBatch {
    readonly inputIds: number[][];
    readonly attentionMask: number[][];
    readonly markerPositions: number[][];
    readonly markerMask: boolean[][];
    readonly optionCounts: number[];
    readonly inputTokens: number;
}

export interface OpenThaiChoiceBatch {
    readonly inputIds: number[];
    readonly answerPositions: number[];
    readonly optionCounts: number[];
}

export function validateOpenThaiManifest(manifest: any, precision: SystemOnePrecision): void {
    const model: QuantizedModelSpec = OPENTHAI_MODEL_SPECS[precision];
    const data: ModelFileSpec = model.data as ModelFileSpec;
    const variant: any = manifest && manifest.variants && manifest.variants[precision];
    if (!variant || variant.graph !== model.graph.path || variant.external_data !== data.path
        || variant.size_bytes !== model.graph.bytes + data.bytes) {
        throw new Error(`OpenThai ${precision} artifact manifest does not match the pinned model files.`);
    }
}

class ProgressTracker {
    private readonly files: { [file: string]: { loaded: number; total: number } } = {};

    constructor(
        private readonly label: string,
        specs: ReadonlyArray<ModelFileSpec>,
        private readonly reportProgress?: (progress: AgentProgress) => void
    ) {
        specs.forEach((spec) => this.files[spec.path] = { loaded: 0, total: spec.bytes });
    }

    update(path: string, loaded: number, total: number): void {
        this.files[path] = { loaded, total: total || Math.max(loaded, 1) };
        if (!this.reportProgress) {
            return;
        }
        const totals = Object.keys(this.files).reduce((sum, file) => ({
            loaded: sum.loaded + Math.min(this.files[file].loaded, this.files[file].total),
            total: sum.total + this.files[file].total
        }), { loaded: 0, total: 0 });
        this.reportProgress({
            label: this.label,
            loaded: totals.total ? Math.min(98, 2 + totals.loaded * 96 / totals.total) : 2,
            total: 100
        });
    }
}

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function fetchModelBlob(
    base: string,
    spec: ModelFileSpec,
    tracker: ProgressTracker
): Promise<Blob> {
    const url: string = joinUrl(base, spec.path);
    const cache: Cache | null = typeof caches === 'undefined' ? null : await caches.open('system-one-models-v1');
    const hit: Response | undefined = cache ? await cache.match(url) : undefined;
    if (hit) {
        const cachedBlob: Blob = await hit.blob();
        if (cachedBlob.size === spec.bytes) {
            tracker.update(spec.path, spec.bytes, spec.bytes);
            return cachedBlob;
        }
        await cache.delete(url);
    }

    const response: Response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${spec.path}: HTTP ${response.status}`);
    }
    let blob: Blob;
    if (response.body) {
        const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        for (;;) {
            const result: ReadableStreamReadResult<Uint8Array> = await reader.read();
            if (result.done) {
                break;
            }
            chunks.push(result.value);
            loaded += result.value.length;
            tracker.update(spec.path, loaded, spec.bytes);
        }
        blob = new Blob(chunks);
    } else {
        blob = await response.blob();
    }
    if (blob.size !== spec.bytes) {
        throw new Error(`${spec.path}: expected ${spec.bytes} bytes, received ${blob.size}`);
    }
    tracker.update(spec.path, spec.bytes, spec.bytes);
    if (cache) {
        try {
            await cache.put(url, new Response(blob, {
                headers: { 'content-length': String(blob.size), 'content-type': 'application/octet-stream' }
            }));
        } catch {
            // A model can still run when the browser's cache quota is smaller than the artifact.
        }
    }
    return blob;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
    return new Uint8Array(await new Response(blob).arrayBuffer());
}

async function blobText(blob: Blob): Promise<string> {
    return new Response(blob).text();
}

function pyNumber(value: number): string {
    if (!Number.isFinite(value)) {
        return value === Infinity ? 'Infinity' : value === -Infinity ? '-Infinity' : 'NaN';
    }
    const exponential: string[] = value.toExponential().split('e');
    const exponent: number = Number(exponential[1]);
    return exponent >= -4 ? String(value) : `${exponential[0]}e-${String(-exponent).padStart(2, '0')}`;
}

export function serializeSystemOneValue(value: unknown): string {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number') {
        return pyNumber(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => serializeSystemOneValue(item)).join(', ')}]`;
    }
    if (typeof value === 'object') {
        const fields: string[] = [];
        Object.keys(value as object).forEach((key: string) => {
            const item: unknown = (value as { [key: string]: unknown })[key];
            if (item !== undefined && typeof item !== 'function' && typeof item !== 'symbol') {
                fields.push(`${JSON.stringify(key)}: ${serializeSystemOneValue(item)}`);
            }
        });
        return `{${fields.join(', ')}}`;
    }
    return String(value);
}

function renderValue(value: unknown): string {
    return typeof value === 'string' ? value : serializeSystemOneValue(value);
}

function parseChoiceRequest(modules: SystemOneBrowserModules, input: unknown): ChoiceRequest {
    const request: any = modules.kev.validate(input);
    const questions: ChoiceQuestion[] = Object.keys(request.questions).map((id: string) => {
        const question: any = request.questions[id];
        if (question.type !== 'choice') {
            throw new Error('This browser model adapter supports choice questions only.');
        }
        const keys: string[] = Object.keys(question.criteria);
        if (keys.length > 255) {
            throw new Error('A choice question cannot contain more than 255 options.');
        }
        return {
            id,
            instructions: renderValue(question.instructions === undefined ? '' : question.instructions),
            keys,
            descriptions: keys.map((key: string) => question.criteria[key])
        };
    });
    return { state: request.state, questions };
}

function createTokenizer(modules: SystemOneBrowserModules, tokenizerJson: string, tokenizerConfig: string): TokenizerPort {
    const tokenizer: any = new modules.Tokenizer(JSON.parse(tokenizerJson), JSON.parse(tokenizerConfig));
    const encode = (text: string): number[] => tokenizer.encode(text, { add_special_tokens: false }).ids;
    return {
        encode,
        tokenId: (token: string) => {
            const id: number | undefined = tokenizer.token_to_id(token);
            if (id === undefined) {
                throw new Error(`Tokenizer does not define ${token} as one token.`);
            }
            return id;
        }
    };
}

function replaceToken(text: string, token: string): string {
    return text.split(token).join(' ');
}

function padRows(rows: number[][], pad: number): number[][] {
    const width: number = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    return rows.map((row) => row.concat(Array(width - row.length).fill(pad)));
}

function flatten<T>(rows: ReadonlyArray<ReadonlyArray<T>>): T[] {
    const values: T[] = [];
    rows.forEach((row) => row.forEach((value) => values.push(value)));
    return values;
}

function int64Values(values: number[]): any {
    const BigIntArray: any = (window as any).BigInt64Array;
    const toBigInt: any = (window as any).BigInt;
    if (!BigIntArray || !toBigInt) {
        throw new Error('This browser does not support 64-bit integer tensors.');
    }
    const data: any = new BigIntArray(values.length);
    values.forEach((value: number, index: number) => data[index] = toBigInt(Math.trunc(value)));
    return data;
}

function tensorInt64(ort: any, rows: number[][], dimensions: number[]): any {
    return new ort.Tensor('int64', int64Values(flatten(rows)), dimensions);
}

function tensorBool(ort: any, rows: boolean[][], dimensions: number[]): any {
    return new ort.Tensor('bool', Uint8Array.from(flatten(rows).map((value) => value ? 1 : 0)), dimensions);
}

function softmax(logits: number[]): number[] {
    const maximum: number = Math.max.apply(null, logits);
    const exponentials: number[] = logits.map((value) => Math.exp(value - maximum));
    const total: number = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map((value) => value / total);
}

function tensorRows(tensor: any): number[][] {
    const rows: number = tensor.dims.length > 1 ? Number(tensor.dims[0]) : 1;
    const width: number = tensor.data.length / rows;
    const result: number[][] = [];
    for (let row = 0; row < rows; row += 1) {
        const values: number[] = [];
        for (let column = 0; column < width; column += 1) {
            values.push(Number(tensor.data[row * width + column]));
        }
        result.push(values);
    }
    return result;
}

async function createSession(ort: any, graph: Uint8Array, externalData?: ReadonlyArray<unknown>): Promise<any> {
    const options: any = {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all'
    };
    if (externalData) {
        options.externalData = externalData;
    }
    try {
        return await ort.InferenceSession.create(graph, options);
    } catch {
        return ort.InferenceSession.create(graph, {
            ...options,
            executionProviders: ['wasm']
        });
    }
}

export function buildLayaChoiceBatch(
    tokenizer: TokenizerPort,
    state: unknown,
    questions: ReadonlyArray<ChoiceQuestion>,
    maxLength = 512,
    headMaxLength = 192
): LayaChoiceBatch {
    const cls: number = tokenizer.tokenId('[CLS]');
    const sep: number = tokenizer.tokenId('[SEP]');
    const mask: number = tokenizer.tokenId('[MASK]');
    const pad: number = tokenizer.tokenId('[PAD]');
    const stateIds: number[] = tokenizer.encode(replaceToken(serializeSystemOneValue(state), '[MASK]'));
    const rows: number[][] = [];
    const markerRows: number[][] = [];

    questions.forEach((question) => {
        const options: string[] = question.keys.map((key: string, index: number) => {
            const description: unknown = question.descriptions[index];
            return !description
                ? key
                : `${key}: ${renderValue(description)}`;
        });
        let head: number[] = tokenizer.encode(`choice question: ${replaceToken(question.instructions, '[MASK]')}`);
        let optionIds: number[][] = options.map((option: string) => [
            mask,
            ...tokenizer.encode(` ${replaceToken(option, '[MASK]')}`).slice(0, 48)
        ]);
        let budget: number = headMaxLength - optionIds.reduce((total, optionTokens) => total + optionTokens.length, 0);
        if (budget < 16) {
            const perOption: number = Math.max(4, Math.floor((headMaxLength - 16) / Math.max(1, optionIds.length)));
            optionIds = optionIds.map((optionTokens) => optionTokens.slice(0, perOption));
            budget = headMaxLength - optionIds.reduce((total, optionTokens) => total + optionTokens.length, 0);
        }
        head = head.slice(0, Math.max(8, budget));
        const prefix: number[] = [cls, ...head, sep];
        const markers: number[] = [];
        optionIds.forEach((optionTokens: number[]) => {
            markers.push(prefix.length);
            prefix.push(...optionTokens);
        });
        prefix.push(sep);
        const room: number = Math.max(0, maxLength - prefix.length - 1);
        const sequenceIds: number[] = prefix.concat(stateIds.slice(0, room), [sep]).slice(0, maxLength);
        const validMarkers: number[] = markers.filter((position) => position < sequenceIds.length);
        if (validMarkers.length !== options.length) {
            throw new Error(`Laya options exceed head_max_len=${headMaxLength}.`);
        }
        rows.push(sequenceIds);
        markerRows.push(validMarkers);
    });

    const inputIds: number[][] = padRows(rows, pad);
    const markerPositions: number[][] = padRows(markerRows, 0);
    return {
        inputIds,
        attentionMask: rows.map((row, index) => row.map(() => 1)
            .concat(Array(inputIds[index].length - row.length).fill(0))),
        markerPositions,
        markerMask: markerRows.map((row, index) => row.map(() => true)
            .concat(Array(markerPositions[index].length - row.length).fill(false))),
        optionCounts: questions.map((question) => question.keys.length),
        inputTokens: rows.reduce((total, row) => total + row.length, 0)
    };
}

function sanitizeOpenThai(text: string): string {
    return text.indexOf('<|ts_') < 0 ? text : text.split('<|ts_').join('<\u200b|ts_');
}

export function buildOpenThaiChoiceBatch(
    tokenizer: TokenizerPort,
    state: unknown,
    questions: ReadonlyArray<ChoiceQuestion>
): OpenThaiChoiceBatch {
    const answerId: number = tokenizer.tokenId('<|ts_answer|>');
    const stateText: string = typeof state === 'string' ? state : serializeSystemOneValue(state);
    const inputIds: number[] = tokenizer.encode(`<|ts_state|> ${sanitizeOpenThai(stateText).trim()}\n`);
    const answerPositions: number[] = [];
    const optionCounts: number[] = [];

    questions.forEach((question) => {
        const lines: string[] = [`<|ts_q|><|ts_choice|> ${sanitizeOpenThai(question.instructions).trim()}`];
        question.keys.forEach((key: string, index: number) => {
            const name: string = sanitizeOpenThai(key).trim();
            const description: unknown = question.descriptions[index];
            lines.push(!description
                ? `<|ts_opt_${index}|> ${name}`
                : `<|ts_opt_${index}|> ${name}: ${sanitizeOpenThai(renderValue(description)).trim()}`);
        });
        lines.push('<|ts_answer|>');
        const questionIds: number[] = tokenizer.encode(`${lines.join('\n')}\n`);
        inputIds.push(...questionIds);
        let position: number = inputIds.length - 1;
        while (position >= 0 && inputIds[position] !== answerId) {
            position -= 1;
        }
        if (position < 0) {
            throw new Error('OpenThai tokenizer did not emit the answer token.');
        }
        answerPositions.push(position);
        optionCounts.push(question.keys.length);
    });
    return { inputIds, answerPositions, optionCounts };
}

function choiceAnswers(
    questions: ReadonlyArray<ChoiceQuestion>,
    probabilityRows: number[][],
    temperatures?: number[]
): { [question: string]: any } {
    const answers: { [question: string]: any } = {};
    questions.forEach((question, index) => {
        const count: number = question.keys.length;
        const logits: number[] = probabilityRows[index].slice(0, count);
        const probabilities: number[] = temperatures
            ? softmax(logits.map((value) => value / temperatures[index]))
            : (() => {
                const total: number = logits.reduce((sum, value) => sum + value, 0);
                return logits.map((value) => value / Math.max(total, 1e-12));
            })();
        let best = 0;
        for (let option = 1; option < count; option += 1) {
            if (probabilities[option] > probabilities[best]) {
                best = option;
            }
        }
        const probabilityMap: { [option: string]: number } = {};
        question.keys.forEach((key: string, option: number) => probabilityMap[key] = probabilities[option]);
        const entropy: number = count < 2 ? 0 : -probabilities.reduce(
            (sum, value) => sum + value * Math.log(Math.max(value, 1e-12)), 0
        );
        answers[question.id] = {
            type: 'choice',
            choice: question.keys[best],
            probabilities: probabilityMap,
            confidence: count < 2 ? 1 : Math.max(0, Math.min(1, 1 - entropy / Math.log(count)))
        };
    });
    return answers;
}

function layaTemperature(config: any, count: number): number {
    const bucket: string = count <= 2 ? 'choice:2'
        : count <= 5 ? 'choice:3-5' : count <= 10 ? 'choice:6-10' : 'choice:11+';
    const raw: unknown = config.temperature_by_options && config.temperature_by_options[bucket] !== undefined
        ? config.temperature_by_options[bucket]
        : Array.isArray(config.temperature) ? config.temperature[0] : config.temperature;
    const value: number = Number(raw);
    return Number.isFinite(value) ? Math.max(0.5, Math.min(5, value)) : 1;
}

export class LayaSystemOneClient implements SystemOneClient {
    constructor(
        private readonly modules: SystemOneBrowserModules,
        private readonly session: any,
        private readonly tokenizer: TokenizerPort,
        private readonly config: any
    ) {}

    async systemOne(input: unknown): Promise<SystemOneResponse> {
        const request: ChoiceRequest = parseChoiceRequest(this.modules, input);
        const batch: LayaChoiceBatch = buildLayaChoiceBatch(
            this.tokenizer,
            request.state,
            request.questions,
            Number(this.config.max_len || 512),
            Number(this.config.head_max_len || 192)
        );
        const rows: number = batch.inputIds.length;
        const sequence: number = batch.inputIds[0].length;
        const options: number = batch.markerPositions[0].length;
        const output: any = await this.session.run({
            input_ids: tensorInt64(this.modules.ort, batch.inputIds, [rows, sequence]),
            attention_mask: tensorInt64(this.modules.ort, batch.attentionMask, [rows, sequence]),
            marker_pos: tensorInt64(this.modules.ort, batch.markerPositions, [rows, options]),
            marker_mask: tensorBool(this.modules.ort, batch.markerMask, [rows, options]),
            qtype: tensorInt64(this.modules.ort, [batch.optionCounts.map(() => 0)], [rows])
        });
        const logits: number[][] = tensorRows(output.logits || output[Object.keys(output)[0]]);
        const temperatures: number[] = batch.optionCounts.map((count) => layaTemperature(this.config, count));
        return {
            answers: choiceAnswers(request.questions, logits, temperatures)
        };
    }

    release(): Promise<void> {
        return this.session.release();
    }
}

export class OpenThaiSystemOneClient implements SystemOneClient {
    constructor(
        private readonly modules: SystemOneBrowserModules,
        private readonly session: any,
        private readonly tokenizer: TokenizerPort
    ) {}

    async systemOne(input: unknown): Promise<SystemOneResponse> {
        const request: ChoiceRequest = parseChoiceRequest(this.modules, input);
        const batch: OpenThaiChoiceBatch = buildOpenThaiChoiceBatch(this.tokenizer, request.state, request.questions);
        const questionCount: number = request.questions.length;
        const output: any = await this.session.run({
            input_ids: tensorInt64(this.modules.ort, [batch.inputIds], [1, batch.inputIds.length]),
            attention_mask: tensorInt64(
                this.modules.ort,
                [batch.inputIds.map(() => 1)],
                [1, batch.inputIds.length]
            ),
            answer_positions: tensorInt64(this.modules.ort, [batch.answerPositions], [1, questionCount]),
            option_counts: tensorInt64(this.modules.ort, [batch.optionCounts], [1, questionCount]),
            qtypes: tensorInt64(this.modules.ort, [batch.optionCounts.map(() => 0)], [1, questionCount])
        });
        const tensor: any = output.probabilities || output.probs || output[Object.keys(output)[0]];
        const flat: number[] = Array.from(tensor.data as ArrayLike<number>, (value: number) => Number(value));
        const width: number = Number(tensor.dims[tensor.dims.length - 1]);
        const rows: number[][] = request.questions.map((question, index) =>
            flat.slice(index * width, index * width + question.keys.length)
        );
        return { answers: choiceAnswers(request.questions, rows) };
    }

    release(): Promise<void> {
        return this.session.release();
    }
}

export async function createLayaSystemOneClient(
    modules: SystemOneBrowserModules,
    precision: SystemOnePrecision,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClient> {
    const model: QuantizedModelSpec = LAYA_MODEL_SPECS[precision];
    const files: ModelFileSpec[] = [
        model.graph,
        { path: 'tokenizer.json', bytes: 3583228 },
        { path: 'tokenizer_config.json', bytes: 308 },
        { path: 'rl_agent_config.json', bytes: 745 }
    ];
    const progress = new ProgressTracker('Downloading Laya model', files, reportProgress);
    const loaded: Blob[] = await Promise.all(files.map((file) => fetchModelBlob(LAYA_MODEL_BASE, file, progress)));
    if (reportProgress) {
        reportProgress({ label: 'Starting Laya model', loaded: 99, total: 100 });
    }
    const session: any = await createSession(modules.ort, await blobBytes(loaded[0]));
    const tokenizer: TokenizerPort = createTokenizer(
        modules,
        await blobText(loaded[1]),
        await blobText(loaded[2])
    );
    const config: any = JSON.parse(await blobText(loaded[3]));
    if (reportProgress) {
        reportProgress({ label: 'Loading Laya model', loaded: 100, total: 100 });
    }
    return new LayaSystemOneClient(modules, session, tokenizer, config);
}

export async function createOpenThaiSystemOneClient(
    modules: SystemOneBrowserModules,
    precision: SystemOnePrecision,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClient> {
    const model: QuantizedModelSpec = OPENTHAI_MODEL_SPECS[precision];
    const files: ModelFileSpec[] = [
        model.graph,
        model.data as ModelFileSpec,
        { path: 'tokenizer.json', bytes: 20039242 },
        { path: 'tokenizer_config.json', bytes: 1127 },
        { path: 'artifact-manifest.json', bytes: 10099 }
    ];
    const progress = new ProgressTracker('Downloading OpenThai model', files, reportProgress);
    const loaded: Blob[] = await Promise.all(files.map((file) => fetchModelBlob(OPENTHAI_MODEL_BASE, file, progress)));
    const manifest: any = JSON.parse(await blobText(loaded[4]));
    validateOpenThaiManifest(manifest, precision);
    if (reportProgress) {
        reportProgress({ label: 'Starting OpenThai model', loaded: 99, total: 100 });
    }
    const dataPath: string = (model.data as ModelFileSpec).path.split('/').pop() as string;
    const session: any = await createSession(modules.ort, await blobBytes(loaded[0]), [{
        path: dataPath,
        data: loaded[1]
    }]);
    const tokenizer: TokenizerPort = createTokenizer(
        modules,
        await blobText(loaded[2]),
        await blobText(loaded[3])
    );
    if (reportProgress) {
        reportProgress({ label: 'Loading OpenThai model', loaded: 100, total: 100 });
    }
    return new OpenThaiSystemOneClient(modules, session, tokenizer);
}
