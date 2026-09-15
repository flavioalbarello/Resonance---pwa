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
// Autenticazione — DUE strade, non una (15/09/2026, dalla domanda del Ghost su come dare la chiave
// a un futuro nuovo utente senza fargli toccare Vercel):
//  1. la chiave del CHIAMANTE, mandata nel corpo della richiesta — sta in Setup nell'app, come la
//     chiave OpenRouter: vive solo sul suo dispositivo, non serve nessun accesso a Vercel.
//  2. SERPER_API_KEY come variabile d'ambiente su Vercel — ripiego per chi preferisce una chiave
//     unica di progetto invece che per persona.
// Quella del chiamante vince se c'è. Non è mai il codice del repository a contenerla: quella
// resterebbe una chiave bruciata (vedi PRINTIFY_API_TOKEN in printifyClient.js).
//
// Nota su Serper stesso, da dire al Ghost e non nascondere: non è un'API ufficiale di Google, è
// scraping dei risultati veri — zona grigia rispetto ai Termini di servizio di Google, anche se
// pratica commerciale diffusa. Per il volume di questa app (due utenti, ricerche sporadiche) il
// rischio pratico è trascurabile, ma è una scelta diversa da un contratto diretto con Google.
const SERPER_BASE = "https://google.serper.dev";

function leggiChiave(chiaveDelChiamante) {
  return String(chiaveDelChiamante || "").trim() || process.env.SERPER_API_KEY || "";
}

async function cercaImmagini(query, chiave, num = 10) {
  const res = await fetch(`${SERPER_BASE}/images`, {
    method: "POST",
    headers: { "X-API-KEY": chiave, "Content-Type": "application/json" },
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
