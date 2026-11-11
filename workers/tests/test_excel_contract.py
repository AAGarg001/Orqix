"""Offline contracts for the original extraction transformations; no portal login."""
import importlib.util
from pathlib import Path
import pandas as pd
import pytest
from openpyxl import load_workbook

SOURCE = Path(__file__).resolve().parents[2] / "commonportalscraper separate Available.py"
spec = importlib.util.spec_from_file_location("scraper_contract", SOURCE)
scraper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper)

def test_entity_columns_stay_last_without_duplicates():
    source = pd.DataFrame([{"Entity Name": "wrong", "Quantity": 12}])
    result = scraper.add_entity_metadata(source, {"Entity Name": "Acme", "Unit Type": "PIBO", "Unit": "Delhi"})
    assert list(result.columns) == ["Quantity", "Entity Name", "Unit Type", "Unit"]
    assert result.iloc[0].to_dict() == {"Quantity": 12, "Entity Name": "Acme", "Unit Type": "PIBO", "Unit": "Delhi"}

def test_procurement_merge_keeps_all_source_columns():
    result = scraper.merge_procurement_frames([pd.DataFrame([{"GST": "001", "Quantity": 2}]), pd.DataFrame([{"Quantity": 3, "Invoice": "INV-4"}])])
    assert list(result.columns) == ["GST", "Quantity", "Invoice"]
    assert len(result) == 2
    assert result.iloc[0]["GST"] == "001"
    assert result["Quantity"].sum() == 5

def test_excel_sheets_replace_and_keep_formatting(tmp_path):
    scraper.OUTPUT_DIR = tmp_path
    scraper.current_output_workbook = None
    output = scraper.create_output_workbook()
    scraper.append_sheet(output, "Available", pd.DataFrame([{"Certificate ID": "0001", "Value(MT)": 5.25}]))
    scraper.append_sheet(output, "Available", pd.DataFrame([{"Certificate ID": "0002", "Value(MT)": 7.5}]))
    book = load_workbook(output)
    assert book.sheetnames == ["Errors and Skipped", "Available"]
    assert book["Available"].max_row == 2
    assert book["Available"]["A2"].value == "0002"
    assert book["Available"]["B2"].value == 7.5
    assert book["Available"].freeze_panes == "A2"
    assert book["Available"].auto_filter.ref == "A1:B2"
    book.close()

class FakeDriver:
    current_url = scraper.WALLET_URL
    def set_script_timeout(self, _):
        pass
    def execute_script(self, _):
        return "complete"

def prepare_available(monkeypatch, pages):
    monkeypatch.setattr(scraper, "detect_logged_in_application_id", lambda _: "test-application")
    monkeypatch.setattr(scraper, "available_api_post", lambda _, payload: pages[payload["page"] - 1])
    monkeypatch.setattr(scraper, "log", lambda *_: None)

def test_available_collects_server_capped_pages_and_preserves_identifiers(monkeypatch):
    prepare_available(monkeypatch, [
        {"items": [{"certUid": "001", "amount": 1}, {"certUid": "002", "amount": 2}], "total": 3},
        {"items": [{"certUid": "003", "amount": 3}], "total": 3},
    ])
    result = scraper.extract_available_api(FakeDriver(), {"Entity Name": "Test entity"})
    assert result["Certificate ID"].tolist() == ["001", "002", "003"]
    assert result["Value(MT)"].sum() == 6
    assert list(result.columns)[-3:] == ["Entity Name", "Unit Type", "Unit"]

def test_available_rejects_repeated_pages(monkeypatch):
    page = {"items": [{"certUid": "001"}], "total": 3}
    prepare_available(monkeypatch, [page, page])
    with pytest.raises(RuntimeError, match="repeated an earlier page"):
        scraper.extract_available_api(FakeDriver(), {})

def test_available_rejects_incomplete_totals(monkeypatch):
    prepare_available(monkeypatch, [{"items": [{"certUid": "001"}], "total": 3}, {"items": [], "total": 3}])
    with pytest.raises(RuntimeError, match="only 1 of 3"):
        scraper.extract_available_api(FakeDriver(), {})

def test_excel_title_is_sanitized(tmp_path):
    scraper.OUTPUT_DIR = tmp_path
    scraper.current_output_workbook = None
    output = scraper.create_output_workbook()
    scraper.append_sheet(output, "Invalid/Title:With*Characters?" * 3, pd.DataFrame([{"a": 1}]))
    book = load_workbook(output)
    title = book.sheetnames[-1]
    assert len(title) <= 31
    assert not any(c in title for c in r'\/*?:[]')
    book.close()


def test_final_excel_order_and_removed_diagnostic_sheets(tmp_path):
    scraper.OUTPUT_DIR = tmp_path
    scraper.current_output_workbook = None
    output = scraper.create_output_workbook()
    for name in ["Available", "Generated", "Filing", "Run Summary", "Module Status Summary", "Record Counts"]:
        scraper.append_sheet(output, name, pd.DataFrame([{"Value": 1}]))
    scraper.finalize_output_workbook(output)
    book = load_workbook(output)
    assert book.sheetnames == ["Errors and Skipped", "Generated", "Available", "Filing"]
    book.close()
