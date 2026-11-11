import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../apps/api/dist/store.js';
import { Runner } from '../apps/api/dist/runner.js';
if (process.env.NODE_ENV !== 'test' || process.env.METADATA_STORE !== 'memory' || process.env.WORKER_RUNTIME !== 'hosted') throw new Error('Isolated native smoke environment required');
const store = new Store(true), runner = new Runner(store), id = randomUUID();
const now = new Date().toISOString(), work = await mkdtemp(path.join(tmpdir(), 'orqix-native-smoke-'));
try {
  await runner.reserve({ id, userId: randomUUID(), name: 'Offline native worker smoke', mode: 'all', status: 'starting', stage: 'Starting', records: 0, sections: [], artifact: false, createdAt: now, updatedAt: now });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const job = await store.job(id);
    if (job.status === 'failed') throw new Error(job.error);
    if (job.status === 'awaiting_otp') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if ((await store.job(id)).status !== 'awaiting_otp') throw new Error('Worker readiness timed out');
  if (!(await runner.call(id, '/health')).ok) throw new Error('Worker health failed');
  await promisify(execFile)(process.env.PYTHON_EXECUTABLE, ['smoke_browser.py'], {
    cwd: path.resolve('workers'), timeout: 90000,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, DISPLAY: process.env.DISPLAY,
      WORKER_RUNTIME: 'hosted', CHROME_BINARY: process.env.CHROME_BINARY, CHROMEDRIVER_PATH: process.env.CHROMEDRIVER_PATH,
      WORK_DIR: work, LEGACY_SCRIPT: path.resolve('commonportalscraper separate Available.py'), OPERATIONS_SCRIPT: path.resolve('commonportalpwpscraper 2.1.py') },
  });
  console.log('Native smoke passed: real Python worker and visible Chromium on a virtual display screenshot.');
} finally {
  await runner.shutdown();
  await rm(work, { recursive: true, force: true });
}
