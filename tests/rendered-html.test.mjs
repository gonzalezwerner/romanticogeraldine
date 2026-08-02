import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the romantic galaxy experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Una galaxia para ti/);
  assert.match(html, /1 de agosto/);
  assert.match(html, /Explorar nuestra galaxia/);
  assert.match(html, /Compartir esta galaxia/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("ships the final Three.js experience without starter preview files", async () => {
  const [page, layout, story, galaxy, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RomanticStory.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/GalaxyCanvas.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RomanticStory \/>/);
  assert.match(layout, /lang="es"/);
  assert.match(story, /navigator\.share/);
  assert.match(story, /romance:motion/);
  assert.match(galaxy, /from "three"/);
  assert.match(galaxy, /prefers-reduced-motion/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});
