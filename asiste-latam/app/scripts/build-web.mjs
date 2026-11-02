// Exporta la página oficial (SEO) + la demo como sitio estático, para publicar gratis en Netlify.
// Uso: node scripts/build-web.mjs https://su-sitio.netlify.app
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { renderLanding, sitemap, LANDING_PATHS } from '../src/server/landing.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'https://elaborate-raindrop-edf490.netlify.app').replace(/\/$/, '');
const out = path.resolve(app, '..', 'web');
const brand = JSON.parse(fs.readFileSync(path.join(app, 'brand.json'), 'utf8'));

execFileSync(process.execPath, [path.join(app, 'scripts', 'build-prototype.mjs')], { stdio: 'ignore' });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const p of LANDING_PATHS) {
  const file = p === '/' ? 'index.html' : path.join(p.replace(/^\//, ''), 'index.html');
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.writeFileSync(path.join(out, file), renderLanding(p, brand, base));
}
fs.writeFileSync(path.join(out, '404.html'), renderLanding('/404', brand, base));
fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemap(base));
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /demo/\nSitemap: ${base}/sitemap.xml\n`);
fs.cpSync(path.join(app, 'public', 'assets'), path.join(out, 'assets'), { recursive: true });

const proto = path.resolve(app, '..', 'prototype');
fs.mkdirSync(path.join(out, 'demo', 'assets'), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(proto, f), path.join(out, 'demo', f));
for (const f of fs.readdirSync(path.join(proto, 'assets'))) fs.copyFileSync(path.join(proto, 'assets', f), path.join(out, 'demo', 'assets', f));
fs.writeFileSync(path.join(out, '_headers'), '/demo/*\n  X-Robots-Tag: noindex\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
console.log('Sitio listo en', out, 'para', base);
