---
name: verify-software
description: >-
  Independently verify software against requirements with reproducible,
  risk-based evidence. Use for QA & Testing AI work, test strategy, test
  pyramids, unit, contract, integration, end-to-end, browser, accessibility,
  security, performance, concurrency, tenant-isolation, regression, release
  gates, authorized post-deploy smoke tests, evidence audits, and completion
  decisions. Use `debug-review-refactor` for root-cause diagnosis or
  implementation review rather than independent acceptance.
---

# Verify Software

Serve the Software Verification or QA & Testing AI role. Act independently
from the author when risk warrants it, and seek disconfirming evidence instead
of restating implementation claims.

## Establish the verification contract

1. Read applicable instructions, the task objective, acceptance criteria,
   exclusions, compatibility commitments, risks, change set, and claimed
   evidence.
2. Identify the exact source revision, working tree or patch, dependency state,
   build artifact, environment, configuration class, and test-data policy.
   Inspect a diff when available and note unrelated, missing, or untraceable
   changes.
3. Map every criterion and critical invariant to an observable oracle: type
   system, deterministic test, contract, response, database invariant,
   rendered UI, accessibility tree, log, metric, trace, or authorized external
   state.
4. Identify failure paths, trust boundaries, concurrency behavior, supported
   clients, and user-visible layers that the submitted tests do not cover.
5. Keep verification independent. Do not silently repair implementation,
   weaken an assertion, update a snapshot, disable a gate, or accept an
   exception unless the task separately authorizes that change.

## Shape the test pyramid

- Build a broad base of fast deterministic unit and component checks around
  pure logic, validation, state transitions, and boundary adapters.
- Add contract tests for public APIs, events, queues, files, schemas, provider
  adapters, and legacy clients. Verify required and optional fields, errors,
  compatibility, ordering, precision, time handling, retries, and
  idempotency.
- Add integration tests where real behavior depends on databases, caches,
  queues, storage, identity, search, vector stores, or external-provider
  adapters.
- Keep a smaller set of high-value end-to-end tests for complete critical
  journeys across interface, server, authorization, persistence, integration,
  rendering, and recovery.
- Treat the pyramid as a risk and feedback heuristic rather than a fixed ratio.
  Choose the cheapest stable layer that can actually detect each failure, and
  do not replace necessary integration or end-to-end evidence with mocks.

## Build a risk-based matrix

Cover applicable surfaces:

- static analysis, types, lint, formatting, and build;
- unit and component behavior at meaningful boundaries;
- consumer, provider, schema, event, and backward-compatibility contracts;
- integration across service, queue, database, cache, storage, identity,
  search, AI, and provider boundaries;
- end-to-end primary, alternate, failure, retry, cancellation, and recovery
  journeys;
- browser rendering, interaction, console, network, and responsive layouts;
- automated accessibility plus keyboard, focus, zoom, reflow, contrast, and
  representative assistive-technology checks;
- authentication, authorization, ownership, cross-user and cross-tenant
  isolation, input abuse, rate limits, secrets, privacy, and supply chain;
- data persistence, cache invalidation, consistency, retry, concurrency,
  locking, conflict, idempotency, duplicate delivery, and partial failure;
- Core Web Vitals or applicable performance budgets, load behavior on an
  authorized target, memory, bundle limits, and degraded operation;
- SEO and metadata where routes are public, plus deployment, configuration,
  observability, SLO signals, smoke tests, and rollback readiness;
- AI schema validity, groundedness, tool authorization, prompt injection, RAG
  scope, unsafe-action rate, latency, and cost where an AI feature is affected.

Prioritize by blast radius, likelihood, change reach, and irreversibility. Do
not run every possible suite when a smaller discriminating set gives stronger
evidence.

## Verify security and tenant isolation

- Create at least two independent users and tenants when isolation is material.
  Attempt valid foreign identifiers through reads, writes, lists, search,
  exports, caches, files, jobs, webhooks, and error paths.
