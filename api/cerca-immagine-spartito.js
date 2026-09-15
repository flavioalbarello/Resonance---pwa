// Endpoint "arrivare direttamente all'immagine" — vedi RIPARTENZA_2026-09-15 §7 e
// lib/spartito.js (`immaginiSpartitoDaSerper`), che filtra e ordina quello che questo restituisce.
// Qui sta SOLO la chiamata a Serper e la forma grezza del risultato: l'interpretazione — pertinenza,
// dominio, cosa mostrare — resta in lib/spartito.js, un posto solo, come il corriere del
// service worker non sa cos'è uno spartito.
//
// La chiave arriva DAL CHIAMANTE (`apiKey` nel corpo, dalla Setup dell'app) con ripiego su
// SERPER_API_KEY su Vercel — vedi serperClient.js. Non tiene mai la chiave in un log: la usa e basta.
const { leggiChiave, cercaImmagini } = require("./_lib/serperClient");

module.exports = async (request, response) => {
  if (request.method !== "POST") { response.status(405).json({ ok: false, error: "Metodo non consentito, usa POST." }); return; }
  const { query, apiKey } = request.body || {};
  if (!query || typeof query !== "string" || !query.trim()) {
    response.status(400).json({ ok: false, error: "Campo 'query' mancante o vuoto." });
    return;
  }
  const chiave = leggiChiave(apiKey);
  if (!chiave) {
    response.status(200).json({ ok: false, error: "Nessuna chiave Serper: né in Setup, né SERPER_API_KEY su Vercel. La ricerca diretta per immagini non è disponibile finché non ne imposti una — il resto della ricerca spartiti funziona comunque." });
    return;
  }
  try {
    const dati = await cercaImmagini(query.trim(), chiave);
    response.status(200).json({ ok: true, risultati: Array.isArray(dati.images) ? dati.images : [] });
  } catch (e) {
    response.status(200).json({ ok: false, error: e.message });
  }
};
