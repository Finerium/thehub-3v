// Written for tools/presubmit.sh check 11 and kept in the repository so node resolves playwright from
// node_modules by walking up from this file; a probe written into a temp directory cannot.
// Load the export from file:// with every non-file request aborted, then report what rendered. A page that
// needs the network to render is a page that fails on a judge's laptop with the wi-fi off.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
const file = pathToFileURL(process.argv[2]).href;
const browser = await chromium.launch();
const context = await browser.newContext({ offline: true });
const page = await context.newPage();
const external = [];
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("file:") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) {
    return route.continue();
  }
  external.push(url);
  return route.abort();
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(file, { waitUntil: "load" });
await page.waitForTimeout(1500);
const surfaces = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll("[data-x-route]")].map((el) => el.getAttribute("data-x-route")))],
);
const snapshot = await page.evaluate(() => !!document.querySelector('script[type="application/json"], #snapshot'));
console.log(JSON.stringify({ external, errors, surfaces, snapshot }));
await browser.close();
