# C4 Architecture

The diagrams use ordinary Mermaid flowcharts so they render in environments that do not enable Mermaid's experimental C4 syntax. Each node is labelled with its C4 role. The core is an in-process TypeScript library bundled with the Angular application; it is shown as a separate logical container to make its dependency boundary explicit.

## Level 1 — System context

```mermaid
flowchart LR
    human["Person: Player\nStarts and plays a match, rewinds, and reviews PDN"]
    botdev["Person: Bot developer\nImplements PlayableAgent and searches positions"]
    pdn["External data: PDN movetext\nHeaderless type-31 game record"]

    system["Software system: Thai Checkers\nRuns Thai checkers for humans and bots and reviews recorded games"]

    human -->|clicks controls and board; sees state| system
    botdev -->|plugs in an agent through the public SDK| system
    pdn -->|import/export| system
```

There is no server or external data store. All state exists in the browser process. A bot can also instantiate the framework-neutral core in a unit test or Web Worker without Angular.

## Level 2 — Containers

```mermaid
flowchart LR
    human["Person: Player"]
    botdev["Person: Bot developer"]
    pdn["PDN movetext"]

    subgraph system["Thai Checkers system"]
        spa["Container: Angular web application\nAngular 11 / TypeScript\nUI, animation, session orchestration, human input, playback"]
        core["Logical container: Checkers core\nFramework-neutral TypeScript\nPosition, validator, history, engine, search session"]
        sdk["Logical container: Agent SDK\nTypeScript contracts\nPlayableAgent, immutable context, simulation facade"]
        bots["Container: Agent modules\nHuman, random, minimax, alpha-beta, third-party agents"]
        codec["Logical container: PDN codec\nHeaderless type-31 parser and writer"]
    end

    human -->|browser interaction| spa
    botdev -->|implements| sdk
    pdn -->|text| spa
    spa -->|synchronous commands and snapshots| core
    spa -->|parse/write| codec
    spa -->|requests decisions| bots
    bots -->|implements| sdk
    sdk -->|simulation seed and rules facade| core
    codec -->|replay through public commands| core
```

The logical containers can remain folders in the existing application initially. Their public barrel files enforce the same boundaries that separate packages would use later.

## Level 3 — Components

```mermaid
flowchart TB
    subgraph angular["Angular application"]
        shell["App shell\nCreates configuration and switches live/review mode"]
        board["Board component\nRenders tiles/pieces and forwards clicks"]
        stats["Status component\nPlayers, counts, turn, result, history, controls"]
        renderer["AngularRenderer\nRendererPort implementation and animations"]
        presenter["GamePresenter\nSnapshot + UI state -> GameViewModel"]
        session["GameSession\nLifecycle, agent dispatch, cancellation, diagnostics"]
        playback["PlaybackController\nIsolated review engine and timed/step playback"]
        humanAgent["HumanAgent\nSelection and pending move promise"]
        randomBot["RandomBot\nRandom legal move"]
        minimaxAgent["MinimaxAgent\nDepth-limited search"]
        alphaBetaAgent["AlphaBetaAgent\nPruned depth-limited search"]
        pdn["PdnMovetextCodec\nParse, disambiguate, and export"]
    end

    subgraph core["Framework-neutral checkers core"]
        engine["CheckerEngine\nOwns live position and history; executes commands"]
        rules["RuleValidator\nOnly legality and result authority"]
        history["GameHistory\nAtomic undo and completed-turn records"]
        geometry["BoardGeometry\n32-square/8x8 mappings and precomputed rays"]
        search["SearchSession\nReversible bot simulation"]
        position["GamePosition\nCompact numeric state"]
    end

    subgraph sdk["Agent SDK"]
        contract["PlayableAgent"]
        context["AgentTurnContext"]
        simapi["Simulation API"]
    end

    shell --> session
    shell --> playback
    board --> humanAgent
    stats --> session
    stats --> playback
    session --> renderer
    renderer --> presenter
    presenter --> board
    presenter --> stats
    session --> engine
    session --> contract
    session --> context
    humanAgent -. implements .-> contract
    randomBot -. implements .-> contract
    minimaxAgent -. implements .-> contract
    alphaBetaAgent -. implements .-> contract
    context --> simapi
    simapi --> search
    playback --> pdn
    playback --> engine
    pdn --> rules
    pdn --> geometry
    engine --> rules
    engine --> history
    engine --> position
    rules --> geometry
    rules --> position
    search --> rules
    search --> position
```

## Dependency rules

1. Core files may depend only on other core files and TypeScript/ECMAScript primitives.
2. `RuleValidator` has no reference to `CheckerEngine`; it operates on supplied position and rule context values.
3. `SearchSession` may mutate only its private copied position and undo arrays. It shares immutable geometry and the same validator implementation with live play.
4. The agent SDK exposes readonly data and simulation operations, never concrete core storage.
5. Agents depend on the SDK, not on Angular, `GameSession`, `CheckerEngine`, renderer implementations, or other agents.
6. The PDN codec produces parsed paths and diagnostics. It does not mutate a live engine; `PlaybackController` applies paths to its review engine.
7. `GamePresenter` is the only place that expands the 32-square position into the object-rich view required by existing Angular templates.
8. Angular components do not call rule methods. They render `GameViewModel` and send user/application intents.

## Control and data flow

```mermaid
flowchart LR
    click["UI or agent intent"] --> session[GameSession]
    session --> command["CheckerEngine command"]
    command --> validator[RuleValidator]
    validator --> transition["CommandResult + transition"]
    transition --> snapshot["Immutable GameSnapshot"]
    snapshot --> presenter[GamePresenter]
    presenter --> view["GameViewModel"]
    view --> renderer[AngularRenderer]

    snapshot --> context["AgentTurnContext"]
    context --> agent[PlayableAgent]
    agent -->|MoveIntent only| session
```

Only the path through `CheckerEngine` can mutate a live game. Rendering, agent computation, parsing, and selection are replaceable adapters around that boundary.
