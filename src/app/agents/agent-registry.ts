import { AlphaBetaAgent } from './alpha-beta-agent';
import { HumanAgent } from './human-agent';
import { KevAgent } from './kev-agent';
import { LayaAgent } from './laya-agent';
import { MinimaxAgent } from './minimax-agent';
import { OpenThaiAgent } from './openthai-agent';
import { PlayableAgent } from './agent-api';
import { RandomBot } from './random-bot';

export interface AgentRegistration {
    readonly id: string;
    readonly label: string;
    readonly create: () => PlayableAgent;
    readonly minimumResponseDelayMs?: number;
}

export const DEFAULT_AGENT_ID = 'human';

export const AGENT_REGISTRY: ReadonlyArray<AgentRegistration> = Object.freeze([
    Object.freeze({ id: DEFAULT_AGENT_ID, label: 'Human Agent', create: () => new HumanAgent() }),
    Object.freeze({ id: 'random', label: 'Random Agent', create: () => new RandomBot(), minimumResponseDelayMs: 500 }),
    Object.freeze({ id: 'kev', label: 'System One [Kev] Agent', create: () => new KevAgent(), minimumResponseDelayMs: 500 }),
    Object.freeze({
        id: 'laya',
        label: 'System One [Laya] Agent',
        create: () => new LayaAgent({ precision: 'int8' }),
        minimumResponseDelayMs: 500
    }),
    Object.freeze({
        id: 'openthai-onnx',
        label: 'System One [OpenThai ONNX] Agent',
        create: () => new OpenThaiAgent({ precision: 'int8' }),
        minimumResponseDelayMs: 500
    }),
    Object.freeze({ id: 'minimax', label: 'Minimax Agent', create: () => new MinimaxAgent(), minimumResponseDelayMs: 500 }),
    Object.freeze({
        id: 'alpha-beta',
        label: 'Minimax with Alpha-Beta Pruning Agent',
        create: () => new AlphaBetaAgent(),
        minimumResponseDelayMs: 500
    })
]);

export function findAgentRegistration(id: string): AgentRegistration | undefined {
    return AGENT_REGISTRY.find((registration) => registration.id === id);
}
