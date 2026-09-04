import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getStateSnapshot, updateState, isDryRun } from '../state/state.js';
import { auditLog } from '../util/log.js';
import { SANDBOX_ROOT, resolveSafePath, listSandboxFiles } from '../util/sandbox.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

/**
 * Tool registry holding all tool definitions.
 */
export const toolsRegistry = new Map();

/**
 * Register a tool definition in the global registry.
 */
export function registerTool(toolDef) {
  if (!toolDef.name || typeof toolDef.name !== 'string') {
    throw new Error('Tool must have a valid name string');
  }
  if (!toolDef.schema) {
    throw new Error(`Tool "${toolDef.name}" must provide a Zod validation schema`);
  }
  if (typeof toolDef.handler !== 'function') {
    throw new Error(`Tool "${toolDef.name}" must provide an async handler function`);
  }

  let parameters = toolDef.parameters;
  if (!parameters && toolDef.schema) {
    try {
      parameters = zodToJsonSchema(toolDef.schema, { target: 'openAi' });
      if (parameters && parameters.$schema) {
        delete parameters.$schema;
      }
    } catch (_) {
      parameters = { type: 'object', properties: {} };
    }
  }

  toolsRegistry.set(toolDef.name, {
    ...toolDef,
    parameters: parameters || { type: 'object', properties: {} },
    destructive: Boolean(toolDef.destructive)
  });
}

export function unregisterTool(name) {
  return toolsRegistry.delete(name);
}

export function clearTools() {
  toolsRegistry.clear();
}

