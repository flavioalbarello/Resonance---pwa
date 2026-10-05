// Il lettore di pagine al banco (05/10/2026): un Chromium comandato da fuori, con le stesse mosse della WebView del
// telefono. Il programma (LettoreHttp nei test) apre una pagina, le manda lo stesso script di estrazione
// (Lettore.ESTRAI) ogni 800 ms con la stessa attesa (Lettore.attendi), e la chiude. Così al banco dal vivo gira la
// stessa logica del telefono; cambia solo il browser.
//   node lettore-chromium.mjs [porta]        (serve Playwright; dietro un proxy: HTTPS_PROXY e SPKI del suo certificato)
import http from 'node:http';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const porta = Number(process.argv[2] || 8787);
const args = process.env.SPKI ? ['--ignore-certificate-errors-spki-list=' + process.env.SPKI] : [];
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args });
// Un contesto solo, come la WebView del telefono: i cookie restano, una sfida superata vale per tutto il sito.
const contesto = await browser.newContext();
const pagine = new Map();
let prossimo = 1;

async function corpo(req) { let s = ''; for await (const c of req) s += c; return s ? JSON.parse(s) : {}; }

http.createServer(async (req, res) => {
  const fine = (codice, o) => { res.writeHead(codice, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    const b = await corpo(req);
    if (req.url === '/apri') {
      const p = await contesto.newPage();
      const id = String(prossimo++);
      pagine.set(id, { p });
      p.goto(b.url, { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
      return fine(200, { id });
    }
    if (req.url === '/estrai') {
      const s = pagine.get(b.id); if (!s) return fine(404, {});
      try { return fine(200, { r: await s.p.evaluate(b.js) }); } catch (e) { return fine(200, { r: null }); }
    }
    if (req.url === '/chiudi') {
      const s = pagine.get(b.id); pagine.delete(b.id);
      if (s) await s.p.close().catch(() => {});
      return fine(200, {});
    }
    // Un PDF: scaricato dal browser (stessi cookie, stessa sfida superata), restituito in base64.
    if (req.url === '/scarica') {
      const r = await contesto.request.get(b.url, { timeout: 30000 });
      return fine(200, { stato: r.status(), byte: Buffer.from(await r.body()).toString('base64') });
    }
    fine(404, {});
  } catch (e) { fine(500, { errore: String(e && e.message || e) }); }
}).listen(porta, '127.0.0.1', () => console.log('lettore su', porta));
