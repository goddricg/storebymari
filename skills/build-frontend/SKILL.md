---
name: build-frontend
description: >-
  Implement, modify, or repair production web frontends, including pages,
  components, layouts, forms, navigation, client and server rendering,
  data-fetching, mutations, state management, styling, accessibility,
  responsive behavior, performance, and frontend tests. Use for user-facing web
  features, UI bugs, design implementation, API integration, design-system
  work, progressive enhancement, browser compatibility, or frontend
  verification in an existing or new repository.
---

# Build Frontend

Deliver the smallest complete user-visible change that fits the repository, preserves contracts, and is verified across behavior, states, accessibility, and responsive layouts.

## Role Charter — Frontend AI

- Act as the owner of the rendered user path from route and data contract
  through interaction, feedback, accessibility, responsive layout, and
  browser-visible verification.
- Reason from semantic HTML, platform behavior, content, and state transitions
  before choosing framework abstractions.
- Balance user experience, developer experience, maintainability, performance,
  security, and compatibility. Optimize measured bottlenecks and the complete
  task instead of isolated component elegance.
- Keep protected decisions on the server and make client behavior resilient to
  latency, retries, stale data, and mixed-version contracts.

## Establish Context

- Read repository instructions and `../../docs/web-engineering-standards.md` when present.
- Read `../../docs/greenfield-stack.md` only for a genuinely new application or
  when the user explicitly requests stack selection.
- Inspect the repository before editing. Locate manifests and lockfiles, framework and runtime configuration, routes, rendering boundaries, components, design tokens, styles, assets, API clients, authentication, state patterns, localization, tests, linting, build scripts, CI, and browser support.
- Trace the real route from URL and data source through loading, render, interaction, mutation, and post-mutation refresh.
- Reproduce a reported bug or capture a failing test before fixing it when practical.
- Check working-tree changes and preserve unrelated user work. Restrict edits to the requested scope.
- Use the existing framework, package manager, component system, and conventions. Add dependencies or replace patterns only when the existing stack cannot meet the requirement and the tradeoff is explicit.
- Confirm acceptance criteria, supported clients, data sensitivity, rollout constraints, and whether browser or live verification is authorized.
- Inspect pinned versions and verify version-sensitive framework, Tailwind,
  React, Next.js, Motion, browser, and accessibility guidance against current
  official primary documentation. Record the version, source, and access date;
  report unavailable verification rather than inventing an API.
- Treat official documentation indexes as source routers. Follow the
  version-matched framework, migration, browser-support, accessibility, and
  deployment pages that decide the implementation, and verify generated or
  runtime behavior in the repository.

## Run the Implementation Workflow

1. **Map the change.** Identify affected routes, components, contracts, permissions, states, tests, and downstream consumers.
2. **Plan a vertical slice.** Keep data access, rendering, interaction, mutation, feedback, and verification coherent; avoid speculative abstraction.
3. **Define boundaries.** Choose server, client, static, or progressive-enhancement behavior from repository capabilities, security, interactivity, freshness, and performance needs.
4. **Implement contracts first.** Use typed or otherwise explicit inputs, outputs, state transitions, and error categories. Preserve existing fields and behavior.
5. **Build semantic UI.** Reuse primitives and tokens; compose small components around user intent rather than arbitrary visual fragments.
6. **Complete every state.** Implement loading, empty, partial, error, permission, degraded, mutation, success, and repeated-action behavior.
7. **Harden the experience.** Cover validation, accessibility, responsive reflow, localization, security, performance, and compatibility.
8. **Verify and report.** Run repository-native checks and inspect the user-visible path at representative widths when tooling and authorization permit.

## Apply Decision Heuristics

- Keep state as local as possible and derive values instead of synchronizing duplicate sources of truth.
- Put shareable navigation and filters in the URL when users must bookmark, refresh, or use browser history.
- Prefer server rendering or pre-rendering for non-interactive, public, or first-view content when the existing framework supports it; use client execution only for required interaction or browser APIs.
- Reuse accessible repository primitives before creating custom controls.
- Preserve the selected visual system. Translate requests such as premium,
  simple, cute, modern, or elegant through approved typography, color, spacing,
  density, shape, imagery, icons, content, and motion rather than adding generic
  visual effects.
