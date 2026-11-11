# Native Render bot

Use existing service, Free compute, repository AAGarg001/Orqix, branch main.

- Runtime: Node
- Root Directory: blank
- Build Command: `bash scripts/render-build.sh`
- Start Command: `node scripts/start-native.mjs`
- Health Check: `/api/health`

Keep NODE_VERSION=22, NODE_ENV=production, PUBLIC_ORIGIN=https://orqix-psi.vercel.app, COOKIE_SECURE=true, METADATA_STORE=mongodb, PRIVATE_FILE_STORAGE=cloudinary, MongoDB URI and Cloudinary credentials in Render environment settings. Preserve proxy and assignment settings. Set job concurrency and jobs per user to 1.

The build installs private Python and matching official Chrome for Testing/ChromeDriver, checks libraries and runs a real browser smoke test. The start wrapper sets hosted mode and absolute Python/browser paths. Python workers bind to loopback and use per-job tokens. Workers receive no database or storage credentials.

Open Login creates one headless browser. Authenticated users see private screenshots and send clicks, typing, scrolling and keys through the API proxy. Enter OTP manually. Controls lock during automation. Clear session files when finished; one retained session is allowed.

Free compute is a limited trial. Browser memory may exceed 512 MB depending on portal content. No paid upgrade is performed. Sleeping/restarting loses active browser sessions. CI verifies native browser startup/input; a full portal extraction requires human OTP.
