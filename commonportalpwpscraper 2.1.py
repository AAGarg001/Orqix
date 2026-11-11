from __future__ import annotations
import queue
import re
import threading
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook
from pathlib import Path
from urllib.parse import urlsplit
try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, simpledialog, ttk
except ImportError:
    # The hosted headless worker does not use the desktop GUI.
    tk = None
    messagebox = ttk = filedialog = simpledialog = None
import pandas as pd
from selenium import webdriver
from selenium.common.exceptions import ElementClickInterceptedException, StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


BASE_DIR = Path(__file__).resolve().parent
Single_entry_url = 'https://epr.cpcb.gov.in/onboarding/procurement-details/single-entry'
APP_TITLE = "EPR Operations Hub | PWP & PIBO"
APP_DESCRIPTION = "Upload PWP and PIBO data, and manage PWP record deletion."
HEADER_BG = "#2563EB"
HEADER_ACCENT = "#93C5FD"

LOGIN_URL = "https://epr.cpcb.gov.in/login"
USER_ID_XPATH = "//*[@placeholder='Enter CEPR User ID']"
PASSWORD_XPATH = "//*[@placeholder='Password']"

BG = "#F4F6FC"
CARD = "#FFFFFF"
NAVY = "#17243B"
TEXT = "#243247"
MUTED = "#68788D"

driver = None
driver_lock = threading.Lock()
events = queue.Queue()
busy = False
root = None
user_entry = None
password_entry = None
login_button = None
upload_button = None
pibo_upload_button = None
delete_button = None
spinner = None
status_label = None
log_box = None


def log(message, kind="info"):
    print(message, flush=True)
    events.put(("log", message, kind))


def browser():
    global driver
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")

    options.add_experimental_option("detach", True)
    driver = webdriver.Chrome(options=options)
    return driver


def open_login(user_id, password):
    with driver_lock:
        active_driver = browser()
        active_driver.get(LOGIN_URL)
        wait = WebDriverWait(active_driver, 30)
        user_box = wait.until(EC.visibility_of_element_located((By.XPATH, USER_ID_XPATH)))
        password_box = wait.until(EC.visibility_of_element_located((By.XPATH, PASSWORD_XPATH)))
        user_box.clear()
        user_box.send_keys(user_id)
        password_box.clear()
        password_box.send_keys(password)
        log("Credentials entered successfully. Enter the OTP in the browser and click Login.", "success")


UPLOAD_INVOICE_DIR = BASE_DIR / "Invoice upload"
UPLOAD_WAIT_SECONDS = 3
UPLOAD_FORM_WAIT_SECONDS = 120
UPLOAD_FIELD_DELAY = 0.5
UPLOAD_BUTTON_DELAY = 2
UPLOAD_ENTRY_DELAY = 0.5
UPLOAD_FIELD_XPATHS = {}
UPLOAD_FILE_INPUT_CSS = ""
UPLOAD_COLUMNS = [
    "Category of Plastic", "Name of Supplier", "Address Line 1", "Address Line 2",
    "State", "City", "Pin Code", "Is Supplier GST Available (Yes/No)",
    "Supplier GST Number",
    "Supplier Mobile Number (Mobile number is required if GST number is unavailable)",
    "Procurement Date (YYYY-MM-DD)", "Quantity (MT)", "Invoice Number", "HSN Code",
    "Invoice Filename",
]
UPLOAD_MOBILE_COLUMN = UPLOAD_COLUMNS[9]
UPLOAD_ADDRESS_PREFIX = (
    "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-procurement-details"
    "/div/app-single-entry/div/div[2]/div/form/div[1]"
)


def upload_read_excel(excel_path):
    workbook = load_workbook(excel_path, read_only=True, data_only=False)
    prepared = []
    try:
        sheet = workbook.worksheets[0]
        rows = sheet.iter_rows()
        header_cells = next(rows, ())
        headers = [str(c.value).strip() if c.value is not None else "" for c in header_cells]
        missing = [name for name in UPLOAD_COLUMNS if name not in headers]
        duplicate = [name for name in UPLOAD_COLUMNS if headers.count(name) > 1]
        if missing or duplicate:
            raise ValueError(f"Missing columns: {missing}; duplicate columns: {duplicate}")
        indexes = {name: headers.index(name) for name in UPLOAD_COLUMNS}
        for row_number, cells in enumerate(rows, 2):
            values = {name: cells[index].value for name, index in indexes.items()}
            if all(value is None or str(value).strip() == "" for value in values.values()):
                continue
            row = {name: "" if value is None else str(value).strip() for name, value in values.items()}
            issues = []
            if any(cells[index].data_type == "f" for index in indexes.values()):
                issues.append("use literal values, not Excel formulas")
            required = [name for name in UPLOAD_COLUMNS if name not in
                        ("Address Line 2", "Supplier GST Number", UPLOAD_MOBILE_COLUMN)]
            issues.extend(f"{name} is required" for name in required if not row[name])
            gst = row["Is Supplier GST Available (Yes/No)"].casefold()
            if gst not in ("yes", "no"):
                issues.append("GST availability must be Yes or No")
            if gst == "yes" and not row["Supplier GST Number"]:
                issues.append("Supplier GST Number is required when GST is Yes")
            if gst == "no" and not re.fullmatch(r"[0-9]{10}", row[UPLOAD_MOBILE_COLUMN]):
                issues.append("a 10-digit Supplier Mobile Number is required when GST is No")
            if not re.fullmatch(r"[0-9]{6}", row["Pin Code"]):
                issues.append("Pin Code must contain 6 digits")
            try:
                quantity = Decimal(row["Quantity (MT)"])
                if not quantity.is_finite() or quantity <= 0:
                    raise ValueError()
                row["Quantity (MT)"] = format(quantity, "f")
            except (InvalidOperation, ValueError):
                issues.append("Quantity (MT) must be a positive finite number")
            date_value = values["Procurement Date (YYYY-MM-DD)"]
            try:
                if isinstance(date_value, datetime):
                    date_value = date_value.strftime("%Y-%m-%d")
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(date_value)):
                    raise ValueError()
                row["_date"] = datetime.strptime(str(date_value), "%Y-%m-%d")
            except ValueError:
                issues.append("Procurement Date must be a valid YYYY-MM-DD or Excel date")
            filename = row["Invoice Filename"]
            try:
                pdf_path = (UPLOAD_INVOICE_DIR / filename).resolve()
                if (not filename or "/" in filename or "\\" in filename
                        or pdf_path.parent != UPLOAD_INVOICE_DIR.resolve() or pdf_path.suffix.lower() != ".pdf"):
                    issues.append("Invoice Filename must be a PDF filename inside the Invoice upload folder")
                elif not pdf_path.is_file():
                    issues.append(f"PDF not found: {filename}")
                else:
                    with pdf_path.open("rb") as pdf:
                        if not pdf.read(1024).lstrip().startswith(b"%PDF-"):
                            issues.append(f"File does not have a PDF header: {filename}")
                row["_pdf"] = pdf_path
            except Exception as exc:
                issues.append(f"Invoice file error: {type(exc).__name__}: {exc}")
            row["_excel_row"] = row_number
            row["_validation_error"] = "; ".join(issues)
            row["_original"] = {name: cells[index].value for index, name in enumerate(headers) if name}
            prepared.append(row)
    finally:
        workbook.close()
    if not prepared:
        raise ValueError("The first worksheet has no data rows.")
    return prepared


def upload_field(active_driver, label, tag="select", placeholder=None, xpath=None, require_enabled=True):
    xpath = UPLOAD_FIELD_XPATHS.get(label) or xpath

    def locate(_):
        try:
            if xpath:
                candidates = active_driver.find_elements(By.XPATH, xpath)
            elif placeholder:
                candidates = active_driver.find_elements(
                    By.CSS_SELECTOR, f'app-single-entry form input[placeholder="{placeholder}"]')
            else:
                candidates = active_driver.execute_script("""
                    const form = document.querySelector('app-single-entry form');
                    if (!form) return [];
                    const clean = s => s.replace(/[*:?]/g, '').trim().toLowerCase();
                    const found = new Set();
                    for (const label of form.querySelectorAll('label, span, div, p')) {
                        if (clean(label.textContent) !== clean(arguments[0])) continue;
                        const linked = label.htmlFor && document.getElementById(label.htmlFor);
                        if (linked && linked.matches(arguments[1]) && form.contains(linked)) {
                            found.add(linked); continue;
                        }
                        for (let p = label.parentElement; p && p !== form; p = p.parentElement) {
                            const fields = p.querySelectorAll(arguments[1]);
                            if (fields.length === 1) { found.add(fields[0]); break; }
                            if (fields.length > 1) break;
                        }
                    }
                    return Array.from(found);
                """, label, tag)
            candidates = [e for e in candidates if e.is_displayed() and (not require_enabled or e.is_enabled())]
            if len(candidates) > 1:
                raise ValueError(f"Ambiguous field: {label}. Set UPLOAD_FIELD_XPATHS[{label!r}].")
            return candidates[0] if candidates else False
        except StaleElementReferenceException:
            return False

    try:
        wait_seconds = 1 if label in ("HSN Code", "Procurement date") else UPLOAD_WAIT_SECONDS
        return WebDriverWait(active_driver, wait_seconds).until(locate)
    except TimeoutException as exc:
        raise RuntimeError(f"Field unavailable: {label}. The field was not visible/enabled.") from exc


def upload_select(active_driver, label, text):
    expected = " ".join(text.split()).casefold()

    def choose(_):
        try:
            select = Select(upload_field(active_driver, label))
            matches = [o for o in select.options if o.is_enabled()
                       and o.get_attribute("value") not in (None, "")
                       and " ".join(o.text.split()).casefold() == expected]
            if len(matches) > 1:
                raise ValueError(f"Ambiguous option {text!r} in {label}.")
            if not matches:
                return False
            value = matches[0].get_attribute("value")
            select.select_by_value(value)
            return Select(upload_field(active_driver, label)).first_selected_option.get_attribute("value") == value
        except StaleElementReferenceException:
            return False

    try:
        WebDriverWait(active_driver, UPLOAD_WAIT_SECONDS).until(choose)
        time.sleep(UPLOAD_FIELD_DELAY)
    except TimeoutException as exc:
        raise ValueError(f"{label} option not available: {text!r}; use the portal's exact name.") from exc


def upload_text(active_driver, label, value, placeholder=None, xpath=None):
    element = upload_field(active_driver, label, "input", placeholder, xpath)
    element.clear()
    if value:
        element.send_keys(value)
    element.send_keys(Keys.TAB)
    if element.get_attribute("value").strip() != value.strip():
        raise RuntimeError(f"{label}: portal did not retain the supplied value.")
    time.sleep(UPLOAD_FIELD_DELAY)


def upload_wait_for_form(active_driver, stage, require_form=True):
    ready_since = None

    def ready(_):
        nonlocal ready_since
        upload_check_session(active_driver)
        upload_check_portal_errors(active_driver, stage)
        try:
            forms = active_driver.find_elements(By.CSS_SELECTOR, "app-single-entry form")
            loaders = active_driver.find_elements(By.CSS_SELECTOR, ".loader-wrapper")
            if (require_form and not any(form.is_displayed() for form in forms)) or any(
                loader.is_displayed() for loader in loaders
            ):
                ready_since = None
                return False
            if ready_since is None:
                ready_since = time.monotonic()
            return time.monotonic() - ready_since >= 0.5
        except StaleElementReferenceException:
            ready_since = None
            return False

    try:
        WebDriverWait(active_driver, UPLOAD_FORM_WAIT_SECONDS, poll_frequency=0.1).until(ready)
    except TimeoutException as exc:
        raise RuntimeError(
            f"{stage}: form did not become ready / loader did not clear."
        ) from exc


def upload_invoice(active_driver, pdf_path):
    def locate(_):
        if UPLOAD_FILE_INPUT_CSS:
            inputs = active_driver.find_elements(By.CSS_SELECTOR, UPLOAD_FILE_INPUT_CSS)
        else:
            inputs = active_driver.execute_script("""
                const form = document.querySelector('app-single-entry form');
                if (!form) return [];
                const buttons = form.querySelectorAll('.upload-button');
                if (buttons.length === 1) {
                    const b = buttons[0];
                    const linked = b.htmlFor && document.getElementById(b.htmlFor);
                    if (linked && linked.matches('input[type=file]')) return [linked];
                    for (let p = b.parentElement; p && p !== form; p = p.parentElement) {
                        const files = p.querySelectorAll('input[type=file]');
                        if (files.length) return Array.from(files);
                    }
                }
                return Array.from(form.querySelectorAll('input[type=file]'));
            """)
        if len(inputs) > 1:
            raise ValueError("Multiple file inputs found. Set UPLOAD_FILE_INPUT_CSS for the invoice input.")
        return inputs[0] if inputs else False

    file_input = WebDriverWait(active_driver, UPLOAD_WAIT_SECONDS).until(locate)
    file_input.send_keys(str(pdf_path))
    attached = active_driver.execute_script(
        "return Array.from(arguments[0].files || []).map(f => f.name);", file_input)
    if attached != [pdf_path.name]:
        raise RuntimeError("Invoice attachment could not be verified in the file input; inspect Chrome.")
    upload_wait_for_form(active_driver, "Invoice upload")



def upload_wait_for_page(active_driver):
    active_driver.set_page_load_timeout(120)
    active_driver.get(Single_entry_url)
    upload_check_session(active_driver)
    try:
        WebDriverWait(active_driver, 120, poll_frequency=0.25).until(
            lambda current: current.execute_script("return document.readyState") == "complete"
        )
    except TimeoutException as exc:
        raise RuntimeError("Portal page did not finish loading; no entries were filled.") from exc
    upload_wait_for_form(active_driver, "Initial form loading")


