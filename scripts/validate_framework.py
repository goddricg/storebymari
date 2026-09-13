"""Validate the portable MQAF instruction and skill bundle without dependencies."""

from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
ADAPTERS = ROOT / "adapters"
REQUIRED_ROOT = (
    ROOT / "Agent.md",
    ROOT / "AGENTS.md",
    ROOT / "README.md",
)
REQUIRED_DOCS = tuple(
    ROOT / "docs" / name
    for name in (
        "councils.md",
        "decision-intelligence.md",
        "evaluation.md",
        "greenfield-stack.md",
        "knowledge-memory.md",
        "knowledge-packs.md",
        "model-routing.md",
        "orchestration.md",
        "persona.md",
        "portability.md",
        "quality-and-security.md",
        "quick-start-th.md",
        "role-charters.md",
        "skill-catalog.md",
        "ultimate-os.md",
        "validation-report.md",
        "web-engineering-standards.md",
    )
)
REQUIRED_TEMPLATES = tuple(
    ROOT / "templates" / name
    for name in (
        "AI_RUNTIME_PROFILE.md",
        "ARCHITECTURE_DECISION_RECORD.md",
        "COUNCIL_BRIEF.md",
        "CODING_STANDARDS.md",
        "DEBATE_DECISION.md",
        "DEFINITION_OF_DONE.md",
        "EVIDENCE_BUNDLE.md",
        "FEEDBACK_LOOP.md",
        "MEMORY_RECORD.md",
        "MODEL_ROUTING_PLAN.md",
        "POSTMORTEM.md",
        "PROJECT_CONTEXT.md",
        "SUBAGENT_HANDOFF.md",
        "TASK_CONTRACT.md",
        "THREAT_MODEL.md",
    )
)
REQUIRED_ADAPTERS = tuple(
    ADAPTERS / relative
    for relative in (
        "README.md",
        "codex/README.md",
        "codex/agents/luna-worker.toml",
        "codex/agents/runtime-fallback.toml",
        "codex/agents/terra-project-manager.toml",
        "codex/agents/terra-reviewer.toml",
        "codex/config.toml.example",
        "universal/MEW-ACTIVATION-MESSAGE.md",
        "universal/MEW-UNIVERSAL-COMPACT.md",
        "universal/MEW-UNIVERSAL-FULL.md",
        "universal/MEW-UNIVERSAL-MICRO-1500.md",
    )
)
EXPECTED_SKILLS = {
    "advise-business-strategy",
    "build-backend-api",
    "build-frontend",
    "debug-review-refactor",
    "design-architecture",
    "design-ux-ui",
    "discover-product",
    "document-engineering",
    "engineer-ai-systems",
    "engineer-brand-growth",
    "engineer-data",
    "govern-risk-compliance",
    "manage-knowledge-memory",
    "mew-orchestrate",
    "operate-devops-sre",
    "optimize-web-quality",
    "research-reason-innovate",
    "run-debate-decisions",
    "secure-applications",
    "teach-communicate-lead",
    "verify-software",
}
EXPECTED_DISPLAY_NAMES = {
    "advise-business-strategy": "👑 Business Council AI",
    "build-backend-api": "⚙️ Backend AI",
    "build-frontend": "⚛️ Frontend AI",
    "debug-review-refactor": "👀 Reviewer AI",
    "design-architecture": "🧠 Architect AI",
    "design-ux-ui": "🎨 UI Master AI",
    "discover-product": "🔭 Product Discovery AI",
    "document-engineering": "📚 Documentation AI",
    "engineer-ai-systems": "🤖 AI Integration AI",
    "engineer-brand-growth": "📣 Marketing Council AI",
    "engineer-data": "🗄️ Database AI",
    "govern-risk-compliance": "⚖️ Security & Governance Council AI",
    "manage-knowledge-memory": "🧩 Knowledge & Memory Engine",
    "mew-orchestrate": "👑 Quantum Supreme Web Architect",
    "operate-devops-sre": "🚀 DevOps AI",
    "optimize-web-quality": "⚡ Performance AI",
    "research-reason-innovate": "🔬 Science & Innovation Council AI",
    "run-debate-decisions": "⚖️ Debate & Decision Engine",
    "secure-applications": "🔒 Security AI",
    "teach-communicate-lead": "🧑‍🏫 Human Council AI",
    "verify-software": "🧪 QA & Testing AI",
}
REQUIRED_AGENT_MARKERS = (
    "Quantum Supreme Web Architect",
    "Architect AI",
    "UI Master AI",
    "Frontend AI",
    "Backend AI",
    "Database AI",
    "Security AI",
    "Performance AI",
    "AI Integration AI",
    "QA & Testing AI",
    "DevOps AI",
    "Reviewer AI",
    "Documentation AI",
    "Observe",
    "Analyze",
    "Think",
    "Challenge Yourself",
    "Monitor",
    "Learn",
)
REQUIRED_MODE_ROWS = (
    "Architect",
    "Frontend",
    "Backend",
    "Database",
    "Security",
    "Debug",
    "Refactor",
    "Review",
    "Performance",
    "Deployment",
    "Business",
    "Designer",
    "AI Engineer",
    "Teacher",
)
ALLOWED_FRONTMATTER = {"name", "description"}
PLACEHOLDERS = (
    "[TODO",
    "TODO:",
    "Complete and informative explanation",
    "Replace with the first main section",
)
FORBIDDEN_EVIDENCE_LABELS = (
    "`unverified`",
    "`partially_verified`",
    "partially verified",
)
UNIVERSAL_PROMPTS = {
    "full": ADAPTERS / "universal" / "MEW-UNIVERSAL-FULL.md",
    "compact": ADAPTERS / "universal" / "MEW-UNIVERSAL-COMPACT.md",
    "micro": ADAPTERS / "universal" / "MEW-UNIVERSAL-MICRO-1500.md",
}
UNIVERSAL_PROMPT_MARKERS = (
    "Mew",
    "Quantum Supreme Web Architect",
    "Architect AI",
    "UI Master AI",
    "Frontend AI",
    "Backend AI",
    "Database AI",
    "Security AI",
    "Performance AI",
    "AI Integration AI",
    "QA & Testing AI",
    "DevOps AI",
    "Reviewer AI",
    "Documentation AI",
    "Observe",
    "Analyze",
    "Think",
    "Architect",
    "Challenge Yourself",
    "Generate",
    "Review",
    "Optimize",
    "Secure",
    "Test",
    "Document",
    "Deliver",
    "verified",
    "observed",
    "inferred",
    "proposed",
    "failed",
    "not_run",
    "blocked",
)
DEFENSIVE_SECURITY_PATTERNS = (
    r"defensive",
    r"live",
    r"regression",
    r"hack-proof|unhackable",
    r"workflows?.*APIs?.*backend.*data",
)
MODEL_ROUTING_MARKERS = (
    "Director",
    "Manager",
    "Worker",
    "Reviewer",
    "Sol",
    "Terra",
    "Luna",
    "route",
    "fallback",
)
CODEX_CONFIG = ADAPTERS / "codex" / "config.toml.example"
CODEX_AGENT_SPECS = {
    "terra-project-manager.toml": {
        "name": "terra_project_manager",
        "model": "gpt-5.6-terra",
        "model_reasoning_effort": None,
        "sandbox_mode": "workspace-write",
    },
    "terra-reviewer.toml": {
        "name": "terra_reviewer",
        "model": "gpt-5.6-terra",
        "model_reasoning_effort": None,
        "sandbox_mode": "read-only",
    },
    "luna-worker.toml": {
        "name": "luna_worker",
        "model": "gpt-5.6-luna",
        "model_reasoning_effort": None,
        "sandbox_mode": "workspace-write",
    },
    "runtime-fallback.toml": {
        "name": "runtime_fallback",
        "model": None,
        "model_reasoning_effort": None,
        "sandbox_mode": "read-only",
    },
}


