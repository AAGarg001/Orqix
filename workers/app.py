"""Adapter around the user's unmodified Selenium workflow, one private process per job.

Credentials remain in request memory. CPCB data is kept only in the job's temporary directory.
Do not add extraction rows, raw logs, cookies, or portal tokens to metadata responses.
"""
from __future__ import annotations
import importlib.util
import os
import re
import secrets
import shutil
import threading
import time
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.keys import Keys
import pandas as pd

WORK = Path(os.environ.get("WORK_DIR", "/work"))
WORK.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("legacy", os.environ.get("LEGACY_SCRIPT", str(Path(__file__).with_name("legacy.py"))))
legacy = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(legacy)
legacy.OUTPUT_DIR = WORK / "output"
legacy.DOWNLOAD_DIR = WORK / "downloads"
legacy.COOKIE_FILE = WORK / "cookies.json"
legacy.CHROME_PROFILE_DIR = WORK / "profile"

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
security = HTTPBearer()
lock = threading.Lock()
state_lock = threading.Lock()
state = {"status": "awaiting_otp", "stage": "Browser ready", "records": 0, "sections": []}
events = deque(maxlen=500)
event_sequence = 0
credential_redactions = set()
output: Path | None = None
extraction_runs = {}
download_consumed = False
verified = False
last_contact = time.monotonic()

def auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    global last_contact
    token = os.environ.get("WORKER_TOKEN", "")
    if len(token) < 32 or not secrets.compare_digest(credentials.credentials, token):
        raise HTTPException(401, "Unauthorized")
    last_contact = time.monotonic()

def orphan_watchdog():
    # Backend renews this lease. A crashed backend must not leave real portal
    # cookies, Chrome windows, or extracted files alive indefinitely.
    while True:
        time.sleep(10)
        if time.monotonic() - last_contact < 120:
            continue
        if legacy.driver:
            try:
                legacy.driver.quit()
            except Exception:
                pass
        for directory in (legacy.OUTPUT_DIR, legacy.DOWNLOAD_DIR, legacy.CHROME_PROFILE_DIR):
            shutil.rmtree(directory, ignore_errors=True)
        legacy.COOKIE_FILE.unlink(missing_ok=True)
        os._exit(0)

if os.environ.get("WORKER_WATCHDOG") == "true":
    threading.Thread(target=orphan_watchdog, daemon=True).start()

def update(**values):
    with state_lock:
        state.update(values)
        stage = str(values.get('stage', ''))
        if re.match(r'^(Procurement|Wallet|Available) part (extracted successfully|failed)\.', stage):
            safe_log(stage, 'error' if 'failed' in stage else 'success')

def browser(allow_new=True):
    if legacy.driver is not None:
        try:
            _ = legacy.driver.current_url
            return legacy.driver
        except Exception:
            legacy.driver = None
    if not allow_new:
        raise RuntimeError("Session unavailable")
    legacy.DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    options = webdriver.ChromeOptions()
    local = os.environ.get("WORKER_RUNTIME") == "local"
    if not local:
        options.binary_location = os.environ["CHROME_BINARY"]
    arguments = ["--window-size=1440,900", "--disable-extensions", f"--user-data-dir={legacy.CHROME_PROFILE_DIR}"]
    if not local:
        arguments += ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        arguments += ["--headless=new", "--disable-background-networking", "--disable-software-rasterizer"]
    for argument in arguments:
        options.add_argument(argument)
    options.add_experimental_option("prefs", {"download.default_directory": str(legacy.DOWNLOAD_DIR), "download.prompt_for_download": False, "download.directory_upgrade": True})
    legacy.driver = webdriver.Chrome(options=options) if local else webdriver.Chrome(service=Service(os.environ["CHROMEDRIVER_PATH"]), options=options)
    legacy.driver.set_page_load_timeout(legacy.PAGE_LOAD_TIMEOUT)
    return legacy.driver

legacy.browser = browser

def safe_log(message, kind="info"):
    # Never persist original Selenium errors/HTML/token-bearing URLs.
    # Only coarse, allowlisted activity and numeric counters leave this worker.
    global event_sequence
    for secret in credential_redactions:
        if secret:
            message = str(message).replace(secret, '[REDACTED]')
    message = re.sub(r"(?i)(password|authorization|cookie|access_?token|refresh_?token|bearer|otp)\s*[:= ]\s*\S+", r"\1=[REDACTED]", str(message))
    message = re.sub(r"eyJ[A-Za-z0-9_.-]+", "[REDACTED_TOKEN]", message)
    event_sequence += 1
    events.append({"sequence": event_sequence, "time": datetime.now(timezone.utc).isoformat(), "message": message[:500], "kind": kind})
    if "Page " in message and "collected " in message:
        match = re.search(r"collected ([\d,]+)", message)
        if match:
            update(stage="Extracting Available certificate pages…")

