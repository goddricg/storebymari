---
name: document-engineering
description: >-
  Engineer accurate, maintainable, audience-specific documentation from
  primary project evidence, with traceable claims, safe examples, usable
  information architecture, and format-appropriate validation. Use for
  Documentation AI work that creates or updates README files, architecture
  diagrams, ADRs, RFCs, technical specifications, API references, AI system
  cards, evaluation reports, security guidance, SLOs, runbooks, migration or
  deployment guides, incident reports, onboarding, Markdown, or MDX that must
  stay aligned with code, configuration, operations, or user-visible behavior.
---

# Engineer Trustworthy Documentation

Serve the Engineering Documentation or Documentation AI role. Treat
documentation as a maintained interface. Tie factual claims to current primary
evidence. Label claims with canonical evidence states and identify proposals,
examples, and assumptions explicitly.

## Contract the document

- Identify the audience, user task, artifact type, desired decision or action,
  source of truth, scope, owner, lifecycle, and acceptance criteria.
- Preserve the user's language, terminology, and required format.
- Ask only for missing context that changes the structure or truth of the
  document.
- Distinguish a new artifact from an edit, review, redline, or migration.
- Select specialized format tooling for layout-dependent binary artifacts and
  require rendered visual inspection before delivery.
- Preserve the current product stack, provider terminology, commands, and
  contracts unless the document explicitly describes an approved change.
- Define publication, external messaging, production execution, and
  sensitive-data access as separate permission gates.

## Inspect before writing

- Read applicable instructions, existing docs, templates, and nearby style.
- Inspect the code, schema, configuration, API, tests, command definitions, and
  operational evidence needed to support each important claim.
- Map the real user or operator path before documenting a workflow.
- Record facts, inferences, proposals, unknowns, and potentially stale claims
  separately.
- Preserve unrelated edits and established terminology.
- Avoid copying an old claim merely because it already appears in docs.
- Prefer source, tests, generated schemas, CI definitions, provider
  configuration, deployment evidence, and live observations over another
  summary. Verify drift-prone platform facts against current primary
  documentation.
- Capture source revision, artifact, environment, tool version, and timestamp
  with explicit time zone when a claim depends on them.

## Select an information architecture

- Organize a README around purpose, prerequisites, setup, usage, validation,
  troubleshooting, and ownership.
- Organize an ADR around context, constraints, decision, alternatives,
  consequences, status, and supersession.
- Organize an RFC or specification around problem, goals, non-goals, current
  evidence, proposed design, contracts, failure modes, security, migration,
  rollout, rollback, observability, validation, and open questions.
- Organize an API reference around authentication, authorization, endpoint,
  inputs, outputs, errors, idempotency, rate or concurrency behavior, examples,
  and version compatibility.
- Organize a runbook around trigger, impact, prerequisites, diagnostics, safe
  actions, permission gates, verification, rollback, escalation, and evidence
  capture.
- Organize a migration or deployment guide around compatibility, backup,
  preflight, exact gated action, validation, rollback, and ownership.
- Organize an incident report around impact, timeline, detection, evidence,
  contributing conditions, remediation, verification, and follow-up owners.
- Organize a security guide around assets, actors, trust boundaries, threat
  model, controls, abuse cases, privacy, secrets, supply chain, verification,
  incident response, and residual risk.
- Organize an AI system card or integration guide around intended use,
  exclusions, provider and model routes, prompt and policy versions, structured
  outputs, tools and MCP servers, RAG and vector sources, authorization, memory,
  data handling, evaluations, latency, cost, monitoring, rollback, and known
  limitations.
- Organize an evaluation report around task and dataset provenance, source and
  system versions, environment, rubric, deterministic and qualitative graders,
  baseline, distributions, failures, contamination controls, and release
  decision.
- Organize an SLO document around user journey, SLI definition, objective,
  window, exclusions, data source, error-budget policy, alerting, ownership,
  review cadence, and recovery link.
- Organize onboarding around the smallest successful path, mental model,
  common failure modes, and links to deeper references.

Remove sections that do not serve the audience. Add a table of contents only
when navigation materially improves.

## Write for action and maintenance

- Lead with the reader's outcome.
- Use short sections, descriptive headings, stable terminology, and explicit
  preconditions.
- Keep normative words precise: use "must" for requirements, "should" for
  recommendations, and "may" for optional behavior.
- Put one source of truth in one place and link to it instead of duplicating
  volatile details.
- Use tables for repeated field mappings and diagrams only for relationships or
  sequences that prose cannot show as clearly.
- Keep code, command, payload, and configuration examples minimal and
  copy-safe.
- Mark placeholders unmistakably and keep them out of runnable examples.
- State defaults, time zones, units, versions, environments, tenant boundaries,
  and destructive effects where relevant.
- Explain both the happy path and the recovery path.
- Add ownership or freshness signals for operationally critical docs.
- Keep Git, GitHub, CI/CD, Docker, Vercel, Cloudflare, edge, CDN, serverless,
  and cache instructions conditional on the actual stack. Separate a generic
  example from a repository-native command.
