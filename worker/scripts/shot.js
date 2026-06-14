// Quick screenshot helper: node scripts/shot.js <url> <outfile> [full]
const { chromium } = require("playwright");
(async () => {
  const [, , url, out, mode] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 880 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out, fullPage: mode === "full" });
  await browser.close();
})();
