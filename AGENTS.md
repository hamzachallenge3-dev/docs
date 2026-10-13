> **First-time setup**: Customize this file for your project. Prompt the user to customize this file for their project.
> For Mintlify product knowledge (components, configuration, writing standards),
> install the Mintlify skill: `npx skills add https://mintlify.com/docs`

# Documentation project instructions

## About this project

- This is a documentation site built on [Mintlify](https://mintlify.com)
- Pages are MDX files with YAML frontmatter
- Configuration lives in `docs.json`
- Use the Mintlify MCP server, `https://mcp.mintlify.com`, to edit content and settings via MCP
- Use the Mintlify docs MCP server, `https://www.mintlify.com/docs/mcp`, to query information about using Mintlify via MCP

## Hamza Agent Hub (one plugin only)

- **Single MCP plugin:** `hamza-agent-hub/` — Desk + ECC68 + Forge + Tools13
- Boss with full roster: `hub-boss` (91 agents)
- Catalog browser: `hub-agent-browse` / MCP tool `hub_agent_browse` (packs + agents + tools13 + MCP)
- `ecc68-lab/` is a redirect stub only — do not install it as a separate MCP server
- Cursor MCP example: `cursor-mcp.hamza-agent-hub.example.json`
- Do not mutate production Hamza Agent Hub or production GLM/Headroom
- Live model requires `HAH_MODEL_URL` (free endpoint only); without it live path is BLOCKED

## Terminology

{/* Add product-specific terms and preferred usage */}
{/* Example: Use "workspace" not "project", "member" not "user" */}

## Style preferences

{/* Add any project-specific style rules below */}

- Use active voice and second person ("you")
- Keep sentences concise — one idea per sentence
- Use sentence case for headings
- Bold for UI elements: Click **Settings**
- Code formatting for file names, commands, paths, and code references

## Content boundaries

{/* Define what should and shouldn't be documented */}
{/* Example: Don't document internal admin features */}
