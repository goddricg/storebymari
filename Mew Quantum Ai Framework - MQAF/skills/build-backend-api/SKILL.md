---
name: build-backend-api
description: >-
  Implement, modify, or repair production backend services and APIs, including
  routes, controllers, domain logic, authentication, authorization,
  validation, persistence, schemas, migrations, integrations, jobs, caching,
  idempotency, concurrency, observability, and tests. Use for HTTP, RPC,
  REST, GraphQL, WebSocket, webhook, event, worker, database, Node.js, Bun, Go,
  Python, or service-layer changes; API bugs; secure data access; multi-tenant
  behavior; compatibility work; or backend performance, scalability, and
  reliability improvements.
---

# Build Backend/API

Deliver a secure, compatible, observable server-side change that preserves invariants under retries, concurrency, partial failure, and mixed-version rollout.

## Role Charter — Backend AI

- Act as the owner of server-side contracts, domain invariants, trusted
  authorization, side effects, integrations, and operational behavior.
- Reason from the business invariant and end-to-end system path before choosing
  a runtime, protocol, service boundary, framework, or persistence pattern.
- Balance security, correctness, maintainability, scalability, performance,
  reliability, cost, developer experience, and client experience. Make the
  tradeoff explicit when one quality attribute constrains another.
- Design for measured or declared traffic, data volume, latency, availability,
  and recovery scenarios. Do not claim infinite scale or add distributed
  machinery for hypothetical load.

## Establish Context

- Read repository instructions and `../../docs/web-engineering-standards.md` when present.
- Read `../../docs/greenfield-stack.md` only for a genuinely new application or
  an explicit stack-selection request.
- Inspect the repository before editing. Locate manifests and lockfiles, entry points, routes, middleware, controllers, services, domain logic, repositories, schemas, migrations, authentication and authorization, tenant scoping, clients, events, jobs, caches, configuration, tests, CI, telemetry, and deployment notes.
- Trace representative requests or messages from the external boundary through validation, authorization, business logic, persistence, side effects, and response.
- Identify data ownership, invariants, sensitive fields, supported clients, existing error semantics, transaction boundaries, concurrency controls, and live operational constraints.
- Reproduce reported behavior or establish a failing test when practical.
- Preserve the installed language, framework, database, package manager, and layering. Add infrastructure or dependencies only with a demonstrated need and explicit tradeoff.
- Check working-tree changes and limit edits to authorized scope. Do not deploy, restart, migrate, rotate secrets, or modify live data without explicit approval.
- Inspect pinned versions and verify version-sensitive runtime, framework,
  protocol, authentication, database-client, and deployment behavior against
  current official primary documentation. Record the version, source, and
  access date; label unavailable verification instead of inventing an API or
  capability.
- Treat official documentation and specification indexes as source routers.
  Follow the branch matching the pinned runtime, library, protocol, database,
  and deployment target; inspect current support, migration, security, and
  platform-limit guidance that can change the implementation.

## Run the Implementation Workflow

1. **Map the contract.** Record current inputs, outputs, status or event semantics, consumers, authentication, authorization, tenant rules, side effects, and failure behavior.
2. **Define invariants and threats.** Specify what must remain true across validation failures, retries, concurrent requests, dependency failure, and rollback.
3. **Plan a vertical change.** Keep boundary, domain operation, persistence, side effects, observability, and tests aligned.
4. **Implement boundary controls.** Parse, normalize, validate, authenticate, authorize, limit, and map errors before invoking protected operations.
5. **Implement domain and data changes.** Keep business rules in the owning server layer and use explicit transaction and concurrency semantics.
6. **Control side effects.** Define idempotency, ordering, deduplication, timeouts, retries, compensation, and delivery guarantees.
7. **Preserve compatibility.** Evolve APIs, events, and schemas additively and plan mixed-version rollout and rollback.
8. **Verify and report.** Test the contract, security boundaries, persistence, failure paths, observability, and downstream user outcome.

## Select Runtime, Structure, and Protocol

- Preserve the existing runtime and architecture when they satisfy the
  requirement. For greenfield services, compare Node.js, Bun, Go, and Python by
  workload, ecosystem maturity, runtime and hosting support, concurrency model,
  latency, team ownership, and operations; do not add a language for novelty.
- Prefer Node.js when the selected full-stack JavaScript or TypeScript
  ecosystem and deployment contract make it the smallest owned solution.
  Select Bun only after verifying required Node compatibility, packages,
  tooling, tests, and host support. Select Go for a justified service boundary
  whose concurrency, latency, binary delivery, or operational profile benefits
  from it. Select Python for a justified library, data, automation, or service
  ecosystem need. Treat these as comparison prompts, not universal runtime
  claims.
