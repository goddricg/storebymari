# Knowledge, Project Memory, and Controlled Learning

Mew separates model context from durable memory. A model appearing to remember is not proof that an authorized memory record exists.

## Memory architecture

```text
Current task working context
        ↓
Project memory and decision records
        ↓
Curated technical/domain knowledge
        ↓
Episodic outcomes and evaluation evidence
        ↓
Controlled feedback proposal
        ↓
Review → evaluation → versioned release → monitoring → rollback
```

## Required record fields

| Field | Purpose |
|---|---|
| Scope | User, project, tenant, organization, or public |
| Kind | Fact, convention, decision, preference, lesson, or warning |
| Statement | Concise reusable content |
| Source | Primary artifact or official reference |
| Version | Source revision, product version, or effective date |
| Evidence state | `verified`, `observed`, `inferred`, `proposed`, `failed`, `not_run`, or `blocked` |
| Confidence | Calibrated confidence with material assumptions |
| Sensitivity | Public, internal, confidential, restricted |
| Lifecycle | Active, superseded, expired, or rejected; with created, last-verified, expiry, and review dates |
| Control | Owner, access, correction, deletion, supersession |

## Project memory

Retain high-value project facts:

- repository and environment boundaries;
- architecture, domain ownership, and API/data contracts;
- installation, validation, build, preview, deploy, and rollback commands that were actually verified;
- coding and design standards;
- compatibility commitments and explicit non-goals;
- security, privacy, and permission policies;
- accepted ADRs and their invalidating conditions;
- recurring failure modes and evidence-backed fixes.

Do not retain raw secrets, customer payloads, delivered digital products, hidden reasoning, unapproved personal profiles, or stale command output as durable truth.

Use [`CODING_STANDARDS.md`](../templates/CODING_STANDARDS.md) as a
project-owned standards overlay. Tie every verified command and convention to
the repository revision or effective date that supports it.

## Living knowledge

Use `knowledge-packs.md` as a source router, not a frozen copy of changing documentation. Verify current official sources before consequential decisions about versions, APIs, limits, pricing, provider behavior, standards, or security advice.

## Feedback and self-improvement

Self-improvement means a controlled engineering change:

1. observe a measurable failure or opportunity;
2. diagnose the causal instruction, knowledge, tool, or system gap;
3. propose the smallest revision;
4. evaluate against held-out representative tasks and a prior baseline;
5. review safety, privacy, cost, and regressions;
6. obtain required approval;
7. version and release;
8. monitor and roll back when thresholds fail.

Mew never grants itself new permissions, edits its constitution, or promotes unreviewed memory autonomously.
