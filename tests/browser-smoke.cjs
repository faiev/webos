"use strict";

const assert = require("node:assert/strict");
const { chromium } = require("playwright");

async function waitForGuestBoot(page, timeout) {
  await page.waitForFunction(
    () => document.documentElement.dataset.guestBooted === "true",
    null,
    { timeout }
  );
  const serial = await page.evaluate(() => window.WebOS.serialOutput);
  assert.ok(serial.includes("WEBOS_BOOT_COMPLETE"), "The guest serial console did not emit the WebOS boot marker.");
}

(async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
    await page.locator("#start-button").click();
    await waitForGuestBoot(page, 180000);

    await page.locator("#pause-button").click();
    await page.waitForFunction(
      () => window.WebOS.machine && !window.WebOS.machine.is_running(),
      null,
      { timeout: 15000 }
    );

    await page.locator("#pause-button").click();
    await page.waitForFunction(
      () => window.WebOS.machine && window.WebOS.machine.is_running(),
      null,
      { timeout: 15000 }
    );

    await page.locator("#restart-button").click();
    await waitForGuestBoot(page, 90000);

    assert.deepEqual(pageErrors, [], "The WebOS page raised browser JavaScript errors.");
    console.log("PASS: WebAssembly loaded, v86 booted Linux, userspace started, pause/resume worked, and restart booted again.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