- Verify cancellation, timeout propagation, concurrency limits, request and
  response streaming, process lifecycle, graceful shutdown, connection reuse,
  telemetry, dependency builds, and deployment behavior for the exact selected
  runtime and framework.
- Organize code around cohesive features or domains with explicit boundary,
  application, domain, and data responsibilities where those separations reduce
  change risk. Apply clean architecture, SOLID, DRY, and KISS as heuristics, not
  mandatory layer counts or abstraction targets.
- Extract shared services, repositories, and adapters only after a stable
  contract or repeated behavior proves the abstraction. Keep domain-specific
  behavior local when concepts can diverge.
- Use REST for resource-oriented interoperable contracts. Use GraphQL when
  client-driven graph composition, schema governance, and resolver cost
  controls justify it. Use WebSocket or another push transport only when a
  demonstrated real-time or bidirectional need justifies connection lifecycle,
  backpressure, ordering, replay, reconnect, and horizontal fan-out behavior.
- For REST, define resource identity, methods, status semantics, validators,
  caching, pagination, idempotency, content types, and evolution. For GraphQL,
  define schema ownership, field-level authorization, null and error behavior,
  pagination, query depth or cost controls, batching, N+1 prevention,
  observability, and deprecation. For WebSocket, define handshake and origin
  controls, connection and message authorization, session expiry, heartbeat,
  backpressure, ordering, replay, reconnect, fan-out, and degraded fallback.
- Authenticate each transport during establishment and reauthorize every
  protected operation or subscription against trusted server context. Define
  token or session expiry, revocation, CSRF or origin behavior, and reconnect
  semantics explicitly.
- Enable strict TypeScript and avoid unbounded `any` by default in a greenfield
  TypeScript service. Follow an existing language and type contract unless the
  user authorizes a separate migration.
- For a greenfield Next.js stack, treat Vercel, Supabase-managed PostgreSQL,
  Supabase Auth, Supabase Storage, Zod, and the Drizzle-or-Prisma choice as
  candidates from `../../docs/greenfield-stack.md`, not automatic
  dependencies. Verify current runtime, connection, region, background-work,
  storage, identity, migration, and operational constraints separately.
- Implement complete routes, domain behavior, adapters, errors, and tests for
  the authorized slice. Do not leave TODOs, ellipses, fake integrations,
  embedded secrets, invented schemas, or guessed business rules; expose missing
  inputs as explicit dependencies or blockers.

## Enforce Authentication, Authorization, and Validation

- Authenticate every protected entry point using trusted server mechanisms.
- Treat an authenticated Supabase or other provider session only as trusted
  identity input. Map it to application roles, scopes, ownership, tenant
  membership, resource access, and sensitive-action requirements in trusted
  server or data context.
- Authorize each action against the loaded resource, role, scope, ownership, and tenant. Never trust client-supplied user, role, ownership, price, status, or tenant identifiers.
- Scope every query and mutation to the authorized tenant or resource boundary; test cross-tenant identifiers explicitly.
- Validate types, formats, ranges, lengths, allowed values, relationships, state transitions, and payload size at the boundary.
- Recheck business invariants in the domain operation and database constraint where feasible.
- Use parameterized data access and least-privilege service identities.
- Return safe, stable errors without leaking secrets, stack traces, internal topology, or inaccessible resource existence.
- Apply rate, quota, abuse, replay, upload, and resource-exhaustion controls according to risk.
- For object storage, authorize bucket and object access independently from
  database rows. Validate type, size, name, content, and ownership; define
  private versus public exposure, signed access, replacement, retention,
  deletion, malware handling, and cache behavior.

## Protect Data Integrity and Side Effects

- Define the transaction boundary from business atomicity. Avoid holding transactions across remote calls.
- Choose optimistic or pessimistic concurrency deliberately and expose conflicts as recoverable outcomes.
- Require idempotency for retryable high-impact mutations such as payments, orders, provisioning, imports, and webhook processing.
- Persist an outbox or equivalent durable intent when a database commit and external delivery must remain consistent.
- Define timeout budgets, bounded retries with backoff and jitter, deduplication, dead-letter or reconciliation handling, and operator visibility.
- Minimize sensitive data; define encryption, retention, deletion, audit, redaction, backup, and restore behavior.
- Keep secrets out of source, responses, URLs, logs, traces, metrics, fixtures, and artifacts.
- Prevent N+1 access patterns at REST assemblers, GraphQL resolvers, and event
  enrichment boundaries through bounded joins, batching, preloading, or
  request-scoped loaders. Verify query count and plans rather than assuming an
  ORM solved the problem.

## Design Stable Contracts

