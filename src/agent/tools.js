import { z } from 'zod';
import { getStateSnapshot, updateState, isDryRun } from '../state/state.js';
import { auditLog } from '../util/log.js';

/**
 * Tool registry holding all tool definitions.
 * Format of each tool definition:
 * {
 *   name: string,
 *   description: string,
 *   destructive: boolean, // if true and dryRun is false, triggers user approval modal
 *   parameters: object,  // JSON Schema for OpenAI function calling
 *   schema: z.ZodSchema, // Zod schema for runtime validation
 *   handler: async (args, context) => ({ ok: boolean, result?: any, error?: string })
 * }
 */
export const toolsRegistry = new Map();

/**
 * Register a tool definition in the global registry.
 */
export function registerTool(toolDef) {
  if (!toolDef.name || typeof toolDef.name !== 'string') {
    throw new Error('Tool must have a valid name string');
  }
  if (!toolDef.parameters || typeof toolDef.parameters !== 'object') {
    throw new Error(`Tool "${toolDef.name}" must define JSON Schema parameters`);
  }
  if (!toolDef.schema) {
    throw new Error(`Tool "${toolDef.name}" must provide a Zod validation schema`);
  }
  if (typeof toolDef.handler !== 'function') {
    throw new Error(`Tool "${toolDef.name}" must provide an async handler function`);
  }
  toolsRegistry.set(toolDef.name, toolDef);
}

// -------------------------------------------------------------
// Base Tool: get_state (Inspection)
// -------------------------------------------------------------
registerTool({
  name: 'get_state',
  description: 'Retrieve current workspace state snapshot, including resources, tasks, and configuration.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false
  },
  schema: z.object({}).passthrough(),
  handler: async (args) => {
    try {
      const state = await getStateSnapshot();
      auditLog({ tool: 'get_state', args, ok: true, result: state, dryRun: isDryRun() });
      return { ok: true, result: state };
    } catch (err) {
      auditLog({ tool: 'get_state', args, ok: false, error: err.message, dryRun: isDryRun() });
      return { ok: false, error: `Failed to retrieve state: ${err.message}` };
    }
  }
});

