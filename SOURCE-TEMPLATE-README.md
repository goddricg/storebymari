# Full Web Source Template

This is the full web source and static visual asset template. It preserves the existing pages, components, admin screens, API routes, product/order/support/top-up flows, MIMI/LINE/MCP implementation, tests, migrations, UI themes, and static assets.

It deliberately excludes all production data and connection material: environment files, credentials, deployment access notes, database dumps, user exports, uploaded product files, build output, installed dependencies, local scratch files, and maintenance scripts that target the previous production data.

## Before running

1. Run `npm ci`.
2. Create new environment files with new database and integration credentials. Do not reuse production credentials from the source system.
3. Replace the site name, public base URL, SEO text, logos, PWA icons, MIMI persona, LINE configuration, email configuration, and external-provider configuration for the new project.
4. Create a new empty database. Review the schema and migrations before applying them; they describe the original store's business model and contain no exported production rows in this archive.
5. Replace the old domain defaults before deployment. Do not point this template at the prior production database or integrations.

## Deliberately excluded

- `.env*`, deployment variables, access notes, database settings, user lists, JSON exports, SQL dumps, ZIP backups, and git history.
- `node_modules`, `.next`, temporary and scratch folders.
- Product uploads and posters under `public/uploads`.
- Standalone repair, inspection, data-patching, and production-maintenance scripts.
- The separate mobile application and its dependencies.

The source is intentionally a template rather than a ready-to-launch independent product. The visual layout and functional modules are present, but they need a new identity, an empty database, new credentials, and a review of business rules before use.
