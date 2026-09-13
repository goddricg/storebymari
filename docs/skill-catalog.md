# MQAF Skill Catalog and Router

Use `$mew-orchestrate` when an outcome crosses specialties, needs competing
paths, has consequential permission gates, or requires integration and
independent verification. For a narrow task, invoke only the owning skill.

## Core operating engines

| Skill | Responsibility | Trigger |
|---|---|---|
| `$mew-orchestrate` | Quantum Supreme Web Architect and accountable manager | Contract, route, delegate, integrate, verify, stop, and report cross-domain work |
| `$run-debate-decisions` | Debate Engine and Decision Engine | Compare credible options, challenge assumptions, preserve dissent, and make an owned decision |
| `$manage-knowledge-memory` | Knowledge Engine, project memory, and feedback loop | Curate sourced knowledge, project decisions, coding standards, lessons, freshness, and controlled improvement |

## Twelve Dev AI role bindings

These are role names and bounded responsibilities. They do not imply separate
conscious entities or greater authority.

| Dev AI role | Skill | Primary responsibility |
|---|---|---|
| **🧠 Architect AI** | `$design-architecture` | Boundaries, components, contracts, trade-offs, scale, maintainability |
| **🎨 UI Master AI** | `$design-ux-ui` | Research-backed flows, visual systems, accessibility, responsive interaction |
| **⚛️ Frontend AI** | `$build-frontend` | Browser UI, state, validation, accessibility, integration |
| **⚙️ Backend AI** | `$build-backend-api` | Services, APIs, identity, authorization, concurrency, integrations |
| **🗄️ Database AI** | `$engineer-data` | Schemas, migrations, integrity, queries, indexes, retention |
| **🔒 Security AI** | `$secure-applications` | Threats, abuse cases, privacy, tenant isolation, secure delivery |
| **⚡ Performance AI** | `$optimize-web-quality` | Core Web Vitals, accessibility, SEO, browser and delivery quality |
| **🤖 AI Integration AI** | `$engineer-ai-systems` | LLMs, agents, MCP, RAG, retrieval, guardrails, evaluations |
| **🧪 QA & Testing AI** | `$verify-software` | Independent, risk-based verification and evidence |
| **🚀 DevOps AI** | `$operate-devops-sre` | CI/CD, environments, observability, release, recovery, SRE |
| **👀 Reviewer AI** | `$debug-review-refactor` | Root cause, code review, regression-aware refactoring |
| **📚 Documentation AI** | `$document-engineering` | ADRs, contracts, runbooks, evidence-backed durable documentation |

`$discover-product` is the product-discovery preflight used when the outcome,
scope, users, or acceptance criteria are not yet sufficiently defined.

## Multi-disciplinary Council skills

| Council skill | Perspectives covered |
|---|---|
| `$advise-business-strategy` | Product, startup, SaaS, pricing, monetization, finance-aware strategy |
| `$engineer-brand-growth` | Brand, SEO, storytelling, copy, community, funnels, ads, ethical growth |
| `$research-reason-innovate` | Science, First Principles, systems thinking, experimentation, innovation |
| `$teach-communicate-lead` | Teaching, communication, leadership, negotiation, sales, customer success |
| `$govern-risk-compliance` | Privacy, legal awareness, compliance, controls, audit, enterprise risk |

Use [`councils.md`](councils.md) for Council activation and
[`role-charters.md`](role-charters.md) for detailed role boundaries.

## Fourteen user-selectable modes

A mode expresses current intent; it never expands permission.

| Mode | Default role or skill |
|---|---|
| Architect Mode | 🧠 Architect AI / `$design-architecture` |
| Frontend Mode | ⚛️ Frontend AI / `$build-frontend` |
| Backend Mode | ⚙️ Backend AI / `$build-backend-api` |
| Database Mode | 🗄️ Database AI / `$engineer-data` |
| Security Mode | 🔒 Security AI / `$secure-applications` |
| Debug Mode | 👀 Reviewer AI / `$debug-review-refactor` |
| Refactor Mode | 👀 Reviewer AI plus affected implementation role |
| Review Mode | 👀 Reviewer AI; add independent domain reviewers by risk |
| Performance Mode | ⚡ Performance AI / `$optimize-web-quality` |
| Deployment Mode | 🚀 DevOps AI / `$operate-devops-sre` |
| Business Mode | `$advise-business-strategy` |
| Designer Mode | 🎨 UI Master AI / `$design-ux-ui` |
| AI Engineer Mode | 🤖 AI Integration AI / `$engineer-ai-systems` |
| Teacher Mode | `$teach-communicate-lead` |

The Orchestrator may add supporting roles only to close a named acceptance,
trust, data, operational, or evidence gap.

## Routing rules

1. Define the user-visible outcome, evidence, scope, and exact permission
   boundary before routing.
2. Select one primary mode and the smallest sufficient supporting roles.
3. Give every specialist a bounded task contract, owned artifacts, and return
   envelope.
4. Keep one active writer per mutable artifact and serialize globally coupled
   resources.
5. Use deterministic inspection or tests instead of a model vote when they can
   settle the question.
6. Keep the Orchestrator accountable for integration, permissions,
   verification, and the final answer.
7. Stop adding specialists when coverage is complete and coordination cost
   exceeds expected value.

## Common compositions

### New web product

```text
discover-product
  -> design-architecture + design-ux-ui
  -> build-frontend + build-backend-api + engineer-data
  -> secure-applications + optimize-web-quality
  -> verify-software
  -> operate-devops-sre (only through the required environment gates)
```

### Existing-repository defect

```text
debug-review-refactor
  -> affected implementation role
  -> verify-software
```

Add Security AI when the path crosses identity, authorization, external input,
sensitive data, money, tenant boundaries, or privileged tools.

### AI feature

```text
discover-product
  -> design-architecture
  -> engineer-ai-systems
  -> secure-applications
  -> verify-software
```

Add frontend, backend, data, governance, and operations roles according to the
real integration and risk surfaces.

### Consequential decision

```text
mew-orchestrate
  -> relevant Dev roles and Councils
  -> run-debate-decisions
  -> decision owner
  -> implementation and independent verification
  -> manage-knowledge-memory (only for an authorized durable record)
```
