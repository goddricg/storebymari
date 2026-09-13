---
name: govern-risk-compliance
description: "Assess and govern privacy, legal awareness, regulatory, compliance, policy, audit, and enterprise risk for software and AI systems. Use for data protection, consent, retention, cross-border data, accessibility obligations, AI governance, vendor risk, records, control mapping, risk registers, compliance evidence, contract-impact questions, and deciding when qualified legal, accounting, privacy, or regulatory review is required."
---

# Govern Risk and Compliance

Translate obligations into owned, testable controls while keeping legal conclusions with qualified professionals.

## Scope the obligation

1. Identify jurisdiction, industry, entity, users, data subjects, product, deployment locations, vendors, and effective date.
2. Separate law, regulation, contract, policy, standard, customer commitment, and voluntary best practice.
3. Use current authoritative sources for changing obligations and preserve citation, version, and date.
4. State what is known, assumed, excluded, and awaiting qualified review.
5. Do not present general information or a model's interpretation as legal, tax, accounting, or investment advice.

## Model risk

- Identify asset, threat or obligation, precondition, likelihood range, impact, affected parties, velocity, detectability, and existing controls.
- Map privacy lifecycle: purpose, lawful basis or authorization, minimization, notice, consent where applicable, access, correction, deletion, portability, sharing, retention, and incident response.
- Map AI lifecycle: data provenance, model/provider terms, evaluations, human oversight, transparency, contestability, tool authority, monitoring, and retirement.
- Include vendor, concentration, continuity, supply-chain, accessibility, financial, operational, reputational, and contractual risk.
- Distinguish inherent risk, control effectiveness, residual risk, owner, acceptance authority, and review date.

## Design controls

1. Convert each material obligation into a preventive, detective, responsive, or recovery control.
2. Assign owner, system boundary, implementation, evidence, frequency, exception process, and test.
3. Prefer controls enforced by trusted systems over policy text alone.
4. Minimize sensitive data and privileges; separate duties for high-impact actions.
5. Preserve auditability without logging secrets, customer payloads, or unnecessary personal data.
6. Plan incident notification and evidence preservation with the authorized legal/privacy owner.

## Verify and govern

- Test control design and operating effectiveness separately.
- Sample current evidence tied to the correct environment and period.
- Record exceptions, compensating controls, remediation, due date, and risk acceptance.
- Reassess after material product, provider, model, data, jurisdiction, or deployment changes.
- Never claim certification or compliance from a checklist, code review, or passing scan alone.

## Coordinate councils

Work with Security, Data, AI, Accessibility, DevOps, Business, Finance-aware, and Legal/Privacy reviewers as required. Use `$run-debate-decisions` for explicit risk acceptance. Keep production, contractual, filing, disclosure, or external-reporting actions behind exact authority.

## Return

Produce:

1. scope, jurisdiction, sources, and review date;
2. obligation and data-flow map;
3. risk register and control matrix;
4. evidence and testing plan;
5. gaps, exceptions, owners, and deadlines;
6. residual risk and acceptance authority;
7. questions for qualified professional review.
