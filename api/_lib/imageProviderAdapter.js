// Adattatore isolato per l'effettore "immagine_raster" (FASE 3.2, BRIEF_effettori_printify).
// Il provider va isolato dietro questa interfaccia: cambiarlo in futuro significa toccare SOLO
// questo file, mai il contratto (app.js) né l'endpoint generate-image.js che lo chiama.
//
// Provider di default scelto qui: Stability AI (endpoint "Stable Image Core", REST semplice,
// una sola chiamata sincrona, nessun polling). NON è stato indicato esplicitamente da Flavio in
// questa sessione — è una scelta di default ragionevole e sostituibile, non una decisione finale.
// NON TESTATO DAL VIVO: nessuna STABILITY_API_KEY fornita in questa sessione. L'implementazione
// sotto è costruita sulla documentazione pubblica dell'API (multipart/form-data, header Accept per
// ottenere i byte PNG direttamente), non verificata con una chiamata reale.
//
// Per cambiare provider: sostituire SOLO generateRasterImage sotto, mantenendo la stessa forma di
// ritorno { ok, pngBase64, error } — nessun altro file deve cambiare.
const API_URL = "https://api.stability.ai/v2beta/stable-image/generate/core";

// Autenticazione — DUE strade, non una (15/09/2026, stessa ragione di serperClient.js): la chiave
// del CHIAMANTE, in Setup nell'app come la chiave OpenRouter (ognuno il proprio account Stability),
// con ripiego su STABILITY_API_KEY come variabile d'ambiente Vercel. Quella del chiamante vince se c'è.
async function generateRasterImage(prompt, chiaveDelChiamante) {
  const apiKey = String(chiaveDelChiamante || "").trim() || process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Nessuna chiave Stability: né in Setup, né STABILITY_API_KEY su Vercel — effettore immagine_raster non attivo finché non ne imposti una." };
  }
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("output_format", "png");
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "image/*" },
      body: form,
    });
  } catch (e) {
    return { ok: false, error: `Chiamata al provider immagine fallita: ${e.message}` };
  }
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* corpo non leggibile, ignora */ }
    return { ok: false, error: `Provider immagine ha risposto ${res.status}: ${detail.slice(0, 300)}` };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return { ok: true, pngBase64: buffer.toString("base64") };
}

module.exports = { generateRasterImage };
