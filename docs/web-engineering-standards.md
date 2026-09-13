# Web Engineering Standards

Apply these framework-neutral standards to product discovery, architecture,
UX/UI, frontend, backend, API, data, and verification work. Treat repository
instructions, current project evidence, and explicit user constraints as
authoritative when they are stricter or more specific.

Use **MUST** for a release requirement, **SHOULD** for the default that needs a recorded reason to deviate, and **MAY** for an optional technique.

## 1. Inspect Before Deciding

- MUST inspect repository instructions, manifests, lockfiles, configuration, routes, contracts, schemas, authentication, tests, CI, deployment notes, and relevant user-visible paths before selecting an implementation.
- MUST preserve the repository's language, framework, package manager, architecture, and conventions unless a change is explicitly requested or evidence shows they cannot satisfy the requirement.
- MUST check for existing work and preserve unrelated user changes.
- MUST distinguish `verified`, `observed`, `inferred`, `proposed`, `failed`,
  `not_run`, and `blocked` claims, while recording assumptions separately.
- MUST ask for clarification only when the answer materially changes scope, safety, compatibility, or architecture; otherwise proceed with a labeled, reversible assumption.
- MUST NOT deploy, restart, migrate, alter infrastructure, access secrets, or modify live data without explicit authority.
- MUST read [`greenfield-stack.md`](greenfield-stack.md) only when selecting a
  stack for a genuinely new application or when the user explicitly requests
  that comparison.
- MUST NOT use a preferred greenfield stack as authority to rewrite, upgrade,
  or add dependencies to an established project.

## Current Technology and Source Policy

- MUST inspect the repository's pinned versions, lockfile, runtime, deployment
  target, supported clients, and existing conventions before relying on
  framework or library behavior.
- MUST resolve version-sensitive decisions through current official primary
  documentation for the selected version and platform. Record the source URL,
  access date, pinned version, and decisive compatibility fact.
- MUST treat a documentation homepage as a source router, not proof that a
  specific API, configuration, or target behavior works.
- MUST inspect applicable release, migration, support, security, compatibility,
  runtime-limit, and platform-limit documentation before making a decision
  that depends on them.
- MUST label unavailable current verification rather than inventing an API,
  capability, default, support promise, or version number.
- SHOULD prefer established repository-native capabilities over new
  dependencies. Every added package MUST have a current requirement, owner,
  compatibility check, and verification path.

## 2. Define an Observable Outcome

- MUST identify the affected users, current flow, desired outcome, scope, non-goals, constraints, dependencies, and risks.
- MUST express requirements as observable behavior with testable acceptance criteria.
- MUST cover primary, alternate, permission, validation, failure, retry, cancellation, and recovery paths according to risk.
- MUST define success measures and guardrails for product changes whose value is not self-evident.
- SHOULD deliver the smallest complete vertical slice rather than disconnected technical layers.
- MUST treat an MVP as production-capable within its declared scope.

## 3. Keep Architecture Proportionate

- MUST base architecture on verified quality attributes, invariants, scale, availability, latency, recovery, privacy, and team constraints.
- SHOULD prefer clear modules and stable interfaces in the current deployment before adding distributed services.
- SHOULD organize application code around cohesive features or domains with
  explicit interfaces and one clear owner for each invariant.
- MUST apply modularity, clean architecture, SOLID, DRY, and KISS as diagnostic
  heuristics, not mandatory folder layouts, layer counts, or abstraction
  targets.
- MUST NOT add pass-through layers, generic repositories, wrappers, hooks,
  services, or shared utilities unless a stable contract, repeated behavior, or
  independently testable responsibility demonstrates lower change risk.
- MAY retain small duplication while similar concepts can evolve independently;
  extract only after their shared meaning is stable.
- MUST define component responsibilities, data ownership, trust boundaries, dependencies, and failure behavior.
- MUST choose synchronous versus asynchronous work, consistency, caching, and transaction boundaries deliberately.
- MUST define timeouts, bounded retries, backoff, deduplication, ordering, reconciliation, and operator visibility for remote or asynchronous work.
- MUST avoid infrastructure justified only by hypothetical scale.
- SHOULD favor additive, reversible decisions and isolate irreversible actions behind verification and approval.

## 4. Enforce Security on the Server

