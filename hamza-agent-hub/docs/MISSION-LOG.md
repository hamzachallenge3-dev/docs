# Unified Hub — one plugin mission log

## Consolidation

All uploaded kits live in **this one plugin** (`hamza-agent-hub/`):

| Source | Location |
|---|---|
| ECC68 Build Kit | `packs/ecc68/` (+ `kit-original/`, legacy docs under `docs/legacy-ecc68*`) |
| Automation Desk / Hamza Hub | `packs/desk/` |
| Cross-Forge / Plugin Builder | `packs/forge/` |
| Hub Boss Tools Recovery 13 | `packs/tools13/` |
| Full-roster distributor | `hub-boss` in `packs/hub/` |
| Catalog browser | `hub-agent-browse` + `hub_agent_browse` |

`ecc68-lab/` at repo root is a redirect stub only.

## Boss + browse awareness

`hub-boss`:

- Scores **all 91 agents** (full roster)
- Writes `artifacts/hub-full-roster.md`
- Exposes `hub_full_roster` + `hub_agent_browse` + `hub_tools13_lookup`

`hub-agent-browse`:

- Searches packs, agents, tools13, and MCP surface tools
- Writes `artifacts/agent-browse.md`

## Latest verified routing

| Task | Primary |
|---|---|
| SEO audit HTML | `tool13-seo-audit` |
| Security review login.py | `ecc-security-reviewer` |
| Clean leads | `desk-*` |
| Lapian film pack | `tool13-lapian-notes` |

Roster size in routing plan: **91**  
Packs: hub, desk, ecc68, forge, tools13

## Install (only this plugin)

```bash
cd hamza-agent-hub
npm install && npm run build && npm test
./scripts/start.sh
```

Cursor: use root `cursor-mcp.hamza-agent-hub.example.json` or `cursor-mcp.example.json` here.
