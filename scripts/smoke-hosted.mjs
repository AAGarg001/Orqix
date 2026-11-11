import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../apps/api/dist/store.js';
import { Runner } from '../apps/api/dist/runner.js';
if (process.env.NODE_ENV !== 'test' || process.env.METADATA_STORE !== 'memory' || process.env.WORKER_RUNTIME !== 'hosted') throw new Error('Isolated hosted smoke environment required');
const store = new Store(true), runner = new Runner(store), id = randomUUID();
const now = new Date().toISOString(), work = await mkdtemp(path.join(tmpdir(), 'orqix-chrome-smoke-'));
try {
  await runner.reserve({ id, userId: randomUUID(), name: 'Offline worker smoke', mode: 'all', status: 'starting', stage: 'Starting', records: 0, sections: [], artifact: false, createdAt: now, updatedAt: now });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const job = await store.job(id);
    if (job.status === 'failed') throw new Error(job.error);
    if (job.status === 'awaiting_otp') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if ((await store.job(id)).status !== 'awaiting_otp') throw new Error('Worker readiness timed out');
  if (!(await runner.call(id, '/health')).ok) throw new Error('Worker health failed');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(runner.browserBase(id).replace('http:', 'ws:') + '/websockify');
    const timer = setTimeout(() => { ws.close(); reject(new Error('RFB handshake timed out')); }, 10000);
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Private browser socket failed')); });
    ws.addEventListener('message', async event => {
      const data = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString();
      clearTimeout(timer); ws.close();
      if (!data.startsWith('RFB ')) reject(new Error('Invalid VNC handshake')); else resolve();
    }, { once: true });
  });
  await promisify(execFile)('xvfb-run', ['-a', process.env.PYTHON_EXECUTABLE, 'smoke_browser.py'], {
    cwd: path.resolve('workers'), timeout: 45000,
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8', WORKER_RUNTIME: 'hosted', WORK_DIR: work,
      LEGACY_SCRIPT: path.resolve('commonportalscraper separate Available.py'), OPERATIONS_SCRIPT: path.resolve('commonportalpwpscraper 2.1.py') },
  });
  console.log('Hosted smoke passed: real Python worker, private display, VNC and headed Chromium.');
  const peak = await readFile('/sys/fs/cgroup/memory.peak', 'utf8').catch(() => '');
  if (peak.trim() && Number.isFinite(Number(peak))) console.log(`Hosted smoke memory peak: ${Math.ceil(Number(peak) / 1024 / 1024)} MiB`);
} finally {
  await runner.shutdown();
  await rm(work, { recursive: true, force: true });
}