legacy.log = safe_log
from operations import Operations
ops = Operations(os.environ.get("OPERATIONS_SCRIPT", str(Path(__file__).with_name("operations_source.py"))), WORK, browser, safe_log)

class Credentials(BaseModel):
    userId: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)

class RunRequest(BaseModel):
    mode: Literal["all", "available", "combined"]

@app.get("/health", dependencies=[Depends(auth)])
def health():
    return {"ok": True}


class BrowserInput(BaseModel):
    action: Literal["click", "text", "key", "scroll"]
    x: int = Field(default=0, ge=0, le=1440)
    y: int = Field(default=0, ge=0, le=1000)
    text: str = Field(default="", max_length=256)
    key: Literal["Tab", "Enter", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "SelectAll"] = "Tab"
    delta: int = Field(default=0, ge=-800, le=800)


def login_browser():
    if state["status"] not in ("awaiting_otp", "ready"):
        raise HTTPException(409, "Browser controls are locked during automation")
    if legacy.driver is None:
        raise HTTPException(409, "Open the portal login first")
    return legacy.driver


@app.get("/browser/frame", dependencies=[Depends(auth)])
def browser_frame():
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Browser is busy")
    try:
        image = login_browser().get_screenshot_as_png()
        return Response(image, media_type="image/png", headers={"Cache-Control": "no-store"})
    finally:
        lock.release()


@app.post("/browser/input", dependencies=[Depends(auth)])
def browser_input(data: BrowserInput):
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Browser is busy")
    try:
        driver = login_browser()
        if data.action == "click":
            for event in ("mousePressed", "mouseReleased"):
                driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": event, "x": data.x, "y": data.y, "button": "left", "clickCount": 1})
        elif data.action == "scroll":
            driver.execute_cdp_cmd("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": 600, "y": 300, "deltaX": 0, "deltaY": data.delta})
        elif data.action == "text":
            credential_redactions.add(data.text)
            driver.switch_to.active_element.send_keys(data.text)
        else:
            keys = {"Tab": Keys.TAB, "Enter": Keys.ENTER, "Backspace": Keys.BACKSPACE, "ArrowUp": Keys.ARROW_UP, "ArrowDown": Keys.ARROW_DOWN, "ArrowLeft": Keys.ARROW_LEFT, "ArrowRight": Keys.ARROW_RIGHT, "SelectAll": Keys.CONTROL + "a"}
            driver.switch_to.active_element.send_keys(keys[data.key])
        return {"ok": True}
    finally:
        lock.release()

@app.post("/login", dependencies=[Depends(auth)])
def login(credentials: Credentials):
    global verified
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Worker is busy")
    try:
        if state["status"] != "awaiting_otp":
            raise HTTPException(409, "Session cannot be reopened")
        verified = False
        credential_redactions.update([credentials.userId, credentials.password])
        try:
            legacy.open_login(credentials.userId, credentials.password)
        except Exception:
            raise HTTPException(502, "Could not open or fill CPCB login. Check Chrome, internet connectivity and the portal page.")
        return {"ok": True}
    finally:
        lock.release()

@app.post("/open", dependencies=[Depends(auth)])
def open_portal():
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Worker is busy")
    try:
        if state["status"] != "awaiting_otp":
            raise HTTPException(409, "Portal session already active")
        driver = browser()
        driver.get(legacy.LOGIN_URL)
        legacy.WebDriverWait(driver, 40).until(legacy.EC.visibility_of_element_located((legacy.By.XPATH, legacy.USER_ID_XPATH)))
        return {"ok": True, "url": driver.current_url.split("?")[0], "title": driver.title, "loginFieldsVisible": True}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, "Chrome could not open CPCB. Check Chrome installation and network access.")
    finally:
        lock.release()

