# انتقل إلى الإضافة الواحدة

`ecc68-lab` **لم تعد إضافة مستقلة**.

كل محتوى ECC68 (68 وكيلاً + الـ chief) دُمج داخل:

**[`../hamza-agent-hub/`](../hamza-agent-hub/)**

هناك أيضاً:
- Automation Desk
- Cross-Forge
- Hub Boss Tools Recovery 13
- الموزّع `hub-boss` الذي يعرف الجميع (90 وكيلاً)

## ثبّت هذا فقط

```bash
cd ../hamza-agent-hub
npm install
npm run build
npm test
./scripts/start.sh
```

إعداد Cursor: انسخ  
[`../cursor-mcp.hamza-agent-hub.example.json`](../cursor-mcp.hamza-agent-hub.example.json)  
أو [`../hamza-agent-hub/cursor-mcp.example.json`](../hamza-agent-hub/cursor-mcp.example.json).

لا تضف `ecc68-lab` كـ MCP server منفصل.
