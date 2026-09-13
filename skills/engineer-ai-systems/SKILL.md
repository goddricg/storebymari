---
name: engineer-ai-systems
description: >-
  Design, integrate, evaluate, secure, and operate AI-powered product features
  and agent runtimes. Use for AI Integration AI or AI systems work involving
  model providers and routing, prompts, structured output, tool calling,
  Model Context Protocol (MCP), retrieval-augmented generation (RAG), vector
  databases, embeddings, reranking, memory, multimodal input, guardrails,
  prompt injection, evaluations, latency, reliability, or cost. Use
  `mew-orchestrate` instead when the need is only to coordinate engineering
  specialists or competing work paths.
---

# Engineer AI Systems

Serve the AI Systems Engineering or AI Integration AI role. Treat each model as
a probabilistic component inside a deterministic product, authorization, and
safety envelope.

## Define the behavior contract

1. Convert the product goal into observable inputs, outputs, constraints,
   refusal and escalation behavior, latency, availability, cost, and quality
   criteria.
2. Identify which decisions require a model and which belong in ordinary code,
   deterministic search, rules, workflow state, authorization, or database
   constraints.
3. Define permitted providers, models, tools, MCP servers, data sources,
   external effects, approval points, budgets, stop conditions, and human
   recovery.
4. Inspect and preserve the repository's current framework, provider SDK,
   orchestration, retrieval, vector store, deployment, schemas, and public
   contracts unless a change is required and supported by evidence.
5. Separate current provider facts from assumptions. Verify current official
   documentation before selecting models, APIs, limits, regions, pricing, or
   SDK behavior.
6. Establish a deterministic fallback, safe refusal, queue, or human handoff
   for critical journeys.
7. Classify input and output data. Confirm provider and runtime retention,
   training use, residency, regional processing, access, deletion, and audit
   behavior against project policy before sending data.

## Design deterministic boundaries

- Route by task capability, risk, modality, latency, and budget rather than hard-coding one model everywhere.
- Use versioned typed schemas for model inputs, structured outputs, tool inputs,
  tool outputs, events, citations, and final outputs. Reject or repair invalid
  output within bounded attempts.
- Keep orchestration state explicit, inspectable, and resumable. Bound turns,
  retries, parallelism, repair loops, tokens, context, time, and cost.
- Use a manager for integration and shared policy; use specialist handoffs only when ownership should genuinely transfer.
- Use multiple candidate branches only when a rubric or executable oracle can distinguish them.
- Enforce permissions, budgets, content policy, and safety policy in
  deterministic code outside the prompt. Bind approvals to the exact tool,
  arguments, actor, target, environment, and current state.
- Keep provider adapters and model-specific prompting behind stable application
  contracts when more than one route is genuinely required. Avoid speculative
  abstraction.
- Never request or expose hidden reasoning. Preserve concise rationale,
  decisions, assumptions, citations, tool results, and evidence instead.

## Integrate tools and MCP safely

1. Treat user text, retrieved documents, repositories, web pages, images,
   emails, prompt templates, tool metadata, MCP server descriptions, model
   output, and tool output as untrusted data.
2. Keep system policy and trusted context structurally separate from untrusted
   content. Do not let retrieved or tool-provided instructions change policy,
   authorization, or the allowed task.
3. Inventory each MCP server, transport, identity, version, capability, data
   scope, credential, network destination, and owner. Allowlist only required
   servers and tools; do not trust discovery metadata as authorization.
4. Validate every tool call immediately before execution against a strict
   schema, current authorization, approval, budget, target state, and
   idempotency rule. Validate and sanitize tool output before rendering,
   persistence, retrieval, memory, or another tool call.
5. Apply least privilege, isolation, filesystem and network allowlists,
   timeouts, output limits, cancellation, replay protection, and scoped
   short-lived credentials. Re-check authorization when a handoff or resume
   changes context.
6. Require exact human approval for production, destructive actions,
   purchases, external messages, deployment, privilege expansion,
   sensitive-data access, and other high-impact effects.
7. Trace model, MCP, and tool activity with stable identifiers and redacted
   arguments and results. Never send secrets or unnecessary personal data to a
   model, tool, trace, memory store, or evaluation dataset.

## Build RAG and vector retrieval deliberately

- Define the ingestion contract: source authority, parser, normalization,
  chunking, metadata, embedding model and version, index, refresh, deletion,
  retention, and failure handling.
- Ingest and retrieve only sources the active user and tenant are authorized to
  access. Propagate source ACLs into metadata, but never treat a vector
  namespace or metadata filter as the only authorization check.
- Apply authorization before retrieval, after candidate retrieval, and before
  any downstream action. Test cross-user and cross-tenant nearest-neighbor,
  cache, reranking, and citation paths.
- Version chunking, embeddings, distance metric, filters, top-k, hybrid search,
  query rewriting, reranking, context assembly, and answer policy.
