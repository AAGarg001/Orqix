from __future__ import annotations

import json
import queue
import re
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk

import pandas as pd
from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


LOGIN_URL = "https://epr.cpcb.gov.in/login"
WALLET_URL = "https://epr.cpcb.gov.in/onboarding/wallet"
PROCUREMENT_URL = "https://epr.cpcb.gov.in/onboarding/material-procurement-details"
USER_ID_XPATH = "//*[@placeholder='Enter CEPR User ID']"
PASSWORD_XPATH = "//*[@placeholder='Password']"
ENTITY_TYPE_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-onboard-dashboard/div/div[3]/div/h2/span/b"
ENTITY_NAME_XPATH = "/html/body/app-root/app-dashboard/div/div[1]/app-dashboard-topbar/div/div[2]/div[1]/h2"
UNIT_XPATH = "/html/body/app-root/app-dashboard/div/div[1]/app-dashboard-topbar/div/div[2]/div[2]/h4"
TAB_NAMES = (
    "Credit/Debit Transactions",
    "Certificate Generations",
    "Transferred",
    "Generated",
    "Certificate Expiry Details",
    "Filing",
)
WALLET_TABS_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-wallet-details/div[3]/div[3]/div[2]"
WALLET_PAGE_SUMMARY_XPATH = "//*[@class='ag-paging-row-summary-panel']"
WALLET_NEXT_BUTTON_XPATH = "//*[@class='ag-icon ag-icon-next']"
WALLET_PAGE_SIZE_FIELD_XPATH = "//*[@role='combobox' and @aria-label='Page Size']"
WALLET_SCROLLBAR_XPATH = "//*[@class='ag-body-vertical-scroll-viewport']"
WALLET_HORIZONTAL_SCROLLBAR_XPATH = "//*[@class='ag-body-horizontal-scroll-viewport']"
AVAILABLE_API_URL = "https://epr.cpcb.gov.in/cpcbwallet/api/v1/certificate/available"
AVAILABLE_API_LIMIT = 100
OUTPUT_DIR = Path(__file__).resolve().parent / "scraped_data"
COOKIE_FILE = Path(__file__).resolve().parent / "cpcb_cookies.json"
DOWNLOAD_DIR = OUTPUT_DIR / "procurement_downloads"
CHROME_PROFILE_DIR = Path(__file__).resolve().parent / "selenium_chrome_profile"
CHROME_DEBUG_ADDRESS = "127.0.0.1:9223"
PAGE_LOAD_TIMEOUT = 120
DOWNLOAD_TIMEOUT = 600
PROCUREMENT_REGISTERED_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[2]/div/button"
PROCUREMENT_UNREGISTERED_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[3]/div/button"
PROCUREMENT_REGISTERED_COUNT_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[2]/div/*[self::button or self::span]"
PROCUREMENT_UNREGISTERED_COUNT_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[4]/div/app-table/div/div/table/tbody/tr[5]/td[3]/div/*[self::button or self::span]"
PROCUREMENT_DOWNLOAD_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[5]/button"
PROCUREMENT_SUMMARY_DOWNLOAD_XPATH = "/html/body/app-root/app-dashboard/div/div[2]/div[2]/app-material-procurement-details/div/div[2]/div[2]/div[3]/button"

BG = "#F4F7FB"
CARD = "#FFFFFF"
NAVY = "#183B64"
BLUE = "#2563EB"
TEXT = "#172033"
MUTED = "#64748B"

driver = None
current_output_workbook = None
driver_lock = threading.Lock()
events = queue.Queue()
busy = False
root = None
user_entry = None
password_entry = None
login_button = None
scrape_button = None
available_button = None
spinner = None
status_label = None
log_box = None


def log(message, kind="info"):
    print(message, flush=True)
    events.put(("log", message, kind))


def browser(allow_new=True):
    global driver
    if driver is not None:
        try:
            _ = driver.current_url
            return driver
        except Exception:
            driver = None

    # Reattach after a notebook/kernel or app restart when Chrome was originally
    # launched by this scraper with its remote-debugging port.
    attach_options = webdriver.ChromeOptions()
    attach_options.debugger_address = CHROME_DEBUG_ADDRESS
    try:
        driver = webdriver.Chrome(options=attach_options)
        log("Reconnected to the existing Common Portal Chrome session.")
        return driver
    except WebDriverException:
        if not allow_new:
            raise RuntimeError(
                "No reusable Selenium Chrome session was found. Run the login cell/button "
                "once; extraction cells will never open a new browser."
            )

    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument(f"--user-data-dir={CHROME_PROFILE_DIR.resolve()}")
    options.add_argument("--remote-debugging-port=9223")
    options.add_experimental_option("detach", True)
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    options.add_experimental_option(
        "prefs",
        {
            "download.default_directory": str(DOWNLOAD_DIR.resolve()),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
        },
    )
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


def get_text(active_driver, xpath):
    try:
        return WebDriverWait(active_driver, 8).until(
            EC.presence_of_element_located((By.XPATH, xpath))
        ).text.strip()
    except TimeoutException:
        return ""


def extract_entity_metadata(active_driver):
    """Read entity details before leaving the dashboard for the scrape sections."""
    entity = {
        "Entity Name": get_text(active_driver, ENTITY_NAME_XPATH),
        "Unit Type": get_text(active_driver, ENTITY_TYPE_XPATH),
        "Unit": get_text(active_driver, UNIT_XPATH),
    }
    if not any(entity.values()):
        raise RuntimeError(
            "Could not read Entity Name, Unit Type, and Unit. Return to the dashboard "
            "after OTP login, then click Scrape All."
        )
    log("Entity details captured. Starting Procurement and remaining extracts.", "info")
    return entity


def add_entity_metadata(frame, entity):
    """Keep Entity Name, Unit Type, and Unit as the final three sheet columns."""
    normalized_entity = {
        "Entity Name": entity.get("Entity Name", ""),
        "Unit Type": entity.get("Unit Type", entity.get("Entity Type", "")),
        "Unit": entity.get("Unit", ""),
    }
    entity_columns = list(normalized_entity)
    frame = frame.drop(columns=entity_columns, errors="ignore").copy()
    for column, value in normalized_entity.items():
        frame[column] = value
    return frame


def save_cookies(active_driver):
    COOKIE_FILE.write_text(
        json.dumps(active_driver.get_cookies(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"Login cookies saved: {COOKIE_FILE.name}")


def grid_headers(active_driver):
    candidates = active_driver.find_elements(
        By.CSS_SELECTOR,
        ".ag-header-row-column [role='columnheader'] .ag-header-cell-text, "
        ".ag-header-row-column .ag-header-cell-text",
    )
    return [item.text.strip() for item in candidates if item.text.strip()]


def wallet_page_rows(active_driver, expected_rows):
    """Scan the active AG Grid horizontally and vertically without losing columns."""
    summary = visible_wallet_element(active_driver, WALLET_PAGE_SUMMARY_XPATH)
    grid_root = summary.find_element(
        By.XPATH,
        "ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ag-root-wrapper ')][1]",
    )
    active_driver.set_script_timeout(180)
    result = active_driver.execute_async_script(
        """
        const grid = arguments[0], done = arguments[1];
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const horizontal = grid.querySelector('.ag-body-horizontal-scroll-viewport');
        const vertical = grid.querySelector('.ag-body-vertical-scroll-viewport');
        const rows = new Map();
        const headers = new Map();
        let discoveryOrder = 0;

        const cellValue = cell => {
          const input = cell.querySelector('input, textarea, select');
          return (input ? input.value : cell.innerText || '').trim();
        };
        const columnKey = element => {
          const colId = element.getAttribute('col-id');
          const aria = element.getAttribute('aria-colindex');
          return colId || (aria ? `__aria_${aria}` : null);
        };
        const columnOrder = element => {
          const aria = Number(element.getAttribute('aria-colindex'));
          return Number.isFinite(aria) && aria > 0 ? aria : 100000 + discoveryOrder++;
        };
        const capture = () => {
          grid.querySelectorAll(
            '.ag-header-cell[col-id], [role="columnheader"][col-id], '
            + '.ag-header-cell[aria-colindex], [role="columnheader"][aria-colindex]'
          ).forEach(header => {
            const key = columnKey(header);
            if (!key) return;
            const label = (
              header.querySelector('.ag-header-cell-text')?.innerText
              || header.getAttribute('aria-label') || key
            ).trim();
            const order = columnOrder(header);
            const existing = headers.get(key);
            if (!existing || order < existing.order) headers.set(key, {key, label, order});
          });

          grid.querySelectorAll(
            '.ag-center-cols-container .ag-row, .ag-pinned-left-cols-container .ag-row, '
            + '.ag-pinned-right-cols-container .ag-row'
          ).forEach(row => {
            const index = row.getAttribute('row-index') || row.getAttribute('aria-rowindex');
            if (index === null) return;
            const stored = rows.get(index) || {};
            row.querySelectorAll(
              '.ag-cell[col-id], [role="gridcell"][col-id], '
              + '.ag-cell[aria-colindex], [role="gridcell"][aria-colindex]'
            ).forEach(cell => {
              const key = columnKey(cell);
              if (!key) return;
              const value = cellValue(cell);
              if (value || !(key in stored)) stored[key] = value;
            });
            rows.set(index, stored);
          });
        };
        const scroll = (element, property, value) => {
          if (!element) return;
          element[property] = value;
          element.dispatchEvent(new Event('scroll', {bubbles: true}));
        };
        const settleAndCapture = async () => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await pause(220);
          capture();
        };
        const positions = (maximum, step) => {
          if (maximum <= 0) return [0];
          const output = [0];
          for (let value = step; value < maximum; value += step) output.push(value);
          output.push(maximum);
          return [...new Set(output)];
        };

        (async () => {
          const horizontalMaximum = horizontal
            ? Math.max(0, horizontal.scrollWidth - horizontal.clientWidth) : 0;
          const verticalMaximum = vertical
            ? Math.max(0, vertical.scrollHeight - vertical.clientHeight) : 0;
          const horizontalStep = horizontal
            ? Math.max(120, Math.floor(horizontal.clientWidth * 0.70)) : 1;
          const verticalStep = vertical
            ? Math.max(100, Math.floor(vertical.clientHeight * 0.70)) : 1;
          const horizontalPositions = positions(horizontalMaximum, horizontalStep);
          const verticalPositions = positions(verticalMaximum, verticalStep);

          // At every vertical position, sweep all horizontal positions first.
          // This captures AG Grid's virtualized off-screen columns for each row.
          for (const top of verticalPositions) {
            scroll(vertical, 'scrollTop', top);
            await settleAndCapture();
            for (const left of horizontalPositions) {
              scroll(horizontal, 'scrollLeft', left);
              await settleAndCapture();
            }
          }
          scroll(horizontal, 'scrollLeft', 0);
          scroll(vertical, 'scrollTop', 0);
          await settleAndCapture();

          const orderedHeaders = [...headers.values()].sort((a, b) => a.order - b.order);
          const orderedRows = [...rows.entries()].sort((a, b) => {
            const left = Number(a[0]), right = Number(b[0]);
            return Number.isFinite(left) && Number.isFinite(right) ? left - right : String(a[0]).localeCompare(String(b[0]));
          });
          done({
            headers: orderedHeaders,
            rows: orderedRows,
            horizontalMaximum,
            verticalMaximum,
          });
        })().catch(error => done({error: String(error)}));
        """,
        grid_root,
    )
    if result.get("error"):
        raise RuntimeError(f"Wallet two-dimensional grid collection failed: {result['error']}")

    headers = result.get("headers", [])
    column_ids = [item["key"] for item in headers]
    column_names = [item["label"] or item["key"] for item in headers]
    rows = [
        [str(values.get(column_id, "")).strip() for column_id in column_ids]
        for _, values in result.get("rows", [])
    ]
    if not column_names:
        raise RuntimeError("Wallet grid is visible but no column headers could be read.")
    if len(rows) != expected_rows:
        raise RuntimeError(
            f"Wallet grid rendered {len(rows)} of {expected_rows} expected rows "
            "after horizontal and vertical scanning."
        )
    log(
        f"Wallet grid scanned horizontally to {result.get('horizontalMaximum', 0)}px "
        f"and vertically to {result.get('verticalMaximum', 0)}px; "
        f"{len(column_names)} columns and {len(rows)} rows extracted."
    )
    return column_names, rows


def wallet_rendered_signature(active_driver):
    """Identify the currently rendered Wallet rows without scrolling the grid."""
    for viewport in active_driver.find_elements(By.CSS_SELECTOR, ".ag-center-cols-viewport"):
        if not viewport.is_displayed():
            continue
        try:
            container = viewport.find_element(By.CSS_SELECTOR, ".ag-center-cols-container")
            return tuple(
                (
                    row.get_attribute("row-index") or row.get_attribute("aria-rowindex"),
                    tuple(cell.text.strip() for cell in row.find_elements(By.CSS_SELECTOR, "[role='gridcell'], .ag-cell")),
                )
                for row in container.find_elements(By.CSS_SELECTOR, "[role='row'], .ag-row")
            )
        except StaleElementReferenceException:
            return ()
    return ()


def visible_wallet_element(active_driver, xpath, timeout=20):
    """Return the visible Wallet control when inactive tab controls remain in the DOM."""
    def find_visible(current_driver):
        for element in current_driver.find_elements(By.XPATH, xpath):
            if element.is_displayed():
                return element
        return False

    return WebDriverWait(active_driver, timeout).until(find_visible)


def visible_wallet_tab(active_driver, tab_name, timeout=30):
    """Find a visible Wallet tab by text without relying on brittle child positions."""
    def find_tab(current_driver):
        try:
            return current_driver.execute_script(
                """
                const wanted = arguments[0].replace(/\\s+/g, ' ').trim();
                const roots = [...document.querySelectorAll('app-wallet-details')]
                  .filter(root => {
                    const style = getComputedStyle(root);
                    const box = root.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden'
                      && box.width > 0 && box.height > 0;
                  });
                for (const root of roots) {
                  const candidates = root.querySelectorAll(
                    '.certificate-tab, [role="tab"], button, a'
                  );
                  for (const candidate of candidates) {
                    const text = (candidate.innerText || candidate.textContent || '')
                      .replace(/\\s+/g, ' ').trim();
                    const style = getComputedStyle(candidate);
                    const box = candidate.getBoundingClientRect();
                    if (text === wanted && style.display !== 'none'
                        && style.visibility !== 'hidden' && box.width > 0 && box.height > 0) {
                      return candidate.closest('.certificate-tab, [role="tab"], button, a')
                        || candidate;
                    }
                  }
                }
                return null;
                """,
                tab_name,
            ) or False
        except StaleElementReferenceException:
            return False

    return WebDriverWait(active_driver, timeout, poll_frequency=0.25).until(find_tab)


def activate_wallet_tab(active_driver, tab_name):
    """Click the current tab element and wait for its visible grid pager to load."""
    try:
        before_signature = wallet_rendered_signature(active_driver)
    except Exception:
        before_signature = ()
    tab = visible_wallet_tab(active_driver, tab_name)
    active_driver.execute_script(
        "arguments[0].scrollIntoView({block:'nearest', inline:'nearest'}); arguments[0].click();",
        tab,
    )
    state = {"value": None, "stable": 0}

    def tab_grid_stable(current_driver):
        try:
            current_tab = visible_wallet_tab(current_driver, tab_name, timeout=2)
            selected = current_driver.execute_script(
                """
                let node = arguments[0];
                for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
                  const classes = String(node.className || '').toLowerCase();
                  if (classes.includes('active') || classes.includes('selected')
                      || node.getAttribute('aria-selected') === 'true') return true;
                }
                return false;
                """,
                current_tab,
            )
            paging, summary = wallet_page_summary(current_driver)
            signature = wallet_rendered_signature(current_driver)
            changed = signature != before_signature
            value = (paging, summary, signature)
            if (selected or changed):
                state["stable"] = state["stable"] + 1 if value == state["value"] else 0
                state["value"] = value
            else:
                state["value"], state["stable"] = None, 0
            return state["stable"] >= 2
        except (TimeoutException, StaleElementReferenceException):
            return False

    WebDriverWait(active_driver, 30, poll_frequency=0.5).until(tab_grid_stable)
    return wallet_page_summary(active_driver)


def wallet_page_summary(active_driver):
    """Return the Wallet grid's numeric paging summary after any async reload finishes."""
    def numeric_summary(current_driver):
        try:
            summary = visible_wallet_element(current_driver, WALLET_PAGE_SUMMARY_XPATH, timeout=1).text.strip()
            match = re.search(r"([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)", summary)
            if not match:
                # Page-size changes briefly show values such as "1 to ? of more".
                return False
            start, end, total = (int(value.replace(",", "")) for value in match.groups())
            return (start, end, total), summary
        except TimeoutException:
            return False

    return WebDriverWait(active_driver, 30, poll_frequency=0.25).until(numeric_summary)


def wallet_next_button(active_driver):
    """Find the Next icon in the same visible pagination panel as the active grid summary."""
    summary = visible_wallet_element(active_driver, WALLET_PAGE_SUMMARY_XPATH)
    panel = summary.find_element(By.XPATH, "ancestor::*[contains(@class, 'ag-paging-panel')][1]")
    return panel.find_element(By.XPATH, ".//*[@class='ag-icon ag-icon-next']")


def set_wallet_page_size_to_last_option(active_driver):
    """Select 100 through the control's change event, exactly as a manual selection does."""
    summary = visible_wallet_element(active_driver, WALLET_PAGE_SUMMARY_XPATH)
    (start, end, total), _ = wallet_page_summary(active_driver)
    panel = summary.find_element(By.XPATH, "ancestor::*[contains(@class, 'ag-paging-panel')][1]")
    page_size_field = panel.find_element(By.XPATH, f".{WALLET_PAGE_SIZE_FIELD_XPATH}")
    if page_size_field.tag_name.lower() == "select":
        # Native selects draw a browser popup which disappears when DevTools gets
        # focus. Select() changes the actual selected option and fires `change`.
        Select(page_size_field).select_by_visible_text("100")
    else:
        # For a custom combobox, keep keyboard focus on it, choose item 4
        # (10, 25, 50, 100), then commit with Enter. No popup inspection needed.
        ActionChains(active_driver).move_to_element(page_size_field).click().send_keys(
            Keys.HOME, Keys.ARROW_DOWN, Keys.ARROW_DOWN, Keys.ARROW_DOWN, Keys.ENTER
        ).perform()
    # Let the grid finish its reload (it temporarily shows "1 to ? of more"),
    # then read the final numeric summary before extracting any rows.
    time.sleep(2)
    (new_start, new_end, new_total), loaded_summary = wallet_page_summary(active_driver)
    expected_end = min(new_start + 99, new_total)
    if new_end != expected_end:
        raise RuntimeError(
            f"Wallet page size did not change to 100. Current summary: {loaded_summary!r}"
        )
    log(f"Wallet page size set to 100. Loaded summary: {loaded_summary}")


def extract_wallet_tab(active_driver):
    """Extract every page of the active Wallet tab using its initial paging summary."""
    (start, end, total), _ = wallet_page_summary(active_driver)
    if total == 0:
        return ["Status"], [["No Data Found"]]

    set_wallet_page_size_to_last_option(active_driver)
    (start, end, total), summary = wallet_page_summary(active_driver)
    log(f"Wallet extraction summary after page-size selection: {summary}")
    page_size = end - start + 1
    page_count = (total + page_size - 1) // page_size
    headers = []
    all_rows = []

    for page_number in range(1, page_count + 1):
        expected_rows = min(page_size, total - ((page_number - 1) * page_size))
        page_headers, rows = wallet_page_rows(active_driver, expected_rows)
        if not headers:
            headers = page_headers
        elif page_headers != headers:
            raise RuntimeError("Wallet column structure changed between pages.")
        all_rows.extend(rows)
        log(f"Page {page_number}: {len(rows)}/{expected_rows} rows extracted")
        if len(rows) != expected_rows:
            raise RuntimeError(
                f"Wallet page {page_number} rendered {len(rows)} of {expected_rows} expected rows."
            )
        if page_number == page_count:
            break

        (before_start, _, _), before_summary = wallet_page_summary(active_driver)
        before_signature = wallet_rendered_signature(active_driver)
        next_button = wallet_next_button(active_driver)
        active_driver.execute_script(
            "(arguments[0].closest('button, [role=button], .ag-paging-button') || arguments[0]).click();",
            next_button,
        )
        WebDriverWait(active_driver, 15).until(
            lambda current: wallet_page_summary(current)[0][0] > before_start
            and wallet_page_summary(current)[1] != before_summary
        )
        # A changed pager is not sufficient: wait until the grid itself has replaced
        # the previous page's rendered rows before reading the next page.
        WebDriverWait(active_driver, 20).until(
            lambda current: wallet_rendered_signature(current) != before_signature
        )
        time.sleep(0.3)

    return headers, all_rows


def restore_wallet_unit_after_refresh(active_driver):
    """Re-select the first visible unit after an authentication refresh."""
    select_unit = WebDriverWait(active_driver, 60).until(
        EC.element_to_be_clickable((By.XPATH, '//*[@title="Select Unit"]'))
    )
    active_driver.execute_script("arguments[0].click();", select_unit)

    def first_visible_unit(current_driver):
        for card in current_driver.find_elements(By.XPATH, '//*[@class="unit-card"]'):
            if card.is_displayed() and card.is_enabled():
                return card
        return False

    unit_card = WebDriverWait(active_driver, 60).until(first_visible_unit)
    active_driver.execute_script("arguments[0].click();", unit_card)
    time.sleep(3)
    active_driver.get(WALLET_URL)
    WebDriverWait(active_driver, 60).until(
        lambda current: current.execute_script("return document.readyState") == "complete"
    )
    time.sleep(3)


def available_api_post(active_driver, payload):
    """POST inside Chrome with its cookies and stored Bearer access token."""
    script = r"""
    const [url, payload, done] = arguments;
    const candidates = [];
    const preferredKeys = ['access_token', 'accessToken', 'token', 'authToken', 'jwt'];
    function inspectValue(key, value) {
      if (!value || /refresh/i.test(key)) return;
      let text = String(value).replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
      if (text.split('.').length === 3) candidates.push({key, token: text});
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          for (const [childKey, childValue] of Object.entries(parsed)) {
            if (typeof childValue === 'string') inspectValue(childKey, childValue);
          }
        }
      } catch (_) {}
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        inspectValue(key, storage.getItem(key));
      }
    }
    const priority = item => { const index = preferredKeys.indexOf(item.key); return index < 0 ? 999 : index; };
    candidates.sort((a, b) => priority(a) - priority(b));
    const capturedAuth = window.__cpcbAvailableCapture?.authorization || '';
    const accessToken = capturedAuth.replace(/^Bearer\s+/i, '') || (candidates.length ? candidates[0].token : null);
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json'
    };
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(payload)
    })
    .then(async response => {
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch (_) { body = {rawText: text}; }
      done({ok: response.ok, status: response.status, body, accessTokenFound: Boolean(accessToken)});
    })
    .catch(error => done({ok: false, status: 0, error: String(error)}));
    """
    for attempt in range(1, 6):
        result = active_driver.execute_async_script(script, AVAILABLE_API_URL, payload)
        if result and result.get("ok"):
            return result["body"]
        status = (result or {}).get("status", 0)
        if status == 401 and attempt < 5:
            log(f"Access token expired on page {payload.get('page')}; refreshing login session...")
            active_driver.refresh()
            WebDriverWait(active_driver, 60).until(
                lambda current: current.execute_script("return document.readyState") == "complete"
            )
            restore_wallet_unit_after_refresh(active_driver)
            fresh_context = capture_available_request_context(active_driver)
            if not fresh_context.get("authorization"):
                raise RuntimeError("Unable to capture a new authorization token for Available certificates after refreshing.")
            log("Fresh login token captured; waiting 5 seconds before retry...")
            time.sleep(5)
            continue
        if status not in (0, 429) and status < 500:
            break
        if attempt < 5:
            delay = min(2 ** attempt, 20)
            log(f"Temporary API error HTTP {status}; retry {attempt}/5 after {delay}s")
            time.sleep(delay)
    detail = (result or {}).get("body") or (result or {}).get("error") or "No response"
    token_note = "access token found" if (result or {}).get("accessTokenFound") else "access token NOT found in browser storage"
    raise RuntimeError(f"Available API failed (HTTP {status}, {token_note}): {detail}")


def capture_available_request_context(active_driver):
    """Capture applicationId/auth from Angular's own Available request."""
    install_script = r"""
    window.__cpcbAvailableCapture = null;
    if (!window.__cpcbCaptureInstalled) {
      window.__cpcbCaptureInstalled = true;
      const remember = (url, body, authorization) => {
        if (!String(url).includes('/certificate/available')) return;
        let payload = body;
        if (typeof body === 'string') { try { payload = JSON.parse(body); } catch (_) {} }
        if (payload && payload.applicationId != null) {
          window.__cpcbAvailableCapture = {
            applicationId: String(payload.applicationId),
            authorization: authorization || ''
          };
        }
      };
      const nativeFetch = window.fetch;
      window.fetch = function(input, init = {}) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        remember(input instanceof Request ? input.url : input, init.body, headers.get('authorization'));
        return nativeFetch.apply(this, arguments);
      };
      const nativeOpen = XMLHttpRequest.prototype.open;
      const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      const nativeSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this.__cpcbUrl = url; this.__cpcbHeaders = {};
        return nativeOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this.__cpcbHeaders[String(name).toLowerCase()] = value;
        return nativeSetHeader.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        remember(this.__cpcbUrl, body, this.__cpcbHeaders?.authorization);
        return nativeSend.apply(this, arguments);
      };
    }
    """
    active_driver.execute_script(install_script)

    def click_wallet_tab(tab_text):
        return active_driver.execute_script(
            r"""
            const wanted = arguments[0].trim().toLowerCase();
            const selectors = 'button, a, [role=tab], .certificate-tab';
            const candidates = [...document.querySelectorAll(selectors)];
            const element = candidates.find(item => item.innerText.trim().toLowerCase() === wanted);
            if (!element) return false;
            element.scrollIntoView({block: 'center'});
            element.click();
            return true;
            """,
            tab_text,
        )

    # Switching away first forces Angular to issue a fresh Available API request.
    for alternate in ("Generated", "Transferred", "Certificate Generations"):
        if click_wallet_tab(alternate):
            time.sleep(1)
            break
    if not click_wallet_tab("Available"):
        raise RuntimeError("The Available tab was not found on the Wallet page.")
    try:
        return WebDriverWait(active_driver, 30, poll_frequency=0.2).until(
            lambda current: current.execute_script(
                r"""
                const capture = window.__cpcbAvailableCapture;
                if (!capture || !capture.authorization) return null;
                try {
                  const token = capture.authorization.replace(/^Bearer\s+/i, '');
                  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
                  const payload = JSON.parse(atob(base64));
                  return payload.exp * 1000 > Date.now() + 60000 ? capture : null;
                } catch (_) { return capture; }
                """
            )
        )
    except TimeoutException as exc:
        raise RuntimeError("The Available tab was clicked, but its API request was not captured.") from exc


def detect_logged_in_application_id(active_driver):
    """Resolve applicationId from this account's browser state; never reuse another ID."""
    script = r"""
    const matches = [];
    const wanted = key => /^(application_?id|applicationId|app_?id)$/i.test(String(key));
    function walk(value, path, depth) {
      if (depth > 8 || value == null) return;
      if (typeof value === 'string') {
        try { walk(JSON.parse(value), path, depth + 1); } catch (_) {}
        const token = value.replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
        if (token.split('.').length === 3) {
          try {
            const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            walk(JSON.parse(atob(base64)), `${path}.jwtPayload`, depth + 1);
          } catch (_) {}
        }
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
        return;
      }
      if (typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (wanted(key) && (typeof child === 'string' || typeof child === 'number')) {
          const id = String(child).trim();
          if (/^\d+$/.test(id)) matches.push({id, path: `${path}.${key}`});
        }
        walk(child, `${path}.${key}`, depth + 1);
      }
    }
    for (const [storageName, storage] of [['localStorage', localStorage], ['sessionStorage', sessionStorage]]) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const value = storage.getItem(key);
        if (wanted(key) && /^\d+$/.test(String(value).trim())) matches.push({id: String(value).trim(), path: `${storageName}.${key}`});
        walk(value, `${storageName}.${key}`, 0);
      }
    }
    for (const part of document.cookie.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      const key = part.slice(0, separator).trim();
      const value = decodeURIComponent(part.slice(separator + 1)).trim();
      if (wanted(key) && /^\d+$/.test(value)) matches.push({id: value, path: `cookie.${key}`});
    }
    const unique = [...new Map(matches.map(item => [item.id, item])).values()];
    return unique;
    """
    candidates = active_driver.execute_script(script) or []
    if not candidates:
        captured = capture_available_request_context(active_driver)
        return captured["applicationId"]
    if len(candidates) > 1:
        locations = ", ".join(item.get("path", "unknown") for item in candidates)
        raise RuntimeError(f"Multiple applicationId values were found ({locations}); extraction was stopped to prevent retrieving data from the wrong account.")
    return candidates[0]["id"]


def find_available_rows(value):
    """Find the record list inside data/content/items/rows/result or a similar wrapper."""
    preferred = ("content", "items", "rows", "records", "results", "list", "data")
    if isinstance(value, list):
        return value if not value or all(isinstance(item, dict) for item in value) else None
    if not isinstance(value, dict):
        return None
    for key in preferred:
        if key in value:
            found = find_available_rows(value[key])
            if found is not None:
                return found
    for child in value.values():
        if isinstance(child, (dict, list)):
            found = find_available_rows(child)
            if found is not None:
                return found
    return None


def find_available_total(value):
    total_keys = ("totalElements", "totalRecords", "totalCount", "total", "count")
    if isinstance(value, dict):
        for key in total_keys:
            candidate = value.get(key)
            if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
                return int(candidate)
        for child in value.values():
            found = find_available_total(child)
            if found is not None:
                return found
    return None


def format_available_datetime(value):
    """Convert an API UTC timestamp to the portal's India-time display format."""
    if pd.isna(value):
        return ""
    timestamp = pd.Timestamp(value).tz_convert("Asia/Kolkata")
    hour = timestamp.hour % 12 or 12
    meridiem = "am" if timestamp.hour < 12 else "pm"
    return f"{timestamp.day:02d} {timestamp:%b %Y}, {hour}:{timestamp:%M:%S} {meridiem}"


def extract_available_api(active_driver, entity):
    """Extract all Available records and return the final workbook-ready frame."""
    if not active_driver.current_url.startswith(WALLET_URL):
        active_driver.get(WALLET_URL)
    WebDriverWait(active_driver, 30).until(
        lambda current: current.execute_script("return document.readyState") == "complete"
    )
    active_driver.set_script_timeout(180)
    application_id = detect_logged_in_application_id(active_driver)
    log(f"Current logged-in applicationId detected: {application_id}")

    all_items = []
    page = 1
    server_page_size = None
    reported_total = None
    seen_page_signatures = set()

    while True:
        payload = {
            "applicationId": application_id,
            "searchText": "",
            "page": page,
            "limit": AVAILABLE_API_LIMIT,
        }
        response_json = available_api_post(active_driver, payload)
        page_rows = find_available_rows(response_json)
        if page_rows is None:
            raise RuntimeError(f"The API response did not contain a list of records. Top-level keys: {list(response_json) if isinstance(response_json, dict) else type(response_json).__name__}")
        if reported_total is None:
            reported_total = find_available_total(response_json)
        if not page_rows:
            break
        page_signature = json.dumps(page_rows, sort_keys=True, default=str)
        if page_signature in seen_page_signatures:
            raise RuntimeError("API repeated an earlier page; stopping to avoid duplicate/infinite pagination.")
        seen_page_signatures.add(page_signature)

        all_items.extend(page_rows)
        server_page_size = server_page_size or len(page_rows)
        log(f"Page {page}: {len(page_rows):,} rows; collected {len(all_items):,}")

        if reported_total is not None and len(all_items) >= reported_total:
            break
        # A short page means the end only when the server honored the requested limit.
        # If it silently caps 100000 to (say) 10/100/1000, keep requesting pages.
        if len(page_rows) < server_page_size:
            break
        page += 1
        if page > 100_000:
            raise RuntimeError("Pagination safety limit exceeded; API may be repeating the same page.")

    if reported_total is not None and len(all_items) < reported_total:
        raise RuntimeError(
            f"Available API returned only {len(all_items)} of {reported_total} records."
        )

    source = pd.json_normalize(all_items, sep=".")
    column_map = {
        "certUid": "Certificate ID",
        "amount": "Value(MT)",
        "ownerName": "Certificate Owner",
        "category": "Category",
        "processingType": "Processing Type",
        "potentialBefore": "Available Potential Prior Generation(MT)",
        "potentialAfter": "Available Potential After Prior Generation(MT)",
        "usedPotentialBefore": "Used Potential Before Generation(Mt)",
        "usedPotentialAfter": "Used Potential After Generation(Mt)",
        "cumulativePotential": "Cumulative Potential(MT)",
        "issueTimestamp": "Generated At",
        "validTill": "Validity",
        "status": "Status",
    }
    frame = source.reindex(columns=list(column_map)).rename(columns=column_map)
    frame.insert(0, "S.No.", range(1, len(frame) + 1))
    for date_column in ("Generated At", "Validity"):
        parsed = pd.to_datetime(frame[date_column], utc=True, errors="coerce")
        frame[date_column] = parsed.map(format_available_datetime)
    return add_entity_metadata(frame, entity)


def set_wallet_expiry_filter(active_driver, filter_value):
    """Select the expiry filter and wait for the refreshed grid to settle."""
    xpath = "//app-wallet-details//select[@placeholder='Expiry Filter']"
    field = visible_wallet_element(active_driver, xpath)
    if Select(field).first_selected_option.get_attribute("value") == filter_value:
        return wallet_page_summary(active_driver)

    Select(field).select_by_value(filter_value)
    # Allow the change event's asynchronous request to start before reading the pager.
    time.sleep(2)
    state = {"value": None, "stable": 0}

    def filter_grid_stable(current_driver):
        try:
            current_field = visible_wallet_element(current_driver, xpath, timeout=1)
            if Select(current_field).first_selected_option.get_attribute("value") != filter_value:
                return False
            paging, summary = wallet_page_summary(current_driver)
            value = (paging, summary, wallet_rendered_signature(current_driver))
            state["stable"] = state["stable"] + 1 if value == state["value"] else 0
            state["value"] = value
            return state["stable"] >= 2
        except (TimeoutException, StaleElementReferenceException):
            return False

    WebDriverWait(active_driver, 30, poll_frequency=0.5).until(filter_grid_stable)
    return wallet_page_summary(active_driver)

def wallet_part(active_driver, output, entity, run_status):
    """Extract Wallet tabs independently so one failed tab does not stop the run."""
    log("Wallet part is extracting...", "info")
    active_driver.get(WALLET_URL)
    try:
        visible_wallet_tab(active_driver, TAB_NAMES[0], timeout=30)
    except TimeoutException as exc:
        raise RuntimeError(
            "The wallet page could not be loaded. Confirm that OTP verification is complete "
            "and the portal session is active."
        ) from exc

    save_cookies(active_driver)
    for tab_name in TAB_NAMES:
        try:
            log(f"Extracting Wallet: {tab_name}")
            _, summary = activate_wallet_tab(active_driver, tab_name)
            log(f"{tab_name} page summary: {summary}")
            if tab_name == "Certificate Expiry Details":
                (start, end, total), summary = set_wallet_expiry_filter(active_driver, "EXPIRED")
                if total == 0:
                    log("EXPIRED has no data; checking EXPIRING_SOON.")
                    (start, end, total), summary = set_wallet_expiry_filter(active_driver, "EXPIRING_SOON")
                log(f"Certificate Expiry Details filtered page summary: {summary}")
                if total == 0:
                    run_status.append((f"Wallet - {tab_name}", "Skipped", "No data in EXPIRED or EXPIRING_SOON"))
                    log("No certificate expiry data in either filter; continuing to Filing.")
                    continue
            headers, rows = extract_wallet_tab(active_driver)
            frame = add_entity_metadata(pd.DataFrame(rows, columns=headers), entity)
            append_sheet(output, tab_name, frame)
            run_status.append((f"Wallet - {tab_name}", "Success", f"{len(frame)} rows"))
        except Exception as exc:
            reason = str(exc) or type(exc).__name__
            run_status.append((f"Wallet - {tab_name}", "Skipped", reason))
            log(f"Wallet - {tab_name} skipped: {reason}", "error")

    log("Wallet part extracted successfully.", "success")


def append_sheet(output, sheet_name, frame):
    """Add or replace one sheet in the workbook created by the wallet part."""
    # Excel forbids these characters in titles and limits titles to 31 characters.
    sheet_name = re.sub(r"[\\/*?:\[\]]", " - ", sheet_name).strip()[:31] or "Sheet"
    with pd.ExcelWriter(
        output, engine="openpyxl", mode="a", if_sheet_exists="replace"
    ) as writer:
        frame.to_excel(writer, sheet_name=sheet_name, index=False)
        worksheet = writer.sheets[sheet_name]
        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = worksheet.dimensions
        for cells in worksheet.columns:
            length = min(max(len(str(cell.value or "")) for cell in cells) + 2, 45)
            worksheet.column_dimensions[cells[0].column_letter].width = length


def finalize_output_workbook(output):
    """Keep only data and the leading error sheet, with Available after Generated."""
    from openpyxl import load_workbook
    book = load_workbook(output)
    try:
        for title in ("Run Summary", "Module Status Summary", "Record Counts"):
            if title in book.sheetnames:
                del book[title]
        if "Errors and Skipped" not in book.sheetnames:
            ws = book.create_sheet("Errors and Skipped")
            ws.append(["Module", "Status", "Reason"])
        ordered = [book["Errors and Skipped"]] + [ws for ws in book.worksheets if ws.title not in ("Errors and Skipped", "Available")]
        if "Available" in book.sheetnames:
            generated = next((i for i, ws in enumerate(ordered) if ws.title == "Generated"), len(ordered) - 1)
            ordered.insert(generated + 1, book["Available"])
        for i, ws in enumerate(ordered):
            book.move_sheet(ws, offset=i-book.worksheets.index(ws))
        book.active = 0
        book.save(output)
    finally:
        book.close()


def create_output_workbook():
    """Reuse this session's CPCB workbook for both extraction buttons."""
    global current_output_workbook
    if current_output_workbook is not None and current_output_workbook.exists():
        return current_output_workbook
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / f"CPCB_Extract_{datetime.now():%Y%m%d_%H%M%S_%f}.xlsx"
    pd.DataFrame(columns=["Module", "Status", "Reason"]).to_excel(
        output, sheet_name="Errors and Skipped", index=False
    )
    current_output_workbook = output
    return output


def click_xpath(active_driver, xpath, timeout=30):
    element = WebDriverWait(active_driver, timeout).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )
    active_driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
    active_driver.execute_script("arguments[0].click();", element)


def parse_procurement_count(text):
    """Convert a stable button/span count such as 24,322.22 or 0 to a number."""
    match = re.search(r"-?[\d,]+(?:\.\d+)?", text)
    if not match:
        raise RuntimeError(f"Could not read Procurement count from {text!r}.")
    return float(match.group().replace(",", ""))


def wait_for_download(before, timeout=DOWNLOAD_TIMEOUT):
    """Wait until one new Excel/CSV file exists and Chrome has finished writing it."""
    deadline = time.time() + timeout
    previous = None
    stable_checks = 0
    while time.time() < deadline:
        # Ignore an old partial file; only newly-created Chrome downloads should
        # hold this wait open.
        partials = [path for path in DOWNLOAD_DIR.glob("*.crdownload") if path not in before]
        candidates = [
            path for path in DOWNLOAD_DIR.iterdir()
            if path.is_file()
            and path not in before
            and path.suffix.lower() in {".xlsx", ".xls", ".csv"}
        ]
        if candidates and not partials:
            newest = max(candidates, key=lambda path: path.stat().st_mtime)
            current = (newest, newest.stat().st_size)
            stable_checks = stable_checks + 1 if current == previous else 0
            previous = current
            if stable_checks >= 2 and current[1] > 0:
                return newest
        time.sleep(0.5)
    raise RuntimeError(f"Procurement download did not finish within {timeout} seconds.")


def wait_for_page_ready(active_driver, timeout=PAGE_LOAD_TIMEOUT):
    """Wait only for browser navigation; portal loader classes are not reliable."""
    WebDriverWait(active_driver, timeout, poll_frequency=0.25).until(
        lambda current: current.execute_script("return document.readyState") == "complete"
    )


def click_procurement_xpath(active_driver, xpath, timeout=PAGE_LOAD_TIMEOUT):
    """Click the current Angular element, retrying only while its DOM node is replaced."""
    def click_current(current):
        try:
            element = current.find_element(By.XPATH, xpath)
            if not element.is_displayed() or not element.is_enabled():
                return False
            current.execute_script(
                "arguments[0].scrollIntoView({block: 'center'}); arguments[0].click();",
                element,
            )
            return True
        except StaleElementReferenceException:
            return False

    WebDriverWait(active_driver, timeout, poll_frequency=0.25).until(click_current)


def configure_procurement_year(active_driver, financial_year):
    """Open Procurement, select an FY, and wait for its async counts to settle."""
    active_driver.get(PROCUREMENT_URL)
    wait_for_page_ready(active_driver)

    def select_fresh(current, index, value):
        try:
            selects = current.find_elements(By.CSS_SELECTOR, "select.filter-select-input")
            if len(selects) <= index:
                return False
            selected = Select(selects[index])
            if selected.first_selected_option.get_attribute("value") != value:
                selected.select_by_value(value)
            return True
        except StaleElementReferenceException:
            return False

    # Angular replaces both selects while their API requests resolve. Never keep
    # a WebElement between polls; locate and operate on the current element only.
    WebDriverWait(active_driver, PAGE_LOAD_TIMEOUT, poll_frequency=0.25).until(
        lambda current: select_fresh(current, 0, "financial_year")
    )
    WebDriverWait(active_driver, PAGE_LOAD_TIMEOUT).until(
        lambda current: len(current.find_elements(By.CSS_SELECTOR, "select.filter-select-input")) >= 2
    )
    WebDriverWait(active_driver, PAGE_LOAD_TIMEOUT, poll_frequency=0.25).until(
        lambda current: select_fresh(current, 1, financial_year)
    )
    wait_for_page_ready(active_driver)

    # Counts/buttons arrive through a separate API call. Ignore blank placeholders
    # and do not accept the table immediately after the FY change: at that moment
    # Angular can still show the preceding/default FY's values.
    state = {"value": None, "stable": 0}
    accept_counts_after = time.monotonic() + 3

    def procurement_counts_stable(current):
        # Resolve XPath and text in one browser-side operation. Angular can replace
        # the nodes at any time without leaving Python with a stale WebElement.
        values = current.execute_script(
            """
            return arguments[0].map(xpath => {
                const node = document.evaluate(
                    xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                ).singleNodeValue;
                return node ? (node.getAttribute('title') || node.textContent || '').trim() : null;
            });
            """,
            [PROCUREMENT_REGISTERED_COUNT_XPATH, PROCUREMENT_UNREGISTERED_COUNT_XPATH],
        )
        value = tuple(values)
        numeric = all(item is not None and re.search(r"\d", item) for item in value)
        if time.monotonic() < accept_counts_after:
            state["value"], state["stable"] = value, 0
            return False
        if value == state["value"] and numeric:
            state["stable"] += 1
        else:
            state["value"], state["stable"] = value, 0
        if not numeric:
            return False
        parsed = [parse_procurement_count(item) for item in value]
        # Zero is represented by a span and deserves a longer stability window;
        # this prevents a slow API response from being mistaken for "No Data".
        required_stable_polls = 6 if all(number == 0 for number in parsed) else 2
        return state["stable"] >= required_stable_polls

    WebDriverWait(active_driver, PAGE_LOAD_TIMEOUT, poll_frequency=0.5).until(
        procurement_counts_stable
    )
    log(f"FY {financial_year} counts loaded: {state['value']}")
    return state["value"]


def safe_filename_component(value):
    """Return a readable Windows-safe filename component."""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned[:100] or "Unknown Entity"


def download_procurement_source(
    active_driver, financial_year, source, detail_xpath, entity_name, unit
):
    """Open one confirmed non-zero source and download all of its rows."""
    log(f"Downloading FY {financial_year} - {source}")
    before = set(DOWNLOAD_DIR.iterdir())
    click_procurement_xpath(active_driver, detail_xpath)
    wait_for_page_ready(active_driver)
    click_procurement_xpath(active_driver, PROCUREMENT_DOWNLOAD_XPATH)
    path = wait_for_download(before)
    # The portal reuses one filename for every FY/source. Rename immediately so
    # every raw workbook remains available for audit and later comparison.
    entity_prefix = safe_filename_component(entity_name)
    unit_prefix = safe_filename_component(unit)
    preserved_path = DOWNLOAD_DIR / (
        f"{entity_prefix}_{unit_prefix}_procurement_FY_{financial_year}_{source}_"
        f"{datetime.now():%Y%m%d_%H%M%S_%f}{path.suffix.lower()}"
    )
    path.rename(preserved_path)
    return preserved_path, read_download(preserved_path)


def read_download(path):
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    # CPCB's Procurement Summary uses an .xls extension but contains an HTML
    # table. Detect that export explicitly instead of sending it to read_excel.
    with path.open("rb") as stream:
        prefix = stream.read(512).lstrip().lower()
    if prefix.startswith(b"<!doctype html") or prefix.startswith(b"<html"):
        tables = pd.read_html(path, header=1)
        if not tables:
            raise RuntimeError(f"No table was found in Procurement Summary file {path.name}.")
        return tables[0]
    return pd.read_excel(path)

def download_procurement_summary(active_driver, financial_year, entity):
    """Download and preserve one FY's Procurement Summary export."""
    log(f"Downloading Procurement Summary - FY {financial_year}")
    configure_procurement_year(active_driver, financial_year)
    before = set(DOWNLOAD_DIR.iterdir())
    click_procurement_xpath(active_driver, PROCUREMENT_SUMMARY_DOWNLOAD_XPATH)
    path = wait_for_download(before)
    entity_prefix = safe_filename_component(entity.get("Entity Name", ""))
    unit_prefix = safe_filename_component(entity.get("Unit", ""))
    preserved_path = DOWNLOAD_DIR / (
        f"{entity_prefix}_{unit_prefix}_procurement_summary_FY_{financial_year}_"
        f"{datetime.now():%Y%m%d_%H%M%S_%f}{path.suffix.lower()}"
    )
    path.rename(preserved_path)
    frame = read_download(preserved_path)
    frame.columns = [str(column).strip() for column in frame.columns]
    frame.insert(0, "Financial Year", f"FY {financial_year}")
    return preserved_path, frame


def clear_previous_procurement_downloads():
    """Remove only old temporary Procurement downloads before a fresh run."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for path in DOWNLOAD_DIR.iterdir():
        if path.is_file() and path.suffix.lower() in {".xlsx", ".xls", ".csv", ".crdownload"}:
            path.unlink()


PROCUREMENT_OUTPUT_COLUMNS = [
    "Sr.No.",
    "Register Type",
    "Entity Type",
    "Name of Entity",
    "State",
    "Address",
    "Mobile Number",
    "Plastic Material Type",
    "Category of Plastic",
    "Financial Year",
    "Date",
    "Total Plastic Qty. (Ton)",
    "Recycled Plastic %",
    "Total GST Paid",
    "GST Invoice No",
    "EPR Invoice No",
]


def normalize_procurement_frame(frame, source, financial_year):
    """Coalesce equivalent portal headers and retain only genuinely extra fields."""
    frame = frame.copy()
    frame.columns = [str(column).strip() for column in frame.columns]

    aliases = {
        "Sr.No.": ("Sr.No.", "Sr. No.", "Sr No", "S. No."),
        "Entity Type": ("Entity Type", "Applicant Sub Type"),
        "Name of Entity": ("Name of Entity", "Entity Name", "Applicant Name"),
        "State": ("State", "Country"),
        "Address": ("Address",),
        "Mobile Number": ("Mobile Number", "Mobile"),
        "Plastic Material Type": ("Plastic Material Type", "Plastic Type", "Plastic Type ID"),
        "Category of Plastic": ("Category of Plastic", "Category Of Plastic", "Category ID"),
        "Date": ("Date",),
        "Total Plastic Qty. (Ton)": (
            "Total Plastic Qty. (Ton)",
            "Total Plastic Quantity",
        ),
        "Recycled Plastic %": ("Recycled Plastic %", "Recycled"),
        "Total GST Paid": ("Total GST Paid", "Total Invoice Value", "GST Amount"),
        "GST Invoice No": ("GST Invoice No",),
        "EPR Invoice No": ("EPR Invoice No",),
    }

    normalized = pd.DataFrame(index=frame.index)
    consumed = set()
    for target, candidates in aliases.items():
        matching = [candidate for candidate in candidates if candidate in frame.columns]
        if not matching:
            normalized[target] = ""
            continue
        combined = frame[matching[0]].copy()
        for candidate in matching[1:]:
            combined = combined.replace("", pd.NA).combine_first(frame[candidate])
        normalized[target] = combined
        consumed.update(matching)
    normalized["Register Type"] = source
    normalized["Financial Year"] = f"FY {financial_year}"
    normalized = normalized.reindex(columns=PROCUREMENT_OUTPUT_COLUMNS)
    consumed.update({"Financial Year", "Registration Type"})

    # Preserve the portal's row-level Register Type under a distinct readable
    # name; the standardized Register Type above identifies the source button.
    extras = pd.DataFrame(index=frame.index)
    if "Register Type" in frame.columns:
        extras["Entity Registration Status"] = frame["Register Type"]
        consumed.add("Register Type")
    for column in frame.columns:
        if column in consumed:
            continue
        output_name = column
        if output_name in normalized.columns or output_name in extras.columns:
            output_name = f"Portal {output_name}"
        extras[output_name] = frame[column]
    return pd.concat([normalized, extras], axis=1)


def add_procurement_metadata(frame, entity):
    """Append unambiguous global metadata as the final three columns."""
    normalized_entity = {
        "Entity Name": entity.get("Entity Name", ""),
        "Unit Type": entity.get("Unit Type", entity.get("Entity Type", "")),
        "Unit": entity.get("Unit", ""),
    }
    metadata = pd.DataFrame(
        {column: [value] * len(frame) for column, value in normalized_entity.items()},
        index=frame.index,
    )
    return pd.concat([frame, metadata], axis=1)


def merge_procurement_frames(frames):
    """Union all columns by name and align every file before stacking its rows."""
    ordered_columns = []
    seen = set()
    for frame in frames:
        for column in frame.columns:
            if column not in seen:
                seen.add(column)
                ordered_columns.append(column)
    aligned = [frame.reindex(columns=ordered_columns) for frame in frames]
    return pd.concat(aligned, ignore_index=True, sort=False)


def procurement_part(active_driver, output, entity, run_status):
    """Download registered/unregistered procurement data for the requested FYs."""
    log("Procurement part is extracting...", "info")
    downloaded = []
    frames = []
    for financial_year in ("2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"):
        count_values = configure_procurement_year(active_driver, financial_year)
        sources = (
            (
                "Registered",
                PROCUREMENT_REGISTERED_XPATH,
                PROCUREMENT_REGISTERED_COUNT_XPATH,
            ),
            (
                "Unregistered",
                PROCUREMENT_UNREGISTERED_XPATH,
                PROCUREMENT_UNREGISTERED_COUNT_XPATH,
            ),
        )
        counts = {
            source: parse_procurement_count(count_values[index])
            for index, (source, _, _) in enumerate(sources)
        }
        log(
            f"FY {financial_year}: Registered={counts['Registered']:g}, "
            f"Unregistered={counts['Unregistered']:g}"
        )
        overview_open = True
        for source, detail_xpath, _ in sources:
            section = f"Procurement - FY {financial_year} - {source}"
            try:
                if counts[source] == 0:
                    log(f"FY {financial_year} - {source}: No Data Found")
                    run_status.append((section, "No Data", "Portal count is zero"))
                    continue
                if not overview_open:
                    configure_procurement_year(active_driver, financial_year)
                path, frame = download_procurement_source(
                    active_driver,
                    financial_year,
                    source,
                    detail_xpath,
                    entity.get("Entity Name", ""),
                    entity.get("Unit", ""),
                )
                overview_open = False
                downloaded.append(path)
                frame = normalize_procurement_frame(frame, source, financial_year)
                frames.append(frame)
                run_status.append((section, "Success", f"{len(frame)} rows"))
            except Exception as exc:
                reason = str(exc) or type(exc).__name__
                run_status.append((section, "Failed", reason))
                log(f"{section} failed: {reason}", "error")

    if frames:
        procurement_data = merge_procurement_frames(frames)
        append_sheet(output, "Procurement data", add_procurement_metadata(procurement_data, entity))
    else:
        procurement_data = pd.DataFrame()
    summary_frames = []
    summary_downloaded = []
    for financial_year in ("2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"):
        section = f"Procurement Summary - FY {financial_year}"
        try:
            path, frame = download_procurement_summary(active_driver, financial_year, entity)
            summary_downloaded.append(path)
            summary_frames.append(frame)
            run_status.append((section, "Success", f"{len(frame)} rows"))
        except Exception as exc:
            reason = str(exc) or type(exc).__name__
            run_status.append((section, "Failed", reason))
            log(f"{section} failed: {reason}", "error")

    if summary_frames:
        summary_data = merge_procurement_frames(summary_frames)
        append_sheet(output, "Procurement Summary", add_entity_metadata(summary_data, entity))
        log(f"Procurement Summary finished ({len(summary_data)} rows collected).", "success")

    preserved_count = len(downloaded) + len(summary_downloaded)
    if preserved_count:
        log(f"Preserved {preserved_count} raw Procurement workbooks in: {DOWNLOAD_DIR}")
    log(f"Procurement part finished ({len(procurement_data)} rows collected).", "success")


def Allscrape():
    """Scrape button main function. New portal all the parts will be added here."""
    if busy:
        return

    def scrape_parts():
        with driver_lock:
            if driver is None:
                raise RuntimeError(
                    "Open the browser using the Login button and complete the login first."
                )

            output = create_output_workbook()
            run_status = []
            entity = {"Entity Name": "", "Unit Type": "", "Unit": ""}

            try:
                entity = extract_entity_metadata(driver)
                run_status.append(("Entity metadata", "Success", "Captured"))
            except Exception as exc:
                reason = str(exc) or type(exc).__name__
                run_status.append(("Entity metadata", "Skipped", reason))
                log(f"Entity metadata skipped: {reason}", "error")

            # Part 1: Procurement. A whole-part failure must not block Wallet.
            try:
                procurement_part(driver, output, entity, run_status)
            except Exception as exc:
                reason = str(exc) or type(exc).__name__
                run_status.append(("Procurement", "Skipped", reason))
                log(f"Procurement part skipped: {reason}", "error")

            # Part 2: Wallet. Every tab handles its own failures.
            try:
                wallet_part(driver, output, entity, run_status)
            except Exception as exc:
                reason = str(exc) or type(exc).__name__
                run_status.append(("Wallet", "Skipped", reason))
                log(f"Wallet part skipped: {reason}", "error")


            summary = pd.DataFrame(run_status, columns=["Part", "Status", "Details"])
            append_sheet(output, "Errors and Skipped", summary[summary["Status"].isin(["Failed", "Skipped"])].rename(columns={"Part": "Module", "Details": "Reason"}))
            finalize_output_workbook(output)
            incomplete = int(
                summary["Status"].isin(["Skipped", "Failed"]).sum()
            ) if not summary.empty else 0
            log(
                f"Final file saved. Incomplete sections: {incomplete}. Path: {output}",
                "success" if incomplete == 0 else "error",
            )
            return [output]

    set_busy(True, "Extracting...")
    run_in_background(
        scrape_parts,
        lambda paths: "Saved: " + ", ".join(str(path) for path in paths),
    )


def available_clicked():
    """Save Available in the shared CPCB workbook using the logged-in session."""
    if busy:
        return

    def scrape_available():
        with driver_lock:
            if driver is None:
                raise RuntimeError(
                    "Select Open Login to open the browser, then complete OTP authentication before continuing."
                )
            try:
                _ = driver.current_url
            except WebDriverException as exc:
                raise RuntimeError("The existing Selenium Chrome session is no longer active.") from exc
            entity = {"Entity Name": "", "Unit Type": "", "Unit": ""}
            try:
                entity = extract_entity_metadata(driver)
            except Exception as exc:
                log(f"Entity metadata skipped: {exc}", "error")
            frame = extract_available_api(driver, entity)
            output = create_output_workbook()
            append_sheet(output, "Available", frame)
            finalize_output_workbook(output)
            log(f"Done: {len(frame):,} Available records saved to {output}", "success")
            return output

    set_busy(True, "Extracting Available...")
    run_in_background(scrape_available, lambda path: f"Saved: {path}")


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
    scrape_button.configure(state=state)
    available_button.configure(state=state)
    status_label.configure(
        text=label if value else "Ready",
        bg="#FFF3D6" if value else "#E7F7EE",
        fg="#946200" if value else "#187A4A",
    )
    spinner.start(10) if value else spinner.stop()


def run_in_background(function, success_message):
    def worker():
        try:
            result = function()
            events.put(("done", success_message(result), "success"))
        except Exception as exc:
            log(f"Error: {exc}", "error")
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
            elif event == "done":
                set_busy(False)
                if message:
                    append_log(message)
                    if kind == "success" and message.startswith("Saved:"):
                        messagebox.showinfo("Extraction complete", message)
    except queue.Empty:
        pass
    root.after(100, process_events)


def build_ui():
    global root, user_entry, password_entry, login_button
    global scrape_button, available_button, spinner, status_label, log_box

    root = tk.Tk()
    root.title("Common Portal BOT")
    root.geometry("900x650")
    root.minsize(760, 560)
    root.configure(bg=BG)

    style = ttk.Style(root)
    style.theme_use("clam")
    style.configure("TEntry", padding=10, fieldbackground="#F8FAFC", foreground=TEXT)
    style.configure(
        "Primary.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background=BLUE, foreground="white", borderwidth=0,
    )
    style.map("Primary.TButton", background=[("active", "#1D4ED8"), ("disabled", "#93A8C7")])
    style.configure(
        "Secondary.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background="#E8EEF7", foreground=NAVY, borderwidth=0,
    )

    style.configure(
        "Available.TButton", padding=(18, 11), font=("Segoe UI Semibold", 10),
        background="#15803D", foreground="white", borderwidth=0,
    )
    style.map(
        "Available.TButton",
        background=[("disabled", "#A7CDB5"), ("pressed", "#14532D"), ("active", "#166534")],
        foreground=[("disabled", "#F1F5F9")],
    )

    header = tk.Frame(root, bg=NAVY, height=110)
    header.pack(fill="x")
    header.pack_propagate(False)
    tk.Label(header, text="CPCB EPR AUTOMATION", bg=NAVY, fg="#A9C8EE",
             font=("Segoe UI Semibold", 10)).pack(anchor="w", padx=42, pady=(22, 0))
    tk.Label(header, text="Common Portal BOT", bg=NAVY, fg="white",
             font=("Segoe UI Semibold", 23)).pack(anchor="w", padx=40, pady=(2, 0))

    body = tk.Frame(root, bg=BG)
    body.pack(fill="both", expand=True, padx=40, pady=28)
    card = tk.Frame(body, bg=CARD, highlightbackground="#DDE5F0", highlightthickness=1)
    card.pack(fill="x")
    tk.Label(card, text="Portal session", bg=CARD, fg=TEXT,
             font=("Segoe UI Semibold", 14)).grid(row=0, column=0, columnspan=2, sticky="w", padx=24, pady=(20, 3))
    tk.Label(card, text="Credentials are entered automatically. OTP verification is completed manually in the browser.",
             bg=CARD, fg=MUTED, font=("Segoe UI", 9)).grid(
                 row=1, column=0, columnspan=2, sticky="w", padx=24, pady=(0, 16))
    tk.Label(card, text="User ID", bg=CARD, fg=TEXT).grid(row=2, column=0, sticky="w", padx=(24, 10))
    tk.Label(card, text="Password", bg=CARD, fg=TEXT).grid(row=2, column=1, sticky="w", padx=(10, 24))
    user_entry = ttk.Entry(card)
    password_entry = ttk.Entry(card, show="•")
    user_entry.grid(row=3, column=0, sticky="ew", padx=(24, 10), pady=(5, 18))
    password_entry.grid(row=3, column=1, sticky="ew", padx=(10, 24), pady=(5, 18))
    card.columnconfigure((0, 1), weight=1)

    actions = tk.Frame(card, bg=CARD)
    actions.grid(row=4, column=0, columnspan=2, sticky="ew", padx=24, pady=(0, 22))
    login_button = ttk.Button(actions, text="Open Login", style="Secondary.TButton", command=login_clicked)
    login_button.pack(side="left")
    scrape_button = ttk.Button(actions, text="Scrape All", style="Primary.TButton", command=Allscrape)
    scrape_button.pack(side="left", padx=12)
    available_button = ttk.Button(
        actions, text="Available", style="Available.TButton", command=available_clicked
    )
    available_button.pack(side="left")
    spinner = ttk.Progressbar(actions, mode="indeterminate", length=150)
    spinner.pack(side="right")

    log_header = tk.Frame(body, bg=BG)
    log_header.pack(fill="x", pady=(24, 8))
    tk.Label(log_header, text="Activity", bg=BG, fg=TEXT,
             font=("Segoe UI Semibold", 12)).pack(side="left")
    status_label = tk.Label(log_header, text="Ready", bg="#E7F7EE", fg="#187A4A",
                            padx=12, pady=4, font=("Segoe UI Semibold", 9))
    status_label.pack(side="right")
    log_box = tk.Text(body, height=12, bg="#FFFFFF", fg=TEXT, relief="flat",
                      highlightbackground="#DDE5F0", highlightthickness=1,
                      font=("Consolas", 9), padx=14, pady=12, state="disabled")
    log_box.pack(fill="both", expand=True)
    append_log("Ready. Select Open Login to start a portal session.")
    root.after(100, process_events)
    return root


if __name__ == "__main__":
    build_ui().mainloop()
