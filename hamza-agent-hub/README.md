# Hamza Agent Hub — الإضافة الواحدة

هذه **إضافة MCP واحدة** تجمع كل ما أعطيتَه في مكان واحد قابل للتشغيل:

| المصدر | أين صار داخل الإضافة |
|---|---|
| ECC68 Build Kit (68 وكيل) | `packs/ecc68/` |
| Automation Desk / Hamza Hub | `packs/desk/` + أدوات Desk |
| Cross-Forge / Plugin Builder | `packs/forge/` |
| Hub Boss Tools Recovery 13 | `packs/tools13/` |
| الموزّع الذي يعرف الجميع | `hub-boss` في `packs/hub/` |

لا تثبّت `ecc68-lab` كإضافة منفصلة — دُمجت هنا.

## الوكلاء: 90

- **1** `hub-boss` — يعرف الدليل الكامل ويفرّق المهام على الجميع
- **4** Desk
- **68** ECC
- **4** Forge
- **13** Tools13

## أدوات MCP الرئيسية

`hub_health` · `hub_list_packs` · `hub_list_agents` · `hub_full_roster` · `hub_boss_route` · `hub_tools13_lookup` · `run_agent` · `task_status` · `task_result` · `cancel_task` · `clean_leads` · `sheets_to_json` · `extract_contacts` · `seo_audit_html` · `forge_detect` · `github_url_tricks` · `agent_mining_queries`

## تثبيت واحد

```bash
cd hamza-agent-hub
npm install
npm run build
npm test
./scripts/start.sh
```

### Cursor (stdio) — إعداد واحد فقط

انسخ `cursor-mcp.example.json` (أو الملف في جذر المستودع `cursor-mcp.hamza-agent-hub.example.json`) إلى إعدادات MCP، واستبدل المسار المطلق، ثم أعد تحميل MCP.

```json
{
  "mcpServers": {
    "hamza-agent-hub": {
      "command": "node",
      "args": ["--experimental-sqlite", "/ABS/hamza-agent-hub/dist/index.js"],
      "env": { "HAH_TRANSPORT": "stdio", "HAH_CONCURRENCY": "2" }
    }
  }
}
```

## تجربة التوزيع

```text
run_agent(
  agent_id="hub-boss",
  task="SEO audit + clean leads + security review login.py",
  workspace_id="one",
  idempotency_key="one-plugin-1"
)
```

الـ boss يكتب:
- `artifacts/hub-full-roster.md` — كل الوكلاء الذين يعرفهم
- `artifacts/hub-routing-plan.json` — من اختار ولماذا

## حدود صريحة

- مختبر جديد — لا يعدّل إنتاج Hamza Agent Hub ولا GLM/Headroom الإنتاجي
- بدون `HAH_MODEL_URL` النموذج الحي = BLOCKED (المسار heuristic يعمل للاختبار)
- أوزان GLM/Kimi غير مضمّنة (روابط فقط في `packs/tools13/MODELS.md`)

## التحقق

```bash
npm test
python3 packs/tools13/scripts/verify_bundle.py
```