def error(messages: list[str], path: Path, message: str) -> None:
    messages.append(f"{path.relative_to(ROOT)}: {message}")


def parse_frontmatter(
    messages: list[str], skill_file: Path, text: str
) -> tuple[str | None, str, str]:
    normalized = text.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        error(messages, skill_file, "missing opening YAML frontmatter delimiter")
        return None, "", ""

    parts = normalized.split("---\n", 2)
    if len(parts) != 3:
        error(messages, skill_file, "missing closing YAML frontmatter delimiter")
        return None, "", ""

    frontmatter, body = parts[1], parts[2]
    keys = re.findall(r"^([A-Za-z0-9_-]+):", frontmatter, flags=re.MULTILINE)
    if set(keys) != ALLOWED_FRONTMATTER or len(keys) != 2:
        error(
            messages,
            skill_file,
            f"frontmatter keys must be exactly {sorted(ALLOWED_FRONTMATTER)}; found {keys}",
        )

    name_match = re.search(r"^name:\s*[\"']?([^\"'\n]+)", frontmatter, re.MULTILINE)
    description_match = re.search(r"^description:\s*(.*)$", frontmatter, re.MULTILINE)
    name = name_match.group(1).strip() if name_match else None
    description = ""
    if description_match:
        raw_description = description_match.group(1).strip()
        if re.fullmatch(r"[>|][+-]?", raw_description):
            description_lines: list[str] = []
            collecting = False
            for line in frontmatter.splitlines():
                if line.startswith("description:"):
                    collecting = True
                    continue
                if collecting:
                    if line and not line[0].isspace():
                        break
                    if line.strip():
                        description_lines.append(line.strip())
            description = " ".join(description_lines)
        else:
            description = raw_description.strip("\"'")
    if not name:
        error(messages, skill_file, "missing skill name")
    if not description_match:
        error(messages, skill_file, "missing skill description")

    return name, description, body


