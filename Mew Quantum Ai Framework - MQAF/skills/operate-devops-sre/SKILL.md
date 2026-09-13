---
name: operate-devops-sre
description: >-
  Design, automate, release, observe, and recover reliable software services.
  Use for DevOps AI or SRE work involving Git and GitHub, CI/CD, Docker,
  infrastructure as code, Vercel, Cloudflare, edge, CDN, serverless, caching,
  environments, operational secrets, releases, canaries, rollbacks,
  observability, SLOs, capacity, incidents, runbooks, one-command auditable
  delivery, production operations, or readiness. Use `debug-review-refactor`
  for code-level root-cause analysis and `verify-software` for independent
  release acceptance.
---

# Operate DevOps and SRE

Serve the DevOps and SRE or DevOps AI role. Make delivery repeatable,
observable, least-privileged, auditable, and recoverable. Treat a source push,
green CI job, or provider dashboard label as insufficient proof that the
intended artifact serves the user.

## Inspect the operating context

1. Read applicable instructions and identify repository boundaries, Git state,
   source revision, artifact flow, environments, runtime, dependencies,
   ownership, and the current delivery mechanism.
2. Inspect existing Git and GitHub conventions, branch protections, workflows,
   package manager, Dockerfiles, infrastructure code, Vercel or Cloudflare
   configuration, runbooks, health checks, dashboards, and rollback paths.
3. Preserve the current stack, provider, regions, runtime, package manager, and
   deployment architecture unless the requested outcome requires a change and
   evidence supports it.
4. Establish critical journeys, failure domains, service-level indicators
   (SLIs), service-level objectives (SLOs), error-budget policy, recovery time
   objective, recovery point objective, and data durability needs in proportion
   to product risk.
5. Separate local, CI, preview, staging, canary, and production facts. Record
   which environment and artifact each observation actually covers.
6. Confirm the exact action, target, environment, scope, and timing before any
   external mutation, production access, spending, traffic or DNS change,
   secret change, migration, rollback, or destructive operation.

## Control Git and GitHub delivery

- Inspect status, branch, diff, revision, remotes, protections, required checks,
  release tags, and existing user changes before preparing a commit or release.
- Keep commits scoped and traceable. Preserve unrelated work and avoid history
  rewrites, force pushes, broad branch changes, or generated-file churn unless
  explicitly authorized.
- Treat pushes, pull requests, releases, tags, repository settings, secrets,
  environments, approvals, and notifications as external mutations that need
  task authority.
- Give GitHub Actions and other CI identities minimum permissions. Pin reusable
  workflows and third-party actions according to policy, isolate untrusted fork
  input, and never expose protected secrets to untrusted code.
- Record source revision, workflow definition, dependency lock, build inputs,
  artifact digest, approvals, actor, target, and result.

## Build the delivery path

- Produce immutable, traceable artifacts from a reproducible build.
- Pin dependencies and record provenance in proportion to risk. Produce and
  retain an SBOM or attestation when release policy requires it.
- Keep configuration outside artifacts and secrets inside an approved secret manager.
- Use least-privileged identities separated by environment and purpose.
- Gate changes with repository-native format, type, lint, test, contract,
  security, dependency, migration, build, artifact-integrity, and policy checks
  according to risk.
- Create ephemeral previews or safe staging paths where practical.
- Make workflow retries idempotent and concurrency-safe.
- Store deployment state, approval, revision, artifact identity, and actor.
- Keep CI and deployment caches keyed by relevant source, lockfile, runtime,
  architecture, and build inputs. Verify cache restoration cannot cross trust
  boundaries or smuggle stale or poisoned artifacts.

## Provide one auditable delivery entry point

- Prefer one repository-native command or workflow entry point that validates
  prerequisites, selects an explicit environment, builds once, identifies the
  immutable artifact, requests or verifies required approvals, deploys that
  artifact, runs target checks, and prints a redacted evidence summary.
- Make the safe default a dry run, preview, or non-production target when the
  repository contract permits it. Require an explicit production selector and
  a recorded approval; never hide a permission gate behind one command.
- Make each stage independently visible and fail closed. Return nonzero on
  failure, preserve logs and artifact identity, and keep reruns idempotent.
- Reuse existing scripts and provider workflows. Do not invent a deployment
  command, bypass manual approvals, or replace a proven stack merely to satisfy
  the phrase "one command."

## Build and run containers safely

- Use multi-stage builds and the smallest maintained base compatible with the
  application. Pin images according to policy and rebuild for security fixes.
- Run as a non-root user, minimize Linux capabilities, set a read-only
  filesystem when feasible, isolate writable paths, and exclude source secrets
  and unnecessary files from build context and layers.
- Use build-time secret mounts or the platform's secret mechanism instead of
  build arguments or copied credential files.
- Define explicit startup, graceful shutdown, health, resource, and signal
  behavior. Test the image that will be released and record its digest.
- Scan images and dependencies in proportion to risk, validate findings, and
  preserve provenance.

