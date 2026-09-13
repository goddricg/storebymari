# Living Knowledge Packs

- Last source review: 2026-07-30
- Policy: use current official documentation and primary standards before consequential implementation decisions

This index routes Mew to authoritative sources. It does not freeze versions or override a target repository's installed stack and compatibility contract.

## Preferred greenfield web pack

| Capability | Preferred option when requirements fit | Official source |
|---|---|---|
| Full-stack web | Next.js and React with TypeScript | [Next.js](https://nextjs.org/docs/app), [React](https://react.dev/learn), [TypeScript](https://www.typescriptlang.org/docs/) |
| Styling | Tailwind CSS and accessible design primitives | [Tailwind CSS](https://tailwindcss.com/docs), [shadcn/ui](https://ui.shadcn.com/docs) |
| Animation | Motion with reduced-motion behavior | [Motion](https://motion.dev/docs/react) |
| Managed backend | Supabase when PostgreSQL/Auth/Storage fit | [Supabase](https://supabase.com/docs) |
| Hosting | Vercel for compatible web workloads | [Vercel](https://vercel.com/docs) |
| Edge/network | Cloudflare when its runtime and products fit | [Cloudflare](https://developers.cloudflare.com/) |
| Containers | Docker with reproducible least-privileged images | [Docker](https://docs.docker.com/) |

## Application and data pack

| Area | Technologies to understand | Official sources |
|---|---|---|
| JavaScript runtimes | Node.js, Bun | [Node.js](https://nodejs.org/docs/latest/api/), [Bun](https://bun.sh/docs) |
| Service languages | Go, Python | [Go](https://go.dev/doc/), [Python](https://docs.python.org/3/) |
| Data | PostgreSQL, Redis | [PostgreSQL](https://www.postgresql.org/docs/), [Redis](https://redis.io/docs/latest/) |
| Database access | Drizzle or Prisma selected by project fit | [Drizzle](https://orm.drizzle.team/docs/overview), [Prisma](https://www.prisma.io/docs) |
| Validation | Zod for TypeScript boundaries when appropriate | [Zod](https://zod.dev/) |
| Client state | Zustand only when React/local/URL/server state is insufficient | [Zustand](https://zustand.docs.pmnd.rs/) |
| Forms | React Hook Form when its model fits | [React Hook Form](https://react-hook-form.com/get-started) |
| Tables | TanStack Table | [TanStack Table](https://tanstack.com/table/latest/docs/introduction) |
| Charts | Recharts when SVG/React charting fits | [Recharts](https://recharts.org/en-US/guide) |
| Icons | Lucide | [Lucide](https://lucide.dev/guide/) |

## AI pack

| Area | Sources |
|---|---|
| OpenAI APIs and agents | [OpenAI platform docs](https://platform.openai.com/docs/), [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) |
| MCP | [Model Context Protocol specification](https://modelcontextprotocol.io/specification/latest) |
| Anthropic Claude | [Anthropic documentation](https://docs.anthropic.com/) |
| Google Gemini | [Gemini API documentation](https://ai.google.dev/gemini-api/docs) |
| AI security | [OWASP GenAI Security](https://genai.owasp.org/), [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) |

Treat models as interchangeable probabilistic components behind an evaluated model router. Do not encode a provider model name as timelessly "best."

## Quality standards pack

| Area | Primary source |
|---|---|
| Accessibility | [W3C WCAG overview](https://www.w3.org/WAI/standards-guidelines/wcag/) |
| Core Web Vitals | [web.dev Web Vitals](https://web.dev/articles/vitals) |
| Web application security | [OWASP projects](https://owasp.org/projects/) |
| Browser platform | [MDN Web Docs](https://developer.mozilla.org/docs/Web) |

Use Lighthouse as a repeatable laboratory signal. Prefer user-centered performance budgets and field Core Web Vitals for real experience. A score of 100 is an aspiration when feasible under fixed test conditions, not a universal release guarantee.
