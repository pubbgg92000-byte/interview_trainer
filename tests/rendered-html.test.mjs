import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the interview coach setup page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Resume Interview Coach<\/title>/i);
  assert.match(html, /Bring the resume\. We’ll find the questions behind it/i);
  assert.match(html, /Drag and drop your resume/i);
  assert.match(html, /Question bank size/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps AI keys private and includes the full mobile coaching flow", async () => {
  const [page, route, layout, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/interview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Job description \(recommended\)/);
  assert.match(page, /What do you want to improve\?/);
  assert.match(page, /50 maximum-coverage questions/);
  assert.match(page, /Drag and drop your resume/);
  assert.match(page, /Automatically detected from your resume/);
  assert.match(page, /Get coaching feedback/);
  assert.match(page, /I don’t know — show answer guide/);
  assert.match(page, /THE INTERVIEWER CONTINUES/);
  assert.match(page, /Answer with voice/);
  assert.match(page, /Run JavaScript/);
  assert.match(page, /READINESS REPORT/);
  assert.match(page, /Why the interviewer asks this/);
  assert.match(page, /Coding task/);
  assert.match(page, /normalizeStoredQuestions/);
  assert.match(page, /resume-coach-session-v2/);
  assert.match(page, /Reset &amp; start fresh/);
  assert.match(page, /screen, questions: sessionQuestions, profile, attempts/);
  assert.match(route, /codingFallback/);
  assert.match(route, /questions\.filter\(\(item\) => item\.kind === "coding"\)/);
  assert.match(route, /process\.env\.GEMINI_API_KEY/);
  assert.match(route, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(route, /openrouter\/free/);
  assert.match(route, /action === "evaluate"/);
  assert.match(route, /gemini-3\.5-flash/);
  assert.match(route, /\[20, 30, 40, 50\]/);
  assert.doesNotMatch(page, /GEMINI_API_KEY/);
  assert.match(layout, /og\.jpg/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(serviceWorker, /interview-coach-v2/);
  await access(new URL("../public/og.jpg", import.meta.url));
  await access(new URL("../app/favicon.ico/route.ts", import.meta.url));
});
