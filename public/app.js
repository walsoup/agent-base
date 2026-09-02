/**
 * Agent Architect Frontend Application
 */

// State
let currentRunId = null;
let activeEventSource = null;
let pendingApprovalData = null;

// DOM Elements
const stateNameEl = document.getElementById('stateName');
const stateMetaEl = document.getElementById('stateMeta');
const stateAvatarEl = document.getElementById('stateAvatar');
const modelInput = document.getElementById('modelInput');
const modelList = document.getElementById('modelList');
const btnRefreshModels = document.getElementById('btnRefreshModels');
const reasoningSelect = document.getElementById('reasoningSelect');
const themeSelect = document.getElementById('themeSelect');
const btnOpenSetup = document.getElementById('btnOpenSetup');
const setupBtnLabel = document.getElementById('setupBtnLabel');
const dryRunToggle = document.getElementById('dryRunToggle');
const btnReset = document.getElementById('btnReset');
const btnRefreshTree = document.getElementById('btnRefreshTree');
const stateTreeContainer = document.getElementById('stateTreeContainer');
const toolsListContainer = document.getElementById('toolsListContainer');
const toolsCountEl = document.getElementById('toolsCount');
const toolsHeaderToggle = document.getElementById('toolsHeaderToggle');
const toolsToggleArrow = document.getElementById('toolsToggleArrow');
const messagesContainer = document.getElementById('messagesContainer');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btnSend');
const btnCancelRun = document.getElementById('btnCancelRun');
const runStatusIndicator = document.getElementById('runStatusIndicator');
const connectionStatus = document.getElementById('connectionStatus');

// Setup Modal Elements
const setupModal = document.getElementById('setupModal');
const setupAIBaseURL = document.getElementById('setupAIBaseURL');
const setupAIApiKey = document.getElementById('setupAIApiKey');
const setupAIModel = document.getElementById('setupAIModel');
const setupAIReasoning = document.getElementById('setupAIReasoning');
const btnSaveSetup = document.getElementById('btnSaveSetup');
const btnSetupClose = document.getElementById('btnSetupClose');

// Approval Modal Elements
const approvalModal = document.getElementById('approvalModal');
const modalToolName = document.getElementById('modalToolName');
const modalToolArgs = document.getElementById('modalToolArgs');
const btnModalApprove = document.getElementById('btnModalApprove');
const btnModalDeny = document.getElementById('btnModalDeny');

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
async function init() {
  initTheme();
  await fetchState();
  await fetchSnapshot();
  await fetchModels();
  setupEventListeners();
  autoResizeTextarea(chatInput);
}

function initTheme() {
  const savedTheme = localStorage.getItem('agent-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeSelect) {
    themeSelect.value = savedTheme;
  }
}

// -------------------------------------------------------------
// API Calls
// -------------------------------------------------------------
async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    if (!data.ok) {
      stateNameEl.textContent = 'Setup Required';
      stateMetaEl.textContent = data.error || 'Click Setup to configure';
      connectionStatus.className = 'connection-status offline';
      connectionStatus.querySelector('.status-label').textContent = 'Setup';
      btnOpenSetup.classList.add('unconfigured');
      setupBtnLabel.textContent = '⚡ Run Setup';
      openSetupModal();
      return;
    }

    btnOpenSetup.classList.remove('unconfigured');
    setupBtnLabel.textContent = 'Setup & Config';
    stateNameEl.textContent = data.workspace?.name || 'Agent Environment';
    stateMetaEl.textContent = `${data.resourceCount || 0} resources • ${data.taskCount || 0} tasks`;

    if (data.model && !modelInput.value) {
      modelInput.value = data.model;
    }

    if (data.reasoningEffort && reasoningSelect) {
      reasoningSelect.value = data.reasoningEffort;
    }

    dryRunToggle.checked = Boolean(data.dryRun);
    connectionStatus.className = 'connection-status';
    connectionStatus.querySelector('.status-label').textContent = 'Online';
  } catch (err) {
    console.error('Failed to load server state:', err);
    connectionStatus.className = 'connection-status offline';
    connectionStatus.querySelector('.status-label').textContent = 'Offline';
  }
}

