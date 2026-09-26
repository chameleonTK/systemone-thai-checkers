import { AgentProgress } from './agent-api';
import { acquireSystemOneClient, loadSystemOneBrowserModules, SystemOneClientLease } from './system-one-browser';
import { createOpenThaiSystemOneClient } from './system-one-model-client';
import {
    SYSTEM_ONE_MOVE_LIMIT,
    SystemOneAgent,
    SystemOneAgentOptions,
    SystemOneClient,
    SystemOnePrecision
} from './system-one-agent';

export const DEFAULT_OPENTHAI_PRECISION: SystemOnePrecision = 'int8';

export interface OpenThaiAgentOptions extends SystemOneAgentOptions {
    readonly precision?: SystemOnePrecision;
}

function acquireDefaultClient(
    precision: SystemOnePrecision,
    reportProgress?: (progress: AgentProgress) => void
): Promise<SystemOneClientLease> {
    return acquireSystemOneClient(`openthai:${precision}`, async (report) => {
        if (report) {
            report({ label: 'Loading OpenThai runtime', loaded: 0, total: 100 });
        }
        const modules = await loadSystemOneBrowserModules();
        return createOpenThaiSystemOneClient(modules, precision, report);
    }, reportProgress);
}

export class OpenThaiAgent extends SystemOneAgent {
    readonly precision: SystemOnePrecision;

    constructor(options: OpenThaiAgentOptions = {}) {
        const precision: SystemOnePrecision = options.precision || DEFAULT_OPENTHAI_PRECISION;
        super({
            ...options,
            modelLabel: 'OpenThai',
            defaultMoveLimit: SYSTEM_ONE_MOVE_LIMIT,
            acquireClient: options.acquireClient || (options.client || options.loadClient
                ? undefined
                : ((report) => acquireDefaultClient(precision, report)))
        });
        this.precision = precision;
    }
}
