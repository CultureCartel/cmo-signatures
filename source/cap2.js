const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const FPS = 30, args = process.argv.slice(2);
const variants = (process.env.V || 'lockup,banner').split(',').map(x => x.split(':'));
const only = args.map(Number);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => console.log('LOG', m.text()));
  await p.goto('http://127.0.0.1:8765/v2/render.html'); await p.evaluate(() => window.ready);
  const meta = await p.evaluate(() => SCENES.map(s => ({ key: s.key, T: s.T })));
  for (let si = 0; si < meta.length; si++) {
    if (only.length && !only.includes(si + 1)) continue;
    for (const [v, who = 'jarryd'] of variants) {
      const { T, key } = meta[si], n = Math.round(T * FPS), dir = path.join(__dirname, 'frames', `${si + 1}-${v}` + (who === 'jarryd' ? '' : '-' + who));
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < n; i++) {
        const t = ((i / n) * T + T - 0.35) % T; // frame 1 sits in the hold = finished logo
        const url = await p.evaluate(([si, v, t, who]) => frame(si, v, t, who), [si, v, t, who]);
        fs.writeFileSync(path.join(dir, String(i).padStart(3, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      }
      console.log(si + 1, key, v, who, n);
    }
  }
  await b.close();
})();