def upload_fill_row(active_driver, row):
    upload_wait_for_page(active_driver)
    upload_invoice(active_driver, row["_pdf"])
    upload_select(active_driver, "Categories of Plastic", row["Category of Plastic"])
    upload_text(active_driver, "Name of Supplier", row["Name of Supplier"], "Enter name of supplier")
    for number in (1, 2):
        upload_text(active_driver, f"Address Line {number}", row[f"Address Line {number}"],
                    xpath=f"{UPLOAD_ADDRESS_PREFIX}/div[{number + 3}]/app-custom-input/div/div[2]/input")

    state = Select(upload_field(active_driver, "State"))
    if state.first_selected_option.get_attribute("value"):
        raise RuntimeError("Fresh form has a preselected State. Clear saved defaults before testing.")
    cities = Select(upload_field(active_driver, "City", require_enabled=False))
    if any(o.is_enabled() and o.get_attribute("value") for o in cities.options):
        raise RuntimeError("Fresh form has old City options. Clear saved defaults before testing.")
    upload_select(active_driver, "State", row["State"])
    upload_select(active_driver, "City", row["City"])
    upload_text(active_driver, "PIN Code", row["Pin Code"], "Enter PIN Code")
    gst_yes = row["Is Supplier GST Available (Yes/No)"].casefold() == "yes"
    upload_select(active_driver, "Is Supplier GST Available?", "Yes" if gst_yes else "No")
    if gst_yes:
        upload_text(active_driver, "Supplier GST No.", row["Supplier GST Number"], "Enter supplier GST number")
    else:
        upload_text(active_driver, "Mobile Number", row[UPLOAD_MOBILE_COLUMN], "Mobile Number")
    try:
        upload_text(active_driver, "HSN Code", row["HSN Code"], "Enter HSN Code")
    except RuntimeError as exc:
        if not (str(exc).startswith("Field unavailable: HSN Code.")
                and isinstance(exc.__cause__, TimeoutException)):
            raise
    upload_text(active_driver, "Invoice Number", row["Invoice Number"], "Enter Invoice No./GST E-Invoice Number")
    upload_text(active_driver, "Quantity (MT)", row["Quantity (MT)"], "Enter quantity")
    try:
        date_input = upload_field(active_driver, "Procurement date", "input", "dd-mm-yyyy")
    except RuntimeError as exc:
        if not (str(exc).startswith("Field unavailable: Procurement date.")
                and isinstance(exc.__cause__, TimeoutException)):
            raise
        return
    date_value = row["_date"].strftime("%Y-%m-%d" if date_input.get_attribute("type") == "date" else "%d-%m-%Y")
    if date_input.get_attribute("type") == "date":
        active_driver.execute_script("""
            const input = arguments[0];
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, arguments[1]);
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.dispatchEvent(new Event('change', {bubbles: true}));
            input.blur();
        """, date_input, date_value)
        if date_input.get_attribute("value") != date_value:
            raise RuntimeError("Procurement date was not retained.")
        time.sleep(UPLOAD_FIELD_DELAY)
    else:
        try:
            upload_text(active_driver, "Procurement date", date_value, "dd-mm-yyyy")
        except RuntimeError as exc:
            if not (str(exc).startswith("Field unavailable: Procurement date.")
                    and isinstance(exc.__cause__, TimeoutException)):
                raise


def upload_check_portal_errors(active_driver, stage):

    field_selectors = "app-single-entry form .error-message, app-single-entry form .invalid-feedback"
    messages = [element.text.strip() for element in active_driver.find_elements(By.CSS_SELECTOR, field_selectors)
                if element.is_displayed() and element.text.strip()
                and element.text.strip().strip("×✕✖ ").casefold() != "validation failed"]
    popup_selectors = ".toast-error, .alert-danger, .alert-error, .error-message, .invalid-feedback"
    for element in active_driver.find_elements(By.CSS_SELECTOR, popup_selectors):
        if not element.is_displayed():
            continue
        message = element.text.strip()
        if message and re.search(r"\bduplicate\b|\balready\s+(?:exists?|registered|submitted|uploaded|recorded)\b", message, re.IGNORECASE):
            messages.append(message)
    if messages:
        raise RuntimeError(f"{stage}: " + "; ".join(dict.fromkeys(messages)))


def upload_save_failures(failed, rows):
    columns = list(rows[0]["_original"]) + ["Excel Row", "Failure Reason"]
    records = [{**row["_original"], "Excel Row": row["_excel_row"], "Failure Reason": reason}
               for row, reason in failed]
    output = BASE_DIR / "Failed Entries.xlsx"
    if output.exists():
        output = BASE_DIR / f"Failed Entries_{datetime.now():%Y%m%d_%H%M%S_%f}.xlsx"
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame(records, columns=columns).to_excel(writer, sheet_name="Failed Entries", index=False)
        sheet = writer.book.worksheets[0]
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(
                80, max(len(str(cell.value or "")) for cell in column) + 3)
            for cell in column:
                if isinstance(cell.value, str):
                    cell.data_type = "s"
    log(f"Failed Entries saved: {output}")
    return output


class UploadSessionExpired(RuntimeError):
    pass


class UploadBrowserUnavailable(RuntimeError):
    pass


def upload_session_url(active_driver):
    if active_driver is None:
        raise UploadBrowserUnavailable(
            "No browser session is connected. Use Open Login to connect to the portal."
        )
    try:
        return urlsplit(active_driver.current_url)
    except WebDriverException as exc:
        raise UploadBrowserUnavailable(
            f"Cannot access the portal browser session: {type(exc).__name__}: {exc.msg}"
        ) from exc


def upload_check_session(active_driver):
    url = upload_session_url(active_driver)
    if url.hostname == "epr.cpcb.gov.in" and url.path.rstrip("/") in {"/home", "/login"}:
        raise UploadSessionExpired(
            "Portal has been automatically logged out, login again to start data uploading."
        )


def require_upload_login():
    url = upload_session_url(driver)
    if url.hostname == "epr.cpcb.gov.in" and url.path.rstrip("/") == "/login":
        raise RuntimeError("Complete login and OTP verification in the browser before uploading data.")
    upload_check_session(driver)
    return driver


def pibo_log(message, **kwargs):
    log(str(message))


PIBO_URL = "https://epr.cpcb.gov.in/onboarding/material-procurement-details/single-entry"
PIBO_INVOICE_DIR = BASE_DIR / "Invoice upload"
PIBO_WAIT_SECONDS = 50
PIBO_FORM_WAIT_SECONDS = 120
PIBO_FIELD_DELAY = 0.5
PIBO_BUTTON_DELAY = 2
PIBO_ENTRY_DELAY = 0.5
PIBO_FIELD_XPATHS = {}
PIBO_FILE_INPUT_CSS = ""
PIBO_COLUMNS = [
    "Entity Type", "Name of the entity", "State", "Address", "Mobile Number",
    "Plastic Material Type", "Categories of Plastic", "Financial year", "Date",
    "Total Plastic Quantity (Ton)", "Seller GST", "Buyer GST", "HSN Code",
    "IRN Number", "Total Invoice Value (₹)", "GST E-Invoice No.", "Invoice Filename",
]
PIBO_OPTIONAL_COLUMNS = {"Buyer GST", "IRN Number"}




PIBO_EXCEL_FIELD_MAP = {
    "Registration Type": None,
    "Entity Type": "Entity Type",
    "Name of the Entity": "Name of the entity",
    "State": "State", "Address": "Address", "Mobile Number": "Mobile Number",
    "Plastic Material Type": "Plastic Material Type",
    "Category of Plastic": "Categories of Plastic",
    "Qty. of Plastic (MT)": "Total Plastic Quantity (Ton)",
    "Financial Year": "Financial year", "Date": "Date", "HSN Code": "HSN Code",
    "Seller GST": "Seller GST",
    "Invoice Number/GST E-Invoice Number": "GST E-Invoice No.",
    "Total Invoice Value": "Total Invoice Value (\u20b9)",
    "Invoice File Name": "Invoice Filename",
    "Buyer GST": "Buyer GST", "IRN Number": "IRN Number",
}


def pibo_header_key(value):
    return " ".join(str(value).split()).casefold()


def pibo_read_excel(excel_path):
    workbook = load_workbook(excel_path, read_only=True, data_only=False)
    prepared = []
    try:
        sheet = workbook.worksheets[0]
        iterator = sheet.iter_rows()
        headers = [str(c.value).strip() if c.value is not None else "" for c in next(iterator, ())]
        original_headers = headers[:]
        aliases = {pibo_header_key(k): v for k, v in PIBO_EXCEL_FIELD_MAP.items()}
        aliases.update({pibo_header_key(k): k for k in PIBO_COLUMNS})
        headers = [aliases.get(pibo_header_key(h), h) for h in headers]
        missing = [c for c in PIBO_COLUMNS if c not in PIBO_OPTIONAL_COLUMNS and c not in headers]
        duplicates = [c for c in headers if c and headers.count(c) > 1]
        if missing or duplicates:
            raise ValueError(f"Missing columns: {missing}; duplicate columns: {duplicates}")
        indexes = {c: headers.index(c) for c in PIBO_COLUMNS if c in headers}
        for number, cells in enumerate(iterator, 2):
            values = {c: cells[i].value for c, i in indexes.items()}
            if all(v is None or str(v).strip() == "" for v in values.values()):
                continue
            row = {c: "" if values.get(c) is None else str(values[c]).strip() for c in PIBO_COLUMNS}
            issues = [f"{c} is required" for c in PIBO_COLUMNS if c not in PIBO_OPTIONAL_COLUMNS and not row[c]]
            if any(cells[i].data_type == "f" for i in indexes.values()):
                issues.append("Use literal values, not Excel formulas")
            if not re.fullmatch(r"[0-9]{10}", row["Mobile Number"]):
                issues.append("Mobile Number must contain 10 digits")
            for column in ("Total Plastic Quantity (Ton)", "Total Invoice Value (₹)"):
                try:
                    value = Decimal(row[column])
                    if not value.is_finite() or value <= 0:
                        raise ValueError()
                    row[column] = format(value, "f")
                except (InvalidOperation, ValueError):
                    issues.append(f"{column} must be a positive finite number")
            try:
                value = values.get("Date")
                if isinstance(value, datetime):
                    value = value.strftime("%Y-%m-%d")
                row["_date"] = datetime.strptime(str(value), "%Y-%m-%d")
                fy = row["Financial year"]
                if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", fy):
                    raise ValueError("Financial year must look like 2026-27")
                year = int(fy[:4])
                if fy[-2:] != str(year + 1)[-2:] or not (datetime(year, 4, 1) <= row["_date"] < datetime(year + 1, 4, 1)):
                    raise ValueError("Date must fall within the selected Financial year")
            except ValueError as exc:
                issues.append(f"Date must be YYYY-MM-DD or an Excel date; check Financial year: {exc}")
            filename = row["Invoice Filename"]
            pdf = (PIBO_INVOICE_DIR / filename).resolve()
            if not filename or "/" in filename or "\\" in filename or pdf.parent != PIBO_INVOICE_DIR.resolve() or pdf.suffix.lower() != ".pdf":
                issues.append("Invoice Filename must be a PDF filename in Invoice upload")
            elif not pdf.is_file():
                issues.append(f"PDF not found: {filename}")
            else:
                try:
                    with pdf.open("rb") as stream:
                        if not stream.read(1024).lstrip().startswith(b"%PDF-"):
                            issues.append("Invoice file does not have a PDF header")
                except OSError as exc:
                    issues.append(f"Cannot read PDF: {exc}")
            row.update(_pdf=pdf, _excel_row=number, _validation_error="; ".join(issues),
                       _original={c: cells[i].value for i, c in enumerate(original_headers) if c})
            prepared.append(row)
    finally:
        workbook.close()
    if not prepared:
        raise ValueError("The first worksheet has no data rows")
    return prepared


def pibo_field(active_driver, label, tag="select", placeholder=None, xpath=None, require_enabled=True):
    xpath = PIBO_FIELD_XPATHS.get(label) or xpath

    def locate(_):
        try:
            if xpath:
                candidates = active_driver.find_elements(By.XPATH, xpath)
            elif placeholder:
                candidates = active_driver.find_elements(
                    By.CSS_SELECTOR, f'form input[placeholder="{placeholder}"]')
            else:
                candidates = active_driver.execute_script("""
                    const form = document.querySelector('form');
                    if (!form) return [];
                    const clean = s => s.replace(/[*:?]/g, '').trim().toLowerCase();
                    const found = new Set();
                    for (const label of form.querySelectorAll('label, span, div, p')) {
                        if (clean(label.textContent) !== clean(arguments[0])) continue;
                        const linked = label.htmlFor && document.getElementById(label.htmlFor);
                        if (linked && linked.matches(arguments[1]) && form.contains(linked)) {
                            found.add(linked); continue;
                        }
                        for (let p = label.parentElement; p && p !== form; p = p.parentElement) {
                            const fields = p.querySelectorAll(arguments[1]);
                            if (fields.length === 1) { found.add(fields[0]); break; }
                            if (fields.length > 1) break;
                        }
                    }
                    return Array.from(found);
                """, label, tag)
            candidates = [e for e in candidates if e.is_displayed() and (not require_enabled or e.is_enabled())]
            if len(candidates) > 1:
                raise ValueError(f"Ambiguous field: {label}. Set PIBO_FIELD_XPATHS[{label!r}].")
            return candidates[0] if candidates else False
        except StaleElementReferenceException:
            return False

    try:
        return WebDriverWait(active_driver, PIBO_WAIT_SECONDS).until(locate)
    except TimeoutException as exc:
        raise RuntimeError(f"Field unavailable: {label}. Check login or set its XPath override.") from exc


def pibo_select(active_driver, label, text):
    expected = " ".join(text.split()).casefold()

    def choose(_):
        try:
            select = Select(pibo_field(active_driver, label))
            matches = [o for o in select.options if o.is_enabled()
                       and o.get_attribute("value") not in (None, "")
                       and " ".join(o.text.split()).casefold() == expected]
            if len(matches) > 1:
                raise ValueError(f"Ambiguous option {text!r} in {label}.")
            if not matches:
                return False
            value = matches[0].get_attribute("value")
            select.select_by_value(value)
            return Select(pibo_field(active_driver, label)).first_selected_option.get_attribute("value") == value
        except StaleElementReferenceException:
            return False

    try:
        WebDriverWait(active_driver, PIBO_WAIT_SECONDS).until(choose)
        time.sleep(PIBO_FIELD_DELAY)
    except TimeoutException as exc:
        raise ValueError(f"{label} option not available: {text!r}; use the portal's exact name.") from exc


def pibo_text(active_driver, label, value, placeholder=None, xpath=None):
    element = pibo_field(active_driver, label, "input", placeholder, xpath)
    element.clear()
    if value:
        element.send_keys(value)
    element.send_keys(Keys.TAB)
    if element.get_attribute("value").strip() != value.strip():
        raise RuntimeError(f"{label}: portal did not retain the supplied value.")
    time.sleep(PIBO_FIELD_DELAY)


class PiboSessionExpired(RuntimeError):
    pass

class PiboBrowserUnavailable(RuntimeError):
    pass

def pibo_session_url(active_driver):
    if active_driver is None:
        raise PiboBrowserUnavailable(
            "No browser session is connected. Use Open Login to connect to the portal."
        )
    try:
        return urlsplit(active_driver.current_url)
    except WebDriverException as exc:
        raise PiboBrowserUnavailable(
            f"Cannot access the portal browser session: {type(exc).__name__}: {exc.msg}"
        ) from exc

