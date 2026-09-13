# MQAF Universal AI Adapters

This directory makes Mew usable across model providers and AI products without
pretending that every runtime has the same tools.

The portable guarantee is the **instruction contract**: any AI surface that
accepts text can receive a Mew prompt. File editing, shell execution,
subagents, memory, browser control, MCP, deployment, and approval workflows
remain capabilities of the host product. The prompt detects and falls back
when they are absent.

Platform behavior in this guide was checked against official documentation on
2026-08-04. Recheck the linked source before relying on a changing limit or
feature.

## Choose one prompt

| Prompt | Current size | Use when |
|---|---:|---|
| [`MEW-UNIVERSAL-FULL.md`](universal/MEW-UNIVERSAL-FULL.md) | 28,702 UTF-8 bytes | The surface accepts a large system/project prompt or repository instruction file |
| [`MEW-UNIVERSAL-COMPACT.md`](universal/MEW-UNIVERSAL-COMPACT.md) | 10,121 UTF-8 bytes; 199 lines | Context is tighter, or a coding agent recommends concise repository instructions |
| [`MEW-UNIVERSAL-MICRO-1500.md`](universal/MEW-UNIVERSAL-MICRO-1500.md) | 1,478 LF characters; 1,486 with CRLF | The instruction field has a 1,500-character limit |
| [`MEW-ACTIVATION-MESSAGE.md`](universal/MEW-ACTIVATION-MESSAGE.md) | 1,995 characters | First user message after installation, to verify real capability and fallback behavior |

Sizes are validated by `scripts/validate_framework.py`. Do not add a title,
signature, or extra whitespace to the Micro prompt when the destination has an
exact 1,500-character limit.

Use Full when possible. Use Compact for a smaller always-on context. Use Micro
only for a hard size limit, then provide project rules and task context
separately.

## Universal copy-paste path

1. Open the selected prompt and copy its complete contents.
2. Paste it into the product's highest-priority user-controlled instruction
   surface: system prompt, project instructions, custom agent instructions, or
   repository instruction file.
3. Do not overwrite an existing repository instruction file. Reconcile the
   current project rules with Mew and preserve the more specific project
   constraints.
4. Start a new chat, run, or agent session when the product loads instructions
   only at session start.
5. Send the activation message.
6. Confirm that unavailable capabilities are declared and mapped to fallbacks.
7. Supply real project context, scope, approval boundaries, and acceptance
   criteria.

If the product has no persistent instruction feature, paste Full or Compact as
the first message of each new conversation. If it rejects the prompt, step
down one size. A normal chat message has lower authority than a genuine system
or project instruction and may be truncated or forgotten as context grows.

## Official platform placement map

### OpenAI and ChatGPT

| Surface | Placement | Recommended MQAF prompt | Important behavior |
|---|---|---|---|
| ChatGPT Custom Instructions | `Settings -> Personalization -> Custom Instructions` | Micro | Current limit is 1,500 characters on Free/Go and 5,000 on Plus/Pro/Business/Enterprise/Edu; Micro remains below 1,500 with LF or CRLF line endings |
| ChatGPT Project | Project menu -> `Project settings` -> `Project instructions` | Full, then Compact if rejected | Applies only inside that Project and overrides global Custom Instructions |
| Custom GPT | GPT editor -> `Configuration` -> `Instructions` | Full or Compact | Put behavior in Instructions, not Knowledge; conversations do not inherit Saved Memory, global Custom Instructions, or prior GPT chats |
| OpenAI Responses API | Request `instructions`, or a `developer`/`system` input message | Full or Compact | Re-send instructions when continuing with `previous_response_id`; prior response instructions are not automatically carried forward |
| Codex | Root or nested `AGENTS.md` | Existing MQAF `AGENTS.md` plus `Agent.md`; for one file use Full or Compact | Instructions merge from broad to near working directory; the default combined project-instruction budget is 32 KiB and is rebuilt per run/session |

