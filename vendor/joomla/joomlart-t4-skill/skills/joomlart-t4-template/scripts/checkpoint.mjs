#!/usr/bin/env node
// Durable phase evidence. Changed inputs invalidate completion, never silently skip work.
import { realpathSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const PHASES = ['intake','0','1','2','3','4','5','6','6b','7','8','8b','9','10'];
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const skillVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
export function checkpoint(file, command, args) {
  file = resolve(file);
  if (command === 'init') {
    if (existsSync(file)) throw new Error('Checkpoint already exists; use status');
    const [mode, source, target, selected] = args;
    if (!['website','template','edit'].includes(mode) || !source || !target) throw new Error('init requires mode, source and target');
    const defaults = mode === 'template' ? PHASES : mode === 'website' ? PHASES.filter(p => !['9','10'].includes(p)) : ['intake','1','2','6','8','8b'];
    const phases = selected ? selected.split(',') : defaults;
    const mandatory = mode === 'template' ? PHASES : ['intake','1','2','8','8b'];
    if (mandatory.some(p => !phases.includes(p)) || phases.some(p => !PHASES.includes(p)) || new Set(phases).size !== phases.length || phases.join() !== PHASES.filter(p => phases.includes(p)).join())
      throw new Error('Phase list must be ordered, unique and retain required intake/identity/spec/verification phases');
    writeFileSync(file, JSON.stringify({ version: 1, skillVersion, mode, source, target, phases, completed: {} }, null, 2) + '\n', { flag: 'wx' });
  }
  const state = JSON.parse(readFileSync(file));
  if (state.version !== 1 || !Array.isArray(state.phases)) throw new Error('Unsupported checkpoint');
  const valid = (entry) => entry && state.skillVersion === skillVersion && entry.evidence.length > 0 && entry.evidence.every(e => {
    try { return hash(resolve(dirname(file), e.path)) === e.sha256; } catch { return false; }
  });
  if (command === 'complete') {
    const [phase, ...files] = args;
    if (!state.phases.includes(phase) || !files.length) throw new Error('complete requires a planned phase and evidence files');
    const earlier = state.phases.slice(0, state.phases.indexOf(phase));
    if (earlier.some(p => !valid(state.completed[p]))) throw new Error('An earlier phase needs verification first');
    state.completed[phase] = { at: new Date().toISOString(), evidence: files.map(p => {
      const full = resolve(p), rel = relative(dirname(file), full);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Evidence must stay beside the checkpoint');
      return { path: rel, sha256: hash(full) };
    }) };
    for (const later of state.phases.slice(state.phases.indexOf(phase) + 1)) delete state.completed[later];
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n'); renameSync(tmp, file);
  } else if (!['init','status'].includes(command)) throw new Error('Use init, complete or status');
  let stale = state.skillVersion !== skillVersion;
  const phases = state.phases.map(phase => {
    const ok = !stale && valid(state.completed[phase]);
    if (!ok) stale = true;
    return { phase, status: ok ? 'complete' : 'needs-verification' };
  });
  return { ...state, phases, next: phases.find(p => p.status !== 'complete')?.phase ?? null,
    note: 'Hashes prove evidence is unchanged; recheck the live target before resuming. Skill version changes require a new checkpoint.' };
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { const [command, file, ...args] = process.argv.slice(2); if (!file) throw new Error('checkpoint.mjs init|complete|status <file> ...'); console.log(JSON.stringify(checkpoint(file,command,args),null,2)); }
  catch(e) { console.error(e.message); process.exitCode = 2; }
}
