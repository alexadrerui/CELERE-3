// Kit Lab review set for the critic: full-page captures (our model | the kit photo, with the dimensions bar) of each
// model in the views that matter, the top views with the kit photo laid over ours, and the magenta (missing face) count.
//   node tools/kitlab/shots/kitlab_review.mjs <out_dir>
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const SET = {
  complex: ['az045', 'az135', 'az225', 'az315', 'top', 'top*'],
  pyramid: ['az045', 'front'],
  entrance: ['front', 'right', 'top', 'az045', 'az225'],
  terrace: ['front', 'right', 'back', 'top', 'top*', 'az045', 'az225'],
  wall: ['top*', 'az045', 'az225'],
  obelisk: ['left', 'az045'],
  banner: ['az045'], torch: ['az045'], bowl: ['az045'], pots: ['az045'],
};
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file:///D:/VSCode/atlantis/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1200));
const report = {};
for (const [id, views] of Object.entries(SET)) for (const v0 of views) {
  const over = v0.endsWith('*'), v = v0.replace('*', '');
  const info = await p.evaluate(async (id, v, over) => {
    const ov = document.getElementById('overlay'); if (ov.checked !== over) ov.click(); document.getElementById('opacity').value = 50; document.getElementById('opacity').dispatchEvent(new Event('input'));
    __kitlab.pick(id); __kitlab.setView(v);
    await new Promise((r) => setTimeout(r, 200)); await new Promise(requestAnimationFrame);
    const c = document.getElementById('c'), g = c.getContext('webgl2'), px = new Uint8Array(c.width * c.height * 4); g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, px);
    let k = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 240 && px[i + 1] > 45 && px[i + 1] < 80 && px[i + 2] > 225) k++;
    return { magenta: k, dims: document.getElementById('info').innerText.split('\n')[0] };
  }, id, v, over);
  const name = `${id}_${v}${over ? '_overlay' : ''}`; report[name] = info;
  await p.screenshot({ path: `${out}/${name}.png` });
}
writeFileSync(`${out}/report.json`, JSON.stringify({ errors: errs, shots: report }, null, 1));
console.log(Object.keys(report).length, 'shots', errs.length ? errs : 'no errors');
await b.close();
