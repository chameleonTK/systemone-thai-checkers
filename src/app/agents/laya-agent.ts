import { AgentProgress } from './agent-api';
import { acquireSystemOneClient, loadSystemOneBrowserModules, SystemOneClientLease } from './system-one-browser';
import { createLayaSystemOneClient } from './system-one-model-client';
import {
    SystemOneAgent,
    SystemOneAgentOptions,
    SystemOneClient,
    SystemOnePrecision
} from './system-one-agent';

export const DEFAULT_LAYA_PRECISION: SystemOnePrecision = 'int8';
export const LAYA_MOVE_LIMIT = 16;

export interface LayaAgentOptions extends SystemOneAgentOptions {
    readonly precision?: SystemOnePrecision;
}

function acquireDefaultClient(
    precision: SystemOnePrecision,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClientLease> {
    return acquireSystemOneClient(`laya:${precision}`, async (report) => {
        if (report) {
            report({ label: 'Loading Laya runtime', loaded: 0, total: 100 });
        }
        const modules = await loadSystemOneBrowserModules();
        return createLayaSystemOneClient(modules, precision, report);
    }, reportProgress);
}

export class LayaAgent extends SystemOneAgent {
    readonly precision: SystemOnePrecision;

    constructor(options: LayaAgentOptions = {}) {
        const precision: SystemOnePrecision = options.precision || DEFAULT_LAYA_PRECISION;
        super({
            ...options,
            modelLabel: 'Laya',
            defaultMoveLimit: LAYA_MOVE_LIMIT,
            acquireClient: options.acquireClient || (options.client || options.loadClient
                ? undefined
                : ((report) => acquireDefaultClient(precision, report)))
        });
        this.precision = precision;
    }
}