def pibo_check_session(active_driver):
    url = pibo_session_url(active_driver)
    if url.hostname == "epr.cpcb.gov.in" and url.path.rstrip("/") in {"/home", "/login"}:
        raise PiboSessionExpired(
            "Portal has been automatically logged out, login again to start data uploading."
        )

def pibo_wait_for_form(active_driver, stage, require_form=True):
    ready_since = None

    def ready(_):
        nonlocal ready_since
        pibo_check_session(active_driver)
        pibo_check_portal_errors(active_driver, stage)
        try:
            forms = active_driver.find_elements(By.CSS_SELECTOR, "form")
            loaders = active_driver.find_elements(By.CSS_SELECTOR, ".loader-wrapper")
            if (require_form and not any(form.is_displayed() for form in forms)) or any(
                loader.is_displayed() for loader in loaders
            ):
                ready_since = None
                return False
            if ready_since is None:
                ready_since = time.monotonic()
            return time.monotonic() - ready_since >= 0.5
        except StaleElementReferenceException:
            ready_since = None
            return False

    try:
        WebDriverWait(active_driver, PIBO_FORM_WAIT_SECONDS, poll_frequency=0.1).until(ready)
    except TimeoutException as exc:
        raise RuntimeError(
            f"{stage}: form did not become ready / loader did not clear."
        ) from exc

def pibo_wait_for_page(active_driver):
    active_driver.set_page_load_timeout(120)
    active_driver.get(PIBO_URL)
    pibo_check_session(active_driver)
    try:
        WebDriverWait(active_driver, 120, poll_frequency=0.25).until(
            lambda current: current.execute_script("return document.readyState") == "complete"
        )
    except TimeoutException as exc:
        raise RuntimeError("Portal page did not finish loading; no entries were filled.") from exc
    pibo_wait_for_form(active_driver, "Initial form loading")


def pibo_invoice(active_driver, pdf_path):
    def locate(_):
        if PIBO_FILE_INPUT_CSS:
            inputs = active_driver.find_elements(By.CSS_SELECTOR, PIBO_FILE_INPUT_CSS)
        else:
            inputs = active_driver.execute_script("""
                const form = document.querySelector('form');
                if (!form) return [];
                const buttons = form.querySelectorAll('.upload-button');
                if (buttons.length === 1) {
                    const b = buttons[0];
                    const linked = b.htmlFor && document.getElementById(b.htmlFor);
                    if (linked && linked.matches('input[type=file]')) return [linked];
                    for (let p = b.parentElement; p && p !== form; p = p.parentElement) {
                        const files = p.querySelectorAll('input[type=file]');
                        if (files.length) return Array.from(files);
                    }
                }
                return Array.from(form.querySelectorAll('input[type=file]'));
            """)
        if len(inputs) > 1:
            raise ValueError("Multiple file inputs found. Set PIBO_FILE_INPUT_CSS for the invoice input.")
        return inputs[0] if inputs else False

    file_input = WebDriverWait(active_driver, PIBO_WAIT_SECONDS).until(locate)
    file_input.send_keys(str(pdf_path))
    attached = active_driver.execute_script(
        "return Array.from(arguments[0].files || []).map(f => f.name);", file_input)
    if attached != [pdf_path.name]:
        raise RuntimeError("Invoice attachment could not be verified in the file input; inspect Chrome.")
    pibo_wait_for_form(active_driver, "Invoice upload")


def pibo_fill_row(active_driver, row):
    pibo_wait_for_page(active_driver)
    pibo_select(active_driver, "Registration Type", "UnRegistered")
    pibo_select(active_driver, "Entity Type", row["Entity Type"])
    pibo_text(active_driver, "Name of the entity", row["Name of the entity"], "Enter name of Entity")
    pibo_select(active_driver, "State", row["State"])
    pibo_text(active_driver, "Address", row["Address"], "Enter address")
    pibo_text(active_driver, "Mobile Number", row["Mobile Number"], "Mobile Number")
    for label in ("Plastic Material Type", "Categories of Plastic", "Financial year"):
        pibo_select(active_driver, label, row[label])
    date_input = pibo_field(active_driver, "Date", "input", "dd-mm-yyyy")
    if date_input.get_attribute("type") == "date":
        value = row["_date"].strftime("%Y-%m-%d")
        active_driver.execute_script("""
            const e = arguments[0];
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, arguments[1]);
            e.dispatchEvent(new Event('input', {bubbles:true}));
            e.dispatchEvent(new Event('change', {bubbles:true}));
            e.blur();
        """, date_input, value)
        if date_input.get_attribute("value") != value:
            raise RuntimeError("Date was not retained")
        time.sleep(PIBO_FIELD_DELAY)
    else:
        pibo_text(active_driver, "Date", row["_date"].strftime("%d-%m-%Y"), "dd-mm-yyyy")
    fields = {
        "Total Plastic Quantity (Ton)": "Enter quantity",
        "Seller GST": "Enter Seller GST number", "Buyer GST": "Enter Buyer GST",
        "HSN Code": "Enter HSN Code", "IRN Number": "Enter IRN No.",
        "Total Invoice Value (₹)": "Enter Total Invoice Value",
        "GST E-Invoice No.": "Enter GST E-Invoice No.",
    }
    for label, placeholder in fields.items():
        if label in PIBO_OPTIONAL_COLUMNS and not row[label]:
            continue
        pibo_text(active_driver, label, row[label], placeholder)
    pibo_invoice(active_driver, row["_pdf"])
    pibo_check_portal_errors(active_driver, "Form filling failed")


def pibo_check_portal_errors(active_driver, stage):

    selectors = ".toast-error, .alert-danger, .alert-error, .error-message, .invalid-feedback"
    messages = [element.text.strip() for element in active_driver.find_elements(By.CSS_SELECTOR, selectors)
                if element.is_displayed() and element.text.strip()]
    if messages:
        raise RuntimeError(f"{stage}: " + "; ".join(dict.fromkeys(messages)))


def pibo_save_failures(failed, rows):
    columns = list(rows[0]["_original"]) + ["Excel Row", "Failure Reason"]
    records = [{**row["_original"], "Excel Row": row["_excel_row"], "Failure Reason": reason}
               for row, reason in failed]
    output = BASE_DIR / "PIBO Failed Entries.xlsx"
    if output.exists():
        output = BASE_DIR / f"PIBO Failed Entries_{datetime.now():%Y%m%d_%H%M%S_%f}.xlsx"
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame(records, columns=columns).to_excel(writer, sheet_name="PIBO Failed Entries", index=False)
        sheet = writer.book.worksheets[0]
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(
                80, max(len(str(cell.value or "")) for cell in column) + 3)
            for cell in column:
                if isinstance(cell.value, str):
                    cell.data_type = "s"
    pibo_log(f"PIBO Failed Entries saved: {output}", flush=True)
    return output


def pibo_click_button(active_driver, button, stage):
    pibo_check_session(active_driver)
    pibo_wait_for_form(active_driver, f"Before {button}", require_form=button == "Preview")

    def click_when_ready(current):
        pibo_check_session(current)
        pibo_check_portal_errors(current, stage)
        try:
            if any(loader.is_displayed() for loader in current.find_elements(
                By.CSS_SELECTOR, ".loader-wrapper"
            )):
                return False
            candidates = current.find_elements(By.XPATH, f"//button[normalize-space(.)='{button}']")
            for element in candidates:
                if element.is_displayed() and element.is_enabled():
                    element.click()
                    return True
            return False
        except (ElementClickInterceptedException, StaleElementReferenceException):
            return False

    try:
        WebDriverWait(active_driver, PIBO_FORM_WAIT_SECONDS, poll_frequency=0.1).until(click_when_ready)
    except TimeoutException as exc:
        raise RuntimeError(f"{button} button was not available/clickable.") from exc
    log(f"{button} clicked")
    time.sleep(PIBO_BUTTON_DELAY)
    pibo_check_session(active_driver)
    pibo_check_portal_errors(active_driver, stage)
    if button == "Submit":
        pibo_wait_for_form(active_driver, "After Submit", require_form=False)


def run_pibo_batch(chosen):
    global PIBO_FAILED_FILE, PIBO_FAILED_ENTRIES
    results, rows, failed = [], [], []
    succeeded = 0
    PIBO_FAILED_FILE = None
    PIBO_FAILED_ENTRIES = failed
    try:
        if not str(PIBO_URL).strip():
            raise ValueError("Set PIBO_URL and rerun Cell 1 first.")
        if not chosen:
            pibo_log("Excel selection cancelled.")
            return results
        rows = pibo_read_excel(chosen)
        pibo_log(f"total data = {len(rows)}", flush=True)
        for position, row in enumerate(rows, 1):
            current = {"Excel Row": row["_excel_row"], "Status": "FILLING"}
            results.append(current)
            try:
                if row["_validation_error"]:
                    raise ValueError(row["_validation_error"])
                with driver_lock:
                    active_driver = require_upload_login()
                    log(f"[{position}/{len(rows)}] Filling Excel row {row['_excel_row']}")
                    pibo_fill_row(active_driver, row)
                    pibo_click_button(active_driver, "Preview", "Preview failed")
                    pibo_click_button(active_driver, "Submit", "Submit failed")
                current["Status"] = "SUBMIT_CLICKED"
                succeeded += 1
                if succeeded % 100 == 0:
                    pibo_log(f"{succeeded} entries submitted; {len(failed)} entries failed", flush=True)
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                current.update({"Status": "FAILED", "Error": reason})
                failed.append((row, reason))
                pibo_log(f"Excel row {row['_excel_row']} failed: {reason}", flush=True)
                pibo_log(f"{len(failed)} entries failed", flush=True)
                if isinstance(exc, (PiboSessionExpired, PiboBrowserUnavailable)):
                    failed.extend((pending, "Not attempted: " + reason) for pending in rows[position:])
                    break
            except (KeyboardInterrupt, EOFError):
                reason = "Interrupted by user; check portal before retrying this row."
                current.update({"Status": "INTERRUPTED", "Error": reason})
                failed.append((row, reason))
                raise
            if position < len(rows):
                time.sleep(PIBO_ENTRY_DELAY)
    except (KeyboardInterrupt, EOFError):
        pibo_log("Batch interrupted. Browser remains open.", flush=True)
        attempted = {result["Excel Row"] for result in results}
        for row in rows:
            if row["_excel_row"] not in attempted:
                failed.append((row, "Not attempted: batch interrupted by user."))
    except Exception as exc:
        pibo_log(f"Error: {type(exc).__name__}: {exc}", flush=True)
    finally:
        if rows:
            try:
                PIBO_FAILED_FILE = pibo_save_failures(failed, rows)
            except Exception as exc:
                pibo_log(f"Failed Entries export error: {exc}. Failed rows remain in PIBO_FAILED_ENTRIES.", flush=True)
            pibo_log(f"{succeeded} entries submitted", flush=True)
            pibo_log(f"{len(failed)} entries failed", flush=True)
    if rows:
        pibo_log("done", flush=True)
    return results




from urllib.parse import urlsplit
from selenium.common.exceptions import ElementClickInterceptedException
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook
# filedialog is imported optionally with the other desktop controls above.

SALES_URL = "https://epr.cpcb.gov.in/onboarding/producer-sales/single-entry"
SALES_INVOICE_DIR = BASE_DIR / "Invoice upload"
SALES_WAIT_SECONDS = 50
SALES_FORM_WAIT_SECONDS = 120
SALES_FIELD_DELAY = 0
SALES_BUTTON_DELAY = 0
SALES_ENTRY_DELAY = 0
SALES_FIELD_XPATHS = {}
SALES_FILE_INPUT_CSS = ""
SALES_EXPORT = False
SALES_REGISTERED_LOOKUP = "Application Number"
SALES_LOADER_CSS = ".loader-wrapper, .loading-overlay, app-producer-sales-single-entry [aria-busy='true']"
SALES_SCOPE = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-producer-sales-details/div/app-producer-sales-single-entry/div/div[3]/div[1]"
SALES_COLUMNS = [
    "Registration Type", "Entity Type", "Name of the Entity", "Address", "State",
    "Mobile Number", "Category Of Plastic", "Plastic Material Type",
    "Total Plastic Quantity (Tons)", "% of Recycled Plastic Content",
    "Financial Year", "Buyer GST", "Seller GST", "HSN Code",
    "GST E-Invoice No / Invoice No", "Bank Account No", "IFSC Code",
    "Total Invoice Value (₹)", "Date of Sale", "Invoice Filename",
    "Country", "Container Type", "Application Number", "IRN Number",
]
SALES_OPTIONAL_COLUMNS = {"IRN Number", "Buyer GST", "State", "Country", "Application Number", "Container Type", "Address", "Name of the Entity", "Entity Type", "Registration Type"}
SALES_EXCEL_FIELD_MAP = {
    "Name of the entity": "Name of the Entity",
    "Category of Plastic": "Category Of Plastic",
    "Categories of Plastic": "Category Of Plastic",
    "Qty. of Plastic (MT)": "Total Plastic Quantity (Tons)",
    "Total Plastic Quantity (Ton)": "Total Plastic Quantity (Tons)",
    "% of Recycled Plastic Content (0 value for Virgin material)": "% of Recycled Plastic Content",
    "Recycled Plastic Content (%)": "% of Recycled Plastic Content",
    "Date": "Date of Sale", "Sellet GST": "Seller GST",
    "Invoice Number/GST E-Invoice Number": "GST E-Invoice No / Invoice No",
    "Total Invoice Value": "Total Invoice Value (₹)",
    "Invoice File Name": "Invoice Filename",
    "Bank Account Number": "Bank Account No",
    "Account Number": "Bank Account No", "Entity Name": "Name of the Entity",
    "Seller GSTIN": "Seller GST", "Buyer GSTIN": "Buyer GST",
    "GST E-Invoice/Invoice Number": "GST E-Invoice No / Invoice No",
    "Invoice Number": "GST E-Invoice No / Invoice No",
    "Sales Date (dd/mm/yyy)": "Date of Sale",
    "Sales Date (dd/mm/yyyy)": "Date of Sale",

}


def sales_header_key(value):
    value = str(value).replace("<br>", " ").replace("\u00a0", " ")
    key = " ".join(value.split()).casefold()
    if key.startswith("invoice file name"):
        return "invoice file name"
    return key


