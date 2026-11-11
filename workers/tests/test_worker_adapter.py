import importlib.util
import json
import time
import sys
from pathlib import Path
import pandas as pd
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "worker-test-token-" + "x" * 32
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

@pytest.fixture
def worker(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / "workers"))
    monkeypatch.setenv("WORK_DIR", str(tmp_path))
    monkeypatch.setenv("WORKER_TOKEN", TOKEN)
    monkeypatch.setenv("LEGACY_SCRIPT", str(ROOT / "commonportalscraper separate Available.py"))
    monkeypatch.setenv("OPERATIONS_SCRIPT", str(ROOT / "commonportalpwpscraper 2.1.py"))
    spec = importlib.util.spec_from_file_location("worker_under_test", ROOT / "workers" / "app.py")
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, "worker_under_test", module)
    spec.loader.exec_module(module)
    return module, TestClient(module.app)

class Driver:
    current_url = "https://epr.cpcb.gov.in/onboarding/dashboard"
    closed = False
    def quit(self):
        self.closed = True

def verify(worker, monkeypatch):
    module, client = worker
    driver = Driver()
    module.legacy.driver = driver
    monkeypatch.setattr(module.legacy, "extract_entity_metadata", lambda _: {"Entity Name": "Test entity", "Unit Type": "PIBO", "Unit": "Delhi"})
    assert client.post("/verify", headers=HEADERS, json={}).status_code == 200
    return driver

def wait_finished(module):
    for _ in range(100):
        if module.state["status"] != "running" and not module.lock.locked():
            return
        time.sleep(.02)
    raise AssertionError("Worker did not finish")