@app.post("/verify", dependencies=[Depends(auth)])
def verify():
    global verified
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Worker is busy")
    try:
        if state["status"] != "awaiting_otp":
            raise HTTPException(409, "Session already verified or ended")
        if legacy.driver is None or "/login" in legacy.driver.current_url:
            raise HTTPException(409, "Complete OTP login in the browser first")
        metadata = legacy.extract_entity_metadata(legacy.driver)
        if not metadata.get("Entity Name"):
            raise HTTPException(409, "Choose the entity and open its dashboard first")
        verified = True
        update(status="ready", stage="CPCB session verified")
        application_id = None
        try:
            application_id = str(legacy.detect_logged_in_application_id(legacy.driver))
        except Exception:
            pass
        return {"ok": True, "entity": metadata, "applicationId": application_id}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(409, "Dashboard unavailable; complete login first")
    finally:
        lock.release()

def sanitize_sections(run_status):
    result = []
    for name, status, detail in run_status:
        # Only fixed section names and statuses, never original error strings.
        row = {"name": str(name)[:120], "status": str(status)[:24]}
        count = re.search(r"^(\d+) rows$", str(detail))
        if count:
            row["records"] = int(count.group(1))
        result.append(row)
    return result

def extract(mode):
    global output
    run_status = []
    try:
        legacy.DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        output = legacy.create_output_workbook()
        entity = legacy.extract_entity_metadata(legacy.driver)
        def filename_part(value, fallback):
            return re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', '_', str(value or fallback)).strip(' .')[:90] or fallback
        stamp = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime('%Y-%m-%d_%H-%M-%S_%f')
        update(downloadName=f"{filename_part(entity.get('Entity Name'), 'Entity')}_{filename_part(entity.get('Unit Type'), 'Unit')}_{stamp}.xlsx")
        run_status.append(("Entity metadata", "Success", "Captured"))
        if mode in ("all", "combined"):
            for name, function in (("Procurement", legacy.procurement_part), ("Wallet", legacy.wallet_part)):
                update(stage=f"Extracting {name}…")
                before = len(run_status)
                try:
                    function(legacy.driver, output, entity, run_status)
                except Exception:
                    run_status.append((name, "Failed", "Section failed; portal may be unavailable or changed"))
                bad = any(row[1] in ("Failed", "Skipped") for row in run_status[before:])
                update(stage=f"{name} part failed." if bad else f"{name} part extracted successfully.")
                sections = sanitize_sections(run_status)
                update(sections=sections, records=sum(s.get("records", 0) for s in sections))
        if mode in ("available", "combined"):
            update(stage="Extracting Available certificates…")
            try:
                frame = legacy.extract_available_api(legacy.driver, entity)
                legacy.append_sheet(output, "Available", frame)
                run_status.append(("Available", "Success", f"{len(frame)} rows"))
                update(stage="Available part extracted successfully.")
            except Exception:
                run_status.append(("Available", "Failed", "Available extraction failed"))
                update(stage="Available part failed.")
        # Preserve per-section outcome but redact original exceptions from the final
        # summary too; source functions can include sensitive browser information.
        safe_summary = [(name, status, detail if re.match(r"^\d+ rows$", str(detail)) or status == "No Data" else ("Captured" if name == "Entity metadata" else "Review portal section")) for name, status, detail in run_status]
        keys = ("all", "available") if mode == "combined" else (mode,)
        for key in keys:
            extraction_runs[key] = [row for row in safe_summary if (row[0] == "Available") == (key == "available") and row[0] != "Entity metadata"]
        merged = [row for rows in extraction_runs.values() for row in rows]
        safe_summary = merged
        legacy.append_sheet(output, "Errors and Skipped", pd.DataFrame([r for r in merged if r[1] in ("Failed", "Skipped")], columns=["Module", "Status", "Reason"]))
        legacy.finalize_output_workbook(output)
        if all(key in extraction_runs for key in ("all", "available")):
            shutil.rmtree(legacy.DOWNLOAD_DIR, ignore_errors=False) if legacy.DOWNLOAD_DIR.exists() else None
        sections = sanitize_sections(merged)
        run_status = merged
        failed = any(status in ("Failed", "Skipped") and not re.search(r"no data|count is zero", str(detail), re.I) for _, status, detail in run_status)
        successful_data = any(s["name"] != "Entity metadata" and s["status"] in ("Success", "No Data") for s in sections)
        status = "partial" if failed else "completed"
        if not successful_data:
            status = "partial"  # diagnostic workbook remains explicitly incomplete
        update(status=status, artifact=all(key in extraction_runs for key in ("all", "available")), stage="Final Excel ready" if all(key in extraction_runs for key in ("all", "available")) else "Extraction finished. Run the other extraction button to unlock the combined Excel.", sections=sections, records=sum(s.get("records", 0) for s in sections))
    except Exception:
        if output and output.is_file() and extraction_runs:
            for key in (("all", "available") if mode == "combined" else (mode,)):
                extraction_runs[key] = [("Available" if key == "available" else "Scrape All", "Failed", "Session expired or extraction could not finish")]
            merged = [row for rows in extraction_runs.values() for row in rows]
            legacy.append_sheet(output, "Errors and Skipped", pd.DataFrame([r for r in merged if r[1] in ("Failed", "Skipped")], columns=["Module", "Status", "Reason"]))
            legacy.finalize_output_workbook(output)
            both = all(key in extraction_runs for key in ("all", "available"))
            if both and legacy.DOWNLOAD_DIR.exists():
                shutil.rmtree(legacy.DOWNLOAD_DIR)
            update(status="partial",artifact=both,stage="Partial Excel ready. Review Errors and Skipped and retry failed extraction.",sections=sanitize_sections(merged))
        else:
            update(status="failed", artifact=False, stage="Extraction failed. Portal login may have expired or the page changed.")
            output = None
    finally:
        # Keep this isolated login for the original Available/Scrape All controls.
        # Cancellation, retention expiry and worker lease cleanup destroy it.
        lock.release()

