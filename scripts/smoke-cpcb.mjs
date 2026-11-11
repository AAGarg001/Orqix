// Real browser smoke check: opens CPCB login but never enters credentials or submits.
const base = process.env.SMOKE_API ?? 'http://127.0.0.1:4000';
const origin = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';
let cookie = '', id;
async function api(endpoint, body) {
 const response = await fetch(base + '/api' + endpoint, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(240000) });
 const value = await response.json(); if (!response.ok) throw new Error(value.error ?? 'Request failed');
 if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]; return value;
}
try {
 await api('/auth/register', { name: 'Connectivity check', email: `connectivity-${Date.now()}@example.invalid`, password: `LocalCheck-${Date.now()}!` });
 id = (await api('/jobs', { name: 'Real CPCB connectivity check', mode: 'available' })).job.id;
 for (let n=0;n<60;n++) { const {job}=await api(`/jobs/${id}`); if(job.status==='awaiting_otp')break; if(job.status==='failed')throw new Error(job.error ?? job.stage); await new Promise(r=>setTimeout(r,500)); }
 const result = await api(`/jobs/${id}/open`, {});
 if (!result.loginFieldsVisible) throw new Error('CPCB login controls were not verified');
 console.log(JSON.stringify({ actualChromeOpened: true, portalUrl: result.url, portalTitle: result.title, loginFieldsVisible: true, credentialsSubmitted: false }));
} catch(error) { console.error(error.message); process.exitCode=1; }
finally { if(id) await api(`/jobs/${id}/cancel`,{}).catch(()=>{}); await api('/auth/logout',{}).catch(()=>{}); }