// -------------------------------------------------------------
// Tool 1: list_files (Inspection)
// -------------------------------------------------------------
registerTool({
  name: 'list_files',
  description: 'List all files and subdirectories inside the sandboxed workspace.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      subpath: { type: 'string', description: 'Optional subfolder path inside sandbox to list' }
    },
    additionalProperties: false
  },
  schema: z.object({
    subpath: z.string().optional().default('')
  }),
  handler: async (args) => {
    try {
      const targetDir = args.subpath ? resolveSafePath(args.subpath) : SANDBOX_ROOT;
      const files = listSandboxFiles(targetDir, args.subpath || '');
      auditLog({ tool: 'list_files', args, ok: true, result: { count: files.length }, dryRun: isDryRun() });
      return { ok: true, result: { sandboxRoot: SANDBOX_ROOT, files } };
    } catch (err) {
      auditLog({ tool: 'list_files', args, ok: false, error: err.message, dryRun: isDryRun() });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 2: read_file (Inspection)
// -------------------------------------------------------------
registerTool({
  name: 'read_file',
  description: 'Read the text content of a file inside the sandboxed workspace.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path of file inside sandbox' }
    },
    required: ['filePath'],
    additionalProperties: false
  },
  schema: z.object({
    filePath: z.string().min(1)
  }),
  handler: async (args) => {
    try {
      const safePath = resolveSafePath(args.filePath);
      if (!fs.existsSync(safePath)) {
        return { ok: false, error: `File not found: "${args.filePath}"` };
      }
      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        return { ok: false, error: `Path "${args.filePath}" is a directory, not a file. Use list_files.` };
      }
      const content = fs.readFileSync(safePath, 'utf8');
      auditLog({ tool: 'read_file', args, ok: true, dryRun: isDryRun() });
      return { ok: true, result: { filePath: args.filePath, content, size: stat.size } };
    } catch (err) {
      auditLog({ tool: 'read_file', args, ok: false, error: err.message, dryRun: isDryRun() });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 3: create_file (Creation)
// -------------------------------------------------------------
registerTool({
  name: 'create_file',
  description: 'Create a new file with content inside the sandboxed workspace. Automatically creates parent directories.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path of file to create (e.g. "src/App.jsx" or "main.py")' },
      content: { type: 'string', description: 'Code or text content for the file' }
    },
    required: ['filePath', 'content'],
    additionalProperties: false
  },
  schema: z.object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    name: z.string().optional(),
    filename: z.string().optional(),
    content: z.string().optional(),
    code: z.string().optional(),
    template: z.string().optional()
  }).passthrough(),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      let targetFile = args.filePath || args.path || args.filename;
      if (args.name) {
        targetFile = targetFile ? `${targetFile}/${args.name}` : args.name;
      }
      if (!targetFile) targetFile = 'index.html';

      // Clean path if absolute or contains sandbox
      if (targetFile.includes('sandbox')) {
        targetFile = targetFile.split('sandbox')[1].replace(/^[/\\]+/, '') || targetFile;
      }
      if (targetFile.endsWith('/') || targetFile === 'personal_site') {
        targetFile = `${targetFile}/index.html`.replace(/\/+/g, '/');
      }

      let content = args.content || args.code || '';
      if (!content && args.template === 'basic_html') {
        content = '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Personal Site</title>\n</head>\n<body>\n  <h1>Welcome</h1>\n</body>\n</html>';
      }

      const safePath = resolveSafePath(targetFile);

      if (dry) {
        const preview = {
          dryRun: true,
          action: 'create_file',
          filePath: targetFile,
          bytes: Buffer.byteLength(content, 'utf8')
        };
        auditLog({ tool: 'create_file', args, ok: true, result: preview, dryRun: true });
        return { ok: true, result: preview };
      }

      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, content, 'utf8');

      // Update state resources to track created file
      updateState((prev) => ({
        ...prev,
        resources: [
          ...(prev.resources || []).filter((r) => r.name !== targetFile),
          {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: targetFile,
            type: targetFile.endsWith('.py') ? 'python' : (targetFile.endsWith('.jsx') || targetFile.endsWith('.tsx') || targetFile.endsWith('.js') ? 'react' : 'file'),
            status: 'created'
          }
        ]
      }));

      const result = { filePath: targetFile, created: true, size: Buffer.byteLength(content, 'utf8') };
      auditLog({ tool: 'create_file', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      auditLog({ tool: 'create_file', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 4: write_file (Overwrite / Update)
// -------------------------------------------------------------
registerTool({
  name: 'write_file',
  description: 'Overwrite the entire content of a file inside the sandboxed workspace.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path of file inside sandbox' },
      content: { type: 'string', description: 'New code or text content' }
    },
    required: ['filePath', 'content'],
    additionalProperties: false
  },
  schema: z.object({
    filePath: z.string().min(1),
    content: z.string()
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      const safePath = resolveSafePath(args.filePath);

      if (dry) {
        const preview = {
          dryRun: true,
          action: 'write_file',
          filePath: args.filePath,
          bytes: Buffer.byteLength(args.content, 'utf8')
        };
        auditLog({ tool: 'write_file', args, ok: true, result: preview, dryRun: true });
        return { ok: true, result: preview };
      }

      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, args.content, 'utf8');

      updateState((prev) => ({
        ...prev,
        resources: [
          ...(prev.resources || []).filter((r) => r.name !== args.filePath),
          {
            id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: args.filePath,
            type: args.filePath.endsWith('.py') ? 'python' : (args.filePath.endsWith('.jsx') || args.filePath.endsWith('.tsx') ? 'react' : 'file'),
            status: 'updated'
          }
        ]
      }));

      const result = { filePath: args.filePath, written: true, size: Buffer.byteLength(args.content, 'utf8') };
      auditLog({ tool: 'write_file', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      auditLog({ tool: 'write_file', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 5: edit_file (Find & Replace in existing file)
// -------------------------------------------------------------
registerTool({
  name: 'edit_file',
  description: 'Edit a specific block of text in an existing file using find & replace.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path of file inside sandbox' },
      targetText: { type: 'string', description: 'Exact string or snippet to find' },
      replacementText: { type: 'string', description: 'Replacement string' }
    },
    required: ['filePath', 'targetText', 'replacementText'],
    additionalProperties: false
  },
  schema: z.object({
    filePath: z.string().min(1),
    targetText: z.string().min(1),
    replacementText: z.string()
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      const safePath = resolveSafePath(args.filePath);
      if (!fs.existsSync(safePath)) {
        return { ok: false, error: `File "${args.filePath}" not found.` };
      }

      const original = fs.readFileSync(safePath, 'utf8');
      if (!original.includes(args.targetText)) {
        return { ok: false, error: `Target text snippet not found in "${args.filePath}".` };
      }

      const updated = original.replace(args.targetText, args.replacementText);

      if (dry) {
        const preview = {
          dryRun: true,
          action: 'edit_file',
          filePath: args.filePath,
          targetText: args.targetText,
          replacementText: args.replacementText
        };
        auditLog({ tool: 'edit_file', args, ok: true, result: preview, dryRun: true });
        return { ok: true, result: preview };
      }

      fs.writeFileSync(safePath, updated, 'utf8');
      const result = { filePath: args.filePath, edited: true };
      auditLog({ tool: 'edit_file', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      auditLog({ tool: 'edit_file', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 6: delete_file (DESTRUCTIVE Action - Triggers Web UI Approval in Armed mode)
// -------------------------------------------------------------
registerTool({
  name: 'delete_file',
  description: 'Permanently delete a file or directory in the sandboxed workspace. (DESTRUCTIVE: requires user confirmation when Armed).',
  destructive: true,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path of file or directory to remove' }
    },
    required: ['filePath'],
    additionalProperties: false
  },
  schema: z.object({
    filePath: z.string().min(1)
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      const safePath = resolveSafePath(args.filePath);
      if (!fs.existsSync(safePath)) {
        return { ok: false, error: `Path "${args.filePath}" does not exist in sandbox.` };
      }

      if (dry) {
        const preview = { dryRun: true, deleted: true, target: args.filePath };
        auditLog({ tool: 'delete_file', args, ok: true, result: preview, dryRun: true });
        return { ok: true, result: preview };
      }

      const stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        fs.rmSync(safePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(safePath);
      }

      updateState((prev) => ({
        ...prev,
        resources: (prev.resources || []).filter((r) => r.name !== args.filePath)
      }));

      const result = { deleted: true, filePath: args.filePath };
      auditLog({ tool: 'delete_file', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      auditLog({ tool: 'delete_file', args, ok: false, error: err.message, dryRun: dry });
      return { ok: false, error: err.message };
    }
  }
});

// -------------------------------------------------------------
// Tool 7: batch_write_files (Batch Action with Live Progress Reporting)
// -------------------------------------------------------------
registerTool({
  name: 'batch_write_files',
  description: 'Create or scaffold multiple files simultaneously in the sandbox with live progress reporting.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of file definitions { filePath, content } to write in batch',
        items: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Relative path of file' },
            content: { type: 'string', description: 'Content of file' }
          },
          required: ['filePath', 'content']
        }
      }
    },
    required: ['files'],
    additionalProperties: false
  },
  schema: z.object({
    files: z.array(
      z.object({
        filePath: z.string().min(1),
        content: z.string()
      })
    ).min(1)
  }),
  handler: async (args, context = {}) => {
    const { onProgress } = context;
    const dry = isDryRun();
    const results = [];
    const total = args.files.length;

    for (let i = 0; i < total; i++) {
      const file = args.files[i];
      const stepNumber = i + 1;

      if (onProgress) {
        onProgress({
          current: stepNumber,
          total,
          item: file.filePath,
          status: 'running',
          message: `Scaffolding (${stepNumber}/${total}): ${file.filePath}`
        });
      }

      try {
        const safePath = resolveSafePath(file.filePath);
        if (!dry) {
          fs.mkdirSync(path.dirname(safePath), { recursive: true });
          fs.writeFileSync(safePath, file.content, 'utf8');

          updateState((prev) => ({
            ...prev,
            resources: [
              ...(prev.resources || []).filter((r) => r.name !== file.filePath),
              {
                id: `file_${Date.now()}_${i}`,
                name: file.filePath,
                type: file.filePath.endsWith('.py') ? 'python' : (file.filePath.endsWith('.jsx') || file.filePath.endsWith('.tsx') ? 'react' : 'file'),
                status: 'ready'
              }
            ]
          }));
        }

        results.push({
          filePath: file.filePath,
          status: dry ? 'simulated' : 'written',
          size: Buffer.byteLength(file.content, 'utf8')
        });
      } catch (fileErr) {
        results.push({
          filePath: file.filePath,
          status: 'error',
          error: fileErr.message
        });
      }

      await new Promise((r) => setTimeout(r, 60));

      if (onProgress) {
        onProgress({
          current: stepNumber,
          total,
          item: file.filePath,
          status: 'done',
          message: `Finished (${stepNumber}/${total}): ${file.filePath}`
        });
      }
    }

    const finalResult = {
      dryRun: dry,
      totalFiles: total,
      results
    };

    auditLog({ tool: 'batch_write_files', args, ok: true, result: finalResult, dryRun: dry });
    return { ok: true, result: finalResult };
  }
});

// -------------------------------------------------------------
// Tool 8: run_command (DESTRUCTIVE Action - Safe Execution in Sandbox)
// -------------------------------------------------------------
registerTool({
  name: 'run_command',
  description: 'Execute a CLI or build command strictly inside the sandbox directory (e.g. "python test.py", "pytest", "npm test", "node index.js"). (DESTRUCTIVE: requires user confirmation when Armed).',
  destructive: true,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute inside sandbox directory' },
      timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds (default: 15000)' }
    },
    required: ['command'],
    additionalProperties: false
  },
  schema: z.object({
    command: z.string().min(1),
    timeoutMs: z.number().optional().default(15000)
  }),
  handler: async (args) => {
    const dry = isDryRun();
    try {
      if (dry) {
        const preview = {
          dryRun: true,
          command: args.command,
          sandboxCwd: SANDBOX_ROOT,
          simulated: 'Command previewed safely without executing in dry-run mode.'
        };
        auditLog({ tool: 'run_command', args, ok: true, result: preview, dryRun: true });
        return { ok: true, result: preview };
      }

      const { stdout, stderr } = await execAsync(args.command, {
        cwd: SANDBOX_ROOT,
        timeout: args.timeoutMs || 15000,
        env: {
          ...process.env,
          PYTHONPATH: SANDBOX_ROOT,
          NODE_PATH: path.resolve(__dirname, '../../node_modules')
        }
      });

      const result = {
        command: args.command,
        exitCode: 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      auditLog({ tool: 'run_command', args, ok: true, result, dryRun: false });
      return { ok: true, result };
    } catch (err) {
      const result = {
        command: args.command,
        exitCode: err.code || 1,
        stdout: err.stdout ? err.stdout.trim() : '',
        stderr: err.stderr ? err.stderr.trim() : err.message
      };
      auditLog({ tool: 'run_command', args, ok: false, result, dryRun: false });
      return { ok: false, error: err.message, result };
    }
  }
});

// -------------------------------------------------------------
// Tool 9: get_state (Inspection)
// -------------------------------------------------------------
registerTool({
  name: 'get_state',
  description: 'Retrieve current workspace state snapshot, sandbox directory path, and tracked files.',
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
      const files = listSandboxFiles();
      const enrichedState = {
        ...state,
        sandbox: {
          path: SANDBOX_ROOT,
          fileCount: files.filter((f) => f.type === 'file').length,
          dirCount: files.filter((f) => f.type === 'directory').length
        }
      };
      auditLog({ tool: 'get_state', args, ok: true, result: enrichedState, dryRun: isDryRun() });
      return { ok: true, result: enrichedState };
    } catch (err) {
      auditLog({ tool: 'get_state', args, ok: false, error: err.message, dryRun: isDryRun() });
      return { ok: false, error: `Failed to retrieve state: ${err.message}` };
    }
  }
});

// -------------------------------------------------------------
// Tool 10: finish (Completion Tool)
// -------------------------------------------------------------
registerTool({
  name: 'finish',
  description: 'Call this tool when all requested coding, file creation, or refactoring tasks are complete, providing a final markdown summary.',
  destructive: false,
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Summary of what code and files were generated or modified' }
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