@app.post("/run", dependencies=[Depends(auth)])
def run(request: RunRequest):
    global download_consumed
    if not verified or state["status"] not in ("ready", "completed", "partial") or not lock.acquire(blocking=False):
        raise HTTPException(409, "Verify the session first; jobs run once")
    # After delivery there is no cached workbook/data to merge. Rebuild both
    # workflows on the next click rather than returning an incomplete old file.
    mode = "combined" if download_consumed else request.mode
    download_consumed = False
    update(status="running", artifact=False, stage="Rebuilding both extractions after previous download" if mode != request.mode else "Starting extraction")
    threading.Thread(target=extract, args=(mode,), daemon=True).start()
    return {"ok": True}

class ConsumeRequest(BaseModel):
    downloadName: str

@app.post("/artifact/consume", dependencies=[Depends(auth)])
def consume_artifact(request: ConsumeRequest):
    global output, download_consumed
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Worker is busy; cleanup will be retried")
    try:
        if state.get("downloadName") != request.downloadName:
            raise HTTPException(409, "A newer workbook exists; it was not deleted")
        for directory in (legacy.OUTPUT_DIR, legacy.DOWNLOAD_DIR):
            if directory.exists():
                shutil.rmtree(directory)
        output = None
        legacy.current_output_workbook = None
        extraction_runs.clear()
        download_consumed = True
        update(artifact=False, stage="Download delivered. Backend Excel files deleted. Next run will rebuild both extractions.")
        return {"ok": True}
    finally:
        lock.release()

@app.get("/status", dependencies=[Depends(auth)])
def status():
    with state_lock:
        return {**state, "events": list(events)}

@app.get("/ops/schema", dependencies=[Depends(auth)])
def operations_schema(mode: Literal["pwp", "pibo", "sales", "sales_export"]):
    return {"columns": ops.schema(mode), "mode": mode, "submitEnabled": mode in ("pwp", "pibo")}

@app.post("/ops/file", dependencies=[Depends(auth)])
async def operations_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename or "/" in filename or "\\" in filename or len(filename) > 160:
        raise HTTPException(400, "Unsafe file name")
    data = await file.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Maximum file size is 10 MB")
    if filename.lower().endswith(".pdf"):
        if not data[:1024].lstrip().startswith(b"%PDF-"):
            raise HTTPException(400, "Invalid PDF header")
        target = ops.bot.UPLOAD_INVOICE_DIR / filename
    elif filename.lower().endswith(".xlsx"):
        target = WORK / "inputs" / filename
        target.parent.mkdir(exist_ok=True)
    else:
        raise HTTPException(400, "Only XLSX and PDF files are supported")
    if lock.locked():
        raise HTTPException(409, "Cannot replace files while automation runs")
    target.write_bytes(data)
    ops.preview_hash = None  # Any replacement requires a fresh workbook/PDF preview.
    return {"filename": filename, "size": len(data)}

class UploadValidation(BaseModel):
    mode: Literal["pwp", "pibo", "sales", "sales_export"]
    filename: str = Field(min_length=1, max_length=160)

