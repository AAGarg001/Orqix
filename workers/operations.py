"""Source-backed upload and selection-constrained PWP deletion adapter.

Never call run_delete_all_production from the web application.
Sales source intentionally does not Submit; preserve that limitation.
"""
import importlib.util
import hashlib
import json
import re
import time
import zipfile
from pathlib import Path
from datetime import datetime
import pandas as pd

class Operations:
    def __init__(self, source, work, driver_fn, emit):
        spec = importlib.util.spec_from_file_location("operations_source", source)
        self.bot = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.bot)
        self.work, self.driver_fn, self.emit = Path(work), driver_fn, emit
        self.bot.BASE_DIR = self.work
        self.bot.UPLOAD_INVOICE_DIR = self.work / "invoices"
        self.bot.PIBO_INVOICE_DIR = self.work / "invoices"
        self.bot.SALES_INVOICE_DIR = self.work / "invoices"
        self.bot.UPLOAD_INVOICE_DIR.mkdir(exist_ok=True)
        self.bot.log = lambda message, *args, **kwargs: emit(str(message))
        self.bot.pibo_log = self.bot.log
        self.rows, self.mode, self.preview_hash = [], None, None
        self.consumed = set()
        self.snapshot = {}
        self.delete_attempted = set()

    def connect(self):
        self.bot.driver = self.driver_fn(False)
        return self.bot.driver

    def schema(self, mode):
        return {"pwp": self.bot.UPLOAD_COLUMNS, "pibo": self.bot.PIBO_COLUMNS,
                "sales": self.bot.SALES_COLUMNS, "sales_export": self.bot.SALES_COLUMNS}[mode]

    def validate(self, mode, path):
        with zipfile.ZipFile(path) as archive:
            if len(archive.infolist()) > 1000 or sum(x.file_size for x in archive.infolist()) > 50 * 1024 * 1024:
                raise ValueError("Workbook expanded size exceeds the safe limit")
        read = {"pwp": self.bot.upload_read_excel, "pibo": self.bot.pibo_read_excel,
                "sales": self.bot.sales_read_excel, "sales_export": self.bot.sales_read_excel}[mode]
        self.bot.SALES_EXPORT = mode == "sales_export"
        self.rows = read(path)
        if len(self.rows) > 5000:
            raise ValueError("At most 5000 upload rows are allowed")
        self.mode = mode
        digest = hashlib.sha256(Path(path).read_bytes())
        for invoice in sorted({str(r.get("_pdf", "")) for r in self.rows}):
            pdf = Path(invoice)
            if pdf.is_file():
                digest.update(pdf.name.encode())
                digest.update(hashlib.sha256(pdf.read_bytes()).digest())
        self.preview_hash = digest.hexdigest()
        seen = set()
        result = []
        for row in self.rows:
            values = {k: str(v) for k, v in row.items() if not k.startswith("_")}
            key = json.dumps(values, sort_keys=True)
            pdf = Path(str(row.get("_pdf", "")))
            identity = {"mode": mode, "invoice": row.get("Invoice Number") or row.get("GST E-Invoice No.") or row.get("Invoice Number/GST E-Invoice Number"), "category": row.get("Category of Plastic") or row.get("Categories of Plastic"), "counterparty": row.get("Supplier GST Number") or row.get("Seller GST") or row.get("Buyer GST"), "date": row.get("Date") or row.get("Procurement Date (YYYY-MM-DD)")}
            fingerprint = hashlib.sha256(json.dumps(identity if identity["invoice"] else values, sort_keys=True, default=str).encode()).hexdigest()
            row["_fingerprint"] = fingerprint
            errors = row.get("_validation_error", "")
            if fingerprint in seen:
                errors += "; Duplicate row"
            seen.add(fingerprint)
            row["_validation_error"] = errors.strip("; ")
            result.append({"row": row["_excel_row"], "values": values, "errors": row["_validation_error"], "fingerprint": fingerprint})
        return {"mode": mode, "hash": self.preview_hash, "total": len(result), "valid": sum(not x["errors"] for x in result), "rows": result}

    def execute_upload(self, expected_hash, on_row):
        if not self.preview_hash or expected_hash != self.preview_hash:
            raise ValueError("Validated workbook hash does not match")
        if expected_hash in self.consumed:
            raise ValueError("Batch already attempted. Reconcile portal results before retrying")
        if any(row["_validation_error"] for row in self.rows):
            raise ValueError("Correct all validation errors before submission")
        d = self.connect()
        self.bot.require_upload_login()
        self.consumed.add(expected_hash)
        results = []
        for row in self.rows:
            result = {"row": row["_excel_row"], "status": "VALIDATION_PASSED", "error": "", "fingerprint": row["_fingerprint"]}
            results.append(result)
            submitted = False
            try:
                self.bot.upload_check_session(d)
                if self.mode == "pwp":
                    self.bot.upload_fill_row(d, row)
                    result["status"] = "FORM_FILLED"
                    for button in ("Preview", "Submit"):
                        self.bot.upload_wait_for_form(d, f"Before {button}", require_form=button == "Preview")
                        locator = (self.bot.By.XPATH, f"//button[normalize-space(.)='{button}']")
                        element = self.bot.WebDriverWait(d, self.bot.UPLOAD_FORM_WAIT_SECONDS).until(self.bot.EC.element_to_be_clickable(locator))
                        if button == "Submit":
                            submitted = True  # treat transport loss during click as uncertain
                            result["status"] = "SUBMIT_CLICKED"
                        element.click()
                        time.sleep(self.bot.UPLOAD_BUTTON_DELAY)
                        self.bot.upload_check_session(d)
                        self.bot.upload_check_portal_errors(d, f"After {button}")
                    self.bot.upload_wait_for_form(d, "After Submit", require_form=False)
                    result["status"] = "AWAITING_VERIFICATION"
                elif self.mode == "pibo":
                    self.bot.pibo_fill_row(d, row)
                    result["status"] = "FORM_FILLED"
                    self.bot.pibo_click_button(d, "Preview", "Preview failed")
                    submitted = True
                    result["status"] = "SUBMIT_CLICKED"
                    self.bot.pibo_click_button(d, "Submit", "Submit failed")
                    result["status"] = "AWAITING_VERIFICATION"
                else:
                    self.bot.SALES_CURRENT_RESULT = result
                    self.bot.SALES_EXPORT = self.mode == "sales_export"
                    self.bot.sales_fill_row(d, row)
                    submitted = True
                    result["status"] = "INVOICE_GENERATE_CLICKED"
                    self.bot.sales_click_button(d, "Generate EPR Invoice Number", "Invoice generation failed")
                    result["status"] = "INVOICE_GENERATED_SUBMIT_DISABLED"
                on_row(result.copy())
            except Exception:
                result["status"] = "AWAITING_VERIFICATION" if submitted else "FAILED"
                result["error"] = "Portal response requires manual verification" if submitted else "Portal filling failed; inspect current page and sanitized logs"
                on_row(result.copy())
                if submitted:  # stop rather than risking duplicates after uncertain submission
                    break
        attempted = {r["row"] for r in results}
        results.extend({"row": r["_excel_row"], "status": "NOT_ATTEMPTED", "error": "Stopped after uncertain portal outcome", "fingerprint": r["_fingerprint"]} for r in self.rows if r["_excel_row"] not in attempted)
        report = self.work / "output" / "Upload_Results.xlsx"
        report.parent.mkdir(exist_ok=True)
        by_row = {r["_excel_row"]: r for r in self.rows}
        failed = [(by_row[r["row"]], r["error"] or r["status"]) for r in results if r["status"] != "PORTAL_VERIFIED"]
        source_export = {"pwp": self.bot.upload_save_failures, "pibo": self.bot.pibo_save_failures,
                         "sales": self.bot.sales_save_failures, "sales_export": self.bot.sales_save_failures}[self.mode]
        if failed:
            source_export(failed, self.rows)
        with pd.ExcelWriter(report, engine="openpyxl") as writer:
            pd.DataFrame(results).to_excel(writer, index=False, sheet_name="Upload Results")
            pd.DataFrame([{**row["_original"], "Excel Row": row["_excel_row"], "Failure / Verification Reason": reason} for row, reason in failed]).to_excel(writer, index=False, sheet_name="Failed or Unverified Entries")
            for sheet in writer.book.worksheets:
                sheet.freeze_panes = "A2"
                for cells in sheet:
                    for cell in cells:
                        if isinstance(cell.value, str):
                            cell.data_type = 's'
        return results, report

    @staticmethod
    def identity(record):
        # Exclude serial/action presentation columns; remaining visible values must
        # uniquely match a fetched snapshot. Ambiguous identical rows are rejected.
        values = {k: v for k, v in record.items() if not re.search(r"sl\.?|s\.?no|sr\.?|action", k, re.I)}
        return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()

    def fetch_deletions(self, year):
        if not re.fullmatch(r"20\d{2}", str(year)):
            raise ValueError("Select a four-digit production year")
        d = self.connect()
        self.bot.delete_open(d, year)
        records = {}
        for _ in range(500):
            table, entries = self.bot.delete_all_snapshot(d)
            if not entries and not re.search(r"no\s+(data|records?)", table.text, re.I):
                raise ValueError("Portal table did not explicitly report no data; cannot assume absence")
            for _, buttons, record in entries:
                key = self.identity(record)
                if key in records and records[key] != record:
                    raise ValueError("Ambiguous portal row identity; cannot safely delete")
                records[key] = record
            if self.bot.delete_scroll_more(d):
                continue
            nxt = self.bot.delete_next(d)
            if nxt is None:
                break
            before = table.get_attribute('innerHTML')
            nxt.click()
            self.bot.WebDriverWait(d, self.bot.DELETE_WAIT).until(lambda x: self.bot.delete_table(x).get_attribute('innerHTML') != before)
        else:
            raise ValueError("Deletion fetch pagination limit exceeded")
        self.snapshot = {"year": str(year), "records": records}
        digest = hashlib.sha256(json.dumps(self.snapshot, sort_keys=True).encode()).hexdigest()
        self.snapshot["hash"] = digest
        return {"year": str(year), "hash": digest, "records": [{"id": k, "values": v} for k, v in records.items()]}

    def execute_deletions(self, ids, snapshot_hash):
        if snapshot_hash != self.snapshot.get("hash") or not ids or len(ids) != len(set(ids)) or any(k not in self.snapshot["records"] for k in ids):
            raise ValueError("Approved deletion snapshot does not match")
        d = self.connect()
        approved_snapshot = self.snapshot.copy()
        results = []
        for key in ids:
            if key in self.delete_attempted:
                raise ValueError("Previously attempted record requires manual verification; automatic retry blocked")
            record = self.snapshot["records"][key]
            self.bot.delete_open(d, self.snapshot["year"])
            found = None
            for _ in range(500):
                table, entries = self.bot.delete_all_snapshot(d)
                matches = [(row, buttons, r) for row, buttons, r in entries if self.identity(r) == key]
                if len(matches) > 1:
                    raise ValueError("Multiple matching rows; deletion blocked")
                if matches:
                    found = matches[0]
                    break
                if self.bot.delete_scroll_more(d):
                    continue
                nxt = self.bot.delete_next(d)
                if nxt is None:
                    break
                nxt.click()
                time.sleep(.3)
            if not found:
                results.append({"id": key, "status": "MANUAL_VERIFICATION", "reason": "Approved row no longer found"})
                break
            row, buttons, current = found
            if len(buttons) != 1 or not buttons[0].is_enabled():
                raise ValueError("Ambiguous or disabled delete control")
            self.bot.delete_portal_errors(d)
            self.delete_attempted.add(key)
            d.execute_script("arguments[0].scrollIntoView({block:'center'});", buttons[0])
            buttons[0].click()
            alert = self.bot.WebDriverWait(d, self.bot.DELETE_WAIT).until(self.bot.EC.alert_is_present())
            if "are you sure you want to delete this production entry" not in alert.text.casefold():
                alert.dismiss()
                raise ValueError("Unexpected portal dialog. Batch stopped")
            alert.accept()
            errors = self.bot.delete_wait_one_second(d)
            if errors:
                results.append({"id": key, "status": "MANUAL_VERIFICATION", "reason": "Portal returned an error after delete request"})
                break
            # Re-fetch every page to verify absence; failure is uncertain, never success.
            try:
                after = self.fetch_deletions(approved_snapshot["year"])
                absent = not any(r["id"] == key for r in after["records"])
                results.append({"id": key, "status": "PORTAL_ABSENCE_VERIFIED" if absent else "MANUAL_VERIFICATION", "reason": "Approved fingerprint absent in re-fetched portal records" if absent else "Record still appears in portal"})
                if not absent:
                    break
            except Exception:
                results.append({"id": key, "status": "MANUAL_VERIFICATION", "reason": "Delete requested; post-delete fetch could not verify absence"})
                break
            finally:
                self.snapshot = approved_snapshot
        return results
