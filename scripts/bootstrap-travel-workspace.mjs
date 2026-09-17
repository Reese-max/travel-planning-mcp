import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, cpSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'integrations/upstreams.lock.json'), 'utf8'));
const destination = resolve(process.argv[2] ?? join(root, '..', 'travel-workspace'));
function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Git step failed: ${args[0]}. ${result.stderr ?? ''}`);
  return result.stdout.trim();
}

try {
  const sources = [lock.app, lock.reference];
  for (const source of sources) {
    if (!/^[0-9a-f]{40}$/.test(source.commit) ||
      !/^[A-Za-z0-9_-]+$/.test(source.directory) ||
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(source.url)) {
      throw new Error('Invalid upstream lock entry.');
    }
    if (existsSync(join(destination, source.directory))) {
      throw new Error(`Destination already exists: ${source.directory}. Nothing will be overwritten; choose a new workspace.`);
    }
  }
  git(['--version']);
  mkdirSync(destination, { recursive: true });
  for (const source of sources) {
    const folder = join(destination, source.directory);
    git(['clone', '--filter=blob:none', '--no-checkout', source.url, folder]);
    git(['fetch', 'origin', source.commit], folder);
    git(['checkout', '--detach', source.commit], folder);
    if (git(['rev-parse', 'HEAD'], folder) !== source.commit) throw new Error('Upstream SHA mismatch.');
    const license = readFileSync(join(folder, source.license_file), 'utf8');
    if (!license.includes('MIT License') || !license.includes('Copyright')) throw new Error('Upstream license check failed.');
    git(['remote', 'rename', 'origin', 'upstream'], folder);
    if (source.role === 'app_base') {
      git(['switch', '-c', 'travel/customized-base'], folder);
      cpSync(join(root, 'integrations/trip-app-overlay'), folder, { recursive: true, force: false, errorOnExist: true });
      writeFileSync(join(folder, 'TRAVEL-UPSTREAM.json'), JSON.stringify({
        ...source, core_repository: 'Reese-max/travel-planning-mcp',
        prepared_from_core_commit: git(['rev-parse', 'HEAD'], root),
        mode: 'readonly-bootstrap', original_license_preserved: true,
        remote_fork_created: false
      }, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(`Prepared ${source.directory} at ${source.commit}; role=${source.role}`);
  }
  console.log('No GitHub repository was created. No server was deployed. No booking or itinerary was changed.');
  console.log(`Workspace: ${destination}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Workspace preparation failed.');
  process.exitCode = 1;
}
