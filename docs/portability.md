# MQAF Portability Guide

MQAF separates durable engineering behavior from any single model, framework,
repository, cloud, or tool vendor. It can be copied into another project as an
instruction system even when that runtime has no native subagent or skill
feature.

## Single-file universal adoption

Use the adapter pack when the target AI cannot discover the full MQAF folder:

| Context budget | Canonical prompt | Intended use |
|---|---|---|
| Large | [`MEW-UNIVERSAL-FULL.md`](../adapters/universal/MEW-UNIVERSAL-FULL.md) | System prompts, project instructions, custom agents, APIs, and repository files with sufficient capacity |
| Medium | [`MEW-UNIVERSAL-COMPACT.md`](../adapters/universal/MEW-UNIVERSAL-COMPACT.md) | Concise coding-agent rules and smaller persistent contexts |
| 1,500 characters | [`MEW-UNIVERSAL-MICRO-1500.md`](../adapters/universal/MEW-UNIVERSAL-MICRO-1500.md) | Hard-limited custom-instruction fields |

Each file is self-contained and provider-neutral. Install one in the
highest-priority user-controlled instruction surface supported by the target
runtime, then send the
[`activation message`](../adapters/universal/MEW-ACTIVATION-MESSAGE.md).
Use the current [`platform placement map`](../adapters/README.md) and record
observed capability in
[`AI_RUNTIME_PROFILE.md`](../templates/AI_RUNTIME_PROFILE.md).

Single-file installation preserves the operating contract but does not expose
the full detailed skill bodies, templates, or project facts. Use the Full
framework profile when repository-native skill routing and deeper reference
material are needed.

Across providers, treat defensive vulnerability review of repositories and
artifacts supplied by the user as normal read-only engineering work. A runtime
that cannot or should not actively test a live target must fall back to source,
configuration, dependency, threat, and safe isolated analysis rather than
refusing the entire task. Runtime policy still governs disallowed actions, and
active remote testing still requires exact target authorization and bounded
test conditions. Security fixes must preserve project contracts and use
regression evidence; no prompt can guarantee hack-proof software.

## Portable layers

1. **Repository entrypoint** — `AGENTS.md` tells an agent what to read and how
   to route work.
2. **Operating contract** — `Agent.md` defines Mew, the Ultimate OS loop,
   roles, modes, permissions, evidence, and completion.
3. **Specialist skills** — `skills/<name>/SKILL.md` defines triggerable,
   bounded workflows; `agents/openai.yaml` exposes optional Codex metadata.
4. **Knowledge and decision protocols** — `docs/` defines Councils, debate,
   memory, current-source routing, engineering standards, and evaluations.
5. **Project contracts** — `templates/` captures context, ownership, decisions,
   threats, evidence, feedback, recovery, and handoffs.
6. **Runtime adapters** — the target runtime supplies its real filesystem,
   shell, version control, browser, database, deployment, memory, and agent
   tools.
7. **Universal prompts** — `adapters/universal/` supplies copy-paste contracts
   for text-only, project-instruction, API, and repository-rule surfaces.
8. **Model-route adapters** — provider-specific folders such as
   `adapters/codex/` map the portable Director, Manager, Worker, and Reviewer
   profiles to real model and custom-agent configuration without changing the
   canonical contract.

Never rename or pretend an unavailable tool exists. Map the needed capability
to a real tool, perform the same role pass serially, use a safe alternative, or
report the missing capability.

## Adoption profiles

### Minimal manager profile

Copy:

```text
AGENTS.md
Agent.md
docs/persona.md
docs/orchestration.md
skills/mew-orchestrate/
templates/PROJECT_CONTEXT.md
templates/TASK_CONTRACT.md
templates/EVIDENCE_BUNDLE.md
```

Fill in `PROJECT_CONTEXT.md`, then ask the agent to follow `Agent.md`.

### Full Ultimate OS profile

Copy as complete units:

```text
AGENTS.md
Agent.md
README.md
docs/
skills/
templates/
scripts/validate_framework.py
```

Install or expose selected skill folders through the target runtime's
documented discovery mechanism. Keep folder names unchanged so invocations such
as `$mew-orchestrate`, `$build-frontend`, and `$verify-software` remain stable.

