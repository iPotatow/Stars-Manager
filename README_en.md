# Stars Manager

Stars Manager is a GitHub Star manager running on Cloudflare. One Worker serves the React SPA and authenticated APIs, with D1 for persistent data and Vectorize for similarity search.

[中文主文档](README.md) · [Cloudflare deployment guide](CLOUDFLARE.md)

## Product scope

- Search, categorize, annotate, and analyze starred repositories with AI
- Read, search, create, edit, delete, star, and unstar personal and starred Gists
- Subscribe to releases from starred repositories and configure watched or custom release sources
- Explore trending, hot-release, most-popular, topic, and repository search channels
- Track forks, upstream sync status, unread changes, and GitHub Actions workflows
- Filter release assets by platform and file type, then copy download links
- Run embedding-backed similarity search through the same Worker and Cloudflare Vectorize index
- Configure OpenAI, Anthropic, Ollama, and OpenAI-compatible AI endpoints
- Export and import local application data as a redacted snapshot
- Expose a read-only, stateless Streamable HTTP MCP endpoint at `POST /mcp`

## Categorization model

The default sidebar groups repositories by use case: Artificial Intelligence (LLM, Agent, RAG, MCP, and AI applications), Development (frontend/backend, frameworks, libraries, SDKs, and databases), Tools & Software (CLI, developer tools, productivity software, and automation), Operations & Deployment (Docker, servers, cloud services, and self-hosting), Network Security (networking, proxies, security, and privacy), Design Resources (UI, components, icons, and design), Learning Resources (tutorials, Awesome lists, books, and knowledge bases), and Creative Finds (interesting projects, demos, experiments, and inspiration). AI analysis uses repository metadata, Topics, and README content to assign application-type tags; languages and finer-grained topics remain available through tags, language, and search filters.

This version is designed around a single Cloudflare Worker runtime, with an application-owned authentication boundary, data model, visual theme, and repository classification model.

## Architecture

```text
Browser
  └─ Cloudflare Worker
       ├─ Static Assets (React + Vite)
       ├─ /api/*
       ├─ /mcp
       ├─ D1
       └─ Vectorize
```

Workspace login is controlled by Cloudflare Variables & Secrets (`ADMIN_USER`, `ADMIN_PASSWORD`, and an HMAC session secret). The GitHub token is validated after workspace login and stored encrypted in D1. The browser has no direct-service or local-backend fallback; `workers_dev` is disabled for production.

## Development and deployment

See [CLOUDFLARE.md](CLOUDFLARE.md). The main commands are:

```bash
npm install
npm run cf:dev
npm run cf:check
npm run cf:deploy
```

Run `npm run cf:migrate:remote` before a production deployment when D1 migrations are pending. Configure `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and (optionally) `ENCRYPTION_KEY` in Cloudflare before exposing the custom domain.

The current runtime does not include Electron, Express, Docker, aria2, SSE MCP, or a second local backend.

## License

[MIT](LICENSE)
