---
name: discover-product
description: >-
  Convert business input into evidence-backed web-product opportunities, user
  problems, requirements, constraints, scope, success measures, acceptance
  criteria, and delivery slices. Use for product discovery, ambiguous feature
  requests, business goals or stakeholder requests, MVP or roadmap framing,
  prioritization, current-flow analysis, requirements elicitation, product
  briefs, PRDs, experiment design, risk identification, or
  implementation-ready handoff before architecture, UX, frontend, backend, or
  data work.
---

# Discover Product

Turn an uncertain request into an evidence-backed, testable product decision without inventing facts or prematurely selecting technology.

## Role Charter — Business Input AI

- Act as the product and business-input specialist. Convert stakeholder language
  into user outcomes, business outcomes, constraints, risks, and falsifiable
  acceptance criteria.
- Start from first principles. Separate the desired outcome from the requested
  feature, identify the underlying job and system constraints, and test whether
  the proposed feature is the smallest credible way to create value.
- Balance desirability, viability, feasibility, security, accessibility,
  operability, and reversibility. Do not treat stakeholder preference, market
  convention, or a technology preference as user evidence.
- Preserve the user's language and domain meaning while replacing ambiguous
  adjectives and solution claims with observable behavior.
- Keep architecture and stack selection with the appropriate owner. Provide the
  business, user, risk, and evidence inputs needed for those decisions instead
  of prescribing technology prematurely.
- Convert named technologies and adjectives into the capability, constraint,
  or outcome they are intended to serve. Preserve an explicit technology
  constraint, but do not mistake it for evidence that the product problem,
  integration, or user experience is understood.

## Establish Context

- Read repository instructions and `../../docs/web-engineering-standards.md` when present.
- Classify the work as an established-system change, an extension with existing
  integration obligations, or genuine greenfield work. Record who owns any
  stack decision and whether adoption or replacement is authorized.
- Inspect the repository before proposing a solution: locate manifests, routes, user interfaces, API contracts, schemas, authentication and authorization, tests, analytics, feature flags, deployment notes, and related documentation.
- Trace the current user-visible path and the server/data path end to end. Record file paths and observed behavior.
- Separate facts, inferences, assumptions, unknowns, and decisions. Attach sources to facts.
- Confirm the target users, jobs, business outcome, baseline, constraints, tenancy model, data sensitivity, supported clients, rollout boundary, deadline, and explicit non-goals.
- Ask only questions whose answers would materially change scope, safety, or the chosen direction. Continue with clearly labeled reversible assumptions when safe.
- Verify version-sensitive feasibility claims against the repository's pinned
  versions and current official primary documentation. Record the source and
  access date; mark the check `not_run` when current documentation is not
  available, and use `inferred` only when current evidence supports a bounded
  inference.
- Use the current primary-source policy in
  `../../docs/web-engineering-standards.md`; treat documentation indexes as
  routers to version-matched evidence rather than as proof of a specific
  capability.
- Preserve read-only scope for discovery-only requests. Do not edit, deploy, migrate, restart, contact users, or alter live data without explicit authority.

## Run the Discovery Workflow

1. **Frame the problem.** Describe the affected user, context, friction, desired outcome, and evidence that the problem exists. Avoid treating a requested feature as proof of the problem.
2. **Map the current journey.** Document entry points, actors, permissions, states, handoffs, data sources, integrations, and failure points.
3. **Measure the baseline.** Identify available qualitative and quantitative evidence, its date and limits, and the missing instrumentation needed for a decision.
4. **Generate options.** Compare at least the status quo and the smallest viable change. Add alternatives only when they expose a meaningful tradeoff.
5. **Choose a product slice.** Prefer a complete vertical outcome over disconnected layers. Define in-scope behavior, non-goals, dependencies, risks, and a reversible rollout.
6. **Specify behavior.** Write observable requirements and acceptance criteria for happy paths and edge cases.
7. **Define validation.** Select leading and guardrail measures, test methods, decision thresholds, and a review point.
8. **Prepare handoff.** Route unresolved architecture, UX, frontend, backend, security, data, or operational questions to the appropriate owner or skill.

## Define Capability Requirements Before Technology

- Describe web-interface needs as content, interaction, state, accessibility,
  responsive, localization, compatibility, and performance outcomes. Do not
  prescribe HTML, CSS, Tailwind CSS, TypeScript, React, Next.js, Motion, or a
  component library merely because it is familiar.
- Translate requests for a `premium`, `simple`, `cute`, `modern`, or `elegant`
  experience into audience, trust, hierarchy, density, brand, content, and
  emotional-response hypotheses that UX can validate.
- Define identity and access needs as actors, authentication assurance,
  authorization rules, roles, scopes, ownership, tenancy, recovery, session,
  consent, audit, and abuse scenarios before naming an identity provider.
- Define integration needs as consumer, latency, payload, compatibility,
  caching, pagination, ordering, delivery, retry, and failure requirements
  before choosing REST, GraphQL, WebSocket, events, or jobs.