### Selective specialist profile

Copy `mew-orchestrate` plus only the Dev AI and Council skills needed by the
project. Include each selected folder's `SKILL.md` and `agents/openai.yaml`.
Also copy every local document or template referenced by those skills.

## Project overlay wins

Record project facts in `templates/PROJECT_CONTEXT.md`:

- repository, workspace, tenant, account, and environment boundaries;
- product outcome, users, compatibility commitments, and non-goals;
- installed languages, frameworks, versions, package manager, and conventions;
- verified commands for install, lint, types, tests, build, preview, release,
  and rollback;
- architecture, coding, API, data, design-system, and documentation standards;
- data classification, retention, logging, secret, network, and access rules;
- quality budgets and evidence required for completion;
- actions and owners that require approval.

The greenfield preference pack is a starting hypothesis, not a migration
mandate. Existing project evidence and constraints win unless the user
explicitly authorizes a stack change. Do not edit reusable skills to encode one
project's temporary facts.

## Runtime capability mapping

| MQAF capability | Runtime adapter requirement |
|---|---|
| Observe | Read files, search, inspect repository and environment state |
| Change | Patch exact artifacts while preserving unrelated work |
| Execute | Run scoped commands in a known working directory |
| Browse | Inspect real UI, network, console, accessibility, and screenshots |
| Delegate | Spawn bounded agents or run independent role passes serially |
| Debate | Preserve independent proposals, evidence, challenge, and decision ownership |
| Remember | Store only authorized, scoped, sourced, versioned, correctable records |
| Approve | Pause high-impact work and resume from a stable permission ledger |
| Verify | Preserve command output, reports, renders, traces, and endpoint evidence |
| Operate | Target exact environments with auditable release and recovery controls |

If subagents are unavailable, retain one-writer ownership and run role passes
sequentially. Keep the verification pass logically independent from authorship
for material changes.

## Portable model routing

Use [`model-routing.md`](model-routing.md) to select execution from task
ambiguity, architecture impact, risk, cross-domain coupling, context, tools,
verification difficulty, latency, and cost. Keep **Director**, **Manager**,
**Worker**, and **Reviewer** as provider-neutral execution profiles. They are
not additional modes, Dev AI roles, or permission levels.

Map Sol, Terra, Luna, or another provider's tiers only inside a dated runtime
adapter. Record actual availability and effort in
[`AI_RUNTIME_PROFILE.md`](../templates/AI_RUNTIME_PROFILE.md), and record
consequential per-task choices in
[`MODEL_ROUTING_PLAN.md`](../templates/MODEL_ROUTING_PLAN.md). If the requested
model is unavailable, select a verified equivalent or run clean serial passes.
Never fake distinct agents and never retry an ambiguous non-idempotent action
without inspecting actual state.

## Provider and model portability

- Describe capabilities, contracts, and evidence requirements rather than
  relying on a provider-specific model name.
- Put portable behavior in the Universal prompt and keep current filenames,
  instruction limits, inheritance, and loading behavior in
  `adapters/README.md`.
- Detect actual context, tool, network, image, browser, and agent capabilities
  at runtime.
- Treat a successful activation response as conversation-level comprehension,
  not proof of future adherence or equivalent execution across providers.
- Treat every model as probabilistic and evaluate it on representative project
  tasks.
- Route to the lowest-cost model and effort that meets measured quality,
  safety, context, tool, and evidence needs; do not send every task to the
  strongest model or every edit through a fixed three-level hierarchy.
- Keep provider calls behind adapters when replacement, routing, privacy, or
  cost control matters.
- Never weaken permissions or truth standards because one runtime offers more
  tools or a larger model.

## Versioning and controlled improvement

- Version `Agent.md`, skills, metadata, docs, and templates as one compatible
  framework release.
- Record the framework and project revision in each evidence bundle.
- Re-run structural validation and forward evaluations after changes to
  routing, delegation, permissions, memory, verification, or completion.
- Compare changed behavior with a previous baseline and representative held-out
  tasks.
- Record deliberate behavioral changes in an ADR and retain a rollback path.
- Do not promote an unreviewed feedback item or self-generated rule directly
  into the operating contract.
