FROM debian:bookworm-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DISPLAY=:99 HOME=/home/worker PATH=/opt/venv/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv python3-tk chromium chromium-driver xvfb x11vnc websockify openbox fonts-liberation ca-certificates tini && python3 -m venv --system-site-packages /opt/venv && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY workers/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY ["commonportalscraper separate Available.py", "/app/legacy.py"]
COPY ["commonportalpwpscraper 2.1.py", "/app/operations_source.py"]
COPY workers/app.py workers/start.py workers/operations.py ./
RUN useradd -m -u 1000 worker && mkdir /work && chown worker:worker /work
USER worker
EXPOSE 8000 6080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "/app/start.py"]
