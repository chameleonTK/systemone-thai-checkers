import { AgentProgress } from './agent-api';
import { SystemOneClient } from './system-one-agent';

export interface SystemOneBrowserModules {
    readonly kev: any;
    readonly ort: any;
    readonly Tokenizer: any;
}

export interface SystemOneClientLease {
    readonly client: SystemOneClient;
    release(): Promise<void>;
}

interface PooledClient {
    readonly promise: Promise<SystemOneClient>;
    references: number;
    closing?: Promise<void>;
}

let modulesPromise: Promise<SystemOneBrowserModules> | null = null;
const clientPool: { [key: string]: PooledClient } = {};
const MODEL_URL_MARKERS: ReadonlyArray<string> = Object.freeze([
    'huggingface.co/ai-ecoverse/kev.js/',
    'huggingface.co/techtheist/laya-onnx/',
    'huggingface.co/imtk/OpenThai-SystemOne-ONNX/'
]);

export function loadSystemOneBrowserModules(): Promise<SystemOneBrowserModules> {
    const browserWindow: any = window;
    if (browserWindow.kevBrowserModules) {
        return Promise.resolve(browserWindow.kevBrowserModules);
    }
    if (!modulesPromise) {
        modulesPromise = new Promise<SystemOneBrowserModules>((resolve, reject) => {
            const script: HTMLScriptElement = document.createElement('script');
            script.type = 'module';
            script.src = 'assets/kev-loader.js';
            script.onload = () => browserWindow.kevBrowserModules
                ? resolve(browserWindow.kevBrowserModules)
                : reject(new Error('System One browser modules did not initialize.'));
            script.onerror = () => reject(new Error('System One browser modules could not be loaded.'));
            document.head.appendChild(script);
        }).catch((error: unknown) => {
            modulesPromise = null;
            throw error;
        });
    }
    return modulesPromise;
}

export async function acquireSystemOneClient(
    key: string,
    create: (reportProgress?: (progress: AgentProgress) => void) => Promise<SystemOneClient>,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClientLease> {
    const existing: PooledClient | undefined = clientPool[key];
    if (existing && existing.closing) {
        await existing.closing;
        return acquireSystemOneClient(key, create, reportProgress);
    }

    let entry: PooledClient;
    if (existing) {
        entry = existing;
    } else {
        const promise: Promise<SystemOneClient> = Promise.resolve().then(() => create(reportProgress));
        entry = { promise, references: 0 };
        clientPool[key] = entry;
        promise.catch(() => {
            if (clientPool[key] === entry) {
                delete clientPool[key];
            }
        });
    }
    entry.references += 1;

    try {
        const client: SystemOneClient = await entry.promise;
        let released = false;
        return {
            client,
            release: async () => {
                if (released) {
                    return;
                }
                released = true;
                entry.references -= 1;
                if (entry.references > 0 || entry.closing) {
                    return;
                }
                entry.closing = entry.promise.then(async (loaded: SystemOneClient) => {
                    if (loaded.release) {
                        await loaded.release();
                    }
                }).finally(() => {
                    if (clientPool[key] === entry) {
                        delete clientPool[key];
                    }
                });
                await entry.closing;
            }
        };
    } catch (error) {
        entry.references -= 1;
        throw error;
    }
}

export function resetSystemOneClientPool(): Promise<void> {
    const entries: PooledClient[] = Object.keys(clientPool).map((key: string) => {
        const entry: PooledClient = clientPool[key];
        delete clientPool[key];
        return entry;
    });
    return Promise.all(entries.map(async (entry: PooledClient) => {
        try {
            const client: SystemOneClient = await entry.promise;
            if (client.release) {
                await client.release();
            }
        } catch {
            // A failed load owns no usable resources.
        }
    })).then(() => undefined);
}

export async function clearSystemOneModelCache(): Promise<number> {
    await resetSystemOneClientPool();
    if (typeof caches === 'undefined') {
        return 0;
    }
    let removed = 0;
    const names: string[] = await caches.keys();
    for (const name of names) {
        const cache: Cache = await caches.open(name);
        const requests: ReadonlyArray<Request> = await cache.keys();
        let removedFromCache = false;
        for (const request of requests) {
            if (MODEL_URL_MARKERS.some((marker: string) => request.url.indexOf(marker) !== -1)
                && await cache.delete(request)) {
                removed += 1;
                removedFromCache = true;
            }
        }
        if (removedFromCache && (await cache.keys()).length === 0) {
            await caches.delete(name);
        }
    }
    return removed;
}
