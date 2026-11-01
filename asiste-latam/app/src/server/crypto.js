// Cifrado AES-256-GCM para datos sensibles (mensajes de pacientes, notas, tokens de WhatsApp).
// Ley 29733 (Perú) y su reglamento tratan los datos de salud como sensibles: se guardan cifrados.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let KEY = null;

export function initKey(dataDir) {
  const env = process.env.DATA_KEY;
  if (env) {
    const buf = /^[0-9a-f]{64}$/i.test(env) ? Buffer.from(env, 'hex') : Buffer.from(env, 'base64');
    if (buf.length !== 32) throw new Error('DATA_KEY debe tener 32 bytes (64 caracteres hex).');
    KEY = buf;
    return;
  }
  const file = path.join(dataDir, '.data-key');
  if (fs.existsSync(file)) KEY = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  else {
    KEY = crypto.randomBytes(32);
    fs.writeFileSync(file, KEY.toString('hex'), { mode: 0o600 });
    console.warn(`[asiste] Se creó una llave de cifrado en ${file}. En producción define DATA_KEY y guárdala en un lugar seguro.`);
  }
}

export function enc(text) {
  if (text == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

export function dec(blob) {
  if (blob == null) return null;
  if (!String(blob).startsWith('v1:')) return blob;
  try {
    const raw = Buffer.from(String(blob).slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return '[no se pudo descifrar]';
  }
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hashHex, 'hex');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}

export function token(n = 32) {
  return crypto.randomBytes(n).toString('base64url');
}

export function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}
