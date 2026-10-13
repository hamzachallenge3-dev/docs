# Mintlify Starter Kit

## الإضافة الواحدة — Hamza Agent Hub

كل الشغل في **إضافة MCP واحدة**: [`hamza-agent-hub/`](./hamza-agent-hub/)

| المصدر | داخل الإضافة |
|---|---|
| ECC68 Build Kit (68 وكيلاً) | `packs/ecc68/` |
| Automation Desk / Hamza Hub | `packs/desk/` |
| Cross-Forge / Plugin Builder | `packs/forge/` |
| Hub Boss Tools Recovery 13 | `packs/tools13/` |
| الموزّع الذي يعرف الجميع | `hub-boss` |

- الوكلاء: **92** (hub-boss + hub-agent-browse + hub-freellmapi + desk + ecc + forge + tools13)
- تصفّح الكل: `hub_agent_browse` / `hub-agent-browse`
- النموذج المجاني: **FreeLLMAPI** (OSS) عبر `hub-freellmapi` — انظر `hamza-agent-hub/docs/FREELLMAPI.md`
- حزمة ChatGPT/Codex Store: `hamza-agent-hub/chatgpt-plugin/` + `CODEX-HANDOFF.md` لـ Codex
- إعداد Cursor: [`cursor-mcp.hamza-agent-hub.example.json`](./cursor-mcp.hamza-agent-hub.example.json)
- الدليل: [`hamza-agent-hub/README.md`](./hamza-agent-hub/README.md)

`ecc68-lab/` مجرد مؤشر قديم — لا تثبّته كإضافة منفصلة.

---

Use the starter kit to get your docs deployed and ready to customize.

Click the green **Use this template** button at the top of this repo to copy the Mintlify starter kit. The starter kit contains examples with

- Guide pages
- Navigation
- Customizations
- API reference pages
- Use of popular components

**[Follow the full quickstart guide](https://starter.mintlify.com/quickstart)**

## AI-assisted writing

Set up your AI coding tool to work with Mintlify:

```bash
npx skills add https://mintlify.com/docs
```

This command installs Mintlify's documentation skill for your configured AI tools like Claude Code, Cursor, Windsurf, and others. The skill includes component reference, writing standards, and workflow guidance.

See the [AI tools guides](/ai-tools) for tool-specific setup.

## Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mint) to preview your documentation changes locally. To install, use the following command:

```
npm i -g mint
```

Run the following command at the root of your documentation, where your `docs.json` is located:

```
mint dev
```

View your local preview at `http://localhost:3000`.

## Publishing changes

Install our GitHub app from your [dashboard](https://dashboard.mintlify.com/settings/organization/github-app) to propagate changes from your repo to your deployment. Changes are deployed to production automatically after pushing to the default branch.

## Need help?

### Troubleshooting

- If your dev environment isn't running: Run `mint update` to ensure you have the most recent version of the CLI.
- If a page loads as a 404: Make sure you are running in a folder with a valid `docs.json`.

### Resources
- [Mintlify documentation](https://mintlify.com)
