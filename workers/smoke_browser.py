"""Exercise the real visible worker browser and frame controls offline."""
import os
import sys
import json
from urllib.parse import urlsplit
from urllib.request import urlopen, Request
from urllib.error import HTTPError
# Render Python does not include Tk; verify that desktop-only UI is optional.
sys.modules["tkinter"] = None
from fastapi.testclient import TestClient
from app import app, browser, legacy, state

try:
    driver = browser()
    assert "HeadlessChrome" not in driver.execute_script("return navigator.userAgent")
    driver.get("data:text/html,<title>ORQIX smoke</title><p id='ready'>Browser ready</p><input id='otp'>")
    assert driver.find_element("id", "ready").text == "Browser ready"
    assert driver.get_screenshot_as_png().startswith(b"\x89PNG")
    os.environ["WORKER_TOKEN"] = "native-smoke-token-" + "x" * 32
    state["status"] = "awaiting_otp"
    client = TestClient(app)
    headers = {"Authorization": "Bearer " + os.environ["WORKER_TOKEN"]}
    assert client.get("/browser/frame").status_code in (401, 403)
    assert client.get("/browser/frame", headers=headers).content.startswith(b"\x89PNG")
    driver.find_element("id", "otp").click()
    assert client.post("/browser/input", headers=headers, json={"action": "text", "text": "123456"}).status_code == 200
    assert driver.find_element("id", "otp").get_attribute("value") == "123456"
    # Exercise the actual original script's navigation and autofill function.
    original_url = legacy.LOGIN_URL
    try:
        legacy.LOGIN_URL = "data:text/html,<input placeholder='Enter CEPR User ID'><input placeholder='Password' type='password'>"
        legacy.open_login("offline-probe", "offline-password")
        assert driver.find_element(legacy.By.XPATH, legacy.USER_ID_XPATH).get_attribute("value") == "offline-probe"
        assert driver.find_element(legacy.By.XPATH, legacy.PASSWORD_XPATH).get_attribute("value") == "offline-password"
    finally:
        legacy.LOGIN_URL = original_url
    print("Native visible worker Chromium smoke passed.")
    if os.environ.get("PORTAL_PROBE") == "true":
        # Public login form only: no real credentials, OTP, extraction or writes.
        result = {"ok": False, "loginUrl": legacy.LOGIN_URL}
        try:
            driver.set_page_load_timeout(45)
            result["phase"] = "navigation"
            driver.get(legacy.LOGIN_URL)
            result["phase"] = "login_fields"
            legacy.WebDriverWait(driver, 20).until(legacy.EC.visibility_of_element_located((legacy.By.XPATH, legacy.USER_ID_XPATH)))
            result["ok"] = bool(driver.find_elements(legacy.By.XPATH, legacy.PASSWORD_XPATH))
            result["reason"] = "login_form_visible" if result["ok"] else "password_field_missing"
        except Exception as error:
            result["reason"] = type(error).__name__
        try:
            location = urlsplit(driver.current_url)
            result["browserLocation"] = location.scheme + "://" + (location.hostname or "") + location.path
            result["pageTitle"] = driver.title[:120]
            result["userFields"] = len(driver.find_elements(legacy.By.XPATH, legacy.USER_ID_XPATH))
            result["passwordFields"] = len(driver.find_elements(legacy.By.XPATH, legacy.PASSWORD_XPATH))
        except Exception:
            result["browserDetails"] = "unavailable"
        try:
            with urlopen(Request(legacy.LOGIN_URL, headers={"User-Agent": "ORQIX connectivity probe"}), timeout=15) as response:
                result["httpStatus"] = response.status
        except HTTPError as error:
            result["httpStatus"] = error.code
        except Exception as error:
            result["httpError"] = type(error).__name__
        print("PORTAL_PROBE_RESULT=" + json.dumps(result))
finally:
    if legacy.driver:
        legacy.driver.quit()