- Prefer explicit state machines or reducers when transitions, retries, cancellation, or concurrency make boolean flags ambiguous.
- Avoid premature memoization and code splitting. Measure meaningful performance and fix the dominant path.
- Preserve native link, form, history, focus, and keyboard behavior.
- Keep irreversible mutations deliberate, idempotent where required, and protected against duplicate submission.
- Extract a reusable component or hook only when repeated behavior, a stable
  public contract, or an independently testable responsibility proves the
  abstraction. Do not create wrappers or `use*` hooks merely to move code or
  satisfy DRY mechanically.
- Apply SOLID, DRY, KISS, clean boundaries, and feature-based organization as
  heuristics. Prefer cohesive feature ownership and the simplest change that
  keeps future edits local.

## Apply Frontend Technology Deliberately

- Use semantic HTML and resilient CSS as the base. Use Tailwind CSS, TypeScript,
  React, Next.js, and Motion when they are installed, selected by the project
  contract, or justified by a greenfield decision; do not retrofit them into an
  established project by preference alone.
- Follow `../../docs/greenfield-stack.md` as a default only when no existing
  repository contract exists. Install only the packages required by the
  authorized product slice.
- Enable strict TypeScript and avoid unbounded `any` in a greenfield TypeScript
  project by default. Narrow `unknown`, model external boundaries explicitly,
  and follow a different existing type policy unless the user authorizes a
  migration.
- Choose state ownership in this order: server or URL state when authoritative
  or shareable, local component state when isolated, a form library for form
  concerns, a server-state cache for remote synchronization, and a global
  client store only for genuinely cross-route client state.
- In React or Next.js, keep components server-rendered or otherwise
  non-client-executed when they do not require client interaction or browser
  APIs and the installed framework supports that boundary. Introduce a client
  boundary deliberately, pass minimal serializable data across it, and define
  freshness, caching, invalidation, streaming, hydration, and navigation
  behavior from current project evidence.
- Use Tailwind CSS through the project's tokens, approved utilities, component
  variants, and content-driven breakpoints. Avoid arbitrary values and repeated
  class clusters when a stable token or primitive exists; avoid abstraction
  that merely hides readable classes.
- Use Zod or the selected schema tool to validate untrusted client boundaries
  and keep server validation authoritative. Use native form behavior for simple
  flows and React Hook Form only when complex form state, conditional fields,
  repeated groups, or performance justify it.
- Use TanStack Query only when client-side remote synchronization, invalidation,
  polling, optimistic updates, offline behavior, or long-lived interactive
  views require a cache. Define query ownership, keys, freshness, cancellation,
  error recovery, and mutation reconciliation.
- Use Zustand only for genuine cross-route client state that URL, server, local,
  form, or remote-cache state does not own. Split stores by cohesive concern and
  use selectors that keep subscriptions bounded.
- Use Motion only for purposeful coordinated animation and implement reduced
  motion. Use Lucide only as the selected icon system with accessible labels.
  Use Recharts only for an actual visualization need with an accessible
  takeaway or data equivalent, non-color cues, responsive sizing, and complete
  loading, empty, error, and long-label states.
- Use complete, runnable code for an implementation request. Do not leave TODOs,
  ellipses, fake API responses, placeholder handlers, invented assets, or
  guessed business values. Model unavailable inputs as explicit typed
  dependencies or report a blocker.

## Enforce Trust Boundaries

- Treat client authentication state, hidden controls, route guards, and client validation as user-experience aids, never as authorization.
- Require protected reads and writes to authenticate and authorize the user, resource, role, scope, and tenant on the server.
- Validate input on the client for timely feedback and again on the server for authority.
- Do not expose secrets, privileged configuration, raw tokens, hidden data, internal errors, or inaccessible resource identifiers in bundles, markup, storage, logs, analytics, or source maps.
- Render untrusted content safely. Avoid unsafe HTML execution; sanitize at a defined boundary when rich content is required.
- Preserve CSRF, origin, cookie, content-security, upload, redirect, and external-link protections already present; escalate missing server controls.

## Implement the Experience Matrix