def sales_read_excel(excel_path):
    workbook = load_workbook(excel_path, read_only=True, data_only=False)
    prepared = []
    try:
        sheet = workbook.worksheets[0]
        iterator = sheet.iter_rows()
        headers = [str(c.value).strip() if c.value is not None else "" for c in next(iterator, ())]
        original_headers = headers[:]
        aliases = {sales_header_key(k): v for k, v in SALES_EXCEL_FIELD_MAP.items()}
        aliases.update({sales_header_key(k): k for k in SALES_COLUMNS})
        headers = [aliases.get(sales_header_key(h), h) for h in headers]
        missing = [c for c in SALES_COLUMNS if c not in SALES_OPTIONAL_COLUMNS and c not in headers]
        duplicates = [c for c in headers if c and headers.count(c) > 1]
        if missing or duplicates:
            raise ValueError(f"Missing columns: {missing}; duplicate columns: {duplicates}")
        indexes = {c: headers.index(c) for c in SALES_COLUMNS if c in headers}
        for number, cells in enumerate(iterator, 2):
            values = {c: cells[i].value for c, i in indexes.items()}
            if all(v is None or str(v).strip() == "" for v in values.values()):
                continue
            row = {c: "" if values.get(c) is None else str(values[c]).strip() for c in SALES_COLUMNS}
            issues = [f"{c} is required" for c in SALES_COLUMNS if c not in SALES_OPTIONAL_COLUMNS and not row[c]]
            if SALES_EXPORT:
                row["Registration Type"] = "Unregistered"
                if not row["Country"]:
                    issues.append("Country is required for Export")
            else:
                if row["Registration Type"].casefold() == "unregistered":
                    for field in ("Name of the Entity", "Entity Type", "Address", "State"):
                        if not row[field]: issues.append(f"{field} is required for Domestic Unregistered")
                elif row["Registration Type"].casefold() == "registered":
                    if not row["Application Number"]:
                        issues.append("Application Number is required for registered application lookup")
                else:
                    for field in ("Entity Type", "Name of the Entity"):
                        if not row[field]: issues.append(f"{field} is required for registered entity lookup")
            if SALES_EXPORT:
                for field in ("Entity Type", "Name of the Entity", "Address"):
                    if not row[field]: issues.append(f"{field} is required for Export")
            if any(cells[i].data_type == "f" for i in indexes.values()):
                issues.append("Use literal values, not Excel formulas")
            if not re.fullmatch(r"[0-9]{10}", row["Mobile Number"]):
                issues.append("Mobile Number must contain 10 digits")
            for column in ("Total Plastic Quantity (Tons)", "Total Invoice Value (₹)"):
                try:
                    value = Decimal(row[column])
                    if not value.is_finite() or value <= 0:
                        raise ValueError()
                    row[column] = format(value, "f")
                except (InvalidOperation, ValueError):
                    issues.append(f"{column} must be a positive finite number")
            try:
                value = values.get("Date of Sale")
                if isinstance(value, datetime):
                    value = value.strftime("%Y-%m-%d")
                parsed = None
                for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                    try:
                        parsed = datetime.strptime(str(value).strip(), fmt)
                        break
                    except ValueError:
                        pass
                if parsed is None:
                    raise ValueError("Use dd/mm/yyyy, YYYY-MM-DD or an Excel date")
                row["_date"] = parsed
                fy = row["Financial Year"]
                if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", fy):
                    raise ValueError("Financial year must look like 2026-27")
                year = int(fy[:4])
                if fy[-2:] != str(year + 1)[-2:] or not (datetime(year, 4, 1) <= row["_date"] < datetime(year + 1, 4, 1)):
                    raise ValueError("Date must fall within the selected Financial year")
            except ValueError as exc:
                issues.append(f"Date must be dd/mm/yyyy, YYYY-MM-DD or an Excel date; check Financial year: {exc}")
            try:
                percent = Decimal(row["% of Recycled Plastic Content"])
                if not percent.is_finite() or not 0 <= percent <= 100:
                    raise ValueError()
                row["% of Recycled Plastic Content"] = format(percent, "f")
            except (InvalidOperation, ValueError):
                issues.append("Recycled Plastic Content must be between 0 and 100; use 0 for virgin material")
            if row["Registration Type"].casefold() not in {"registered", "unregistered"}:
                issues.append("Registration Type must be Registered or Unregistered")
            if not re.fullmatch(r"[0-9]+", row["Bank Account No"]):
                issues.append("Bank Account No must contain digits; store it as Excel text to preserve leading zeros")
            filename = row["Invoice Filename"]
            pdf = (SALES_INVOICE_DIR / filename).resolve()
            if not filename or "/" in filename or "\\" in filename or pdf.parent != SALES_INVOICE_DIR.resolve() or pdf.suffix.lower() != ".pdf":
                issues.append("Invoice Filename must be a PDF filename in Invoice upload")
            elif not pdf.is_file():
                issues.append(f"PDF not found: {filename}")
            else:
                try:
                    with pdf.open("rb") as stream:
                        if not stream.read(1024).lstrip().startswith(b"%PDF-"):
                            issues.append("Invoice file does not have a PDF header")
                except OSError as exc:
                    issues.append(f"Cannot read PDF: {exc}")
            row.update(_pdf=pdf, _excel_row=number, _validation_error="; ".join(issues),
                       _original={c: cells[i].value for i, c in enumerate(original_headers) if c})
            prepared.append(row)
    finally:
        workbook.close()
    if not prepared:
        raise ValueError("The first worksheet has no data rows")
    return prepared



SALES_LABEL_ALIASES = {
    "GST E-Invoice No / Invoice No": ["GST E-Invoice No / Invoice No", "GST E-Invoice No / Invoice No.", "GST E-Invoice No / Invoice No *"],
    "Name of the Entity": ["Name of the Entity", "Entity Name"],
    "Category Of Plastic": ["Category Of Plastic", "Category of Plastic", "Categories of Plastic"],
    "Total Plastic Quantity (Tons)": ["Total Plastic Quantity (Tons)", "Total Plastic Quantity (Ton)"],
    "% of Recycled Plastic Content": ["% of Recycled Plastic Content", "% of Recycled Plastic Content (0 value for Virgin material)"],
    "Bank Account No": ["Bank Account No", "Bank Account Number", "Account Number"],
    "Buyer GST": ["Buyer GST", "Buyer GSTIN"],
    "Seller GST": ["Seller GST", "Seller GSTIN", "Sellet GST"],
    "Total Invoice Value (\u20b9)": ["Total Invoice Value (\u20b9)", "Total Invoice Value"],
    "Date of Sale": ["Date of Sale", "Sales Date"],
}


def sales_candidates(active_driver, label, tag="select", placeholder=None, xpath=None):
    override = SALES_FIELD_XPATHS.get(label) or xpath
    if override:
        return active_driver.find_elements(By.XPATH, override)
    return active_driver.execute_script(r"""
        const root = document.querySelector('app-producer-sales-single-entry');
        if (!root) return [];
        const clean = s => s.replace(/[*:?]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const names = arguments[0].map(clean), tag = arguments[1], placeholder = arguments[2];
        const found = new Set();
        for (const label of root.querySelectorAll('label, span, div, p')) {
            if (!names.includes(clean(label.textContent))) continue;
            const linked = label.htmlFor && document.getElementById(label.htmlFor);
            if (linked && linked.matches(tag) && root.contains(linked)) { found.add(linked); continue; }
            for (let p = label.parentElement; p && p !== root; p = p.parentElement) {
                const fields = Array.from(p.querySelectorAll(tag)).filter(e => e.getClientRects().length);
                if (fields.length === 1) { found.add(fields[0]); break; }
                if (fields.length > 1) break;
            }
        }
        if (!found.size && placeholder) {
            for (const e of root.querySelectorAll(tag))
                if (e.getAttribute('placeholder') === placeholder) found.add(e);
        }
        return Array.from(found);
    """, SALES_LABEL_ALIASES.get(label, [label]), tag, placeholder)


def sales_field(active_driver, label, tag="select", placeholder=None, xpath=None, require_enabled=True):
    def locate(_):
        sales_check_session(active_driver)
        try:
            candidates = [e for e in sales_candidates(active_driver, label, tag, placeholder, xpath)
                          if e.is_displayed() and (not require_enabled or e.is_enabled())]
            if len(candidates) > 1:
                raise ValueError(f"Ambiguous field: {label}. Set SALES_FIELD_XPATHS[{label!r}].")
            return candidates[0] if candidates else False
        except StaleElementReferenceException:
            return False
    try:
        return WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(locate)
    except TimeoutException as exc:
        raise RuntimeError(f"Field unavailable: {label}. Set SALES_FIELD_XPATHS if its portal label differs.") from exc


def sales_select(active_driver, label, text):
    expected = " ".join(text.split()).casefold()
    def choose(_):
        sales_check_session(active_driver)
        try:
            fields = [e for e in sales_candidates(active_driver, label) if e.is_displayed()]
            if len(fields) > 1: raise ValueError(f"Ambiguous dropdown: {label}")
            if not fields: return False
            field = fields[0]


            snapshot = active_driver.execute_script("""
                const s = arguments[0];
                return {
                    disabled: s.disabled,
                    selectedIndex: s.selectedIndex,
                    options: Array.from(s.options, (o, index) => ({
                        index, value: o.value, text: o.text,
                        disabled: o.disabled || (o.parentElement.tagName === 'OPTGROUP' && o.parentElement.disabled)
                    }))
                };
            """, field)
            matches = [o for o in snapshot["options"] if not o["disabled"] and o["value"]
                       and " ".join(o["text"].split()).casefold() == expected]
            if len(matches) > 1: raise ValueError(f"Ambiguous option {text!r} in {label}")
            if not matches: return False
            match = matches[0]
            if snapshot["selectedIndex"] == match["index"]: return True
            if snapshot["disabled"]: return False

            Select(field).select_by_value(match["value"])
            return True
        except (StaleElementReferenceException, ElementClickInterceptedException):
            return False
    try:
        WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(choose)
        sales_wait_for_form(active_driver, f"After selecting {label}")
        def retained(_):
            sales_check_session(active_driver)
            try:
                fields = [e for e in sales_candidates(active_driver, label) if e.is_displayed()]
                if len(fields) != 1: return False
                actual = active_driver.execute_script(
                    "const s = arguments[0]; return s.selectedIndex < 0 ? '' : s.options[s.selectedIndex].text;", fields[0])
                return " ".join(actual.split()).casefold() == expected
            except StaleElementReferenceException:
                return False
        WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(retained)
    except TimeoutException as exc:
        raise ValueError(f"{label} option unavailable or selection not retained: {text!r}") from exc


def sales_text(active_driver, label, value, placeholder=None, xpath=None):

    def fill(_):
        sales_check_session(active_driver)
        try:
            if any(e.is_displayed() for e in active_driver.find_elements(By.CSS_SELECTOR, SALES_LOADER_CSS)):
                return False
            fields = [e for e in sales_candidates(active_driver, label, "input, textarea", placeholder, xpath)
                      if e.is_displayed()]
            if len(fields) > 1: raise ValueError(f"Ambiguous field: {label}")
            if not fields: return False
            element = fields[0]
            actual = (element.get_attribute("value") or "").strip()
            if not element.is_enabled() or element.get_attribute("readonly") is not None:
                return actual == value.strip()
            if actual != value.strip():
                element.clear()
                if value: element.send_keys(value)
            element.send_keys(Keys.TAB)

            fresh = [e for e in sales_candidates(active_driver, label, "input, textarea", placeholder, xpath)
                     if e.is_displayed()]
            return len(fresh) == 1 and (fresh[0].get_attribute("value") or "").strip() == value.strip()
        except (StaleElementReferenceException, ElementClickInterceptedException):
            return False
    try:
        WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(fill)
    except TimeoutException as exc:
        raise RuntimeError(f"{label}: input did not become ready or retain the Excel value") from exc


def sales_radio(active_driver, group, text):
    xpath = f"//app-producer-sales-single-entry//label[.//span[normalize-space(.)='{text}']]//input[@type='radio' and @name='{group}']"
    def choose(_):
        sales_check_session(active_driver)
        try:
            radios = active_driver.find_elements(By.XPATH, xpath)
            for radio in radios:
                if radio.is_displayed() and radio.is_enabled():
                    if not radio.is_selected(): radio.click()
                    return True
            return False
        except (StaleElementReferenceException, ElementClickInterceptedException):
            return False
    WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(choose)
    sales_wait_for_form(active_driver, f"After choosing {text}")
    def selected(_):
        try:
            return any(e.is_selected() for e in active_driver.find_elements(By.XPATH, xpath))
        except StaleElementReferenceException:
            return False
    WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(selected)


def sales_wait_after_registered_lookup(active_driver):


    previous_id, stable_since = None, None
    def ready(_):
        nonlocal previous_id, stable_since
        sales_check_session(active_driver)
        sales_check_portal_errors(active_driver, "Registered autofill")
        try:
            if any(e.is_displayed() for e in active_driver.find_elements(By.CSS_SELECTOR, SALES_LOADER_CSS)):
                previous_id, stable_since = None, None
                return False
            fields = [e for e in sales_candidates(active_driver, "Mobile Number", "input", "Mobile Number")
                      if e.is_displayed() and e.is_enabled()]
            if len(fields) != 1:
                previous_id, stable_since = None, None
                return False
            if fields[0].id != previous_id:
                previous_id, stable_since = fields[0].id, time.monotonic()
            return time.monotonic() - stable_since >= 0.2
        except StaleElementReferenceException:
            previous_id, stable_since = None, None
            return False
    WebDriverWait(active_driver, SALES_FORM_WAIT_SECONDS, poll_frequency=0.1).until(ready)


class SalesSessionExpired(RuntimeError):
    pass

class SalesBrowserUnavailable(RuntimeError):
    pass

def sales_session_url(active_driver):
    if active_driver is None:
        raise SalesBrowserUnavailable(
            "No browser session is connected. Use Open Login to connect to the portal."
        )
    try:
        return urlsplit(active_driver.current_url)
    except WebDriverException as exc:
        raise SalesBrowserUnavailable(
            f"Cannot access the portal browser session: {type(exc).__name__}: {exc.msg}"
        ) from exc

def sales_check_session(active_driver):
    url = sales_session_url(active_driver)
    if url.hostname == "epr.cpcb.gov.in" and url.path.rstrip("/") in {"/home", "/login"}:
        raise SalesSessionExpired(
            "Portal has been automatically logged out, login again to start data uploading."
        )