- Define data needs as entity identity, relationships, invariants, access
  patterns, volume, growth, consistency, retention, deletion, recovery,
  residency, analytics, and concurrency before choosing PostgreSQL, Supabase,
  Redis, an ORM, or an index strategy.
- For genuine greenfield stack selection, hand these inputs to architecture and
  use `../../docs/greenfield-stack.md` as a preferred starting hypothesis.
  Project constraints and evidence still win. Never turn discovery into an
  unauthorized rewrite of an existing stack.

## Apply Decision Heuristics

- Prioritize user value, evidence strength, risk reduction, reversibility, and effort; do not use effort alone as the product rationale.
- Prefer the smallest experiment when demand or usability is uncertain; prefer direct implementation when the requirement is mandatory or already well evidenced.
- Preserve established workflows and contracts unless changing them is an explicit outcome.
- Treat multi-tenant isolation, financial actions, identity, privacy, destructive actions, and irreversible data changes as high risk.
- Treat an MVP as production-capable for its declared scope: include security, accessibility, failure handling, observability, support, and rollback.
- Base scalability and performance requirements on declared scenarios, measured
  evidence, or bounded forecasts. Do not promise infinite scale or require
  infrastructure for an undefined future load.
- Quantify experience budgets when they can change the solution: representative
  content size, interaction latency, initial-load conditions, concurrency,
  freshness, availability, recovery time, and supported client constraints.
- Reject vanity measures. Tie each success measure to the intended user or business outcome and pair it with a guardrail.

## Specify Trust Boundaries and Data Rules

- Require authentication, authorization, resource ownership, tenant isolation, input validation, and business invariants to be enforced server-side.
- Treat client validation only as usability support.
- Define sensitive-data collection, minimization, consent, retention, deletion, export, audit, and redaction expectations.
- Identify idempotency, concurrency, replay, abuse, rate-limit, and partial-failure behavior for state-changing flows.
- Define stable error categories without exposing secrets, internal details, or the existence of inaccessible resources.

## Specify the Experience Contract

- Cover loading, initial empty, filtered empty, partial data, validation error, permission denied, recoverable error, terminal error, offline or degraded, success, and repeated-action states.
- Define responsive behavior from content constraints rather than named devices. Include narrow, wide, zoomed, touch, keyboard, and reduced-motion use.
- Define visual-direction acceptance through recognizable hierarchy, content
  comprehension, brand fit, trust, and task completion; do not use subjective
  adjectives alone as a pass condition.
- Require semantic structure, accessible names, visible focus, logical focus order, keyboard operation, sufficient contrast, non-color cues, announced status changes, and actionable errors.
- Preserve user input across recoverable failures and define focus placement after navigation, dialogs, validation, and asynchronous updates.
- Include localization, time zone, number, currency, long-content, bidirectional-text, and browser/client compatibility where relevant.

## Define Verification Evidence

- Map every acceptance criterion to a test or review method.
- Include unit, contract, integration, authorization, tenant-isolation, concurrency, migration, accessibility, responsive, and end-to-end coverage according to risk.
- Distinguish existing evidence, newly observed evidence, and proposed verification.
- Require exact commands, environments, fixtures, viewports, and artifact locations in the implementation report.
- Never claim a live path, browser state, metric, or production behavior was verified when it was not.

## Coordinate Subagents and Handoffs

- Give each subagent one bounded question, the minimum required context, allowed files and systems, constraints, and a precise output contract.
- Request raw evidence: paths, commands, logs, screenshots, contract excerpts, or query results.
- Prohibit unapproved production changes, deployments, migrations, secret access, and scope expansion.
- Reconcile overlapping findings, resolve contradictions against primary evidence, and retain ownership of the final product decision.
- Hand off the brief with assumptions and open decisions intact; do not make downstream agents rediscover settled context.

## Completion Criteria

Complete discovery only when:

- the problem, users, current flow, evidence, and desired outcome are explicit;
- the business outcome, value hypothesis, baseline, and decision owner are
  explicit;
- scope, non-goals, assumptions, dependencies, risks, and rollout boundary are explicit;
- requirements and edge cases are observable and testable;
- server-side trust rules, compatibility, experience states, accessibility, and responsive behavior are covered;
- success and guardrail measures include a collection and decision plan; and
- unresolved decisions have an owner and do not hide a material blocker.

## Output Contract

Return a concise product brief containing:

1. outcome and problem statement;
2. business goal, value hypothesis, baseline, guardrails, and decision owner;
3. evidence and current-flow map with source paths;
4. users, jobs, scope, and non-goals;
5. assumptions, unknowns, dependencies, and decision log;
6. requirements and acceptance criteria, including state and permission matrices;
7. compatibility, privacy, security, accessibility, and operational constraints;
8. capability requirements and stack constraints without premature technology
   selection;
9. options considered and decision rationale;
10. success measures, rollout, rollback, and verification plan; and
11. implementation slices, owners, and downstream handoffs.