- Keep loading layouts stable and communicate progress without blocking unrelated tasks.
- Differentiate first load from background refresh and preserve useful stale content when safe.
- Distinguish initial empty, filtered empty, permission denied, not found, and load failure.
- Make errors specific, actionable, associated with their controls, and recoverable without losing valid input.
- Confirm success at the right scope, refresh authoritative data, and reconcile optimistic changes or conflicts.
- Prevent duplicate mutations while retaining clear retry, cancel, and timeout behavior.
- Define session expiry, offline, partial dependency failure, and unsupported-capability fallbacks where relevant.

## Build Accessibility and Responsive Behavior

- Use semantic HTML and native controls first. Provide accessible names, descriptions, labels, error associations, status announcements, and meaningful alternative text.
- Make all interactions keyboard-operable with visible focus, logical order, predictable focus movement, and no keyboard traps.
- Preserve headings, landmarks, table semantics, reading order, text scaling, contrast, non-color cues, reduced motion, captions, and reflow at high zoom.
- Design from content constraints. Verify narrow and wide layouts, wrapping, long words and translations, overflow, touch and pointer input, virtual keyboards, safe areas, and orientation changes.
- Avoid viewport-locked heights and horizontal page overflow unless the content itself requires a documented scroll region.
- Use animation only for feedback, continuity, orientation, hierarchy, or
  state-change comprehension. Keep it interruptible and performant, and provide
  a reduced-motion path that preserves all information and actions.

## Preserve Contracts and Compatibility

- Keep public component props, routes, query parameters, storage keys, analytics events, API fields, and automation selectors stable unless change is required.
- Treat new API fields as optional during mixed-version rollout and retain existing defaults and error behavior.
- Handle localization, explicit time zones, locale-aware dates, numbers, currency, bidirectional text, and user-generated content consistently with repository conventions.
- Prefer progressive enhancement for essential flows and feature-detect optional browser capabilities.
- Document any required backend change instead of emulating privileged business rules in the client.

## Verify with Evidence

- Run the narrowest relevant tests while iterating, then run repository-required format, lint, type, unit, integration, and build checks.
- Add tests for state transitions, validation, permissions as rendered, errors, retries, duplicate actions, navigation, and contract compatibility.
- Inspect the real page at representative narrow and wide viewports. Exercise keyboard flow, focus, zoom and reflow, reduced motion, slow or failed network, and realistic long or empty data.
- Use automated accessibility and performance tools as signals; verify important findings manually.
- Report exact commands, exit results, environment, URL or route, viewport, and
  screenshots or artifacts. Record official source URLs, access dates, and
  pinned versions for version-sensitive implementation choices. State
  explicitly what could not be run.
- Do not equate an HTTP success, compilation, or isolated component test with a verified rendered user flow.

## Coordinate Subagents and Handoffs

- Delegate bounded repository mapping, component implementation, or independent verification only when file ownership and contracts are clear.
- Provide allowed files, acceptance criteria, repository constraints, dependency policy, and required commands or artifacts.
- Avoid concurrent edits to the same files. Review and integrate every subagent change against the complete user path.
- Prohibit unapproved dependency upgrades, framework replacement, deployment, live mutation, and secret access.
- Escalate backend, architecture, UX, security, or data-contract gaps with exact evidence and a minimal required contract.

## Completion Criteria

Complete the frontend change only when:

- the requested route and interaction work through the real data and mutation path;
- server-side authorization and validation requirements are satisfied or explicitly blocked;
- loading, empty, error, permission, degraded, mutation, and success states are complete;
- keyboard, focus, semantics, announcements, contrast, motion, responsive reflow, overflow, and localization are addressed;
- existing contracts and supported clients remain compatible or have an approved migration;
- relevant checks pass and user-visible evidence is captured; and
- remaining limitations, skipped checks, unavailable inputs, and production
  actions are explicit.

## Output Contract

Return:

1. the implemented outcome and affected user flow;
2. changed files with a one-line purpose for each;
3. contract, state, accessibility, responsive, security, and compatibility decisions;
4. exact verification commands and results;
5. browser or visual evidence with route, viewport, and environment when available;
6. items marked `not_run` or `blocked`, known risks, and follow-up owners; and
7. deployment or migration steps as proposals only unless explicitly authorized.
