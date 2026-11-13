const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = fs.readFileSync('public/brand.svg', 'utf8');
    await page.setContent(`<style>*{margin:0}body{width:100vw;height:100vh;display:grid;place-items:center;background:#174b4a}svg{width:65%;height:65%}</style>${svg}`);
    await page.screenshot({ path: `public/icons/icon-${size}.png` });
    await page.close();
  }
  await browser.close();
})();
