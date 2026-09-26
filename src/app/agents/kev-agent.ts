import { AgentProgress } from './agent-api';
import { acquireSystemOneClient, loadSystemOneBrowserModules, SystemOneClientLease } from './system-one-browser';
import {
    SYSTEM_ONE_MOVE_LIMIT,
    SystemOneAgent,
    SystemOneAgentConfig,
    SystemOneAgentOptions,
    SystemOneClient
} from './system-one-agent';

export const KEV_MOVE_LIMIT = SYSTEM_ONE_MOVE_LIMIT;
export const DEFAULT_KEV_MODEL_URL =
    'https://huggingface.co/ai-ecoverse/kev.js/resolve/main/kev-0.8b';

export type KevSystemOneClient = SystemOneClient;

export interface KevAgentOptions extends SystemOneAgentOptions {
    readonly client?: KevSystemOneClient;
    readonly loadClient?: (reportProgress?: (progress: AgentProgress) => void) => Promise<KevSystemOneClient>;
}

function createDefaultClient(reportProgress?: (progress: AgentProgress) => void): Promise<KevSystemOneClient> {
    const files: { [file: string]: { loaded: number; total: number } } = {};
    if (reportProgress) {
        reportProgress({ label: 'Loading Kev runtime', loaded: 0, total: 100 });
    }
    return loadSystemOneBrowserModules().then((modules) => modules.kev.loadKev(
        DEFAULT_KEV_MODEL_URL,
        {
            ort: modules.ort,
            variant: 'q8f32',
            onPhase: (phase: string) => {
                if (reportProgress) {
                    const loaded: number = phase === 'manifest'
                        ? 1
                        : phase === 'session' ? 99 : phase === 'ready' ? 100 : 2;
                    reportProgress({
                        label: phase === 'session' ? 'Starting Kev model' : 'Loading Kev model',
                        loaded,
                        total: 100
                    });
                }
            },
            onProgress: (progress: { file: string; loaded: number; total: number }) => {
                if (reportProgress) {
                    files[progress.file] = {
                        loaded: progress.loaded,
                        total: progress.total > 0 ? progress.total : Math.max(progress.loaded, 1)
                    };
                    const totals = Object.keys(files).reduce((sum, file) => ({
                        loaded: sum.loaded + Math.min(files[file].loaded, files[file].total),
                        total: sum.total + files[file].total
                    }), { loaded: 0, total: 0 });
                    const percentage: number = totals.total > 0
                        ? Math.min(98, 2 + totals.loaded * 96 / totals.total)
                        : 2;
                    reportProgress({ label: 'Downloading Kev model', loaded: percentage, total: 100 });
                }
            }
        }
    ));
}

function acquireDefaultClient(reportProgress?: (progress: AgentProgress) => void): Promise<SystemOneClientLease> {
    return acquireSystemOneClient('kev:q8f32', createDefaultClient, reportProgress);
}

function kevConfig(options: KevAgentOptions): SystemOneAgentConfig {
    if (options.moveLimit !== undefined
        && (!Number.isInteger(options.moveLimit) || options.moveLimit < 1 || options.moveLimit > KEV_MOVE_LIMIT)) {
        throw new Error(`Kev move limit must be an integer between 1 and ${KEV_MOVE_LIMIT}.`);
    }
    return {
        ...options,
        modelLabel: 'Kev',
        defaultMoveLimit: KEV_MOVE_LIMIT,
        acquireClient: options.acquireClient || (options.client || options.loadClient ? undefined : acquireDefaultClient)
    };
}

export class KevAgent extends SystemOneAgent {
    constructor(options: KevAgentOptions = {}) {
        super(kevConfig(options));
    }
}