async function fetchSnapshot() {
  try {
    const res = await fetch('/api/snapshot');
    const data = await res.json();
    if (data.ok && data.snapshot) {
      renderStateTree(data.snapshot);
    }
  } catch (err) {
    console.error('Failed to load snapshot:', err);
    stateTreeContainer.innerHTML = '<div class="loading-placeholder">Failed to load environment snapshot.</div>';
  }
}

async function fetchModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    const models = data.models || data.fallbackModels || [];

    modelList.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      modelList.appendChild(opt);
    }

    if (data.currentModel && !modelInput.value) {
      modelInput.value = data.currentModel;
    }
  } catch (err) {
    console.warn('Could not load models list:', err);
  }
}

function openSetupModal() {
  fetch('/api/setup')
    .then((r) => r.json())
    .then((data) => {
      if (data.baseURL !== undefined) setupAIBaseURL.value = data.baseURL;
      if (data.model) setupAIModel.value = data.model;
      if (data.reasoningEffort && setupAIReasoning) setupAIReasoning.value = data.reasoningEffort;
      setupModal.style.display = 'flex';
    })
    .catch(() => {
      setupModal.style.display = 'flex';
    });
}

async function saveFullSetup() {
  const openAiBaseUrl = setupAIBaseURL.value.trim();
  const openAiApiKey = setupAIApiKey.value.trim();
  const openAiModel = setupAIModel.value.trim();
  const reasoningEffort = setupAIReasoning.value;

  btnSaveSetup.textContent = 'Saving...';
  btnSaveSetup.disabled = true;

  try {
    const res = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openAiBaseUrl,
        openAiApiKey,
        openAiModel,
        reasoningEffort
      })
    });

    const data = await res.json();
    if (data.ok) {
      modelInput.value = openAiModel;
      if (reasoningSelect) reasoningSelect.value = reasoningEffort;
      setupModal.style.display = 'none';
      await fetchState();
      await fetchSnapshot();
      await fetchModels();
    } else {
      alert(`Setup error: ${data.error}`);
    }
  } catch (err) {
    alert(`Failed to save setup: ${err.message}`);
  } finally {
    btnSaveSetup.textContent = 'Save Configuration';
    btnSaveSetup.disabled = false;
  }
}

