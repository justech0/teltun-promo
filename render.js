// Renders scenes.html frame by frame (deterministic via window.renderAt) and
// encodes a 1080x1920 30fps MP4 with ffmpeg. `node render.js preview` makes a
// contact sheet of key moments instead of the full video.
const http = require("http"), fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const puppeteer = require("puppeteer-core");
const ffmpeg = require("ffmpeg-static");

const ROOT = __dirname;
const FPS = 30;
const OUT = path.join(ROOT, "frames");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/") p = "/scenes.html";
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
    r.end(b);
  });
}).listen(5192);

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mode = process.argv[2] || "full";
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: "new", args: ["--force-color-profile=srgb", "--lang=tr-TR"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto("http://localhost:5192/scenes.html", { waitUntil: "networkidle0" });
  await sleep(400);
  const DUR = await page.evaluate(() => window.VIDEO_DURATION);

  if (mode === "preview") {
    const times = [0.6, 1.4, 2.4, 4.2, 5.6, 6.6, 9.0, 11.0, 14.0, 16.0, 19.5, 21.5];
    const dir = path.join(ROOT, "preview"); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < times.length; i++) {
      await page.evaluate(t => window.renderAt(t), times[i]);
      await sleep(80);
      await page.screenshot({ path: path.join(dir, `p${i}_${times[i]}.png`) });
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
    const list = files.map(f => path.join(dir, f));
    spawnSync(ffmpeg, ["-y", "-i", list[0], ...list.slice(1).flatMap(f => ["-i", f]),
      "-filter_complex", `${files.map((_, i) => `[${i}:v]scale=216:384[s${i}]`).join(";")};${files.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${files.length}`,
      path.join(dir, "sheet.png")], { stdio: "inherit" });
    await browser.close(); server.close();
    console.log("preview sheet ready"); return;
  }

  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const total = Math.round(DUR * FPS);
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await page.evaluate(tt => window.renderAt(tt), t);
    await page.screenshot({ path: path.join(OUT, `f${String(i).padStart(4, "0")}.png`) });
    if (i % 60 === 0) process.stdout.write(`\r${i}/${total}`);
  }
  console.log("\nframes done, encoding...");
  await browser.close(); server.close();

  const mp4 = path.join(ROOT, "teltun-promo-silent.mp4");
  spawnSync(ffmpeg, ["-y", "-framerate", String(FPS), "-i", path.join(OUT, "f%04d.png"),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "high", "-crf", "18",
    "-movflags", "+faststart", mp4], { stdio: "inherit" });
  console.log("done:", mp4);
})().catch(e => { console.error(e); process.exit(1); });
