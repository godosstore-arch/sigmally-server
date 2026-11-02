// Genera ../prototype: la demo estática para subir a Netlify Drop (o cualquier hosting) y mandar a clínicas.
// Usa exactamente los mismos archivos del motor que la app real (src/shared).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(app, '..', 'prototype');
const brand = JSON.parse(fs.readFileSync(path.join(app, 'brand.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(app, 'public', 'app'), path.join(out, 'app'), { recursive: true });
fs.cpSync(path.join(app, 'public', 'assets'), path.join(out, 'assets'), { recursive: true });
fs.cpSync(path.join(app, 'src', 'shared'), path.join(out, 'shared'), { recursive: true });
fs.rmSync(path.join(out, 'app', 'index.html'));
// index.html AUTOSUFICIENTE: todo el código y estilos van dentro del archivo (import map con módulos
// en data: URL). Así funciona aunque solo se suba index.html (Netlify Drop, Hostinger, un USB…).
const modules = {};
function collect(dirRel) {
  const dir = path.join(out, dirRel);
  for (const f of fs.readdirSync(dir)) {
    const rel = path.posix.join(dirRel, f);
    if (fs.statSync(path.join(dir, f)).isDirectory()) collect(rel);
    else if (f.endsWith('.js')) modules[rel] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
}
collect('app');
collect('shared');
const imports = {};
for (const [rel, src] of Object.entries(modules)) {
  const code = src.replace(/(from\s+|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (m, kw, q, spec) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    if (!modules[target]) throw new Error(`Import no encontrado: ${spec} en ${rel}`);
    return `${kw}${q}@asiste/${target}${q}`;
  });
  imports['@asiste/' + rel] = 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
}
const css = fs.readFileSync(path.join(out, 'app', 'app.css'), 'utf8');
const favicon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(out, 'assets', 'favicon.svg')).toString('base64');
const demo = fs.readFileSync(path.join(app, 'public', 'demo', 'index.html'), 'utf8')
  .replace(/data-wa="\d*"/, `data-wa="${brand.salesWhatsApp}"`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${favicon}" type="image/svg+xml">`)
  .replace(/<meta property="og:image"[^>]*>\n?/, '')
  .replace(/<link rel="stylesheet" href="\.\.\/app\/app\.css">/, `<style>\n${css}\n</style>`)
  .replace(/<script type="module" src="\.\.\/app\/main\.js"><\/script>/,
    `<script type="importmap">${JSON.stringify({ imports })}</script>\n<script type="module">import '@asiste/app/main.js';</script>`);
if (/\.\.\/app\//.test(demo)) throw new Error('Quedó una ruta relativa sin reemplazar');
fs.writeFileSync(path.join(out, 'index.html'), demo);
fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex\n  X-Content-Type-Options: nosniff\n');
fs.writeFileSync(path.join(out, 'LEEME.txt'), `Demo de ${brand.name}. index.html es autosuficiente: basta subir ese archivo (en una carpeta) a https://app.netlify.com/drop

Link por clínica:
  https://SU-LINK/?clinica=Clínica%20Dental%20San%20Miguel&ciudad=Piura&tipo=dental&pais=PE

Tipos: dental, estetica, fisioterapia, psicologia, pediatria, ginecologia, oftalmologia, nutricion, general, dermatologia
Países: PE, MX, CO, CL, AR, EC, BO, UY, PY, CR, PA, DO, GT
`);
console.log('Demo estática lista en', out);