// -------------------------------------------------------------
// State Tree & Tool Drawer Rendering
// -------------------------------------------------------------
function renderStateTree(snapshot) {
  let html = '';

  // Workspace details
  if (snapshot.workspace) {
    html += `
      <div class="tree-category">
        <div class="category-header">📁 WORKSPACE</div>
        <div class="category-channels">
          <div class="channel-item">
            <div class="channel-left">
              <span class="channel-icon">🏷️</span>
              <span class="channel-name">${escapeHtml(snapshot.workspace.name || 'Workspace')}</span>
            </div>
            <span class="badge-item">v${escapeHtml(snapshot.workspace.version || '1.0')}</span>
          </div>
          ${snapshot.workspace.description ? `
          <div class="channel-item">
            <div class="channel-left">
              <span class="channel-icon">📝</span>
              <span class="channel-name" style="font-size: 11px; color: var(--text-muted);">${escapeHtml(snapshot.workspace.description)}</span>
            </div>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  // Resources
  if (snapshot.resources && snapshot.resources.length > 0) {
    html += `
      <div class="tree-category">
        <div class="category-header">📦 RESOURCES (${snapshot.resources.length})</div>
        <div class="category-channels">
    `;
    for (const res of snapshot.resources) {
      const typeIcon = res.type === 'database' ? '🗄️' : res.type === 'service' ? '⚙️' : res.type === 'file' ? '📄' : '🔹';
      html += `
        <div class="channel-item" title="ID: ${escapeHtml(res.id)}">
          <div class="channel-left">
            <span class="channel-icon">${typeIcon}</span>
            <span class="channel-name">${escapeHtml(res.name)}</span>
          </div>
          <span class="badge-item">${escapeHtml(res.status || res.type)}</span>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  // Tasks
  if (snapshot.tasks && snapshot.tasks.length > 0) {
    html += `
      <div class="tree-category">
        <div class="category-header">📋 TASKS (${snapshot.tasks.length})</div>
        <div class="category-channels">
    `;
    for (const t of snapshot.tasks) {
      const statusIcon = t.status === 'completed' || t.completed ? '✅' : '⏳';
      html += `
        <div class="channel-item" title="ID: ${escapeHtml(t.id)}">
          <div class="channel-left">
            <span class="channel-icon">${statusIcon}</span>
            <span class="channel-name">${escapeHtml(t.title)}</span>
          </div>
          <span class="badge-item">${escapeHtml(t.status || 'ready')}</span>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  if (!html) {
    html = '<div class="loading-placeholder">Empty environment snapshot.</div>';
  }

  stateTreeContainer.innerHTML = html;

  // Render base tools chips
  const tools = [
    { name: 'get_state', color: '#5865f2' },
    { name: 'update_workspace', color: '#23a55a' },
    { name: 'create_resource', color: '#23a55a' },
    { name: 'delete_resource', color: '#f23f43' },
    { name: 'batch_process_tasks', color: '#f0b232' },
    { name: 'finish', color: '#99aab5' }
  ];
  toolsCountEl.textContent = tools.length;
  toolsListContainer.innerHTML = tools.map((t) => `
    <div class="role-chip" title="Tool: ${t.name}">
      <span class="role-color-dot" style="background-color: ${t.color}"></span>
      <span class="role-name">${t.name}</span>
    </div>
  `).join('');
}

// -------------------------------------------------------------
// Chat & SSE Streaming
// -------------------------------------------------------------
async function sendMessage(text) {
  const message = text || chatInput.value.trim();
  if (!message) return;

  const activeModel = modelInput.value.trim() || 'gemini-3.7-flash';
  const reasoningEffort = reasoningSelect ? reasoningSelect.value : 'none';

  chatInput.value = '';
  autoResizeTextarea(chatInput);
  setInputState(false, `Agent (${activeModel}) running...`);

  // Render User Message
  appendUserMessage(message);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        model: activeModel,
        reasoningEffort
      })
    });

    const data = await res.json();
    if (!data.ok) {
      appendErrorMessage(data.error || 'Failed to start run');
      setInputState(true);
      return;
    }

    if (data.steered) {
      runStatusIndicator.textContent = 'Steered agent mid-flight...';
      return;
    }

    currentRunId = data.runId;
    listenToStream(currentRunId);
  } catch (err) {
    console.error('Chat request failed:', err);
    appendErrorMessage(`Network error: ${err.message}`);
    setInputState(true);
  }
}

