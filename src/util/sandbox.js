import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root sandbox directory - defaults to ./sandbox relative to agent-base root
export const SANDBOX_ROOT = path.resolve(
  process.env.SANDBOX_DIR || path.resolve(__dirname, '../../sandbox')
);

// Ensure the sandbox directory exists
if (!fs.existsSync(SANDBOX_ROOT)) {
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
}

/**
 * Resolves and validates that a relative file path stays strictly inside the sandbox directory.
 * Throws an Error if path traversal is attempted.
 * 
 * @param {string} userPath - Target relative path inside sandbox
 * @returns {string} Absolute resolved path inside SANDBOX_ROOT
 */
export function resolveSafePath(userPath) {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('File path must be a non-empty string');
  }

  // Normalize and prevent leading slashes from jumping to root
  const cleanPath = userPath.trim().replace(/^([/\\])+/, '');
  const resolved = path.resolve(SANDBOX_ROOT, cleanPath);

  // Strict boundary check
  if (resolved !== SANDBOX_ROOT && !resolved.startsWith(SANDBOX_ROOT + path.sep)) {
    throw new Error(`Security Violation: Path "${userPath}" escapes the sandbox root "${SANDBOX_ROOT}"`);
  }

  return resolved;
}

/**
 * Recursively list all files and directories inside the sandbox.
 */
export function listSandboxFiles(dirPath = SANDBOX_ROOT, base = '') {
  const entries = [];
  if (!fs.existsSync(dirPath)) return entries;

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const relativeItemPath = base ? `${base}/${item.name}` : item.name;
    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      entries.push({
        path: relativeItemPath,
        type: 'directory'
      });
      entries.push(...listSandboxFiles(fullPath, relativeItemPath));
    } else {
      const stats = fs.statSync(fullPath);
      entries.push({
        path: relativeItemPath,
        type: 'file',
        size: stats.size,
        modified: stats.mtime.toISOString()
      });
    }
  }

  return entries;
}
