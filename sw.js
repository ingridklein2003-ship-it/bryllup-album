// Service worker: streamer albummet som én zip direkte til disken (bruges i Safari/Firefox,
// hvor siden ikke selv kan skrive til en fil). Intet gemmes i hukommelsen.
importScripts("https://cdn.jsdelivr.net/npm/client-zip@2.5.0/worker.js");

const jobs = new Map();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "zip" && d.id && Array.isArray(d.files)) {
    jobs.set(d.id, d);
    setTimeout(() => jobs.delete(d.id), 10 * 60 * 1000);
    e.ports[0] && e.ports[0].postMessage({ ok: true });
  }
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const m = url.pathname.match(/\/__zip\/([a-z0-9]+)$/);
  if (!m) return;
  const job = jobs.get(m[1]);
  if (!job) return e.respondWith(new Response("Download udløbet – prøv igen.", { status: 404 }));
  jobs.delete(m[1]);
  async function* entries() {
    for (const f of job.files) {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error("fetch " + f.name);
      yield f.size > 0 ? { name: f.name, input: r, size: f.size } : { name: f.name, input: r };
    }
  }
  const meta = job.files.map((f) => ({ name: f.name, size: f.size }));
  const zip = downloadZip(entries(), meta.every((m) => m.size > 0) ? { metadata: meta } : {});
  const headers = new Headers(zip.headers);
  headers.set("Content-Type", "application/zip");
  const ascii = job.filename.replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").replace(/[^\x20-\x7e]/g, "-").replace(/"/g, "");
  headers.set("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(job.filename)}`);
  e.respondWith(new Response(zip.body, { headers }));
});