Official sources: [ChatGPT Custom
Instructions](https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt),
[Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt),
[Creating and editing
GPTs](https://help.openai.com/en/articles/8554397-creating-and-editing-gpts),
[GPT behavior and privacy](https://help.openai.com/en/articles/8554407-gpts-in-chatgpt),
[Codex `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
and [Responses API
reference](https://platform.openai.com/docs/api-reference/responses/create).

For Codex, the best full-framework path is to keep this repository's
`AGENTS.md`, `Agent.md`, `docs/`, `skills/`, and `templates/` together. The
root entrypoint tells Codex which detailed file to read without placing the
entire framework into the automatic `AGENTS.md` chain.

For optional Sol/Terra/Luna routing in local Codex clients, use the dated
[`Codex custom-agent adapter`](codex/README.md). It maps the main
Director-hosted Mew session to Sol, bounded Manager and Reviewer profiles to
Terra, and clear implementation Workers to Luna. Treat this as a runtime
mapping, not a change to MQAF's modes, roles, permissions, or evidence. Do not
overwrite an existing `.codex/config.toml`; merge and validate it.

### Anthropic Claude

| Surface | Placement | Recommended MQAF prompt | Important behavior |
|---|---|---|---|
| Claude.ai Project | Project -> project knowledge area -> `Set project instructions` | Full or Compact | Applies to all chats in that Project; it is a UI instruction surface, not a repository filename |
| Claude Code | Project `CLAUDE.md` or `.claude/CLAUDE.md` | Compact, or bridge to an MQAF bundle | Project, user, local, managed, and path-scoped rules have distinct scopes |

For a project that already contains the MQAF root `AGENTS.md`, the officially
supported Claude Code bridge is:

```md
@AGENTS.md
```

Claude Code supports relative imports, nested imports up to four hops, and
project-level approval for imports that resolve outside the working directory.
Use `/context` or `/memory` to inspect loaded instructions. Anthropic recommends
keeping a `CLAUDE.md` below roughly 200 lines; the MQAF Compact prompt is 199
lines. Treat instructions as model context, not mechanical enforcement.

Official sources: [Claude.ai
Projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects),
[Claude personalization
features](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features),
and [Claude Code
memory/instructions](https://code.claude.com/docs/en/memory).

### Google Gemini

| Surface | Placement | Recommended MQAF prompt | Important behavior |
|---|---|---|---|
| Instructions for Gemini | `Settings & help -> Personal Intelligence -> Instructions for Gemini` | Micro | Account-level on supported Gemini Apps surfaces; current official docs exclude Gems and Live chats |
| Custom Gem | Gemini web -> `Gems -> New Gem -> Instructions` | Full or Compact | Gem instructions are separate from account instructions; add reference files under Knowledge |
| Gemini CLI | Project `GEMINI.md` | Full or Compact, or import the MQAF entrypoint | Global, project, ancestor, nested, configured, and just-in-time context may combine |

For a Gemini CLI project with the MQAF root entrypoint:

```md
@./AGENTS.md
```

Gemini CLI also permits `context.fileName` to include `AGENTS.md`. Imports
support relative and absolute paths, nested imports up to five levels, cycle
detection, and allowed-directory controls. Use `/memory show` to inspect
effective context. Current official pages vary between `/memory reload` and
`/memory refresh`; prefer `reload` and check `/help` in the installed release.

Official sources: [Instructions for
Gemini](https://support.google.com/gemini/answer/16598625?co=GENIE.Platform%3DDesktop&hl=en),
[Use Gems](https://support.google.com/gemini/answer/15146780?co=GENIE.Platform%3DDesktop&hl=en),
[Gem tips](https://support.google.com/gemini/answer/15235603?hl=en),
[`GEMINI.md` context](https://geminicli.com/docs/cli/gemini-md/),
[Gemini CLI configuration](https://geminicli.com/docs/reference/configuration/),
and [memory import
processor](https://geminicli.com/docs/reference/memport/).

### GitHub Copilot

Use one of:

- repository-wide `.github/copilot-instructions.md` — copy Compact;
- root or nested `AGENTS.md` — use the MQAF entrypoint or Compact on Copilot
  surfaces that support agent instructions;
- path-specific `.github/instructions/NAME.instructions.md` — put only the
  relevant MQAF/project rules there;
- custom agent `.github/agents/mew.md` — use Compact as the prompt body and add
  only supported frontmatter for that Copilot surface.

Support differs across GitHub.com, VS Code, Visual Studio, JetBrains, Eclipse,
Xcode, code review, cloud agent, and Copilot CLI. Verify the target in the
current [custom-instruction support
matrix](https://docs.github.com/en/copilot/reference/custom-instructions-support).
See [repository
instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)
and [custom agent
profiles](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents).

### Cursor

Place Full or Compact in root `AGENTS.md`. Current Cursor documentation
describes this as a plain-Markdown, root-level, single-file alternative to
`.cursor/rules`; root `AGENTS.md` applies to the whole project. Cursor CLI also
reads root `AGENTS.md` and `CLAUDE.md`. Use `.cursor/rules/*.mdc` instead when
you need Cursor-specific activation metadata or path scoping.

Official sources: [Cursor
Rules](https://docs.cursor.com/context/rules-for-ai) and [Cursor CLI
rules](https://docs.cursor.com/en/cli/using).

### Windsurf / Cascade

Place Full or Compact in root `AGENTS.md` for always-on workspace instructions.
Nested `AGENTS.md` files are automatically scoped to their directories. Rules
under `.windsurf/rules/*.md` provide more activation control. Keep each file
focused and avoid duplicating inherited root rules.

Official source: [Windsurf `AGENTS.md`
documentation](https://docs.windsurf.com/windsurf/cascade/agents-md).

### Cline

Copy Full or Compact to `.clinerules/00-mew.md`. Cline combines Markdown and
text files in `.clinerules/` and gives workspace rules precedence over global
rules. Cline also detects root `AGENTS.md`, so the existing MQAF entrypoint can
be reused.

Official source: [Cline
Rules](https://docs.cline.bot/customization/cline-rules).

### Roo Code

Copy Full or Compact to `.roo/rules/00-mew.md`, or use root `AGENTS.md`.
Workspace rules take precedence over global rules. Roo loads root `AGENTS.md`
automatically by default; its preferred directory-based rules are read
recursively and combined.

Official source: [Roo Code custom
instructions](https://docs.roocode.com/features/custom-instructions).

### Amazon Q Developer

Copy Full or Compact to `.amazonq/rules/mew.md`. Amazon Q Developer uses
Markdown files in that directory as project rules for IDE chat and lets users
toggle them for the current session.

Official source: [Amazon Q Developer project
rules](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html).

### JetBrains Junie

Copy Full or Compact to `.junie/guidelines.md` at the project root. Junie
automatically uses the file as project guidance. Keep command execution and
file mutation under the IDE's real approval controls.

Official source: [JetBrains Junie
Playbook](https://www.jetbrains.com/guide/ai/article/junie/).

### Aider

Copy Full or Compact to `CONVENTIONS.md`, then load it read-only:

```text
aider --read CONVENTIONS.md
```

To load it on every run, configure `read: CONVENTIONS.md` in
`.aider.conf.yml`. The Markdown file is the MQAF artifact; the YAML line is
optional Aider configuration.

Official sources: [Aider coding
conventions](https://aider.chat/docs/usage/conventions.html) and [Aider YAML
configuration](https://aider.chat/docs/config/aider_conf.html).

### Any other chat, API, local model, or future AI

Use this decision rule:

1. Native system/developer/project/custom-agent instructions available: paste
   Full, then Compact or Micro if the product rejects the size.
2. Repository rule file documented: copy the selected prompt to that exact
   path.
3. File or project knowledge only: attach Full and explicitly instruct the AI
   to read it before each task; do not assume knowledge files have instruction
   priority.
4. Ordinary chat only: paste the prompt as the first message of each new chat.
5. No text instruction surface: MQAF cannot be installed on that surface.

This generic route can be used with Grok, DeepSeek, Qwen, Kimi, Perplexity,
Mistral, Llama-based assistants, Ollama, LM Studio, Open WebUI, Poe, Microsoft
Copilot, and future products **only when that particular interface accepts
enough instruction or file context**. It does not assert a native filename,
inheritance rule, or tool capability for those products.

## Verify the installation

Send [`MEW-ACTIVATION-MESSAGE.md`](universal/MEW-ACTIVATION-MESSAGE.md) and
inspect the response:

- Unsupported capabilities must be `unavailable` or `unknown`, not invented.
- The exact 14 modes and 12 role names must be present.
- High-impact actions must remain gated.
- Defensive review of user-supplied scope must not be blanket-refused because
  it mentions bugs, hacking, exploits, bypasses, or vulnerabilities.
- Without exact live-test authority, the AI must continue code, configuration,
  dependency, threat, and safe sandbox analysis while marking live checks
  `not_run` or `blocked`.
- Security remediation must preserve affected workflows and contracts, add a
  regression oracle, and avoid guarantees that a system is hack-proof.
- Evidence states must be exact.
- No file, test, deployment, or durable-memory claim may appear without
  current evidence.

Record platform-specific results in
[`AI_RUNTIME_PROFILE.md`](../templates/AI_RUNTIME_PROFILE.md). A successful
activation verifies prompt comprehension in that conversation; it does not
prove future adherence, code quality, security, or cross-platform equivalence.
