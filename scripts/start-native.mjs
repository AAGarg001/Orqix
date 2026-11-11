import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const native = path.join(root, '.native');
const runtime = JSON.parse(await readFile(path.join(native, 'runtime.json'), 'utf8'));
process.env.PYTHON_EXECUTABLE = path.join(native, runtime.python);
process.env.CHROME_BINARY = path.join(native, runtime.chrome);
process.env.CHROMEDRIVER_PATH = path.join(native, runtime.driver);
process.env.LD_LIBRARY_PATH = path.join(native, runtime.libraries) + ':' + (process.env.LD_LIBRARY_PATH ?? '');
process.env.WORKER_RUNTIME = 'hosted';
if (process.argv.includes('--check')) {
  const work = await mkdtemp(path.join(tmpdir(), 'orqix-native-check-'));
  try {
    await promisify(execFile)(process.env.PYTHON_EXECUTABLE, ['smoke_browser.py'], {
      cwd: path.join(root, 'workers'), timeout: 90000,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
        WORKER_RUNTIME: 'hosted', CHROME_BINARY: process.env.CHROME_BINARY, CHROMEDRIVER_PATH: process.env.CHROMEDRIVER_PATH,
        WORK_DIR: work, LEGACY_SCRIPT: path.join(root, 'commonportalscraper separate Available.py'), OPERATIONS_SCRIPT: path.join(root, 'commonportalpwpscraper 2.1.py') },
    });
    console.log('Native headless Chromium check passed.');
  } finally { await rm(work, { recursive: true, force: true }); }
} else if (process.argv.includes('--smoke')) {
  Object.assign(process.env, { NODE_ENV: 'test', METADATA_STORE: 'memory', PRIVATE_FILE_STORAGE: 'local' });
  await import('./smoke-hosted.mjs');
} else {
  await import('../apps/api/dist/index.js');
}