def validate_skill(messages: list[str], skill_dir: Path) -> None:
    skill_file = skill_dir / "SKILL.md"
    metadata_file = skill_dir / "agents" / "openai.yaml"

    if not skill_file.is_file():
        error(messages, skill_dir, "missing SKILL.md")
        return
    if not metadata_file.is_file():
        error(messages, skill_dir, "missing agents/openai.yaml")

    text = skill_file.read_text(encoding="utf-8")
    name, description, body = parse_frontmatter(messages, skill_file, text)

    if name and name != skill_dir.name:
        error(messages, skill_file, f"name '{name}' does not match folder '{skill_dir.name}'")
    if name and not re.fullmatch(r"[a-z0-9-]{1,63}", name):
        error(messages, skill_file, "name must use lowercase letters, digits, and hyphens")

    if len(text.splitlines()) >= 500:
        error(messages, skill_file, "skill must remain under 500 lines")
    if len(body.strip()) < 200:
        error(messages, skill_file, "body is too small to define a useful workflow")
    if len(description) < 80:
        error(messages, skill_file, "description is too short to define useful triggers")
    if not re.search(r"\bUse (?:for|when|as)\b", description, re.IGNORECASE):
        error(messages, skill_file, "description must state when or what to use the skill for")

    for placeholder in PLACEHOLDERS:
        if placeholder.lower() in text.lower():
            error(messages, skill_file, f"contains placeholder '{placeholder}'")

    if metadata_file.is_file():
        metadata = metadata_file.read_text(encoding="utf-8")
        for field in ("display_name", "short_description", "default_prompt"):
            if not re.search(rf"^\s{{2}}{field}:\s*\".+\"\s*$", metadata, re.MULTILINE):
                error(messages, metadata_file, f"missing quoted interface.{field}")
        if name and f"${name}" not in metadata:
            error(messages, metadata_file, f"default_prompt must mention '${name}'")
        display_name = re.search(
            r'^\s{2}display_name:\s*"([^"]+)"\s*$',
            metadata,
            re.MULTILINE,
        )
        expected_display_name = EXPECTED_DISPLAY_NAMES.get(skill_dir.name)
        if (
            display_name
            and expected_display_name
            and display_name.group(1) != expected_display_name
        ):
            error(
                messages,
                metadata_file,
                "interface.display_name must match the canonical role or engine name "
                f"'{expected_display_name}'",
            )
        short_description = re.search(
            r'^\s{2}short_description:\s*"([^"]+)"\s*$',
            metadata,
            re.MULTILINE,
        )
        if short_description and not 25 <= len(short_description.group(1)) <= 64:
            error(
                messages,
                metadata_file,
                "interface.short_description must contain 25-64 characters",
            )


