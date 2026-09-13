# Model Routing Plan

Use this record per outcome or workstream. Execution profiles do not create new
MQAF modes, Dev AI roles, permissions, or evidence states.

## Outcome

- Task or workstream ID:
- User-visible outcome:
- Primary operating mode:
- Canonical Dev AI roles:
- Integration owner:
- Independent verifier:

## Runtime evidence

- Runtime and provider:
- Available model routes:
- Supported API reasoning efforts:
- Supported runtime intelligence or coordination levels:
- Per-model effort support and source:
- Session, dispatch, custom-agent, and inherited effort precedence:
- Native subagents and nesting:
- Context and tool limits:
- Data, privacy, network, and approval boundary:
- Evidence date and source:

## Routing factors

| Factor | Low / medium / high | Evidence and impact |
|---|---|---|
| Requirement ambiguity |  |  |
| Architecture impact |  |  |
| Risk and blast radius |  |  |
| Cross-domain coupling |  |  |
| Context burden |  |  |
| Tool and side-effect burden |  |  |
| Verification difficulty |  |  |
| Latency and cost sensitivity |  |  |

## Selected graph

- Coordination depth: direct / managed workstream / program / serial fallback
- Director placement:
- Manager placement:
- Worker placement or placements:
- Reviewer placement:
- Maximum concurrency:
- Serialized mutable resources:
- Why this is the shallowest sufficient graph:

## Route contracts

| Task ID | Execution profile | Canonical role | Preferred route | Baseline | Requested and actual effort | Fallback | Owned artifacts | Required evidence |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## Effort selection

- Eligible ladder for this profile and route:
- Lowest level expected to satisfy the oracle:
- Promotion evidence and accepted latency or cost tradeoff:
- Whether `max` is exposed and justified:
- Whether Ultra is exposed as a runtime coordination mode and justified:
- One-lower-effort comparison result:
- Unsupported-level fallback:
- Evidence for the actual effort that ran:

## Escalation and failover

- Worker stop conditions:
- Manager stop conditions:
- Permission gates:
- Route lifecycle: not_started / dispatched / running / handoff_received / state_unknown / ownership_released
- Route-loss evidence and fallback contract:
- Last known writer, artifact, and external state:
- Ownership-release evidence and transfer owner:
- Ambiguous side-effect correlation: target / environment / artifact or digest / actor / time / request or operation ID / idempotency key
- Reconciliation state: not_dispatched / in_progress / succeeded / failed_or_rolled_back / state_unknown
- Read-only state and health checks:
- Original approval tuple and whether it covers a retry:
- Retry or fresh-approval decision and evidence:
- Conditions that require Director decision:
- Conditions that allow direct Worker routing:

## Promotion gates

- [ ] Every Worker returned the required handoff.
- [ ] No mutable ownership conflict remains.
- [ ] Every `state_unknown` route or side effect is reconciled or remains visibly `blocked`.
- [ ] No fallback writer started before prior ownership was explicitly released.
- [ ] Manager inspected artifacts and raw evidence.
- [ ] Integration checks ran against the combined artifact.
- [ ] Independent review ran where required.
- [ ] Actual model routes and reasoning efforts were recorded.
- [ ] Latency, cost, and token evidence was recorded when material.
- [ ] All `failed`, `not_run`, and `blocked` surfaces remain visible.
- [ ] Final claims use only canonical evidence states.
