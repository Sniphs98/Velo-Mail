// Renders the app and tray icons from resources/*.svg with the Chromium that
// Playwright brings. Run after changing an SVG: node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

/** [svg, png, size in pixels] */
const icons = [
	['icon.svg', 'icon.png', 1024],
	['icon.svg', 'tray/tray.png', 32],
	['icon.svg', 'tray/tray@2x.png', 64],
	// macOS draws "Template" images in the menu bar's colour.
	['tray.svg', 'tray/trayTemplate.png', 16],
	['tray.svg', 'tray/trayTemplate@2x.png', 32]
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [svg, png, size] of icons) {
	const markup = readFileSync(`resources/${svg}`, 'utf8');
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`
	);
	await page.locator('svg').screenshot({ path: `resources/${png}`, omitBackground: true });
}
await browser.close();