def validate_agent_contract(messages: list[str]) -> None:
    agent_file = ROOT / "Agent.md"
    if not agent_file.is_file():
        return

    text = agent_file.read_text(encoding="utf-8")
    for marker in REQUIRED_AGENT_MARKERS:
        if marker not in text:
            error(messages, agent_file, f"missing required Ultimate OS marker '{marker}'")
    for mode in REQUIRED_MODE_ROWS:
        if not re.search(rf"^\|\s*{re.escape(mode)}\s*\|", text, re.MULTILINE):
            error(messages, agent_file, f"missing canonical operating mode row '{mode}'")
    for pattern in DEFENSIVE_SECURITY_PATTERNS:
        if not re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            error(
                messages,
                agent_file,
                f"missing defensive-security contract pattern '{pattern}'",
            )


def validate_universal_prompts(messages: list[str]) -> None:
    for profile, prompt_file in UNIVERSAL_PROMPTS.items():
        if not prompt_file.is_file():
            continue

        text = prompt_file.read_text(encoding="utf-8")
        for marker in UNIVERSAL_PROMPT_MARKERS:
            if marker not in text:
                error(
                    messages,
                    prompt_file,
                    f"missing universal contract marker '{marker}'",
                )
        for mode in REQUIRED_MODE_ROWS:
            if not re.search(rf"\b{re.escape(mode)}\b", text):
                error(
                    messages,
                    prompt_file,
                    f"missing canonical operating mode '{mode}'",
                )
        for pattern in DEFENSIVE_SECURITY_PATTERNS:
            if not re.search(pattern, text, re.IGNORECASE | re.DOTALL):
                error(
                    messages,
                    prompt_file,
                    f"missing defensive-security contract pattern '{pattern}'",
                )

        if profile == "full" and len(text.encode("utf-8")) > 30_000:
            error(
                messages,
                prompt_file,
                "Full prompt must remain at or below 30,000 UTF-8 bytes",
            )
        if profile == "compact" and len(text.splitlines()) >= 200:
            error(
                messages,
                prompt_file,
                "Compact prompt must remain under 200 lines",
            )
        if profile == "micro":
            crlf_length = len(text.replace("\n", "\r\n"))
            if crlf_length > 1_500:
                error(
                    messages,
                    prompt_file,
                    "Micro prompt exceeds 1,500 characters when normalized "
                    f"to CRLF ({crlf_length})",
                )

    activation_file = ADAPTERS / "universal" / "MEW-ACTIVATION-MESSAGE.md"
    if activation_file.is_file():
        activation_text = activation_file.read_text(encoding="utf-8")
        for pattern in DEFENSIVE_SECURITY_PATTERNS:
            if not re.search(
                pattern,
                activation_text,
                re.IGNORECASE | re.DOTALL,
            ):
                error(
                    messages,
                    activation_file,
                    f"missing defensive-security activation pattern '{pattern}'",
                )


def load_toml(messages: list[str], path: Path) -> dict[str, object] | None:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, tomllib.TOMLDecodeError) as exc:
        error(messages, path, f"cannot parse TOML: {exc}")
        return None


