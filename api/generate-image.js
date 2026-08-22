// Effettore "immagine_raster" (FASE 3.2, BRIEF_effettori_printify 27/07/2026). Il provider è
// isolato in _lib/imageProviderAdapter.js: questo file valida l'input e restituisce l'esito
// uniforme, senza sapere nulla dei dettagli del provider scelto.
const { generateRasterImage } = require("./_lib/imageProviderAdapter");

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  const { prompt } = request.body || {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    response.status(400).json({ ok: false, error: "Campo 'prompt' mancante o vuoto." });
    return;
  }
  try {
    const risultato = await generateRasterImage(prompt.trim());
    response.status(200).json(risultato);
  } catch (e) {
    response.status(200).json({ ok: false, error: `Generazione immagine raster fallita: ${e.message}` });
  }
};
