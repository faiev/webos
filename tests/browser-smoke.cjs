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
  assert.ok(serial.includes("Architecture: x86_64"), "The guest did not boot a 64-bit x86_64 Linux userspace.");
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
    const failedRequests = [];
    const badResponses = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("requestfailed", request => failedRequests.push(request.url() + ": " + request.failure()?.errorText));
    page.on("response", response => {
      if (response.status() >= 400) {
        badResponses.push(response.status() + " " + response.url());
      }
    });

    await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
    await page.locator("#start-button").click();
    await page.waitForFunction(() => typeof window.V86 === "function", null, { timeout: 10000 });
    await waitForGuestBoot(page, 240000);

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
    await waitForGuestBoot(page, 120000);

    assert.deepEqual(failedRequests, [], "The WebOS page had failed network requests.");
    assert.deepEqual(badResponses, [], "The WebOS page received HTTP error responses.");
    assert.deepEqual(pageErrors, [], "The WebOS page raised browser JavaScript errors.");
    console.log("PASS: v64 booted x86-64 Linux, userspace started, pause/resume worked, and restart booted again.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