def sales_wait_for_form(active_driver, stage, require_form=True):
    ready_since = None

    def ready(_):
        nonlocal ready_since
        sales_check_session(active_driver)
        sales_check_portal_errors(active_driver, stage)
        try:
            forms = active_driver.find_elements(By.CSS_SELECTOR, "app-producer-sales-single-entry")
            loaders = active_driver.find_elements(By.CSS_SELECTOR, SALES_LOADER_CSS)
            if (require_form and not any(form.is_displayed() for form in forms)) or any(
                loader.is_displayed() for loader in loaders
            ):
                ready_since = None
                return False
            if ready_since is None:
                ready_since = time.monotonic()
            return time.monotonic() - ready_since >= 0.2
        except StaleElementReferenceException:
            ready_since = None
            return False

    try:
        WebDriverWait(active_driver, SALES_FORM_WAIT_SECONDS, poll_frequency=0.1).until(ready)
    except TimeoutException as exc:
        raise RuntimeError(
            f"{stage}: form did not become ready / loader did not clear."
        ) from exc

def sales_wait_for_page(active_driver):
    active_driver.set_page_load_timeout(120)
    active_driver.get(SALES_URL)
    sales_check_session(active_driver)
    try:
        WebDriverWait(active_driver, 120, poll_frequency=0.25).until(
            lambda current: current.execute_script("return document.readyState") == "complete"
        )
    except TimeoutException as exc:
        raise RuntimeError("Portal page did not finish loading; no entries were filled.") from exc
    sales_wait_for_form(active_driver, "Initial form loading")


def sales_invoice(active_driver, pdf_path):
    def locate(_):
        if SALES_FILE_INPUT_CSS:
            inputs = active_driver.find_elements(By.CSS_SELECTOR, SALES_FILE_INPUT_CSS)
        else:
            inputs = active_driver.execute_script("""
                const form = document.querySelector('app-producer-sales-single-entry');
                if (!form) return [];
                const buttons = form.querySelectorAll('.upload-button');
                if (buttons.length === 1) {
                    const b = buttons[0];
                    const linked = b.htmlFor && document.getElementById(b.htmlFor);
                    if (linked && linked.matches('input[type=file]')) return [linked];
                    for (let p = b.parentElement; p && p !== form; p = p.parentElement) {
                        const files = p.querySelectorAll('input[type=file]');
                        if (files.length) return Array.from(files);
                    }
                }
                return Array.from(form.querySelectorAll('input[type=file]'));
            """)
        if len(inputs) > 1:
            raise ValueError("Multiple file inputs found. Set SALES_FILE_INPUT_CSS for the invoice input.")
        return inputs[0] if inputs else False

    file_input = WebDriverWait(active_driver, SALES_WAIT_SECONDS).until(locate)
    file_input.send_keys(str(pdf_path))
    attached = active_driver.execute_script(
        "return Array.from(arguments[0].files || []).map(f => f.name);", file_input)
    if attached != [pdf_path.name]:
        raise RuntimeError("Invoice attachment could not be verified in the file input; inspect Chrome.")
    sales_wait_for_form(active_driver, "Invoice upload")


def sales_date(active_driver, date_value):
    iso = date_value.strftime("%Y-%m-%d")
    def controls():
        fields = sales_candidates(active_driver, "Date of Sale", "input:not([type=hidden])")
        fields = [e for e in fields if e.is_displayed()]
        if not fields:
            fields = [e for e in active_driver.find_elements(By.CSS_SELECTOR,
                "app-producer-sales-single-entry app-input-date input:not([type=hidden])") if e.is_displayed()]

        native = [e for e in fields if e.get_attribute("type") == "date"]
        return native if native else fields
    def fill(_):
        sales_check_session(active_driver)
        try:
            if any(e.is_displayed() for e in active_driver.find_elements(By.CSS_SELECTOR, SALES_LOADER_CSS)):
                return False
            fields = controls()
            if len(fields) > 1:
                raise ValueError("Ambiguous Date of Sale input; set SALES_FIELD_XPATHS['Date of Sale']")
            if not fields or not fields[0].is_enabled(): return False
            element = fields[0]
            native = element.get_attribute("type") == "date"
            hint = (element.get_attribute("placeholder") or "").lower()
            value = iso if native else date_value.strftime("%d/%m/%Y" if "/" in hint else "%d-%m-%Y")


            active_driver.execute_script("""
                const e = arguments[0];
                e.focus();
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, arguments[1]);
                e.dispatchEvent(new Event('input', {bubbles:true}));
                e.dispatchEvent(new Event('change', {bubbles:true}));
                e.blur();
            """, element, value)
            fresh = controls()
            if len(fresh) != 1: return False
            actual = (fresh[0].get_attribute("value") or "").strip()
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%dT%H:%M"):
                try:
                    if datetime.strptime(actual, fmt).date() == date_value.date(): return actual
                except ValueError:
                    pass
            return False
        except (StaleElementReferenceException, ElementClickInterceptedException):
            return False
    try:
        actual = WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(fill)
        pibo_log(f"Date of Sale filled: {actual} (Excel: {date_value:%d/%m/%Y})")
    except TimeoutException as exc:
        raise RuntimeError(f"Date of Sale could not retain Excel date {date_value:%d/%m/%Y}") from exc


def sales_fill_row(active_driver, row):
    sales_wait_for_page(active_driver)
    sales_radio(active_driver, "invoiceType", "Export" if SALES_EXPORT else "Domestic Sales")

    sales_invoice(active_driver, row["_pdf"])
    registered = not SALES_EXPORT and row["Registration Type"].casefold() == "registered"

    if not SALES_EXPORT:
        sales_select(active_driver, "Registration Type", row["Registration Type"])
    if registered:
        sales_radio(active_driver, "searchType", "Application Number")
        sales_text(active_driver, "EPR Application Number", row["Application Number"], "Enter EPR Application Number")
        sales_wait_for_form(active_driver, "Application Number lookup")
        if row["Entity Type"]:
            sales_select(active_driver, "Entity Type", row["Entity Type"])
        sales_wait_for_form(active_driver, "Registered entity lookup")

        def entity_ready(_):
            sales_check_session(active_driver)
            try:
                fields = [e for e in sales_candidates(active_driver, "Name of the Entity", "input", "Entity Name")
                          if e.is_displayed()]
                if len(fields) != 1: return False
                actual = (fields[0].get_attribute("value") or "").strip()
                if not actual: return False
                expected = row["Name of the Entity"]
                if expected and " ".join(actual.split()).casefold() != " ".join(expected.split()).casefold():
                    raise ValueError(f"Application lookup Entity Name differs from Excel: {actual!r}")
                return True
            except StaleElementReferenceException:
                return False
        WebDriverWait(active_driver, SALES_WAIT_SECONDS, poll_frequency=0.1).until(entity_ready)
        sales_wait_after_registered_lookup(active_driver)
    else:

        sales_select(active_driver, "Entity Type", row["Entity Type"])
        sales_text(active_driver, "Name of the Entity", row["Name of the Entity"], "Entity Name")
        if SALES_EXPORT:
            sales_select(active_driver, "Country", row["Country"])
        sales_text(active_driver, "Address", row["Address"], "Postal Address")
        if not SALES_EXPORT:
            sales_select(active_driver, "State", row["State"])
    sales_text(active_driver, "Mobile Number", row["Mobile Number"], "Mobile Number")
    sales_select(active_driver, "Category Of Plastic", row["Category Of Plastic"])
    sales_select(active_driver, "Plastic Material Type", row["Plastic Material Type"])
    sales_text(active_driver, "Total Plastic Quantity (Tons)", row["Total Plastic Quantity (Tons)"])
    sales_text(active_driver, "% of Recycled Plastic Content", row["% of Recycled Plastic Content"])
    sales_select(active_driver, "Financial Year", row["Financial Year"])

    if not SALES_EXPORT and row["Buyer GST"]:
        sales_text(active_driver, "Buyer GST", row["Buyer GST"])
    sales_text(active_driver, "Seller GST", row["Seller GST"])
    sales_text(active_driver, "HSN Code", row["HSN Code"], "Enter HSN Code")
    sales_text(active_driver, "GST E-Invoice No / Invoice No", row["GST E-Invoice No / Invoice No"],
               "Enter GST E-Invoice No / Invoice No")
    if row.get("IRN Number"):
        sales_text(active_driver, "IRN Number", row["IRN Number"], "Enter IRN Number")
    sales_text(active_driver, "Bank Account No", row["Bank Account No"])
    sales_text(active_driver, "IFSC Code", row["IFSC Code"], "Enter IFSC Code")
    sales_text(active_driver, "Total Invoice Value (\u20b9)", row["Total Invoice Value (\u20b9)"])
    sales_date(active_driver, row["_date"])


    if row["Container Type"]:
        controls = [e for e in sales_candidates(active_driver, "Container Type", "select, input") if e.is_displayed()]
        if len(controls) > 1: raise ValueError("Ambiguous Container Type field")
        if controls:
            if controls[0].tag_name.lower() == "select":
                sales_select(active_driver, "Container Type", row["Container Type"])
            else:
                sales_text(active_driver, "Container Type", row["Container Type"])
        else:
            pibo_log("Container Type column skipped: no field on the current Sales form")
    sales_check_portal_errors(active_driver, "Form filling failed")



SALES_PORTAL_WARNINGS = []
SALES_CURRENT_RESULT = None


def sales_check_portal_errors(active_driver, stage):
    selectors = ".toast-error, .alert-danger, .alert-error, .error-message, .invalid-feedback"
    messages = []
    for element in active_driver.find_elements(By.CSS_SELECTOR, selectors):
        try:
            if element.is_displayed():
                text = element.text.strip()
                if text: messages.append(text)
        except StaleElementReferenceException:
            continue
    blocking = []
    for message in dict.fromkeys(messages):
        normalized = " ".join(message.split()).casefold()
        timeout = "the upstream server is timing out"

        remainder = normalized.replace(timeout, "")
        remainder = re.sub(r"\berror\b", "", remainder).strip(" ;:,.!\u00d7x\u2715\u2716\u2717- ")
        if timeout in normalized and not remainder:
            row_number = SALES_CURRENT_RESULT.get("Excel Row") if SALES_CURRENT_RESULT else None
            if not any(note["Excel Row"] == row_number and note["Message"] == timeout
                       for note in SALES_PORTAL_WARNINGS):
                SALES_PORTAL_WARNINGS.append({"Excel Row": row_number, "Stage": stage, "Message": timeout})
                if SALES_CURRENT_RESULT is not None:
                    SALES_CURRENT_RESULT.setdefault("Warnings", []).append(message)
                pibo_log(f"WARNING | Excel row {row_number} | {stage}: {message} | Continuing field testing")
            continue
        blocking.append(message)
    if blocking:
        raise RuntimeError(f"{stage}: " + "; ".join(blocking))


def sales_save_failures(failed, rows):
    columns = list(rows[0]["_original"]) + ["Excel Row", "Failure Reason"]
    records = [{**row["_original"], "Excel Row": row["_excel_row"], "Failure Reason": reason}
               for row, reason in failed]
    output = BASE_DIR / "SALES Failed Entries.xlsx"
    if output.exists():
        output = BASE_DIR / f"SALES Failed Entries_{datetime.now():%Y%m%d_%H%M%S_%f}.xlsx"
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame(records, columns=columns).to_excel(writer, sheet_name="SALES Failed Entries", index=False)
        sheet = writer.book.worksheets[0]
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(
                80, max(len(str(cell.value or "")) for cell in column) + 3)
            for cell in column:
                if isinstance(cell.value, str):
                    cell.data_type = "s"
    pibo_log(f"SALES Failed Entries saved: {output}", flush=True)
    return output


def sales_click_button(active_driver, button, stage):
    sales_check_session(active_driver)
    sales_wait_for_form(active_driver, f"Before {button}", require_form=button != "Submit")

    def click_when_ready(current):
        sales_check_session(current)
        sales_check_portal_errors(current, stage)
        try:
            if any(loader.is_displayed() for loader in current.find_elements(
                By.CSS_SELECTOR, SALES_LOADER_CSS
            )):
                return False
            xpath = ("//button[contains(concat(' ', normalize-space(@class), ' '), ' confirm-button ') and normalize-space(.)='Submit']"
                     if button == "Submit" else f"//button[normalize-space(.)='{button}']")
            candidates = current.find_elements(By.XPATH, xpath)
            for element in candidates:
                if element.is_displayed() and element.is_enabled():
                    element.click()
                    return True
            return False
        except (ElementClickInterceptedException, StaleElementReferenceException):
            return False

    try:
        WebDriverWait(active_driver, SALES_FORM_WAIT_SECONDS, poll_frequency=0.1).until(click_when_ready)
    except TimeoutException as exc:
        raise RuntimeError(f"{button} button was not available/clickable.") from exc
    pibo_log(f"{button} clicked")
    sales_check_session(active_driver)
    sales_check_portal_errors(active_driver, stage)
    if button == "Generate EPR Invoice Number":
        sales_wait_for_form(active_driver, "After Generate EPR Invoice Number", require_form=False)


def run_sales_batch(chosen, is_export=False):
    global SALES_FAILED_FILE, SALES_FAILED_ENTRIES, SALES_EXPORT, SALES_REGISTERED_LOOKUP, SALES_CURRENT_RESULT
    results, rows, failed = [], [], []
    succeeded = 0
    SALES_FAILED_FILE = None
    SALES_FAILED_ENTRIES = failed
    SALES_PORTAL_WARNINGS.clear()
    SALES_CURRENT_RESULT = None
    try:
        if not str(SALES_URL).strip():
            raise ValueError("Set SALES_URL and rerun Cell 1 first.")
        if not chosen:
            pibo_log("Sales Excel selection cancelled.")
            return results
        SALES_EXPORT = bool(is_export)
        pibo_log("Sales type: " + ("Export" if SALES_EXPORT else "Domestic Sales"))
        rows = sales_read_excel(chosen)
        pibo_log(f"total data = {len(rows)}", flush=True)
        for position, row in enumerate(rows, 1):
            current = {"Excel Row": row["_excel_row"], "Status": "FILLING"}
            results.append(current)
            SALES_CURRENT_RESULT = current
            try:
                if row["_validation_error"]:
                    raise ValueError(row["_validation_error"])
                with driver_lock:
                    active_driver = require_upload_login()
                    pibo_log(f"[{position}/{len(rows)}] Filling Excel row {row['_excel_row']}")
                    sales_fill_row(active_driver, row)
                    sales_click_button(active_driver, "Generate EPR Invoice Number", "Invoice generation failed")


                current["Status"] = "GENERATE_CLICKED_SUBMIT_DISABLED"
                succeeded += 1
                if succeeded % 100 == 0:
                    pibo_log(f"{succeeded} entries tested with Generate clicked (Submit disabled); {len(failed)} entries failed", flush=True)
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                current.update({"Status": "FAILED", "Error": reason})
                failed.append((row, reason))
                pibo_log(f"Excel row {row['_excel_row']} failed: {reason}", flush=True)
                pibo_log(f"{len(failed)} entries failed", flush=True)
                if isinstance(exc, (SalesSessionExpired, SalesBrowserUnavailable)):
                    failed.extend((pending, "Not attempted: " + reason) for pending in rows[position:])
                    break
            except (KeyboardInterrupt, EOFError):
                reason = "Interrupted by user; check portal before retrying this row."
                current.update({"Status": "INTERRUPTED", "Error": reason})
                failed.append((row, reason))
                raise
    except (KeyboardInterrupt, EOFError):
        pibo_log("Batch interrupted. Browser remains open.", flush=True)
        attempted = {result["Excel Row"] for result in results}
        for row in rows:
            if row["_excel_row"] not in attempted:
                failed.append((row, "Not attempted: batch interrupted by user."))
    except Exception as exc:
        pibo_log(f"Error: {type(exc).__name__}: {exc}", flush=True)
    finally:
        if rows:
            try:
                SALES_FAILED_FILE = sales_save_failures(failed, rows)
            except Exception as exc:
                pibo_log(f"Failed Entries export error: {exc}. Failed rows remain in SALES_FAILED_ENTRIES.", flush=True)
            pibo_log(f"{succeeded} entries tested with Generate clicked (Submit disabled)", flush=True)
            pibo_log(f"{len(failed)} entries failed", flush=True)
    if rows:
        pibo_log("done", flush=True)
    return results


