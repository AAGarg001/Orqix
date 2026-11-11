// k6 run -e BASE_URL=https://your-domain -e SESSION=your-session-cookie tests/load/dashboard.js
// Control-plane load only. This does NOT prove 100 real browser workers.
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { stages: [{ duration: '30s', target: 50 }, { duration: '2m', target: 50 }, { duration: '15s', target: 0 }], thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<1000'] } };
export default function () {
  const response = http.get(`${__ENV.BASE_URL}/api/jobs`, { headers: { Cookie: `session=${__ENV.SESSION}` } });
  check(response, { 'jobs endpoint responds': r => r.status === 200 });
  sleep(2);
}