function listenToStream(runId) {
  if (activeEventSource) {
    activeEventSource.close();
  }

  let activeAssistantBubble = null;
  let activeThinkingCard = null;
  let accumulatedThought = '';
  let accumulatedText = '';
  const activeToolCards = new Map(); // callId -> element

  const es = new EventSource(`/api/stream/${runId}`);
  activeEventSource = es;

  es.addEventListener('reasoning_delta', (e) => {
    const data = JSON.parse(e.data);
    if (!activeThinkingCard) {
      activeThinkingCard = createThinkingCard();
      messagesContainer.appendChild(activeThinkingCard);
    }
    accumulatedThought += data.chunk;
    const bodyEl = activeThinkingCard.querySelector('.thinking-body');
    if (bodyEl) {
      bodyEl.textContent = accumulatedThought;
    }
    scrollToBottom();
  });

  es.addEventListener('assistant_delta', (e) => {
    const data = JSON.parse(e.data);
    if (activeThinkingCard) {
      activeThinkingCard.classList.remove('streaming');
      const icon = activeThinkingCard.querySelector('.thinking-icon');
      if (icon) icon.classList.remove('pulsing');
    }

    if (!activeAssistantBubble) {
      activeAssistantBubble = createAssistantMessageElement();
    }
    accumulatedText += data.chunk;
    activeAssistantBubble.innerHTML = renderMarkdown(accumulatedText);
    scrollToBottom();
  });

  es.addEventListener('tool_call', (e) => {
    const data = JSON.parse(e.data);
    if (activeThinkingCard) {
      activeThinkingCard.classList.remove('streaming');
    }
    activeAssistantBubble = null; // Next text creates a new bubble after the tool card
    const card = createToolCard(data.name, data.args, data.callId);
    activeToolCards.set(data.callId, card);
    messagesContainer.appendChild(card);
    scrollToBottom();
  });

  es.addEventListener('tool_progress', (e) => {
    const data = JSON.parse(e.data);
    const card = activeToolCards.get(data.callId);
    if (card) {
      updateToolCardProgress(card, data);
    }
    scrollToBottom();
  });

  es.addEventListener('tool_result', (e) => {
    const data = JSON.parse(e.data);
    const card = activeToolCards.get(data.callId);
    if (card) {
      updateToolCardResult(card, data.name, data.ok, data.summary);
    }
    scrollToBottom();
  });

  es.addEventListener('approval_required', (e) => {
    const data = JSON.parse(e.data);
    showApprovalModal(data);
  });

  es.addEventListener('snapshot_updated', () => {
    fetchSnapshot();
    fetchState();
  });

  es.addEventListener('steer', () => {
    runStatusIndicator.textContent = 'Instruction received mid-flight...';
    activeAssistantBubble = null;
    accumulatedText = '';
  });

  es.addEventListener('done', (e) => {
    const data = JSON.parse(e.data);
    if (activeThinkingCard) {
      activeThinkingCard.classList.remove('streaming');
      const icon = activeThinkingCard.querySelector('.thinking-icon');
      if (icon) icon.classList.remove('pulsing');
    }
    setInputState(true);
    if (data.summary && data.summary !== 'Turn complete.') {
      runStatusIndicator.textContent = 'Finished';
    } else {
      runStatusIndicator.textContent = '';
    }
    es.close();
    activeEventSource = null;
  });

  es.addEventListener('error', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendErrorMessage(data.message || 'Error occurred in stream');
    } catch (_) {}
    if (activeThinkingCard) {
      activeThinkingCard.classList.remove('streaming');
    }
    setInputState(true);
    es.close();
    activeEventSource = null;
  });
}

// -------------------------------------------------------------
// Message DOM Helpers
// -------------------------------------------------------------
function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  scrollToBottom();
}

function createAssistantMessageElement() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  return bubble;
}

function createThinkingCard() {
  const card = document.createElement('div');
  card.className = 'thinking-card expanded streaming';
  card.innerHTML = `
    <div class="thinking-header">
      <div class="thinking-header-left">
        <span class="thinking-icon pulsing">🧠</span>
        <span class="thinking-title">Chain of Thought / Reasoning</span>
      </div>
      <span class="thinking-chevron">▼</span>
    </div>
    <div class="thinking-body"></div>
  `;

  card.querySelector('.thinking-header').addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

function appendErrorMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row assistant';
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.style.borderColor = 'var(--red-danger)';
  bubble.style.color = 'var(--red-danger)';
  bubble.innerHTML = `<strong>Error:</strong> ${escapeHtml(text)}`;
  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  scrollToBottom();
}

function extractBatchItems(name, args) {
  if (!args) return [];
  if (name === 'batch_process_tasks') {
    return (args.tasks || []).map((t) => ({
      key: t.title,
      label: t.title,
      type: 'task'
    }));
  }
  return [];
}

