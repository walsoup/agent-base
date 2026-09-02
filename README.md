# Agent Base ⚡

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-412991?style=flat-square&logo=openai)](https://platform.openai.com/)
[![Express](https://img.shields.io/badge/Server-Express%204-000000?style=flat-square&logo=express)](https://expressjs.com/)

> **The hackable starter kit to vibe code your own autonomous AI agent.**
> Clone it, drop in your own tools and skills, tweak the prompt, and voila — your own custom agent with a polished web UI, real-time reasoning streams, safety gates, and multi-model support in minutes.

---

## 💡 Why this exists

Whenever you want to build an AI agent for a specific task (DevOps, database operations, file transformations, web scraping, server management, personal assistant), **80% of the work is repetitive boilerplate plumbing**:

- ❌ Re-implementing the multi-turn tool calling loop and token truncation.
- ❌ Setting up Server-Sent Events (SSE) with heartbeat pinging and buffer replay for late frontend connections.
- ❌ Building a frontend chat dashboard from scratch just to watch the agent think and act.
- ❌ Parsing reasoning tokens (`thought`, `reasoning_content`, `<think>...</think>` tags) so thinking models look good.
- ❌ Debugging upstream LLM quirks (e.g. Gemini concatenating JSON objects `}{` or repeating tool names).
- ❌ Building interactive confirmation modals for destructive or dangerous actions.
- ❌ Writing provider switching logic so you can swap between OpenAI, OpenRouter, Groq, and local Ollama/LM Studio models on the fly.

**Agent Base gives you all the hard plumbing out of the box.** 

It's not meant to be a rigid framework — **it's a foundation designed to be hacked on**. You replace the dummy tools with your own domain skills, write your instructions, and you're up and running.

---

## 🚀 How to vibe code your agent in 3 steps

### Step 1: Add your tools (`src/agent/tools.js`)
Use `registerTool` with [Zod](https://zod.dev/) validation to give your agent the skills it needs:

```javascript
import { z } from 'zod';
import { registerTool } from './agent/tools.js';

registerTool({
  name: 'deploy_service',
  description: 'Deploy a containerized microservice to production',
  destructive: true, // Automatically triggers approval popup in Armed mode!
  parameters: {
    type: 'object',
    properties: {
      service_name: { type: 'string', description: 'Name of service to deploy' },
      tag: { type: 'string', description: 'Container image tag' }
    },
    required: ['service_name', 'tag'],
    additionalProperties: false
  },
  schema: z.object({
    service_name: z.string().min(1),
    tag: z.string().min(1)
  }),
  handler: async (args, context) => {
    // Write your logic here — Docker, Cloud APIs, Shell commands, DB queries, etc.
    const result = await deployToCluster(args.service_name, args.tag);
    return { ok: true, result };
  }
});
```

### Step 2: Set your agent's persona & instructions (`src/agent/systemPrompt.js`)
Tell your agent what its role is, what rules to follow, and how to approach problems:

```javascript
export async function buildSystemPrompt(snapshot) {
  return `You are DevOps Agent, an autonomous infrastructure engineer.
- Always inspect services with \`get_state\` before deploying.
- Propose a plan before executing destructive operations.
- When finished, call the \`finish\` tool with a concise summary.`;
}
```

### Step 3: Run and vibe!
```bash
npm start
```
Open **[http://127.0.0.1:3700](http://127.0.0.1:3700)**. You now have:
- A live chat interface with markdown formatting.
- Streaming responses with expandable Chain-of-Thought thinking cards.
- Live progress bars for batch tasks.
- A model switcher (OpenAI, OpenRouter, Groq, Ollama, LM Studio) directly in the UI.
- Dry-run simulation mode vs Armed live execution with interactive approval modals.
- Mid-flight steering (type a new message while the agent is running to nudge its course).

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
└───��────────────────────────┬─────────────────────────────┘
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
    │  Your Custom Tools  │       │     State Store     │
    │  (Drop your skills  │       │  (Plug in your DB,  │
    │   in tools.js)      │       │   files, or state)  │
    └─────────────────────┘       └─────────────────────┘
```

---

## 🌟 What you get out of the box

### 1. Robust Agent Execution Loop (`src/agent/loop.js`)
- **Multi-turn dispatching**: Keeps calling tools and passing results back to the LLM until the agent reaches the `finish` tool or max iterations.
- **Provider Resilience**: Automatic repair for upstream provider quirks (like Gemini concatenating JSON chunks `{"a":1}{"b":2}` or repeating tool names).
- **Zod Validation**: Every tool argument is checked against a schema before your handler runs, avoiding silent type bugs.
- **Output Truncation**: Safeguards against context window explosion by truncating massive tool output strings.

### 2. Deep Reasoning & SSE Streaming
- **Chain of Thought**: Automatically catches thinking tokens (`reasoning_content`, `thought`, `delta.reasoning`, and inline `<think>...</think>` tags) and renders them in a collapsible, pulsing brain card in the UI.
- **Live Progress Bars**: Long-running batch tools emit `onProgress({ current, total, item })` events that render live animated progress bars and item checkmarks in the UI.

### 3. Safety: Dry-Run & Interactive Approval Gate
- **Dry-Run Mode**: When dry-run is toggled ON in the top bar, operations return safe preview objects without touching live data.
- **Armed Mode**: When dry-run is OFF, tools marked `destructive: true` automatically trigger a confirmation modal with argument inspection and keyboard shortcuts (`Enter` to approve, `Esc` to deny).

### 4. Mid-Flight Steering & Cancellation
- **Nudge mid-run**: Send instructions while the agent is running to adjust course without losing context.
- **Instant Abort**: Click Stop to cancel the active run cleanly via `AbortController`.

### 5. Universal Provider Switching (`src/agent/config.js`)
- One-click presets for **OpenAI**, **OpenRouter**, **Groq**, **Ollama**, and **LM Studio**.
- Support for keyless local endpoints (`http://localhost:11434/v1` or `http://localhost:1234/v1`).
- Dynamic `/models` endpoint discovery.
- Configurable reasoning effort tiers (`none`, `low`, `medium`, `high`) for o1, o3-mini, and DeepSeek-R1.

---

## 📁 Project Structure

```
agent-base/
├── package.json          # Clean dependencies (Express, OpenAI, Zod, Dotenv)
├── .env.example          # Environment template
├── .gitignore            # Clean git hygiene (no logs or secrets committed)
├── README.md             # This guide
├── src/
│   ├── server.js         # Express web server with REST & SSE endpoints
│   ├── agent/
│   │   ├── config.js     # AI provider configuration & OpenAI SDK client
│   │   ├── loop.js       # Core agent loop, streaming, steering, approvals
│   │   ├── systemPrompt.js # Dynamic system prompt builder
│   │   └── tools.js      # Tool registry (where you add your skills!)
│   ├── state/
│   │   └── state.js      # Generic environment state and dry-run manager
│   └── util/
│       ├── env.js        # .env file reading and persistence
│       ├── log.js        # Colored terminal and JSONL daily audit logger
│       └── sse.js        # SSE manager with heartbeats and client replay buffer
├── public/
│   ├── index.html        # Modern dark dashboard UI
│   ├── style.css         # Dark theme styling and animations
│   └── app.js           # Client-side streaming, markdown, and DOM interaction
└── test/
    └── verify.js         # Comprehensive unit verification suite
```

---

## ⚡ Quick Start

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

Or configure credentials directly through the **Setup & Config** button in the web UI.

```env
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gemini-3.7-flash
OPENAI_BASE_URL=
OPENAI_REASONING_EFFORT=none
PORT=3700
```

### 3. Run Tests

Verify all registry tools, state management, schema sanitizers, and loop helpers:

```bash
npm test
```

### 4. Start the Agent

```bash
npm start
```

Visit **[http://127.0.0.1:3700](http://127.0.0.1:3700)** in your browser.

---

## 🛠️ Tool Examples to Copy & Paste

Here are the 3 patterns you can use to add tools in `src/agent/tools.js`:

### Pattern 1: Simple Read / Query Tool
```javascript
registerTool({
  name: 'read_config_file',
  description: 'Read and return contents of a local configuration file',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to configuration file' }
    },
    required: ['file_path'],
    additionalProperties: false
  },
  schema: z.object({ file_path: z.string().min(1) }),
  handler: async (args) => {
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(args.file_path, 'utf8');
    return { ok: true, result: content };
  }
});
```

### Pattern 2: Destructive Action (Triggers Approval Modal in Armed Mode)
```javascript
registerTool({
  name: 'delete_cloud_instance',
  description: 'Permanently terminate a cloud virtual machine (DESTRUCTIVE).',
  destructive: true, // <--- Prompts the user before executing in Armed mode!
  parameters: {
    type: 'object',
    properties: {
      instance_id: { type: 'string', description: 'Cloud instance ID to terminate' }
    },
    required: ['instance_id'],
    additionalProperties: false
  },
  schema: z.object({ instance_id: z.string().min(1) }),
  handler: async (args) => {
    await terminateVM(args.instance_id);
    return { ok: true, result: { terminated: args.instance_id } };
  }
});
```

### Pattern 3: Batch Tool (Renders Live Progress Bar in UI)
```javascript
registerTool({
  name: 'batch_optimize_images',
  description: 'Compress and optimize a list of images with live progress updates',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      images: { type: 'array', items: { type: 'string' }, description: 'Image paths' }
    },
    required: ['images'],
    additionalProperties: false
  },
  schema: z.object({ images: z.array(z.string().min(1)) }),
  handler: async (args, { onProgress }) => {
    const total = args.images.length;
    for (let i = 0; i < total; i++) {
      const img = args.images[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          item: img,
          message: `Optimizing image ${i + 1}/${total}: ${img}`
        });
      }
      await optimize(img);
    }
    return { ok: true, result: { optimizedCount: total } };
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

---

## 📜 License

MIT License. Copyright (c) 2026 walsoup. Free to use, fork, and hack on!
