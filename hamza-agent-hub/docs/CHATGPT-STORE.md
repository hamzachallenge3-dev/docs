# ChatGPT + Codex plugin directory

This repo ships a ChatGPT/Codex-ready package under:

`chatgpt-plugin/hamza-agent-hub/`

## What you get

| Piece | Path |
|---|---|
| Codex / ChatGPT manifest | `.codex-plugin/plugin.json` |
| Portable manifest | `plugin.json` |
| MCP pointer | `.mcp.json` / `mcp.json` |
| Skills | `skills/*/SKILL.md` |
| Logo | `assets/logo.svg` |
| Pack script | `scripts/pack-chatgpt-plugin.sh` |
| Codex paste prompt | `CODEX-HANDOFF.md` |

## Strengthenments already in the MCP server

- Tool annotations: `readOnlyHint`, `openWorldHint`, `destructiveHint` on every tool
- Public `GET /healthz`
- Domain verification: `GET /.well-known/openai-apps-challenge` (set `HAH_OPENAI_APPS_CHALLENGE`)
- FreeLLMAPI + agent browse + hub-boss full roster

## Local pack

```bash
cd hamza-agent-hub
./scripts/pack-chatgpt-plugin.sh
# → dist/hamza-agent-hub-chatgpt-plugin.zip
```

## Test in ChatGPT (Developer / Work mode)

1. Deploy MCP over HTTPS (`HAH_TRANSPORT=http`, reverse proxy TLS).
2. ChatGPT → Plugins → Add custom MCP server → `https://YOUR-HOST/mcp`.
3. Copy the `plugin_asdk_app…` id into `.app.json`.
4. Install from your local marketplace or upload the ZIP in the Platform Plugins portal.
5. Or paste `CODEX-HANDOFF.md` into **Codex in ChatGPT** and ask it to finish store packaging.

## Public directory submission

Portal: https://platform.openai.com/plugins  
Docs: https://developers.openai.com/plugins/deploy/submission

Checklist:

1. Verified developer identity
2. Upload ZIP from `pack-chatgpt-plugin.sh`
3. Connect production HTTPS MCP + domain challenge token
4. Fix scan findings (annotations already set)
5. Provide 5 positive + 3 negative test cases (see below)
6. Demo recording + release notes
7. Submit → after approval → Publish

### Positive test cases

1. `hub_health` → ok true, agents ≥ 92  
2. `hub_agent_browse` query `SEO` → includes `tool13-seo-audit`  
3. `hub_boss_route` task security login.py → primary `ecc-security-reviewer`  
4. `seo_audit_html` with sample HTML → score object  
5. `clean_leads` with duplicate emails → deduped count  

### Negative test cases

1. `run_agent` unknown `agent_id` → error  
2. `task_status` fake id → not found  
3. `hub_freellmapi_chat` when gateway down → clear error (no fake success)

## Auth note

The ChatGPT submission portal prefers OAuth / none for MCP connect. Lab Bearer (`HAH_AUTH_TOKEN`) works for private HTTPS installs; for public directory you may need to put the gateway behind an OAuth-capable proxy or OpenAI-supported auth. See portal MCP authentication reference.
