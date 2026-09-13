# AI Runtime Profile

Use this record to map MQAF to the real capabilities of one AI product,
workspace, model route, or agent runtime. Do not infer a capability from
marketing language or from the Mew prompt.

## Identity

- Runtime or product:
- Provider:
- Model route, if exposed:
- Selectable model routes and aliases:
- Supported API reasoning efforts:
- Supported runtime intelligence or coordination levels:
- `max` support by model and surface:
- `ultra` support, semantics, eligible models, and account evidence:
- Session and per-agent effort override precedence:
- Custom-agent configuration surface:
- Default and maximum subagent concurrency:
- Surface: chat, project, API, IDE, CLI, agent, or other
- Instruction source and scope:
- Profile owner:
- Last verified date and time zone:
- Evidence source:

## Capability map

Use only `available`, `restricted`, `unavailable`, or `unknown`.

| Capability | Status | Current evidence | Limits or approval behavior | MQAF fallback |
|---|---|---|---|---|
| Persistent project instructions |  |  |  | Re-paste prompt or load repository file |
| Conversation context |  |  |  | Supply a compact task context |
| File and repository read |  |  |  | Attach files or paste relevant excerpts |
| File edit or patch |  |  |  | Return a complete patch or artifact |
| Shell or code execution |  |  |  | Return exact commands and mark `not_run` |
| Test execution |  |  |  | Return a verification plan and expected oracle |
| Current web or official docs |  |  |  | Request sources and label drift risk |
| Browser and screenshots |  |  |  | Request captures and provide a review checklist |
| Image or multimodal inspection |  |  |  | Request an accessible textual description |
| APIs, connectors, or MCP |  |  |  | Provide adapter contracts without claiming calls |
| Native subagents or parallel work |  |  |  | Run specialist passes serially |
| Selectable model routes |  |  |  | Use a runtime-confirmed equivalent or one-model serial passes |
| Per-agent model and reasoning overrides |  |  |  | Inherit the available route and preserve task contracts |
| Custom-agent configuration |  |  |  | Use prompt-level task contracts and explicit delegation |
| Isolated reviewer context |  |  |  | Perform a logically independent review pass |
| Durable memory or project knowledge |  |  |  | Use explicit Project Context each session |
| Human approval controls |  |  |  | Pause and request approval in conversation |
| Deployment or external mutation |  |  |  | Prepare artifacts only; mark execution gated |

## Project overlay

- Repository and workspace boundary:
- Tenant, account, and environment boundary:
- Users and desired outcome:
- In scope:
- Out of scope:
- Technology and versions:
- Verified install, lint, type, test, build, and preview commands:
- Architecture and coding standards:
- Data classification and retention:
- Security and privacy requirements:
- Compatibility commitments:
- Quality and evidence requirements:
- Exact actions requiring approval:

## Validation

- Activation message result:
- Capability claims independently checked:
- Representative task tested:
- Fallback path tested:
- Permission gate tested:
- Evidence-state behavior tested:
- Known limitations:
- Next review trigger:

## Model-routing validation

- Director placement and observed route:
- Director baseline, eligible ladder, requested effort, and actual effort:
- Manager placement and observed route:
- Manager baseline, eligible ladder, requested effort, and actual effort:
- Worker placement and observed route:
- Worker baseline, eligible ladder, requested effort, and actual effort:
- Independent Reviewer placement and observed route:
- Effort selection source: session / explicit spawn / agent file / runtime default
- Unsupported effort fallback tested:
- One-lower-effort comparison and acceptance result:
- Ultra treated as runtime coordination rather than portable API effort:
- Direct Worker path tested:
- Managed workstream tested:
- Unavailable-model fallback tested:
- Ambiguous-side-effect stop tested:
- Route quality, latency, token, and cost evidence:
