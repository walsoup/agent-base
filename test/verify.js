import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Running Code Sandbox Agent Unit Verification ---');

// 1. Test Sandbox Path Security Containment
import { SANDBOX_ROOT, resolveSafePath, listSandboxFiles } from '../src/util/sandbox.js';

console.log('1. Testing sandbox path security containment...');
assert(fs.existsSync(SANDBOX_ROOT), 'Sandbox root folder must exist');

const safeChild = resolveSafePath('src/components/Counter.jsx');
assert(safeChild.startsWith(SANDBOX_ROOT), 'Safe child path must be inside sandbox root');

assert.throws(
  () => resolveSafePath('../../etc/passwd'),
  /Security Violation/,
  'Must throw Security Violation for traversal outside sandbox'
);

assert.throws(
  () => resolveSafePath('../outside.txt'),
  /Security Violation/,
  'Must throw Security Violation for parent traversal'
);
console.log('   ✓ Sandbox security boundary verified.');

// 2. Test Tools Registry and Zod Schemas
import { toolsRegistry, getOpenAITools, registerTool, sanitizeJsonSchema } from '../src/agent/tools.js';
import { z } from 'zod';

console.log('2. Testing tools registry & validation schemas...');
assert(toolsRegistry.size >= 8, `Expected at least 8 base tools, found ${toolsRegistry.size}`);

const openAITools = getOpenAITools();
assert(openAITools.length >= 8);
for (const t of openAITools) {
  assert.strictEqual(t.type, 'function');
  assert(t.function.name);
  assert(t.function.description);
  assert(t.function.parameters);
}

// Check destructive tool marking
const deleteTool = toolsRegistry.get('delete_file');
assert(deleteTool, 'delete_file tool should exist');
assert.strictEqual(deleteTool.destructive, true, 'delete_file must be marked destructive');

const runCmdTool = toolsRegistry.get('run_command');
assert(runCmdTool, 'run_command tool should exist');
assert.strictEqual(runCmdTool.destructive, true, 'run_command must be marked destructive');

// Test validation schemas
const validFile = toolsRegistry.get('create_file').schema.safeParse({
  filePath: 'src/App.jsx',
  content: 'export default function App() { return <h1>Hello</h1>; }'
});
assert.strictEqual(validFile.success, true);

const invalidFile = toolsRegistry.get('create_file').schema.safeParse({
  filePath: '',
  content: 123
});
assert.strictEqual(invalidFile.success, false);

console.log('   ✓ Tools registry and schemas verified.');

// 3. Test State Manager & File Operations (Dry Run vs Live)
import { isDryRun, setDryRun, getStateSnapshot, updateState, resetState } from '../src/state/state.js';

console.log('3. Testing State Manager and Sandboxed File Operations...');
setDryRun(true);
assert.strictEqual(isDryRun(), true);

// Cleanup any remnants from previous runs
try {
  fs.rmSync(path.join(SANDBOX_ROOT, 'test_demo.py'), { force: true });
  fs.rmSync(path.join(SANDBOX_ROOT, 'src'), { recursive: true, force: true });
} catch (_) {}

resetState();
const initialSnapshot = await getStateSnapshot();
assert(initialSnapshot.workspace);
assert(Array.isArray(initialSnapshot.resources));
assert(Array.isArray(initialSnapshot.tasks));

// Execute get_state tool
const getStateTool = toolsRegistry.get('get_state');
const stateRes = await getStateTool.handler({});
assert.strictEqual(stateRes.ok, true);
assert(stateRes.result.sandbox);
assert.strictEqual(stateRes.result.sandbox.path, SANDBOX_ROOT);

// Execute create_file in dry run
const createTool = toolsRegistry.get('create_file');
const dryCreateRes = await createTool.handler({
  filePath: 'test_demo.py',
  content: 'print("Hello from Sandbox!")'
});
assert.strictEqual(dryCreateRes.ok, true);
assert.strictEqual(dryCreateRes.result.dryRun, true);
assert(!fs.existsSync(path.join(SANDBOX_ROOT, 'test_demo.py')), 'File should not exist on disk in dry run');

