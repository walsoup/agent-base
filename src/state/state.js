/**
 * Generic State and Operational Mode Management.
 * Extensible state store for custom agent resources, status, and dry-run simulation mode.
 */

let dryRun = process.env.DRY_RUN === 'true';

const DEFAULT_STATE = {
  workspace: {
    name: 'Code Sandbox Workspace',
    version: '1.0.0',
    description: 'Sandboxed Python & React WebDev environment'
  },
  resources: [
    { id: 'res_python', name: 'python-runtime', type: 'python', status: 'ready' },
    { id: 'res_react', name: 'react-environment', type: 'react', status: 'ready' }
  ],
  tasks: [
    { id: 'task_001', title: 'Initialize sandbox workspace', status: 'completed' },
    { id: 'task_002', title: 'Ready for Python & React project generation', status: 'ready' }
  ],
  metadata: {
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  }
};

let currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));

/**
 * Check if the agent is operating in dry-run (simulation) mode.
 */
export function isDryRun() {
  return dryRun;
}

/**
 * Set the dry-run operational mode.
 */
export function setDryRun(enabled) {
  dryRun = Boolean(enabled);
  console.log(`[Config] Dry run mode set to: ${dryRun ? 'ON (Simulated operations)' : 'OFF (Live operations ARMED)'}`);
  return dryRun;
}

/**
 * Get current state snapshot.
 */
export async function getStateSnapshot() {
  return JSON.parse(JSON.stringify(currentState));
}

/**
 * Update state with partial updates or custom callback.
 */
export function updateState(updates) {
  if (typeof updates === 'function') {
    currentState = updates(currentState);
  } else if (typeof updates === 'object' && updates !== null) {
    currentState = {
      ...currentState,
      ...updates,
      metadata: {
        ...currentState.metadata,
        lastModified: new Date().toISOString()
      }
    };
  }
  return JSON.parse(JSON.stringify(currentState));
}

/**
 * Replace the current and default state with custom initial state.
 */
export function setInitialState(customState) {
  if (typeof customState === 'object' && customState !== null) {
    currentState = JSON.parse(JSON.stringify(customState));
  }
  return JSON.parse(JSON.stringify(currentState));
}

/**
 * Reset state to default.
 */
export function resetState() {
  currentState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  return JSON.parse(JSON.stringify(currentState));
}

/**
 * High-level summary of the state for top bar / health checks.
 */
export async function getStateSummary() {
  const snapshot = await getStateSnapshot();
  return {
    configured: true,
    workspace: snapshot.workspace,
    resourceCount: snapshot.resources ? snapshot.resources.length : 0,
    taskCount: snapshot.tasks ? snapshot.tasks.length : 0,
    dryRun
  };
}