PIBO_UPLOAD_MODE = None
PIBO_SALES_EXPORT = False
PIBO_UPLOAD_DIALOG = None


def pibo_data_upload_clicked():
    global PIBO_UPLOAD_DIALOG
    if busy:
        return
    if PIBO_UPLOAD_DIALOG is not None and PIBO_UPLOAD_DIALOG.winfo_exists():
        PIBO_UPLOAD_DIALOG.lift()
        return
    dialog = tk.Toplevel(root)
    PIBO_UPLOAD_DIALOG = dialog
    dialog.withdraw()
    dialog.title("PIBO Data Upload")
    dialog.configure(bg="#F8FAFC")
    dialog.resizable(False, False)
    dialog.transient(root)

    scale = max(1.0, float(dialog.tk.call("tk", "scaling")) / (96 / 72))
    px = lambda value: round(value * scale)
    width, height = px(570), px(430)
    root.update_idletasks()
    x = root.winfo_rootx() + (root.winfo_width() - width) // 2
    y = root.winfo_rooty() + (root.winfo_height() - height) // 2
    dialog.geometry(f"{width}x{height}+{max(0, x)}+{max(0, y)}")
    accent, ink, muted = "#6D28D9", "#172033", "#64748B"
    current_step = "mode"

    def close():
        global PIBO_UPLOAD_DIALOG
        if dialog.winfo_exists():
            dialog.grab_release()
            dialog.destroy()
        PIBO_UPLOAD_DIALOG = None

    def start(selected_mode, export=False):
        global PIBO_UPLOAD_MODE, PIBO_SALES_EXPORT
        PIBO_UPLOAD_MODE, PIBO_SALES_EXPORT = selected_mode, export
        close()
        set_busy(True, "Checking PIBO login...")
        def check_session():
            try:
                with driver_lock:
                    require_upload_login()
                events.put(("choose_pibo_excel", "", "info"))
            except Exception as exc:
                log(f"Error: {exc}", "error")
                events.put(("done", "", "error"))
        threading.Thread(target=check_session, daemon=True).start()

    header = tk.Frame(dialog, bg="#F8FAFC", padx=px(30), pady=px(24))
    header.pack(fill="x")
    top = tk.Frame(header, bg="#F8FAFC")
    top.pack(fill="x")
    tk.Label(top, text="PIBO  /  DATA UPLOAD", bg="#F8FAFC", fg=accent,
             font=("Segoe UI Semibold", 9)).pack(side="left")
    step_label = tk.Label(top, text="01  /  CHOOSE DATA", bg="#EDE9FE", fg=accent,
                          padx=px(10), pady=px(5), font=("Segoe UI Semibold", 8))
    step_label.pack(side="right")
    title = tk.Label(header, text="What would you like to upload?", bg="#F8FAFC", fg=ink,
                     font=("Segoe UI Semibold", 20), anchor="w")
    title.pack(fill="x", pady=(px(18), px(6)))
    subtitle = tk.Label(header, text="Choose a workflow to get started.", bg="#F8FAFC", fg=muted,
                        font=("Segoe UI", 10), anchor="w")
    subtitle.pack(fill="x")
    content = tk.Frame(dialog, bg="#F8FAFC", padx=px(30))
    content.pack(fill="both", expand=True)
    footer = tk.Frame(dialog, bg="#F8FAFC", padx=px(30), pady=px(16))
    footer.pack(fill="x", side="bottom")
    back = tk.Button(footer, text="\u2190 Back", relief="flat", bd=0, bg="#F8FAFC", fg=accent,
                     activebackground="#EDE9FE", activeforeground=accent, cursor="hand2",
                     font=("Segoe UI Semibold", 10), command=lambda: render("mode"))
    hint = tk.Label(footer, text="Your Excel file is selected in the next step.", bg="#F8FAFC",
                    fg=muted, font=("Segoe UI", 9))
    hint.pack(side="right")

    def card(parent, symbol, label, description, command):
        canvas = tk.Canvas(parent, height=px(86), bg="#F8FAFC", bd=0,
                           highlightthickness=0, takefocus=True, cursor="hand2")
        canvas.pack(fill="x", pady=(0, px(12)))
        state = {"hover": False, "focus": False}
        def rounded(x1, y1, x2, y2, radius, **kwargs):
            points = [x1+radius,y1,x2-radius,y1,x2,y1,x2,y1+radius,
                      x2,y2-radius,x2,y2,x2-radius,y2,x1+radius,y2,
                      x1,y2,x1,y2-radius,x1,y1+radius,x1,y1]
            canvas.create_polygon(points, smooth=True, splinesteps=24, **kwargs)
        def draw(event=None):
            canvas.delete("all")
            w = canvas.winfo_width()
            active = state["hover"] or state["focus"]
            rounded(px(1), px(1), w-px(1), px(84), px(14),
                    fill="#F3EEFF" if active else "#FFFFFF",
                    outline=accent if active else "#E2E8F0", width=px(2) if active else 1)
            rounded(px(17), px(19), px(65), px(67), px(12), fill="#EDE9FE", outline="")
            canvas.create_text(px(41), px(43), text=symbol, fill=accent,
                               font=("Segoe UI Semibold", 18))
            canvas.create_text(px(82), px(29), text=label, anchor="w", fill=ink,
                               font=("Segoe UI Semibold", 13))
            canvas.create_text(px(82), px(55), text=description, anchor="w", fill=muted,
                               font=("Segoe UI", 9))
            canvas.create_text(w-px(27), px(42), text="\u2192", fill=accent if active else "#94A3B8",
                               font=("Segoe UI", 18))
        def visual(key, value):
            state[key] = value
            draw()
        def activate(event=None):
            command()
            return "break"
        canvas.bind("<Configure>", draw)
        canvas.bind("<Enter>", lambda e: visual("hover", True))
        canvas.bind("<Leave>", lambda e: visual("hover", False))
        canvas.bind("<FocusIn>", lambda e: visual("focus", True))
        canvas.bind("<FocusOut>", lambda e: visual("focus", False))
        canvas.bind("<Button-1>", activate)
        canvas.bind("<Return>", activate)
        canvas.bind("<space>", activate)
        return canvas

    def render(step):
        nonlocal current_step
        current_step = step
        for child in content.winfo_children():
            child.destroy()
        if step == "mode":
            back.pack_forget()
            step_label.configure(text="01  /  CHOOSE DATA")
            title.configure(text="What would you like to upload?")
            subtitle.configure(text="Choose a workflow to get started.")
            first = card(content, "S", "Sales", "Upload domestic or export sales entries", lambda: render("sales"))
            card(content, "P", "Procurement", "Upload plastic procurement entries", lambda: start("Procurement"))
        else:
            back.pack(side="left")
            step_label.configure(text="02  /  SALES TYPE")
            title.configure(text="Where are these sales made?")
            subtitle.configure(text="Select the sales type for your Excel data.")
            first = card(content, "D", "Domestic sales", "Sales to entities within India", lambda: start("Sales", False))
            card(content, "E", "Export sales", "Sales to entities outside India", lambda: start("Sales", True))
        first.focus_set()

    render("mode")
    dialog.protocol("WM_DELETE_WINDOW", close)
    dialog.bind("<Escape>", lambda event: render("mode") if current_step == "sales" else close())
    try:
        dialog.attributes("-alpha", 0.0)
    except tk.TclError:
        pass
    dialog.deiconify()
    dialog.grab_set()
    def fade(step=1):
        if not dialog.winfo_exists():
            return
        try:
            dialog.attributes("-alpha", min(1.0, step / 8))
            if step < 8:
                dialog.after(18, fade, step + 1)
        except tk.TclError:
            pass
    dialog.after(0, fade)


def choose_pibo_excel():
    mode, export = PIBO_UPLOAD_MODE, PIBO_SALES_EXPORT
    if mode not in {"Sales", "Procurement"}:
        set_busy(False)
        return
    label = "Procurement" if mode == "Procurement" else ("Export Sales" if export else "Domestic Sales")
    try:
        chosen = filedialog.askopenfilename(
            parent=root, title=f"Select PIBO {label} Excel", initialdir=str(BASE_DIR),
            filetypes=[("Excel workbook", "*.xlsx")],
        )
        if not chosen:
            log(f"PIBO {label} Excel selection cancelled.")
            set_busy(False)
            return
    except Exception as exc:
        log(f"Error: {exc}", "error")
        set_busy(False)
        return

    def fill_pibo():
        global PIBO_BATCH_RESULTS, SALES_BATCH_RESULTS
        if mode == "Sales":
            SALES_BATCH_RESULTS = run_sales_batch(chosen, is_export=export)
            return SALES_FAILED_FILE
        PIBO_BATCH_RESULTS = run_pibo_batch(chosen)
        return PIBO_FAILED_FILE

    log(f"Starting PIBO {label} upload.")
    if mode == "Sales":
        log("Sales test mode: Generate EPR Invoice Number enabled; final Submit disabled.")
    set_busy(True, f"Uploading PIBO {label} entries...")
    run_in_background(fill_pibo, lambda output: f"PIBO {label} batch finished. Failure report: {output}")


def data_upload_clicked():
    if busy:
        return
    set_busy(True, "Checking login...")

    def check_session():
        try:
            with driver_lock:
                require_upload_login()
            events.put(("choose_upload_excel", "", "info"))
        except Exception as exc:
            log(f"Error: {exc}", "error")
            events.put(("done", "", "error"))

    threading.Thread(target=check_session, daemon=True).start()


def choose_upload_excel():

    try:
        chosen = filedialog.askopenfilename(
            parent=root, title="Select procurement Excel",
            initialdir=str(BASE_DIR), filetypes=[("Excel workbook", "*.xlsx")],
        )
        if not chosen:
            log("Excel selection cancelled.")
            set_busy(False)
            return
    except Exception as exc:
        log(f"Error: {exc}", "error")
        set_busy(False)
        return

    def fill_upload():
        rows = upload_read_excel(chosen)
        failed = []
        succeeded = 0
        log(f"Total data: {len(rows)} entries")
        try:
            with driver_lock:
                for position, row in enumerate(rows, 1):
                    try:
                        if row["_validation_error"]:
                            raise ValueError(row["_validation_error"])
                        active_driver = driver
                        upload_check_session(active_driver)
                        log(f"[{position}/{len(rows)}] Loading portal for Excel row {row['_excel_row']}...")
                        upload_fill_row(active_driver, row)
                        for button, stage in (("Preview", "Preview failed"), ("Submit", "Submit failed")):
                            upload_check_session(active_driver)
                            log(f"Excel row {row['_excel_row']}: waiting for {button}...")
                            upload_wait_for_form(active_driver, f"Before {button}", require_form=button == "Preview")

                            def click_when_ready(current):
                                try:
                                    if any(loader.is_displayed() for loader in current.find_elements(
                                        By.CSS_SELECTOR, ".loader-wrapper"
                                    )):
                                        return False
                                    candidates = current.find_elements(By.XPATH,
                                        f"//button[normalize-space(.)='{button}']")
                                    for element in candidates:
                                        if element.is_displayed() and element.is_enabled():
                                            element.click()
                                            return True
                                    return False
                                except (ElementClickInterceptedException, StaleElementReferenceException):
                                    return False

                            try:
                                WebDriverWait(active_driver, UPLOAD_FORM_WAIT_SECONDS, poll_frequency=0.1).until(
                                    click_when_ready
                                )
                            except TimeoutException as exc:
                                raise RuntimeError(
                                    f"{button} button was not available/clickable."
                                ) from exc
                            log(f"Excel row {row['_excel_row']}: {button} clicked")
                            time.sleep(UPLOAD_BUTTON_DELAY)
                            upload_check_session(active_driver)
                            upload_check_portal_errors(active_driver, stage)
                            if button == "Submit":
                                upload_wait_for_form(active_driver, "After Submit", require_form=False)
                        succeeded += 1
                        log(f"Excel row {row['_excel_row']}: Submit clicked ({succeeded} submitted, {len(failed)} failed)")
                    except Exception as exc:
                        try:
                            upload_check_session(driver)
                        except (UploadSessionExpired, UploadBrowserUnavailable) as session_exc:
                            exc = session_exc
                        if isinstance(exc, (UploadSessionExpired, UploadBrowserUnavailable)):
                            reason = str(exc)
                            failed.extend((pending, reason) for pending in rows[position - 1:])
                            log(reason, "error")
                            raise exc
                        reason = f"{type(exc).__name__}: {exc}"
                        failed.append((row, reason))
                        log(f"Excel row {row['_excel_row']} failed: {reason}", "error")
                    if position < len(rows):
                        time.sleep(UPLOAD_ENTRY_DELAY)
        finally:
            output = upload_save_failures(failed, rows)
            log(f"Batch complete: {succeeded} submitted, {len(failed)} failed. Report: {output}")
        return output

    set_busy(True, "Uploading Excel entries...")
    run_in_background(fill_upload, lambda output: f"Upload complete. Failure report: {output}")


DELETE_YEAR_SELECT_INDEX = 0
DELETE_SCROLL_XPATH = "//*[@class = 'production-detail-table has-data animate']"
DELETE_NEXT_XPATH = ''
DELETE_TABLE_XPATH = '/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-production-details/div/div[2]/div[2]/div[6]/div/app-table/div/div/table'
DELETE_URL = 'https://epr.cpcb.gov.in/onboarding/production-details'
DELETE_WAIT = 30
DELETE_DELAY = 0.2
import re
import time
from pathlib import Path
from datetime import datetime
import pandas as pd
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import StaleElementReferenceException