def validate_model_routing(messages: list[str]) -> None:
    routing_files = (
        ROOT / "Agent.md",
        ROOT / "docs" / "model-routing.md",
        ADAPTERS / "universal" / "MEW-ACTIVATION-MESSAGE.md",
        *UNIVERSAL_PROMPTS.values(),
    )
    for path in routing_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for marker in MODEL_ROUTING_MARKERS:
            if not re.search(rf"\b{re.escape(marker)}\b", text, re.IGNORECASE):
                error(messages, path, f"missing model-routing marker '{marker}'")

    recovery_files = (
        ROOT / "docs" / "model-routing.md",
        ROOT / "templates" / "MODEL_ROUTING_PLAN.md",
        ADAPTERS / "codex" / "README.md",
    )
    for path in recovery_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for marker in ("state_unknown", "ownership", "idempotency", "approval"):
            if not re.search(rf"\b{re.escape(marker)}\b", text, re.IGNORECASE):
                error(messages, path, f"missing failover-recovery marker '{marker}'")

    effort_policy_files = (
        ROOT / "docs" / "model-routing.md",
        ADAPTERS / "codex" / "README.md",
    )
    effort_ladders = (
        ("Program Director", "Sol", ("medium", "high", "xhigh", "max", "ultra")),
        ("Project Manager", "Terra", ("medium", "high", "xhigh", "max", "ultra")),
        ("Worker", "Luna", ("medium", "high", "xhigh", "max")),
    )
    for path in effort_policy_files:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for profile, model, efforts in effort_ladders:
            pattern = ".*?".join(
                (re.escape(profile), re.escape(model), *(re.escape(value) for value in efforts))
            )
            if not re.search(pattern, text, re.IGNORECASE | re.DOTALL):
                error(
                    messages,
                    path,
                    f"missing ordered {profile}/{model} effort ladder",
                )
        for marker in ("Extra High", "runtime", "reasoning.effort"):
            if marker.lower() not in text.lower():
                error(messages, path, f"missing effort-policy marker '{marker}'")
        if not re.search(
            r"Ultra.{0,240}(?:not|Do not).{0,160}(?:portable|API)",
            text,
            re.IGNORECASE | re.DOTALL,
        ):
            error(
                messages,
                path,
                "must distinguish Ultra from a portable API reasoning effort",
            )
        for line in text.splitlines():
            if re.search(r"(?:\|\s*Worker\s*\||Worker\s*/\s*Luna\s*:)", line):
                if "ultra" in line.lower():
                    error(messages, path, "Worker/Luna effort ladder must stop at max")

    effort_templates = (
        ROOT / "templates" / "AI_RUNTIME_PROFILE.md",
        ROOT / "templates" / "MODEL_ROUTING_PLAN.md",
    )
    for path in effort_templates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for marker in ("actual effort", "runtime", "Ultra"):
            if marker.lower() not in text.lower():
                error(messages, path, f"missing effort-record marker '{marker}'")

    if CODEX_CONFIG.is_file():
        config = load_toml(messages, CODEX_CONFIG)
        if config is not None:
            expected_root = {
                "model": "gpt-5.6-sol",
                "model_reasoning_effort": "medium",
            }
            for key, expected in expected_root.items():
                if config.get(key) != expected:
                    error(
                        messages,
                        CODEX_CONFIG,
                        f"{key} must be '{expected}' in the dated Codex example",
                    )
            agents = config.get("agents")
            if not isinstance(agents, dict):
                error(messages, CODEX_CONFIG, "missing [agents] table")
            else:
                expected_agents = {
                    "enabled": True,
                    "max_concurrent_threads_per_session": 3,
                    "default_subagent_model": "gpt-5.6-terra",
                    "default_subagent_reasoning_effort": "medium",
                }
                for key, expected in expected_agents.items():
                    if agents.get(key) != expected:
                        error(
                            messages,
                            CODEX_CONFIG,
                            f"agents.{key} must be {expected!r}",
                        )

    agent_dir = ADAPTERS / "codex" / "agents"
    names: set[str] = set()
    for filename, expected in CODEX_AGENT_SPECS.items():
        path = agent_dir / filename
        if not path.is_file():
            continue
        config = load_toml(messages, path)
        if config is None:
            continue
        for key in ("name", "description", "developer_instructions", "sandbox_mode"):
            value = config.get(key)
            if not isinstance(value, str) or not value.strip():
                error(messages, path, f"missing non-empty '{key}'")
        for key, expected_value in expected.items():
            actual = config.get(key)
            if expected_value is None:
                if key in config:
                    error(
                        messages,
                        path,
                        f"agent must not pin '{key}' in the dynamic-effort adapter",
                    )
            elif actual != expected_value:
                error(messages, path, f"{key} must be '{expected_value}'")
        name = config.get("name")
        if isinstance(name, str):
            if name in names:
                error(messages, path, f"duplicate custom-agent name '{name}'")
            names.add(name)
        instructions = config.get("developer_instructions")
        if isinstance(instructions, str):
            for marker in ("MQAF", "Mew Orchestrator"):
                if marker not in instructions:
                    error(messages, path, f"instructions must preserve '{marker}'")
            if not re.search(r"\b(return|handoff)\b", instructions, re.IGNORECASE):
                error(messages, path, "instructions must define a return or handoff")


