"""Exercise the real worker's headed Chromium against an offline test page."""
from app import browser, legacy

try:
    driver = browser()
    driver.get("data:text/html,<title>ORQIX smoke</title><p id='ready'>Browser ready</p>")
    assert driver.find_element("id", "ready").text == "Browser ready"
    print("Headed worker Chromium smoke passed.")
finally:
    if legacy.driver:
        legacy.driver.quit()
