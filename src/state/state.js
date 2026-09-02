/**
 * Generic State and Operational Mode Management.
 * Extensible state store for custom agent resources, status, and dry-run simulation mode.
 */

let dryRun = true;

const DEFAULT_STATE = {
  workspace: {
    name: 'Agent Workspace',
    version: '1.0.0',
    description: 'Local autonomous agent environment'
  },
  resources: [
    { id: 'res_config', name: 'app.config.json', type: 'configuration', status: 'active' },
    { id: 'res_pipeline', name: 'data-pipeline', type: 'service', status: 'ready' },
    { id: 'res_db', name: 'local-datastore', type: 'database', status: 'connected' }
  ],
  tasks: [
    { id: 'task_001', title: 'Scaffold project template', status: 'completed' },
    { id: 'task_002', title: 'Verify service dependencies', status: 'ready' }
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