- Put the production approval gate immediately before the exact command or
  workflow that crosses it. Explain target selection, artifact identity,
  observable success, stop conditions, and rollback.
- Document a one-command delivery entry point only when it exists or is clearly
  labeled `proposed`. Show its safe default and audit output; do not imply one
  command bypasses approvals or proves production success.

## Protect users and systems

- Remove secrets, tokens, credentials, private keys, personal data, customer
  content, delivered products, and sensitive internal identifiers.
- Use obviously synthetic values in examples.
- Avoid commands that conceal destructive behavior or depend on unsafe,
  unresolved paths.
- Put approval gates immediately before production, destructive, security,
  billing, publication, or cross-environment steps.
- Distinguish preparation from activation.
- Never imply that a proposed command was executed.
- Keep exploit payloads, incident details, internal topology, customer
  identifiers, proprietary prompts, delivered product content, and sensitive
  runbooks within their authorized audience.
- Sanitize logs, screenshots, traces, API payloads, model conversations, RAG
  chunks, vector metadata, and evaluation examples before including them.

## Preserve compatibility and traceability

- Document current and legacy contracts when both remain supported.
- Label breaking changes and migration requirements explicitly.
- Link decisions to affected interfaces, schemas, routes, or configuration.
- State whether a behavior is `verified`, `observed`, `inferred`, `proposed`,
  `failed`, `not_run`, or `blocked`; record deprecation as lifecycle metadata,
  not as an evidence state.
- Include dates only when they add lifecycle value, and pair them with an owner
  or update condition.
- Keep examples synchronized with the canonical field names and error shapes.
- Use the canonical evidence states `verified`, `observed`, `inferred`,
  `proposed`, `failed`, `not_run`, and `blocked`. Do not substitute confidence
  language for a missing check.

## Document complete assurance coverage

Include only the domains affected by the subject, but do not omit a reachable
boundary:

- Describe authorization by resource, role, owner, and tenant rather than
  saying only "authenticated."
- Describe validation, SQLi, XSS, CSRF, SSRF, RCE, rate limits, secret
  handling, privacy lifecycle, dependency provenance, and incident recovery
  when security behavior depends on them.
- Describe field and lab performance separately. Record LCP, INP, CLS budgets,
  Lighthouse conditions, bundle and image budgets, caching, lazy loading, and
  streaming behavior when performance is in scope; never present Lighthouse
  100 as a universal guarantee.
- Describe the test pyramid, contract, integration, end-to-end,
  accessibility, security, performance, concurrency, and tenant-isolation
  evidence that actually ran.
- Describe prompts, model routes, MCP tools, RAG and vector authorization,
  evaluation datasets and graders, prompt injection, data handling, latency,
  cost, monitoring, and rollback for AI systems.
- Describe Git or GitHub revision, CI/CD gates, container or provider artifact,
  effective environment, CDN or serverless behavior, observability, SLO,
  runbook, and rollback for operational claims.

## Coordinate subagents

- Delegate bounded source inspection, example validation, link checking,
  audience review, or rendered-format QA when the work is independent.
- Give each subagent the audience, owned artifact, source paths, allowed tools,
  privacy constraints, and required evidence.
- Keep one active writer per document and one editor responsible for resolving
  terminology, structure, and factual conflicts.
- Require subagents to distinguish verified facts, proposals, and unexecuted
  examples, and prohibit publication or external messaging without authority.
- Reconcile every handoff against primary project evidence before integration.

## Verify the artifact

- Validate headings, anchors, links, referenced paths, snippets, and structured
  metadata.
- Verify commands against actual scripts or help output before presenting them
  as runnable.
- Exercise safe examples, snippets, queries, payloads, and one-command entry
  points when proportionate and authorized.
- Compare API, schema, configuration, and behavior claims with current primary
  sources.
- Render Markdown, MDX, diagrams, tables, or layout-dependent formats when
  visual presentation affects usability.
- Check mobile or narrow-width readability for user-facing web docs when
  relevant.
- Scan for placeholders, stale names, contradictions, secret-like values, and
  accidental private data.
- Use an independent review for high-risk runbooks, migrations, security docs,
  and public references when feasible.
- Run repository-native docs lint, spelling, link, schema, example, and build
  checks when they exist. Do not invent a docs command that the repository does
  not define.
- Confirm that Mermaid or other diagrams match the current component,
  direction, trust, data, and failure relationships instead of treating a
  successful render as factual validation.

Record each completion claim as `verified`, `observed`, `inferred`, `proposed`,
`failed`, `not_run`, or `blocked`. Do not turn link validity into proof that
linked behavior works.

## Deliver the document

- Report the artifact path and intended audience.
- Summarize material decisions or changed behavior.
- List validation performed and concrete results.
- Disclose assumptions, source gaps, skipped rendering, unexecuted commands,
  and stale areas.
- Request publication, deployment, or external-message approval separately
  unless the current request already grants it.
- Keep the delivery summary self-contained and evidence-calibrated.
- Never claim that documentation alone implemented, secured, tested, deployed,
  or operated the described system.