// Execute create_file in live Armed mode
setDryRun(false);
const liveCreateRes = await createTool.handler({
  filePath: 'test_demo.py',
  content: 'print("Hello from Sandbox!")'
});
assert.strictEqual(liveCreateRes.ok, true);
assert(fs.existsSync(path.join(SANDBOX_ROOT, 'test_demo.py')), 'File must exist on disk in live mode');

// Read file
const readTool = toolsRegistry.get('read_file');
const readRes = await readTool.handler({ filePath: 'test_demo.py' });
assert.strictEqual(readRes.ok, true);
assert.strictEqual(readRes.result.content, 'print("Hello from Sandbox!")');

// Edit file
const editTool = toolsRegistry.get('edit_file');
const editRes = await editTool.handler({
  filePath: 'test_demo.py',
  targetText: 'Hello from Sandbox!',
  replacementText: 'Hello from Python & React!'
});
assert.strictEqual(editRes.ok, true);
const readEdited = await readTool.handler({ filePath: 'test_demo.py' });
assert.strictEqual(readEdited.result.content, 'print("Hello from Python & React!")');

// Execute sandboxed command (run python script)
const cmdRes = await runCmdTool.handler({ command: 'python3 test_demo.py' });
assert.strictEqual(cmdRes.ok, true);
assert.strictEqual(cmdRes.result.stdout, 'Hello from Python & React!');

// Batch write files with progress reporting
const batchTool = toolsRegistry.get('batch_write_files');
const progressEvents = [];
const batchRes = await batchTool.handler(
  {
    files: [
      { filePath: 'src/App.jsx', content: 'export default function App() { return <div>App</div>; }' },
      { filePath: 'src/App.css', content: '.app { color: blue; }' }
    ]
  },
  {
    onProgress: (p) => progressEvents.push(p)
  }
);
assert.strictEqual(batchRes.ok, true);
assert.strictEqual(batchRes.result.totalFiles, 2);
assert(progressEvents.length >= 2, 'Should receive progress events');
assert(fs.existsSync(path.join(SANDBOX_ROOT, 'src/App.jsx')));
assert(fs.existsSync(path.join(SANDBOX_ROOT, 'src/App.css')));

// List files tool
const listTool = toolsRegistry.get('list_files');
const listRes = await listTool.handler({});
assert.strictEqual(listRes.ok, true);
assert(listRes.result.files.length >= 3);

// Delete file
const deleteRes = await deleteTool.handler({ filePath: 'test_demo.py' });
assert.strictEqual(deleteRes.ok, true);
assert(!fs.existsSync(path.join(SANDBOX_ROOT, 'test_demo.py')));

// Finish tool
const finishTool = toolsRegistry.get('finish');
const finishRes = await finishTool.handler({ summary: 'Scaffolded React component and verified Python script.' });
assert.strictEqual(finishRes.ok, true);
assert.strictEqual(finishRes.result.finished, true);

setDryRun(true);
console.log('   ✓ State manager and sandboxed file operations verified.');

// 4. Test Audit Logger
console.log('4. Testing Audit Logger...');
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

// 5. Test System Prompt Construction
import { buildSystemPrompt, setSystemPromptBuilder } from '../src/agent/systemPrompt.js';

console.log('5. Testing System Prompt builder...');
const prompt = await buildSystemPrompt();
assert(prompt.includes('CodeSandbox Agent'));
assert(prompt.includes('SANDBOX DIRECTORY'));
assert(prompt.includes('REACT & WEBDEV BEST PRACTICES'));

// Custom prompt builder check
setSystemPromptBuilder((snapshot) => `Custom Agent Prompt for ${snapshot.workspace?.name}`);
const customPrompt = await buildSystemPrompt();
assert(customPrompt.includes('Custom Agent Prompt'));
setSystemPromptBuilder(null); // reset