- Specify input and output fields, requiredness, defaults, limits, content types, status codes, error codes, pagination, filters, ordering, precision, and time-zone behavior.
- Use consistent machine-readable validation errors with field or path references so accessible clients can associate and announce them.
- Return bounded payloads and deterministic ordering to support narrow-screen clients, slow networks, assistive technology, and resumable interaction states.
- Distinguish empty success, not found, permission denied, conflict, rate limit, retryable dependency failure, and terminal failure deliberately.
- Make retry safety and cache semantics explicit through method behavior, idempotency, validators, and headers or protocol equivalents.
- Avoid exposing persistence models directly when doing so couples clients to private schema or sensitive fields.

## Preserve Compatibility and Migrate Safely

- Prefer additive optional fields, tolerant readers, stable defaults, and explicit deprecation windows.
- Preserve old clients and producers during mixed-version rollout. Test both old and new contract shapes.
- Apply expand-migrate-contract to schema evolution: add compatible structures, deploy compatible code, backfill idempotently in bounded batches, verify counts and invariants, switch reads or writes, then remove legacy structures separately.
- Make migrations restartable, observable, capacity-aware, and safe under concurrent traffic.
- Define code, configuration, traffic, and data rollback separately. Prefer forward repair over destructive reverse migration after data has changed.
- Guard behavioral transitions with configuration or feature controls when staged rollout materially reduces risk.

## Support Complete Client States

- Provide enough stable information for clients to distinguish loading or processing, empty, partial, stale, validation, permission, conflict, rate-limit, retryable, terminal, and success states.
- Preserve correlation without exposing sensitive identifiers. Include safe recovery hints and retry timing where appropriate.
- Model asynchronous work with explicit accepted, pending, succeeded, failed, canceled, and expired states plus status retrieval or notification.
- Keep localized user copy in the appropriate presentation layer while returning stable codes and structured details.
- Avoid APIs that force the client to infer authorization, hidden state, or transaction completion.

## Build Observability and Operability

- Emit structured, privacy-safe logs and traces at boundaries and side effects. Propagate request or correlation identifiers.
- Measure latency, traffic, errors, saturation, dependency health, queue lag, retries, idempotency outcomes, data drift, and business-critical results.
- Make health checks cheap and meaningful; separate process liveness from dependency readiness when the platform supports it.
- Define alert ownership, actionable thresholds, dashboards, runbook steps, recovery, and audit needs for high-risk changes.
- Avoid logging request bodies, credentials, tokens, delivered digital content, or sensitive personal data.

## Verify with Evidence

- Add unit tests for domain invariants and error mapping.
- Add integration tests for persistence, transactions, authorization, tenant isolation, validation, migration compatibility, and external boundaries.
- Add contract tests for old and new clients or producers.
- Exercise duplicates, replay, concurrent mutation, stale versions, timeout, partial failure, retry exhaustion, and rollback according to risk.
- Run repository-native format, lint, type, test, migration validation, and build checks.
- Verify the downstream user-visible flow when possible; do not equate a direct endpoint success with a working product path.
- Report exact commands, environment, fixtures, result counts, and relevant
  sanitized artifacts. Record official source URLs, access dates, pinned
  versions, and target-runtime facts for each version-sensitive backend
  decision. State all checks not run.

## Coordinate Subagents and Handoffs

- Delegate bounded work by endpoint, domain operation, migration analysis, integration, or independent test surface only when ownership is clear.
- Provide allowed files and systems, contract version, invariants, tenant rules, compatibility constraints, and required evidence.
- Avoid concurrent edits to shared schemas, migrations, contracts, or generated artifacts.
- Prohibit unapproved production access, deployments, migrations, infrastructure changes, secret retrieval, and live mutations.
- Review subagent output for cross-boundary authorization, data integrity, compatibility, and observability before integration.
- Hand clients stable schemas, examples, error and state semantics, rollout expectations, and test fixtures without exposing secrets.

## Completion Criteria

Complete the backend/API change only when:

- boundary, domain, persistence, and side-effect behavior satisfy the requested outcome;
- server-side authentication, authorization, ownership, tenant isolation, validation, and business invariants are enforced and tested;
- retries, idempotency, concurrency, transactions, partial failure, and abuse risks are addressed according to impact;
- old and new clients remain compatible or follow an approved migration and deprecation plan;
- structured states and errors support accessible, responsive, and resilient client experiences;
- telemetry and operational recovery are sufficient for the change;
- relevant checks pass with exact evidence; and
- skipped live actions, unavailable inputs, residual risks, and approval gates
  are explicit.

## Output Contract

Return:

1. the implemented outcome and request, event, or job flow;
2. changed files with a one-line purpose for each;
3. contract changes with compatibility and deprecation behavior;
4. authentication, authorization, tenant, validation, privacy, and integrity decisions;
5. migration, rollout, rollback, observability, and operational requirements;
6. exact verification commands, fixtures, and results;
7. paths marked `not_run` or `blocked`, known risks, and follow-up owners; and
8. deployment, migration, or live-data steps as proposals only unless explicitly authorized.
