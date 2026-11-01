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
const demo = fs.readFileSync(path.join(app, 'public', 'demo', 'index.html'), 'utf8')
  .replaceAll('../app/', './app/').replaceAll('../assets/', './assets/')
  .replace(/data-wa="\d*"/, `data-wa="${brand.salesWhatsApp}"`);
fs.writeFileSync(path.join(out, 'index.html'), demo);
fs.writeFileSync(path.join(out, '_headers'), '/*\n  X-Robots-Tag: noindex\n  X-Content-Type-Options: nosniff\n');
fs.writeFileSync(path.join(out, 'LEEME.txt'), `Demo de ${brand.name} — subir esta carpeta completa a https://app.netlify.com/drop

Link por clínica:
  https://SU-LINK/?clinica=Clínica%20Dental%20San%20Miguel&ciudad=Piura&tipo=dental&pais=PE

Tipos: dental, estetica, fisioterapia, psicologia, pediatria, ginecologia, oftalmologia, nutricion, general, dermatologia
Países: PE, MX, CO, CL, AR, EC, BO, UY, PY, CR, PA, DO, GT
`);
console.log('Demo estática lista en', out);
