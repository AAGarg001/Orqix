# Run ORQIX locally (Windows PowerShell)

Open `START-ORQIX.cmd` from the project folder to start both services. It selects the correct working directory automatically. Keep its terminal open. Alternatively, run:

```powershell
cd "C:\Users\AniketYadav\New folder"
npm.cmd run dev
```

Wait for both `VITE ready` and `CPCB API listening on port 4000`. Open http://127.0.0.1:5173/client/login for clients or http://127.0.0.1:5173/admin/login for staff administration. Closing the terminal or pressing Ctrl+C stops the website. If startup fails, preserve the first error printed above the npm exit message; the exit message alone does not identify the cause. Use the same hostname consistently when logging in.

Requires Node.js 22, Python 3.12+, Chrome and Atlas network access. Keep the original two BOT files at repository root.

```powershell
npm.cmd ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r workers/requirements.txt
```

Copy docs/env.example to .env only if .env does not already exist. Set your Atlas URI privately; do not overwrite existing secrets. Local configuration: WORKER_RUNTIME=local, METADATA_STORE=mongodb, PYTHON_EXECUTABLE=.venv/Scripts/python.exe, PUBLIC_ORIGIN=http://localhost:5173, COOKIE_SECURE=false, ENFORCE_ASSIGNMENTS=true, REGISTRATION_ENABLED=false.

```powershell
npm.cmd run dev
```

Or separate terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
```

Frontend: http://localhost:5173/admin/login (management) or /login (employees). API: http://localhost:4000/api/health. No default production login is included. First Super Admin provisioning is implemented in apps/api/src/create-admin.ts, but live Atlas creation remains pending explicit authorization following automatic approval-review rejection. Its reviewed interface accepts email/name/password JSON on stdin through npm.cmd run admin:create; it refuses an existing email and hashes the password. Do not expose credentials in command history or commit a provisioning file.

After provisioning: create department/team/manager/employee; share the single-use setup link securely; import allocations using the downloaded template. Configure the CPCB account's expected application ID before upload/delete. Select an authorized assignment, Open Login, complete OTP manually in the isolated Chrome, Verify Login, then Scrape All or Available. A local browser is visible only on this backend machine.

Redis is optional for local manual operations; configure it for scheduled email. Graph, Spaces and model access require your own credentials. No email is sent without configured credentials and an authorized action/schedule.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
.venv\Scripts\python.exe -m pytest workers/tests -q
```

Browser tests start their own test-only API/Vite ports 4100/5175 and do not seed Atlas. Existing processes on 4000/5173 are not reused or stopped. Native workers are separate processes, not OS security sandboxes; use container workers for hosted users.

## Client workspace

Open http://localhost:5173/client/login for external clients. First create an organization and owner under Admin ? Client Organizations, and use the returned one-time setup link. Existing staff identities remain separate. Publish reviewed plans and grant explicitly approved contracted access when using the initial Hybrid Managed model. Full setup and limitations: [CLIENT-PORTAL.md](docs/CLIENT-PORTAL.md).
