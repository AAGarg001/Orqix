# Automatic deployment

Repository: `AAGarg001/Orqix`. Production branch: `main`.

The GitHub Actions workflow **Verify platform**, job **checks**, runs on pushes,
pull requests and manual dispatch. It typechecks both workspaces, runs backend
tests (including GridFS against an isolated MongoDB service), builds both apps,
runs Python worker tests, runs browser regression tests and verifies native Python and a real headless Chromium browser. It needs no production secrets. Superseded runs are cancelled;
browser failure reports are retained for seven days.

## Existing hosting services: required dashboard settings

These settings belong to the existing hosting services. Committing this file
does not change their dashboard settings.

1. Render → **Orqix-api → Settings → Build & Deploy**:
   repository `AAGarg001/Orqix`, branch `main`, Auto-Deploy **After CI Checks Pass**.
   Keep Root Directory blank; Build Command
   `bash scripts/render-build.sh`;
   Start Command `node scripts/start-native.mjs`; Health Check Path `/api/health`.
2. Vercel → **orqix → Settings → Git**: keep the GitHub repository connected.
   Production branch must be `main`, Root Directory `apps/web`, preset Vite,
   Build Command `npm run build`, Output Directory `dist`.
3. Vercel → **Settings → Deployment Checks → Add Checks → GitHub**:
   require the GitHub Actions check **checks**. Keep automatic production
   aliasing enabled. Vercel builds on pushes, then holds production promotion
   until this check passes. Without this setting, Git deployments can go live
   before CI finishes.

After saving these settings, push or merge a commit to `main`. GitHub → Actions
must show **Verify platform / checks** passing on that exact commit. Render
then builds and deploys that commit; Vercel promotes its successful build.
Failed CI blocks deployment/promotion once the dashboard gates are enabled.
Other branches are for development/preview and do not update production.

Environment changes still belong in the hosting dashboards. Never commit `.env`
or add production credentials to CI. No deploy hooks or extra hosting tokens are
needed with this Git integration setup.

## Documentation screenshots

Run `npx playwright test --config playwright.docs.config.ts` separately.
Documentation capture deliberately seeds its own demonstration data and is not
a regression test. Running it together with regression suites caused duplicate
organization/team fixtures. Each command starts its own isolated test server.

## References

- https://render.com/docs/deploys
- https://vercel.com/docs/git
- https://vercel.com/docs/deployment-checks
