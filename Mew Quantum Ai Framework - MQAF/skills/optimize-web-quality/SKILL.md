---
name: optimize-web-quality
description: >-
  Audit and improve web performance, accessibility, public discoverability,
  resilience, and cross-browser experience. Use for Performance AI or web
  quality work involving Core Web Vitals (LCP, INP, and CLS), field or
  Lighthouse lab measurements, bundle budgets, code splitting, lazy loading,
  images, fonts, caching, streaming, rendering, responsive defects, keyboard
  or assistive-technology issues, metadata, indexing, degraded states, or
  visual regression. Use `verify-software` for independent release acceptance
  after changes are made.
---

# Optimize Web Quality

Serve the Frontend and Web Quality or Performance AI role. Optimize the user
journey rather than an isolated score. Preserve correctness, security,
privacy, accessibility, compatibility, and design intent.

## Establish a baseline

1. Read applicable instructions and inspect the current framework, package
   manager, routes, rendering strategy, hosting topology, supported browsers,
   design system, analytics, and deployment constraints.
2. Preserve the established stack and public behavior unless a change is
   explicitly required and supported by current evidence.
3. Select representative pages, critical journeys, content and data states,
   mobile and desktop classes, network conditions, and authenticated or public
   contexts.
4. Capture reproducible before evidence with source and artifact identity,
   build mode, environment, tool and browser version, viewport, device or CPU
   class, cache state, throttling, run count, and time zone.
5. Separate authorized aggregated field data, controlled lab measurements,
   synthetic monitoring, code inference, and user reports. Do not copy
   identifiers, tokens, personal data, or sensitive payloads into traces,
   screenshots, analytics, or reports.
6. Define journey-level budgets and regression thresholds before optimizing.

## Set Core Web Vitals budgets

- Prefer representative field data and evaluate the 75th percentile separately
  for mobile and desktop, route or page type, geography, and release window when
  sample size permits.
- Use these current "good" reference budgets when the project has no stricter
  requirement: Largest Contentful Paint (LCP) at or below 2.5 seconds,
  Interaction to Next Paint (INP) at or below 200 milliseconds, and Cumulative
  Layout Shift (CLS) at or below 0.1.
- Treat field budgets as product guardrails, not promises that every device,
  user, or request will meet the threshold. Record sample size, source,
  collection window, percentile, and segmentation.
- Use lab tools to diagnose and prevent regressions when sufficient field data
  does not exist. Do not relabel a lab result as field evidence.
- Treat a Lighthouse score of 100 as a recorded lab aspiration for a controlled
  scenario, not a universal guarantee, field result, accessibility
  certification, or substitute for journey-specific budgets.

## Accessibility

- Use semantic native elements before custom roles.
- Preserve logical heading, landmark, label, and reading order.
- Verify keyboard reachability, visible focus, no traps, sensible focus restoration, and skip/navigation behavior.
- Provide accessible names, descriptions, errors, status announcements, and alternatives for meaningful media.
- Verify contrast, zoom, reflow, reduced motion, touch targets, orientation, and text spacing as applicable.
- Test loading, empty, error, success, disabled, validation, modal, menu, and dynamic-update states.
- Combine automated checks with keyboard and assistive-technology inspection. Automation alone is not proof of accessibility.
- Record the applicable accessibility target, browser, assistive technology, and test limitations instead of implying universal conformance.

## Diagnose the performance path

- Trace navigation, DNS, connection, TLS, CDN or edge, server or function,
  database and provider work, time to first byte, streaming, resource loading,
  main-thread work, hydration, rendering, interaction, and layout stability.
- Attribute LCP to the actual resource and discovery path, INP to interaction
  delay plus processing and presentation, and CLS to unsized or late-changing
  content. Avoid optimizing a proxy that does not move the user metric.
- Fix the dominant measured bottleneck before micro-optimizing.
- Measure third parties separately and define ownership, loading policy,
  consent behavior, timeout, and failure isolation.

## Optimize proportionately

- Set route or journey budgets for initial and total JavaScript, CSS, fonts,
  images, requests, and long tasks. Inspect dependency cost and duplicated code
  before adding a package.
- Remove unused work, tree-shake where supported, split by stable route or
  feature boundaries, and lazy-load noncritical code or media. Do not lazy-load
  the LCP resource or interaction-critical code merely to improve an initial
  bundle number.