def test_worker_authentication_and_verification_preconditions(worker):
    module, client = worker
    assert client.get("/status").status_code in (401, 403)
    assert client.get("/status", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.post("/verify", headers=HEADERS, json={}).status_code == 409
    assert client.post("/run", headers=HEADERS, json={"mode": "available"}).status_code == 409
    assert client.get("/artifact", headers=HEADERS).status_code == 410


def test_frames_wait_quietly_before_login_and_during_browser_actions(worker):
    module, client = worker
    assert client.get("/browser/frame", headers=HEADERS).status_code == 204
    module.lock.acquire()
    try:
        response = client.get("/browser/frame", headers=HEADERS)
        assert response.status_code == 204
        assert response.headers["cache-control"] == "no-store"
    finally:
        module.lock.release()
    class StartPage(Driver):
        current_url = "chrome://newtab/"
        def get_screenshot_as_png(self):
            raise AssertionError("The Chrome start page must not be exposed")
    module.legacy.driver = StartPage()
    assert client.get("/browser/frame", headers=HEADERS).status_code == 204


def test_login_waits_for_inflight_frame_instead_of_failing_busy(worker, monkeypatch):
    import threading
    module, client = worker
    entered, release = threading.Event(), threading.Event()
    class FrameDriver(Driver):
        def get_screenshot_as_png(self):
            entered.set()
            assert release.wait(3)
            return b"\x89PNG"
    module.legacy.driver = FrameDriver()
    calls = []
    monkeypatch.setattr(module.legacy, "open_login", lambda user, password: calls.append((user, password)))
    frame_thread = threading.Thread(target=lambda: client.get("/browser/frame", headers=HEADERS))
    frame_thread.start()
    assert entered.wait(3)
    timer = threading.Timer(.2, release.set)
    timer.start()
    try:
        result = client.post("/login", headers=HEADERS, json={"userId": "fixture", "password": "fixture-password"})
        assert result.status_code == 200
        assert calls == [("fixture", "fixture-password")]
    finally:
        release.set()
        frame_thread.join(3)
        timer.join(3)

def test_native_mode_uses_visible_chrome_and_a_private_job_profile(worker, monkeypatch):
    module, _ = worker
    monkeypatch.setenv("WORKER_RUNTIME", "local")
    created = {}
    class NativeDriver(Driver):
        def set_page_load_timeout(self, timeout):
            self.timeout = timeout
    def chrome(**kwargs):
        created.update(kwargs)
        return NativeDriver()
    monkeypatch.setattr(module.webdriver, "Chrome", chrome)
    driver = module.browser()
    assert "service" not in created
    assert created["options"].page_load_strategy == "eager"
    assert not any("headless" in argument for argument in created["options"].arguments)
    assert f"--user-data-dir={module.legacy.CHROME_PROFILE_DIR}" in created["options"].arguments
    assert module.browser() is driver


def test_hosted_mode_requires_display_and_never_enables_headless(worker, monkeypatch):
    module, _ = worker
    monkeypatch.setenv("WORKER_RUNTIME", "hosted")
    monkeypatch.setenv("CHROME_BINARY", "/private/chrome")
    monkeypatch.setenv("CHROMEDRIVER_PATH", "/private/chromedriver")
    monkeypatch.delenv("DISPLAY", raising=False)
    with pytest.raises(RuntimeError, match="managed virtual display"):
        module.browser()
    monkeypatch.setenv("DISPLAY", ":99")
    created = {}
    class HostedDriver(Driver):
        def set_page_load_timeout(self, timeout):
            pass
    def chrome(**kwargs):
        created.update(kwargs)
        return HostedDriver()
    monkeypatch.setattr(module.webdriver, "Chrome", chrome)
    module.browser()
    assert not any("headless" in argument for argument in created["options"].arguments)
    assert created["options"].binary_location == "/private/chrome"
    assert created["service"].path == "/private/chromedriver"

def test_worker_available_calls_existing_excel_logic_and_cleans_session(worker, monkeypatch):
    module, client = worker
    driver = verify(worker, monkeypatch)
    monkeypatch.setattr(module.legacy, "extract_available_api", lambda *_: pd.DataFrame([{"Certificate ID": "001", "Value(MT)": 12.5}]))
    module.legacy.DOWNLOAD_DIR.mkdir()
    (module.legacy.DOWNLOAD_DIR / "raw.csv").write_text("sensitive-data")
    module.legacy.COOKIE_FILE.write_text("sensitive-cookie")
    assert client.post("/run", headers=HEADERS, json={"mode": "available"}).status_code == 200
    wait_finished(module)
    assert module.state["status"] == "completed"
    assert module.state["records"] == 1
    assert not driver.closed  # original controls can reuse this isolated login
    assert module.legacy.DOWNLOAD_DIR.exists()
    assert client.get("/artifact", headers=HEADERS).status_code == 410
    assert client.post("/run", headers=HEADERS, json={"mode": "available"}).status_code == 200
    wait_finished(module)
    monkeypatch.setattr(module.legacy, "procurement_part", lambda *_: None)
    def wallet(driver, output, entity, statuses):
        module.legacy.append_sheet(output, "Generated", pd.DataFrame([{"Certificate": "G001"}]))
        statuses.append(("Generated", "Success", "1 rows"))
    monkeypatch.setattr(module.legacy, "wallet_part", wallet)
    assert client.post("/run", headers=HEADERS, json={"mode": "all"}).status_code == 200
    wait_finished(module)
    assert client.get("/artifact", headers=HEADERS).status_code == 200
    from openpyxl import load_workbook
    import re
    assert re.fullmatch(r'Test entity_PIBO_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_\d{6}\.xlsx', module.state['downloadName'])
    assert module.state['downloadName'] in client.get('/artifact', headers=HEADERS).headers['content-disposition'].replace('%20', ' ')
    book = load_workbook(module.output)
    assert book.sheetnames == ["Errors and Skipped", "Generated", "Available"]
    book.close()
    assert not module.legacy.DOWNLOAD_DIR.exists()
    old_name = module.state['downloadName']
    assert client.post('/artifact/consume', headers=HEADERS, json={'downloadName': old_name}).status_code == 200
    assert module.output is None
    assert not module.legacy.OUTPUT_DIR.exists()
    assert not module.extraction_runs
    assert client.get('/artifact', headers=HEADERS).status_code == 410
    # A retry after delivery rebuilds both sources without retaining old rows.
    assert client.post('/run', headers=HEADERS, json={'mode':'available'}).status_code == 200
    wait_finished(module)
    assert set(module.extraction_runs) == {'all', 'available'}
    assert client.get('/artifact', headers=HEADERS).status_code == 200
    assert client.post('/artifact/consume', headers=HEADERS, json={'downloadName':old_name}).status_code == 409
    assert "sensitive" not in json.dumps(client.get("/status", headers=HEADERS).json())

def test_worker_partial_failures_keep_final_workbook_and_do_not_leak_errors(worker, monkeypatch):
    module, client = worker
    verify(worker, monkeypatch)
    def procurement(_driver, output, _entity, statuses):
        module.legacy.append_sheet(output, "Procurement data", pd.DataFrame([{"Quantity": 3}]))
        statuses.append(("Procurement", "Success", "1 rows"))
    def fail(*_):
        raise RuntimeError("secret-token=do-not-expose")
    monkeypatch.setattr(module.legacy, "procurement_part", procurement)
    monkeypatch.setattr(module.legacy, "wallet_part", fail)
    assert client.post("/run", headers=HEADERS, json={"mode": "all"}).status_code == 200
    wait_finished(module)
    assert module.state["status"] == "partial"
    assert "secret-token" not in json.dumps(module.state)
    assert client.get("/artifact", headers=HEADERS).status_code == 410
    assert client.get("/preview", headers=HEADERS).status_code == 410
    monkeypatch.setattr(module.legacy, "extract_available_api", lambda *_: pd.DataFrame([{"Certificate": "A001"}]))
    assert client.post("/run", headers=HEADERS, json={"mode": "available"}).status_code == 200
    wait_finished(module)
    assert module.state["status"] == "partial"
    assert any(s["status"] == "Failed" for s in module.state["sections"])
    assert client.get("/artifact", headers=HEADERS).status_code == 200

def test_failed_entity_capture_never_exposes_a_successful_artifact(worker, monkeypatch):
    module, client = worker
    verify(worker, monkeypatch)
    monkeypatch.setattr(module.legacy, "extract_entity_metadata", lambda _: (_ for _ in ()).throw(RuntimeError("session expired")))
    assert client.post("/run", headers=HEADERS, json={"mode": "available"}).status_code == 200
    wait_finished(module)
    assert module.state["status"] == "failed"
    assert client.get("/artifact", headers=HEADERS).status_code == 410

def test_failed_available_offers_partial_then_retry_replaces_errors(worker, monkeypatch):
    module, client = worker
    verify(worker, monkeypatch)
    def all_part(driver, output, entity, statuses):
        module.legacy.append_sheet(output, 'Generated', pd.DataFrame([{'ID':'G001'}]))
        statuses.append(('Generated','Success','1 rows'))
    monkeypatch.setattr(module.legacy,'procurement_part',lambda *_:None)
    monkeypatch.setattr(module.legacy,'wallet_part',all_part)
    assert client.post('/run',headers=HEADERS,json={'mode':'all'}).status_code == 200
    wait_finished(module)
    def fail(*_): raise RuntimeError('portal unavailable')
    monkeypatch.setattr(module.legacy,'extract_available_api',fail)
    assert client.post('/run',headers=HEADERS,json={'mode':'available'}).status_code == 200
    wait_finished(module)
    assert module.state['status'] == 'partial'
    assert client.get('/artifact',headers=HEADERS).status_code == 200
    monkeypatch.setattr(module.legacy,'extract_available_api',lambda *_:pd.DataFrame([{'ID':'A001'}]))
    assert client.post('/run',headers=HEADERS,json={'mode':'available'}).status_code == 200
    wait_finished(module)
    assert module.state['status'] == 'completed'
    assert client.get('/artifact',headers=HEADERS).status_code == 200
    messages=[event['message'] for event in module.events]
    assert 'Wallet part extracted successfully.' in messages
    assert 'Available part failed.' in messages
    assert 'Available part extracted successfully.' in messages