## Engineer Vercel, Cloudflare, edge, CDN, and serverless paths

- Inspect the project's actual Vercel, Cloudflare, or other provider topology
  before changing it. Verify current official provider documentation for
  runtime, region, routing, cache, size, duration, and rollback behavior.
- Distinguish build-time, edge, serverless, worker, browser, and origin
  configuration. Keep secrets and server-only variables out of client bundles
  and public metadata.
- Design for ephemeral filesystems, cold starts, execution and payload limits,
  regional data access, connection reuse, background-work guarantees, and
  provider retries.
- Define CDN cache keys, authorization and tenant variation, `Cache-Control`,
  `Vary`, freshness, stale behavior, revalidation, purge, and rollback.
  Prevent personalized or sensitive responses from entering shared caches.
- Treat DNS, domains, certificates, WAF, bot rules, rate limits, redirects,
  traffic splitting, edge configuration, cache purges, and provider project
  settings as externally visible gated mutations.
- Verify preview-to-production differences, effective runtime configuration,
  deployed revision or digest, route behavior, headers, cache status,
  persistence, and provider integrations on the authorized target.

## Release safely

1. Validate dependency install, build, migration order, runtime configuration, and startup behavior in the target-like environment.
2. Plan data compatibility, migration, backup or checkpoint, forward repair,
   and rollback separately. Execute gated data actions only with exact approval
   and verified recoverability.
3. Prefer progressive delivery, canary, blue/green, feature flags, or a bounded
   rollout when risk warrants it.
4. Monitor technical signals, SLO burn, security signals, and critical user
   journeys during rollout.
5. Define stop, rollback, and escalation thresholds before changing traffic.
6. Run authorized post-deploy smoke tests against the real target and verify
   revision or digest, content, headers, caches, persistence, queues, and
   integrations.
7. Record limitations and the exact recovery path, owner, and evidence.
8. Verify the deployed artifact and effective configuration rather than
   trusting a pipeline label.

## Build observability and SLOs

- Correlate requests, jobs, deployments, and tool activity with stable identifiers.
- Capture privacy-safe logs, metrics, and traces for latency, traffic, errors,
  saturation, availability, queue depth, cache behavior, dependency health,
  deployment markers, and business-critical success.
- Use structured logs with secret and personal-data redaction.
- Build actionable alerts tied to user impact and an owned response.
- Define SLIs from the user journey, set realistic SLO windows and objectives,
  and use error-budget burn alerts where service maturity warrants them.
- Avoid high-cardinality identifiers and sensitive payloads in telemetry.
- Test dashboards, alert routing, and runbook links with controlled signals.

## Plan capacity and resilience

- Model expected and peak demand, resource headroom, quotas, dependency limits, and growth assumptions.
- Load-test only an isolated or explicitly authorized target with bounded traffic, stop conditions, and representative workloads.
- Define autoscaling bounds, overload behavior, queue backpressure, load shedding, and graceful degradation.
- Exercise failover and recovery for material failure domains without assuming redundancy from configuration alone.

## Respond to incidents

1. Preserve evidence and establish an incident timeline.
2. Assess impact and contain further harm.
3. Restore service through the lowest-risk reversible action.
4. Verify recovery from the user's path, not only a process-health signal.
5. Diagnose the causal chain after containment.
6. Write a blameless postmortem with owned, prioritized, and time-bounded prevention, detection, containment, and recovery actions.

## Maintain runbooks and infrastructure

- Prefer reviewed infrastructure as code over undocumented console changes.
- Plan before apply and inspect the exact target.
- Detect and reconcile configuration drift; preserve emergency changes as reviewed code after the incident.
- Avoid broad credentials, wildcard resources, public defaults, and unbounded network egress.
- Test backup restore, failover, rollback, and disaster recovery in proportion to business risk.
- Do not delete infrastructure or data to make a deployment pass without explicit authority and a recovery plan.
- Give every runbook a trigger, impact, prerequisites, read-only diagnostics,
  exact gated actions, stop conditions, verification, rollback, escalation,
  evidence capture, owner, and freshness signal.
- Exercise high-risk runbooks and rollback paths in an isolated or approved
  environment; do not call an untested procedure ready.

## Delegate

Parallelize build, GitHub workflow, container, provider, observability,
capacity, security, and recovery review only when environments and ownership
are isolated. Give each specialist the source and artifact identity, exact
target, read or write authority, stop conditions, and unique evidence
location. Keep one release commander and one source of deployment truth.

## Return

Report:

1. target, source snapshot, artifact identity, effective configuration, and environment;
2. Git or GitHub, CI/CD, container, provider, cache, and one-command delivery
   behavior that applies;
3. checks and exact approval state;
4. deployment or diagnostic outcome with timestamped, redacted evidence;
5. observability, SLO, and user-journey verification;
6. runbook, rollback, and recovery readiness;
7. canonical evidence states and remaining operational risk.

Never report production success from CI completion alone.