function createToolCard(name, args, callId) {
  const card = document.createElement('div');
  card.className = 'tool-card running';
  card.id = `tool-${callId}`;

  const summary = formatToolArgsSummary(name, args);
  const items = extractBatchItems(name, args);
  const isBatch = items.length > 0;

  let itemsHtml = '';
  if (isBatch) {
    itemsHtml = items
      .map(
        (item, idx) => `
      <span class="tool-progress-item" data-key="${escapeHtml(item.key)}" id="item-${callId}-${idx}">
        <span class="item-icon">·</span>
        <span class="item-label">${escapeHtml(item.label)}</span>
      </span>
    `
      )
      .join('');
  }

  card.innerHTML = `
    <div class="tool-card-header">
      <div class="tool-header-left">
        <span class="tool-status-icon running">⏳</span>
        <span class="tool-name">${escapeHtml(name)}</span>
        <span class="tool-summary">${escapeHtml(summary)}</span>
      </div>
      <div class="tool-header-right">
        ${isBatch ? `<span class="tool-progress-badge">0/${items.length}</span>` : ''}
        <span class="tool-chevron">▼</span>
      </div>
    </div>
    ${
      isBatch
        ? `
    <div class="tool-live-progress">
      <div class="tool-progress-bar-wrapper">
        <div class="tool-progress-bar-fill" style="width: 0%;"></div>
      </div>
      <div class="tool-progress-info">
        <span class="tool-progress-status">⏳ Processing ${items.length} items...</span>
        <span class="tool-progress-counter">0 / ${items.length} (0%)</span>
      </div>
      <div class="tool-progress-items-list">${itemsHtml}</div>
    </div>
    `
        : ''
    }
    <div class="tool-card-body">
      <div class="tool-json-section">
        <div class="tool-json-label">Arguments</div>
        <pre class="tool-json-content">${escapeHtml(JSON.stringify(args, null, 2))}</pre>
      </div>
      <div class="tool-json-section result-section" style="display: none;">
        <div class="tool-json-label">Result</div>
        <pre class="tool-json-content result-content"></pre>
      </div>
    </div>
  `;

  // Toggle accordion expand
  card.querySelector('.tool-card-header').addEventListener('click', () => {
    card.classList.toggle('expanded');
  });

  return card;
}

function updateToolCardProgress(card, data) {
  const { current, total, item, message } = data;
  const percentage = Math.min(100, Math.round((current / (total || 1)) * 100));

  const badge = card.querySelector('.tool-progress-badge');
  if (badge) {
    badge.textContent = `${current}/${total}`;
  }

  const fill = card.querySelector('.tool-progress-bar-fill');
  if (fill) {
    fill.style.width = `${percentage}%`;
  }

  const statusEl = card.querySelector('.tool-progress-status');
  if (statusEl) {
    statusEl.innerHTML = escapeHtml(message || `Processing ${item || ''}...`);
  }

  const counter = card.querySelector('.tool-progress-counter');
  if (counter) {
    counter.textContent = `${current} / ${total} (${percentage}%)`;
  }

  if (item) {
    const itemsList = card.querySelector('.tool-progress-items-list');
    if (itemsList) {
      const allItems = itemsList.querySelectorAll('.tool-progress-item');
      let matchedItem = null;

      for (const el of allItems) {
        const key = el.getAttribute('data-key');
        if (key === item || key.includes(item)) {
          matchedItem = el;
          break;
        }
      }

      if (!matchedItem && allItems[current - 1]) {
        matchedItem = allItems[current - 1];
      }

      if (matchedItem) {
        matchedItem.classList.remove('active');
        matchedItem.classList.add('done');
        const iconEl = matchedItem.querySelector('.item-icon');
        if (iconEl) iconEl.textContent = '✓';
      }

      if (allItems[current]) {
        allItems[current].classList.add('active');
        const iconEl = allItems[current].querySelector('.item-icon');
        if (iconEl) iconEl.textContent = '⏳';
      }
    }
  }
}

