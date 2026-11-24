// opens the Kit Lab, reports page errors, screenshots a few models and views
import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('file:///D:/VSCode/atlantis/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1500));
const ids = await p.evaluate(() => window.__kitlab && window.__kitlab.models);
console.log('models', ids, 'errors', errs);
for (const [id, v] of [['complex', 'az315'], ['complex', 'az045'], ['complex', 'az135'], ['wall', 'top'], ['terrace', 'az045'], ['wall', 'az315']]) {
  await p.evaluate((id, v) => { __kitlab.pick(id); __kitlab.setView(v); }, id, v); await new Promise((r) => setTimeout(r, 900));
  await p.screenshot({ path: `${out}/${id}_${v}.png` });
  const err = await p.evaluate(() => document.getElementById('err').style.display === 'block' ? document.getElementById('err').textContent : '');
  console.log(id, v, err || 'ok');
}
console.log('errors', errs);
await b.close();
