import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Running Agent Base Unit Verification ---');

// 1. Test Tools Registry and Zod Schemas
import { toolsRegistry, getOpenAITools, registerTool, sanitizeJsonSchema } from '../src/agent/tools.js';
import { z } from 'zod';

console.log('1. Testing tools registry & validation schemas...');
assert(toolsRegistry.size >= 6, `Expected at least 6 base tools, found ${toolsRegistry.size}`);

const openAITools = getOpenAITools();
assert(openAITools.length >= 6);
for (const t of openAITools) {
  assert.strictEqual(t.type, 'function');
  assert(t.function.name);
  assert(t.function.description);
  assert(t.function.parameters);
}

// Check destructive tool marking
const deleteTool = toolsRegistry.get('delete_resource');
assert(deleteTool, 'delete_resource tool should exist');
assert.strictEqual(deleteTool.destructive, true, 'delete_resource must be marked destructive');

// Test validation schemas
const validResource = toolsRegistry.get('create_resource').schema.safeParse({
  name: 'auth-service',
  type: 'service'
});
assert.strictEqual(validResource.success, true);

const invalidResource = toolsRegistry.get('create_resource').schema.safeParse({
  name: '',
  type: ''
});
assert.strictEqual(invalidResource.success, false);

// Test schema sanitizer
const dirtySchema = {
  type: ['string', 'null'],
  enum: [1, 2, 3],
  properties: {
    count: { type: 'integer', enum: [1, 2] }
  }
};
const cleaned = sanitizeJsonSchema(dirtySchema);
assert.strictEqual(cleaned.type, 'string');
assert.deepStrictEqual(cleaned.enum, ['1', '2', '3']);
assert.strictEqual(cleaned.properties.count.enum, undefined);

console.log('   ✓ Tools registry and schemas verified.');

// 2. Test State Manager & Dry Run Operations
import { isDryRun, setDryRun, getStateSnapshot, updateState, resetState, getStateSummary } from '../src/state/state.js';

console.log('2. Testing State Manager and Operations...');
setDryRun(true);
assert.strictEqual(isDryRun(), true);

resetState();
const initialSnapshot = await getStateSnapshot();
assert(initialSnapshot.workspace);
assert(Array.isArray(initialSnapshot.resources));
assert(Array.isArray(initialSnapshot.tasks));

// Execute get_state tool
const getStateTool = toolsRegistry.get('get_state');
const stateRes = await getStateTool.handler({});
assert.strictEqual(stateRes.ok, true);
assert(stateRes.result.workspace);

// Execute update_workspace in dry run
const updateTool = toolsRegistry.get('update_workspace');
const updateDryRes = await updateTool.handler({ name: 'Simulated Workspace' });
assert.strictEqual(updateDryRes.ok, true);
assert.strictEqual(updateDryRes.result.dryRun, true);

// Execute in live mode
setDryRun(false);
const updateLiveRes = await updateTool.handler({ name: 'Live Workspace' });
assert.strictEqual(updateLiveRes.ok, true);
const currentSnap = await getStateSnapshot();
assert.strictEqual(currentSnap.workspace.name, 'Live Workspace');

// Execute create_resource in live mode
const createTool = toolsRegistry.get('create_resource');
const createLiveRes = await createTool.handler({ name: 'redis-cache', type: 'service' });
assert.strictEqual(createLiveRes.ok, true);
assert(createLiveRes.result.id);

// Execute batch_process_tasks with progress callbacks
const batchTool = toolsRegistry.get('batch_process_tasks');
const progressEvents = [];
const batchRes = await batchTool.handler(
  {
    tasks: [
      { title: 'Task Alpha', action: 'create' },
      { title: 'Task Beta', action: 'verify' }
    ]
  },
  {
    onProgress: (p) => progressEvents.push(p)
  }
);
assert.strictEqual(batchRes.ok, true);
assert.strictEqual(batchRes.result.processedCount, 2);
assert(progressEvents.length >= 2, 'Should have received progress events');

// Execute delete_resource
const deleteRes = await deleteTool.handler({ resource_id: 'redis-cache' });
assert.strictEqual(deleteRes.ok, true);
assert.strictEqual(deleteRes.result.deleted, true);

// Execute finish tool
const finishTool = toolsRegistry.get('finish');
const finishRes = await finishTool.handler({ summary: 'All steps completed.' });
assert.strictEqual(finishRes.ok, true);
assert.strictEqual(finishRes.result.finished, true);

setDryRun(true);
console.log('   ✓ State manager and tool execution verified.');

