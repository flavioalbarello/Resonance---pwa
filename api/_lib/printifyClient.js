// Client Printify condiviso (FASE 2, brief 14/08/2026).
// Prima esisteva una printifyRequest privata dentro printify-create-product.js: con tre endpoint che
// parlano con Printify, duplicarla tre volte significherebbe tre punti dove sbagliare l'header o la
// gestione dell'errore. Qui sta una volta sola.
//
// Autenticazione: Personal Access Token dalla dashboard Printify (My Profile → Connections), NON OAuth.
// Vive SOLO come variabile d'ambiente su Vercel (PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID). Non passa mai
// dal frontend: è la ragione per cui questi endpoint esistono invece di chiamare Printify dal browser.
//
// Fonti verificate il 14/08/2026 sulla specifica OpenAPI ufficiale (developers.printify.com/openapi.json),
// non sulla memoria del modello:
//  - GET  /v1/shops.json → [{ id, title, sales_channel }] ; sales_channel vale "disconnected" se nessun
//    canale di vendita è collegato. È il modo per sapere se Etsy è davvero agganciato.
//  - POST /v1/shops/{shop_id}/products/{product_id}/publish.json → corpo fatto di FLAG BOOLEANI
//    ({title, description, images, variants, tags, keyFeatures, shipping_template}), non di contenuti:
//    dice QUALI campi spingere sul canale, non cosa scriverci.
//  - Limiti dichiarati: 600 richieste/minuto globali, 100/minuto sul catalogo, 200 ogni 30 minuti
//    sulla pubblicazione prodotti.
const PRINTIFY_BASE = "https://api.printify.com/v1";

function leggiCredenziali() {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId = process.env.PRINTIFY_SHOP_ID;
  return { token, shopId, complete: Boolean(token && shopId) };
}

async function printifyRequest(path, token, options = {}) {
  const res = await fetch(`${PRINTIFY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Resonance-PWA/1.0",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const message = data?.errors ? JSON.stringify(data.errors) : (data?.error || data?.raw || `HTTP ${res.status}`);
    const err = new Error(`Printify ${path} → ${res.status}: ${message}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Risposta uniforme per la modalità "prova a vuoto" (dryRun): descrive per intero la chiamata che
// SAREBBE partita, senza farla partire. Serve a verificare la catena a costo zero e senza effetti,
// e a mostrare al Ghost cosa sta per uscire prima che esca (C.10: si ferma e mostra, non filtra).
function rispostaProvaAVuoto(descrizione, chiamate) {
  return {
    ok: true,
    provaAVuoto: true,
    descrizione,
    chiamateCheSarebberoPartite: chiamate,
    nota: "Nessuna chiamata è stata inviata a Printify. Nessun prodotto creato, niente pubblicato, costo zero.",
  };
}

module.exports = { PRINTIFY_BASE, leggiCredenziali, printifyRequest, rispostaProvaAVuoto };
