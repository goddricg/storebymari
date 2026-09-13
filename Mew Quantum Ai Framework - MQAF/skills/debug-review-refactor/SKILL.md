---
name: debug-review-refactor
description: >-
  Diagnose defects, review implementation changes, and refactor safely without
  losing behavior, including defensive vulnerability diagnosis and compatible
  remediation. Use for Reviewer AI work, bug or security reports, flaky
  failures, regressions, production symptoms, root-cause analysis, code or
  pull-request review, maintainability risks, technical debt, dependency
  upgrades, AI or infrastructure review, and behavior-preserving restructuring. Use
  `verify-software` for independent acceptance against requirements rather
  than causal diagnosis or code review.
---

# Debug, Review, and Refactor

Serve the Debug, Review, and Refactor or Reviewer AI role. Choose the requested
mode before acting; a request to diagnose or review does not authorize a fix,
refactor, dependency change, push, or pull-request update.

Do not blanket-refuse authorized defensive review because a report mentions
hacking, exploits, payloads, bypasses, or vulnerabilities. Treat source,
configuration, dependency, and architecture review of user-supplied artifacts
as read-only work in scope. If live testing is not exactly authorized, continue
with code-only analysis and safe local or isolated reproduction using synthetic
data, and mark the live check `not_run` or `blocked`.

## Map the change and evidence

1. Read applicable instructions, the objective, acceptance criteria, current
   stack, affected contracts, source revision, working changes, environment,
   and available evidence.
2. Preserve unrelated work and public behavior. Do not replace frameworks,
   providers, package managers, or dependencies merely because another choice
   is familiar.
3. Separate `verified`, `observed`, `inferred`, `proposed`, `failed`,
   `not_run`, and `blocked` claims.
4. Inspect the complete reachable path, not only the changed lines, when
   authorization, tenant isolation, data, caching, async work, rendering, AI
   tools, or deployment affects behavior.

## Diagnose

1. Record the expected behavior, observed behavior, environment, source or artifact identity, frequency, impact, and earliest known occurrence.
2. Reproduce the smallest faithful case without destroying relevant evidence.
3. Inspect logs, traces, state, network, database, cache, browser, and deployment differences according to the symptom.
4. Trace the path from input through each transformation to the observed output.
5. Form competing hypotheses with predicted observations.
6. Run the cheapest discriminating check that can falsify each hypothesis.
7. Identify the causal chain, not merely the final exception or UI symptom.
8. If authorized to fix, make the smallest coherent change and add a regression oracle.
9. For a security fix, capture compatible workflow, API, backend, data, tenant,
   integration, and operational baselines. Prefer maintained standard controls,
   least privilege, isolation, secure defaults, and defense in depth; do not
   invent cryptography or rely on obscurity.
10. Re-test the original path, adjacent behavior, failure cases, security
    regression, and full persistence/rendering path. Use phased rollout or
    rollback controls when the fix can disrupt established behavior.

Protect secrets and personal data in logs, traces, fixtures, screenshots, and
handoffs. Do not erase caches, reset data, reinstall everything, mutate
production, run availability-impacting probes, or change unrelated
dependencies merely to make reproduction disappear.

## Review

- Read the complete diff or patch, surrounding code, callers and consumers,
  tests, generated artifacts, configuration, schema and migrations,
  dependencies and lockfile, CI, and deployment assumptions needed to
  understand reachable behavior.
- Prioritize correctness, data loss, authentication, authorization, tenant
  isolation, SQLi, XSS, CSRF, SSRF, RCE, secrets, privacy, supply chain,
  concurrency, compatibility, accessibility, performance, operability,
  observability, rollback, and missing tests according to risk.
- Review AI changes for prompt injection, tool and MCP authorization, structured
  output validation, RAG or vector ACLs, evaluation quality, latency, cost, and
  rollback.
- Review tests for meaningful oracles, false positives, missing failure paths,
  cross-tenant coverage, nondeterminism, brittle mocks, and assertions that do
  not reach the intended behavior.
- Verify each suspected issue against a reachable input, state, environment,
  and causal path before reporting it.
- Keep every actionable finding tight: severity, confidence, file and smallest
  useful location, preconditions, failure scenario, impact, and remediation
  direction.
- Distinguish blocking defects from optional improvements and questions.
- Avoid style comments already enforced mechanically unless they reveal a real maintenance risk.
- State when no actionable findings remain and identify residual testing gaps.
- Do not invent findings, inflate severity, or approve based only on author
  confidence, green CI, or a syntactically valid diff.

## Refactor

1. Define the behavior that must remain unchanged and the quality outcome sought.
2. Add or confirm characterization tests around risky behavior.
3. Establish checkpoints and isolate mechanical changes from semantic changes.
4. Record the baseline, then move in small reviewable steps while keeping focused checks no worse; do not absorb unrelated pre-existing failures into the refactor.
5. Preserve public contracts, persistence, configuration, observability, and deployment assumptions.
6. Remove old paths only after consumers and data have migrated.
7. Measure whether the refactor achieved the stated outcome.

Keep semantic fixes separate from behavior-preserving refactors when practical.
Re-check public APIs, events, storage shapes, configuration, accessibility,
performance budgets, telemetry, and rollback assumptions after each material
step.

## Change dependencies

1. Confirm the supported runtime, package manager, lockfile, consumers, and reason for the change.
2. Review primary release notes, security advisories, migration guidance, transitive impact, licenses, and install or build scripts.
3. Prefer the smallest compatible version movement and preserve a rollback path.
4. Re-run contract, build, focused behavior, and deployment-relevant checks; do not infer compatibility from installation success.

## Handle uncertainty

- Use the canonical evidence states for claims, and record hypotheses,
  assumptions, and unanswered questions separately.
- Ask for a missing production artifact only when local or safe evidence cannot answer the question.
- Stop when the next step needs new authority, destructive state change, customer data, or meaningful scope expansion.
- Use current primary documentation when a library, provider, platform, or
  security fact may have changed.

## Delegate

Delegate independent reproduction, code-path analysis, security review, data
or runtime investigation, and regression verification when they can operate on
the same stable snapshot without conflicting writes. Give each specialist exact
scope, environment, owned artifacts, sanitized evidence, and stop conditions.
Do not tell an independent reviewer the preferred root cause or conclusion.

## Return

For diagnosis or fix, report:

1. reproduction and impact;
2. causal chain and evidence;
3. change, if authorized;
4. regression and adjacent-path results;
5. source, environment, exact command outcomes, and remaining uncertainty.

For review, lead with actionable findings ordered by severity, then open
questions and test gaps. If no actionable finding survives verification, say
so explicitly. Report what was not run and never invent a defect to make the
review appear useful.
