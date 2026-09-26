# Adding a Checker Agent

Checker agents are independent adapters. They receive an immutable turn context, return one legal atomic move, and never receive the live `CheckerEngine` or depend on Angular components.

## 1. Implement `PlayableAgent`

Create a file under `src/app/agents/` and implement the public contract:

```ts
import { MoveIntent } from '../engine';
import { AgentTurnContext, PlayableAgent, TurnCancellation } from './agent-api';

export class FirstLegalAgent implements PlayableAgent {
    chooseMove(context: AgentTurnContext, cancellation: TurnCancellation): Promise<MoveIntent> {
        if (cancellation.cancelled) {
            return Promise.reject(new Error('Turn was cancelled.'));
        }
        if (context.legalMoves.length === 0) {
            return Promise.reject(new Error('No legal move is available.'));
        }
        const move = context.legalMoves[0];
        return Promise.resolve({ from: move.from, to: move.to });
    }
}
```

Use `context.legalMoves` for simple agents. Search agents should create an isolated simulation with `context.simulation.createSession()`, explore encoded moves with `legalMoves()`, `makeMove()`, and `unmakeMove()`, then convert the chosen encoded move with `moveToIntent()`. Always check cancellation before work and periodically during longer searches.

An agent must not import another concrete agent, `GameSession`, Angular, rendering code, or the live engine. Neutral helpers such as scoring functions and random sources may be shared.

## 2. Export and register it

Export the class from `src/app/agents/index.ts`, then add one entry to `AGENT_REGISTRY` in `agent-registry.ts`:

```ts
Object.freeze({
    id: 'first-legal',
    label: 'First Legal Agent',
    kind: 'automated',
    create: () => new FirstLegalAgent(),
    minimumResponseDelayMs: 500
})
```

- `id` must be unique and stable because the UI stores the current selection by ID.
- `label` is shown in the Start dropdown and as White's player name.
- `kind` is `human` for click-driven seats and `automated` for agents that can appear in Watch mode.
- `create` must return a fresh agent instance so matches do not share pending turns or search state.
- `minimumResponseDelayMs` is optional presentation pacing; it does not affect search.

The Start dropdown reads the registry automatically. No component template or session code is needed for another ordinary agent.

## 3. Test the agent

Add focused Jasmine tests beside the other agent tests. At minimum, verify that the agent:

- returns a move from the supplied legal-move set;
- handles forced capture continuations and terminal positions correctly;
- honors cancellation and reports an empty legal-move set;
- cannot mutate the live engine through snapshots or simulation seeds;
- behaves deterministically when injected with a deterministic random source;
- restores simulated state after every searched branch.

Also keep registry IDs unique and confirm the factory returns a new instance on every call. Run `npm test -- --watch=false --browsers=ChromeHeadless`, `npm run lint`, and both development and production builds before merging.
