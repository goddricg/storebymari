# Preferred Greenfield Web Stack

Use this document as a starting hypothesis for a genuinely new web application,
not as an instruction to retrofit an existing repository. Repository evidence,
user constraints, supported clients, team ownership, deployment requirements,
security boundaries, data residency, cost, and operability always take
precedence.

Do not add, replace, upgrade, or migrate a framework, runtime, datastore,
identity system, deployment platform, package manager, or major dependency in
an existing project without explicit authorization for that exact change.
Selecting a product capability does not authorize installing every tool listed
here.

## Resolve the Decision from Current Evidence

Before selecting or initializing the stack:

1. Confirm that the work is greenfield and identify any required integration
   with existing systems.
2. Record users, critical journeys, supported browsers and devices, data
   classification, tenancy, identity, storage, availability, latency, recovery,
   residency, budget, and team constraints.
3. Inspect the target runtime and hosting limits, regional availability,
   connection behavior, build model, and supported package versions.
4. Resolve version-sensitive behavior from the current official documentation
   for the selected and pinned versions. Record the source URL, access date, and
   decisive compatibility facts.
5. Compare the preferred baseline with the smallest credible alternative.
   Document material tradeoffs and the reason for each optional dependency.
6. Keep deployment, production resource creation, migrations, secrets,
   authentication policy, billing, and live-data actions behind their explicit
   permission gates.

Do not copy version numbers from this document into a project. Pin versions in
the project according to its package and runtime policy, then use the matching
official versioned documentation and migration notes.

## Preferred Baseline

Treat each entry as a default candidate, not an automatic dependency.

| Concern | Preferred starting point | Selection rule |
|---|---|---|
| Web application | Next.js with React and TypeScript | Use when its rendering, routing, deployment, and team model fit the product. Choose another framework when a verified constraint wins. |
| Web foundations | Semantic HTML, resilient CSS, and progressive enhancement | Keep essential content and actions grounded in platform behavior regardless of framework. |
| Styling | Tailwind CSS backed by explicit design tokens and reusable primitives | Use utilities to express a coherent system; avoid one-off values and unreadable class duplication. Plain CSS or an existing system remains valid. |
| Hosting | Vercel | Verify current runtime, region, connection, job, caching, observability, and cost constraints before committing. Hosting is a separate permission decision. |
| Durable data | Supabase-managed PostgreSQL | Model relational invariants in PostgreSQL. Verify connection, pooling, backup, recovery, region, extension, and operational requirements. |
| Identity | Supabase Auth | Treat authentication as identity establishment. Enforce authorization, ownership, role, scope, and tenant rules at every protected server or data boundary. |
| Object storage | Supabase Storage | Define bucket exposure, object ownership, upload validation, size and type limits, signed access, retention, deletion, malware handling, and cache behavior. |
| Boundary validation | Zod | Validate untrusted input at the boundary and keep database and domain invariants authoritative. Share schemas only when client and server contracts truly match. |
| Forms | Native forms for simple flows; React Hook Form for complex client form state | Add a form library when conditional fields, repeated sections, performance, or error orchestration justify it. Preserve native semantics and server validation. |
| State | URL, server, and local component state first; Zustand for genuine cross-route client state | Do not copy authoritative server data into a global store or introduce one store for unrelated concerns. |
| Remote data | Framework-native server data flow first; TanStack Query for justified client-side synchronization | Use a client cache when refetch, invalidation, polling, optimistic work, offline behavior, or long-lived interactive views require it. Define ownership and freshness. |
| Motion | CSS transitions for simple feedback; Motion for coordinated React animation | Give motion a user purpose, keep it interruptible and performant, and implement a reduced-motion path that preserves meaning. |
| Icons | Lucide | Use a consistent set, hide decorative icons from assistive technology, and give icon-only controls an accessible name. Do not use an icon where text is clearer. |
| Charts | Recharts | Use only for a real data-visualization need. Provide an accessible name, textual takeaway, data table or equivalent, non-color cues, responsive sizing, and safe empty/error states. |
| Data access | Select one of Drizzle or Prisma after the database workflow is known | Keep SQL, constraints, migrations, query plans, and operational behavior reviewable whichever abstraction is selected. |
| Ephemeral data | Redis only when a measured cache, coordination, rate-limit, queue, or transient-state need exists | Keep durable business truth elsewhere and define ownership, keys, TTL, eviction, invalidation, memory bounds, and failure behavior. |

