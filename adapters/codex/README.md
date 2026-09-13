# MQAF Codex Sol-Terra-Luna Adapter

This optional adapter maps MQAF's provider-neutral Director, Manager, Worker,
and Reviewer execution profiles to current Codex custom-agent configuration.
It does not replace `AGENTS.md`, `Agent.md`, the 14 operating modes, the 12 Dev
AI roles, task contracts, permission gates, or evidence requirements.

The configuration shape and model guidance were checked against the current
Codex manual and OpenAI model documentation on 2026-08-04. Recheck current
primary documentation before relying on changing model availability, effort
levels, pricing, limits, or configuration fields.

## Included files

```text
config.toml.example
agents/
  terra-project-manager.toml
  terra-reviewer.toml
  luna-worker.toml
  runtime-fallback.toml
```

The main Codex session is the Director-hosted Mew Orchestrator. The example
config selects Sol at `medium` for that session. Custom agents are runtime execution
placements only:

- Sol hosts the requested Program Director / Supreme Web Architect placement;
- Terra hosts subordinate Project Manager / Technical Lead or independent
  Reviewer placements;
- Luna hosts the bounded SubAgent Worker / Implementer placement; and
- Codex Runtime is the execution layer for agents, tools, build, lint, and
  tests—not a new MQAF role, approval source, or completion proof.

| File | Model | Baseline and eligible ladder | Default purpose |
|---|---|---|---|
| `terra-project-manager.toml` | `gpt-5.6-terra` | `medium -> high -> xhigh -> max -> ultra*` | Bounded workstream planning, task contracts, coordination, conflict analysis, and integration review |
| `terra-reviewer.toml` | `gpt-5.6-terra` | `medium`; select the lowest risk-appropriate exposed level | Independent read-only correctness, security, compatibility, and evidence review |
| `luna-worker.toml` | `gpt-5.6-luna` | `medium -> high -> xhigh -> max` | Clear bounded implementation or focused tests within explicit ownership |
| `runtime-fallback.toml` | Unpinned | Runtime-confirmed | Read-only fallback when a pinned model is unavailable |

## Effort policy

The example configuration sets `medium` as the Program Director and spawned
agent baseline. The three named MQAF ladders are:

```text
Program Director / Sol: medium -> high -> xhigh -> max -> ultra*
Project Manager / Terra: medium -> high -> xhigh -> max -> ultra*
Worker / Luna:           medium -> high -> xhigh -> max
```

`xhigh` is **Extra High**. Treat `max` and especially `ultra*` as
capability-gated. GPT-5.6 API requests currently expose reasoning efforts only
through `max`; Ultra is a Codex or ChatGPT runtime coordination mode that can
use subagents and may be unavailable for the selected model or account. Do not
write `ultra` as a portable API `reasoning.effort` value.

The three model-pinned custom-agent files intentionally omit
`model_reasoning_effort`. This preserves Codex precedence: an explicit spawn
effort can override `[agents].default_subagent_reasoning_effort`, while the
configured `medium` baseline applies when no override is supplied. Select the
lowest exposed level that passes the task oracle. Use Ultra only for a
meaningfully parallel Director or Manager graph; the Worker ladder ends at
`max`, and more effort never expands Worker scope or authority.

## Install into a project

1. Copy the full MQAF bundle or its required entrypoint files into the target
   repository.
2. Inspect any existing `.codex/config.toml` and `.codex/agents/` files. Do not
   overwrite them blindly.
3. Merge the settings from `config.toml.example` into the target project's
   `.codex/config.toml`.
4. Copy the required files under `agents/` into `.codex/agents/`.
5. Start a new Codex session so project configuration and custom agents reload.
6. Run the Universal activation message and fill
   [`AI_RUNTIME_PROFILE.md`](../../templates/AI_RUNTIME_PROFILE.md).
7. Use [`MODEL_ROUTING_PLAN.md`](../../templates/MODEL_ROUTING_PLAN.md) for
   consequential or multi-agent work.

Project layout after installation:

```text
.codex/
  config.toml
  agents/
    terra-project-manager.toml
    terra-reviewer.toml
    luna-worker.toml
    runtime-fallback.toml
AGENTS.md
Agent.md
docs/
skills/
templates/
```

## Use the profiles

Example managed workstream prompt:

```text
Use Mew model routing for this feature.

Keep the main Sol session as the accountable Mew Orchestrator. Ask
terra_project_manager at the lowest sufficient exposed effort to inspect the
project instructions, produce the task
graph and Worker contracts, and identify shared files that must be serialized.
Delegate only clear disjoint implementation tasks to luna_worker. Use
terra_reviewer on the exact integrated result. Wait for required handoffs,
then integrate and report current evidence.
```

Example direct task:

```text
Delegate this already-specified one-file change directly to luna_worker with
the exact owned file, forbidden files, acceptance criteria, and validation.
Skip the Manager hop because architecture and contracts are already settled.
Review the returned diff and evidence before accepting it.
```

Do not force every request through Sol -> Terra -> Luna. Use the shallowest
graph that satisfies the task. Sol should not implement routine small changes;
Terra should not write large features merely to avoid delegation; Luna should
not redesign architecture or change rules.

## Model and capability fallback

Pinned model availability is a runtime fact. If a pinned custom agent cannot
start:

1. Do not claim that it ran.
2. Use `runtime_fallback` or another runtime-confirmed route with a fresh task
   contract.
3. Record the actual route and effort in the runtime profile and evidence
   bundle.
4. Preserve the same scope, ownership, permission, verification, and stop
   conditions.
5. Run the responsibility pass serially when native subagents are unavailable.

Do not automatically retry an ambiguous external or non-idempotent action on a
fallback model. A timeout does not release ownership. Preserve request or
operation IDs, target, artifact identity, timestamps, raw output, and any
provider idempotency key; use bounded read-only status and health checks to
classify the action before another writer or retry starts. Never resubmit while
the prior action is in progress, succeeded, or `state_unknown`. Confirm that the
original approval tuple covers another attempt; otherwise request fresh
approval. Record a safe retry as a new correlated attempt.

## Current primary sources

- [Codex subagents and custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex model selection](https://learn.chatgpt.com/docs/models)
- [OpenAI GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)

## Verify

From the MQAF root, run:

```powershell
python -X utf8 scripts/validate_framework.py
```

Then run a representative direct Worker task, a managed workstream, an
independent review, an unavailable-model fallback, and an ambiguous-side-effect
stop scenario. A successful agent spawn proves only that the configuration was
accepted; it does not prove code quality or completion.
