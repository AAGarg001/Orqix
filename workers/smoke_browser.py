"""Exercise the real visible worker browser and frame controls offline."""
import os
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
    print("Native visible worker Chromium smoke passed.")
finally:
    if legacy.driver:
        legacy.driver.quit()
