// Load .aeo-check.json / aeo-check.config.json / package.json "aeoCheck".
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CONFIG_FILES = ['.aeo-check.json', 'aeo-check.config.json'];

export function loadConfig(root, explicit) {
  const tryRead = (p) => JSON.parse(readFileSync(p, 'utf8'));
  if (explicit) return { ...tryRead(explicit), _path: explicit };
  for (const f of CONFIG_FILES) {
    const p = join(root, f);
    if (existsSync(p)) return { ...tryRead(p), _path: p };
  }
  const pkg = join(root, 'package.json');
  if (existsSync(pkg)) {
    try { const j = tryRead(pkg); if (j.aeoCheck) return { ...j.aeoCheck, _path: pkg }; } catch {}
  }
  return {};
}
