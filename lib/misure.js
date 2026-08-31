// Serie misurate e derivate — il programma calcola, il modello non stima.
// Estratto da app.js il 31/08/2026. Zero dipendenze: prende numeri, restituisce numeri e righe.

//──────────────────────────────────────────────────────────
// SERIE E DERIVATE — il programma calcola, il modello non stima (31/08/2026)
//──────────────────────────────────────────────────────────
// Nato dal referto retrospettivo del 31/08. La carenza dichiarata era "il corpo non manda dati al
// pilastro del corpo" — e guardando il codice per implementarla si e' scoperto che meta' era falsa,
// nel modo piu' fastidioso: i dati CI SONO GIA'. Ogni voce BIO porta `weight` e `sleep` da sempre
// (vedi BioEntryForm e formatBioLog), e lo Shell li estrae gia' dalla conversazione da solo
// (readings.weight nel JSON di lettura). Cio' che mancava non era l'ingresso: era che nessuno
// calcolasse niente su quei numeri. Prova documentale, buildResonanceDigest riga per riga:
//     "BIO: ultima voce 3 giorni fa. Percorsi attivi: ..."
// Questo e' TUTTO cio' che Simbiosi sa in termini numerici sul pilastro della salute. Non il peso,
// non la tendenza, non da quanto. Se una lettura sull'andamento del corpo compare comunque nelle
// sintesi, e' inventata — non c'e' nessun numero da cui possa venire.
//
// Quindi niente nuovo archivio, niente migrazione, niente chiamata in piu' al modello, zero token:
// i fatti erano gia' nel log, mancava chi li leggesse. E' la stessa regola gia' pagata cara sul
// piano alimentare — il modello dice a parole, il programma va a cercarlo davvero — applicata
// finalmente anche qui, che era la carenza 03 del referto.
//
// Deliberatamente NON incluso: estrarre misure dal testo libero delle note con espressioni regolari.
// Lo Shell riempie gia' `weight`/`sleep` quando il Ghost li nomina, quindi si aggiungerebbe una
// fonte fragile ("150g di pollo", "1600 kcal", "tre serie da 12") per duplicare una cosa che
// funziona. Se un giorno servisse davvero, e' un innesto separato, non un pezzo di questo.
function numeroItaliano(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const m = t.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}
// Il sonno il Ghost lo scrive come gli viene: "7", "7,5", "6h30", "7:30", "7 ore e 30". Le forme
// ore+minuti vanno riconosciute PRIMA, altrimenti "6h30" diventa 6 e mezz'ora sparisce ogni volta.
const ORE_MINUTI_RE = /(\d{1,2})\s*(?:h|:|ore?)\s*(?:e\s*)?(\d{1,2})\b/i;
function oreDaTesto(v) {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const hm = t.match(ORE_MINUTI_RE);
  if (hm && Number(hm[2]) < 60) return Number(hm[1]) + Number(hm[2]) / 60;
  return numeroItaliano(t);
}
// I limiti di plausibilita' non sono pignoleria: `weight` e' un campo di testo libero, e un dito
// scivolato ("784" invece di "78,4") inquinerebbe una serie per sempre, con una derivata che poi
// finisce dritta dentro un prompt come se fosse un fatto.
const PESO_MIN = 20, PESO_MAX = 400;
function fattiDaLogBio(voci) {
  const fatti = [];
  for (const v of voci || []) {
    if (!v?.date) continue;
    const peso = numeroItaliano(v.weight);
    if (peso !== null && peso >= PESO_MIN && peso <= PESO_MAX)
      fatti.push({ id: `${v.id}:peso`, data: v.date, pilastro: "bio", soggetto: "peso", valore: peso, unita: "kg" });
    const sonno = oreDaTesto(v.sleep);
    if (sonno !== null && sonno > 0 && sonno <= 24)
      fatti.push({ id: `${v.id}:sonno`, data: v.date, pilastro: "bio", soggetto: "sonno", valore: sonno, unita: "h" });
  }
  return fatti;
}
// Una misura per giorno, in ordine crescente. Due pesate lo stesso giorno non sono una tendenza:
// tenerle entrambe farebbe comparire una "variazione" di mezzo chilo in zero giorni.
function serieDi(fatti, soggetto) {
  const perGiorno = new Map();
  for (const f of fatti || []) {
    if (f?.soggetto !== soggetto || typeof f.valore !== "number") continue;
    const giorno = String(f.data).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) continue;
    const gia = perGiorno.get(giorno);
    if (!gia || String(f.data) >= String(gia.data)) perGiorno.set(giorno, f);
  }
  return [...perGiorno.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
}
// La derivata vera: differenza fra il primo e l'ultimo, sul tempo che c'e' davvero in mezzo.
// Sotto i due giorni il "per settimana" e' un'estrapolazione, non una misura, e resta null: meglio
// una riga che dice meno di una che moltiplica per sette un rumore di un giorno.
function derivata(serie) {
  const s = serie || [];
  if (s.length < 2) return null;
  const primo = s[0], ultimo = s[s.length - 1];
  const giorni = Math.round((new Date(ultimo.data).getTime() - new Date(primo.data).getTime()) / 86400000);
  if (!Number.isFinite(giorni) || giorni <= 0) return null;
  const delta = ultimo.valore - primo.valore;
  return {
    n: s.length, primo, ultimo, giorni, delta,
    perSettimana: giorni >= 2 ? (delta / giorni) * 7 : null,
    direzione: delta > 0 ? "in salita" : delta < 0 ? "in discesa" : "stabile",
  };
}
// Carenza 06 del referto: ogni inferenza dichiara su cosa poggia. Un dato di marzo e uno di ieri
// non possono uscire dalla stessa bocca con la stessa voce.
const GIORNI_FRESCO = 7, GIORNI_STANTIO = 30;
function freschezza(dataISO, ora = Date.now()) {
  const t = new Date(dataISO).getTime();
  if (!Number.isFinite(t)) return null;
  const giorni = Math.max(0, Math.floor((ora - t) / 86400000));
  return { giorni, stato: giorni <= GIORNI_FRESCO ? "fresco" : giorni <= GIORNI_STANTIO ? "stantio" : "vecchio" };
}
function numeroBreve(n, dec = 1) {
  if (!Number.isFinite(n)) return "";
  const r = Math.abs(n) >= 100 ? Math.round(n) : Number(n.toFixed(dec));
  return String(r).replace(".", ",");
}
function etaInParole(giorni) {
  return giorni === 0 ? "oggi" : giorni === 1 ? "ieri" : `${giorni} giorni fa`;
}
const SOGGETTI_SERIE = [
  { soggetto: "peso", etichetta: "Peso", unita: "kg" },
  { soggetto: "sonno", etichetta: "Sonno", unita: "h" },
];
// Una riga per serie, gia' in italiano leggibile — va sia nei prompt sia sotto gli occhi del Ghost,
// e deve dire la stessa identica cosa nei due posti: se il modello e l'app raccontassero due
// tendenze diverse sullo stesso peso, sarebbe peggio che non dirla affatto.
function righeSerie(fatti, ora = Date.now()) {
  const out = [];
  for (const { soggetto, etichetta, unita } of SOGGETTI_SERIE) {
    const s = serieDi(fatti, soggetto);
    if (!s.length) continue;
    const ultimo = s[s.length - 1];
    const f = freschezza(ultimo.data, ora);
    const eta = f ? etaInParole(f.giorni) : "data illeggibile";
    const d = derivata(s);
    if (!d) { out.push({ soggetto, testo: `${etichetta}: ${numeroBreve(ultimo.valore)} ${unita} (${eta}) — una sola misura, nessuna tendenza calcolabile`, stato: f?.stato }); continue; }
    const passo = d.perSettimana !== null
      ? `, ${d.perSettimana > 0 ? "+" : "−"}${numeroBreve(Math.abs(d.perSettimana), 2)} ${unita}/settimana`
      : "";
    const avviso = f && f.stato !== "fresco" ? ` · dato ${f.stato}: l'ultima misura ha ${f.giorni} giorni` : "";
    out.push({
      soggetto,
      testo: `${etichetta}: ${numeroBreve(ultimo.valore)} ${unita} (${eta}) — ${d.direzione} di ${numeroBreve(Math.abs(d.delta))} ${unita} in ${d.giorni} giorni${passo}, su ${d.n} misure${avviso}`,
      stato: f?.stato,
    });
  }
  return out;
}
function formatSerieBlock(fatti, ora = Date.now()) {
  const righe = righeSerie(fatti, ora);
  if (!righe.length) return "";
  return `\nSERIE MISURATE — numeri CALCOLATI dal programma sul log reale, non stimati. Usa questi e solo questi quando parli di andamento del corpo: se una tendenza non e' qui sotto, non esiste e non va inventata (una nota in prosa non e' una misura). Quando una riga dichiara il dato stantio o vecchio, dillo invece di parlarne come se fosse di oggi.\n${righe.map((r) => `- ${r.testo}`).join("\n")}`;
}

export {
  GIORNI_FRESCO,
  GIORNI_STANTIO,
  ORE_MINUTI_RE,
  PESO_MAX,
  PESO_MIN,
  SOGGETTI_SERIE,
  derivata,
  etaInParole,
  fattiDaLogBio,
  formatSerieBlock,
  freschezza,
  numeroBreve,
  numeroItaliano,
  oreDaTesto,
  righeSerie,
  serieDi,
};