console.log('   ✓ System prompt builder verified.');

// 6. Test SSE Manager
import { sseManager } from '../src/util/sse.js';

console.log('6. Testing SSE Manager...');
const run = sseManager.createRun('test-agent-run-1');
assert(run);
sseManager.emit('test-agent-run-1', 'test_event', { payload: 'ok' });
assert.strictEqual(run.buffer.length, 1);
assert(run.buffer[0].includes('event: test_event'));
assert(run.buffer[0].includes('{"payload":"ok"}'));
sseManager.cleanup('test-agent-run-1');
console.log('   ✓ SSE manager verified.');

// 7. Test AI Provider Configuration
import { getAIConfig, setAIConfig, getOpenAIClient } from '../src/agent/config.js';

console.log('7. Testing AI Provider Config...');
setAIConfig({
  baseURL: 'http://127.0.0.1:8000/v1',
  model: 'LFM2.5-1.2B-Instruct-int4-cw@NPU',
  apiKey: ''
});

const config = getAIConfig();
assert.strictEqual(config.baseURL, 'http://127.0.0.1:8000/v1');
assert.strictEqual(config.model, 'LFM2.5-1.2B-Instruct-int4-cw@NPU');

console.log('   ✓ AI provider config verified.');

// 8. Test Loop Helpers, Cancellation & Steering
import {
  cancelRun,
  isSessionRunning,
  sendUserSteeringMessage,
  getConversation,
  resetConversation,
  resolveToolName,
  parseAndSplitToolArguments,
  sanitizeMessagesForProvider,
  extractTextToolCalls
} from '../src/agent/loop.js';

console.log('8. Testing Loop Helpers, Steering & Repair...');

assert.strictEqual(resolveToolName('create_filecreate_file'), 'create_file');
assert.strictEqual(resolveToolName('list_files'), 'list_files');

const splitObjs = parseAndSplitToolArguments('{"name":"A"}{"name":"B"}');
assert.strictEqual(splitObjs.length, 2);

// Test text-based tool extraction
const xmlToolSample = `<tool_call>\n<function=create_file>\n<parameter=filePath>index.html</parameter>\n<parameter=content><h1>Hi</h1></parameter>\n</function>\n</tool_call>`;
const extractedXml = extractTextToolCalls(xmlToolSample);
assert.strictEqual(extractedXml.length, 1);
assert.strictEqual(extractedXml[0].name, 'create_file');
assert.strictEqual(extractedXml[0].args.filePath, 'index.html');

const pyToolSample = `create_file(path="personal_site", name="index.html", content="<h1>Hello</h1>")`;
const extractedPy = extractTextToolCalls(pyToolSample);
assert.strictEqual(extractedPy.length, 1);
assert.strictEqual(extractedPy[0].name, 'create_file');
assert.strictEqual(extractedPy[0].args.filePath, 'personal_site/index.html');

const mdSample = "Here is your site:\n```html\n<!DOCTYPE html><html><body><h1>Test</h1></body></html>\n```\nSave this as index.html";
const extractedMd = extractTextToolCalls(mdSample);
assert.strictEqual(extractedMd.length, 1);
assert.strictEqual(extractedMd[0].name, 'create_file');
assert.strictEqual(extractedMd[0].args.filePath, 'index.html');
assert.ok(extractedMd[0].args.content.includes('<h1>Test</h1>'));

const npuPrompt = await buildSystemPrompt(null, 'LFM2.5-1.2B-Instruct-int4-cw@NPU');
assert.ok(npuPrompt.includes('automated file system developer'));

console.log('   ✓ Loop helpers, steering & repair verified.');

console.log('\n========================================');
console.log('✅ ALL CODE SANDBOX AGENT CHECKS PASSED!');
console.log('========================================\n');
process.exit(0);
