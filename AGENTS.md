# AGENTS.md — Instructions for AI Coding Assistants

Welcome, AI agent! This repository is **Agent Base**, a lightweight, hackable foundation designed for developers ("vibe coders") to build domain-specific autonomous AI agents in minutes.

The entire point of Agent Base is that **the plumbing is already solved**. When the user asks you to build or adapt this agent, your job is to add the domain logic (tools, prompt, state, UI chips) **without breaking or rewriting the core infrastructure**.

---

## 🧭 Repository Map & Extension Seams

| File | Purpose | Should You Edit It? |
| :--- | :--- | :--- |
| `src/agent/tools.js` | **Primary Extension Point.** Tool definitions, Zod schemas, execution handlers. | **YES!** Add the user's custom tools here. |
| `src/agent/systemPrompt.js` | **Agent Persona & Rules.** The prompt fed to the model on every iteration. | **YES!** Tailor the persona and instructions to the user's task. |
| `src/state/state.js` | **Environment State Store.** Resources, items, tasks, and dry-run flag. | **YES!** Adapt the state model to represent the user's domain (DB, files, cloud, etc.). |
| `public/index.html` | **UI Layout.** Suggestion chips, branding title, sidebar headers. | **YES!** Update suggestion chips and titles to match the agent's purpose. |
| `test/verify.js` | **Unit Test Suite.** Self-verification tests. | **YES!** Add tests for newly added tools and run `npm test`. |
| `src/agent/loop.js` | **Autonomous Agent Loop.** Multi-turn loop, SSE streaming, Gemini repairs, steering, approvals. | ⚠️ **DO NOT TOUCH** unless fixing loop mechanics. |
| `src/agent/config.js` | **AI Provider Config.** OpenAI SDK client, keyless local endpoints, model discovery. | ⚠️ **DO NOT TOUCH** unless adding provider protocols. |
| `src/util/sse.js` | **SSE Manager.** Connection buffering, client replay, 15s heartbeats. | ⚠️ **DO NOT TOUCH** unless modifying event streams. |
| `src/server.js` | **Express Server.** REST API endpoints and static file serving. | ⚠️ **DO NOT TOUCH** unless adding new REST endpoints. |

---

## 🛠️ How to Add Tools (The Recipe)

In `src/agent/tools.js`, call `registerTool(...)`. You only need to provide a **Zod schema**; Agent Base automatically derives the OpenAI JSON schema for you!

### 1. Standard Query / Inspection Tool
```javascript
import { z } from 'zod';
import { registerTool } from './agent/tools.js';

registerTool({
  name: 'fetch_weather',
  description: 'Get current temperature and conditions for a city',
  destructive: false,
  schema: z.object({
    city: z.string().describe('City name or postal code')
  }),
  handler: async (args) => {
    // Return an object with ok: true and result data
    return { ok: true, result: { city: args.city, temp: '22C', condition: 'Sunny' } };
  }
});
```

### 2. Destructive Action (Triggers Approval Modal in Armed Mode)
When `destructive: true`, Agent Base automatically pauses the agent loop when Armed (dry-run = OFF) and opens an interactive confirmation modal in the web UI.
```javascript
registerTool({
  name: 'drop_database',
  description: 'Permanently drop a production database (DESTRUCTIVE)',
  destructive: true, // <--- Triggers user approval modal!
  schema: z.object({
    db_name: z.string().describe('Name of database to delete')
  }),
  handler: async (args) => {
    // If dry-run is on, simulate safe output:
    const dry = isDryRun();
    if (dry) {
      return { ok: true, result: { dryRun: true, deleted: args.db_name } };
    }
    // Live deletion logic here
    return { ok: true, result: { deleted: args.db_name } };
  }
});
```

### 3. Batch Tool with Live Progress Reporting
Batch tools can emit progress updates using `context.onProgress({ current, total, item, message })`, which renders live animated progress bars and item checkmarks in the web UI.
```javascript
registerTool({
  name: 'batch_process_items',
  description: 'Process multiple items sequentially with live progress feedback',
  destructive: false,
  schema: z.object({
    items: z.array(z.string().min(1)).min(1).describe('List of item IDs')
  }),
  handler: async (args, context = {}) => {
    const { onProgress } = context;
    const total = args.items.length;
    const results = [];

    for (let i = 0; i < total; i++) {
      const item = args.items[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          item,
          message: `Processing item ${i + 1}/${total}: ${item}`
        });
      }
      // Do work
      await new Promise((r) => setTimeout(r, 100));
      results.push({ item, status: 'processed' });
    }

    return { ok: true, result: { processed: results } };
  }
});
```

---

## 🎯 System Prompt Customization (`src/agent/systemPrompt.js`)

The prompt builder is called **on every loop iteration**, ensuring the agent always sees the freshest environment snapshot and dry-run state.

Keep these key sections in the prompt:
1. **Persona & Domain Role**: What the agent is specialized in.
2. **Operational Mode**: Notice whether Dry Run is ON or Armed.
3. **Inspect First Rule**: Always urge the agent to inspect state before modifying.
4. **Completion Rule**: Instruct the agent to call the `finish` tool with a markdown summary when its goal is achieved.
5. **State Snapshot**: Injected at the bottom as JSON.

---

## 📋 Rules for AI Coding Assistants

1. **Keep Tool Handlers Clean**: Always return `{ ok: true, result: ... }` on success and `{ ok: false, error: ... }` on catch. Never let unhandled rejections crash the server.
2. **Use Zod `.describe(...)`**: Always add `.describe()` to Zod fields so the LLM knows what format each argument expects.
3. **Never Remove the `finish` Tool**: The agent loop checks for the `finish` tool execution to declare a turn complete.
4. **Self-Verification Loop**: After adding new tools or updating logic, run `npm test` (`node test/verify.js`) to ensure all schemas and operations pass cleanly.
5. **Preserve User Steering & Streaming**: Do not replace the SSE stream or chat endpoints with standard blocking HTTP responses; the real-time UI depends on SSE events.
