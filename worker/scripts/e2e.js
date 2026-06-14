// End-to-end UI test: drives the web page to upload a zip and waits for the kit.
// node scripts/e2e.js <outScreenshot> <zipPath>
const { chromium } = require("playwright");
(async () => {
  const [, , out, zip] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.setInputFiles('input[accept=".zip"]', zip);
  await page.click('button:has-text("Generate my kit")');
  console.log("uploaded, waiting for kit...");
  const deadline = Date.now() + 300000;
  for (;;) {
    if (await page.$(".result-grid, .error-box")) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for kit");
    const step = await page.$eval(".progress-step", (e) => e.textContent).catch(() => "");
    if (step) console.log(`  [${new Date().toLocaleTimeString()}] ${step}`);
    await page.waitForTimeout(8000);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out, fullPage: true });
  const err = await page.$(".error-box");
  console.log(err ? "RESULT: error shown" : "RESULT: kit rendered");
  if (errors.length) console.log("console errors:", errors.slice(0, 5));
  await browser.close();
})();
