// Effettore "immagine_vettoriale" (FASE 3.1, BRIEF_effettori_printify 27/07/2026).
// Riceve un SVG e lo converte in PNG ad alta risoluzione lato server, con un font bundlato
// SEMPRE incorporato — mai i font di sistema (loadSystemFonts:false), perché il runtime
// serverless di Vercel non ha alcuna garanzia di font installati: verificato empiricamente in
// sessione di sviluppo che senza un font esplicito il testo NON viene renderizzato affatto
// (immagine bianca, non un font di ripiego "brutto" — proprio nessun testo).
//
// Libreria scelta: @resvg/resvg-js (binding nativo via napi-rs, prebuilt per linux-x64-gnu — il
// target di Vercel Node.js — nessuna compilazione a build time, nessuna dipendenza binaria di
// sistema mancante). fontBuffers introdotto in 2.5.0: qui pinnata 2.6.2.
//
// NOTA IMPORTANTE (scoperta empiricamente, non documentata da resvg-js): l'opzione "fitTo" per
// scalare la risoluzione di output viene IGNORATA in silenzio quando "font.fontBuffers" è
// presente nelle stesse opzioni (bug/interazione non documentata della libreria). Per questo NON
// usiamo fitTo: il target di risoluzione viene invece scritto DIRETTAMENTE sull'attributo
// width/height del tag <svg> radice prima di passarlo a Resvg — Resvg allora renderizza esattamente
// a quella dimensione, indipendentemente dal viewBox interno.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

// Standard Printify per t-shirt a 300 DPI (verificato: help.printify.com — "How do I get a
// high-quality design file?"). Prodotti diversi (mug, poster) hanno requisiti diversi: il
// chiamante può sempre passare widthPx/heightPx espliciti per un'altra area di stampa.
const DEFAULT_WIDTH_PX = 4500;
const DEFAULT_HEIGHT_PX = 5400;
const MAX_DIMENSION_PX = 8000; // argine di buon senso, ben sopra qualunque area di stampa reale

let fontBuffersCache = null;
function loadBundledFonts() {
  if (fontBuffersCache) return fontBuffersCache;
  const dir = path.join(__dirname, "_fonts");
  fontBuffersCache = [
    fs.readFileSync(path.join(dir, "LiberationSans-Regular.ttf")),
    fs.readFileSync(path.join(dir, "LiberationSans-Bold.ttf")),
  ];
  return fontBuffersCache;
}

// Impone width/height sul tag <svg> radice, sostituendo eventuali attributi esistenti. Se manca
// un viewBox, ne deriva uno dalle dimensioni originali dichiarate (o dal target stesso, come
// ultima difesa) — senza viewBox lo scaling forzato distorcerebbe il contenuto interno.
function forceSvgDimensions(svg, widthPx, heightPx) {
  const rootMatch = svg.match(/<svg\b[^>]*>/i);
  if (!rootMatch) throw new Error("SVG non valido: nessun tag <svg> radice trovato.");
  let root = rootMatch[0];
  const hasViewBox = /viewBox\s*=/.test(root);
  if (!hasViewBox) {
    const wMatch = root.match(/\bwidth\s*=\s*["']?([\d.]+)/i);
    const hMatch = root.match(/\bheight\s*=\s*["']?([\d.]+)/i);
    const origW = wMatch ? parseFloat(wMatch[1]) : widthPx;
    const origH = hMatch ? parseFloat(hMatch[1]) : heightPx;
    root = root.replace(/<svg\b/i, `<svg viewBox="0 0 ${origW} ${origH}"`);
  }
  root = root.replace(/\swidth\s*=\s*"[^"]*"/i, "").replace(/\swidth\s*=\s*'[^']*'/i, "");
  root = root.replace(/\sheight\s*=\s*"[^"]*"/i, "").replace(/\sheight\s*=\s*'[^']*'/i, "");
  root = root.replace(/<svg\b/i, `<svg width="${widthPx}" height="${heightPx}"`);
  return svg.replace(rootMatch[0], root);
}

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  try {
    const { svg, widthPx, heightPx } = request.body || {};
    if (!svg || typeof svg !== "string" || !/<svg[\s>]/i.test(svg)) {
      response.status(400).json({ ok: false, error: "Campo 'svg' mancante o non valido (nessun tag <svg> trovato)." });
      return;
    }
    const targetW = Number.isFinite(widthPx) && widthPx > 0 ? Math.min(widthPx, MAX_DIMENSION_PX) : DEFAULT_WIDTH_PX;
    const targetH = Number.isFinite(heightPx) && heightPx > 0 ? Math.min(heightPx, MAX_DIMENSION_PX) : DEFAULT_HEIGHT_PX;
    const svgAtTargetSize = forceSvgDimensions(svg, targetW, targetH);
    const fontBuffers = loadBundledFonts();
    const resvg = new Resvg(svgAtTargetSize, {
      font: { loadSystemFonts: false, fontBuffers, defaultFontFamily: "Liberation Sans" },
    });
    const rendered = resvg.render();
    const png = rendered.asPng();
    response.status(200).json({
      ok: true,
      pngBase64: png.toString("base64"),
      width: rendered.width,
      height: rendered.height,
    });
  } catch (e) {
    response.status(200).json({ ok: false, error: `Conversione SVG→PNG fallita: ${e.message}` });
  }
};