def delete_table(d):
    candidates = []
    for table in d.find_elements(By.CSS_SELECTOR, 'app-production-details table'):
        if not table.is_displayed():
            continue
        headings = ' '.join((e.text for e in table.find_elements(By.CSS_SELECTOR, 'thead th'))).casefold()
        has_delete = bool(table.find_elements(By.CSS_SELECTOR, 'button[title="Delete"]'))
        if has_delete or ('action' in headings and 'production' in headings):
            candidates.append(table)
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise RuntimeError('Multiple production details tables found; cannot choose uniquely.')
    raise RuntimeError('Production details table not found yet (looking for Delete controls or production/action headers).')

def delete_ready(d):
    previous, since = (None, time.monotonic())

    def settled(_):
        nonlocal previous, since
        try:
            if d.execute_script('return document.readyState') != 'complete':
                return False
            busy = d.find_elements(By.CSS_SELECTOR, 'app-production-details [aria-busy="true"], app-production-details .spinner, app-production-details .loading, .ngx-spinner-overlay')
            if any((e.is_displayed() for e in busy)):
                previous, since = (None, time.monotonic())
                return False
            table = delete_table(d)
            signature = table.text
            if signature != previous:
                previous, since = (signature, time.monotonic())
                return False
            return table if time.monotonic() - since >= 0.2 else False
        except (RuntimeError, StaleElementReferenceException):
            previous, since = (None, time.monotonic())
            return False
    from selenium.common.exceptions import TimeoutException
    try:
        table = WebDriverWait(d, DELETE_WAIT, poll_frequency=0.1).until(settled)
    except TimeoutException as exc:
        visible_tables = [e for e in d.find_elements(By.CSS_SELECTOR, 'app-production-details table') if e.is_displayed()]
        raise RuntimeError(f'Timed out waiting for production details table readiness. Visible tables: {len(visible_tables)}. Check whether production/action headers and Delete controls are present.') from exc
    time.sleep(DELETE_DELAY)
    return table

def delete_click(d, locator, label):
    """Re-find controls during Angular rendering and retry intercepted clicks."""
    from selenium.common.exceptions import ElementClickInterceptedException, ElementNotInteractableException

    def click_when_ready(_):
        try:
            elements = [e for e in d.find_elements(*locator) if e.is_displayed() and e.is_enabled()]
            if not elements:
                return False
            if len(elements) != 1:
                raise RuntimeError(f'Multiple {label} buttons found; cannot safely choose one.')
            d.execute_script("arguments[0].scrollIntoView({block:'center'});", elements[0])
            elements[0].click()
            return True
        except (StaleElementReferenceException, ElementClickInterceptedException, ElementNotInteractableException):
            return False
    log(f'Waiting for/clicking {label}...')
    WebDriverWait(d, DELETE_WAIT, poll_frequency=0.2).until(click_when_ready, message=f'Could not click {label}; inspect the portal for an overlay or disabled button.')

def delete_open(d, year):
    if '/production-details' not in d.current_url:
        log('Opening Production Details with your selected unit...')
        d.execute_script("\n            const target = new URL(arguments[0]);\n            if (target.origin !== location.origin) {\n                throw new Error('Log in to the CPCB portal and select your unit first.');\n            }\n            history.pushState(null, '', target.pathname + target.search + target.hash);\n            window.dispatchEvent(new PopStateEvent('popstate', {state: history.state}));\n        ", DELETE_URL)
    WebDriverWait(d, DELETE_WAIT, poll_frequency=0.2).until(lambda x: x.find_elements(By.CSS_SELECTOR, 'app-production-details select.filter-year-select'))

    def year_selected(_):
        try:
            dropdowns = [e for e in d.find_elements(By.CSS_SELECTOR, 'app-production-details select.filter-year-select') if e.is_displayed()]
            if len(dropdowns) <= DELETE_YEAR_SELECT_INDEX:
                return False
            field = dropdowns[DELETE_YEAR_SELECT_INDEX]
            if not field.is_enabled():
                return False
            selector = Select(field)
            if selector.first_selected_option.get_attribute('value') != year:
                selector.select_by_value(year)
                return False
            return True
        except StaleElementReferenceException:
            return False
    WebDriverWait(d, DELETE_WAIT, poll_frequency=0.2).until(year_selected)
    time.sleep(DELETE_DELAY)
    delete_click(d, (By.XPATH, "//*[@class = 'filter-button']"), 'Fetch Data')
    selected_years = [Select(e).first_selected_option.text.strip() for e in d.find_elements(By.CSS_SELECTOR, 'app-production-details select.filter-year-select') if e.is_displayed()]
    log(f"Fetch Data clicked successfully. Selected year range: {' to '.join(selected_years)}. Waiting for Total...")
    total_locator = (By.XPATH, "//app-production-details//button[@title='Total' or (contains(concat(' ',normalize-space(@class),' '),' table-link ') and normalize-space(.)='Total')]")
    from selenium.common.exceptions import TimeoutException
    try:
        WebDriverWait(d, DELETE_WAIT, poll_frequency=0.2).until(EC.element_to_be_clickable(total_locator))
    except TimeoutException as exc:
        section = d.find_element(By.CSS_SELECTOR, 'app-production-details')
        if 'no data available' in section.text.casefold():
            raise RuntimeError(f"Fetch Data was clicked, but the portal reports 'No data available' for year range {' to '.join(selected_years)} and no Total button appeared. Check the selected range/account and whether production records exist. Nothing deleted.") from exc
        raise RuntimeError(f'Fetch Data was clicked, but no clickable Total button appeared within {DELETE_WAIT} seconds. Check the portal response. Nothing deleted.') from exc
    time.sleep(DELETE_DELAY)
    delete_click(d, total_locator, 'Total')
    log('Total clicked. Waiting for production details table...')
    delete_ready(d)
    log('Production details table ready. Starting deletion loop...')
    d._production_delete_page = 1

def delete_next(d):
    if DELETE_NEXT_XPATH:
        candidates = d.find_elements(By.XPATH, DELETE_NEXT_XPATH)
    else:
        candidates = d.find_elements(By.XPATH, "//app-production-details//*[self::button or self::a][@rel='next' or contains(translate(@aria-label,'NEXT','next'),'next') or contains(translate(@title,'NEXT','next'),'next') or translate(normalize-space(.),'NEXT','next')='next' or normalize-space(.)='›' or normalize-space(.)='»' or normalize-space(.)='>']")
    candidates = [e for e in candidates if e.is_displayed()]
    if len(candidates) > 1:
        raise RuntimeError('Multiple Next controls; set DELETE_NEXT_XPATH.')
    if not candidates:
        pagers = d.find_elements(By.CSS_SELECTOR, 'app-production-details [class*="pagination"], app-production-details [class*="paginator"]')
        if any((e.is_displayed() for e in pagers)):
            raise RuntimeError('Paginator found but Next is unrecognized; set DELETE_NEXT_XPATH.')
        return None
    e = candidates[0]
    disabled = d.execute_script('\n        return arguments[0].closest(\'[disabled], [aria-disabled="true"], .disabled\') !== null;\n    ', e)
    return e if e.is_enabled() and (not disabled) else None

def delete_all_snapshot(d):
    table = delete_table(d)
    headers = [e.text.strip() for e in table.find_elements(By.CSS_SELECTOR, 'thead th')]
    entries = []
    for row in table.find_elements(By.CSS_SELECTOR, 'tbody tr'):
        buttons = row.find_elements(By.CSS_SELECTOR, 'button[title="Delete"]')
        if not buttons:
            continue
        values = [e.text.strip() for e in row.find_elements(By.CSS_SELECTOR, 'td')]
        record = {f"{i + 1}: {(headers[i] if i < len(headers) else 'Column')}": v for i, v in enumerate(values)}
        entries.append((row, buttons, record))
    return (table, entries)
DELETE_NOTICE_CSS = '.toast, .toast-notification, .notification-toast, [class*="toast-success"], [class*="toast-error"], app-toast, app-notification, .notification, .alert-success, .alert-danger, .alert-error, [role="alert"], .mat-mdc-snack-bar-container, .mat-snack-bar-container'

def delete_notices(d):
    notices = []
    seen = set()
    for e in d.find_elements(By.CSS_SELECTOR, DELETE_NOTICE_CSS):
        try:
            if not e.is_displayed():
                continue
            parts = e.find_elements(By.CSS_SELECTOR, '.toast-message, .notification-message, .message')
            raw = (parts[0].get_attribute('textContent') if parts else e.get_attribute('textContent')) or e.text
            if not raw or not raw.strip() or raw in seen:
                continue
            seen.add(raw)
            notices.append((e, raw))
        except StaleElementReferenceException:
            continue
    return notices

def delete_wait_one_second(d):
    deadline = time.monotonic() + 1.0
    errors = []
    while True:
        errors.extend(delete_portal_errors(d))
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return list(dict.fromkeys(errors))
        time.sleep(min(0.05, remaining))

def delete_portal_errors(d):
    seen = getattr(d, '_production_error_notices', set())
    fresh = []
    active = set()
    for element, raw in delete_notices(d):
        if 'production entry deleted successfully' in ' '.join(raw.casefold().split()):
            continue
        identity = (element.id, raw)
        active.add(identity)
        if identity not in seen:
            fresh.append(raw)
    d._production_error_notices = active
    return fresh

def delete_scroll_more(d):
    """Scan down the details wrapper before declaring remaining rows exhausted."""
    containers = [e for e in d.find_elements(By.XPATH, DELETE_SCROLL_XPATH) if e.is_displayed()]
    if not containers:
        containers = [e for e in d.find_elements(By.CSS_SELECTOR, 'app-production-details .production-detail-table') if e.is_displayed()]
    if len(containers) != 1:
        raise RuntimeError('Cannot uniquely locate the production scrolling container.')
    before = tuple((tuple(record.items()) for _, _, record in delete_all_snapshot(d)[1]))
    moved = d.execute_script("\n        const root = arguments[0];\n        const table = root.querySelector('table');\n        const scrollable = e => e && e.scrollHeight > e.clientHeight + 2 &&\n            /auto|scroll/.test(getComputedStyle(e).overflowY);\n        let target = null;\n        // Prefer the table's actual scrolling ancestor, not an unrelated panel.\n        for (let e = table || root; e; e = e.parentElement) {\n            if (scrollable(e)) { target = e; break; }\n        }\n        if (!target) target = document.scrollingElement;\n        const old = target.scrollTop;\n        target.scrollTop = Math.min(target.scrollHeight - target.clientHeight,\n            old + Math.max(100, target.clientHeight * 0.8));\n        target.dispatchEvent(new Event('scroll', {bubbles: true}));\n        return target.scrollTop > old + 1;\n    ", containers[0])
    from selenium.common.exceptions import TimeoutException
    try:
        WebDriverWait(d, 2, poll_frequency=0.1).until(lambda _: tuple((tuple(record.items()) for _, _, record in delete_all_snapshot(d)[1])) != before)
        log('More production rows loaded after scrolling; continuing...')
        return True
    except TimeoutException:
        return bool(moved)

def delete_failed_key(record):
    key = []
    for heading, value in record.items():
        label = heading.split(':', 1)[-1].strip().casefold()
        compact = re.sub('[^a-z0-9]', '', label)
        if compact in {'srno', 'sno', 'serialno', 'serialnumber', 'srnumber', 'action', 'actions'}:
            continue
        key.append((label, ' '.join(str(value).split())))
    return tuple(key)

def delete_unfailed_entries(entries, failed_counts):
    occurrences = {}
    candidates = []
    for entry in entries:
        key = delete_failed_key(entry[2])
        occurrences[key] = occurrences.get(key, 0) + 1
        if occurrences[key] > failed_counts.get(key, 0):
            candidates.append(entry)
    return candidates

