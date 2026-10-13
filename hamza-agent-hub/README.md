# Hamza Agent Hub — إضافة موحّدة جديدة

إضافة MCP واحدة تجمع **كل شيء من Hamza Agent Hub / Automation Desk** مع **ECC68** في حزمة واحدة قابلة للتشغيل.

> هذه إضافة مختبر جديدة. لا تعدّل الإنتاج ولا إعدادات GLM/Headroom الإنتاجية.

## الحزم (Packs)

| Pack | المحتوى |
|---|---|
| `hub` | `hub-boss` — يفرّق الشغل على كل الحزم |
| `desk` | أدوات Automation Desk + وكلاء Inbox / Weekly Report / Meeting-to-Action |
| `ecc68` | 68 وكيل ECC مع نفس الملفات الأصلية المثبّتة |
| `forge` | Cross-forge intelligence + GitHub tricks + agent mining |

**المجموع: 77 وكيلاً** (1 hub + 4 desk + 68 ecc + 4 forge)

## أدوات MCP

**Hub:** `hub_health` · `hub_list_packs` · `hub_list_agents` · `hub_boss_route` · `run_agent` · `task_status` · `task_result` · `cancel_task`

**Desk (مطابقة desk.imdifferent01.com):** `clean_leads` · `sheets_to_json` · `extract_contacts`

**Forge:** `forge_detect` · `github_url_tricks` · `agent_mining_queries`

## التشغيل

```bash
cd hamza-agent-hub
npm install
npm run build
npm test
./scripts/start.sh
```

صلها بـ Cursor عبر `cursor-mcp.example.json` (stdio).

## مهمة تجريبية

```text
run_agent(
  agent_id="hub-boss",
  task="Clean these leads then security-review login.py: a@x.com b@x.com a@x.com",
  workspace_id="demo",
  idempotency_key="hub-1"
)
```

الـ boss يوزّع على Desk و/أو ECC حسب المهمة.

## المصادر

- Automation Desk الحي: https://desk.imdifferent01.com
- ECC upstream: `packs/ecc68/upstream-ecc/`
- Plugin-builder architecture: `attribution/PLUGIN_TARGET_ARCHITECTURE.md`