Install only the dependencies exercised by the authorized vertical slice.
Prefer a smaller complete system over a broad scaffold whose packages have no
current owner or acceptance path.

## Default Architecture

- Start with a modular monolith and cohesive feature-based slices inside one
  deployment. Add services only for a demonstrated isolation, workload,
  security, ownership, scaling, or operational boundary.
- Keep UI, application/domain operations, data access, and external adapters
  distinct where that separation makes contracts testable and change safer.
  Do not create layers that only forward calls.
- Apply clean architecture, SOLID, DRY, and KISS as diagnostic heuristics.
  Prefer simple explicit code, accept small duplication while concepts can
  diverge, and extract an abstraction only after a stable contract or repeated
  behavior proves its value.
- Keep features vertically discoverable. Centralize only stable platform
  primitives such as identity context, logging, configuration, and shared
  design tokens.
- Keep protected data and business decisions on the server. Minimize client
  JavaScript and client state to what interaction requires.
- Make loading, empty, validation, permission, not-found, degraded, retryable
  error, terminal error, mutation, conflict, duplicate-action, session-expired,
  and success states explicit where applicable.

## TypeScript Policy

For a new TypeScript codebase:

- enable strict checking;
- prohibit unbounded `any` in authored application code;
- use `unknown` for untrusted values and narrow them at boundaries;
- model domain states and external contracts explicitly;
- keep generated code and narrowly scoped third-party escape hatches visible;
  and
- require a documented reason, boundary, and follow-up owner for any necessary
  unsafe assertion or suppression.

This is a greenfield default, not a universal mandate. Follow an existing
project's language and type policy unless a separate migration is explicitly
authorized. Do not turn a feature request into a repository-wide typing
rewrite.

## Choose Drizzle or Prisma Deliberately

Choose one primary schema and migration workflow. Do not install both merely to
defer the decision.

| Driver | Prefer Drizzle when | Prefer Prisma when |
|---|---|---|
| Query model | The team wants SQL-shaped, explicit queries and close control over generated SQL | The team wants a generated, schema-centered client and a higher-level relation API |
| Schema ownership | TypeScript schema definitions and SQL review fit the ownership model | A declarative Prisma schema and generated client fit the ownership model |
| Migrations | The team wants SQL-forward migrations and direct inspection of database changes | Prisma Migrate fits the development, review, deployment, and recovery workflow |
| Database features | The product needs frequent database-specific SQL or fine-grained query control | The required database features map cleanly to the supported Prisma workflow |
| Runtime and deployment | The current driver and target runtime are verified together | The generated client, adapter, build, connection, and target runtime are verified together |
| Team fit | The team is comfortable reasoning directly about SQL, plans, and indexes | Generated types and standardized application access improve team delivery |

With either option:

- keep PostgreSQL constraints and transactions authoritative;
- review generated migrations before applying them;
- test clean install and supported upgrade paths in isolation;
- inspect query counts and plans for material paths;
- prevent N+1 access with bounded joins, batching, preloading, or
  request-scoped loaders;
- use raw parameterized SQL when it is the clearest verified solution; and
- keep production migration execution separately authorized.

## Choose Runtime and Protocol by Requirement

Use the Next.js-supported Node.js runtime as the initial full-stack candidate
when it satisfies the workload and hosting contract. Consider Bun, Go, or
Python only when ecosystem support, CPU or concurrency characteristics,
specialized libraries, service ownership, latency, deployment, or operations
provide a material benefit. Verify the exact runtime and library combination
before selection. Do not introduce a second language for novelty.

Choose the interface from the consumer contract:

- use REST for resource-oriented, cacheable, broadly interoperable HTTP
  contracts;
- use GraphQL when client-driven graph composition is a demonstrated need and
  schema governance, field authorization, query limits, batching, and resolver
  cost are owned; and
- use WebSocket or another push channel only when a demonstrated real-time or
  bidirectional requirement justifies connection authentication,
  reauthorization, expiry, origin controls, backpressure, ordering, replay,
  reconnect, fan-out, and recovery.

Do not add GraphQL or WebSocket to satisfy a style preference. A single product
may use different protocols at clear boundaries, but each must have an owner,
threat model, compatibility contract, and verification plan.

## Secure the Supabase Boundary

