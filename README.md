# Agent Base

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?style=flat-square&logo=openai)](https://platform.openai.com/)
[![Express](https://img.shields.io/badge/Server-Express%204-000000?style=flat-square&logo=express)](https://expressjs.com/)

A foundational starter kit for building task-specific autonomous AI agents.

Clone this repository, describe the capabilities you want to your coding assistant, and let it generate the tools and prompts. The execution loop, streaming dashboard, and safety controls are already wired up.

---

## Why this exists

Building an agent for a specific task (DevOps, database operations, web scraping, personal workflows) usually stalls on the same repetitive plumbing:

- Writing the multi-turn tool execution loop and managing token context limits
- Wiring Server-Sent Events (SSE) with heartbeat pings and event buffers for late connections
- Building a browser interface to view the agent's actions and text responses
- Parsing reasoning tokens (`thought`, `reasoning_content`, and `<think>...</think>` tags) from thinking models
- Working around upstream model quirks (such as Gemini emitting concatenated JSON chunks or repeating tool names)
- Adding confirmation dialogs for destructive actions
- Implementing provider switching between OpenAI, OpenRouter, Groq, and local Ollama or LM Studio models

Agent Base provides all of that plumbing in one place. Instead of building infrastructure from scratch, you or your coding assistant add domain-specific tools, set the system instructions, and start using the agent right away.

---

## Direct prompts to build your agent

Open this repository in your AI coding assistant (Cursor, Claude Code, Windsurf, Copilot, or OpenCode) and ask it to adapt the codebase:

> "Turn this repository into a **Docker manager agent** that inspects running containers, reads logs, restarts services, and prunes unused images. Require confirmation before pruning images."

> "Turn this repository into a **GitHub pull request reviewer** that lists open pull requests, fetches diffs, checks for security issues, and posts comments."

> "Turn this repository into a **crypto portfolio agent** that fetches prices from CoinGecko, checks wallet balances, and calculates 24-hour profit and loss."

> "Turn this repository into a **research agent** that searches the web, extracts key details from articles, and saves markdown summaries."

Your coding assistant reads `AGENTS.md`, registers tools in `src/agent/tools.js`, updates the instructions in `src/agent/systemPrompt.js`, updates the sample prompts in the interface, runs the test suite, and gives you a working agent.

---

## Quick start

### 1. Clone and install dependencies
```bash
git clone https://github.com/walsoup/agent-base.git
cd agent-base
npm install
```

### 2. Add your API credentials
Copy the environment template:
```bash
cp .env.example .env
```

Set your provider details in `.env` (or configure them in the browser using the **Setup & Config** button):
```env
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gemini-3.7-flash
```

### 3. Start the server
```bash
npm start
```

Open [http://127.0.0.1:3700](http://127.0.0.1:3700) in your browser.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Web Dashboard (UI)                     │
│  • Model picker & presets      • Live SSE stream reader  │
│  • Chain-of-thought view       • Batch progress bars     │
│  • Resource explorer           • Interactive approval    │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼─────────────────────────────┐
│                   Express Server                         │
│  • /api/chat     • /api/stream/:id   • /api/approve      │
│  • /api/state    • /api/config       • /api/dry-run      │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                 Autonomous Agent Loop                    │
│                                                          │
│   1. Build dynamic system prompt from current state      │
│   2. Query model (OpenAI, OpenRouter, Groq, Ollama)      │
│   3. Stream text, reasoning tokens, and tool calls       │
│   4. Clean tool names and repair malformed JSON          │
│   5. Validate arguments with Zod schemas                 │
│   6. Pause for user approval on destructive actions      │
│   7. Run tool handler (with live progress events)        │
│   8. Store results in history and repeat until finish    │
└────────────────────────────┬─────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼───────────┐       ┌─────────▼───────────┐
    │     Agent Tools     │       │     State Store     │
    │  Add your custom    │       │  Connect to your    │
    │  tools in tools.js  │       │  database or files  │
    └─────────────────────┘       └─────────────────────┘
```

---

## Directory structure

```
agent-base/
├── AGENTS.md             # Instructions for coding assistants adapting this project
├── package.json          # Node dependencies (Express, OpenAI, Zod)
├── .env.example          # Environment template
├── .gitignore            # Git exclusion rules
├── README.md             # Project documentation
├── src/
│   ├── server.js         # Web server and API endpoints
│   ├── agent/
│   │   ├── loop.js       # Multi-turn loop, streaming, and approval logic
│   │   ├── tools.js      # Tool registry (where domain skills are added)
│   │   ├── systemPrompt.js # Dynamic system prompt generator
│   │   └── config.js     # Provider configuration (OpenAI, Groq, Ollama)
│   ├── state/
│   │   └── state.js      # Environment state store and dry-run flag
│   └── util/
│       ├── sse.js        # SSE manager with heartbeats and replay buffers
│       ├── log.js        # Audit logging to daily JSONL files
│       └── env.js        # .env persistence utilities
├── public/               # Browser interface
└── test/
    └── verify.js         # Unit verification suite (run with npm test)
```

---

## Tool definitions

Tools are registered in `src/agent/tools.js` using Zod schemas. Agent Base derives the OpenAI JSON schema automatically:

```javascript
import { z } from 'zod';
import { registerTool } from './agent/tools.js';

registerTool({
  name: 'restart_service',
  description: 'Restart a system service or background worker',
  destructive: true, // Prompts for confirmation when live mode is active
  schema: z.object({
    service_name: z.string().describe('Name of the service to restart')
  }),
  handler: async (args) => {
    // Execution logic here
    return { ok: true, result: `Service ${args.service_name} restarted.` };
  }
});
```

---

## License

MIT License. Copyright (c) 2026 walsoup.
