"""One private display and browser per job; only the Node API is public."""
import argparse
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-port", type=int, required=True)
    parser.add_argument("--browser-port", type=int, required=True)
    args = parser.parse_args()
    children = []

    def stop(*_):
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
        for child in reversed(children):
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        # Xvfb chooses an unused display atomically; no shared :99 browser.
        read_fd, write_fd = os.pipe()
        display = subprocess.Popen(
            ["Xvfb", "-displayfd", str(write_fd), "-screen", "0", "1440x900x24", "-nolisten", "tcp"],
            pass_fds=(write_fd,), stdout=subprocess.DEVNULL,
        )
        children.append(display)
        os.close(write_fd)
        with os.fdopen(read_fd) as reader:
            number = reader.readline().strip()
        if not number.isdigit():
            raise RuntimeError("Private display failed to start")
        env = {**os.environ, "DISPLAY": f":{number}", "WORKER_RUNTIME": "hosted"}
        work = Path(env["WORK_DIR"])
        work.mkdir(parents=True, exist_ok=True)
        env["HOME"] = str(work)
        rfb_port = free_port()
        commands = [
            ["openbox"],
            ["x11vnc", "-display", env["DISPLAY"], "-forever", "-shared", "-nopw", "-localhost", "-rfbport", str(rfb_port), "-quiet"],
            ["websockify", "--heartbeat", "30", f"127.0.0.1:{args.browser_port}", f"127.0.0.1:{rfb_port}"],
            [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", str(args.api_port), "--no-access-log"],
        ]
        for command in commands:
            children.append(subprocess.Popen(command, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
        while all(child.poll() is None for child in children):
            time.sleep(0.25)
    finally:
        stop()


if __name__ == "__main__":
    main()
