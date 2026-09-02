# Agent Base ⚡

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?style=flat-square&logo=openai)](https://platform.openai.com/)
[![Express](https://img.shields.io/badge/Server-Express%204-000000?style=flat-square&logo=express)](https://expressjs.com/)

An autonomous, multi-turn AI agent framework with a modern web dashboard, real-time Server-Sent Events (SSE) streaming, Chain-of-Thought / reasoning token visualization, interactive safety approval gates, and mid-flight user steering.

Extracted from [Discord Architect](https://github.com/walsoup/discord-architect) as a clean, domain-agnostic agent core ready to power any tool-calling or systems engineering workflow.

---

## 🏗️ Architecture & Execution Flow

```
┌──────────────────────────────────────────────────────────┐
│                   Web Dashboard (UI)                     │
│  • Model Picker & Presets      • Live SSE Stream Reader  │
│  • Chain-of-Thought Card       • Batch Progress Bars     │
│  • State & Resource Explorer   • Interactive Modal Gate  │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTP POST / REST
                             │ Server-Sent Events (SSE)
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
│   2. Query LLM (OpenAI, OpenRouter, Groq, Ollama)       │
│   3. Stream chunks: text, reasoning tokens, tool calls   │
│   4. Normalize tool names & repair concatenated JSON     │
│   5. Validate arguments with Zod schemas                 │
│   6. If destructive & Armed -> request human approval    │
│   7. Execute tool handler (with live onProgress updates) │
│   8. Push results to conversation & loop until finish    │
└────────────────────────────┬─────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼───────────┐       ┌─────────▼───────────┐
    │  Registered Tools   │       │     State Store     │
    │  • get_state        │       │  • Workspaces       │
    │  • create_resource  │       │  • Resources        │
    │  • delete_resource  │       │  • Tasks            │
    │  • batch_tasks      │       │  • Dry-run toggle   │
    │  • finish           │       └─────────────────────┘
    └─────────────────────┘
```

---

## 🌟 Key Features

### 1. Robust Multi-Turn Agent Loop (`src/agent/loop.js`)
- **Autonomous Tool Resolution**: Executes consecutive tool calls until the agent calls `finish` or reaches iteration limits.
- **Provider Resilience**: Automatic repair for upstream provider idiosyncrasies (e.g. Gemini repeated tool names like `get_stateget_state` or concatenated JSON objects like `{"a":1}{"b":2}`).
- **Schema Safety**: Strict validation of every tool argument via [Zod](https://zod.dev/) before handlers run.
- **Context Budget Truncation**: Safeguards against token explosion by safely truncating massive tool output strings.

### 2. Deep Reasoning & Live SSE Streaming
- **Chain of Thought**: Automatically catches reasoning tokens (`reasoning_content`, `thought`, `delta.reasoning`) and inline `<think>...</think>` tags, rendering them in a collapsible, pulsing brain card.
- **Live Progress Bars**: Long-running batch tools emit `onProgress({ current, total, item })` events that render live animated progress bars and item checkmarks in the UI.

### 3. Safety First: Dry-Run & Approval Gates
- **Dry-Run Simulation**: Mutations generate simulated IDs and return preview objects without modifying actual data.
- **Armed Mode**: When live mode is enabled, any tool marked `destructive: true` pauses execution and displays an interactive modal with argument inspection and keyboard shortcuts (`Enter` to approve, `Esc` to deny).

### 4. Mid-Flight Steering & Cancellation
- **Mid-Flight User Steering**: Send instructions while the agent is iterating to nudge or correct its plan without wiping conversation history.
- **Instant Cancellation**: Immediate abort handling via `AbortController` cleanly stops backend model calls.

### 5. Universal Model & Provider Support (`src/agent/config.js`)
- Built-in presets for **OpenAI**, **OpenRouter**, **Groq**, **Ollama**, and **LM Studio**.
- Dynamic `/models` discovery endpoint.
- Support for keyless local endpoints (`http://localhost:11434/v1` or `http://localhost:1234/v1`).
- Configurable reasoning effort tiers (`none`, `low`, `medium`, `high`) for o1, o3-mini, and DeepSeek-R1.

---

## 📁 Repository Structure

```
agent-base/
├── package.json          # Standalone npm configuration (zero discord.js dependencies)
├── .env.example          # Environment variable template
├── .gitignore            # Git exclusion rules
├── README.md             # Project documentation
├── src/
│   ├── server.js         # Express web server with REST and SSE endpoints
│   ├── agent/
│   │   ├── config.js     # AI provider configuration & OpenAI SDK client
│   │   ├── loop.js       # Core agent loop, streaming, steering, approvals
│   │   ├── systemPrompt.js # Dynamic system prompt builder
│   │   └── tools.js      # Tool registry, Zod validation, OpenAI schema export
│   ├── state/
│   │   └── state.js      # Generic environment state and dry-run manager
│   └── util/
│       ├── env.js        # .env file reading and persistence
│       ├── log.js        # Colored terminal and JSONL daily audit logger
│       └── sse.js        # SSE manager with heartbeats and client replay buffer
├── public/
│   ├── index.html        # Modern dark dashboard
│   ├── style.css         # Dark theme styling and animations
│   └── app.js           # Client-side streaming, markdown, and DOM interaction
└── test/
    └── verify.js         # Comprehensive unit verification suite
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/walsoup/agent-base.git
cd agent-base
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` or set your keys directly through the **Setup & Config** button in the web UI:

```env
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gemini-3.7-flash
OPENAI_BASE_URL=
OPENAI_REASONING_EFFORT=none
PORT=3700
```

### 3. Run Test Suite

Verify all registry tools, state management, schema sanitizers, and loop helpers:

```bash
npm test
```

### 4. Start the Server

```bash
npm start
```

Visit **[http://127.0.0.1:3700](http://127.0.0.1:3700)** in your browser.

---

## 🛠️ Adding Custom Tools

Registering tools is simple with `registerTool` from `src/agent/tools.js`.

### Example 1: Simple Inspection Tool

```javascript
import { z } from 'zod';
import { registerTool } from './agent/tools.js';

registerTool({
  name: 'get_system_time',
  description: 'Retrieve current server timestamp in UTC and ISO formats',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  schema: z.object({}).passthrough(),
  handler: async () => {
    return { ok: true, result: { iso: new Date().toISOString(), timestamp: Date.now() } };
  }
});
```

### Example 2: Destructive Tool with Approval Gate

```javascript
registerTool({
  name: 'drop_database_table',
  description: 'Permanently drop a table from the database (DESTRUCTIVE).',
  destructive: true, // Prompts user approval in Armed mode!
  parameters: {
    type: 'object',
    properties: {
      table_name: { type: 'string', description: 'Table name to drop' }
    },
    required: ['table_name'],
    additionalProperties: false
  },
  schema: z.object({
    table_name: z.string().min(1)
  }),
  handler: async (args) => {
    // Database drop logic here
    return { ok: true, result: { dropped: args.table_name } };
  }
});
```

### Example 3: Batch Tool with Live Progress Reporting

```javascript
registerTool({
  name: 'batch_convert_files',
  description: 'Convert a list of files with live progress feedback',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths to convert'
      }
    },
    required: ['files'],
    additionalProperties: false
  },
  schema: z.object({
    files: z.array(z.string().min(1))
  }),
  handler: async (args, { onProgress }) => {
    const total = args.files.length;
    for (let i = 0; i < total; i++) {
      const file = args.files[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          item: file,
          message: `Converting file ${i + 1}/${total}: ${file}`
        });
      }
      await doHeavyWork(file);
    }
    return { ok: true, result: { converted: total } };
  }
});
```

---

## 📡 REST & SSE API Reference

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
| `/api/dry-run` | `POST` | Toggle simulation / live armed execution mode |
| `/api/cancel` | `POST` | Cancel active execution run via AbortController |
| `/api/reset` | `POST` | Clear conversation history and active session state |

### SSE Event Types

- `reasoning_delta`: Emitted when thinking tokens arrive.
- `assistant_delta`: Emitted when markdown content arrives.
- `tool_call`: Emitted when a tool invocation begins.
- `tool_progress`: Emitted during batch execution for real-time progress bar updates.
- `tool_result`: Emitted when a tool finishes execution.
- `approval_required`: Emitted when a destructive tool requires human confirmation.
- `snapshot_updated`: Emitted when a tool alters state so the UI updates in real-time.
- `steer`: Emitted when user sends mid-flight steering instructions.
- `done`: Emitted when the run finishes.
- `error`: Emitted on fatal execution errors.

---

## 📜 License

MIT License. Free for open-source and commercial use.
