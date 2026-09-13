# Definition of Done

Adapt this checklist to the risk and scope of the task. Do not perform irrelevant work solely to fill the checklist.

## Contract

- [ ] User-visible outcome and acceptance criteria are explicit.
- [ ] Scope, exclusions, compatibility, and owned surfaces are clear.
- [ ] Material assumptions and unknowns are visible.

## Implementation

- [ ] Change is minimal, coherent, and follows repository conventions.
- [ ] Validation, authorization, and ownership are enforced at the trusted boundary.
- [ ] Failures, timeouts, retries, concurrency, and idempotency are handled where relevant.
- [ ] Existing user changes and unrelated behavior are preserved.
- [ ] No secret, personal data, or sensitive payload entered prompts, diffs, logs, or artifacts.

## Experience

- [ ] Responsive behavior is verified where relevant.
- [ ] Loading, empty, error, success, and recovery states are covered.
- [ ] Keyboard, semantics, focus, contrast, and assistive-technology needs are covered.

## Verification

- [ ] Static checks and build pass.
- [ ] Risk-appropriate automated unit, contract, integration, and end-to-end
      suites pass, including regression cases for the changed behavior.
- [ ] The rendered or runtime behavior is inspected, not inferred from code alone.
- [ ] Security, data integrity, performance, SEO, and operations are checked in proportion to risk.
- [ ] Independent review is complete for material changes.
- [ ] Self-review found no unresolved scope drift, unsupported claim,
      accidental duplication, insecure default, or unowned failure path.

## Delivery

- [ ] Evidence bundle is complete and distinguishes facts, inferences, and unknowns.
- [ ] Preview or staging is verified where available.
- [ ] Production or destructive actions have explicit approval.
- [ ] Rollback is documented and verified in proportion to impact.
- [ ] Remaining limitations and follow-up are explicit.
- [ ] Durable lessons or project-memory updates are stored only when authorized,
      sourced, scoped, versioned, and assigned a review lifecycle.