- MUST authenticate every protected entry point using trusted server mechanisms.
- MUST authorize each operation against the actual resource, role, scope, ownership, and tenant.
- MUST NOT trust client-supplied identity, role, ownership, tenant, price, status, or permission claims.
- MUST scope data access to the authorized tenant or resource boundary and test cross-tenant identifiers.
- MUST validate and normalize untrusted input at boundaries and enforce business invariants in the owning server operation.
- MUST use parameterized data access and least-privilege identities.
- MUST keep secrets, tokens, credentials, internal errors, inaccessible identifiers, and sensitive data out of client bundles, URLs, logs, traces, analytics, fixtures, and artifacts.
- MUST define rate, quota, replay, upload, redirect, origin, CSRF, content execution, and resource-exhaustion controls according to exposure and impact.
- MUST return safe errors without revealing internal topology or protected resource existence.

## 5. Protect Data and Side Effects

- MUST define data classification, minimization, collection purpose, consent, retention, deletion, export, audit, redaction, backup, and restore behavior where relevant.
- MUST derive transaction boundaries from business atomicity and avoid holding transactions across remote calls.
- MUST define concurrency behavior and expose conflicts instead of silently overwriting state.
- MUST make retryable high-impact actions idempotent and define duplicate, replay, and expiration behavior.
- MUST use a durable delivery pattern when a database commit and external side effect must remain consistent.
- MUST define recovery from partial failure and interrupted processing.
- MUST NOT log request bodies or delivered product content by default.

## 6. Design Stable Contracts

- MUST define input and output types, required and optional fields, defaults, limits, validation, status semantics, errors, pagination, filtering, ordering, precision, identifiers, and time handling.
- MUST use stable machine-readable error codes and structured field errors so clients can provide accessible, actionable feedback.
- MUST distinguish empty success, not found, permission denied, conflict, rate limit, retryable failure, and terminal failure deliberately.
- SHOULD keep public contracts independent of private persistence models.
- MUST define cache and retry semantics.
- MUST bound payloads and use deterministic ordering.
- MUST preserve routes, deep links, browser history, public component interfaces, API fields, event shapes, storage keys, analytics contracts, and automation hooks unless an approved change requires otherwise.

## 7. Evolve Compatibility Safely

- SHOULD prefer additive optional fields, tolerant readers, stable defaults, and explicit deprecation windows.
- MUST support mixed-version readers, writers, clients, and servers during rollout.
- MUST test legacy and new contract shapes.
- MUST use expand-migrate-contract for incompatible schema evolution:
  1. expand with compatible structures;
  2. deploy compatible code;
  3. backfill idempotently in bounded, observable batches;
  4. verify counts and invariants;
  5. transition reads and writes;
  6. remove legacy structures in a separate approved change.
- MUST make migrations restartable and capacity-aware.
- MUST define code, configuration, traffic, and data rollback independently.
- SHOULD prefer forward repair over destructive reverse migration after data has changed.

## 8. Complete Every Experience State

- MUST define initial loading, background refresh, initial empty, filtered empty, partial or stale data, validation error, permission denied, not found, rate limited, offline or degraded, retryable error, terminal error, mutation in progress, success, duplicate action, and session expiry when applicable.
- MUST give each state a clear explanation, available action, recovery rule, focus destination, announcement behavior, and persistence behavior.
- MUST preserve valid input across recoverable errors.
- MUST distinguish no data, no matching results, and failure to load.
- MUST reconcile optimistic updates with authoritative server state.
- MUST prevent duplicate destructive or financial actions while communicating progress and recovery.
- MUST define the visual and interaction behavior of each relevant state; a
  polished happy path does not compensate for an unusable loading, empty,
  error, permission, or conflict path.

## Express Visual Direction as a System

- MUST translate subjective goals such as `premium`, `simple`, `cute`,
  `modern`, and `elegant` into audience- and brand-grounded, testable
  attributes for typography, color, spacing, density, shape, imagery,
  iconography, motion, and content hierarchy.
- MUST keep task clarity, credibility, accessibility, responsive behavior, and
  performance ahead of decorative novelty.
- MUST NOT assume that gradients, glass effects, neon glows, excessive rounded
  cards, decorative blobs, oversized heroes, or motion automatically create a
  premium or modern experience.
- SHOULD use a small, coherent token system and reusable primitives. MUST avoid
  one-off styling whose only rationale is visual variety.
- MUST label a visual direction as a reversible hypothesis when brand assets,
  research, content, or decision ownership is missing. MUST NOT invent a logo,
  research finding, stakeholder preference, or brand history.

## 9. Build Accessible Interfaces

