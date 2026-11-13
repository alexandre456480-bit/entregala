import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: "artifacts/test-results",
  timeout: 45000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "artifacts/playwright-report" }],
  ],
  use: { baseURL: "http://localhost:4201", trace: "retain-on-failure" },
  projects: [
    {name:'iphone',use:{...devices['iPhone 13'],browserName:'chromium'}},
    {
      name: "tablet",
      use: { viewport: { width: 1024, height: 768 }, hasTouch: true },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "landscape",
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command:
      "npm run config && npx ng serve --configuration e2e --host 127.0.0.1 --port 4201",
    url: "http://localhost:4201",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
