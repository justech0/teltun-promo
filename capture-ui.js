// Captures real TelTun UI states (with a fake Go side) as PNGs for the video.
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");

const DIST = path.resolve(__dirname, "../teltun-app/frontend/dist");
const OUT = path.join(__dirname, "assets/ui");
fs.mkdirSync(OUT, { recursive: true });

const MOCK = `
const L = {};
window.runtime = { EventsOnMultiple(n, cb) { (L[n] = L[n] || []).push(cb); return () => {}; }, EventsOff() {}, EventsEmit() {} };
window.__emit = (n, d) => (L[n] || []).forEach(f => f(d));
window.go = { main: { App: {
  Snapshot: async () => ({ version: '1.0.3', status: { state: 'idle' },
    settings: { language: 'tr', autoReconnect: true, closeToTray: true, blockQuic: true }, autostart: false,
    devices: [{ serial: 'fec04109', state: 'device', model: 'Redmi Note 13 Pro 5G' }], logs: [] }),
  SaveSettings: async () => {}, SetAutostart: async () => {}, Connect: async () => {}, Disconnect: async () => {},
  HotspotStatus: async () => ({ ok: true, state: 'On', ssid: 'TelTun', pass: 'teltun2026', clients: 2, max: 8, profile: 'TelTun' }),
  HotspotStart: async () => ({}), HotspotStop: async () => ({}),
  Minimise() {}, Hide() {}, Quit() {}, OpenLogFolder() {}, OpenURL() {},
} } };`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/mock.js") { r.writeHead(200, { "content-type": "text/javascript" }); return r.end(MOCK); }
  if (p === "/") p = "/index.html";
  fs.readFile(path.join(DIST, p), (e, b) => {
    if (e) { r.writeHead(404); return r.end(); }
    if (p === "/index.html") b = Buffer.from(b.toString().replace("<head>", '<head><script src="/mock.js"></script><style>html{background:#0a0c22}</style>'));
    r.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    r.end(b);
  });
}).listen(5191);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true, args: ["--lang=tr-TR"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 980, height: 660, deviceScaleFactor: 2 });
  await page.goto("http://localhost:5191/", { waitUntil: "networkidle0" });
  await sleep(500);
  const shot = async (name) => { await sleep(250); await page.screenshot({ path: path.join(OUT, name + ".png") }); };

  await shot("idle");

  await page.evaluate(() => __emit("status", { state: "connecting", step: "stepLink", device: "Redmi Note 13 Pro 5G" }));
  await shot("connecting");

  await page.evaluate(() => {
    __emit("status", { state: "connected", device: "Redmi Note 13 Pro 5G", publicIp: "176.88.12.34", since: Date.now() / 1000 - 754 });
    // speed history climbing to ~220 Mbps
    let td = 1.42e9, tu = 0.21e9;
    for (let i = 0; i < 60; i++) {
      const k = Math.min(1, i / 40);
      const down = (40 + 180 * k + Math.sin(i * 1.3) * 9) * 1e6 / 8, up = (18 + 30 * k + Math.cos(i) * 4) * 1e6 / 8;
      td += down; tu += up;
      __emit("stats", { down, up, totalDown: td, totalUp: tu, streams: 23 });
    }
    __emit("stats", { down: 221.4e6 / 8, up: 54.2e6 / 8, totalDown: td, totalUp: tu, streams: 24 });
  });
  await shot("connected");

  await page.click('.nav[data-page="hotspot"]');
  await page.evaluate(() => document.querySelector('.nav[data-page="hotspot"]').click());
  await sleep(600);
  await shot("hotspot");

  await page.evaluate(() => document.querySelector('.nav[data-page="guide"]').click());
  await shot("guide");

  await browser.close();
  server.close();
  console.log("saved", fs.readdirSync(OUT));
})().catch(e => { console.error(e); process.exit(1); });
