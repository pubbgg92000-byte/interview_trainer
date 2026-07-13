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
  assert.match(html, /Upload your resume/i);
  assert.match(html, /Question bank size/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps Gemini private and includes the full coaching flow", async () => {
  const [page, route, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/interview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Job description \(recommended\)/);
  assert.match(page, /What do you want to improve\?/);
  assert.match(page, /50 maximum-coverage questions/);
  assert.match(page, /Get coaching feedback/);
  assert.match(page, /THE INTERVIEWER CONTINUES/);
  assert.match(route, /process\.env\.GEMINI_API_KEY/);
  assert.match(route, /process\.env\.OPENROUTER_API_KEY/);
  assert.match(route, /openrouter\/free/);
  assert.match(route, /action === "evaluate"/);
  assert.match(route, /gemini-3\.5-flash/);
  assert.match(route, /\[20, 30, 40, 50\]/);
  assert.doesNotMatch(page, /GEMINI_API_KEY/);
  assert.match(layout, /og\.jpg/);
  await access(new URL("../public/og.jpg", import.meta.url));
});
