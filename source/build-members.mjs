// Publishes self-serve sign-ups from the studio.
// Reads new people from Supabase, renders their headshots and 10 banner GIFs with source/render.html,
// commits the files, then pins them in roster.json to that commit so jsDelivr serves them forever.
//
// Env: SUPABASE_URL, SUPABASE_KEY (the public publishable key is enough: the table is readable by anon).
// Run from the repo root: node source/build-members.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'source');
const TMP = path.join(SRC, 'tmp');
const ROSTER = path.join(ROOT, 'roster.json');
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
const DRY = process.argv.includes('--dry'); // render into tmp only, no git
const FPS = 30;
const SCENE_KEYS = ['convergence', 'globe', 'liquid', 'ink', 'twentyfive', 'orbits', 'iris', 'kinetic', 'network', 'coin'];
const sh = (c, o = {}) => execSync(c, { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT, ...o }).toString().trim();

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'member';
const initials = (n) => n.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

async function fetchRows() {
  const r = await fetch(`${URL_}/rest/v1/cmo_signature_members?select=*&order=created_at.asc`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

function serve(dir) {
  const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.js': 'text/javascript' };
  return new Promise(res => {
    const s = http.createServer((q, a) => {
      const f = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { a.writeHead(404); return a.end(); }
      a.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(a);
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

async function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  let rows;
  try { rows = process.env.ROWS_FILE ? JSON.parse(fs.readFileSync(process.env.ROWS_FILE, 'utf8')) : await fetchRows(); } catch (e) { console.log('Could not read sign-ups, leaving roster as is:', e.message); return; }

  // newest submission per email wins; test rows are ignored
  const latest = new Map();
  for (const r of rows) { if (/@example\.(com|org)$/i.test(r.email)) continue; latest.set(r.email.toLowerCase(), r); }
  const wanted = [...latest.values()];
  const have = new Set(roster.members.map(m => m.id));
  const todo = wanted.filter(r => !have.has(r.id));
  const keepIds = new Set(wanted.map(r => r.id));
  const removed = roster.members.filter(m => !keepIds.has(m.id));
  console.log(`sign-ups: ${rows.length}, published: ${roster.members.length}, to build: ${todo.length}, to remove: ${removed.length}`);
  if (!todo.length && !removed.length) return;

  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const server = await serve(SRC), port = server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage();
  page.on('pageerror', e => console.log('page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/render.html`); await page.evaluate(() => window.ready);
  const meta = await page.evaluate(() => SCENES.map(s => s.T));

  const built = [];
  for (const r of todo) {
    const slug = `${slugify(r.name)}-${r.id.slice(0, 8)}`, dir = `assets/members/${slug}/`, out = path.join(ROOT, dir);
    fs.mkdirSync(out, { recursive: true });
    console.log('building', r.name, '->', dir);
    let photo = null;
    if (r.photo_local) { photo = `tmp/${r.id}.jpg`; fs.copyFileSync(r.photo_local, path.join(SRC, photo)); }
    else if (r.photo_path) {
      const resp = await fetch(`${URL_}/storage/v1/object/public/cmo-signature-photos/${r.photo_path}`);
      if (resp.ok) { photo = `tmp/${r.id}${path.extname(r.photo_path)}`; fs.writeFileSync(path.join(SRC, photo), Buffer.from(await resp.arrayBuffer())); }
    }
    for (const [file, bg] of [['headshot.png', '#ffffff'], ['headshot-dark.png', '#111111']]) {
      const url = await page.evaluate(([p, bg, ini]) => avatar(p, bg, ini), [photo, bg, initials(r.name)]);
      fs.writeFileSync(path.join(out, file), Buffer.from(url.split(',')[1], 'base64'));
    }
    const who = { name: r.name, title: r.title, org: r.city ? `CMO Council  ·  ${r.city}` : 'CMO Council' };
    for (let si = 0; si < meta.length; si++) {
      const T = meta[si], n = Math.round(T * FPS), fdir = path.join(TMP, `f-${si}`);
      fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
      for (let i = 0; i < n; i++) {
        const t = ((i / n) * T + T - 0.35) % T; // frame 1 is the finished state
        const url = await page.evaluate(([si, t, who]) => frame(si, 'banner-plain', t, who), [si, t, who]);
        fs.writeFileSync(path.join(fdir, String(i).padStart(3, '0') + '.png'), Buffer.from(url.split(',')[1], 'base64'));
      }
      const gif = path.join(out, `${String(si + 1).padStart(2, '0')}-${SCENE_KEYS[si]}-banner.gif`);
      sh(`bash source/enc.sh "${fdir}" "${gif}"`);
    }
    built.push({ r, slug, dir });
  }
  await browser.close(); server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  if (DRY) { console.log('dry run, files left in place:', built.map(b => b.dir)); return; }

  // commit the artwork first, then pin the roster to that exact commit
  let sha = null;
  if (built.length) {
    sh('git add assets/members');
    sh(`git commit -m "Add signature artwork for ${built.map(b => b.r.name).join(', ')}"`);
    sha = sh('git rev-parse HEAD');
  }
  const members = roster.members.filter(m => keepIds.has(m.id));
  for (const { r, slug, dir } of built) members.push({
    id: r.id, key: slug, name: r.name, title: r.title, org: 'CMO Council', sub: r.city || '',
    phone: r.phone || '', email: r.email, city: r.city || '', dir, sha, added: r.created_at,
  });
  members.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(ROSTER, JSON.stringify({ updated: new Date().toISOString(), members }, null, 2) + '\n');
  sh('git add roster.json');
  sh(`git commit -m "Publish ${built.length} new and remove ${removed.length} signature member(s)"`);
}

main().catch(e => { console.error(e); process.exit(1); });