- Keep lazy boundaries accessible and resilient. Reserve dimensions, provide
  meaningful loading and error states, prefetch selectively, and avoid request
  waterfalls or layout shift.
- Serve images at appropriate intrinsic dimensions, responsive `srcset` and
  `sizes`, resolution, format, and compression. Reserve width and height,
  prioritize the actual LCP image, lazy-load below-the-fold media, and preserve
  visual quality and meaningful alternatives.
- Subset and self-host fonts when policy and licensing allow, preload only
  critical faces, use suitable fallback metrics and `font-display`, and prevent
  invisible text or disruptive swaps.
- Apply private, public, browser, server, edge, and CDN caching with explicit
  cache keys, freshness, revalidation, invalidation, authorization, tenant,
  `Vary`, stale-content, and purge semantics. Never cache personalized or
  sensitive output under a shared key.
- Use server rendering, server components, streaming, progressive rendering,
  hydration deferral, and client transitions only when they improve the
  measured journey in the current stack. Preserve status codes, SEO,
  accessibility, error recovery, and deterministic rendering.
- Bound lists, payloads, queries, event handlers, observers, retries,
  animations, streaming chunks, and expensive effects. Yield or schedule
  noncritical work to protect interaction responsiveness.

## SEO and discoverability

- Apply SEO work only to routes intended for discovery.
- Verify crawl/index policy, status codes, redirects, canonical identity, metadata, language, link semantics, sitemap, and robots behavior.
- Ensure server-visible meaningful content where the chosen discovery surface requires it.
- Add structured data only when it truthfully represents visible content and validates against the applicable specification.
- Preserve privacy and avoid exposing private, duplicate, filtered, or staging content.
- Treat search-engine submission, analytics changes, and other external mutations as permission-gated actions.

## Resilience and degraded behavior

- Exercise slow, offline, timeout, partial-response, stale-cache, third-party failure, and reconnect paths that matter to the journey.
- Bound retries and prevent retry storms, duplicate mutations, infinite loading, and unrecoverable client state.
- Preserve meaningful server-rendered or progressively enhanced behavior where the product and supported browsers require it.
- Make failure, retry, cancellation, and recovery understandable and keyboard accessible.

## Browser and visual quality

- Test supported engines and representative mobile and desktop viewports.
- Inspect layout at content extremes, localization, zoom, slow data, and failure states.
- Check console errors, failed requests, hydration/runtime warnings, focus, scroll, overlays, and animation.
- Use visual regression as a signal; inspect intentional and unintentional differences.
- Sanitize and retain screenshots, traces, and visual baselines according to project privacy policy.

## Verify improvement

1. Re-run the same recorded lab scenario enough times to report a median and
   distribution rather than the most favorable run.
2. Compare the same source mode, artifact, browser, viewport, throttling, cache
   state, data state, and environment. Explain every material condition change.
3. Add repository-native budgets or regression checks at the cheapest stable
   layer without turning noisy lab variance into a brittle gate.
4. Observe field metrics over an appropriate post-release window only when
   release and monitoring are authorized. Check regressions in conversion,
   errors, accessibility, memory, battery, and adjacent routes.
5. Label claims `verified`, `observed`, `inferred`, `proposed`, `failed`,
   `not_run`, or `blocked`. Do not claim user-visible improvement from source
   inspection alone.

## Delegate

Run accessibility, field-data analysis, lab performance, discoverability,
resilience, and cross-browser investigations in parallel only when they use
independent environments or artifacts. Give each specialist a fixed scenario,
owned artifacts, sanitized data, acceptance thresholds, and required evidence.
Assign one owner to integrate fixes so one optimization does not undermine
another quality dimension.

## Return

Report:

1. baseline and scenario;
2. findings ranked by user impact and confidence;
3. changes and trade-offs;
4. field and lab results kept separate, including LCP, INP, CLS, Lighthouse
   diagnostics, comparable conditions, tool versions, and run distributions;
5. bundle, image, font, cache, streaming, accessibility, and resilience effects
   that apply;
6. budgets and regression protection;
7. unmeasured conditions, permission state, and remaining risk.

Do not claim improvement from incomparable measurements, a single Lighthouse
run, or an unobserved production path.