- MUST use semantic HTML and native controls according to purpose before creating custom interaction patterns.
- MUST provide accessible names, labels, descriptions, instructions, error associations, status announcements, and meaningful alternatives for non-text content.
- MUST make all functionality keyboard-operable with visible focus, logical order, predictable focus movement, and no keyboard trap.
- MUST preserve headings, landmarks, lists, tables, reading order, text scaling, zoom and reflow, sufficient contrast, non-color cues, reduced motion, captions or transcripts, and target spacing.
- MUST NOT rely on placeholder text, hover, color, gesture, animation, or time alone to convey essential information.
- MUST combine automated checks with keyboard, focus, screen-reader, zoom, reflow, and task-based review before claiming conformance.
- MUST record the accessibility target and evidence; MUST NOT claim certification from automated tooling alone.
- MUST give animation a functional purpose, keep it interruptible and
  non-blocking, and provide reduced-motion behavior that preserves the same
  information and actions.
- MUST give data visualizations an accessible name and equivalent takeaway or
  data representation; MUST NOT encode meaning through color or hover alone.
- MUST hide decorative icons from assistive technology and give icon-only
  controls an accessible name.

## 10. Build Responsive and Localizable Interfaces

- MUST choose layout changes from content and task constraints rather than named devices.
- MUST verify narrow and wide widths, high zoom, wrapping, long words and translations, overflow, touch and pointer input, virtual keyboards, safe areas, and orientation changes.
- MUST avoid page-level horizontal overflow unless the content requires a documented scroll region.
- SHOULD avoid viewport-locked heights for content and forms.
- MUST preserve content priority and usable reading and focus order through reflow.
- MUST handle locale-aware dates, explicit time zones, numbers, currency, pluralization, right-to-left text, user-generated content, missing media, and extreme values where relevant.
- SHOULD use progressive enhancement for essential tasks and feature-detect optional browser capabilities.

## 11. Protect Frontend Boundaries

- MUST use semantic HTML and resilient CSS as the base even when React,
  Next.js, Tailwind CSS, TypeScript, or another abstraction is selected.
- MUST use the repository's existing rendering, routing, styling, state, form,
  validation, data-fetching, icon, chart, and motion approaches unless an
  authorized change has a demonstrated benefit.
- MUST choose server, URL, local component, form, remote-cache, and global
  client state according to ownership. MUST NOT mirror one authoritative datum
  across stores without explicit synchronization and conflict behavior.
- MUST treat route guards, hidden controls, client session state, and client validation as presentation behavior only.
- MUST keep privileged business rules and protected data access on the server.
- MUST render untrusted content safely and define a sanitization boundary for rich content.
- MUST preserve native navigation, form, focus, keyboard, and history behavior.
- SHOULD keep state local and derived; MUST avoid conflicting sources of truth.
- SHOULD store shareable navigation and filter state in the URL.
- MUST use explicit state transitions when retries, cancellation, conflicts, or concurrency make boolean flags ambiguous.
- SHOULD measure performance before adding memoization, code splitting, caching, or prefetching complexity.
- SHOULD minimize client JavaScript, hydration, global state, and runtime work
  to what the interaction requires.
- MUST enable strict TypeScript and prohibit unbounded `any` by default only
  for a new TypeScript codebase. Existing projects MUST follow their current
  type contract unless a separate migration is authorized; feature work MUST
  NOT silently become a repository-wide type-policy rewrite.

## 12. Build Operable Backends

- MUST preserve the existing runtime. For a genuinely new service, MUST compare
  Node.js, Bun, Go, and Python from workload, libraries, runtime and hosting
  support, concurrency, latency, team ownership, and operations; MUST NOT add a
  language for novelty.
- SHOULD use REST for resource-oriented interoperable contracts. MUST select
  GraphQL only when client-driven graph composition and schema governance
  justify field authorization, cost controls, and batching. MUST select
  WebSocket or another push transport only when a demonstrated real-time or
  bidirectional need justifies connection authentication, reauthorization,
  backpressure, ordering, replay, reconnect, fan-out, and recovery.
- MUST define authentication and authorization separately. Authentication MUST
  NOT be treated as proof that a user may access a resource, tenant, field,
  mutation, subscription, or stored object.
- MUST keep business invariants in the owning server/domain layer rather than routes or clients.
- MUST expose explicit transaction, idempotency, concurrency, timeout, retry, and failure semantics.
- MUST emit privacy-safe structured logs and traces with correlation across boundaries.
- MUST measure relevant latency, traffic, errors, saturation, dependency health, queue lag, retries, data drift, and business outcomes.
- MUST separate liveness from readiness when the platform supports it.
- MUST define alert ownership, actionable thresholds, dashboards, runbooks, recovery, and audit needs according to risk.
- MUST keep health checks cheap and avoid cascading failure through dependency checks.