// 3. Test Audit Logger
console.log('3. Testing Audit Logger...');
const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const d = String(today.getDate()).padStart(2, '0');
const logFile = path.resolve(__dirname, `../logs/audit-${y}-${m}-${d}.jsonl`);

assert(fs.existsSync(logFile), `Audit log file ${logFile} should exist`);
const logLines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
assert(logLines.length >= 2, `Expected audit log entries, found ${logLines.length}`);
const lastLog = JSON.parse(logLines[logLines.length - 1]);
assert(lastLog.timestamp);
assert(lastLog.tool);
console.log('   ✓ Audit logger verified.');

// 4. Test System Prompt Construction
import { buildSystemPrompt } from '../src/agent/systemPrompt.js';

console.log('4. Testing System Prompt builder...');
const prompt = await buildSystemPrompt();
assert(prompt.includes('You are Agent Architect'));
assert(prompt.includes('DRY RUN MODE: ON'));
assert(prompt.includes('CURRENT ENVIRONMENT SNAPSHOT'));
console.log('   ✓ System prompt builder verified.');

// 5. Test SSE Manager
import { sseManager } from '../src/util/sse.js';

console.log('5. Testing SSE Manager...');
const run = sseManager.createRun('test-agent-run-1');
assert(run);
sseManager.emit('test-agent-run-1', 'test_event', { payload: 'ok' });
assert.strictEqual(run.buffer.length, 1);
assert(run.buffer[0].includes('event: test_event'));
assert(run.buffer[0].includes('{"payload":"ok"}'));
sseManager.cleanup('test-agent-run-1');
console.log('   ✓ SSE manager verified.');

// 6. Test AI Provider Configuration
import { getAIConfig, setAIConfig, getOpenAIClient } from '../src/agent/config.js';

console.log('6. Testing AI Provider Config...');
setAIConfig({
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-3.7-sonnet',
  apiKey: 'sk-test-key-456'
});

const config = getAIConfig();
assert.strictEqual(config.baseURL, 'https://openrouter.ai/api/v1');
assert.strictEqual(config.model, 'anthropic/claude-3.7-sonnet');
assert.strictEqual(config.hasApiKey, true);

const client = getOpenAIClient();
assert.strictEqual(client.baseURL, 'https://openrouter.ai/api/v1');
assert.strictEqual(client.apiKey, 'sk-test-key-456');

// Keyless local provider
setAIConfig({
  baseURL: 'http://localhost:11434/v1',
  model: 'llama3.2',
  apiKey: '',
  reasoningEffort: 'medium'
});
const localClient = getOpenAIClient();
assert.strictEqual(localClient.baseURL, 'http://localhost:11434/v1');
assert.strictEqual(localClient.apiKey, 'not-needed');
assert.strictEqual(getAIConfig().reasoningEffort, 'medium');

console.log('   ✓ AI provider config verified.');

// 7. Test Loop Helpers, Cancellation & Steering
import {
  cancelRun,
  isSessionRunning,
  sendUserSteeringMessage,
  getConversation,
  resetConversation,
  resolveToolName,
  parseAndSplitToolArguments,
  sanitizeMessagesForProvider
} from '../src/agent/loop.js';

console.log('7. Testing Loop Helpers, Steering & Repair...');

// Duplicated name repair
assert.strictEqual(resolveToolName('create_resourcecreate_resource'), 'create_resource');
assert.strictEqual(resolveToolName('get_state'), 'get_state');

// Concatenated JSON objects repair
const splitObjs = parseAndSplitToolArguments('{"name":"A"}{"name":"B"}');
assert.strictEqual(splitObjs.length, 2);
assert.strictEqual(splitObjs[0].name, 'A');
assert.strictEqual(splitObjs[1].name, 'B');

// Messages sanitizer
const rawMsg = [
  {
    role: 'assistant',
    tool_calls: [
      {
        id: 'call_1',
        function: { name: 'get_stateget_state', arguments: '{}' }
      }
    ]
  }
];
const sanitized = sanitizeMessagesForProvider(rawMsg);
assert.strictEqual(sanitized[0].tool_calls[0].function.name, 'get_state');

// Cancellation & steering
assert.strictEqual(cancelRun('non-existent'), false);
assert.strictEqual(isSessionRunning('default'), false);

resetConversation('default');
const steerRes = sendUserSteeringMessage('default', 'Test steer message');
assert.strictEqual(steerRes.steered, false);
const history = getConversation('default');
assert.strictEqual(history.length, 1);
assert.strictEqual(history[0].content, 'Test steer message');

console.log('   ✓ Loop helpers, steering & repair verified.');

console.log('\n========================================');
console.log('✅ ALL AGENT BASE CHECKS PASSED!');
console.log('========================================\n');
process.exit(0);