def run_delete_all_production(year):
    year = str(year).strip()
    if not re.fullmatch('20\\d{2}', year):
        raise ValueError('Enter a four-digit year, for example 2025.')
    failures = []
    deleted = 0
    skipped_rows = {}
    output = BASE_DIR / 'scraped_data' / 'production_deletions'
    output.mkdir(parents=True, exist_ok=True)
    failure_path = output / f'Failed_Production_Deletions_{datetime.now():%Y%m%d_%H%M%S_%f}.xlsx'
    current = None

    def save_failure(record, reason, raw_error=''):
        failures.append({**(record or {}), 'From Year': year, 'Failure Reason': reason, 'Raw Portal Error': raw_error, 'Time': datetime.now().isoformat(timespec='seconds')})
        temporary = failure_path.with_name(failure_path.stem + '.tmp.xlsx')
        with pd.ExcelWriter(temporary, engine='openpyxl') as writer:
            pd.DataFrame(failures).to_excel(writer, sheet_name='Failed Entries', index=False)
            sheet = writer.book.active
            sheet.freeze_panes = 'A2'
            sheet.auto_filter.ref = sheet.dimensions
            for row in sheet:
                for cell in row:
                    if isinstance(cell.value, str):
                        cell.data_type = 's'
        temporary.replace(failure_path)
    try:
        with driver_lock:
            d = require_delete_login()
            delete_open(d, year)
            stale_since = None
            while True:
                try:
                    current = None
                    WebDriverWait(d, DELETE_WAIT, poll_frequency=0.05).until(lambda _: delete_table(d))
                    table, entries = delete_all_snapshot(d)
                    if not entries:
                        if 'no data' not in table.text.casefold() and delete_scroll_more(d):
                            continue
                        nxt = delete_next(d)
                        if nxt is not None:
                            before = table.get_attribute('innerHTML')
                            nxt.click()
                            WebDriverWait(d, DELETE_WAIT).until(lambda x: delete_table(x).get_attribute('innerHTML') != before)
                            continue
                        text = table.text.casefold()
                        cells = table.find_elements(By.CSS_SELECTOR, 'tbody td')
                        if 'no data' not in text and 'no record' not in text:
                            raise RuntimeError('No Delete buttons found, but the table does not explicitly report no data. Batch stopped.')
                        log(f'Table is empty. Completed: {deleted} delete operations.')
                        break
                    candidates = delete_unfailed_entries(entries, skipped_rows)
                    if not candidates:
                        if delete_scroll_more(d):
                            continue
                        nxt = delete_next(d)
                        if nxt is not None:
                            before = table.get_attribute('innerHTML')
                            nxt.click()
                            WebDriverWait(d, DELETE_WAIT).until(lambda x: delete_table(x).get_attribute('innerHTML') != before)
                            skipped_rows.clear()
                            continue
                        log(f'Finished available entries: {deleted} delete operations; {len(failures)} errors saved. Failed rows remain on the portal.')
                        break
                    row, buttons, current = candidates[0]
                    raw_errors = []
                    try:
                        if len(buttons) != 1 or not buttons[0].is_enabled():
                            raise RuntimeError('Delete button unavailable or ambiguous.')
                        delete_portal_errors(d)
                        d.execute_script("arguments[0].scrollIntoView({block:'center'});", buttons[0])
                        buttons[0].click()
                        alert = WebDriverWait(d, DELETE_WAIT).until(EC.alert_is_present())
                        if 'are you sure you want to delete this production entry' not in alert.text.casefold():
                            raw_errors.append(alert.text)
                            alert.dismiss()
                            raise RuntimeError('Portal displayed an unexpected dialog.')
                        alert.accept()
                        raw_errors.extend(delete_wait_one_second(d))
                        if raw_errors:
                            raise RuntimeError('Portal reported a deletion error.')
                        deleted += 1
                        log(f'Delete requests submitted: {deleted}')
                    except StaleElementReferenceException:
                        raise
                    except Exception as exc:
                        try:
                            alert = d.switch_to.alert
                            raw_errors.append(alert.text)
                            alert.dismiss()
                        except Exception:
                            pass
                        try:
                            raw_errors.extend(delete_portal_errors(d))
                        except Exception:
                            pass
                        raw_errors.extend(getattr(exc, 'portal_messages', []))
                        raw_errors = list(dict.fromkeys(raw_errors))
                        raw = '\n'.join(raw_errors)
                        reason = f'{type(exc).__name__}: {exc}'
                        log(raw if raw else reason)
                        save_failure(current, raw if raw else reason, raw)
                        failed_key = delete_failed_key(current)
                        skipped_rows[failed_key] = skipped_rows.get(failed_key, 0) + 1
                        log('Error saved; continuing with the next available entry.')
                    finally:
                        current = None
                    stale_since = None
                except StaleElementReferenceException:
                    if stale_since is None:
                        stale_since = time.monotonic()
                        log('Table re-rendered; re-reading fresh rows/buttons and continuing...')
                    if time.monotonic() - stale_since > DELETE_WAIT:
                        raise RuntimeError(f'Portal kept replacing table rows for {DELETE_WAIT} seconds; no stable row could be acquired.')
                    current = None
                    time.sleep(0.05)
                    continue
    except (KeyboardInterrupt, Exception) as exc:
        reason = 'Interrupted; check portal before retrying.' if isinstance(exc, KeyboardInterrupt) else f'{type(exc).__name__}: {exc}'
        save_failure(current, reason)
        log(f'Stopped after {deleted} delete operations: {reason}')
        log('Remaining portal entries have not been deleted.')
    finally:
        if failures:
            log('Failed/unverified records:')
            log(f'Failure report saved: {failure_path}')
        else:
            log('No failed-entry report needed. No success workbook created.')
    return {'deleted': deleted, 'failures': failures, 'failed_file': str(failure_path) if failures else None}


def require_delete_login():
    url = upload_session_url(driver)
    if (url.hostname != "epr.cpcb.gov.in"
            or not url.path.startswith("/onboarding/")
            or url.path.rstrip("/") in {"/onboarding", "/onboarding/login"}):
        raise RuntimeError(
            "Complete login and OTP verification, then select your unit in the browser "
            "before deleting production records."
        )
    return driver


def delete_production_clicked():
    if busy:
        return
    set_busy(True, "Checking login...")

    def check_session():
        try:
            with driver_lock:
                require_delete_login()
            events.put(("choose_delete_year", "", "info"))
        except Exception as exc:
            log(f"Error: {exc}", "error")
            events.put(("done", "", "error"))

    threading.Thread(target=check_session, daemon=True).start()


def choose_delete_year():
    try:
        year = simpledialog.askstring(
            "Delete Production", "From Year (for example 2025):\n"
            "ALL production records in the selected portal year range will be deleted.\n"
            "Select the correct unit in the browser before continuing.", parent=root,
        )
        if year is None:
            log("Production deletion cancelled.")
            set_busy(False)
            return
        year = year.strip()
        if not re.fullmatch(r"20\d{2}", year):
            raise ValueError("Enter a four-digit year, for example 2025.")
    except Exception as exc:
        log(f"Error: {exc}", "error")
        set_busy(False)
        return
    log(f"Starting production deletion. From Year: {year}; using the selected portal unit.")
    set_busy(True, "Deleting production records...")
    run_in_background(
        lambda: run_delete_all_production(year),
        lambda result: f"Production deletion finished: {result['deleted']} delete operations; "
        f"{len(result['failures'])} errors."
        + (f" Failure report: {result['failed_file']}" if result['failed_file'] else ""),
    )


def append_log(message):
    log_box.configure(state="normal")
    log_box.insert("end", f"[{datetime.now():%H:%M:%S}]  {message}\n")
    log_box.see("end")
    log_box.configure(state="disabled")


def set_busy(value, label="Working..."):
    global busy
    busy = value
    state = "disabled" if value else "normal"
    login_button.configure(state=state)
    upload_button.configure(state=state)
    pibo_upload_button.configure(state=state)
    delete_button.configure(state=state)
    status_label.configure(
        text=label if value else "Ready",
        bg="#FFF0D5" if value else "#DEF3ED",
        fg="#895B12" if value else "#176B58",
    )
    spinner.start(10) if value else spinner.stop()


def run_in_background(function, success_message):
    def worker():
        try:
            result = function()
            events.put(("done", success_message(result), "success"))
        except Exception as exc:


            log(f"Error: {exc}", "error")
            log("The operation has stopped. No browser close or logout action was performed.", "info")
            events.put(("done", "", "error"))

    threading.Thread(target=worker, daemon=True).start()


def login_clicked():
    user_id, password = user_entry.get().strip(), password_entry.get()
    if not user_id or not password:
        messagebox.showwarning("Credentials Required", "Enter both the User ID and password.")
        return
    set_busy(True, "Opening browser...")
    run_in_background(lambda: open_login(user_id, password), lambda _: "Login page ready")


def process_events():
    try:
        while True:
            event, message, kind = events.get_nowait()
            if event == "log":
                append_log(message)
            elif event == "choose_pibo_excel":
                choose_pibo_excel()
            elif event == "choose_upload_excel":
                choose_upload_excel()
            elif event == "choose_delete_year":
                choose_delete_year()
            elif event == "done":
                set_busy(False)
                if message:
                    append_log(message)
    except queue.Empty:
        pass
    root.after(100, process_events)


def build_ui():
    global root, user_entry, password_entry, login_button
    global upload_button, pibo_upload_button, delete_button, spinner, status_label, log_box

    root = tk.Tk()
    root.title(APP_TITLE)
    root.geometry("1120x720")
    root.state("zoomed")
    root.minsize(1080, 640)
    root.configure(bg=BG)
    root.option_add("*Font", ("Segoe UI Variable Text", 10))

    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TEntry", padding=11, fieldbackground="#F7F9FC", foreground=TEXT,
                    bordercolor="#D5DDE8", lightcolor="#D5DDE8", darkcolor="#D5DDE8",
                    insertcolor=TEXT, relief="flat")
    style.map("TEntry", bordercolor=[("focus", "#258577")],
              lightcolor=[("focus", "#258577")], darkcolor=[("focus", "#258577")])
    style.configure("Vertical.TScrollbar", background="#CED7E3", troughcolor=CARD,
                    borderwidth=0, arrowsize=12)
    style.map("Vertical.TScrollbar", background=[("active", "#97A9BF")])
    style.configure("Horizontal.TProgressbar", background="#187D70", troughcolor="#E6EEF5", borderwidth=0)
    style.map("Secondary.TButton", background=[("active", "#D9E5F2"), ("disabled", "#EEF2F6")])
    style.configure(
        "Secondary.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background="#E9EEF5", foreground=NAVY, borderwidth=0,
    )

    style.configure(
        "Upload.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background="#187D70", foreground="white", borderwidth=0,
    )
    style.map("Upload.TButton", background=[("disabled", "#94B8B4"), ("active", "#126257")])

    style.configure(
        "Delete.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background="#DC2626", foreground="white", borderwidth=0,
    )
    style.map("Delete.TButton",
              background=[("disabled", "#ECA5A5"), ("active", "#B91C1C")],
              foreground=[("disabled", "#FFFFFF")])

    for name, color, hover, disabled in (
        ("Login.TButton", "#2563EB", "#1D4ED8", "#93B4F4"),
        ("PIBO.TButton", "#7C3AED", "#6D28D9", "#BBA0EE"),
    ):
        style.configure(name, padding=(14, 11), font=("Segoe UI Semibold", 10),
                        background=color, foreground="white", borderwidth=0)
        style.map(name, background=[("disabled", disabled), ("active", hover)],
                  foreground=[("disabled", "#FFFFFF"), ("active", "#FFFFFF")])


    header = tk.Canvas(root, height=176, highlightthickness=0, bd=0, bg="#315CE8")
    header.pack(fill="x")

    def draw_header(event):
        header.delete("all")
        width, height = event.width, event.height
        start, end = (49, 92, 232), (104, 72, 211)
        for x in range(0, width, 3):
            ratio = x / max(width - 1, 1)
            rgb = tuple(round(a + (b - a) * ratio) for a, b in zip(start, end))
            color = "#%02x%02x%02x" % rgb
            header.create_rectangle(x, 0, x + 3, height, fill=color, outline="")

        header.create_oval(width - 240, -190, width + 130, 180,
                           outline="#8379E8", width=1)
        header.create_oval(width - 200, -150, width + 90, 140,
                           outline="#8379E8", width=1)
        header.create_rectangle(40, 28, 44, 41, fill="#BDEEFF", outline="")
        header.create_text(55, 35, text="CPCB  /  CEPR OPERATIONS", anchor="w",
                           fill="#E0E7FF", font=("Segoe UI", 10, "bold"))
        title = header.create_text(40, 83, text="CEPR Operations Hub", anchor="w",
                                  fill="#FFFFFF", font=("Segoe UI Variable Display", 29, "bold"))
        title_box = header.bbox(title)
        badge_x = title_box[2] + 24
        for label in ("PWP", "PIBO"):
            header.create_rectangle(badge_x, 68, badge_x + 62, 97,
                                    fill="#F0F4FF", outline="")
            header.create_text(badge_x + 31, 82, text=label, fill="#3D4CB3",
                               font=("Segoe UI", 10, "bold"))
            badge_x += 72
        header.create_text(42, 129, text=APP_DESCRIPTION, anchor="w",
                           fill="#E7EBFF", font=("Segoe UI Variable Text", 11))
        header.create_rectangle(0, height - 3, width, height, fill="#B5C6FF", outline="")

    header.bind("<Configure>", draw_header)

    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=40, pady=28)
    card = tk.Frame(body, bg=CARD, highlightbackground="#DCE3EC", highlightthickness=1)
    card.pack(fill="x")
    tk.Label(card, text="Connect to your portal", bg=CARD, fg=TEXT,
             font=("Segoe UI Semibold", 14)).grid(row=0, column=0, columnspan=2, sticky="w", padx=24, pady=(20, 3))
    tk.Label(card, text="Credentials are entered automatically. OTP verification is completed manually in the browser.",
             bg=CARD, fg=MUTED, font=("Segoe UI", 9)).grid(
                 row=1, column=0, columnspan=2, sticky="w", padx=24, pady=(0, 16))
    tk.Label(card, text="User ID", bg=CARD, fg=TEXT).grid(row=2, column=0, sticky="w", padx=(24, 10))
    tk.Label(card, text="Password", bg=CARD, fg=TEXT).grid(row=2, column=1, sticky="w", padx=(10, 24))
    user_entry = ttk.Entry(card)
    password_entry = ttk.Entry(card)
    user_entry.grid(row=3, column=0, sticky="ew", padx=(24, 10), pady=(5, 18))
    password_entry.grid(row=3, column=1, sticky="ew", padx=(10, 24), pady=(5, 18))
    card.columnconfigure((0, 1), weight=1)

    actions = tk.Frame(card, bg=CARD)
    actions.grid(row=4, column=0, columnspan=2, sticky="ew", padx=24, pady=(0, 22))
    login_button = ttk.Button(actions, text="Open Login", style="Login.TButton", command=login_clicked)
    login_button.pack(side="left")
    pibo_upload_button = ttk.Button(actions, text="PIBO Data Upload", style="PIBO.TButton",
                                    command=pibo_data_upload_clicked)
    pibo_upload_button.pack(side="left", padx=(12, 0))
    upload_button = ttk.Button(actions, text="PWP Data Upload", style="Upload.TButton", command=data_upload_clicked)
    upload_button.pack(side="left", padx=12)
    delete_button = ttk.Button(actions, text="PWP Production Delete", style="Delete.TButton",
                               command=delete_production_clicked)
    delete_button.pack(side="left")
    spinner = ttk.Progressbar(actions, mode="indeterminate", length=100)
    spinner.pack(side="right")

    log_header = tk.Frame(body, bg=BG)
    log_header.pack(fill="x", pady=(24, 8))
    tk.Label(log_header, text="Activity log", bg=BG, fg=TEXT,
             font=("Segoe UI Semibold", 12)).pack(side="left")
    status_label = tk.Label(log_header, text="Ready", bg="#DEF3ED", fg="#176B58",
                            padx=12, pady=4, font=("Segoe UI Semibold", 9))
    status_label.pack(side="right")
    log_card = tk.Frame(body, bg=CARD, highlightbackground="#DCE3EC", highlightthickness=1)
    log_card.pack(fill="both", expand=True)
    log_box = tk.Text(log_card, height=12, bg=CARD, fg=TEXT, relief="flat",
                      highlightthickness=0, selectbackground="#DCEBE8", selectforeground=TEXT,
                      spacing1=3, spacing3=5, wrap="word",
                      font=("Segoe UI", 10), padx=14, pady=12, state="disabled")
    log_scroll = ttk.Scrollbar(log_card, command=log_box.yview)
    log_scroll.pack(side="right", fill="y")
    log_box.configure(yscrollcommand=log_scroll.set)
    log_box.pack(fill="both", expand=True)
    tk.Label(body, text=" CEPR OPERATIONS HUB    |    PWP & PIBO WORKSPACE", bg=BG, fg=MUTED,
             font=("Segoe UI", 8)).pack(anchor="w", pady=(12, 0))
    append_log("Ready. Select Open Login to start a portal session.")
    root.after(100, process_events)
    return root

if __name__ == "__main__":
    build_ui().mainloop()
