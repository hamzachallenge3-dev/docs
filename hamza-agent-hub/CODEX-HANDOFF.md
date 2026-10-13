# Paste this into Codex in ChatGPT

You are Codex working inside ChatGPT. Your job is to **make Hamza Agent Hub stronger** and finish packaging it as a **ChatGPT + Codex Plugin Directory** plugin (store-ready ZIP + MCP + skills).

## Context (already built)

Repo path: `hamza-agent-hub/` (one MCP plugin, not ecc68-lab).

Already included:

- 92 agents: `hub-boss`, `hub-agent-browse`, `hub-freellmapi`, Desk, ECC68×68, Forge, Tools13
- MCP tools with ChatGPT-required annotations (`readOnlyHint`, `openWorldHint`, `destructiveHint`)
- FreeLLMAPI open-source free gateway (`HAH_MODEL_PROVIDER=freellmapi` / alias `lotf`)
- ChatGPT package scaffold: `chatgpt-plugin/hamza-agent-hub/`
- Pack script: `scripts/pack-chatgpt-plugin.sh` → `dist/hamza-agent-hub-chatgpt-plugin.zip`
- Store notes: `docs/CHATGPT-STORE.md`

## Your mission

1. **Install & verify**
   - `cd hamza-agent-hub && npm install && npm run build && npm test`
   - `./scripts/pack-chatgpt-plugin.sh` and confirm ZIP contains `.codex-plugin/plugin.json` + skills

2. **Strengthen the plugin (code)**
   - Improve skill quality (clearer triggers, fewer hallucinations, Arabic+English prompts)
   - Add any missing store fields OpenAI Plugin Creator / scan findings require
   - Harden HTTP MCP for public HTTPS (CORS allowlist, auth mode compatible with ChatGPT portal)
   - Keep lab guards: no paid spend, no production GLM/Headroom mutation
   - Prefer FreeLLMAPI `model=auto` for live paths

3. **ChatGPT Plugin / Store packaging**
   - Follow https://developers.openai.com/plugins/build/plugins and submission guide
   - Keep both compatibility layout (`.codex-plugin/plugin.json`) and portable `plugin.json`
   - Fill `.app.json` once a `plugin_asdk_app…` id exists from ChatGPT custom MCP connect
   - Prepare listing copy, 5 positive + 3 negative test cases, release notes, demo script
   - Output a ready ZIP under `dist/`

4. **Deliverables back to the user**
   - Updated ZIP path
   - Exact steps to upload at https://platform.openai.com/plugins
   - Exact steps to test in ChatGPT Work / Plugins developer mode
   - Diff summary of strengthenments

## Constraints

- One plugin only (`hamza-agent-hub`). Do not revive `ecc68-lab` as a second plugin.
- Do not embed secrets in the ZIP.
- Do not claim Okara/Reddit posting or paid model access.
- If MCP host URL is unknown, keep `YOUR-PUBLIC-HOST` placeholders and document them.

## First command to run

```bash
cd hamza-agent-hub && npm test && ./scripts/pack-chatgpt-plugin.sh && ls -la dist/
```

Then open `docs/CHATGPT-STORE.md` and execute the store checklist.
