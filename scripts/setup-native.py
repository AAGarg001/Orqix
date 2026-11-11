"""Install the native Python and matching official Chrome/driver runtime."""
import json
import os
from pathlib import Path
import platform
import stat
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / ".native"


def run(args, **kwargs):
    subprocess.run([str(arg) for arg in args], check=True, **kwargs)


def download_zip(url, destination):
    if not url.startswith("https://storage.googleapis.com/chrome-for-testing-public/"):
        raise RuntimeError("Unexpected browser download origin")
    archive = NATIVE / (destination.name + ".zip")
    urllib.request.urlretrieve(url, archive)
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        for entry in zipped.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise RuntimeError("Invalid browser archive path")
        zipped.extractall(destination)
    archive.unlink()


def main():
    if sys.platform != "linux" or platform.machine() not in ("x86_64", "AMD64"):
        raise RuntimeError("Native hosted runtime requires Linux x86_64")
    NATIVE.mkdir(exist_ok=True)
    python = NATIVE / "venv/bin/python"
    if not python.exists():
        run([sys.executable, "-m", "venv", NATIVE / "venv"])
    run([python, "-m", "pip", "install", "--disable-pip-version-check", "-r", ROOT / "workers/requirements.txt"])
    manifest_url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
    with urllib.request.urlopen(manifest_url, timeout=60) as response:
        stable = json.load(response)["channels"]["Stable"]
    for kind in ("chrome", "chromedriver"):
        url = next(item["url"] for item in stable["downloads"][kind] if item["platform"] == "linux64")
        download_zip(url, NATIVE / kind)
    chrome = NATIVE / "chrome/chrome-linux64/chrome"
    driver = NATIVE / "chromedriver/chromedriver-linux64/chromedriver"
    for executable in (chrome, driver, chrome.parent / "chrome_crashpad_handler", chrome.parent / "chrome_sandbox"):
        if executable.exists():
            executable.chmod(executable.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    library_dir = NATIVE / "libs/usr/lib/x86_64-linux-gnu"
    env = {**os.environ, "LD_LIBRARY_PATH": str(library_dir) + ":" + os.environ.get("LD_LIBRARY_PATH", "")}
    missing = subprocess.run(["ldd", chrome], capture_output=True, text=True, env=env).stdout
    if True:  # Install the virtual display even when Chrome libraries already exist.
        # Render builds are unprivileged. Download signed-distribution packages
        # and extract libraries under the project instead of requiring sudo.
        lists = NATIVE / "apt/lists"
        (lists / "partial").mkdir(parents=True, exist_ok=True)
        debs = NATIVE / "apt/debs"
        debs.mkdir(parents=True, exist_ok=True)
        options = ["-o", f"Dir::State::lists={lists}", "-o", "APT::Get::List-Cleanup=0"]
        run(["apt-get", *options, "update"])
        packages = ["libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdbus-1-3", "libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2", "libgbm1", "libasound2", "libatspi2.0-0", "libx11-xcb1", "libdrm2", "libwayland-server0", "libx11-6", "libxcb1", "libxext6", "libxrender1", "libxi6", "libxcursor1", "libxss1", "libxtst6", "xvfb", "xserver-common", "x11-xkb-utils", "xkb-data", "libxfont2", "libxkbfile1", "libfontenc1", "libpixman-1-0", "libunwind8", "libxau6", "libxdmcp6"]
        run(["apt-get", *options, "download", *packages], cwd=debs)
        for package in debs.glob("*.deb"):
            run(["dpkg-deb", "-x", package, NATIVE / "libs"])
        missing = subprocess.run(["ldd", chrome], capture_output=True, text=True, env=env).stdout
        if "not found" in missing:
            raise RuntimeError("Native Chromium libraries still missing: " + "; ".join(line.strip() for line in missing.splitlines() if "not found" in line))
    # Relocate the distro X server's compiled keyboard-helper directory. The
    # same-length replacement preserves ELF offsets and avoids writing /usr/bin.
    xvfb = NATIVE / "libs/usr/bin/Xvfb"
    original = xvfb.read_bytes()
    if b"/usr/bin\0" not in original:
        raise RuntimeError("Unsupported Xvfb keyboard helper layout")
    xvfb.write_bytes(original.replace(b"/usr/bin\0", b"./xkbbin\0"))
    xvfb.chmod(0o755)
    helper = NATIVE / "libs/xkbbin"
    if not helper.exists():
        helper.symlink_to("usr/bin", target_is_directory=True)
    run([chrome, "--version"], env=env)
    run([driver, "--version"], env=env)
    (NATIVE / "runtime.json").write_text(json.dumps({"version": stable["version"], "python": "venv/bin/python", "chrome": "chrome/chrome-linux64/chrome", "driver": "chromedriver/chromedriver-linux64/chromedriver", "libraries": "libs/usr/lib/x86_64-linux-gnu", "display": "libs/usr/bin/Xvfb"}))
    print("Native browser and matching driver installed.")


if __name__ == "__main__":
    main()
