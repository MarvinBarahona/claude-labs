# Technical — Tech Stack

Update as the system evolves.

- **Frontend:** Angular, latest version.
- **Frontend component library:** Spartan/ng (shadcn-style primitives on Tailwind + Angular CDK) — components are generated into the repo as owned source rather than installed as an opaque package. Chosen over Angular Material for a lighter, more elegant default look, and because AI-assisted edits work directly against the actual component source instead of a black-box dependency.
- **Backend:** NestJS (Node/TypeScript).
- **Backend HTTP adapter:** Express (NestJS's default, `@nestjs/platform-express`) — the broadest ecosystem and what most Nest examples assume; nothing about this app's traffic needs Fastify's extra throughput.
- **Backend env validation:** Zod, via `@nestjs/config`'s `validate` option — one schema library for env validation and for the Claude API SDK's own structured-output/tool-definition helpers (`zodOutputFormat`, `betaZodTool`, both Zod-based) instead of a second one (Joi) used only for config. DTO validation elsewhere still uses class-validator per the existing Nest convention, unaffected by this.
- **Backend external HTTP calls:** `@nestjs/axios` (`HttpService`) for every external data-source call (GitHub, Open-Meteo, arXiv, Wikimedia Commons) — injectable via DI and easy to mock in unit tests, per the convention of putting an external API client behind a DI token rather than calling it directly from a service.
- **Runtime:** both apps are built and run exclusively through Docker; no local Node/Angular/Nest CLI install is assumed. The frontend container runs the Angular CLI dev server (`ng serve`), not a built static bundle — its own dev-server proxy is what connects it to the backend (see `architecture.md`); there's no separate production build in scope. `CLAUDE.md` carries the actual `docker compose` commands once the projects are scaffolded.

Coding conventions for each stack (how the code is written, not what the stack is) aren't tracked here.
