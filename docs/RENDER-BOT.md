# Render cloud browser runtime

The existing Node runtime cannot start the desktop Python/Chrome worker. Switch
the existing `Orqix-api` service to the repository Docker runtime after CI passes.
The frontend stays on Vercel and private documents stay on Cloudinary.

## Existing service settings

Render → Settings → Build → Source → Edit → select the same `AAGarg001/Orqix`
repository and `main`, then Runtime **Docker**. Use:

- Root directory / build context: repository root (blank / `.`)
- Dockerfile: `deploy/render.Dockerfile`
- Docker command override: blank (the image CMD starts the API)
- Health check: `/api/health`
- Auto-deploy: After CI Checks Pass

The existing URL, Atlas and Cloudinary environment settings remain in this
service. Set these backend environment variables:

```env
WORKER_RUNTIME=hosted
PYTHON_EXECUTABLE=/opt/venv/bin/python
BROWSER_PUBLIC_ORIGIN=https://orqix-api.onrender.com
PUBLIC_ORIGIN=https://orqix-psi.vercel.app
MAX_CONCURRENT_JOBS=1
MAX_JOBS_PER_USER=1
COOKIE_SECURE=true
```

Use one instance. Hosted mode enforces one active browser job per API instance.
Capacity is limited deliberately; each browser needs Python, Chromium and a
display. Validate memory on the selected compute plan; Free has 512 MB and 0.1
CPU and may exhaust memory on real portal pages. The CI smoke test uses 2 GB.
Do not purchase or upgrade compute without the account owner's approval.

## Login flow and isolation

Each job starts an independent Python supervisor, Xvfb display, browser profile,
worker token and temporary directory. The Python supervisor only receives its
worker settings, not Atlas, Cloudinary, payments or mail credentials. Worker
HTTP, VNC and websockify listen on loopback. Only Node's public API is exposed.
This is process isolation inside one container, not per-job container isolation.

The browser obtains a 45-second, single-use ticket through the authenticated
Vercel API proxy. noVNC connects directly to Render via WSS so browser cookies
do not need cross-site access. Tickets are scoped to the job, owner and current
login session. The server validates Origin, assignments, permissions and session
expiry, and disconnects on logout/revocation. Browser controls close when
automation starts; they cannot modify an extraction in progress.

Cancellation, timeout or backend shutdown terminates the job process group and
removes its temporary profile/files. A worker watchdog also stops orphaned
workers. Render restarts invalidate active portal sessions; start a new job.

## Verification

GitHub CI builds the Render image and runs a real worker health check, VNC/RFB
handshake and headed Chromium against an offline page. No CPCB credentials are
used. Browser ticket tests cover authentication, ownership, Origin, expiry,
replay and session revocation. Final extraction against CPCB requires the user
to enter their actual portal credentials and complete OTP manually.

After deployment `/api/health` should report `workerRuntime: hosted`.
Open Extract Bot → Open Login → enter credentials → complete OTP in the remote
browser → Verify OTP login → Extract. Download the resulting workbook before
the temporary retention period ends.
