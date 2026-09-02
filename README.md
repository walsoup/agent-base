# Agent Base ⚡

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?style=flat-square&logo=openai)](https://platform.openai.com/)
[![Express](https://img.shields.io/badge/Server-Express%204-000000?style=flat-square&logo=express)](https://expressjs.com/)

A foundational starter kit for building task-specific autonomous AI agents.

Clone this repository, describe the capabilities you want to your coding assistant, and let it generate the tools and prompts. The execution loop, streaming dashboard, and safety controls are already wired up.

---

## 💡 Why this exists

Whenever you want to build an AI agent for a specific task (DevOps, database operations, file transformations, web scraping, server management, personal assistant), 70% of the work is repetitive boilerplate plumbing:

- Writing the multi-turn tool execution loop and managing token context limits
- Wiring Server-Sent Events (SSE) with heartbeat pings and event buffers for late connections
- Building a browser interface to view the agent's actions and text responses
- Parsing reasoning tokens (`thought`, `reasoning_content`, and `<think>...</think>` tags) from thinking models
- Working around upstream model quirks (such as Gemini emitting concatenated JSON chunks or repeating tool names)
- Adding confirmation dialogs for destructive actions
- Implementing provider switching between OpenAI, OpenRouter, Groq, and local Ollama or LM Studio models

Agent Base provides all of that plumbing in one place. Instead of building infrastructure from scratch, you or your coding assistant add domain-specific tools, set the system instructions, and start using the agent right away.

---

## 💬 Direct prompts to build your agent

Open this repository in your AI coding assistant (Cursor, Claude Code, Windsurf, Copilot, or OpenCode) and ask it to adapt the codebase:

> "Turn this repository into a **Docker manager agent** that inspects running containers, reads logs, restarts services, and prunes unused images. Require confirmation before pruning images."

> "Turn this repository into a **GitHub pull request reviewer** that lists open pull requests, fetches diffs, checks for security issues, and posts comments."

> "Turn this repository into a **crypto portfolio agent** that fetches prices from CoinGecko, checks wallet balances, and calculates 24-hour profit and loss."

> "Turn this repository into a **research agent** that searches the web, extracts key details from articles, and saves markdown summaries."

Your coding assistant reads `AGENTS.md`, registers tools in `src/agent/tools.js`, updates the instructions in `src/agent/systemPrompt.js`, updates the sample prompts in the interface, runs the test suite, and gives you a working agent.

---

## ⚡ Quick start

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

## 🎨 Built-in UI themes

The web dashboard comes with 5 switchable themes accessible from the top bar or via the `data-theme` attribute:

| Theme | Key | Aesthetic |
| :--- | :--- | :--- |
| **Midnight Dark** (Default) | `dark` | Deep slate gray and blurple |
| **OLED Black** | `oled` | Pure pitch-black with emerald accents |
| **Catppuccin Mocha** | `catppuccin` | Warm pastel mauve and lavender |
| **Nord Frost** | `nord` | Arctic icy blues and cool slates |
| **Paper Light** | `light` | Crisp high-contrast editorial light theme |

Selected themes persist in `localStorage`. You can add custom palettes in `public/style.css` by defining a new `[data-theme="your-theme"]` block with CSS variables.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Web Dashboard (UI)                     │
│  • Model picker & presets      • Live SSE stream reader  │
│  • Chain-of-thought view       • Batch progress bars     │
│  • Resource explorer           • Theme switcher (5 looks)│
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

## 📁 Directory structure

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
├── public/               # Browser interface (with theme switcher)
└── test/
    └── verify.js         # Unit verification suite (run with npm test)
```

---

## 🛠️ Guide

### Adding tools
Register tools in `src/agent/tools.js` using `registerTool`. You only need a Zod schema; Agent Base derives the OpenAI JSON schema automatically:

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
    return { ok: true, result: `Service ${args.service_name} restarted.` };
  }
});
```

### Batch progress tools
Batch tools can report progress back to the interface using the `context.onProgress` callback:

```javascript
registerTool({
  name: 'batch_convert_files',
  description: 'Convert a list of files with live progress feedback',
  destructive: false,
  schema: z.object({
    files: z.array(z.string().min(1)).describe('Files to convert')
  }),
  handler: async (args, { onProgress }) => {
    const total = args.files.length;
    for (let i = 0; i < total; i++) {
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          item: args.files[i],
          message: `Converting file ${i + 1}/${total}: ${args.files[i]}`
        });
      }
      await processFile(args.files[i]);
    }
    return { ok: true, result: { count: total } };
  }
});
```

### Customizing state and system prompts
You can edit `src/state/state.js` and `src/agent/systemPrompt.js` directly, or configure them programmatically:

```javascript
import { setSystemPromptBuilder } from './agent/systemPrompt.js';
import { setInitialState } from './state/state.js';

// Set a custom initial state model
setInitialState({
  servers: [{ id: 'srv-1', name: 'api-gateway', status: 'healthy' }]
});

// Override the dynamic prompt generator
setSystemPromptBuilder((snapshot, dryRun) => {
  return `You are a system monitoring agent. Operating in ${dryRun ? 'dry-run' : 'live'} mode.`;
});
```

### REST API and SSE endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/state` | `GET` | Environment summary, active model, and dry-run flag |
| `/api/setup` | `GET`, `POST` | Provider credentials and baseURL configuration |
| `/api/config` | `GET`, `POST` | Runtime model and reasoning effort settings |
| `/api/models` | `GET` | Dynamic model listing from the upstream provider |
| `/api/snapshot` | `GET` | Full JSON state snapshot |
| `/api/chat` | `POST` | Start run or inject mid-flight steering message |
| `/api/stream/:runId` | `GET` | Real-time Server-Sent Events (SSE) stream |
| `/api/approve` | `POST` | Approve or deny a pending destructive tool call |
| `/api/dry-run` | `POST` | Toggle simulation or live armed execution mode |
| `/api/cancel` | `POST` | Cancel active execution run via AbortController |
| `/api/reset` | `POST` | Clear conversation history and active session state |

### Running the test suite
```bash
npm test
```

---

## 📜 License

MIT License. Copyright (c) 2026 walsoup.
