import puppeteer from 'puppeteer-core';
const [out, id, ...views] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
await p.goto('file:///D:/VSCode/atlantis/source/tools/kitlab/kitlab.html'); await new Promise((r) => setTimeout(r, 1200));
for (const v of views) { const [n, ...c] = v.split(':'); const k = c[0].split(',').map(Number);
  await p.evaluate((id, k) => { __kitlab.pick(id); __kitlab.look(k.slice(0, 3), k.slice(3)); }, id, k); await new Promise((r) => setTimeout(r, 500));
  await (await p.$('#c')).screenshot({ path: `${out}/${n}.png` }); }
await b.close();