// -------------------------------------------------------------
// Base Tool: update_workspace (Configuration)
// -------------------------------------------------------------
registerTool({
  name: 'update_workspace',
  description: 'Update workspace metadata, name, or description.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Updated workspace title' },
      description: { type: 'string', description: 'Updated workspace description' }
    },
    additionalProperties: false
  },
  schema: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional()
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      if (dry) {
        const result = { dryRun: true, updated: true, simulatedChanges: args };
        auditLog({ tool: 'update_workspace', args, ok: true, result, dryRun: true });
        return { ok: true, result };
      }

      const updated = updateState((prev) => ({
        ...prev,
        workspace: {
          ...prev.workspace,
          ...(args.name ? { name: args.name } : {}),
          ...(args.description ? { description: args.description } : {})
        }
      }));

      auditLog({ tool: 'update_workspace', args, ok: true, result: updated.workspace, dryRun: false });
      return { ok: true, result: updated.workspace };
    } catch (err) {
      auditLog({ tool: 'update_workspace', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Base Tool: create_resource (Creation)
// -------------------------------------------------------------
registerTool({
  name: 'create_resource',
  description: 'Create a new resource, service, or asset entry.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Resource name (e.g. auth-service, database-cluster)' },
      type: { type: 'string', description: 'Resource type (e.g. service, database, file, configuration)' },
      status: { type: 'string', description: 'Initial status (e.g. ready, active, draft)' }
    },
    required: ['name', 'type'],
    additionalProperties: false
  },
  schema: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    status: z.string().optional().default('ready')
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      const resourceId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newResource = {
        id: resourceId,
        name: args.name,
        type: args.type,
        status: args.status || 'ready'
      };

      if (dry) {
        const result = { dryRun: true, created: true, resource: newResource };
        auditLog({ tool: 'create_resource', args, ok: true, result, dryRun: true });
        return { ok: true, result };
      }

      updateState((prev) => ({
        ...prev,
        resources: [...(prev.resources || []), newResource]
      }));

      auditLog({ tool: 'create_resource', args, ok: true, result: newResource, dryRun: false });
      return { ok: true, result: newResource };
    } catch (err) {
      auditLog({ tool: 'create_resource', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Base Tool: delete_resource (Destructive Action - Requires Approval in ARMED mode)
// -------------------------------------------------------------
registerTool({
  name: 'delete_resource',
  description: 'Permanently remove a resource by ID or name. (DESTRUCTIVE: requires user confirmation when Armed).',
  destructive: true,
  parameters: {
    type: 'object',
    properties: {
      resource_id: { type: 'string', description: 'ID or exact name of the resource to delete' }
    },
    required: ['resource_id'],
    additionalProperties: false
  },
  schema: z.object({
    resource_id: z.string().min(1)
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      if (dry) {
        const result = { dryRun: true, deleted: true, target: args.resource_id };
        auditLog({ tool: 'delete_resource', args, ok: true, result, dryRun: true });
        return { ok: true, result };
      }

      let removed = false;
      updateState((prev) => {
        const before = prev.resources || [];
        const after = before.filter((r) => r.id !== args.resource_id && r.name !== args.resource_id);
        if (after.length < before.length) removed = true;
        return { ...prev, resources: after };
      });

      if (!removed) {
        return { ok: false, error: `Resource "${args.resource_id}" not found.` };
      }

      const result = { deleted: true, resource_id: args.resource_id };
      auditLog({ tool: 'delete_resource', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      auditLog({ tool: 'delete_resource', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Base Tool: batch_process_tasks (Batch Action with Live Progress Reporting)
// -------------------------------------------------------------
registerTool({
  name: 'batch_process_tasks',
  description: 'Execute a batch of task items with real-time progress callbacks.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Array of task specifications to process in batch',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title or description of the task' },
            action: { type: 'string', description: 'Action type (create, verify, archive)' }
          },
          required: ['title']
        }
      }
    },
    required: ['tasks'],
    additionalProperties: false
  },
  schema: z.object({
    tasks: z.array(
      z.object({
        title: z.string().min(1),
        action: z.string().optional().default('create')
      })
    ).min(1)
  }),
  handler: async (args, context = {}) => {
    const { onProgress } = context;
    const dry = isDryRun();
    const results = [];
    const total = args.tasks.length;

    for (let i = 0; i < total; i++) {
      const task = args.tasks[i];
      const stepNumber = i + 1;

      // Emit live progress to UI
      if (onProgress) {
        onProgress({
          current: stepNumber,
          total,
          item: task.title,
          status: 'running',
          message: `Processing (${stepNumber}/${total}): ${task.title}`
        });
      }

      // Small simulated processing tick for smooth UI progression
      await new Promise((resolve) => setTimeout(resolve, 60));

      const processedItem = {
        id: `task_${Date.now()}_${i}`,
        title: task.title,
        action: task.action || 'create',
        status: 'completed'
      };

      if (!dry) {
        updateState((prev) => ({
          ...prev,
          tasks: [...(prev.tasks || []), processedItem]
        }));
      }

      results.push(processedItem);

      if (onProgress) {
        onProgress({
          current: stepNumber,
          total,
          item: task.title,
          status: 'done',
          message: `Completed (${stepNumber}/${total}): ${task.title}`
        });
      }
    }

    const finalResult = {
      dryRun: dry,
      processedCount: results.length,
      tasks: results
    };

    auditLog({ tool: 'batch_process_tasks', args, ok: true, result: finalResult, dryRun: dry });
    return { ok: true, result: finalResult };
  }
});

// -------------------------------------------------------------
// Base Tool: finish (Completion Tool)
// -------------------------------------------------------------
registerTool({
  name: 'finish',
  description: 'Call this tool when all requested tasks and actions are complete, providing a concise final markdown summary.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Summary of the actions taken and final state' }
    },
    required: ['summary'],
    additionalProperties: false
  },
  schema: z.object({
    summary: z.string().min(1)
  }),
  handler: async (args) => {
    return { ok: true, result: { finished: true, summary: args.summary } };
  }
});

/**
 * Recursively cleans JSON schema so that upstream OpenAI/Gemini/Anthropic providers
 * never reject tool definitions with invalid enum types or union type arrays.
 */
export function sanitizeJsonSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) {
    return schema.map(sanitizeJsonSchema);
  }

  const clean = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && Array.isArray(value)) {
      const primaryType = value.find((t) => t !== 'null') || 'string';
      clean.type = primaryType;
    } else if (key === 'enum' && Array.isArray(value)) {
      clean.enum = value.map((v) => String(v));
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeJsonSchema(value);
    } else {
      clean[key] = value;
    }
  }

  // Gemini and OpenAPI require all enum values to be strings.
  // If property is integer or number, delete enum to avoid type mismatch errors.
  if ((clean.type === 'integer' || clean.type === 'number') && clean.enum) {
    delete clean.enum;
  }

  return clean;
}

/**
 * Returns OpenAI-formatted tools array with sanitized JSON schema definitions.
 */
export function getOpenAITools() {
  return Array.from(toolsRegistry.values()).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: sanitizeJsonSchema(tool.parameters)
    }
  }));
}
