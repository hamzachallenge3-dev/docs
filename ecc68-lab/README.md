# ECC68 Lab — إضافة MCP حقيقية بـ 68 وكيلاً

هذه **إضافة MCP قابلة للتشغيل** (ليست مجرد ملفات مهارات). بُنيت من الصفر داخل `ecc68-lab` وفق حزمة البناء ECC68.

الوكيل الذي **يفرّق الشغل على الباقي** هو `ecc-chief-of-staff`: يحلّل المهمة، يختار المختص الأساسي والمساندين، ويكتب خطة التوجيه ثم يوزّع التعيينات.

## ماذا تتضمّن؟

| المكوّن | الوصف |
|---|---|
| 68 وكيلاً | مسجّلون في `agents.json` + `profiles/*/UPSTREAM.md` (مصدر ECC مثبّت) |
| أدوات MCP | `list_agents` · `run_agent` · `task_status` · `task_result` · `cancel_task` · `health` |
| طابور دائم | SQLite + استعادة بعد إعادة التشغيل + idempotency + إلغاء فعلي |
| تزامن افتراضي | `2` على CPU مشترك |
| أمان | صلاحيات أدوات حسب الدور، عزل مساحة العمل، منع path traversal، تنقيح الأسرار |
| نموذج مجاني | عبر `ECC68_MODEL_URL` (متوافق مع OpenAI). إن لم يُضبط → التنفيذ الحي **BLOCKED** مع مسار heuristic للاختبارات |

## المتطلبات

- Node.js ≥ 22 (يستخدم `node:sqlite`)
- لا مدفوعات ولا GPU ولا Hermes

## التثبيت والتشغيل

```bash
cd ecc68-lab
npm install
npm run build
chmod +x scripts/start.sh
./scripts/start.sh
```

### اتصال Cursor (stdio)

1. انسخ `cursor-mcp.example.json` إلى إعدادات MCP في Cursor.
2. استبدل المسارات المطلقة بمسار مشروعك.
3. أعد تشغيل Cursor / MCP.

مثال:

```json
{
  "mcpServers": {
    "ecc68-lab": {
      "command": "node",
      "args": ["--experimental-sqlite", "/ABS/ecc68-lab/dist/index.js"],
      "env": {
        "ECC68_TRANSPORT": "stdio",
        "ECC68_CONCURRENCY": "2"
      }
    }
  }
}
```

### HTTP محلي (Streamable HTTP + Bearer)

```bash
export ECC68_TRANSPORT=http
export ECC68_AUTH_TOKEN='ضع-رمزا-قويا'
export ECC68_HOST=127.0.0.1
export ECC68_PORT=8787
./scripts/start.sh
```

نقطة الاتصال بعد التشغيل الفعلي فقط:

`http://127.0.0.1:8787/mcp`

للإنتاج خلف وكيل عكسي استخدم HTTPS. لا يوجد رفع لهذه الحزمة ZIP يربط أي شيء تلقائياً.

## متغيرات البيئة

انظر `.env.example`. لا تضع مفاتيح حقيقية في Git.

## استخدام الـ Chief

```text
run_agent(
  agent_id="ecc-chief-of-staff",
  task="مراجعة أمنية لملف login.py وتوزيع العمل",
  workspace_id="demo1",
  idempotency_key="demo-1"
)
```

ثم راقب بـ `task_status` / `task_result`. ستجد `artifacts/chief-routing-plan.json` مع الوكيل الأساسي المعين.

## الاختبارات

```bash
npm test
```

تُنشئ أيضاً `TEST-RESULTS.md` بجدول صادق لكل وكيل:

- `profile_load`
- `mocked_orchestration`
- `live_model` (BLOCKED بدون endpoint مجاني)
- `specialist_tools`

## الترخيص والمصدر

- كود هذا المختبر: MIT
- تعريفات الأدوار الأصلية من [affaan-m/ECC](https://github.com/affaan-m/ECC) — MIT  
  Commit مثبت في `attribution/UPSTREAM_COMMIT.txt`

## حدود صريحة

- هذه بيئة معزولة `ecc68-lab` — لا تعدّل Hamza Agent Hub الإنتاجي.
- بدون `ECC68_MODEL_URL` يُعتبر التنفيذ الحي للنموذج **محظوراً** (BLOCKED).
- أدوات الملفات محصورة داخل `workspaces/<workspace_id>` فقط — لا تنفيذ أوامر مضيف عشوائية.
