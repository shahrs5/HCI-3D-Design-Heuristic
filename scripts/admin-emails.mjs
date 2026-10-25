// Resolves the admin allowlist: VITE_ADMIN_EMAILS from .env / environment,
// falling back to the account logged into the Firebase CLI.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function readEnvFile(root = process.cwd()) {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

export function adminEmails(root = process.cwd()) {
  const raw = process.env.VITE_ADMIN_EMAILS ?? readEnvFile(root).VITE_ADMIN_EMAILS ?? '';
  let list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) {
    try {
      const json = JSON.parse(execSync('npx --no-install firebase login:list --json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
      list = (json.result ?? []).map((r) => (r.user?.email ?? '').toLowerCase()).filter(Boolean);
    } catch {
      list = [];
    }
  }
  return [...new Set(list)];
}
