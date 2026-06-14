// Tests the folder upload path: picks the unpacked fixture via the directory
// input (client-zipped in-browser), then runs the job.
// node scripts/e2e-folder.js <outScreenshot> <extDir>
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const [, , out, extDir] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.setInputFiles("input[multiple]", extDir);
  await page.waitForSelector('button:has-text("Generate my kit"):not([disabled])', { timeout: 20000 });
  await page.click('button:has-text("Generate my kit")');
  console.log("folder uploaded (client-zipped), waiting for kit...");
  const deadline = Date.now() + 120000;
  for (;;) {
    if (await page.$(".result-grid, .error-box")) break;
    if (Date.now() > deadline) throw new Error("timed out");
    await page.waitForTimeout(5000);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out, fullPage: true });
  const err = await page.$(".error-box");
  console.log(err ? "RESULT: error -> " + (await page.$eval(".error-box", (e) => e.textContent)) : "RESULT: kit rendered");
  if (errors.length) console.log("console errors:", errors.slice(0, 5));
  await browser.close();
})();