function updateToolCardResult(card, name, ok, summary) {
  card.classList.remove('running');
  card.classList.add(ok ? 'success' : 'failed');

  const statusIcon = card.querySelector('.tool-status-icon');
  if (statusIcon) {
    statusIcon.className = 'tool-status-icon';
    statusIcon.textContent = ok ? '✓' : '✗';
    statusIcon.style.color = ok ? 'var(--green-safe)' : 'var(--red-danger)';
  }

  const fill = card.querySelector('.tool-progress-bar-fill');
  if (fill && ok) {
    fill.style.width = '100%';
  }

  const badge = card.querySelector('.tool-progress-badge');
  if (badge && ok) {
    badge.textContent = 'Done ✓';
  }

  const progressStatus = card.querySelector('.tool-progress-status');
  if (progressStatus) {
    progressStatus.innerHTML = ok ? '✓ Operation completed successfully' : '✗ Operation failed';
  }

  const toolSummary = card.querySelector('.tool-summary');
  if (toolSummary) {
    if (!ok) {
      const errorText = typeof summary === 'object' ? (summary.error || JSON.stringify(summary)) : String(summary);
      toolSummary.textContent = `✗ ${errorText}`;
      toolSummary.classList.add('error-summary');
      card.classList.add('expanded');
    }
  }

  const resultSection = card.querySelector('.result-section');
  const resultContent = card.querySelector('.result-content');
  if (resultSection && resultContent) {
    resultSection.style.display = 'block';
    const label = card.querySelector('.tool-json-section.result-section .tool-json-label');
    if (label) {
      label.textContent = ok ? 'Result' : 'Error Details';
      label.style.color = ok ? 'var(--text-dim)' : 'var(--red-danger)';
    }
    resultContent.textContent = typeof summary === 'object' ? JSON.stringify(summary, null, 2) : String(summary);
  }
}

function formatToolArgsSummary(name, args) {
  if (!args) return '';
  if (name === 'get_state') return 'Fetch workspace snapshot';
  if (name === 'update_workspace') return `Update: ${args.name || 'metadata'}`;
  if (name === 'create_resource') return `New ${args.type}: ${args.name}`;
  if (name === 'delete_resource') return `Delete resource: ${args.resource_id}`;
  if (name === 'batch_process_tasks') return `Batch process ${args.tasks?.length || 0} tasks`;
  if (name === 'finish') return args.summary ? args.summary.slice(0, 60) + '...' : 'Complete';
  return JSON.stringify(args);
}

// -------------------------------------------------------------
// Approval Modal Handling
// -------------------------------------------------------------
function showApprovalModal(data) {
  pendingApprovalData = data;
  modalToolName.textContent = data.name;
  modalToolArgs.textContent = JSON.stringify(data.args, null, 2);
  approvalModal.style.display = 'flex';
}