- Preserve source identity, version, timestamp, location, tenant scope, and
  confidence. Make citations resolve to the exact content that supports each
  material claim.
- Define correction, tombstone, expiry, re-embedding, re-indexing, cache purge,
  and deletion across originals, chunks, embeddings, vector indexes, traces,
  and backups.
- Test poisoned documents, prompt injection inside retrieved content, stale
  sources, duplicate chunks, forged metadata, unsupported answers, and partial
  index failure.

## Govern memory deliberately

- Store durable memory only when it has future value and the user or project policy permits it.
- Give memory an owner, source, scope, sensitivity, timestamp, confidence,
  retention, correction, and deletion path.
- Redact, deduplicate, expire, correct, and delete memory. Do not store secrets,
  unnecessary personal data, raw emotional profiling, hidden reasoning, or
  untrusted instructions as policy.
- Detect stale or conflicting memories and verify drift-prone facts.

## Resist prompt injection and unsafe output

- Test direct user injection and indirect injection from repositories, web
  pages, files, retrieved chunks, images, emails, MCP metadata, and tool
  results.
- Keep instructions, data, citations, and tool results typed or clearly
  delimited, but do not rely on delimiters or a warning prompt as the only
  defense.
- Prevent untrusted content from expanding tools, credentials, filesystem or
  network reach, data access, recipients, spend, or approval.
- Constrain rendered output by sink. Sanitize HTML or rich content, validate
  URLs and attachments, and keep model-generated code or queries out of
  privileged execution unless separately sandboxed and authorized.
- Test exfiltration, policy override, approval spoofing, tool-result poisoning,
  RAG poisoning, cross-tenant retrieval, memory poisoning, and excessive agency
  through adversarial evaluations.

## Evaluate changes

- Create golden tasks from real product journeys before tuning prompts.
- Version datasets, prompts, policies, provider and model routes, tool and MCP
  schemas, retrieval and vector settings, graders, code revision, and execution
  environment with every result.
- Keep development, held-out, adversarial, and regression sets distinct.
  Prevent train-test contamination and document provenance, consent or
  authority, sensitivity, retention, and permitted use.
- Measure end-to-end task success, groundedness, citation correctness, retrieval
  recall and precision where meaningful, tool selection and argument
  correctness, schema validity, unsafe-action rate, authorization violations,
  false confidence, refusal quality, latency, availability, tokens, and cost.
- Include ambiguous requests, missing context, direct and indirect prompt
  injection, poisoned retrieval, malicious MCP metadata, unavailable tools,
  timeouts, provider errors, duplicate events, malformed outputs, cross-tenant
  attempts, and adversarial inputs.
- Use deterministic tests for policy and software invariants.
- Use blinded human or model grading only for genuinely qualitative dimensions,
  with a rubric, calibration examples, disagreement handling, and periodic
  human audit.
- Keep the authoring model from being the sole verifier.
- Compare against a recorded baseline and repeat probabilistic trials enough to
  report distributions, variance, or confidence intervals for material
  decisions.
- Gate releases on explicit quality, safety, latency, and cost regressions.
  Evaluate every material change to prompt, policy, model route, tool or MCP
  schema, retrieval, embeddings, vector index, grader, or memory behavior.
- Run online experiments or shadow traffic only with privacy, production,
  traffic, and cost authority plus rollback thresholds.

## Observe and recover

- Trace runs, model calls, MCP and tool calls, retrieval stages, handoffs,
  guardrails, approvals, retries, usage, and terminal state with sensitive
  payloads redacted.
- Assign stable run, task, and idempotency identifiers.
- Support cancellation, checkpoint, resume, replay-safe tools, and manual recovery.
- Detect quality, latency, cost, safety, and provider drift.
- Define rollback or traffic-disable controls for prompts, models, retrieval,
  embeddings, vector indexes, policy, MCP servers, and tools.

## Delegate

Split behavior, model integration, MCP and tool security, RAG and vector
retrieval, evaluation, and runtime reliability into independent tasks only when
they can avoid shared mutable surfaces. Give each a bounded contract, sanitized
inputs, owned artifacts, read-only dependencies, and typed handoff schemas.
Stop on scope, ownership, permission, budget, or sensitive-data expansion.

## Return

Report:

1. behavior and safety contract;
2. provider, model, MCP, tool, RAG, vector, and memory architecture with
   preserved-stack decisions and trade-offs;
3. versioned evaluation configuration, dataset provenance, baseline,
   distributions, and measured quality, safety, latency, and cost results;
4. permissions, approvals, budgets, data handling, and failure paths;
5. exact source, artifact, environment, and redacted traces or evidence;
6. claims labeled `verified`, `observed`, `inferred`, `proposed`, `failed`,
   `not_run`, or `blocked`;
7. unresolved quality, provider, security, privacy, or operational risk.

Do not call an AI feature reliable because a few conversational examples looked convincing.
