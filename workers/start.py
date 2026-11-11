"""One private X display/browser per container. No VNC or worker ports published."""
import os
import subprocess
import time
import signal
import sys

children = []

def stop(*_):
    for child in reversed(children):
        child.terminate()
    sys.exit(0)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
children.append(subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1440x900x24", "-nolisten", "tcp"]))
time.sleep(1)
children.append(subprocess.Popen(["openbox"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
# These services are reachable only on the private Docker network. Express authenticates
# ownership before proxying WebSocket upgrades. Never publish 5900/6080 externally.
children.append(subprocess.Popen(["x11vnc", "-display", ":99", "-forever", "-shared", "-nopw", "-listen", "127.0.0.1", "-rfbport", "5900"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
children.append(subprocess.Popen(["websockify", "6080", "127.0.0.1:5900"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
children.append(subprocess.Popen(["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]))
while True:
    if any(c.poll() is not None for c in children):
        stop()
    time.sleep(1)
