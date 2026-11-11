import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
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
const display = spawn(path.join(native, runtime.display), [
  '-displayfd', '1', '-screen', '0', '1440x1000x24', '-nolisten', 'tcp',
  '-noreset', '-fp', 'built-ins', '-xkbdir', path.join(native, 'libs/usr/share/X11/xkb'),
], { cwd: path.join(native, 'libs'), env: {
  PATH: process.env.PATH, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH,
}, stdio: ['ignore', 'pipe', 'pipe'] });
let displayLog = '';
display.stderr.on('data', chunk => { displayLog = (displayLog + chunk.toString()).slice(-3000); });
await new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => { display.kill(); reject(new Error('Virtual display startup timed out. ' + displayLog)); }, 15000);
  display.once('error', error => { clearTimeout(timer); reject(error); });
  display.once('exit', code => { clearTimeout(timer); reject(new Error(`Virtual display exited (${code}). ${displayLog}`)); });
  display.stdout.on('data', chunk => {
    output += chunk.toString();
    const match = output.match(/^(\d+)\n/);
    if (match) { clearTimeout(timer); process.env.DISPLAY = ':' + match[1]; resolve(); }
  });
});
process.on('exit', () => display.kill());
display.on('exit', () => { if (!process.argv.includes('--check') && !process.argv.includes('--smoke')) process.exit(1); });
if (process.argv.includes('--check')) {
  const work = await mkdtemp(path.join(tmpdir(), 'orqix-native-check-'));
  try {
    const check = await promisify(execFile)(process.env.PYTHON_EXECUTABLE, ['smoke_browser.py'], {
      cwd: path.join(root, 'workers'), timeout: 180000,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, DISPLAY: process.env.DISPLAY,
        WORKER_RUNTIME: 'hosted', PORTAL_PROBE: 'true', CHROME_BINARY: process.env.CHROME_BINARY, CHROMEDRIVER_PATH: process.env.CHROMEDRIVER_PATH,
        WORK_DIR: work, LEGACY_SCRIPT: path.join(root, 'commonportalscraper separate Available.py'), OPERATIONS_SCRIPT: path.join(root, 'commonportalpwpscraper 2.1.py') },
    });
    for (const line of check.stdout.split('\n')) if (line.startsWith('PORTAL_PROBE_RESULT=')) console.log(line);
    console.log('Native visible Chromium check passed.');
  } finally { display.kill(); await rm(work, { recursive: true, force: true }); }
} else if (process.argv.includes('--smoke')) {
  Object.assign(process.env, { NODE_ENV: 'test', METADATA_STORE: 'memory', PRIVATE_FILE_STORAGE: 'local' });
  try { await import('./smoke-hosted.mjs'); } finally { display.kill(); }
} else {
  await import('../apps/api/dist/index.js');
}
