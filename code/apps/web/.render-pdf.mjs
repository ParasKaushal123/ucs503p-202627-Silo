// Renders testing/Silo_Test_Cases.html to PDF: node .render-pdf.mjs (from apps/web)
import { chromium } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const src = path.resolve(process.argv[2] ?? "../../testing/Silo_Test_Cases.html");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href);
await page.pdf({ path: src.replace(/.html$/, ".pdf"), format: "A4", landscape: true, preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log("pdf written");
