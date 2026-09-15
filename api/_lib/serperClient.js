// Client Serper (ricerca immagini) — 15/09/2026.
// «Non le abbiamo già le API per la ricerca online, ad esempio quella di Balthasar?» No: quella è
// `openrouter:web_search`, un modello che cerca e DESCRIVE in prosa cosa ha trovato — l'indirizzo
// dell'immagine viene tirato fuori con una regex da testo libero, ed è la causa di metà dei bug
// trovati in questa sessione (campo che si mangia la riga dopo, indirizzo inventato...). Serper
// interroga Google davvero e restituisce indirizzi VERI, strutturati, in JSON.
//
// Costo verificato il 15/09/2026 sulla pagina prezzi di Serper: 2500 query gratis una tantum, poi
// da $1/1000 a $0,30/1000 a volume — contro gli $0,007 A CHIAMATA del plugin web_search di
// OpenRouter, più i token, più eventuali letture di documenti a valle.
//
// Autenticazione: chiave dalla dashboard serper.dev. Vive SOLO come variabile d'ambiente su Vercel
// (SERPER_API_KEY), mai nel repository e mai nel frontend — stessa regola di PRINTIFY_API_TOKEN
// (vedi printifyClient.js): una chiave dentro un file che gira è una chiave bruciata.
//
// Nota su Serper stesso, da dire al Ghost e non nascondere: non è un'API ufficiale di Google, è
// scraping dei risultati veri — zona grigia rispetto ai Termini di servizio di Google, anche se
// pratica commerciale diffusa. Per il volume di questa app (due utenti, ricerche sporadiche) il
// rischio pratico è trascurabile, ma è una scelta diversa da un contratto diretto con Google.
const SERPER_BASE = "https://google.serper.dev";

function leggiChiave() {
  return process.env.SERPER_API_KEY || "";
}

async function cercaImmagini(query, num = 10) {
  const res = await fetch(`${SERPER_BASE}/images`, {
    method: "POST",
    headers: { "X-API-KEY": leggiChiave(), "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.message || data?.raw || `HTTP ${res.status}`;
    const err = new Error(`Serper /images → ${res.status}: ${message}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = { leggiChiave, cercaImmagini };
