# Model Routing and Execution Placement

## Purpose

This protocol selects an execution placement for each MQAF task without
turning provider model names into new operating modes, Dev AI roles, authority,
or proof of quality. It supports a three-tier pattern:

```text
Director-capable route -> Manager-capable route -> Worker-capable route
```

The pattern may map to GPT-5.6 Sol, Terra, and Luna on a runtime that exposes
them. Other providers may use different models, one model at different effort
levels, serial role passes, or no subagents at all.

## Contents

1. [Canonical separation](#canonical-separation)
2. [Execution profiles](#execution-profiles)
3. [Current OpenAI mapping](#current-openai-mapping)
4. [Routing factors](#routing-factors)
5. [Routing algorithm](#routing-algorithm)
6. [Coordination depth](#coordination-depth)
7. [Profile contracts](#profile-contracts)
8. [Review and promotion](#review-and-promotion)
9. [Fallback and failover](#fallback-and-failover)
10. [Validation](#validation)

## Canonical separation

Keep these concepts distinct:

| Layer | Meaning | Authority |
|---|---|---|
| Mew Orchestrator | One accountable manager for the user outcome | Owns scope, contracts, permissions, ownership, integration, stopping, evidence calibration, and final delivery |
| Operating mode | One of the exact 14 intent routes | Routes attention only |
| Dev AI role | One of the exact 12 responsibility lenses | Owns a bounded specialty only |
| Execution profile | Director, Manager, Worker, or independent Reviewer placement | Changes model/runtime mechanics only |
| Provider model | A runtime-specific model identifier | Grants no authority |
| Runtime | Files, tools, shell, browser, subagents, approvals, and external actions | Supplies capability, not correctness or permission |

The **Director**, **Manager**, and **Worker** labels are execution profiles, not
additional MQAF modes or Dev AI roles. A Worker must still receive one of the
canonical Dev AI roles in its task contract. The runtime must not be described
as a decision-maker, approver, or verifier merely because it executed a tool.

Map the requested organization vocabulary without changing that contract:

- **Program Director / Supreme Web Architect placement** means the central Mew
  Orchestrator executing on a Director-capable route;
- **Project Manager / Technical Lead** means a subordinate Manager profile;
- **SubAgent Worker / Implementer** means a bounded Worker profile; and
- **Codex Runtime / Execution Engine** means the capability layer that runs
  tools, checks, and agent threads. It is not another agent, role, approver, or
  source of evidence by itself.

## Execution profiles

### Director profile

Use for ambiguous, consequential, cross-workstream, policy-level, or
architecture-heavy decisions. It is the preferred placement for the central
Mew Orchestrator when available.

Typical responsibilities:

- contract the program outcome and non-goals;
- decide long-term architecture, technology policy, design-system direction,
  coding standards, and security policy;
- approve milestones and resolve material cross-workstream tradeoffs;
- select Manager and Worker placements;
- integrate current evidence and deliver the final result.

Do not route a deterministic component edit, routine test run, ordinary status
check, or already-specified one-owner fix through this profile by default.

### Manager profile

Use for project or workstream coordination that needs repository reading,
requirements analysis, technical planning, task decomposition, conflict
resolution, and integration review.

Typical responsibilities:

- read applicable Markdown instructions and project evidence;
- turn a Director-approved direction into specifications and milestones;
- build task contracts, ownership, dependencies, gates, and validation plans;
- delegate independent bounded tasks when the runtime supports it;
- inspect Worker handoffs, detect conflicts, and return an integration-ready
  recommendation to the Mew Orchestrator.

Do not let the Manager become a second final authority. Avoid large routine
implementation when a bounded Worker can do it with less context and cost.
The Manager may implement a small integration change only when it owns the
artifact, the design is settled, delegation would cost more than the work, and
material acceptance remains independently verified.

### Worker profile

Use for clear, repeatable, bounded implementation or evidence work with a
defined oracle. Examples include a component, page adjustment, focused API,
test, CSS update, local refactor, narrow bug fix, inventory, or structured
extraction.

Run this loop:

```text
Input -> Task contract -> Implement or inspect -> Self-check -> Handoff
```

The Worker must not redesign architecture, change project rules, select new
technology, expand dependencies, alter public contracts, or touch files and
systems outside ownership unless the task contract explicitly authorizes that
change. It never approves its own high-risk completion.

### Independent Reviewer placement

Use a clean, read-only route that did not author the artifact for material
correctness, security, compatibility, or acceptance review. Select the model
and effort from review difficulty, not hierarchy. A Manager-capable route at
higher effort may review bounded Worker output; a Director-capable route may be
required for difficult cross-system review. Final Director acceptance is not a
substitute for independent verification of Director-authored decisions.

## Current OpenAI mapping

The following is a dated adapter mapping, not the portable contract. It was
checked against current OpenAI model and Codex documentation on 2026-08-04:

| Execution profile | Starting model | Baseline | Eligible escalation ladder | Use |
|---|---|---|---|---|
| Program Director | `gpt-5.6-sol` or the intentional `gpt-5.6` Sol alias | `medium` | `medium -> high -> xhigh -> max -> ultra*` | Ambiguous, high-value, architecture, cross-workstream, final synthesis |
| Project Manager | `gpt-5.6-terra` | `medium` | `medium -> high -> xhigh -> max -> ultra*` | Planning, repository analysis, workstream coordination, conflict resolution, review |
| Worker | `gpt-5.6-luna` | `medium` | `medium -> high -> xhigh -> max` | Clear, repeatable, bounded implementation or evidence work |
| Independent Reviewer | Smallest route that meets the review oracle | `medium` | Risk-based; select the lowest exposed level that meets the oracle | Clean-context review of the exact integrated artifact |

`xhigh` is the configuration spelling for **Extra High**. The asterisk on
`ultra*` is mandatory: Ultra is a runtime/product coordination mode that can
use subagents, not a portable OpenAI API `reasoning.effort` value. The current
GPT-5.6 API effort set is `none`, `low`, `medium`, `high`, `xhigh`, and `max`.
Use Ultra only when the active Codex or ChatGPT surface exposes it for the
selected model and account.

Apply the effort ladders as an eligibility policy, not an instruction to use
the highest level:

1. Start every requested profile at `medium`.
2. Promote to `high` for difficult multi-step reasoning, edge cases, or review.
3. Promote to `xhigh` only when representative evidence shows that additional
   analysis improves acceptance quality.
4. Reserve `max` for the hardest quality-first task where latency and token
   cost are accepted and a comparison against `xhigh` is recorded.
5. Allow Ultra only for Program Director or Project Manager work that divides
   into meaningful independent subagent workstreams. Never select it merely as
   a stronger-sounding effort label.
6. Stop Worker escalation at `max`. A Luna Worker at `max` remains bounded and
   cannot redesign architecture, change project rules, expand ownership, or
   grant itself authority; escalate the profile when the task contract changes.
7. Record the requested, runtime-exposed, selected, and actual effort. If a
   level is unavailable, use the highest supported level at or below it, or a
   runtime-confirmed fallback route, without pretending the requested level ran.
8. Re-evaluate the same task at one lower level when optimizing quality,
   latency, or cost; retain the lowest level that meets the acceptance oracle.

OpenAI describes Sol for complex professional work, Terra as the intelligence
and cost balance, and Luna for cost-sensitive high-volume work. Codex guidance
also recommends Luna for clear repeatable agents and Terra for read-heavy or
supporting work. Verify availability and supported effort in the active
runtime; never infer them from this table.

Current sources:

- [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex models](https://learn.chatgpt.com/docs/models)

Do not freeze price, context, rate-limit, or feature claims in MQAF. Retrieve
them from current primary documentation when a decision depends on them.

## Routing factors

Evaluate each task using current evidence:

| Factor | Lower tier is suitable when | Escalate when |
|---|---|---|
| Requirement ambiguity | Done and non-goals are explicit | Multiple plausible outcomes remain |
| Architecture impact | Existing pattern and contract are fixed | Boundaries, technology, or policy may change |
| Risk and blast radius | Local, reversible, low consequence | Auth, security, privacy, money, tenant, data, migration, infrastructure, or Production is affected |
| Cross-domain coupling | One canonical role and owned surface | Several roles, services, or teams must agree |
| Context burden | Focused files and stable context | Large repository evidence needs synthesis |
| Tool and side-effect burden | Local, deterministic, reversible tools | Privileged, external, costly, destructive, or non-idempotent actions are involved |
| Verification clarity | Deterministic oracle exists | Acceptance is probabilistic, visual, cross-layer, or disputed |
| Latency and cost | High volume or fast response matters | Marginal quality changes a high-value outcome |

Model prestige, persona, confidence, and organizational title are not routing
factors. Route to the lowest-cost profile that can satisfy the contract with
the required evidence and safety margin.

## Routing algorithm

1. Confirm actual runtime models, reasoning efforts, tools, subagent support,
   context, data boundary, approvals, and cost controls.
2. Define one primary mode, canonical Dev AI roles, deliverables, ownership,
   permission gates, and acceptance evidence before selecting a model.
3. Reject a route that lacks required capability, data isolation, context,
   tools, or permission behavior.
4. Choose **Worker** for a clear low-risk task with one owner and deterministic
   validation.
5. Add **Manager** when decomposition, repository synthesis, multiple tasks,
   coordination, or conflict resolution materially improves the outcome.
6. Use **Director** when architecture, policy, cross-workstream tradeoffs,
   high-value ambiguity, or final cross-cutting synthesis requires it.
7. Add an independent Reviewer placement for material claims; do not let the
   author be the sole acceptance authority.
8. Record preferred and fallback routes in
   [`MODEL_ROUTING_PLAN.md`](../templates/MODEL_ROUTING_PLAN.md).
9. Skip delegation when the handoff costs more than the bounded work.
10. Re-route when a premise, scope, risk, capability, or evidence need changes.

## Coordination depth

Use the shallowest graph that works:

### Direct path

```text
Mew Orchestrator -> Worker -> focused check -> integration
```

Use for small, specified, low-risk tasks. A Manager hop is unnecessary.

### Managed workstream

```text
Mew Orchestrator -> Manager -> one or more disjoint Workers
                 -> Manager review -> independent check -> Mew integration
```

Use for normal multi-file or multi-specialty work.

### Program path

```text
Director-hosted Mew Orchestrator
  -> parallel Manager workstreams
  -> disjoint Workers
  -> Manager handoffs
  -> independent QA/Reviewer
  -> Mew integration and final delivery
```

Use only when workstreams are meaningfully independent and coordination saves
more than it costs. Cap concurrency and serialize shared files, schemas,
lockfiles, migrations, deployment targets, browser state, accounts, and other
global mutable resources.

## Profile contracts

Every delegated task must include:

- profile placement and canonical Dev AI role;
- objective and observable acceptance criteria;
- required instructions and current evidence;
- exact write ownership and read-only dependencies;
- forbidden files, systems, and behavior changes;
- allowed tools and side effects;
- permission gates and stop conditions;
- required checks and handoff schema;
- preferred route, fallback route, and failover policy.

A Worker must stop and return raw evidence when:

- a requirement, interface, premise, or acceptance criterion is ambiguous or
  disproved;
- work must leave owned artifacts or overlap another writer;
- architecture, project rules, dependencies, public APIs, schemas, auth,
  security policy, tenant boundaries, or deployment assumptions must change;
- a permission gate, sensitive data, external effect, or larger blast radius is
  reached;
- a test fails unexpectedly, a regression appears, or acceptance cannot be
  verified;
- required context or tools are unavailable or conflicting.

Do not let Workers create nested worker trees unless the Mew Orchestrator has
explicitly allowed that bounded topology and retained ownership control.

## Review and promotion

Promote Worker output to Manager review only when the handoff includes status,
owned artifacts, current source identity, exact commands and results,
assumptions, risks, and every `failed`, `not_run`, or `blocked` surface.

Integrate only when:

1. no active ownership conflict exists;
2. the exact integrated artifact is inspected;
3. each acceptance criterion maps to current evidence;
4. integration checks run after combining outputs;
5. permission tuples remain satisfied; and
6. residual risk and skipped checks remain visible.

For medium- or high-risk changes, require a Reviewer or QA & Testing AI pass
that did not author the artifact and did not receive a conclusion-seeking
brief. Director review may accept an evidence-backed result; it cannot upgrade
weak evidence or suppress unresolved findings.

## Fallback and failover

- If the preferred model is unavailable, use a runtime-confirmed model that
  satisfies the same capability and evidence contract. Record the actual route.
- If Luna is unavailable, use Terra at the lowest validated effort or a
  provider-equivalent Worker route.
- If Terra is unavailable, use Sol at a proportionate lower effort, another
  balanced route, or a serial Manager pass.
- If Sol is unavailable, place Mew on the strongest validated route and reduce
  scope or request a decision when architecture confidence is insufficient.
- If native subagents are unavailable, execute Director, Manager, Worker, and
  Reviewer responsibility passes serially with clean boundaries.
- If only one model is available, vary contracts and clean context rather than
  pretending distinct agents or capabilities exist.

Track route execution separately from evidence status. Use the coordination
lifecycle `not_started`, `dispatched`, `running`, `handoff_received`,
`state_unknown`, and `ownership_released`; these are not additional evidence
states. Apply these transitions:

- When a model or agent fails capability validation before dispatch, keep the
  task `not_started`, mark its work `not_run`, record the capability failure as
  `failed` or `observed` from direct runtime evidence, and issue a fresh
  contract to the fallback. No writer ownership transfers because execution
  never began.
- When dispatch may have succeeded but no reliable handoff exists, use
  `state_unknown`. Do not assign a replacement writer. Inspect the agent,
  thread, tool, mutable artifacts, and external target until the prior writer
  is confirmed stopped or its effects are reconciled.
- Transfer ownership only after recording the last known artifact or external
  state, confirming no active writer remains, and setting
  `ownership_released`. The Mew Orchestrator records the transfer; a model
  timeout does not release ownership by itself.

Do not automatically fail over an ambiguous external, destructive,
deployment, migration, payment, publication, or other non-idempotent action.
Preserve raw evidence, inspect the actual state, release ownership explicitly,
and mark the action `observed`, `blocked`, or `not_run` as appropriate before
retrying or requesting approval.

For a timed-out or ambiguous non-idempotent action, reconcile in this order:

1. Preserve the redacted request payload identity, target, environment,
   artifact/version or digest, actor, timestamp, raw tool result, provider
   request or operation ID, and idempotency key when one exists.
2. Use bounded read-only status queries to classify the operation as
   `not_dispatched`, `in_progress`, `succeeded`, `failed_or_rolled_back`, or
   `state_unknown`. Inspect the target artifact/version, provider events,
   logs, and health evidence that discriminate those states.
3. Never resubmit while the operation is `in_progress`, `succeeded`, or
   `state_unknown`. Keep the outcome `blocked` when reconciliation cannot
   determine it.
4. For `not_dispatched` or `failed_or_rolled_back`, verify provider retry and
   idempotency semantics, current target state, recovery readiness, and whether
   the original approval tuple explicitly covers another attempt. Reuse an
   idempotency key only according to documented provider semantics.
5. Request fresh approval when the retry changes action, target, environment,
   scope, artifact, timing, blast radius, or data handling; when approval was
   one-shot; or when coverage is unclear. Urgency and model fallback do not
   extend the original approval.
6. Record the retry as a new correlated attempt, transfer ownership explicitly,
   and repeat acceptance and health verification against the resulting state.

A tool timeout is `failed`; confirmed submission facts are `observed`; the
outcome remains `blocked` while state is unknown. Use `not_run` only when
current evidence shows the action was never dispatched, and `verified` only
when direct target evidence satisfies the acceptance oracle.

## Validation

Evaluate representative tasks for each route:

- task and criterion success;
- architecture or scope drift;
- edits outside ownership;
- unsupported claims and false completion;
- integration conflicts and duplicate work;
- review independence;
- latency, token use, and cost per accepted result;
- escalation precision and unnecessary escalation rate;
- fallback correctness after unavailable models, tools, or subagents;
- behavior after ambiguous side effects.

Do not promote a routing policy merely because one hierarchy completed a demo.
Compare the shallowest viable path, the selected tiered path, and a fallback on
held-out tasks. Keep the route that meets quality and safety thresholds with
the least coordination and resource cost.