- Map Supabase Auth identity to application roles, permissions, ownership, and
  tenant membership in trusted server or database context.
- Enable and test Row Level Security wherever direct data access or the chosen
  boundary requires it. Treat policies as code: review positive, negative, and
  cross-tenant cases.
- Keep privileged service credentials server-only and least-privileged. Never
  expose them in browser bundles, URLs, logs, telemetry, screenshots, or test
  artifacts.
- Treat Storage authorization separately from database authorization. Test
  object naming, bucket policy, signed access, replacement, deletion, cache,
  and inaccessible-object behavior.
- Define session expiry, refresh, revocation, account linking, recovery, and
  sensitive-action reauthentication from the current product and threat model.
- Verify managed-platform defaults and product limits from current official
  documentation; do not infer that enabling one Supabase feature secures
  another.

## Deliver Complete Authorized Slices

When implementation is requested, provide complete runnable code for the
authorized vertical slice, including boundary validation, authorization,
domain behavior, persistence, UI states, error recovery, accessibility, tests,
and configuration contracts that are knowable from project evidence.

Do not leave TODOs, ellipses, placeholder screens, fake API responses, fake
credentials, invented schemas, guessed business values, or no-op handlers.
Represent an unavailable external value as a documented environment or typed
dependency only when the application can still run meaningfully; otherwise
report the missing input as a blocker.

## Current Primary-Source Router

Use these official entry points to resolve current behavior. Follow the
documentation branch that matches the project's pinned version and target
runtime; inspect release, migration, support, and platform-limit pages when
they can change the decision.

### Platform, accessibility, and languages

- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web) for HTML, CSS,
  browser APIs, and compatibility leads; confirm normative questions in the
  linked standards.
- [W3C Web Accessibility Initiative](https://www.w3.org/WAI/standards-guidelines/)
  for current accessibility standards and techniques.
- [TypeScript documentation](https://www.typescriptlang.org/docs/).
- [Node.js documentation](https://nodejs.org/docs/latest/api/),
  [Bun documentation](https://bun.sh/docs), [Go documentation](https://go.dev/doc/),
  and [Python documentation](https://docs.python.org/3/).

### Application and delivery

- [React documentation](https://react.dev/), [Next.js documentation](https://nextjs.org/docs),
  [Tailwind CSS documentation](https://tailwindcss.com/docs), and
  [Vercel documentation](https://vercel.com/docs).
- [Motion documentation](https://motion.dev/docs/react),
  [Zustand documentation](https://zustand.docs.pmnd.rs/),
  [Lucide documentation](https://lucide.dev/guide/),
  [Zod documentation](https://zod.dev/),
  [React Hook Form documentation](https://react-hook-form.com/docs),
  [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview),
  and [Recharts documentation](https://recharts.github.io/en-US/guide/).

### Data, identity, storage, and contracts

- [Supabase documentation](https://supabase.com/docs),
  [PostgreSQL current documentation](https://www.postgresql.org/docs/current/),
  and [Redis documentation](https://redis.io/docs/latest/).
- [Drizzle ORM documentation](https://orm.drizzle.team/docs/overview) and
  [Prisma ORM documentation](https://www.prisma.io/docs/orm).
- [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110),
  [GraphQL specification](https://spec.graphql.org/), and
  [WebSocket protocol](https://www.rfc-editor.org/rfc/rfc6455).
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
  and [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/) for
  security-control leads; reconcile them with the product threat model and
  authoritative platform documentation.

Record which sources decided the implementation, their access date, the pinned
project versions, and any compatibility assumption marked `inferred`,
`not_run`, or `blocked`. A current homepage is a router to evidence, not proof
that a specific API, configuration, or deployment behavior works in the
selected project.

## Adoption Evidence

Before calling the initialized application complete, record:

- the stack decision and rejected material alternatives;
- dependency and version resolution from the actual lockfile;
- local install, format, lint, type, test, and production-build results defined
  by the repository;
- representative narrow and wide rendered journeys, keyboard and focus
  behavior, reduced motion, error recovery, and accessibility evidence;
- authentication, authorization, ownership, tenant-isolation, validation,
  persistence, concurrency, migration, storage, and N+1 evidence according to
  risk;
- deployment and managed-resource status only when those actions were
  separately authorized and observed; and
- every skipped check, assumption, residual risk, and approval still required.