## Engineer Data from Invariants and Access Paths

- MUST select the datastore from identity, relationships, invariants,
  transactions, access patterns, consistency, volume, growth, retention,
  recovery, residency, and operational ownership rather than familiarity alone.
- SHOULD use PostgreSQL or managed PostgreSQL such as Supabase when relational
  integrity and transactions fit. MUST verify managed identity, Row Level
  Security, connection, backup, storage, and realtime behavior independently.
- MUST use Redis only for a justified cache, ephemeral coordination,
  rate-limit, queue, session, or transient-state need. MUST define durable
  truth, key ownership, TTL, invalidation, eviction, memory bounds, consistency,
  and failure behavior.
- MUST define entity identity, ownership, tenancy, lifecycle, nullability,
  cardinality, time zone, money and precision, deletion, and audit semantics.
- MUST enforce stable invariants with database types, constraints, foreign
  keys, uniqueness, checks, and transactions where supported.
- MUST design indexes from observed or declared predicates, joins, ordering,
  selectivity, cardinality, and write cost. MUST verify material changes with
  representative query plans and latency; MUST NOT add speculative indexes.
- MUST detect N+1 access across ORM relations, REST assemblers, GraphQL
  resolvers, serializers, and loops. MUST use bounded joins, batching,
  preloading, or request-scoped loaders and verify query count and payload
  bounds.
- MUST choose one authoritative schema and migration workflow. When comparing
  Drizzle and Prisma for greenfield TypeScript work, MUST consider SQL control,
  schema ownership, migration review, generated client workflow, database
  feature coverage, runtime support, and team fit; MUST NOT install both merely
  to postpone the decision.

## 13. Verify in Proportion to Risk

- MUST map each acceptance criterion and critical invariant to a test or review method.
- MUST use repository-native format, lint, type, unit, integration, contract, migration, and build checks as applicable.
- MUST test authentication, authorization, ownership, tenant isolation, validation, compatibility, concurrency, idempotency, retries, partial failure, and rollback according to risk.
- MUST inspect the real user-visible path at representative viewport and interaction conditions when tooling and authorization permit.
- MUST distinguish source inspection, automated checks, simulated behavior, local runtime evidence, browser evidence, staging evidence, and production evidence.
- MUST report exact commands, environment, fixtures, routes, viewports, exit results, and sanitized artifacts.
- MUST state skipped or unavailable checks and their impact.
- MUST NOT treat compilation, an HTTP success, a migration command, or an isolated component render as proof of an end-to-end outcome.
- MUST verify the complete affected path from interface and client state through
  server authorization, domain invariants, persistence, integrations,
  rendering, and recovery whenever the acceptance claim spans those layers.

## 14. Coordinate Work Safely

- MUST give each subagent or contributor a bounded task, allowed files and systems, required context, constraints, and a precise output contract.
- MUST avoid concurrent edits to the same files, schemas, migrations, or public contracts.
- MUST require raw evidence such as paths, commands, logs, screenshots, contract excerpts, or test results.
- MUST reconcile contradictions against primary evidence and review all delegated changes before integration.
- MUST retain cross-boundary, security, compatibility, and final outcome ownership with the lead agent.
- MUST prohibit unapproved production changes, deployment, migration, dependency replacement, secret access, and scope expansion.

## 15. Use a Standard Completion and Output Contract

Declare work complete only when:

- the requested observable outcome works through the real path;
- trust boundaries and business invariants are enforced server-side;
- compatibility, migration, rollout, and rollback are safe or explicitly not applicable;
- loading, empty, error, permission, degraded, and success states are complete;
- accessibility, responsive behavior, localization, privacy, performance, reliability, and operability are addressed according to risk;
- relevant verification passes with reproducible evidence; and
- items marked `not_run` or `blocked`, residual risks, approval gates, and
  follow-up owners are explicit.

For an authorized implementation, deliver complete runnable code for the
declared slice. MUST NOT leave TODOs, ellipses, placeholder screens, fake API
responses, fake credentials, invented schemas or business values, or no-op
handlers in a path claimed complete. Surface a required unavailable input as an
explicit dependency or blocker.

Return:

1. the delivered outcome and affected flow;
2. changed artifacts and their purpose;
3. important decisions and tradeoffs;
4. security, compatibility, state, accessibility, responsive, and operational behavior;
5. exact verification evidence;
6. items marked `not_run` or `blocked`, residual risks, and follow-up owners; and
7. deployment, migration, restart, or live-data actions as proposals unless explicitly authorized.