async function respondApproval(approved) {
  if (!pendingApprovalData) return;
  const { runId, callId } = pendingApprovalData;

  approvalModal.style.display = 'none';
  pendingApprovalData = null;

  try {
    await fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, callId, approved })
    });
  } catch (err) {
    console.error('Failed to submit approval:', err);
  }
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------
function setupEventListeners() {
  // Chat input
  chatInput.addEventListener('input', () => {
    autoResizeTextarea(chatInput);
    btnSend.disabled = chatInput.value.trim() === '';
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) {
        sendMessage();
      }
    }
  });

  btnSend.addEventListener('click', () => sendMessage());

  // Cancel Run button
  btnCancelRun.addEventListener('click', async () => {
    if (currentRunId) {
      try {
        await fetch('/api/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId: currentRunId })
        });
      } catch (err) {
        console.error('Failed to cancel run:', err);
      }
    }
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    setInputState(true, 'Run stopped by user');
  });

  // Model refresh button
  btnRefreshModels.addEventListener('click', () => fetchModels());

  // Model input change
  modelInput.addEventListener('change', () => {
    const val = modelInput.value.trim();
    if (val) {
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: val })
      }).catch(console.error);
    }
  });

  // Reasoning Select change
  if (reasoningSelect) {
    reasoningSelect.addEventListener('change', () => {
      const val = reasoningSelect.value;
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasoningEffort: val })
      }).catch(console.error);
    });
  }

  // Setup Modal
  btnOpenSetup.addEventListener('click', () => openSetupModal());
  btnSetupClose.addEventListener('click', () => {
    setupModal.style.display = 'none';
  });

  btnSaveSetup.addEventListener('click', () => saveFullSetup());

  // Preset chips in Setup Modal
  document.querySelectorAll('.preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const base = chip.getAttribute('data-base');
      const model = chip.getAttribute('data-model');
      setupAIBaseURL.value = base;
      setupAIModel.value = model;
    });
  });

  // Suggestion chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  // Theme selector
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const chosenTheme = themeSelect.value;
      document.documentElement.setAttribute('data-theme', chosenTheme);
      localStorage.setItem('agent-theme', chosenTheme);
    });
  }

  // DRY RUN Toggle
  dryRunToggle.addEventListener('change', async () => {
    const enabled = dryRunToggle.checked;
    try {
      const res = await fetch('/api/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      dryRunToggle.checked = data.dryRun;
    } catch (err) {
      console.error('Error toggling dry run:', err);
    }
  });

  // Reset Button
  btnReset.addEventListener('click', async () => {
    if (confirm('Reset conversation history with the agent?')) {
      try {
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        if (currentRunId) {
          fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: currentRunId })
          }).catch(() => {});
          currentRunId = null;
        }

        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'default' })
        });
        const data = await res.json();
        if (data.ok) {
          setInputState(true);
          messagesContainer.innerHTML = `
            <div class="welcome-card">
              <h2>Conversation Reset</h2>
              <p>History cleared. Enter a new command or choose a template below.</p>
              <div class="suggestion-chips">
                <button class="chip" data-prompt="Inspect current workspace state and summarize available resources.">🔍 Inspect Current State</button>
                <button class="chip" data-prompt="Create a new service resource named 'auth-service' and a database 'user-db'.">📦 Create New Resources</button>
                <button class="chip" data-prompt="Execute a batch task to verify and archive all active project tasks.">⚡ Batch Process Tasks</button>
              </div>
            </div>
          `;
          document.querySelectorAll('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
              const prompt = chip.getAttribute('data-prompt');
              if (prompt) sendMessage(prompt);
            });
          });
        }
      } catch (err) {
        console.error('Error resetting conversation:', err);
      }
    }
  });

  // Refresh Tree Button
  btnRefreshTree.addEventListener('click', () => {
    fetchSnapshot();
    fetchState();
  });

  // Tools Drawer Toggle
  let toolsOpen = true;
  toolsHeaderToggle.addEventListener('click', () => {
    toolsOpen = !toolsOpen;
    toolsListContainer.style.display = toolsOpen ? 'flex' : 'none';
    toolsToggleArrow.textContent = toolsOpen ? '▾' : '▸';
  });

  // Approval Modal Actions
  btnModalApprove.addEventListener('click', () => respondApproval(true));
  btnModalDeny.addEventListener('click', () => respondApproval(false));

  window.addEventListener('keydown', (e) => {
    if (approvalModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        respondApproval(false);
      } else if (e.key === 'Enter') {
        respondApproval(true);
      }
    } else if (setupModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        setupModal.style.display = 'none';
      }
    }
  });
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function setInputState(enabled, statusText = '') {
  chatInput.disabled = false;
  btnSend.disabled = chatInput.value.trim() === '';

  if (enabled) {
    chatInput.placeholder = 'Describe what you want the agent to do...';
    btnCancelRun.style.display = 'none';
    btnSend.style.display = 'flex';
    chatInput.focus();
  } else {
    chatInput.placeholder = 'Type a message to steer the agent mid-run, or click Stop...';
    btnCancelRun.style.display = 'flex';
    btnSend.style.display = 'flex';
  }
  runStatusIndicator.textContent = statusText;
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Lightweight Markdown Parser
 */
function renderMarkdown(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  // Triple backtick Code blocks
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Unordered list items
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');

  // Ordered list items
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li>$1</li>');

  // Wrap loose lines in paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map((p) => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>') || p.startsWith('<pre>') || p.startsWith('<li>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html;
}

// Start app on DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);
