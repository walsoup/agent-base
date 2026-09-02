# AGENTS.md: Instructions for AI Coding Assistants

Welcome! You are reading this file because a developer has opened this repository with you (Claude Code, Cursor, Windsurf, OpenCode, Aider, Copilot, etc.) and wants to create a custom AI agent.

---

## The Prompt-Driven Workflow

The user will describe what kind of agent they want in natural language (such as "Make this a GitHub pull request reviewer", "Make this a Docker manager", or "Make this a crypto portfolio tracker").

Your job is to implement the domain logic for them:
1. Write the tool definitions in `src/agent/tools.js`.
2. Write the system prompt and instructions in `src/agent/systemPrompt.js`.
3. Adapt the state model in `src/state/state.js` if helpful.
4. Update the suggestion chips in `public/index.html`.
5. Verify your changes by running `npm test`.
6. Explain to the user what you built and instruct them to run `npm start`.

Do not ask the user to write boilerplate code, configure raw JSON schemas, or implement handlers manually. Implement the changes directly.

---

## The Extension Seams

Here is a map of the repository and where changes should go:

| File | Purpose | Notes |
| :--- | :--- | :--- |
| `src/agent/tools.js` | Tool registry. All capabilities the agent can invoke. | Add or replace tools matching the domain. Use `registerTool({...})`. |
| `src/agent/systemPrompt.js` | Agent instructions and rules. Injected into the model every turn. | Set the agent's persona, operational rules, and step-by-step instructions. |
| `src/state/state.js` | State and resource store. Displayed in the UI sidebar. | Update the state model to reflect the domain (containers, files, records). |
| `public/index.html` | Browser interface dashboard. | Update title, icon, and the 3 suggestion chips to match the new agent. |
| `test/verify.js` | Unit test suite. | Add verification tests for newly added tools and run `npm test`. |
| `src/agent/loop.js` | Multi-turn agent loop. | Works fine out of the box. No real need to touch this unless you specifically want to hack loop mechanics. |
| `src/util/sse.js` | SSE stream manager. | Works fine out of the box. Handles connection buffering and heartbeats. |
| `src/agent/config.js` | AI model configuration. | Works fine out of the box. Handles multi-provider support (OpenAI, Groq, Ollama). |
| `src/server.js` | Express server. | Works fine out of the box. Handles REST and SSE routing. |

---

## Tool Writing Guide

In `src/agent/tools.js`, call `registerTool(...)`. You only need to provide a Zod schema; Agent Base derives the OpenAI JSON schema automatically.

### 1. Standard Inspection or Query Tool
```javascript
import { z } from 'zod';
import { registerTool } from './agent/tools.js';

registerTool({
  name: 'get_container_status',
  description: 'Inspect status and resource metrics of a container',
  destructive: false,
  schema: z.object({
    container_id: z.string().describe('Container name or SHA hash')
  }),
  handler: async (args) => {
    return { ok: true, result: { id: args.container_id, status: 'running', uptime: '4h' } };
  }
});
```

### 2. Dangerous or Destructive Action (Interactive Approval Gate)
When `destructive: true`, Agent Base pauses execution in Armed mode and opens a confirmation dialog in the browser:
```javascript
registerTool({
  name: 'restart_container',
  description: 'Restart a container service (DESTRUCTIVE)',
  destructive: true, // Triggers confirmation dialog in browser
  schema: z.object({
    container_id: z.string().describe('Target container to restart')
  }),
  handler: async (args) => {
    return { ok: true, result: { restarted: args.container_id } };
  }
});
```

### 3. Batch Tool with Live Animated Progress Bar
Call `context.onProgress({ current, total, item, message })` to update the progress bar and checklist in the interface:
```javascript
registerTool({
  name: 'batch_prune_images',
  description: 'Prune multiple container images in batch',
  destructive: true,
  schema: z.object({
    image_ids: z.array(z.string()).min(1).describe('List of image IDs to prune')
  }),
  handler: async (args, context = {}) => {
    const { onProgress } = context;
    const total = args.image_ids.length;
    const results = [];

    for (let i = 0; i < total; i++) {
      const id = args.image_ids[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          item: id,
          message: `Pruning image ${i + 1}/${total}: ${id}`
        });
      }
      await new Promise((r) => setTimeout(r, 80));
      results.push({ id, deleted: true });
    }

    return { ok: true, result: { prunedCount: total, images: results } };
  }
});
```

---

## Step-by-Step Adaptation Workflow

When the user asks you to build a specific agent:

1. **Create the tools**:
   Open `src/agent/tools.js`. Add tools that give the agent the ability to query and act in the target domain. Keep the `finish` tool intact.
2. **Tailor the prompt**:
   Open `src/agent/systemPrompt.js`. Set the persona to an expert in that domain. Instruct it to plan before taking large actions and conclude by calling `finish`.
3. **Update UI chips**:
   Open `public/index.html`. Replace the 3 suggestion chips with sample prompts relevant to the new domain.
4. **Update state if helpful**:
   Open `src/state/state.js`. Update initial state so the left sidebar reflects the target domain.
5. **Run verification**:
   Run `npm test` to confirm all schemas and operations pass cleanly.
6. **Report back**:
   Summarize what was created and tell the user to run `npm start` to try their agent.