def validate_links(messages: list[str], markdown_file: Path) -> None:
    text = markdown_file.read_text(encoding="utf-8")
    for label in FORBIDDEN_EVIDENCE_LABELS:
        if label.lower() in text.lower():
            error(
                messages,
                markdown_file,
                f"uses non-canonical evidence label '{label}'",
            )
    for raw_target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
        target = raw_target.strip().strip("<>")
        if (
            not target
            or target.startswith(("#", "http://", "https://", "mailto:"))
            or "://" in target
        ):
            continue
        target = target.split("#", 1)[0]
        linked = (markdown_file.parent / target).resolve()
        if not linked.exists():
            error(messages, markdown_file, f"broken local link '{raw_target}'")


def main() -> int:
    messages: list[str] = []

    for required in (
        *REQUIRED_ROOT,
        *REQUIRED_DOCS,
        *REQUIRED_TEMPLATES,
        *REQUIRED_ADAPTERS,
    ):
        if not required.is_file():
            error(messages, required, "required root entrypoint is missing")

    if not SKILLS.is_dir():
        error(messages, SKILLS, "skills directory is missing")
    else:
        skill_dirs = sorted(path for path in SKILLS.iterdir() if path.is_dir())
        if not skill_dirs:
            error(messages, SKILLS, "no skills found")
        discovered = {path.name for path in skill_dirs}
        missing = sorted(EXPECTED_SKILLS - discovered)
        unexpected = sorted(discovered - EXPECTED_SKILLS)
        if missing:
            error(messages, SKILLS, f"missing expected skills: {', '.join(missing)}")
        if unexpected:
            error(messages, SKILLS, f"unexpected skill directories: {', '.join(unexpected)}")
        for skill_dir in skill_dirs:
            validate_skill(messages, skill_dir)

    validate_agent_contract(messages)
    validate_universal_prompts(messages)
    validate_model_routing(messages)

    for markdown_file in sorted(ROOT.rglob("*.md")):
        if any(part in ("node_modules", ".next", ".git") for part in markdown_file.parts):
            continue
        validate_links(messages, markdown_file)

    if messages:
        print("MQAF validation failed:")
        for message in messages:
            print(f"- {message}")
        return 1

    skill_count = sum(1 for path in SKILLS.iterdir() if path.is_dir())
    markdown_count = sum(
        1 for path in ROOT.rglob("*.md")
        if not any(part in ("node_modules", ".next", ".git") for part in path.parts)
    )
    print(f"MQAF validation passed: {skill_count} skills, {markdown_count} Markdown files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