@app.post("/ops/validate", dependencies=[Depends(auth)])
def operations_validate(request: UploadValidation):
    if "/" in request.filename or "\\" in request.filename:
        raise HTTPException(400, "Unsafe filename")
    if not lock.acquire(blocking=False):
        raise HTTPException(409, "Worker busy")
    try:
        return ops.validate(request.mode, WORK / "inputs" / request.filename)
    except Exception as exc:
        raise HTTPException(400, str(exc)[:1000])
    finally:
        lock.release()

class UploadExecution(BaseModel):
    hash: str = Field(min_length=64, max_length=64)

def run_upload_adapter(digest):
    global output
    try:
        update(status="running", stage="Uploading source-validated rows", sections=[])
        def on_row(row):
            safe_log(f"Upload row {row['row']}: {row['status']}")
            update(records=state["records"] + 1, stage=f"Upload row {row['row']}: {row['status']}")
        rows, output = ops.execute_upload(digest, on_row)
        update(status="partial", stage="Upload attempted. Portal verification is required; client workflow is not complete.", results=rows,
               sections=[{"name": f"Row {r['row']}", "status": r["status"]} for r in rows])
    except Exception:
        update(status="failed", stage="Upload failed or requires manual verification. No automatic retry was performed.")
    finally:
        lock.release()

@app.post("/ops/upload", dependencies=[Depends(auth)])
def operations_upload(request: UploadExecution):
    if not verified or state["status"] != "ready" or not ops.rows or request.hash != ops.preview_hash or any(r["_validation_error"] for r in ops.rows):
        raise HTTPException(409, "Verified login and a fully valid matching preview are required")
    if request.hash in ops.consumed or not lock.acquire(blocking=False):
        raise HTTPException(409, "Batch already attempted or worker busy")
    update(status="running", stage="Starting upload")
    threading.Thread(target=run_upload_adapter, args=(request.hash,), daemon=True).start()
    return {"ok": True}

class DeleteFetch(BaseModel):
    year: str = Field(pattern=r"^20\d{2}$")

@app.post("/ops/delete/fetch", dependencies=[Depends(auth)])
def operations_delete_fetch(request: DeleteFetch):
    if not verified or state["status"] != "ready" or not lock.acquire(blocking=False):
        raise HTTPException(409, "Verify login before fetching deletion records")
    try:
        return ops.fetch_deletions(request.year)
    except Exception:
        raise HTTPException(502, "Could not safely fetch production records. Inspect the portal.")
    finally:
        lock.release()

class DeleteExecution(BaseModel):
    hash: str = Field(min_length=64, max_length=64)
    ids: list[str] = Field(min_length=1, max_length=500)
    confirmation: Literal["DELETE APPROVED RECORDS"]

@app.post("/ops/delete/execute", dependencies=[Depends(auth)])
def operations_delete_execute(request: DeleteExecution):
    if not verified or state["status"] != "ready" or not lock.acquire(blocking=False):
        raise HTTPException(409, "Session not ready")
    try:
        result = ops.execute_deletions(request.ids, request.hash)
        return {"results": result, "verified": len(result) == len(request.ids) and all(r["status"] == "PORTAL_ABSENCE_VERIFIED" for r in result)}
    except Exception:
        raise HTTPException(502, "Deletion stopped. Verify portal before retrying any record.")
    finally:
        lock.release()

@app.get("/artifact", dependencies=[Depends(auth)])
def artifact():
    if state["status"] not in ("completed", "partial") or output is None or not output.is_file() or (extraction_runs and not state.get("artifact")):
        raise HTTPException(410, "Excel unavailable")
    return FileResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename=state.get("downloadName", "CPCB_Extract.xlsx"))

@app.get("/preview", dependencies=[Depends(auth)])
def workbook_preview(sheet: str = ""):
    if output is None or not output.is_file() or state["status"] not in ("completed", "partial") or (extraction_runs and not state.get("artifact")):
        raise HTTPException(410, "Workbook not available")
    from openpyxl import load_workbook
    workbook = load_workbook(output, read_only=True, data_only=True)
    try:
        chosen = sheet or workbook.sheetnames[0]
        if chosen not in workbook.sheetnames:
            raise HTTPException(404, "Sheet not found")
        ws = workbook[chosen]
        return {"sheets": workbook.sheetnames, "sheet": chosen, "totalRows": max(0, ws.max_row - 1), "rows": list(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 21), values_only=True))}
    finally:
        workbook.close()