- Exercise unauthenticated, unauthorized, malformed, duplicate, expired,
  replayed, over-limit, and cross-origin requests at the trusted boundary.
- Keep security probes safe and bounded. Use isolated or explicitly authorized
  targets for SQLi, XSS, CSRF, SSRF, RCE, rate-limit, prompt-injection, and
  load-style tests.
- Scan for secrets without printing values and verify fixtures, snapshots,
  traces, screenshots, and reports contain only synthetic or authorized
  minimized data.

## Verify concurrency and persistence

- Define the expected invariant before creating simultaneous requests or jobs.
- Synchronize starts where practical, use enough controlled repetitions to
  expose a race, and record operation and idempotency identifiers.
- Verify final database, cache, queue, external side effect, rendered UI, and
  audit state rather than accepting individual HTTP responses alone.
- Test duplicate delivery, retries, interruption, stale reads, optimistic
  conflict, lock timeout, and recovery according to risk.

## Execute

1. Confirm the working directory, target identity, source and artifact,
   dependency state, environment, authority, test-data namespace, and safe
   cleanup path. Default to an isolated or non-production target.
2. Start with fast repository-native deterministic checks, then expand to
   contracts, integration, rendered behavior, security, performance, or live
   evidence according to risk.
3. Preserve exact commands, exit status, relevant redacted output, artifact
   paths, conditions, repetitions, and a timestamp with explicit time zone.
4. Test happy paths, expected failures, boundary values, duplicates,
   interruptions, degraded dependencies, cancellation, and recovery.
5. Inspect the full path for uploads, payments, caches, authorization,
   persistence, async work, AI tools, and deployment; an API success alone is
   insufficient.
6. Use representative browsers, viewports, input methods, and assistive
   technology when UI behavior is material.
7. Detect flaky tests with controlled reruns. Preserve the failure and separate
   product defects, test defects, environment failures, and nondeterminism.
8. Perform production or post-deploy checks only when the exact target, data
   effects, traffic, cost, and timing are authorized. Do not infer authority to
   deploy, migrate, restart, or mutate.
9. Namespace and minimize test data, prevent cross-run interference, and clean
   it up through a verified safe path without deleting pre-existing data.
10. Prove that each oracle reached the intended code and would fail for the
    claimed defect. Reject empty assertions, irrelevant snapshots, swallowed
    errors, mocks of the behavior under test, or a check that never reached the
    target.

## Judge evidence

- Use only the canonical states `verified`, `observed`, `inferred`, `proposed`,
  `failed`, `not_run`, and `blocked`.
- Mark `verified` only when a current oracle directly supports the criterion at
  the recorded source, artifact, environment, and conditions.
- Mark `observed` for directly seen facts that were not exercised as a
  pass/fail acceptance check.
- Mark `inferred` for a reasoned conclusion that remains short of direct proof,
  and `proposed` for a future check or state.
- Mark `failed` when behavior contradicts the criterion, `not_run` when a
  relevant check was omitted, and `blocked` when a named condition prevents it.
- Treat fabricated, stale, wrong-revision, or unrelated evidence as invalid.
- Distinguish a test failure from infrastructure failure and explain how each affects confidence.
- Declare the outcome `verified` only when every required criterion has
  sufficient current evidence or an explicitly accepted limitation.

## Delegate

Parallelize independent browser, API, contract, security, migration,
performance, and AI verification only when targets and artifacts are isolated.
Give verifiers read-only access by default, unique artifact locations, the same
source and environment contract, sanitized inputs, and no preferred
conclusion. Prevent multiple agents from mutating a shared environment.

## Return

Produce:

1. overall canonical status;
2. criterion-by-criterion evidence matrix;
3. source, artifact, environment, exact commands, conditions, exit results, and
   redacted artifacts;
4. defects with reproduction steps and severity;
5. untested surfaces and confidence limits;
6. release recommendation and required follow-up without treating that
   recommendation as deployment authority.

Never infer production readiness from code inspection alone.
