FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --include=dev --no-audit --no-fund
COPY apps/api ./apps/api
RUN npm run build --workspace apps/api && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-tk chromium chromium-driver xvfb xauth \
    x11vnc websockify openbox fonts-liberation ca-certificates tini \
    && python3 -m venv --system-site-packages /opt/venv \
    && rm -rf /var/lib/apt/lists/*
ENV PATH=/opt/venv/bin:$PATH NODE_ENV=production PORT=4000 \
    WORKER_RUNTIME=hosted PYTHON_EXECUTABLE=/opt/venv/bin/python \
    MAX_CONCURRENT_JOBS=1 MAX_JOBS_PER_USER=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY workers/requirements.txt workers/requirements.txt
RUN pip install --no-cache-dir -r workers/requirements.txt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY package.json ./package.json
COPY workers ./workers
COPY ["commonportalscraper separate Available.py", "commonportalpwpscraper 2.1.py", "./"]
COPY scripts/smoke-hosted.mjs ./scripts/smoke-hosted.mjs
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
