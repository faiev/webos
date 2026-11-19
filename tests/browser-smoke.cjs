"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright");

async function captureDiagnostics(page, telemetry) {
  const browserState = await page.evaluate(() => {
    const text = selector => document.querySelector(selector)?.textContent?.trim() || "";
    const machine = window.WebOS?.machine;
    let running = null;
    try {
      if (machine && typeof machine.is_running === "function") running = machine.is_running();
    } catch (error) {
      running = "error: " + error.message;
    }
    const errorElement = document.querySelector("#error-message");
    return {
      guestBooted: document.documentElement.dataset.guestBooted || null,
      status: text("#state-label"),
      statusMessage: text("#status-message"),
      bootMessage: text("#boot-message"),
      errorMessage: errorElement && !errorElement.hidden ? text("#error-message") : null,
      serialOutput: window.WebOS?.serialOutput?.slice(-6000) || "",
      screenText: text("#screen-container .vga-text").slice(-4000),
      machineCreated: Boolean(machine),
      machineRunning: running,
      workerSupported: typeof Worker === "function",
      wasmSupported: typeof WebAssembly === "object"
    };
  }).catch(error => ({ evaluationError: error.message }));

  return {
    timestamp: new Date().toISOString(),
    browserState,
    telemetry
  };
}

async function saveDiagnostics(page, telemetry, reason) {
  const diagnostics = await captureDiagnostics(page, telemetry);
  diagnostics.reason = reason;
  await fs.mkdir("browser-diagnostics", { recursive: true });
  await fs.writeFile("browser-diagnostics/report.json", JSON.stringify(diagnostics, null, 2));
  try {
    await page.screenshot({ path: "browser-diagnostics/failure.png", fullPage: true });
  } catch (error) {
    diagnostics.screenshotError = error.message;
    await fs.writeFile("browser-diagnostics/report.json", JSON.stringify(diagnostics, null, 2));
  }
  return diagnostics;
}

async function waitForGuestBoot(page, timeout, telemetry) {
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.guestBooted === "true" ||
        Boolean(document.querySelector("#error-message") && !document.querySelector("#error-message").hidden),
      null,
      { timeout }
    );
  } catch (error) {
    const diagnostics = await saveDiagnostics(page, telemetry, error.message);
    throw new Error("Timed out waiting for the x86-64 guest to boot. Diagnostics:\n" +
      JSON.stringify(diagnostics, null, 2));
  }

  const diagnostics = await captureDiagnostics(page, telemetry);
  const state = diagnostics.browserState;
  if (state.errorMessage) {
    const saved = await saveDiagnostics(page, telemetry, state.errorMessage);
    throw new Error("The emulator reported a startup error. Diagnostics:\n" +
      JSON.stringify(saved, null, 2));
  }

  assert.ok(
    state.serialOutput.includes("Architecture: x86_64"),
    "The guest did not boot a 64-bit x86_64 Linux userspace. Diagnostics: " + JSON.stringify(diagnostics)
  );
  assert.ok(
    state.serialOutput.includes("WEBOS_BOOT_COMPLETE"),
    "The guest serial console did not emit the WebOS boot marker. Diagnostics: " + JSON.stringify(diagnostics)
  );
}

(async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const telemetry = {
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      badResponses: [],
      workers: []
    };
    page.on("pageerror", error => telemetry.pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") telemetry.consoleErrors.push(message.text());
    });
    page.on("worker", worker => telemetry.workers.push(worker.url()));
    page.on("requestfailed", request => telemetry.failedRequests.push(
      request.url() + ": " + request.failure()?.errorText
    ));
    page.on("response", response => {
      if (response.status() >= 400) {
        telemetry.badResponses.push(response.status() + " " + response.url());
      }
    });

    await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
    await page.locator("#start-button").click();
    await page.waitForFunction(() => typeof window.V86 === "function", null, { timeout: 10000 });
    await waitForGuestBoot(page, 240000, telemetry);

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
    await waitForGuestBoot(page, 120000, telemetry);

    assert.deepEqual(telemetry.failedRequests, [], "The WebOS page had failed network requests.");
    assert.deepEqual(telemetry.badResponses, [], "The WebOS page received HTTP error responses.");
    assert.deepEqual(telemetry.pageErrors, [], "The WebOS page raised browser JavaScript errors.");
    console.log("PASS: v64 worker booted x86-64 Linux, userspace started, pause/resume worked, and restart booted again.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
