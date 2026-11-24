import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.goto('file:///D:/VSCode/atlantis/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1200));
// count magenta pixels per model / view: faces seen from behind
for (const id of await p.evaluate(() => __kitlab.models)) for (const v of ['az045', 'az135', 'az225', 'az315', 'top']) {
  if (id === 'complex' && v === 'top') continue;
  const n = await p.evaluate(async (id, v) => { __kitlab.pick(id); __kitlab.setView(v); await new Promise((r) => setTimeout(r, 120)); await new Promise(requestAnimationFrame);
    const c = document.getElementById('c'), g = c.getContext('webgl2'), w = c.width, h = c.height, px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    let k = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 240 && px[i + 1] > 45 && px[i + 1] < 80 && px[i + 2] > 225) k++; return k; }, id, v);
  if (n) { console.log(id, v, n, 'magenta px'); await p.screenshot({ path: `${out}/backs_${id}_${v}.png` }); }
}
console.log('done'); await b.close();
