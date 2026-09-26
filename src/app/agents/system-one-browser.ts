import { AgentProgress } from './agent-api';
import { SystemOneClient } from './system-one-agent';

export interface SystemOneBrowserModules {
    readonly kev: any;
    readonly ort: any;
    readonly Tokenizer: any;
}

interface ActiveClient {
    readonly key: string;
    readonly promise: Promise<SystemOneClient>;
}

let modulesPromise: Promise<SystemOneBrowserModules> | null = null;
let activeClient: ActiveClient | null = null;

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

export function loadExclusiveSystemOneClient(
    key: string,
    create: (reportProgress?: (progress: AgentProgress) => void) => Promise<SystemOneClient>,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClient> {
    if (activeClient && activeClient.key === key) {
        return activeClient.promise;
    }
    const previous: ActiveClient | null = activeClient;
    const promise: Promise<SystemOneClient> = (async () => {
        if (previous) {
            try {
                const client: SystemOneClient = await previous.promise;
                if (client.release) {
                    await client.release();
                }
            } catch {
                // A failed previous load owns no usable resources.
            }
        }
        return create(reportProgress);
    })();
    activeClient = { key, promise };
    return promise.catch((error: unknown) => {
        if (activeClient && activeClient.promise === promise) {
            activeClient = null;
        }
        throw error;
    });
}

export function resetSystemOneClientPool(): Promise<void> {
    const previous: ActiveClient | null = activeClient;
    activeClient = null;
    if (!previous) {
        return Promise.resolve();
    }
    return previous.promise.then((client: SystemOneClient) => client.release ? client.release() : undefined)
        .catch(() => undefined);
}
