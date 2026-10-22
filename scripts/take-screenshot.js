import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  if (!fs.existsSync('.playwright-cli')) {
    fs.mkdirSync('.playwright-cli', { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  
  // 1. Desktop 1440x900
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '.playwright-cli/r1-desktop.png' });
  console.log('Desktop screenshot taken');

  // Test journey: click on "Код бота (ZIP)" tab
  await page.click('button:has-text("Код бота (ZIP)")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.playwright-cli/r1-code-tab.png' });
  console.log('Code tab screenshot taken');

  // Test journey: click on "Схема БД" tab
  await page.click('button:has-text("Схема БД")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.playwright-cli/r1-schema-tab.png' });
  console.log('Schema tab screenshot taken');

  // 2. Mobile 390x844
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: '.playwright-cli/r1-mobile.png' });
  console.log('Mobile screenshot taken');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
