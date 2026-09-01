// GESTO A (brief esoscheletro 15/08/2026) — Preact e htm erano caricati da una CDN esterna.
// Misurato: la catena costava ~900 ms sul percorso critico PRIMA che esistesse una schermata, perche'
// esm.sh risponde con un rimando ("export * from ...") e ogni modulo costa quindi due viaggi di rete
// invece di uno. Con il budget di 200 ms del brief, quella sola catena valeva quattro volte tutto.
// Peggio: senza rete l'app non si disegnava affatto, nemmeno con tutti i dati gia' sul dispositivo.
// Ora i tre moduli vivono nel repo, sono gli stessi byte scaricati da esm.sh (nessuna versione
// cambiata), e il service worker puo' finalmente metterli in cache come tutto il resto.
// Non e' un passo di build: sono tre file copiati.
import { h, render } from "./vendor/preact.mjs";
import { useState, useEffect, useCallback, useRef, useErrorBoundary } from "./vendor/preact-hooks.mjs";
import htm from "./vendor/htm.mjs";
import { CONFIG } from "./config.js";
// I moduli estratti da questo file il 31/08/2026 (vedi l'intestazione di ciascuno).
import {
  daysSince,
  fmtDate,
  nowContext,
  senzaAccenti,
  todayISO,
  uid,
} from "./lib/base.js";
import {
  derivata,
  fattiDaLogBio,
  formatSerieBlock,
  freschezza,
  righeSerie,
} from "./lib/misure.js";
import {
  alimentiEsclusiDaiVincoli,
  controllaPianoAlimentare,
  eVincoloAlimentare,
  estraiParametriPiano,
  filtraRepertorioPerVincoli,
  formatPianoAlimentare,
  montaPianoAlimentare,
  proponiVincoliAlimentari,
  richiestaDiPianoAlimentare,
  validaRepertorio,
} from "./lib/alimentare.js";

const html = htm.bind(h);

// Versione build visibile in Setup: verifica in un colpo d'occhio che il deploy live sia questo file.
const APP_BUILD = "2026-09-01 · i-nodi-si-leggono-e-si-aprono";

const C = { bio: "#3F7860", air: "#3A3F4A", vidya: "#B8863A", core: "#C9A96E", muted: "#8B92A0" };
// ── Allegati Shell: immagini (viste dal modello), PDF (testo estratto), testo semplice ──
function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const base64 = reader.result.split(",")[1]; resolve({ mediaType: file.type || "image/jpeg", base64, name: file.name }); };
    reader.onerror = () => reject(new Error("Lettura immagine fallita."));
    reader.readAsDataURL(file);
  });
}
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Lettura file fallita."));
    reader.readAsText(file);
  });
}
async function extractPdfText(file) {
  const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs";
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text.trim();
}
async function processAttachment(file) {
  if (file.type.startsWith("image/")) { const img = await readImageAsBase64(file); return { kind: "image", ...img }; }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const text = await extractPdfText(file);
    if (!text || text.length < 5) throw new Error("Nessun testo trovato nel PDF — probabilmente è una scansione/foto. Prova a fotografare la pagina e caricarla come immagine.");
    return { kind: "text", content: text, name: file.name };
  }
  if (file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name)) return { kind: "text", content: await readTextFile(file), name: file.name };
  throw new Error("Formato non supportato. Usa immagini (jpg/png), PDF con testo selezionabile, o file .txt/.md.");
}

// ── Sintesi vocale del browser (gratuita, nessuna API esterna) ──
function pickItalianVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices.find((v) => v.lang?.toLowerCase().startsWith("it")) || voices[0] || null;
}
function speakText(text, onEnd) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel(); // sincrono, nello stesso istante del tocco: un ritardo qui fa bloccare l'audio ai browser mobili
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickItalianVoice();
  if (voice) utter.voice = voice;
  utter.lang = voice?.lang || "it-IT";
  utter.rate = 1.0;
  utter.onend = () => onEnd && onEnd();
  utter.onerror = () => onEnd && onEnd();
  window.speechSynthesis.speak(utter);
}
function stopSpeaking() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  setTimeout(() => { try { window.speechSynthesis.cancel(); } catch {} }, 60); // bug noto Chrome Android: cancel() a volte non interrompe al primo colpo
}


//──────────────────────────────────────────────────────────
// PIANO DI CONTROLLO — BLOCCO 1: FONDAMENTA (architettura Shell V1, 16/08/2026)
//──────────────────────────────────────────────────────────
// NOTA DI DIAGNOSI, misurata prima di scrivere una riga (16/08/2026).
// Il documento di architettura attribuiva il difetto "lo Shell non riesce a riprendere un percorso"
// alla mancanza di stato conversazionale, e il problema di costo al fatto che ogni turno rimanda
// "Manifesto, memoria dei tre pilastri, sedimento e profilo". Misurando il prompt reale:
//   - e' 6.775 caratteri, circa 1.880 token, e NON cresce con la storia del sistema;
//   - il sedimento NON c'e' (entra solo in buildResonanceDigest, che e' Simbiosi, non lo Shell);
//   - i percorsi NON ci sono, in nessuna forma: ne' i titoli, ne' gli identificativi.
// Quindi la causa prima non e' la memoria della conversazione: e' che lo Shell non ha MAI saputo
// quali percorsi esistano. Anche con uno stato conversazionale perfetto non potrebbe riprenderne
// uno, perche' non ne conosce il nome. E' la stessa classe del piano alimentare — una funzione che
// non riceve cio' che dovrebbe avere sotto mano — ma la cura non e' infrastruttura di recupero:
// e' un inventario, piccolo e limitato.
// Il fuoco serve comunque, ed e' costruito qui: senza, l'inventario dice cosa esiste ma non su cosa
// si sta lavorando adesso.

// ── Il fuoco conversazionale (§2.2) ──
// Deliberatamente povero: un puntatore, non un riassunto. Una struttura ricca qui diventerebbe una
// seconda fonte di verita', classe di bug gia' pagata con la sincronizzazione.
const FUOCO_SCADENZA_ORE = 8; // oltre, torna a "nessuno": un contesto ereditato da ieri e non
                              // dichiarato e' peggio di nessun contesto (§2.2)
const FUOCO_VUOTO = { tipo: "nessuno", id: null, etichetta: null, apertoIl: null, ultimoTocco: null };
function fuocoScaduto(f) {
  if (!f || f.tipo === "nessuno" || !f.ultimoTocco) return true;
  return (Date.now() - new Date(f.ultimoTocco).getTime()) / 3600000 > FUOCO_SCADENZA_ORE;
}
// Letto SEMPRE attraverso questa funzione, mai direttamente: e' l'unico punto in cui la scadenza
// viene applicata, quindi non esiste un percorso di lettura che possa dimenticarsene.
function leggiFuoco() {
  const f = loadKey("fuoco-conversazionale", FUOCO_VUOTO);
  return fuocoScaduto(f) ? FUOCO_VUOTO : f;
}
function scriviFuoco(f) { saveKey("fuoco-conversazionale", f || FUOCO_VUOTO); return f || FUOCO_VUOTO; }
function apriFuoco(tipo, id, etichetta) {
  const ora = new Date().toISOString();
  const prec = leggiFuoco();
  // Riaprire lo stesso oggetto non azzera da quando ci si lavora: aggiorna solo l'ultimo tocco.
  const apertoIl = prec.tipo === tipo && prec.id === id && prec.apertoIl ? prec.apertoIl : ora;
  return scriviFuoco({ tipo, id, etichetta, apertoIl, ultimoTocco: ora });
}
function chiudiFuoco() { return scriviFuoco(FUOCO_VUOTO); }

// ── Inventario (la causa reale) ──
// Cosa esiste, in forma minima: titolo e identificativo. Limitato apposta — un inventario che cresce
// senza tetto ricrea esattamente il problema di costo che il documento temeva (e che oggi non c'e').
const INVENTARIO_TETTO_PER_PILASTRO = 8;
function costruisciInventario({ pBio, pAir, pVidya, semi }) {
  const riga = (p) => `${p.title}${p.kind === "identitario" ? " [identitario]" : ""} (id:${p.id})`;
  const perPilastro = (lista, nome) => {
    const attivi = (lista || []).slice(0, INVENTARIO_TETTO_PER_PILASTRO);
    return `${nome}: ${attivi.length ? attivi.map(riga).join(" · ") : "nessun percorso aperto"}`;
  };
  // Stato in forma grezza e non tradotto di proposito: SEME_STATUS_LABELS e' un const dichiarato
  // piu' in basso nel file, e dipenderne da qui creerebbe un ordine fragile. Il vocabolario degli
  // stati e' gia' spiegato al modello in APP_CAPABILITIES_CONTEXT, quindi la traduzione e' inutile.
  const semiAttivi = (semi || []).filter((s) => s.status !== "archived").slice(0, INVENTARIO_TETTO_PER_PILASTRO);
  return `Percorsi e Semi che esistono ORA in questo sistema — quando il Ghost si riferisce a uno di essi, anche in modo vago ("quello sul sonno"), e' uno di questi e nessun altro. Non inventarne, non ricordarne di vecchi: se non e' in questo elenco, non esiste.
${perPilastro(pBio, "BIO")}
${perPilastro(pAir, "AIR")}
${perPilastro(pVidya, "VIDYA")}
Semi AIR: ${semiAttivi.length ? semiAttivi.map((s) => `"${String(s.content).slice(0, 60)}" (id:${s.id}, ${s.status})`).join(" · ") : "nessuno"}`;
}
// 31/08/2026 — IL FASCICOLO DEL PERCORSO APERTO.
// Il Ghost: "il percorso e il materiale annesso sarà richiamabile e implementabile dalla chat?".
// Era no, e questo blocco era il punto preciso in cui diventava no: fino a stamattina portava
// SOLO l'etichetta e l'id. Lo Shell sapeva che esisteva un percorso chiamato "Divenire" e non
// sapeva che ci fossero dentro i testi di due atti — quindi, alla richiesta di continuare, poteva
// solo ricominciare da capo o inventare cosa c'era prima.
// Il fascicolo c'e' SOLO quando un percorso e' aperto, e il fuoco scade da solo dopo otto ore:
// il costo in token e' limitato al tempo in cui si sta davvero lavorando su qualcosa.
function dossierPercorso(percorso) {
  if (!percorso) return "";
  const nodi = (percorso.topics || []).map((t) => `${t.label}: ${t.status}`).join("; ");
  const righe = [
    nodi ? `Nodi: ${nodi}` : null,
    percorso.competenze ? `Competenze accumulate finora: ${percorso.competenze}` : null,
    percorso.localMemory ? `Memoria specifica del percorso (vincoli e tentativi annotati dal Ghost — priorità massima): ${percorso.localMemory}` : null,
  ].filter(Boolean);
  const documenti = indiceDocumentiBlock(percorso.documents);
  if (!righe.length && !documenti) return "";
  return `\nCosa contiene questo percorso ADESSO — è materiale vero, conservato nell'app, non un ricordo tuo:\n${righe.join("\n")}${documenti}`;
}
// ── 31/08/2026 — RIAPRIRE UN DOCUMENTO DEL PERCORSO ───────────────────────────────────────────
// Ricerca deterministica, zero token, sullo stesso schema del recupero di Grado 0: si contano le
// parole piene in comune fra ciò che il Ghost ha detto e il titolo del documento. Restituisce
// SEMPRE i candidati e non sceglie mai al posto suo quando sono a pari punteggio — la
// disambiguazione è obbligatoria, ed è la regola che vale già per i percorsi e per gli eventi.
const RUMORE_DOCUMENTO_RE = /\b(il|lo|la|i|gli|le|l|un|uno|una|del|dello|della|dei|delle|documento|documenti|testo|testi|file|allegato|percorso|salvat\w*|dentro|nel|nella|che|abbiamo|ho|hai|mi|per|intero|completo|completa|quello|questo)\b/gi;
// I numeri di un titolo, arabi o romani. Servono SOLO allo spareggio (vedi sotto): "atto i" e
// "atto ii" hanno le stesse parole piene, e paroleUtili butta via i token di due lettere o meno —
// cioè proprio quello che li distingue.
// Imprecisione dichiarata: in italiano l'articolo "i" e il numero romano I sono la stessa stringa,
// quindi "i testi" può risolvere su "Atto I". Nel caso peggiore riapre il documento sbagliato — che
// è una LETTURA, non una scrittura: costa un turno e si corregge dicendolo.
function numeriDelTitolo(testo) {
  return normalizzaTesto(testo).split(" ").filter((p) => /^(?:[ivx]{1,4}|\d{1,3})$/.test(p));
}
function trovaDocumentoNelPercorso(percorso, riferimento) {
  const docs = (percorso?.documents || []).filter((d) => d && String(d.text || "").trim());
  if (!docs.length) {
    return { esito: "nessuno", candidati: [], motivo: percorso
      ? "questo percorso non contiene ancora nessun documento con il testo dentro"
      : "non c'è nessun percorso aperto da cui prendere un documento" };
  }
  const chiave = paroleUtili(String(riferimento || "").replace(RUMORE_DOCUMENTO_RE, " "));
  // Nessuna parola utile ("rileggimelo"): con un solo documento non c'è ambiguità da risolvere.
  if (!chiave.length) {
    return docs.length === 1
      ? { esito: "trovato", doc: docs[0], candidati: [docs[0]] }
      : { esito: "ambiguo", candidati: docs.slice(0, 6), motivo: "non ho capito quale dei documenti" };
  }
  const punteggiati = docs
    .map((d) => {
      const parole = new Set(paroleUtili(`${d.title || ""} ${d.name || ""}`));
      let punteggio = 0;
      for (const k of chiave) if (parole.has(k)) punteggio++;
      return { doc: d, punteggio, numeri: numeriDelTitolo(`${d.title || ""} ${d.name || ""}`) };
    })
    .filter((x) => x.punteggio > 0)
    .sort((a, b) => b.punteggio - a.punteggio);
  // Nessuna corrispondenza: con un solo documento non c'è nient'altro che il Ghost possa intendere.
  // Con più d'uno si dichiara, e si dice cosa c'è invece di indovinare.
  if (!punteggiati.length) {
    return docs.length === 1
      ? { esito: "trovato", doc: docs[0], candidati: [docs[0]] }
      : { esito: "nessuno", candidati: docs.slice(0, 6), motivo: `nessun documento di questo percorso corrisponde a "${riferimento}"` };
  }
  const massimo = punteggiati[0].punteggio;
  let aPari = punteggiati.filter((x) => x.punteggio === massimo);
  // LO SPAREGGIO SUI NUMERI. "Atto I" e "Atto II" hanno le stesse parole piene — "atto" — perché
  // paroleUtili tiene solo i termini di più di due lettere e butta via proprio la cosa che li
  // distingue. Senza questo, "rileggimi l'Atto I" è ambiguo sempre, che è il caso più ovvio di
  // tutti. I numeri contano solo QUI, a parità di punteggio, mai come punteggio a sé: da soli
  // farebbero vincere un documento che non c'entra ma ha per caso il numero giusto.
  if (aPari.length > 1) {
    const numeriChiesti = numeriDelTitolo(riferimento);
    if (numeriChiesti.length) {
      const conIlNumero = aPari.filter((x) => numeriChiesti.some((n) => x.numeri.includes(n)));
      if (conIlNumero.length) aPari = conIlNumero;
    }
  }
  return aPari.length > 1
    ? { esito: "ambiguo", candidati: aPari.map((x) => x.doc), motivo: "più di un documento corrisponde allo stesso modo" }
    : { esito: "trovato", doc: aPari[0].doc, candidati: [aPari[0].doc] };
}
// Il tetto esiste perché un documento può essere lungo quanto si vuole e il turno no. Tagliare
// dichiarandolo è l'unica forma onesta: il modello sa di avere una parte, non crede di avere tutto.
const TETTO_DOCUMENTO_NEL_TURNO = 12000;
function formatDocumentoAperto(apertura) {
  if (!apertura) return "";
  if (apertura.esito === "trovato") {
    const testo = String(apertura.doc.text || "");
    const tagliato = testo.length > TETTO_DOCUMENTO_NEL_TURNO;
    return `\nUN DOCUMENTO DEL PERCORSO È STATO RIAPERTO DAVVERO ADESSO, e il suo testo è qui sotto${tagliato ? ` — tagliato ai primi ${TETTO_DOCUMENTO_NEL_TURNO} caratteri su ${testo.length}, dillo al Ghost se ti serve il resto` : " per intero"}. È materiale reale, già prodotto e conservato nell'app: lavoraci sopra parola per parola, non riscriverlo da capo e non dire di ricordarlo diversamente da com'è.\n--- "${apertura.doc.title || apertura.doc.name}" (${fmtDate(apertura.doc.date)}) ---\n${testo.slice(0, TETTO_DOCUMENTO_NEL_TURNO)}\n--- fine del documento ---`;
  }
  if (apertura.esito === "ambiguo") {
    return `\nIl Ghost ha chiesto di riaprire un documento del percorso, ma più d'uno corrisponde: ${apertura.candidati.map((c) => `"${c.title || c.name}"`).join(", ")}. Chiedi quale intende — non sceglierne uno tu, e non rispondere come se l'avessi letto.`;
  }
  return `\nIl Ghost ha chiesto di riaprire un documento del percorso e NON è stato riaperto: ${apertura.motivo}. Dillo con questo motivo${apertura.candidati?.length ? ` (nel percorso ci sono: ${apertura.candidati.map((c) => `"${c.title || c.name}"`).join(", ")})` : ""}, e non rispondere con quello che ricordi.`;
}
function formatFuocoBlock(fuoco) {
  if (!fuoco || fuoco.tipo === "nessuno") return "Non state lavorando su niente in particolare in questo momento.";
  const da = fuoco.apertoIl ? fmtDate(fuoco.apertoIl) : "poco fa";
  return `State lavorando su: ${fuoco.etichetta} (${fuoco.tipo}, id:${fuoco.id}, aperto il ${da}). Quando il Ghost dice "questo", "quello", "il percorso", senza altre indicazioni, si riferisce a questo. Se cambia argomento in modo evidente, dillo invece di continuare ad assumerlo.${fuoco.dossier || ""}`;
}

// ── Recupero di Grado 0 (§3.2) — deterministico, ZERO token ──
// Non serve un modello per trovare un percorso dal titolo: e' una ricerca che il programma fa da
// solo sulle strutture gia' in memoria. Copre la maggioranza dei casi reali.
// Restituisce SEMPRE l'elenco completo dei candidati, mai una scelta: la disambiguazione e'
// obbligatoria (§7.2b), e chi cerca non deve poter decidere al posto del Ghost.
function normalizzaTesto(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // via gli accenti: "però" e "pero" devono incontrarsi
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const PAROLE_VUOTE = new Set(["il","lo","la","i","gli","le","un","uno","una","di","a","da","in","con","su","per","tra","fra","e","o","che","quello","questa","questo","quella","sul","sulla","sui","del","della","dei","delle","mio","mia","riprendi","apri","continua","vai","al","allo","alla","ai","agli","alle","nel","nella"]);
function paroleUtili(testo) {
  return normalizzaTesto(testo).split(" ").filter((p) => p.length > 2 && !PAROLE_VUOTE.has(p));
}
// ══════════════════════════════════════════════════════════════════════════════
// LE VOCI GEMELLE — una voce di log non si duplica nello stesso giorno (31/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Portato dal Ghost con lo schermo davanti: cinque voci nel Log VIDYA nella stessa mezz'ora, tutte
// sullo stesso concept album, ciascuna un po' piu' avanti della precedente. Nessuna delle cinque e'
// sbagliata presa da sola — a ogni turno il modello produce una lettura del pilastro e il programma
// la scrive come voce NUOVA, senza mai guardare quelle che ci sono gia'. Non e' il modello che fa
// male il suo mestiere: e' il programma che non fa il suo.
//
// Misura in codice, zero token: sovrapposizione delle parole piene (indice di Jaccard) fra la
// lettura nuova e le voci dello stesso giorno. Il macchinario esisteva gia' ed e' quello del
// recupero di Grado 0 (paroleUtili + PAROLE_VUOTE). NON si chiede al modello "e' un doppione?":
// costerebbe una chiamata, e sarebbe il modello a giudicare la propria ripetizione — esattamente
// cio' che questo file continua a togliergli di mano.
//
// E QUANDO COMBACIANO, decide la Legge 14. Non saltare la voce (perdita silenziosa) e non
// sovrascriverla (distruttiva): la voce esistente PRENDE UNA VERSIONE NUOVA. Tiene il suo id e la
// sua data d'origine, il testo vecchio scende in `versioni`, il piu' recente diventa quello
// visibile. Stesso schema gia' usato per il Kernel (history) e per la memoria procedurale
// (sedimento): una voce nel log, tutta la sua storia dentro, niente perso.
// LA SOGLIA E' MISURATA, NON SCELTA A OCCHIO — e la misura mi ha smentito. Avevo scritto 0,34
// a intuito: sulle cinque voci vere del Ghost non fondeva NIENTE. I numeri reali (indice di
// Jaccard fra titolo+note, tutte e cinque le voci del Log VIDYA del 31/08):
//     voci sullo stesso album, fra loro:            0,214  0,231  0,276
//     l'album contro la voce estranea ("Domanda esistenziale sul senso"):  0,010 – 0,046
//     l'album contro la voce che lo chiamava ancora "Anagenesi/Cenogenesi": 0,088 – 0,094
// Separazione netta fra rumore (≤ 0,094) e segnale (≥ 0,214), quindi qualunque valore in mezzo
// da' lo stesso risultato: 0,15 sta comodo fra i due, con margine da entrambe le parti.
// COSA FA DAVVERO, detto senza abbellirlo: sul caso reale porta cinque voci a TRE, non a una. La
// voce che chiamava l'album con un altro nome di lavorazione resta fuori — e' il limite che avevo
// dichiarato prima di misurare, ed e' rimasto li'. Abbassare la soglia sotto 0,094 per prenderla
// ridurrebbe il margine sul rumore a meno del doppio: preferisco una voce di troppo a due voci
// diverse fuse per sbaglio, che sarebbe una perdita mascherata da pulizia.
const SOGLIA_VOCE_GEMELLA = 0.15;
const PAROLE_MINIME_PER_GIUDICARE = 4; // sotto, il confronto e' rumore: due voci corte si somigliano sempre
function similaritaTesti(a, b) {
  const A = new Set(paroleUtili(a)), B = new Set(paroleUtili(b));
  if (!A.size || !B.size) return 0;
  let comuni = 0;
  for (const p of A) if (B.has(p)) comuni++;
  return comuni / (A.size + B.size - comuni);
}
const testoDellaVoce = (v) => [v?.title, v?.notes].filter(Boolean).join(" ");
// Una MISURA non e' una narrazione ripetuta: due pesate nello stesso giorno sono due dati, e
// fonderle ne cancellerebbe una. Le voci che portano un numero restano sempre distinte.
const voceEUnaMisura = (v) => !!(String(v?.weight || "").trim() || String(v?.sleep || "").trim());
function voceGemella(nuova, voci, soglia = SOGLIA_VOCE_GEMELLA) {
  if (voceEUnaMisura(nuova)) return null;
  const testoNuovo = testoDellaVoce(nuova);
  if (paroleUtili(testoNuovo).length < PAROLE_MINIME_PER_GIUDICARE) return null;
  const giorno = String(nuova?.date || "").slice(0, 10);
  if (!giorno) return null;
  let migliore = null, punteggio = 0;
  for (const v of voci || []) {
    if (!v || v.id === nuova.id || voceEUnaMisura(v)) continue;
    if (String(v.date || "").slice(0, 10) !== giorno) continue;
    const s = similaritaTesti(testoNuovo, testoDellaVoce(v));
    if (s > punteggio) { punteggio = s; migliore = v; }
  }
  return punteggio >= soglia ? { voce: migliore, somiglianza: Number(punteggio.toFixed(2)) } : null;
}
const TETTO_VERSIONI_VOCE = 12;
function fondiOAggiungiVoce(voci, nuova, soglia = SOGLIA_VOCE_GEMELLA) {
  const lista = Array.isArray(voci) ? voci : [];
  const g = voceGemella(nuova, lista, soglia);
  if (!g) {
    const fuori = [nuova, ...lista].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return { lista: fuori, esito: { tipo: "aggiunta" } };
  }
  const precedente = { date: g.voce.ultimoAggiornamento || g.voce.date, title: g.voce.title || "", notes: g.voce.notes || "" };
  const versioni = [precedente, ...(g.voce.versioni || [])].slice(0, TETTO_VERSIONI_VOCE);
  const fusa = {
    ...g.voce,
    title: nuova.title || g.voce.title,
    notes: nuova.notes || g.voce.notes,
    ultimoAggiornamento: new Date().toISOString(),
    versioni,
  };
  return {
    lista: lista.map((v) => (v.id === g.voce.id ? fusa : v)),
    esito: { tipo: "fusa", id: g.voce.id, titolo: g.voce.title || "", versione: versioni.length + 1, somiglianza: g.somiglianza },
  };
}
// ── Recupero di Grado 1 + BLOCCO 5 (strati 1 e 2) — ricerca nella memoria, ZERO token ──
// Grado 1: ricerca testuale sul contenuto dei frammenti. Restituisce FRAMMENTI, non documenti
// interi: e' la differenza fra recuperare e ricaricare tutto.
// Strato 1: cerca anche fra le "chiavi" — termini con cui qualcuno potrebbe cercare quel testo e
// che nel testo NON compaiono, dedotti dentro la chiamata di sedimentazione che si paga gia'.
// Strato 2: contiguita' — i frammenti nati nello stesso giorno di uno trovato vengono portati su
// anche se non c'entrano niente. E' la proprieta' che la somiglianza semantica NON ha: recupera
// cose che non si somigliano affatto, unite solo dall'essere state pensate insieme. Per un pensiero
// arborescente vale piu' della somiglianza di dominio, che riporta cose a cui si arriverebbe da soli.
const CONTIGUITA_TETTO = 2; // pochi, e dichiarati come tali: e' un accostamento, non un risultato
function cercaNellaMemoria(argomento, memory) {
  const parole = paroleUtili(argomento);
  const tutti = [];
  for (const pil of ["bio", "air", "vidya"]) {
    const m = memory?.[pil];
    if (m?.corrente) tutti.push({ pilastro: pil, id: "corrente-" + pil, date: null, text: m.corrente, chiavi: [], corrente: true });
    for (const f of m?.sedimento || []) tutti.push({ pilastro: pil, id: f.id, date: f.date, text: f.text, chiavi: f.chiavi || [] });
  }
  if (!parole.length) return { frammenti: [], perContiguita: [], doveHoGuardato: "nessuna parola utile nella richiesta", totaleEsaminati: tutti.length };
  const punteggiati = tutti.map((f) => {
    const t = normalizzaTesto(f.text);
    const k = normalizzaTesto((f.chiavi || []).join(" "));
    let punti = 0;
    for (const p of parole) {
      if (t.includes(p)) punti += 3;          // la parola c'e' davvero nel testo
      else if (k && k.includes(p)) punti += 2; // c'e' fra le chiavi dedotte (strato 1)
    }
    return { ...f, punti, viaChiavi: punti > 0 && !parole.some((p) => normalizzaTesto(f.text).includes(p)) };
  }).filter((f) => f.punti > 0).sort((a, b) => b.punti - a.punti);
  const trovati = punteggiati.slice(0, 5);
  // Strato 2 — contiguita': stessa data di uno trovato, ma NON gia' fra i trovati.
  const giorniTrovati = new Set(trovati.map((f) => (f.date || "").slice(0, 10)).filter(Boolean));
  const idTrovati = new Set(trovati.map((f) => f.id));
  const perContiguita = tutti
    .filter((f) => f.date && giorniTrovati.has(f.date.slice(0, 10)) && !idTrovati.has(f.id))
    .slice(0, CONTIGUITA_TETTO);
  return {
    frammenti: trovati,
    perContiguita,
    doveHoGuardato: `nelle note correnti e nei frammenti dei tre pilastri (${tutti.length} in tutto)`,
    totaleEsaminati: tutti.length,
  };
}
function recuperoGrado0(frase, { pBio, pAir, pVidya, semi }) {
  const parole = paroleUtili(frase);
  if (!parole.length) return { esito: "nessuna-parola-utile", candidati: [] };
  const oggetti = [
    ...(pBio || []).map((p) => ({ tipo: "percorso", pilastro: "bio", id: p.id, etichetta: p.title, testo: `${p.title} ${p.identityGoal || ""} ${(p.topics || []).map((t) => t.label).join(" ")}` })),
    ...(pAir || []).map((p) => ({ tipo: "percorso", pilastro: "air", id: p.id, etichetta: p.title, testo: `${p.title} ${p.identityGoal || ""} ${(p.topics || []).map((t) => t.label).join(" ")}` })),
    ...(pVidya || []).map((p) => ({ tipo: "percorso", pilastro: "vidya", id: p.id, etichetta: p.title, testo: `${p.title} ${p.identityGoal || ""} ${(p.topics || []).map((t) => t.label).join(" ")}` })),
    ...(semi || []).filter((s) => s.status !== "archived").map((s) => ({ tipo: "seme", pilastro: "air", id: s.id, etichetta: String(s.content).slice(0, 60), testo: String(s.content) })),
  ];
  // Un identificativo scritto per esteso vince su tutto: e' un riferimento esatto, non una ricerca.
  const perId = oggetti.find((o) => normalizzaTesto(frase).includes(normalizzaTesto(o.id)));
  if (perId) return { esito: "trovato", candidati: [{ ...perId, punteggio: 999 }] };
  const punteggiati = oggetti.map((o) => {
    const t = normalizzaTesto(o.testo);
    const titolo = normalizzaTesto(o.etichetta);
    let punti = 0;
    for (const p of parole) {
      if (titolo.includes(p)) punti += 3; // nel titolo pesa piu' che nei nodi
      else if (t.includes(p)) punti += 1;
    }
    return { ...o, punteggio: punti };
  }).filter((o) => o.punteggio > 0).sort((a, b) => b.punteggio - a.punteggio);
  if (!punteggiati.length) return { esito: "nessun-riscontro", candidati: [] };
  // Piu' oggetti a pari punteggio massimo = ambiguo. Si mostrano e si chiede: mai scegliere il piu'
  // recente, che e' esattamente il modo in cui un copilota apre la cosa sbagliata (§7.2b).
  const massimo = punteggiati[0].punteggio;
  const aPari = punteggiati.filter((o) => o.punteggio === massimo);
  return { esito: aPari.length > 1 ? "ambiguo" : "trovato", candidati: aPari.length > 1 ? aPari : [punteggiati[0]] };
}

// ── Registro delle azioni conversazionali (§4, §5, §8) ──
// Invariante non negoziabile (§4.2): il modello NON inventa azioni a runtime. Sceglie da questo
// registro fisso, dichiarato nel codice, e produce i parametri. L'esecuzione e' del programma,
// sempre. Chi propone non e' chi esegue: e' la sola ragione per cui l'impianto e' ispezionabile.
//
// Blocco 1 dichiara UNA sola azione, deliberatamente (§7.2a: meglio poche azioni fatte benissimo
// che venti approssimative). E' quella che il Ghost ha segnalato come rotta — riprendere un
// percorso — e serve anche a provare l'impianto prima di allargarlo nel Blocco 2.
const AZIONI_CONVERSAZIONALI = [
  {
    id: "apri_percorso",
    classe: "A", // dentro Adam: reversibile, nessun contatto col mondo esterno
    etichetta: "Aprire o riprendere un percorso",
    descrizione: 'Porta il fuoco della conversazione su un percorso o un Seme che ESISTE GIA\' nell\'inventario. Usa questa quando il Ghost dice "riprendi X", "apri X", "torniamo su X", "parliamo di X" riferendosi a qualcosa dell\'elenco. Non crea niente: sposta solo l\'attenzione.',
    perSelettore: 'riprendere/aprire un percorso o Seme gia\' esistente ("riprendi X", "apri X", "torniamo su X")',
    perConversazione: "Riportare l'attenzione su un percorso o un Seme che hai gia' aperto in passato. Non ne crea di nuovi.",
    parametri: { riferimento: "string — le parole con cui il Ghost ha indicato l'oggetto, cosi' come le ha dette (es. \"quello sul sonno\")" },
    // 22/08/2026: era dichiarato false, ma la card con il pulsante c'era lo stesso da sempre.
    // Il campo diceva una cosa e il programma ne faceva un'altra: allineato al vero.
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,    // Classe A nasce accesa, B e C spente (§8)
  },
  // ── 31/08/2026 — LE DUE AZIONI CHE MANCAVANO, TROVATE DAL GHOST IN USO REALE ──────────────
  // Il Ghost ha scritto "Intanto genera un percorso in vidya". Lo Shell ha risposto
  // "Percorso aperto: **Divenire — Concept album** (VIDYA). Nodo 1 completato: canovaccio...".
  // Nessun percorso e' stato creato, e non poteva esserlo: in questo registro non c'era nessuna
  // azione per crearne uno. Il selettore ha scelto la cosa piu' vicina disponibile (scrivere sul
  // pilastro) e il resto lo ha DETTO, in prosa, come se fosse successo.
  // Un modo per creare un percorso dalla chat esisteva gia' ma passava da un'altra strada: il
  // modello che PROPONE con la formula esatta "vuoi che ne apra uno su X"
  // (detectPercorsoProposalHeuristic). Se lo Shell non dice quella frase, non compare niente. E
  // qui non l'ha detta: ha dichiarato di averlo gia' fatto.
  //
  // La seconda azione risponde alla domanda che il Ghost ha fatto subito dopo, ed e' quella piu'
  // importante: "riuscirebbe a riprendere tutto in mano fra un mese, esattamente com'era?".
  // No — perche' il contenuto generato viveva SOLO nella chat, e la chat ha due tetti (sei
  // messaggi verso il modello, quaranta prima della compattazione in archivio). Il posto giusto
  // esisteva gia' ed era percorso.documents[], riempito solo dal pulsante DENTRO il percorso.
  // Regola della casa applicata anche qui: il modello dice quale materiale salvare, il PROGRAMMA
  // va a prendersi il testo dalla conversazione. Non lo fa riscrivere al modello — sarebbe pagare
  // due volte gli stessi token e dare al testo salvato una seconda occasione di essere diverso
  // dall'originale.
  {
    id: "crea_percorso",
    classe: "A",
    etichetta: "Creare un percorso nuovo",
    descrizione: 'Crea un percorso che NON esiste ancora. Usa questa quando il Ghost chiede di aprirne uno nuovo su un tema ("genera un percorso in vidya su X", "creiamo un percorso su Y", "aprine uno nuovo su Z"). Se quello che nomina e\' gia\' nell\'inventario usa apri_percorso, non questa: quella sposta il fuoco, questa fa nascere una cosa nuova.',
    perSelettore: 'creare un percorso NUOVO, su un tema che non e\' ancora nell\'inventario ("genera/crea/apri un percorso nuovo su X")',
    perConversazione: "Creare un percorso nuovo. Non lo creo io: preparo la card, e il percorso nasce quando tocchi il pulsante.",
    parametri: { contenuto: "string — nella forma \"pilastro | titolo\", dove pilastro è esattamente bio, air o vidya. Il titolo è il NOME della cosa, non una frase: \"vidya | Divenire — concept album\", non \"vidya | vorrei un percorso sul concept album\"." },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  {
    id: "salva_nel_percorso",
    classe: "A",
    etichetta: "Salvare nel percorso quello che hai appena prodotto",
    descrizione: 'Mette PER INTERO, dentro il percorso aperto, il contenuto che hai scritto nella risposta precedente. Usa questa quando il Ghost dice "salvalo nel percorso", "tienilo", "mettilo nel percorso attivo" riferendosi a qualcosa che hai appena generato (dei testi, un canovaccio, un piano, un\'analisi). NON riscrivere il contenuto nel parametro: il programma va a prenderselo dalla conversazione da solo. Tu dai solo un titolo.',
    perSelettore: 'salvare dentro il percorso aperto il contenuto appena generato ("salvalo nel percorso", "tienilo", "mettilo nel percorso attivo")',
    perConversazione: "Mettere dentro il percorso aperto, per intero e per sempre, il contenuto che ho appena scritto — così fra un mese è ancora lì.",
    parametri: { contenuto: "string — un titolo breve per il materiale, con le parole del Ghost o le tue. Esempio: \"Atto I — testi completi\". Il testo NON va qui: lo copia il programma." },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  // La terza della famiglia, e l'unica che LEGGE invece di scrivere. Il fascicolo che ora viaggia
  // nel fuoco dice allo Shell che un documento esiste e come comincia — abbastanza per riprendere
  // il filo, non abbastanza per lavorarci sopra. "Rileggimi l'Atto I e sistemami la metrica" vuole
  // il testo INTERO nel turno. Stessa disciplina di leggi_calendario: il programma va a prenderlo
  // PRIMA che il modello scriva, cosi' quello che dice viene da cio' che ha in mano e non dal suo
  // ricordo. Non chiede conferma perche' non cambia niente: leggere non e' un atto reversibile,
  // e' un atto che non lascia traccia.
  {
    id: "apri_documento",
    classe: "A",
    etichetta: "Riaprire per intero un documento del percorso",
    descrizione: 'Va a prendere il testo COMPLETO di un documento conservato nel percorso aperto. Usa questa quando il Ghost chiede di rileggere, riprendere, correggere o continuare qualcosa che è già stato salvato lì dentro ("rileggimi l\'Atto I", "riprendi i testi che abbiamo salvato", "sistemami la metrica di quel pezzo"). Non usarla se il materiale non è nel percorso: non inventare di averlo letto.',
    perSelettore: 'rileggere per intero un documento già salvato nel percorso aperto ("rileggimi X", "riprendi i testi di X")',
    perConversazione: "Andare a prendere il testo completo di un documento del percorso, per lavorarci sopra davvero invece di ricordarlo.",
    parametri: { contenuto: "string — le parole con cui il Ghost ha indicato il documento, così come le ha dette (es. \"l'Atto I\", \"i testi completi\")" },
    richiedeGate: false,
    effetto: "lettura",
    reversibile: true,
    accesaDiDefault: true,
  },
  // BLOCCO 2 (16/08/2026) — le quattro azioni approvate dal Ghost (D2). La sesta (invocare Magi)
  // NON e' costruita: sospesa dal Ghost perche' si sovrappone nell'uso reale con "riprendi" e
  // "avanza", e finche' non si vede come le usa non e' chiaro se servano due azioni o una.
  {
    id: "scrivi_su_pilastro",
    classe: "A",
    etichetta: "Scrivere una voce su un pilastro",
    descrizione: "Registra una voce nel diario di un pilastro. Usa questa quando il Ghost racconta un fatto accaduto da annotare: un peso, una sessione di studio, un passo di lavoro. NON usarla per opinioni, domande o pensieri: solo per fatti che lui vuole tenere.",
    perSelettore: "annotare un fatto accaduto su bio/air/vidya (un peso, una sessione, un passo fatto) — non opinioni o domande",
    perConversazione: "Annotare nel diario di un pilastro un fatto accaduto (un peso, una sessione, un passo fatto) — non opinioni o pensieri.",
    parametri: { contenuto: "string — nella forma \"pilastro | testo della voce\", dove pilastro è esattamente bio, air o vidya. Esempio: \"bio | pesato 123,4 stamattina, dormito male\"" },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  {
    id: "crea_seme",
    classe: "A",
    etichetta: "Creare un Seme AIR",
    descrizione: "Salva un'idea grezza di autonomia economica perche' il sistema la sviluppi dopo. Usa questa quando il Ghost butta li' un'idea di qualcosa da vendere, produrre o monetizzare, anche vaga. NON usarla per idee di studio o di salute: i Semi sono solo di AIR.",
    perSelettore: "salvare un'idea grezza da vendere/produrre/monetizzare, anche vaga — solo AIR",
    perConversazione: "Salvare un'idea grezza di autonomia economica perche' il sistema la sviluppi dopo. Solo idee di AIR, non di studio o salute.",
    parametri: { contenuto: "string — l'idea come il Ghost l'ha detta, senza riformularla" },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  {
    id: "interroga_memoria",
    classe: "A",
    etichetta: "Cercare nella memoria",
    descrizione: "Cerca fra le note e i frammenti accumulati cosa si era detto su un argomento. Usa questa quando il Ghost chiede \"cosa avevo detto su X\", \"ti ricordi di X\", \"cosa sappiamo di X\". Non risponde a memoria: va a cercare davvero.",
    perSelettore: "cercare cosa si era detto su un argomento (\"cosa avevo detto su X\", \"ti ricordi di X\")",
    perConversazione: "Cercare davvero, fra le note passate, cosa si era detto su un argomento. Non risponde a memoria.",
    parametri: { argomento: "string — l'argomento da cercare, con le parole del Ghost" },
    richiedeGate: true,
    effetto: "lettura",
    reversibile: true,
    accesaDiDefault: true,
  },
  {
    id: "avanza_percorso",
    classe: "A",
    etichetta: "Avanzare il percorso aperto",
    descrizione: "Chiede il prossimo passo concreto sul percorso su cui si sta gia' lavorando. Usa questa quando il Ghost dice \"e adesso?\", \"cosa faccio ora\", \"andiamo avanti\" mentre un percorso e' aperto. Se non c'e' nessun percorso aperto NON usarla: chiedi prima quale.",
    perSelettore: "chiedere il prossimo passo sul percorso gia' aperto (\"e adesso?\", \"andiamo avanti\")",
    perConversazione: "Suggerire il prossimo passo concreto sul percorso gia' aperto. Serve un percorso aperto: se non c'e', va chiesto quale.",
    parametri: { nota: "string — scrivi 'avanti' e basta: l'oggetto e' quello gia' aperto, non serve indicarlo" },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  // 25/08/2026 — il gemello di apri_percorso: il Ghost chiedeva di aprire, chiudere e riprendere i
  // percorsi dalla chat. Aprire (apri_percorso) e riprendere-per-avanzare (apri_percorso +
  // avanza_percorso) esistevano gia'. Chiudere no: il fuoco si chiudeva SOLO con un tocco sul
  // pulsante della barra in alto, mai dicendolo. Non cancella e non archivia niente — il percorso
  // resta intatto con tutta la sua storia, smette solo di essere "quello su cui si sta lavorando
  // adesso". Riaprirlo (con apri_percorso, dicendo "riprendi X") lo rimette esattamente li' dov'era.
  {
    id: "chiudi_percorso",
    classe: "A",
    etichetta: "Chiudere il percorso aperto",
    descrizione: "Chiude il fuoco della conversazione: smette di segnalare il percorso o il Seme aperto come quello su cui si sta lavorando adesso. Usa questa quando il Ghost dice \"chiudi questo\", \"chiudiamo qui\", \"basta per oggi con questo\", \"fermiamoci\" mentre un percorso e' aperto. Se non c'e' nessun fuoco aperto NON usarla: non c'e' niente da chiudere. Non cancella e non archivia niente: si riprende quando vuole dicendo \"riprendi X\".",
    perSelettore: "chiudere il percorso aperto (\"chiudi questo\", \"basta con questo\", \"fermiamoci\"), solo se uno e' aperto",
    perConversazione: "Chiudere il percorso aperto, senza cancellarlo: resta intatto, pronto a essere ripreso dicendo \"riprendi X\".",
    parametri: { nota: "string — scrivi 'chiudi' e basta: l'oggetto e' quello gia' aperto, non serve indicarlo" },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,
    accesaDiDefault: true,
  },
  // BLOCCO 3 (16/08/2026) — CLASSE B: il mondo digitale gia' autorizzato. Le credenziali ci sono
  // gia' (stesso login Google di Drive). Cio' che cambia rispetto alla Classe A non e' la classe:
  // e' la REVERSIBILITA'. Un evento di calendario si cancella; una mail partita non torna. Per
  // questo l'evento ha un gate leggero (mostro e confermi) e la mail ha il gate pieno di C.10
  // (testo integrale e indirizzo per esteso sotto gli occhi, e non parte finche' non tocchi quel
  // pulsante li'). Entrambe nascono SPENTE (§8): una capacita' che tocca il mondo esterno non si
  // accende da sola il giorno del rilascio.
  {
    id: "crea_evento_calendario",
    classe: "B",
    etichetta: "Mettere un evento sul calendario",
    descrizione: "Crea un appuntamento o un promemoria sul calendario Google del Ghost. Usa questa quando chiede di segnarsi qualcosa a una data o a un'ora. NON calcolare tu la data e NON scrivere date in cifre: copia le sue parole cosi' come le ha dette (\"domani alle 15\", \"martedi' prossimo\"), la data la ricava il programma.",
    perSelettore: "creare un NUOVO appuntamento/promemoria sul calendario, a una data o ora",
    perConversazione: "Creare un nuovo appuntamento o promemoria sul tuo calendario Google, a una data o un'ora che dici tu.",
    parametri: { contenuto: "string — nella forma \"titolo | quando\". Esempio: \"chiamare il commercialista | domani alle 15\". Nel campo quando copia le parole del Ghost, non tradurle in una data." },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,   // un evento si modifica e si cancella: avviso leggero sulla card.
    // ATTENZIONE: reversibile NON vuol dire "non tocca niente fuori". Creare un evento tocca il
    // calendario anche se poi lo si cancella — per questo la conferma dipende da `effetto`.
    accesaDiDefault: false,
  },
  // AGGIUNTA IL 24/08/2026, su richiesta esplicita del Ghost: "gestire, registrare, cancellare e
  // SPOSTARE gli appuntamenti... in modo semplice, agile e pulito, con la chat come punto di
  // interazione principale". Cancellare e creare esistevano gia'; spostare no — e fino a ieri il
  // prompt diceva esplicitamente al modello di non offrirlo nemmeno come alternativa, perche' non
  // esisteva davvero. Da oggi esiste: stessa disciplina di ogni altra scrittura sul calendario.
  // Il bersaglio non lo sceglie il modello, esattamente come per cancellare: il modello dice a
  // parole quale evento e quando spostarlo, il programma va a cercare l'evento vero su Google e
  // mostra sulla card cosa ha trovato E dove sta per spostarlo, prima di toccare qualsiasi cosa.
  // Il nuovo orario passa dallo stesso doppio controllo della creazione (vedi orariConcordano):
  // se il calcolo del programma e quello riportato dal modello non coincidono, niente pulsante.
  {
    id: "sposta_evento_calendario",
    classe: "B",
    etichetta: "Spostare un appuntamento a un altro giorno o ora",
    descrizione: "Sposta DAVVERO un evento ESISTENTE a un nuovo giorno o ora sul calendario Google del Ghost. Usa questa quando chiede di spostare, cambiare, rimandare, anticipare o riprogrammare un appuntamento che esiste gia'. NON usarla per crearne uno nuovo (quella e' crea_evento_calendario) ne' per cancellarlo (quella e' cancella_evento_calendario). NON calcolare tu la data: copia le parole del Ghost sia per dire QUALE evento sia per il NUOVO quando.",
    perSelettore: "spostare/rimandare/anticipare un appuntamento ESISTENTE a un nuovo giorno o ora",
    perConversazione: "Spostare un appuntamento che esiste gia' a un nuovo giorno o ora. Non ne crea di nuovi e non li cancella.",
    parametri: { contenuto: "string — nella forma \"quale | nuovo quando\". Esempio: \"Petronio | giovedì alle 18\". Nel campo quale metti come il Ghost ha nominato l'evento (un nome, un giorno, o entrambi), copiato dalle sue parole; nel campo nuovo quando il nuovo giorno/ora, anche questo copiato senza tradurlo in una data." },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: true,   // si puo' rispostare al contrario, come un evento creato si puo' cancellare
    accesaDiDefault: false,
  },
  {
    id: "invia_mail",
    classe: "B",
    etichetta: "Inviare una mail",
    descrizione: "Scrive e invia una mail dall'indirizzo Gmail del Ghost. Usa questa SOLO quando chiede esplicitamente di mandare una mail a qualcuno. Se non ha detto l'indirizzo lascialo vuoto: lo scrivera' lui, non inventarlo mai. Il testo scrivilo per intero, pronto da spedire.",
    perSelettore: "scrivere e inviare una mail, solo se lo chiede esplicitamente",
    perConversazione: "Scrivere e inviare davvero una mail dal tuo indirizzo Gmail, solo se lo chiedi esplicitamente.",
    parametri: { contenuto: "string — nella forma \"indirizzo | oggetto | testo completo\". Se l'indirizzo non lo ha detto, lascia vuoto prima della prima barra. Esempio: \" | Disdetta di giovedi | Buongiorno, purtroppo devo disdire...\"" },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: false,  // irreversibile: gate pieno C.10
    accesaDiDefault: false,
  },
  // AGGIUNTA IL 17/08/2026 — l'azione che mancava, e la sua assenza ha fatto un danno preciso.
  // Il Ghost ha chiesto "cosa e' previsto domani" e lo Shell gli ha elencato due impegni: uno era
  // il promemoria che credeva di aver creato e che non esisteva, l'altro era un nome che il Ghost
  // stesso aveva buttato li' trenta messaggi prima in una prova poi abbandonata. Nessuno dei due
  // era sul calendario. Il modello non stava leggendo niente: stava ricordando la chat.
  // Finche' leggere non e' un'AZIONE, "cosa ho domani" resta conversazione libera — e una
  // conversazione libera sul contenuto del calendario e' un generatore di impegni immaginari.
  {
    id: "leggi_calendario",
    classe: "B",
    etichetta: "Guardare cosa c'è sul calendario",
    descrizione: "Va a leggere DAVVERO gli impegni sul calendario Google del Ghost per un giorno o un intervallo. Usa questa quando chiede cosa ha in programma, che impegni ha, cosa c'e' domani o in settimana. Se invece nomina UN appuntamento preciso e vuole solo sapere quando e' (es. \"quando ho l'appuntamento con Marzio\"), quella e' trova_evento_calendario, non questa. Non rispondere mai a memoria su cosa c'e' sul suo calendario: non lo sai, lo sa solo il calendario.",
    perSelettore: "leggere gli impegni di un PERIODO intero (\"cosa ho domani\", \"che impegni ho questa settimana\") — non un nome preciso",
    perConversazione: "Leggere davvero gli impegni di un giorno o di un periodo sul tuo calendario Google. Per un appuntamento preciso per nome, invece, c'e' trova_evento_calendario.",
    parametri: { quando: "string — il periodo con le parole del Ghost: \"domani\", \"oggi\", \"giovedi\", \"questa settimana\". Non tradurlo in date." },
    // 22/08/2026 — non chiede conferma. Non perche' sia comoda: perche'
    // non cambia niente fuori, e perche' il suo risultato serve al modello PRIMA che scriva.
    // L'interruttore qui sopra resta l'unico gate, ed e' spento finche' il Ghost non l'accende.
    richiedeGate: false,
    effetto: "lettura",
    reversibile: true,
    accesaDiDefault: false,
  },
  // 25/08/2026 — il gemello mirato di leggi_calendario. "Quando è l'appuntamento con Marzio?"
  // finiva instradato su leggi_calendario, che legge un PERIODO — passargli "Marzio" come periodo
  // falliva sempre ("non ho capito che periodo guardare"). Questa cerca UN evento per nome (la
  // stessa ricerca gia' scritta per cancellare e spostare) e dice solo quando e', senza offrire
  // di toccarlo. Come leggi_calendario: nessuna scrittura, nessuna conferma, il risultato lo
  // compone il codice dopo aver letto davvero, non il modello a memoria.
  {
    id: "trova_evento_calendario",
    classe: "B",
    etichetta: "Trovare quando è un appuntamento",
    descrizione: "Cerca DAVVERO un impegno preciso per nome sul calendario Google del Ghost e dice solo quando e'. Usa questa per \"quando e' l'appuntamento con X\", \"a che ora e' X\", \"quando ho X\", \"ho un appuntamento con X?\" — quando nomina UN impegno preciso. Diversa da leggi_calendario, che legge un periodo intero (\"cosa ho domani\"). Non cancella e non sposta niente: dice solo quando e'.",
    perSelettore: "trovare quando e' UN appuntamento preciso per nome (\"quando e' l'appuntamento con X\", \"a che ora e' X\", \"quando ho X\") — non un periodo",
    perConversazione: "Cercare un appuntamento preciso per nome sul tuo calendario Google e dirti solo quando e'. Non tocca niente, non cancella, non sposta.",
    parametri: { descrizione: "string — come il Ghost ha nominato l'evento (un nome, un giorno, o entrambi), copiato dalle sue parole" },
    richiedeGate: false,
    effetto: "lettura",
    reversibile: true,
    accesaDiDefault: false,
  },
  // AGGIUNTA IL 22/08/2026, su richiesta esplicita del Ghost: segnare, consultare E rimuovere.
  // Fino a oggi lo Shell diceva "non posso cancellare" — ed era vero — ma offriva di spostare, che
  // non puo' fare nemmeno adesso. Meta' del difetto era l'assenza della capacita', l'altra meta' il
  // surrogato inesistente offerto al suo posto. Qui si chiude la prima meta'.
  // Cancellare NON e' reversibile: un evento cancellato non torna. Quindi gate pieno, e la card
  // nomina l'evento esatto — giorno, ora, titolo — LETTO DAL CALENDARIO, non dedotto dal testo.
  // Il bersaglio non lo sceglie il modello: il modello dice a parole quale evento intende, il
  // programma va a cercarlo davvero e mostra cio' che ha trovato. Se ne trova piu' di uno chiede
  // quale; se non ne trova nessuno lo dice e non cancella niente.
  {
    id: "cancella_evento_calendario",
    classe: "B",
    etichetta: "Cancellare un appuntamento dal calendario",
    descrizione: "Cancella DAVVERO un evento dal calendario Google del Ghost. Usa questa quando dice di cancellare, togliere, eliminare, annullare o disdire un appuntamento. Nel parametro metti solo come lo ha chiamato lui — un nome, un giorno, o tutti e due — senza tradurlo in date: il programma andra' a cercarlo sul calendario e gli mostrera' cosa ha trovato prima di toccare qualsiasi cosa.",
    perSelettore: "cancellare/togliere/eliminare/disdire un appuntamento ESISTENTE",
    perConversazione: "Cancellare davvero un appuntamento esistente dal tuo calendario Google — non si torna indietro.",
    parametri: { quale: "string — come il Ghost ha nominato l'evento: \"Petronio\", \"l'appuntamento di martedi\", \"quello con Marzio di giovedi\". Con le sue parole." },
    richiedeGate: true,
    effetto: "scrittura",
    reversibile: false,  // un evento cancellato non torna indietro: gate pieno
    accesaDiDefault: false,
  },
];
// D1 (approvata dal Ghost, 16/08/2026) — modello piu' capace SOLO per il turno in cui si decide
// quale azione compiere. Il resto della conversazione resta sul modello economico.
// Il turno di selezione e' breve (poche decine di token in uscita), raro (solo quando il Ghost
// chiede qualcosa di azionabile) e costosissimo da sbagliare: aprire la cosa sbagliata obbliga a
// controllare sempre, e a quel punto l'esoscheletro pesa invece di aiutare.
// MISURATO IL 16/08/2026, e il dato contraddice la previsione. Su 18 richieste reali formulate in
// modo vario (13 comandi + 5 casi di sola conversazione), i due modelli hanno fatto ENTRAMBI 18/18.
// Il modello capace costa 35 volte tanto ($0,0077 contro $0,00022 a turno) e non compra niente.
// Perche' la previsione era ragionevole ma prematura: parlava di "quindici azioni disponibili", e
// qui ce ne sono cinque. Con cinque azioni ben descritte la scelta e' facile anche per il modello
// economico. La capacita' resta costruita e accendibile in Setup, spenta di default: quando il
// registro crescera' si rimisura, e allora il numero dira' se accenderla.
const MODELLO_SELEZIONE = "anthropic/claude-sonnet-4.5";
const SELEZIONE_MODELLO_CAPACE_KEY = "selezione-modello-capace";
function usaModelloCapacePerSelezione() { return loadKey(SELEZIONE_MODELLO_CAPACE_KEY, false) === true; }
function impostaModelloCapacePerSelezione(v) { saveKey(SELEZIONE_MODELLO_CAPACE_KEY, !!v); return !!v; }
// Le impostazioni del turno di selezione: stesso provider e stessa chiave, modello diverso solo
// se il Ghost ha acceso l'interruttore.
function settingsPerSelezione(settings) {
  return usaModelloCapacePerSelezione() ? { ...settings, model: MODELLO_SELEZIONE } : settings;
}
// Euristica a costo zero: decide se vale la pena spendere un turno di selezione. Un messaggio che
// non contiene nessun verbo di comando non merita una chiamata in piu' — e questo tiene il costo
// del modello capace proporzionale alle richieste vere, non al numero di frasi scambiate.
// ALLARGATO IL 17/08/2026, dopo la prova reale. Il Ghost aveva scritto "FISSA per domani un
// promemoria cena propiziatoria canale ore 21" — la richiesta piu' chiara possibile, con titolo e
// ora dentro — e il turno di selezione NON e' partito, perche' "fissa" non era in questo elenco.
// Nessuna card, nessun pulsante: solo il modello che parlava. Poi il Ghost ha scritto "si
// aggiungilo al calendario", li' il turno e' partito, ma ormai il titolo e l'ora erano nel
// messaggio prima.
// Questa lista e' una porta stretta a costo zero, e va bene che esista — ma se e' troppo stretta
// il costo non e' zero: e' un'azione che non nasce, e un Ghost che crede sia nata.
// 25/08/2026 — ANCORA LA STESSA FAMIGLIA, E STAVOLTA SU UN CASO GIÀ COSTRUITO DA GIORNI.
// Il Ghost ha scritto "Cancella marzio" e "Cancella Filocornio": due richieste chiarissime,
// su una capacità che esiste dal 22/08 con la sua ricerca del bersaglio e la sua card. Nessuna
// delle due ha fatto partire NIENTE — nessun turno di selezione, nessuna ricerca, nessuna card —
// perché nessuna forma di "cancellare" era in questo elenco. Il modello, senza vincoli, ha
// improvvisato una promessa ("Cerco l'appuntamento... ti mostro per la conferma") che non è mai
// stata seguita da niente. Le prove offline sulla cancellazione (prova_cancellazione.mjs) non lo
// coprivano perché costruiscono sceltaAnticipata a mano, saltando proprio questa porta a monte —
// lo stesso punto cieco che ha lasciato passare il buco di "fissa" il 17/08.
// 31/08/2026 — LA STESSA PORTA A MONTE, LA TERZA VOLTA. Il Ghost ha scritto "Intanto genera un
// percorso in vidya" e poi "Salva nel percorso già attivo". Nessuna delle due parole — "genera",
// "salva" — era in questo elenco, quindi nessun turno di selezione e' partito: il modello, senza
// nessuna azione davanti, ha improvvisato "Percorso aperto: Divenire" e non e' successo niente.
// E' esattamente il difetto di "fissa" (17/08) e di "cancella" (25/08), che questo commento
// racconta due righe piu' su. Aggiunte anche le forme che il Ghost usa davvero: "creiamo",
// "tienilo". "genera" ha un veto su "general*": "in generale" non e' una richiesta di azione.
const VERBI_AZIONE = /\b(crea|crei|genera(?!l)|salva|tien|rilegg|leggim|leggil|mostram|riprend|ripiglia|apri|aprire|chiud|torniamo|torna|continu|avanz|avanti|e adesso|prossim|adesso che|e ora|segna|annota|registra|scrivi|aggiungi|aggiung|metti|nota che|idea|potrei|si potrebbe|vendere|monetizz|ricordi|ricordati|ricordami|cosa avevo|cosa abbiamo|cosa sappiamo|avevo detto|cerca|trova|che ora|fissa|fissam|prenota|programma|pianifica|promemoria|appuntamento|impegn|calendario|in agenda|agenda|spost|rimand|anticip|posticip|riprogramm|cancell|elimin|disdic|annull|rimuov|togli|manda|invia|spedisci|scrivigli|scrivile|mail|email|che ho|cosa ho|cosa c'e'|cosa c'è|che c'e'|che c'è|previsto|in programma|cosa faccio|che giornata|come e' messa|come è messa)\w*/i;
function meritaTurnoDiSelezione(messaggio) { return VERBI_AZIONE.test(String(messaggio || "")); }
// Il turno di selezione: una chiamata dedicata, brevissima, che decide SOLO quale azione e con
// quale parametro. Separata dalla conversazione di proposito — mescolarla al turno normale
// significherebbe chiedere allo stesso modello di parlare bene e scegliere bene insieme, e le due
// cose competono. Qui non si genera prosa: si sceglie da un elenco chiuso.
// Il costo viene tracciato con un tag suo (§D1), cosi' il Ghost vede quanto pesa davvero invece
// di fidarsi di una stima.
// AGGIUNTO IL 17/08/2026 — il selettore riceve ora anche gli ultimi scambi. Prima vedeva solo il
// messaggio appena scritto, e quando il Ghost diceva "si aggiungilo al calendario" non aveva NIENTE
// con cui riempire titolo e ora: erano nel messaggio precedente. Produceva un parametro vuoto e
// la card diceva "non ho capito quando", mentre il modello conversazionale — che il contesto ce
// l'aveva — raccontava che era tutto a posto.
// ATTENZIONE, e' una distinzione sottile ma decisiva: il contesto serve a RIEMPIRE i dati di una
// proposta, mai a decidere che il Ghost ha confermato. La conferma resta un tocco su un pulsante,
// e questo il selettore non lo puo' toccare — non esegue niente, propone soltanto.
function formatStoricoPerSelezione(storico) {
  const ultimi = (storico || []).slice(-6).filter((m) => m && m.content);
  if (!ultimi.length) return "";
  return `\nGLI ULTIMI SCAMBI (servono SOLO a capire di cosa si sta parlando e a riempire i dettagli che il Ghost ha gia' detto prima — titoli, date, orari, nomi):
${ultimi.map((m) => `${m.role === "user" ? "GHOST" : "SHELL"}: ${String(m.content).slice(0, 300)}`).join("\n")}
`;
}
async function scegliAzione(messaggio, inventario, fuoco, azioni, settings, pushDebugLog = null, storico = []) {
  if (!azioni.length) return null;
  // 25/08/2026 — il selettore usa una frase corta dedicata (perSelettore), non la descrizione
  // lunga scritta per il blocco che il modello legge in conversazione (formatAzioniBlock). Le due
  // hanno bisogno di cose diverse: la conversazione ha bisogno di sfumature e casi limite scritti
  // per esteso, la selezione ha bisogno solo di riconoscere la frase — e le clausole "NON usarla
  // per..." che aiutano la prima affollano la seconda senza aggiungere segnale, su una scelta che
  // gia' deve orientarsi fra dodici voci. Il fallback a descrizione resta per sicurezza, se un
  // giorno un'azione nascesse senza perSelettore.
  const elenco = azioni.map((a) => `- ${a.id}: ${a.perSelettore || a.descrizione} Parametro: ${Object.values(a.parametri)[0]}`).join("\n");
  const sys = `Sei il selettore di azioni del sistema Resonance. Il tuo unico compito e' decidere se il messaggio del Ghost chiede una delle azioni sotto, e con quale parametro. Non conversare, non spiegare, non salutare.

${inventario}
${formatFuocoBlock(fuoco)}
${formatStoricoPerSelezione(storico)}
AZIONI DISPONIBILI:
${elenco}

Regole non negoziabili:
- Se il messaggio NON chiede nessuna di queste azioni, rispondi {"azione": null}. E' l'esito piu' frequente e va bene cosi': la maggior parte dei messaggi e' conversazione, non comando.
- Attenzione a leggi_calendario vs trova_evento_calendario, che si confondono facilmente: se il Ghost nomina UN appuntamento preciso per sapere quando e' (es. "quando e' l'appuntamento con Marzio", "a che ora e' la visita", "quando ho X"), e' trova_evento_calendario. Solo se chiede un periodo intero (es. "cosa ho domani", "che impegni ho questa settimana") e' leggi_calendario.
- Se il Ghost sta confermando o completando una richiesta che aveva gia' fatto poco fa (es. dice solo "si, aggiungilo"), RECUPERA dagli ultimi scambi il titolo, la data e l'ora che aveva gia' detto, e mettili nel parametro come li aveva detti lui. Non inventarli: se davvero non ci sono, lascia il parametro incompleto — sara' il programma a fermarsi e a chiedere.
- Una sola azione per messaggio. Se ne chiede piu' di una, scegli la PRIMA che ha nominato.
- Non inventare azioni che non sono nell'elenco.
- Il parametro va copiato dalle parole del Ghost, non riformulato.
- Se il messaggio si riferisce a un oggetto ma non e' chiaro quale, scegli comunque l'azione e metti nel parametro le parole cosi' come le ha dette: sara' il programma a cercare e, se e' ambiguo, a chiedere.
- Se nel messaggio c'e' un ORARIO, riportalo anche a parte nel campo "orario", in forma HH:MM a 24 ore. "16 e 30" e' "16:30". "le quattro e mezza del pomeriggio" e' "16:30". "alle otto di sera" e' "20:00". Se non c'e' nessun orario, metti null. Non inventarlo e non arrotondarlo: serve a un controllo incrociato, e se sbagli il programma se ne accorge e si ferma.
Rispondi SOLO con JSON: {"azione": "<id o null>", "parametro": "<testo>", "orario": "<HH:MM o null>"}`;
  const data = await askModelJSON(sys, messaggio, 0.1, 200, settings, null, (raw) => logAiCost(pushDebugLog, "selezione_azione", settings.model, raw));
  if (!data || !data.azione) return null;
  const az = azioni.find((a) => a.id === String(data.azione).trim());
  if (!az) return null; // ha nominato qualcosa che non esiste: si ignora, non si indovina
  // 22/08/2026 — IL SECONDO PERCORSO. Il modello riporta l'orario per conto suo, nella STESSA
  // chiamata che gia' avveniva: nessuna chiamata in piu', una decina di token in uscita.
  // Serve a confrontarlo con quello che il parser ricava dal testo. Vedi orariConcordano.
  const orarioModello = /^\s*([0-2]?\d):([0-5]\d)\s*$/.test(String(data.orario || "")) ? String(data.orario).trim() : null;
  return { azioneId: az.id, parametro: String(data.parametro || "").trim(), orarioModello };
}
// ══════════════════════════════════════════════════════════════════════════════
// LE ETICHETTE DEL REGISTRO VENGONO LETTE DAVVERO (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Fino a ieri `richiedeGate` e `reversibile` erano dichiarati su tutte e otto le azioni, con tanto
// di commento "gate leggero" — e NESSUNO DEI DUE veniva letto da nessuna parte del programma. La
// conferma era cablata per duplicazione: ogni azione di Classe B aveva la sua card scritta a mano,
// con il suo pulsante scritto a mano, e la distinzione fra leggere e scrivere esisteva solo come
// commento. Uno scarto fra cio' che il codice dichiara e cio' che il codice fa e' la stessa classe
// di problema che questo lavoro sta chiudendo sul testo del modello: qui era nel codice stesso.
//
// Nel farlo e' emerso che le due etichette non bastavano, e vale la pena dirlo invece di forzarle:
// `crea_evento_calendario` e' dichiarato `reversibile: true`, con la motivazione giusta — un evento
// si modifica e si cancella. Ma reversibile vuol dire "si puo' disfare", NON "non tocca niente
// fuori". Creare un evento tocca il calendario di un altro essere umano anche se poi lo si cancella.
// Se avessi fatto dipendere la conferma da `reversibile`, la creazione di eventi avrebbe smesso di
// chiederla — cioe' avrei rotto proprio la cosa che il brief vieta di toccare.
// Quindi e' stato aggiunto `effetto: "lettura" | "scrittura"`, che dice la cosa che serve davvero:
// se l'azione CAMBIA qualcosa fuori o si limita a guardare.
// Ora le tre etichette hanno tutte una conseguenza visibile:
//   · effetto      → decide se serve una conferma (una lettura non ne ha bisogno);
//   · richiedeGate → decide se la conferma e' esplicita (una card con un pulsante);
//   · reversibile  → decide quanto pesante e' l'avviso su quella card.
function richiedeConfermaEsplicita(azioneId) {
  const a = AZIONI_CONVERSAZIONALI.find((x) => x.id === azioneId);
  if (!a) return true; // un'azione che non conosco non si esegue mai da sola
  // L'invariante, e vale piu' del campo: un'azione che CAMBIA qualcosa fuori chiede sempre
  // conferma, qualunque cosa dica richiedeGate. Se un giorno qualcuno scrivesse richiedeGate:false
  // accanto a una scrittura, questa riga lo ignora invece di eseguirla in silenzio.
  if (a.effetto !== "lettura") return true;
  return a.richiedeGate !== false;
}
// Un'azione si esegue subito, senza chiedere niente, solo se non cambia niente fuori. L'interruttore
// resta l'unico gate che le sta davanti, ed e' controllato dal chiamante prima di arrivare qui.
function eseguibileSubito(azioneId) {
  return !richiedeConfermaEsplicita(azioneId);
}
// 25/08/2026 (audit "Motoko") — RIMOSSA azioneIrreversibile: zero chiamate in tutto il file.
// Il campo `reversibile` che leggeva non e' morto — e' letto direttamente dove serve (il testo
// informativo di Setup, vedi `a.reversibile ? "..." : "..."`) — solo questa funzione intermedia
// era rimasta senza nessuno a chiamarla. Stesso schema gia' visto e corretto per `richiedeGate`:
// una dichiarazione che non produce piu' l'effetto che il suo commento diceva.
const AZIONI_INTERRUTTORI_KEY = "azioni-interruttori";
function leggiInterruttori() {
  const salvati = loadKey(AZIONI_INTERRUTTORI_KEY, {});
  const stato = {};
  for (const a of AZIONI_CONVERSAZIONALI) {
    stato[a.id] = Object.prototype.hasOwnProperty.call(salvati, a.id) ? !!salvati[a.id] : a.accesaDiDefault;
  }
  return stato;
}
function scriviInterruttore(id, accesa) {
  const s = loadKey(AZIONI_INTERRUTTORI_KEY, {});
  s[id] = !!accesa; saveKey(AZIONI_INTERRUTTORI_KEY, s); return leggiInterruttori();
}
function azioniAttive() {
  const i = leggiInterruttori();
  return AZIONI_CONVERSAZIONALI.filter((a) => i[a.id]);
}
// Blocco descrittivo per il prompt. Se nessuna azione e' accesa, il modello deve saperlo invece di
// proporre cose che il programma poi rifiuterebbe in silenzio.
// CORRETTO IL 16/08/2026 (sera), dopo la prova reale del Ghost — §1.4 del brief.
// Il Ghost vedeva in chat righe come "[AZIONE: apri_percorso | ...]" e "[AZIONE: calendar | ...]".
// La causa era mia, introdotta nel Blocco 2: questo blocco ORDINAVA al modello di scrivere il tag,
// mentre poche righe piu' sotto lo stesso prompt gli vietava i tag fra parentesi quadre — due
// istruzioni opposte nello stesso respiro — e la funzione che toglieva il tag dal testo mostrato
// (estraiProposta) era rimasta definita ma non veniva piu' chiamata da nessuna parte.
// Dal Blocco 2 l'azione la sceglie un TURNO DI SELEZIONE dedicato: il modello conversazionale non
// deve produrre nessuna sintassi, mai. Qui ora si limita a sapere cosa il programma sa fare, per
// poterne parlare a parole.
function formatAzioniBlock(attive) {
  if (!attive.length) return "In questo momento il programma non puo' compiere nessuna azione per te: sono tutte spente in Setup. Puoi solo parlare, e dirlo se il Ghost chiede qualcosa che richiederebbe un'azione.";
  // 25/08/2026 — perConversazione invece di descrizione: stessa idea gia' applicata al selettore,
  // qui pero' con piu' cautela. La descrizione intera porta esempi di frase e le clausole "NON
  // usarla per...", utili a CLASSIFICARE ma ridondanti quando il modello deve solo PARLARE delle
  // sue capacita' a parole sue. perConversazione tiene la frase di comportamento e il confine che
  // impedisce di promettere cose che non fa (es. "non cancella niente"), toglie solo gli esempi.
  // Se un domani mancasse (azione nuova senza il campo), si torna alla descrizione intera: nessuna
  // azione resta silenziosa per un campo dimenticato.
  return `Cose che il PROGRAMMA sa fare (non le fai tu, e non devi chiederle in nessun modo speciale — a deciderlo e' un passaggio separato, dopo la tua risposta):
${attive.map((a) => `- ${a.etichetta}: ${a.perConversazione || a.descrizione}`).join("\n")}
Non scrivere MAI codici, sigle, parentesi quadre o formati tecnici per attivarle: non servono e il Ghost li leggerebbe. Parla e basta. Se non e' chiaro a cosa il Ghost si riferisce, chiedi.`;
}
// Rete di sicurezza, indipendente dal prompt: qualunque cosa somigli a un tag d'azione viene tolta
// dal testo mostrato al Ghost, SEMPRE. Qui essere permissivi e' giusto, al contrario di quando si
// trattava di ESEGUIRE: togliere di piu' fa al massimo sparire una parentesi quadra innocua,
// mentre lasciarne passare una mostra al Ghost la ferraglia interna del sistema.
// Ogni rimozione viene registrata nel log di debug: se il modello ricomincia a produrre tag, si
// vede li' invece di scoprirlo da uno screenshot.
const TAG_AZIONE_RE = /\[\s*azione\s*:[^\]]*\]/gi;
function ripulisciTagAzione(testo) {
  const originale = String(testo || "");
  const rimossi = originale.match(TAG_AZIONE_RE) || [];
  if (!rimossi.length) return { testo: originale, rimossi: [] };
  return { testo: originale.replace(TAG_AZIONE_RE, "").replace(/\n{3,}/g, "\n\n").trim(), rimossi };
}

// ══════════════════════════════════════════════════════════════════════════════
// IL VINCOLO STRUTTURALE SUL TESTO DI ESITO (17/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 17/08 il Ghost ha chiesto un promemoria, lo Shell ha scritto "Il tuo calendario e' stato
// aggiornato", e su Google non c'era niente. Zero chiamate erano partite.
//
// La volta prima avevo corretto lo stesso difetto con un'ISTRUZIONE nel prompt ("non usare mai il
// passato"). Non ha tenuto, e non poteva tenere: un'istruzione in un prompt e' una richiesta, non
// una garanzia, e il modello non ha nessun modo di sapere se l'azione sia avvenuta — quel dato non
// gli arriva. Gli si stava chiedendo di essere sincero su un fatto che non conosce.
//
// Quindi il vincolo si sposta dove il fatto e' noto: nel CODICE. Il programma sa se una scrittura
// e' partita e se e' stata riletta dalla fonte. Qui si prende il testo del modello e si toglie di
// mezzo qualunque affermazione di compiuto che non corrisponda a un'azione davvero verificata in
// questo turno. Non e' una moderazione dello stile: e' l'unico punto del sistema che puo'
// distinguere "e' successo" da "il modello lo ha scritto".
// I confini di parola sono UNICODE, non \b. Imparato sbagliando due volte in questo file: \b in
// JavaScript ragiona sull'alfabeto inglese, quindi "\be" davanti a "è" non aggancia niente e la
// frase esatta che il Ghost ha letto — "è stato aggiornato" — sarebbe passata indisturbata.
// CORRETTI IL 20/08/2026 (sera). Prima erano (?<!\p{L}) e (?!\p{L}) — "non deve esserci una
// LETTERA prima". Ma in «c'è» il carattere prima di «è» e' un apostrofo, che non e' una lettera:
// il confine passava, e il filtro agganciava «è sul calendario» partendo da DENTRO la parola,
// lasciando «c'» orfano. Il Ghost ha letto: «non so cosa c'[non ancora — serve la tua conferma]».
// Stessa forma di errore dei titoli tagliati a 40 caratteri il 16/08: un confine che non conosce
// il pezzo di lingua che sta tagliando.
const CONF_S = "(?<![\\p{L}'’])";  // inizio di parola: ne' lettera ne' apostrofo prima
const CONF_E = "(?![\\p{L}'’])";   // fine di parola, accenti ed elisioni comprese
const PARTICIPI = "aggiornat|aggiunt|salvat|creat|inviat|fissat|inserit|impostat|registrat|segnat|mess|spedit|mandat";
const ESITO_COMPIUTO_RE = new RegExp(
  "(" +
  // "è stato aggiornato/aggiunto/salvato/creato/inviato/fissato/inserito/impostato/registrato"
  `${CONF_S}(?:e'|è)\\s+stat[oaie]\\s+(?:${PARTICIPI})[oaie]${CONF_E}` +
  // "ho aggiunto", "l'ho salvato", "te l'ho messo", "li ho inseriti", "ho già inviato"
  `|${CONF_S}(?:(?:te\\s+|glie\\s+|ve\\s+|me\\s+)?l['’]|li\\s+|le\\s+|ne\\s+)?\\s*ho\\s+(?:gia['’]?\\s+|già\\s+)?(?:${PARTICIPI})[oaie]${CONF_E}` +
  // "aggiunto al calendario", "salvato in calendario"
  `|${CONF_S}(?:aggiunt|salvat|creat|inserit|fissat|registrat)[oaie]\\s+(?:al|nel|in|sul|sulla)\\s+calendario${CONF_E}` +
  // "inviata la mail", "spedito il messaggio"
  `|${CONF_S}(?:inviat|spedit|mandat)[oaie]\\s+(?:la\\s+|il\\s+)?(?:mail|email|messaggio)${CONF_E}` +
  // "è ora in calendario", "è sul tuo calendario"
  `|${CONF_S}(?:e'|è)\\s+(?:ora\\s+|adesso\\s+|già\\s+)?(?:in|nel|sul|sulla)\\s+(?:tuo\\s+|tua\\s+)?calendario${CONF_E}` +
  // "fatto." / "ecco fatto!" a se' stanti
  "|(?:^|[.!?\\n]\\s*)(?:ecco\\s+)?fatto\\s*[.!]" +
  // 31/08/2026 — I PARTICIPI IN FORMA DI INTESTAZIONE, portati dal Ghost con lo schermo davanti.
  // Lo Shell ha scritto, uno sotto l'altro:
  //     "Percorso aperto: **Divenire — Concept album** (VIDYA)"
  //     "Nodo 1 completato: canovaccio architettura narrativa e sonora"
  // e piu' sotto, in un altro turno, "Ho salvato". La guardia ha fermato SOLO l'ultima — quella
  // col participio e l'ausiliare — e ha lasciato passare le prime due, che erano le piu' gravi:
  // nessun percorso esisteva, e nessun nodo. Il difetto e' che tutte le alternative qui sopra
  // cercano un VERBO CONIUGATO ("e' stato creato", "ho salvato"), mentre questa forma non ha
  // verbo: e' un participio messo a fare da titolo, con i due punti al posto della copula. E'
  // proprio la forma piu' pericolosa, perche' sembra l'intestazione di un risultato acquisito.
  // Il numero facoltativo in mezzo copre "Nodo 1 completato:". Le domande e le ipotesi restano
  // escluse da contestoNonAffermativo come per ogni altra alternativa.
  "|(?:^|\\n)[ \\t]*(?:\\*\\*)?(?:percors\\w+|nod\\w+|document\\w+|artefatt\\w+|voce|semi?|event\\w+|pian\\w+|file)\\s+(?:\\d+\\s+)?(?:\\*\\*)?" +
  // "completat", non "complet": ogni voce qui e' il participio SENZA la vocale finale, che la
  // classe [oaie] aggiunge dopo. Scritto "complet", "Nodo 1 completato:" non veniva riconosciuto —
  // e "Nodo 1 completato:" e' letteralmente una delle due righe che il Ghost ha visto sullo schermo.
  `(?:${PARTICIPI}|apert|completat|chius|archiviat|generat|prodott)[oaie](?:\\*\\*)?\\s*:` +
  // 01/09/2026 — LA NOMINALIZZAZIONE, portata dal Ghost con lo schermo davanti. Lo Shell ha scritto:
  //     "Il percorso Divenire esiste gia' in VIDYA (...). Non ne creo uno nuovo — riprendo quello
  //      aperto. Salvataggio dei testi elaborati nel percorso attivo."
  // Tre affermazioni false in tre righe, e la terza e' passata intatta anche dopo il fix dei
  // participi-titolo di ieri: "Salvataggio dei testi" non ha verbo NE' participio, e' un sostantivo
  // messo a fare da etichetta di stato. E' la forma piu' insidiosa delle tre, perche' suona
  // esattamente come l'intestazione di qualcosa che il sistema ha registrato.
  // IL FRENO CONTRO I FALSI POSITIVI: non basta il sostantivo a inizio riga — "Creazione del
  // profilo — passo 3" dentro un documento generato e' prosa legittima. Serve che la stessa riga
  // nomini un OGGETTO DELL'APP (percorso, calendario, memoria, documento, evento, Seme...), che e'
  // cio' che distingue "sto dichiarando di aver toccato il sistema" da "sto scrivendo un elenco".
  // Resta la direzione in cui questo filtro deve sbagliare: in difetto, mai rompendo una frase buona.
  "|(?:^|\\n)[ \\t]*(?:\\*\\*)?(?:salvataggio|creazione|aggiunta|registrazione|invio|inserimento|archiviazione|apertura|chiusura|generazione|aggiornamento|eliminazione|cancellazione)" +
  "\\s+(?:del|dello|della|dei|degli|delle|di|d['’])[^\\n.!?]{0,70}?" +
  "(?:percors\\w*|calendario|agenda|memoria|pilastr\\w*|document\\w*|drive|event\\w*|mail|sem[ei]|voce|nod\\w*)" +
  ")", "giu");
const ESITO_SOSTITUZIONE = "[non ancora — serve la tua conferma]";
// azioneVerificata: true SOLO quando in questo turno c'e' stata un'azione esterna riletta dalla
// fonte. In ogni altro caso — nessuna azione, azione proposta ma non confermata, azione fallita —
// nessuna affermazione di compiuto puo' sopravvivere.
// ── IL GUARDIANO DEL CONTESTO (20/08/2026, sera) ──────────────────────────────
// Il difetto piu' grave del filtro non era l'apostrofo: era che non distingueva un'AFFERMAZIONE
// da una domanda, una negazione o un'ipotesi. «non so cosa c'è sul calendario» e «vuoi che guardi
// cosa c'è sul calendario?» non dichiarano niente come fatto, e venivano tagliate lo stesso.
//
// COME LO RISOLVO, detto in chiaro perche' il brief lo chiede.
// Per ogni corrispondenza si guarda la frase che la contiene e, dentro quella frase, il pezzo che
// viene PRIMA della corrispondenza — la rincorsa. Se la frase e' una domanda, o se nella rincorsa
// c'e' una negazione, un'ipotesi o un verbo che apre una subordinata ("so cosa…", "guardi cosa…"),
// la corrispondenza si lascia stare.
//
// COSA QUESTO METODO NON E'. Non e' analisi grammaticale: e' un riconoscimento di forme di
// superficie dell'italiano. Sbagliera' ancora, ma sbagliera' quasi sempre IN DIFETTO — lasciando
// passare qualche affermazione falsa invece di rompere una frase buona. E' la direzione giusta in
// cui sbagliare: un'affermazione falsa che passa resta un problema visibile e correggibile, un
// riquadro rosso che compare quando non serve insegna al Ghost a ignorare il riquadro rosso, e a
// quel punto il filtro non protegge piu' niente.
const NEGAZIONE_RE = /(?<![\p{L}'’])(non|ne|né|nè|nessun\w*|niente|nulla|mai|senza)(?![\p{L}'’])/iu;
const IPOTETICO_RE = /(?<![\p{L}'’])(se|qualora|quando|appena|vuoi|vorresti|vorrei|posso|potrei|potresti|devo|dovrei|magari|forse|probabilmente|sarebbe|sarà|dimmi|fammi|conferma|confermi|oppure)(?![\p{L}'’])/iu;
const SUBORDINATA_RE = /(?<![\p{L}'’])(cosa|quello|ciò|so|sappia|sapere|sai|guardi|guardare|guardo|controlli|controllare|controllo|vedere|veda|vedo|verificare|verifichi|chiedi|chiedere|capire|capisco)(?![\p{L}'’])/iu;
// Restituisce il motivo per cui una corrispondenza NON e' un'affermazione, oppure null.
function contestoNonAffermativo(testo, indice) {
  const prima = testo.slice(0, indice);
  const inizioFrase = Math.max(prima.lastIndexOf("."), prima.lastIndexOf("!"), prima.lastIndexOf("?"), prima.lastIndexOf("\n"), prima.lastIndexOf(";"), -1) + 1;
  const daQui = testo.slice(indice);
  const scarto = daQui.search(/[.!?\n]/);
  const frase = testo.slice(inizioFrase, scarto < 0 ? testo.length : indice + scarto + 1).trim();
  const rincorsa = testo.slice(inizioFrase, indice);
  if (/\?$/.test(frase)) return "è una domanda";
  if (NEGAZIONE_RE.test(rincorsa)) return "è una negazione";
  if (IPOTETICO_RE.test(rincorsa)) return "è un'ipotesi o una domanda";
  if (SUBORDINATA_RE.test(rincorsa)) return "è una subordinata, non un'affermazione";
  return null;
}
function ripulisciAffermazioniDiEsito(testo, azioneVerificata = false) {
  const originale = String(testo || "");
  if (azioneVerificata) return { testo: originale, affermazioni: [] };
  // Si raccolgono le corrispondenze CON LA LORO POSIZIONE, perche' il guardiano ha bisogno di
  // sapere cosa c'e' intorno. La sostituzione avviene poi dall'ultima alla prima, cosi' gli indici
  // di quelle precedenti restano validi.
  const trovate = [...originale.matchAll(ESITO_COMPIUTO_RE)];
  if (!trovate.length) return { testo: originale, affermazioni: [] };
  const daTogliere = [], risparmiate = [];
  for (const m of trovate) {
    const motivo = contestoNonAffermativo(originale, m.index);
    if (motivo) risparmiate.push({ frase: m[0].trim(), motivo });
    else daTogliere.push(m);
  }
  if (!daTogliere.length) return { testo: originale, affermazioni: [], risparmiate };
  let out = originale;
  for (let i = daTogliere.length - 1; i >= 0; i--) {
    const m = daTogliere[i];
    out = out.slice(0, m.index) + ESITO_SOSTITUZIONE + out.slice(m.index + m[0].length);
  }
  return { testo: out, affermazioni: daTogliere.map((m) => m[0].trim()), risparmiate };
}

// ══════════════════════════════════════════════════════════════════════════════
// IL VINCOLO GEMELLO: NIENTE DOMANDE DI CONFERMA SENZA BERSAGLIO (17/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il filtro qui sopra chiude un lato: il modello non puo' piu' dire che una cosa e' fatta.
// Restava aperto il lato opposto, e il Ghost ci e' cascato dentro la mattina dopo: il modello ha
// scritto "Vuoi confermare?" — e non e' comparso nessun pulsante, perche' dietro quella domanda non
// c'era nessuna proposta. Il Ghost ha risposto "Si, confermato" a parole, perche' non aveva altra
// scelta, ed e' rientrato nello stesso giro.
// Stessa causa di fondo: il testo del modello non e' legato allo stato reale del sistema.
// Stessa cura: il codice guarda se la proposta esiste PRIMA di lasciar passare la domanda.
// Nominata una volta sola (prima viveva inline, duplicata) perche' la usano due controlli diversi:
// il testo del riquadro "con giorno e ora" e il caso "calendario spento senza dirlo" del 25/08.
const PARLA_DI_CALENDARIO_RE = /(?:calendario|appuntament|impegn|agenda|promemoria|evento|event[oi]|riunion|ore\s+\d)/i;
const DOMANDA_CONFERMA_RE = new RegExp(
  "(" +
  `${CONF_S}vuoi\\s+(?:che\\s+(?:lo|la|li|le)\\s+)?(?:confermare|confermarlo|confermarla)${CONF_E}` +
  `|${CONF_S}vuoi\\s+confermare${CONF_E}` +
  `|${CONF_S}(?:me\\s+lo\\s+)?confermi${CONF_E}` +
  `|${CONF_S}confermi\\?` +
  `|${CONF_S}vuoi\\s+che\\s+(?:lo|la|li|le)\\s+(?:aggiung|mett|salv|fiss|invi|mand|scriv|segn)\\w*${CONF_E}` +
  `|${CONF_S}(?:posso|devo)\\s+(?:aggiungerl|metterl|salvarl|fissarl|inviarl|mandarl|procedere)\\w*${CONF_E}` +
  `|${CONF_S}procedo${CONF_E}` +
  `|${CONF_S}dammi\\s+(?:una\\s+)?conferma${CONF_E}` +
  // 25/08/2026 — "Conferma sulla card che compare" e' scivolata attraverso tutte le forme sopra:
  // non e' una domanda ("confermi?"), e' un'istruzione al Ghost su dove trovare il pulsante.
  // Coperta qui perche' e' la stessa promessa di un pulsante in arrivo, detta in un modo nuovo.
  // Non e' la cura vera — quella e' il controllo strutturale piu' sotto, che guarda il FATTO
  // (una proposta e' stata creata o no) invece di indovinare ogni frase possibile.
  `|${CONF_S}confer(?:ma|mi)\\s+(?:qui\\s+)?(?:sulla|sul|nella|nel|con la)\\s+card\\w*` +
  ")", "giu");
function rilevaDomandaDiConferma(testo) {
  return (String(testo || "").match(DOMANDA_CONFERMA_RE) || []).map((s) => s.trim());
}
// Una proposta non confermata scade. Non e' una comodita': senza scadenza, una card lasciata li'
// una settimana fa continuerebbe a contare come "in attesa" e a bloccare quelle nuove — che e'
// esattamente cio' che ha tenuto fermo il Ghost dal 16 al 20 agosto.
const PROPOSTA_SCADE_DOPO_MINUTI = 20;
function propostaScaduta(quando, adesso = Date.now()) {
  const t = Date.parse(String(quando || ""));
  if (Number.isNaN(t)) return true; // senza orario non si puo' dire che sia recente: si considera morta
  return (adesso - t) > PROPOSTA_SCADE_DOPO_MINUTI * 60000;
}

// ══════════════════════════════════════════════════════════════════════════════
// IL TERZO FILTRO: IL MODELLO NON DICHIARA LO STATO DEGLI INTERRUTTORI (20/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha acceso il calendario, ha chiesto un evento, e lo Shell ha risposto che "la capacita'
// di inviare aggiornamenti al calendario e' attualmente limitata". Alla quarta richiesta ha
// scritto, testualmente: "anche se la funzione e' attivata, la capacita' ... e' attualmente
// spenta" — cioe' ha riconosciuto che l'interruttore era acceso e ha rifiutato lo stesso.
// Stessa famiglia degli altri due filtri: il testo del modello non e' legato allo stato reale.
// Qui lo stato reale e' un booleano che il programma ha in mano. Non c'e' nessuna ragione per cui
// il modello debba poterlo contraddire, e quindi non gli si lascia farlo.
const CAPACITA_SPENTA_RE = new RegExp(
  "(" +
  // "la capacità ... è attualmente limitata/spenta/disattivata/non disponibile"
  `${CONF_S}(?:la\\s+)?(?:capacit[aà]|funzionalit[aà]|funzione|possibilit[aà])[^.!?\\n]{0,80}?(?:e'|è)\\s+(?:attualmente\\s+|al momento\\s+|per ora\\s+)?(?:limitat|spent|disattivat|disabilitat|non\\s+attiv|non\\s+disponibil)\\w*` +
  // "non posso perché è spenta/limitata/disattivata"
  `|${CONF_S}non\\s+(?:posso|riesco a)\\s+[^.!?\\n]{0,60}?perch[eé][^.!?\\n]{0,60}?(?:limitat|spent|disattivat|disabilitat|non\\s+attiv)\\w*` +
  // "l'invio ... è una funzionalità attualmente limitata"
  `|${CONF_S}(?:e'|è)\\s+una\\s+(?:funzionalit[aà]|capacit[aà])\\s+(?:attualmente\\s+|al momento\\s+)?(?:limitat|spent|disattivat|non\\s+attiv)\\w*` +
  // 22/08/2026 — "non posso cancellare gli eventi". Era vero fino a stamattina e da oggi non lo e'
  // piu': cancellare esiste. La riga qui sotto lo intercetta, e il controllo per-capacita' piu' sotto
  // fa il resto — se l'interruttore della cancellazione e' spento la frase resta, perche' e' vera.
  // Vale solo per le SCRITTURE: su una lettura "non posso" puo' essere vero per mille altri motivi
  // (la rete, il permesso), e smentirlo sarebbe il difetto opposto.
  `|${CONF_S}non\\s+(?:posso|riesco\\s+a|so)\\s+(?:pi[uù]\\s+)?(?:cancellar\\w*|eliminar\\w*|rimuover\\w*|disdire)[^.!?\\n]{0,40}` +
  // 24/08/2026 — lo stesso, per lo spostamento: era vero fino a ieri, da oggi non lo e' piu'.
  `|${CONF_S}non\\s+(?:posso|riesco\\s+a|so)\\s+(?:pi[uù]\\s+)?(?:spostar\\w*|rimandar\\w*|anticipar\\w*|posticipar\\w*|riprogrammar\\w*)[^.!?\\n]{0,40}` +
  ")", "giu");
function rilevaDichiarazioneCapacitaSpenta(testo) {
  return (String(testo || "").match(CAPACITA_SPENTA_RE) || []).map((s) => s.trim());
}
// Confronta cio' che il modello ha detto con il DATO. Restituisce le affermazioni che contraddicono
// lo stato reale, cioe' quelle da neutralizzare. Se davvero tutto e' spento, il modello ha ragione
// e il testo passa intatto: la frase e' sbagliata solo quando e' falsa.
// Le parole con cui una frase nomina UNA capacita' precisa. Servono perche' il filtro deve smentire
// solo la capacita' di cui si parla, non "una qualsiasi".
const PAROLE_DELLE_CAPACITA = {
  leggi_calendario: /legger\w*|lettur\w*|guardar\w*|consultar\w*|veder\w*\s+(?:cosa|gli|il)/i,
  crea_evento_calendario: /creare|aggiunger\w*|metter\w*|segnar\w*|fissar\w*|inserir\w*/i,
  cancella_evento_calendario: /cancellar\w*|eliminar\w*|togliere|rimuover\w*|disdire|annullar\w*/i,
  // 24/08/2026 — aggiunta insieme all'azione. "modificar*" resta fuori apposta: cambiare il
  // titolo o la descrizione di un evento non e' quello che questa capacita' fa.
  sposta_evento_calendario: /spostar\w*|rimandar\w*|anticipar\w*|posticipar\w*|riprogrammar\w*|cambiar\w*\s+(?:data|ora|giorno)/i,
  invia_mail: /invi\w*|mandar\w*|spedir\w*|mail|email|posta/i,
  // 25/08/2026 — aggiunta insieme a trova_evento_calendario. Distinta da leggi_calendario: quella
  // legge un periodo intero, questa cerca UN evento per nome. Le due frasi non si sovrappongono.
  trova_evento_calendario: /trovar\w*\s+quando|cercar\w*\s+quando|quando\s+(?:e'|è)\s+l['’]?appuntamento|a\s+che\s+ora/i,
};
// Quale capacita' nomina questa frase? null se non si capisce.
function capacitaNominata(frase) {
  const f = String(frase || "");
  const candidati = Object.entries(PAROLE_DELLE_CAPACITA).filter(([, re]) => re.test(f)).map(([id]) => id);
  if (candidati.length !== 1) return null; // zero o ambigua: non si indovina
  return candidati[0];
}
// 25/08/2026 — LA SCORCIATOIA DIRETTA PER trova_evento_calendario. Su richiesta del Ghost, dopo
// aver gia' alleggerito in token la chiamata di selezione: qui si evita PROPRIO quella chiamata,
// quando la frase e' abbastanza chiara da non avere bisogno di un modello che scelga.
// Riconosce SOLO le due forme viste davvero nell'uso reale — "a che ora e'/ho X" e "quando e'/ho
// X" quando X e' vicinissimo a una parola di calendario (appuntamento, impegno, visita, riunione).
// La finestra fra il "quando" e la parola di calendario e' tenuta CORTA apposta (20 caratteri): e'
// la differenza fra "quando ho l'appuntamento con Marzio" (li' vicino, scatta) e "quando ho
// parlato con te mi hai raccontato dell'appuntamento" (lontano, non scatta, resta al modello) —
// una frase come questa non e' una richiesta di cercare un evento, e non deve essere trattata come
// tale solo perche' contiene entrambe le parole da qualche parte.
// Se non scatta, NON succede niente di diverso da oggi: si passa comunque dalla selezione col
// modello, esattamente come prima che questa scorciatoia esistesse. Non puo' quindi peggiorare
// niente, solo evitare la chiamata quando è superflua.
// NOTA TECNICA: dopo "e'"/"ho"/"abbiamo" (parole) ci vorrebbe \b, ma dopo "è" (lettera accentata,
// che \w in JavaScript non riconosce come carattere di parola) \b non scatta MAI fra una vocale
// accentata e uno spazio — sono entrambi "non di parola" per il motore, quindi il confine sparisce
// e il gruppo restava silenziosamente rotto per meta' dei casi reali ("Quando È l'appuntamento",
// "A che ora È"). Sostituito con un lookahead esplicito su spazio/punteggiatura/fine stringa, che
// funziona identico per "è" e per le parole ASCII.
// 25/08/2026 (sera) — aggiunta la forma elisa "quand'è"/"quand'ho": il Ghost ha scritto "Dimmi
// quand'è l'appuntamento con Luigino" e la scorciatoia non scattava, perche' cercava "quando" +
// spazio, non "quand'" + apostrofo senza spazio — una contrazione comunissima in italiano parlato
// che semplicemente non avevo previsto. Caduta in questo caso sulla selezione col modello, che ha
// ripetuto lo stesso difetto di punteggioBersaglio corretto qui sopra (vedi commento lì).
// 25/08/2026 (notte) — aggiunta la forma "cerca/cercami/trova + [parola di calendario] con X",
// senza "quando"/"a che ora": il Ghost ha scritto "vorrei che cercassi... il prossimo appuntamento
// con Marialdo", che non chiede affatto "quando" a parole ma vuole esattamente la stessa cosa —
// e finiva sulla selezione col modello capace, la cui accuratezza si paga in secondi di
// ragionamento reale (misurato: 279 token su 316 in quel turno). Richiede "con" subito dopo la
// parola di calendario apposta per NON scattare su "cerca i miei impegni di domani" (un periodo,
// non un nome — quella resta a leggi_calendario).
const TROVA_EVENTO_DIRETTO_RE = /\ba\s+che\s+ora\s+(?:e'|è|ho|abbiamo)(?=[\s.,!?;:]|$)|\bquand(?:o\s+|['’])(?:e'|è|ho|abbiamo)(?=[\s.,!?;:]|$)[^.!?\n]{0,20}?\b(?:appuntament\w*|impegn\w*|visit\w*|riunion\w*)\w*\b|\b(?:cerc\w*|trov\w*)\b[^.!?\n]{0,40}?\b(?:appuntament\w*|impegn\w*|visit\w*|riunion\w*)\w*\s+con\b/i;
// true solo se la frase e' un candidato sicuro per la scorciatoia. Chi chiama decide ancora se la
// capacita' e' accesa: qui si guarda solo il testo, non lo stato dell'interruttore.
function candidataTrovaEventoDiretta(userText) {
  return TROVA_EVENTO_DIRETTO_RE.test(String(userText || ""));
}
// DIFETTO REALE, osservato dal Ghost il 25/08/2026 la sera: chiesto "Quando è l'appuntamento con
// Luigino?" (un evento chiamato solo "Luigino"), la scorciatoia rispondeva "Marzio" — un evento
// DIVERSO, chiamato "appuntamento con Marzio". La causa: la scorciatoia passava a
// trovaEventoBersaglio l'INTERA frase del Ghost come descrizione da confrontare, comprese le
// parole "appuntamento" e "con" — che sono proprio le parole del TRIGGER, quindi presenti in OGNI
// frase che usa questa scorciatoia. punteggioBersaglio conta ogni parola condivisa con il titolo
// (senza pesare quanto sia specifica): un evento chiamato "appuntamento con Marzio" guadagnava
// punti da "appuntamento" e "con" anche quando si stava cercando "Luigino", e senza altre parole
// a fare da contrappeso quei punti bastavano a farlo vincere sul bersaglio vero.
// La cura: togliere dalla frase le parole del trigger e i connettivi piu' comuni PRIMA di
// consegnarla alla ricerca, cosi' che resti solo il nome — la stessa disciplina che il modello,
// nell'altro percorso (scegliAzione), applica gia' da solo perche' gli e' scritto esplicitamente
// di "copiare le parole del Ghost" riferite all'evento, non l'intera frase.
// "quand" (senza la "o") e' la forma elisa "quand'è"/"quand'ho": l'apostrofo separa il token dal
// resto, quindi "quando" da solo non la intercetta — vedi il commento su TROVA_EVENTO_DIRETTO_RE.
// "cerc\w*"/"trov\w*" (non piu' solo "cerca"/"cercami" letterali) coprono anche "cercassi",
// "cercherei", "trovami" ecc. — la stessa ragione per cui la scorciatoia li riconosce ora.
const RUMORE_BERSAGLIO_RE = /\b(quando|quand|che|ora|e|è|ho|abbiamo|con|per|del|dell|nel|nello|nella|nei|degli|delle|sul|sull|sulla|calendario|agenda|appuntament\w*|impegn\w*|visit\w*|riunion\w*|cerc\w*|trov\w*|controlla|controllami|dimmi|sai|vorrei|prossim\w*|giorni|giorno|questo|questa|il|lo|la|l|un|uno|una)\b/gi;
function estraiBersaglioPerRicercaDiretta(userText) {
  const ripulito = String(userText || "").replace(RUMORE_BERSAGLIO_RE, " ").replace(/[?.!,;:'’]/g, " ").replace(/\s+/g, " ").trim();
  // Se dopo la pulizia non resta niente (frase fatta solo di parole del trigger), meglio l'intera
  // frase originale che una ricerca vuota: e' un fallback, non il percorso normale.
  return ripulito || String(userText || "").trim();
}
function smentisciCapacitaSpenta(testo, attive) {
  const originale = String(testo || "");
  const dichiarazioni = rilevaDichiarazioneCapacitaSpenta(originale);
  if (!dichiarazioni.length) return { testo: originale, smentite: [], accese: [] };
  const acceseDiClasseB = (attive || []).filter((a) => a.classe === "B");
  if (!acceseDiClasseB.length) return { testo: originale, smentite: [], accese: [] };
  const idAccese = new Set(acceseDiClasseB.map((a) => a.id));
  // 22/08/2026, terzo giro — CORRETTO DOPO UNA PROVA CHE L'HA COLTO SUL FATTO. Con l'interruttore
  // della LETTURA spento e quelli di scrittura accesi, lo Shell diceva giustamente "la capacita' di
  // leggere il calendario e' spenta" e questo filtro rispondeva "[non e' vero: quella capacita' e'
  // accesa]". Era il filtro a mentire, non il modello: guardava se fosse accesa UNA QUALSIASI delle
  // Classe B, non quella nominata. Finche' le Classe B erano due il caso non si presentava; con la
  // terza si e' presentato subito. Adesso si smentisce solo cio' che il dato smentisce davvero.
  const daSmentire = [], risparmiate = [];
  for (const d of dichiarazioni) {
    const quale = capacitaNominata(d) || capacitaNominata(originale);
    if (quale && !idAccese.has(quale)) { risparmiate.push({ frase: d, motivo: "quella capacita' e' davvero spenta" }); continue; }
    if (!quale && acceseDiClasseB.length < AZIONI_CONVERSAZIONALI.filter((a) => a.classe === "B").length) {
      // Frase generica e non tutte le capacita' sono accese: non si puo' dire che sia falsa.
      risparmiate.push({ frase: d, motivo: "la frase non dice quale capacita', e non sono tutte accese" });
      continue;
    }
    daSmentire.push(d);
  }
  if (!daSmentire.length) return { testo: originale, smentite: [], accese: [], risparmiate };
  let out = originale;
  for (const d of daSmentire) out = out.split(d).join("[non è vero: quella capacità è accesa]");
  return { testo: out, smentite: daSmentire, accese: acceseDiClasseB.map((a) => a.etichetta), risparmiate };
}
// Il blocco che dice al modello cosa e' ACCESO in questo momento. Il gemello di formatCapacitaSpente,
// e serve per la stessa ragione: il blocco delle capacita' dell'app conteneva frasi FISSE come
// "NASCONO SPENTE", scritte il 16/08 quando erano davvero spente per tutti. Erano vere quel giorno,
// e sono diventate false il giorno in cui il Ghost ne ha accesa una — senza che nessuno le
// aggiornasse, perche' erano testo, non un dato letto.
function formatCapacitaAccese(attive) {
  const b = (attive || []).filter((a) => a.classe === "B");
  if (!b.length) return "";
  return `\nQueste capacita' sono ACCESE adesso, e funzionano: ${b.map((a) => a.etichetta).join(", ")}. Se il Ghost te ne chiede una, NON dire che e' spenta, limitata o non disponibile — non e' vero, e lui lo sa perche' l'interruttore ce l'ha davanti. Rispondi normalmente: il programma preparera' la proposta con il pulsante.`;
}
// ATTENZIONE, distinzione importante: ieri ho RIMOSSO la funzione che deduceva una conferma dal
// testo, perche' una frase generica non deve MAI far partire un'azione. Questa e' l'uso opposto e
// sicuro: non serve a confermare qualcosa, serve ad accorgersi che il Ghost sta confermando A VUOTO
// per poterglielo dire. Non esegue niente e non puo' eseguire niente — non ha accesso a nessun
// esecutore. Se un giorno qualcuno volesse usarla per confermare, la risposta e' no.
// 22/08/2026 — allargata dopo aver visto come il Ghost risponde davvero alle card. "Dimmelo" e un
// "Sì" da solo non erano riconosciuti: cadevano fuori da ogni ramo e producevano il silenzio. Sono
// aggiunte solo forme che non possono aprire una richiesta nuova ("dimmelo" si', "dimmi" no: "dimmi
// cosa c'e' sul calendario" e' una richiesta vera e non va scambiata per una conferma).
const CONFERMA_A_PAROLE_RE = /^(?:s[iì]\W*)?(?:confermato|conferma|confermo|ok|okay|va bene|vabb?[eè]|procedi|prosegui|avanti|fallo|falla|dimmelo|certo|d'accordo|perfetto|dai|vai)\b|^s[iì]\s*[.!]?\s*$/i;
function sembraUnaConfermaAParole(messaggio) {
  const t = String(messaggio || "").trim();
  return t.length <= 40 && CONFERMA_A_PAROLE_RE.test(t);
}
// Il blocco che dice al modello cosa e' SPENTO adesso. Serviva: il prompt conteneva insieme
// l'elenco delle azioni possibili (senza il calendario, perche' spento) e la descrizione delle
// capacita' dell'app (col calendario descritto per esteso). Due verita' in disaccordo nello stesso
// respiro — e il modello ha creduto alla seconda.
function formatCapacitaSpente(tutte, attive) {
  const spente = tutte.filter((a) => !attive.some((b) => b.id === a.id));
  if (!spente.length) return "";
  return `\nATTENZIONE — queste capacita' esistono nell'app ma il Ghost le ha SPENTE in Setup, quindi in questo momento NON si possono fare, e nessun pulsante di conferma comparira' per esse:
${spente.map((a) => `- ${a.etichetta}`).join("\n")}
Se il Ghost chiede una di queste cose, NON dire "vuoi confermare?" e NON fare finta di poterla fare: digli che quella capacita' e' spenta e che puo' accenderla in Setup. Promettergli un pulsante che non comparira' e' il modo peggiore di rispondergli.`;
}
// ══════════════════════════════════════════════════════════════════════════════
// IL QUARTO FILTRO: NESSUN CONTENUTO DI CALENDARIO SENZA UNA LETTURA VERIFICATA (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// I tre filtri sopra cercano dichiarazioni di AZIONE COMPIUTA — "l'ho messo", "e' sul calendario",
// "quella capacita' e' spenta". Il 22/08 il Ghost ha incontrato una cosa che nessuno dei tre poteva
// vedere, perche' non e' una dichiarazione di azione: il modello ha ESPOSTO CONTENUTI.
//   "domani alle 13 c'e' un appuntamento con Carlo, e domani alle 16:00 uno con Giuseppo.
//    Non ci sono altri appuntamenti nei prossimi 7 giorni."
// Carlo non esiste. Giuseppo era il giorno prima. Petronio, che esisteva davvero, non e' nominato.
// E il riquadro delle chiamate grezze dice zero chiamate quel giorno: nessuna richiesta e' uscita
// dal telefono. Il modello ha riletto la chat di due giorni prima e l'ha presentata come lettura.
//
// Perche' e' la classe peggiore: un'azione dichiarata a vuoto si smaschera guardando il calendario,
// un CONTENUTO inventato il Ghost lo crede — e' esattamente cio' che ha chiesto e arriva nella forma
// che si aspettava. Su quella risposta avrebbe saltato Petronio e sarebbe andato a un appuntamento
// che non esiste.
//
// Il fatto strutturale che rende il difetto inevitabile senza questo filtro: nel turno di risposta
// il modello NON RICEVE MAI il calendario. La risposta si genera in runShellTurn; la selezione
// dell'azione avviene dopo; la lettura vera avviene dopo ancora, solo se il Ghost tocca "Guarda",
// e il suo esito finisce in una card, non nella conversazione. Quindi ogni contenuto di calendario
// che compare nel testo del modello e' — sempre, senza eccezione — ricostruito a memoria.
// Misurato il 22/08 su otto giri identici con la rete vera: 3 volte su 8 ha prodotto un
// appuntamento con nome e orario, 2 volte ha aggiunto "non ci sono altri impegni", una volta ha
// scritto "(verificato)" accanto a un evento mai letto. Il prompt contiene gia' dal 16/08
// l'istruzione esplicita "NON SAI cosa c'e' sul calendario del Ghost, non lo hai mai letto":
// e' la quinta volta che un'istruzione nel prompt non regge su questa classe di problema.
//
// Quindi il criterio e' IL FATTO, non la parola: se in quel turno non esiste una lettura eseguita e
// verificata, nessun contenuto di calendario puo' comparire, comunque sia formulato. Il testo si
// guarda solo DOPO, e solo per sapere quali frasi togliere.
// Togliendo frasi restano detriti di punteggiatura ("giorni....." dove c'era una sospensione e poi
// la frase tolta). Si ripuliscono solo dove qualcosa e' stato davvero rimosso: un testo intatto non
// viene mai riscritto.
function ripulisciDetriti(t) {
  return String(t || "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])\1+/g, "$1")
    .replace(/^[\s.,;:\u2014\u2013-]+/gm, (m) => (m.includes("\n") ? "\n" : ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
// Il testo che sostituisce una frase tolta quando la lettura NON c'e' stata.
const CAL_SOSTITUZIONE = "[tolto: la lettura del calendario non è avvenuta, questo non viene da Google]";
// E quello per il caso nuovo: la lettura c'e' stata, ma la frase nominava qualcosa che dentro non
// c'era. Dice una cosa diversa, perche' e' successa una cosa diversa.
const CAL_SOSTITUZIONE_FUORI = "[tolto: questo non era fra gli impegni che ho letto sul calendario]";
// Un orario: "alle 16", "alle 16:00", "13:30", "9.45".
const CAL_ORARIO_RE = new RegExp(`(${CONF_S}alle\\s+(?:[01]?\\d|2[0-3])(?:[:.]\\d{2})?${CONF_E}|${CONF_S}(?:[01]?\\d|2[0-3])[:.]\\d{2}${CONF_E})`, "iu");
// Un sostantivo che nomina la roba che sta sul calendario.
const CAL_IMPEGNO_RE = new RegExp(`${CONF_S}(?:appuntament\\w*|impegn\\w*|event\\w*|riunion\\w*|incontr\\w*|visit\\w*|convocazion\\w*|promemoria|agenda|calendario)${CONF_E}`, "iu");
// Un riferimento a un giorno: basta questo piu' un orario per essere un appuntamento riferito.
const CAL_GIORNO_RE = new RegExp(`${CONF_S}(?:oggi|domani|dopodomani|stasera|stamattina|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica|weekend|fine\\s+settimana)${CONF_E}`, "iu");
// L'affermazione che NON c'e' niente. E' un contenuto di calendario esattamente come un elenco, ed
// e' altrettanto falsa se nessuno ha letto: e' il caso che un filtro ingenuo si perde.
const CAL_ASSENZA_RE = new RegExp(`(${CONF_S}non\\s+(?:ci\\s+sono|ce\\s+ne\\s+sono|hai|ne\\s+hai|risultano|risulta|c'[eè]|compare|compaiono|trovo|ho\\s+trovato)${CONF_E}|${CONF_S}(?:nessun\\w*|niente|nulla)${CONF_E}|${CONF_S}(?:liber\\w*|vuot\\w*|sgombr\\w*|scaric\\w*)${CONF_E})`, "iu");
// Il verbo che lega un giorno e un'ora a QUALCOSA CHE STA SUL CALENDARIO. Senza di questo, "domani
// alle 16" non e' un contenuto di calendario: e' un'ora in una frase qualsiasi. La prima versione di
// questo filtro non lo distingueva e cancellava "domani alle 16 dovresti dormire di piu'", che non
// c'entra niente col calendario — un filtro che toglie frasi vere e' un difetto, non una cautela.
const CAL_ESISTENZIALE_RE = new RegExp(`${CONF_S}(?:c'[eè]|ci\\s+sono|hai|ne\\s+hai|risulta|risultano|trovo|ho\\s+trovato|previst\\w*|in\\s+programma|segnat\\w*|fissat\\w*|in\\s+agenda)${CONF_E}`, "iu");
// La frase che DICHIARA di aver letto ("ecco cosa ho trovato", "leggo dal calendario", "Risultato:").
// Non espone contenuti, ma afferma che la lettura e' avvenuta — ed e' falso quanto l'elenco che
// introduce. Vale solo dentro una risposta che parla di calendario, altrimenti "Risultato:" in un
// conto o in un piano verrebbe tolto senza motivo.
const CAL_DICHIARA_LETTO_RE = new RegExp(`(${CONF_S}ecco\\s+cosa\\s+ho\\s+trovato|${CONF_S}leggo\\s+dal\\s+calendario|${CONF_S}dal\\s+calendario\\s+risulta|${CONF_S}risultat\\w*[^.!?\\n]{0,24}:|${CONF_S}(?:lo\\s+)?sto\\s+(?:leggendo|guardando|controllando|verificando)|${CONF_S}ho\\s+(?:letto|controllato|guardato|verificato)[^.!?\\n]{0,30}(?:calendario|agenda|impegni|appuntamenti))`, "iu");
// Le tre esenzioni. Non sono cortesie: sono frasi che NON espongono contenuti, e toglierle
// peggiorerebbe la risposta invece di renderla piu' vera.
//  1. la frase dichiara che la lettura non e' avvenuta, o che sta per avvenire — cioe' dice il vero;
const CAL_DICHIARA_NON_LETTO_RE = new RegExp(`${CONF_S}(?:vado\\s+a\\s+(?:guardare|leggere|vedere|controllare)|devo\\s+(?:prima\\s+)?(?:guardare|leggere|andare|controllare)|non\\s+(?:ho|sono)\\s+(?:letto|riuscito|ancora)|non\\s+(?:posso|so)\\s+dirti|non\\s+ho\\s+(?:accesso|guardato|controllato)|non\\s+l['’]ho\\s+(?:letto|guardato)|guardo\\s+(?:io\\s+)?(?:sul|il|nel))${CONF_E}`, "iu");
//  2. la frase e' una PROPOSTA DI SCRITTURA ("te lo metto in calendario per domani alle 16"): non
//     riferisce cosa c'e', dice cosa il programma fara' se il Ghost conferma. E' la forma che il
//     brief del 17/08 ha chiesto espressamente, e romperla romperebbe la creazione di eventi;
const CAL_INTENTO_SCRITTURA_RE = new RegExp(`${CONF_S}(?:te\\s+l[oa]\\s+)?(?:metto|segno|aggiungo|fisso|inserisco|creo|scrivo|salvo|piazzo|mando|invio|spedisco)${CONF_E}`, "iu");
//  3. la frase e' una domanda: chiedere non e' riferire.
function frasiDiUnTesto(testo) {
  // Si spezza su fine-frase e su a-capo, tenendo i pezzi con i loro delimitatori, cosi' un elenco
  // puntato ("- Domani alle 16:00, Giuseppo") conta come una frase per conto suo.
  const out = [];
  let inizio = 0;
  const s = String(testo || "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n" || ((s[i] === "." || s[i] === "!" || s[i] === "?") && !/\d/.test(s[i + 1] || ""))) {
      out.push({ inizio, fine: i + 1, testo: s.slice(inizio, i + 1) });
      inizio = i + 1;
    }
  }
  if (inizio < s.length) out.push({ inizio, fine: s.length, testo: s.slice(inizio) });
  return out;
}
// Dice se UNA frase espone contenuti di calendario, e perche'. Restituisce null se non li espone.
// `inDiscorsoDiCalendario` dice se la risposta NEL SUO INSIEME parla di calendario: serve solo per
// la terza regola, quella sulle frasi che dichiarano di aver letto.
function contenutoDiCalendario(frase, inDiscorsoDiCalendario = true) {
  const f = String(frase || "");
  if (!f.trim()) return null;
  if (CAL_DICHIARA_NON_LETTO_RE.test(f)) return null;      // dice il vero: non l'ha letto
  if (CAL_INTENTO_SCRITTURA_RE.test(f)) return null;       // e' una proposta di scrittura
  if (/\?\s*$/.test(f.trim())) return null;                // e' una domanda
  const haImpegno = CAL_IMPEGNO_RE.test(f);
  const haOrario = CAL_ORARIO_RE.test(f);
  const haGiorno = CAL_GIORNO_RE.test(f);
  // Un sostantivo d'agenda con un'ora: "appuntamento con Giuseppo alle 16".
  if (haImpegno && haOrario) return "riferisce un appuntamento con un orario";
  // Oppure un giorno e un'ora legati da un verbo che ne afferma l'esistenza: "domani alle 13 c'e'
  // Carlo". Senza quel verbo, giorno e ora non bastano.
  if (haGiorno && haOrario && CAL_ESISTENZIALE_RE.test(f)) return "riferisce un appuntamento con un orario";
  if (haImpegno && CAL_ASSENZA_RE.test(f)) return "afferma che non ci sono impegni";
  if (inDiscorsoDiCalendario && CAL_DICHIARA_LETTO_RE.test(f)) return "dichiara di aver letto il calendario";
  return null;
}
// Il filtro vero e proprio. `letturaVerificata` e' un FATTO che il programma ha in mano, non una
// valutazione del testo: e' vero solo se in questo turno una lettura del calendario e' stata
// eseguita e ha risposto. Se e' vero, il testo passa intatto — il modello sta riferendo qualcosa
// che qualcuno ha davvero letto, e un falso allarme qui sarebbe un danno.
// 22/08/2026, terzo giro — IL FILTRO CAMBIA MESTIERE. Il secondo argomento non e' piu' un booleano
// ma la lettura stessa, perche' adesso servono due criteri diversi e non uno:
//   · lettura assente  → nessun contenuto di calendario nel testo (comportamento di stamattina);
//   · lettura presente → nessun contenuto di calendario che NON venga dalla lettura.
// Il secondo criterio e' quello che stamattina mancava: con la lettura riuscita il filtro taceva del
// tutto, e il 22/08 alle 14:41 ha lasciato passare "domani alle 16 c'e' Giuseppo" mentre la lettura
// diceva Petronio. Per compatibilita' il secondo argomento accetta ancora true/false: true vale
// come "una lettura c'e' stata ma non so cosa conteneva", e in quel caso non si toglie niente.
function ripulisciContenutiDiCalendario(testo, lettura = false) {
  const originale = String(testo || "");
  if (!originale.trim()) return { testo: originale, contenuti: [] };
  const letturaOggetto = lettura && typeof lettura === "object" && !lettura.saltata && lettura.ok ? lettura : null;
  const letturaRiuscita = letturaOggetto ? true : lettura === true;
  const parlaDiCalendario = CAL_IMPEGNO_RE.test(originale);
  const frasi = frasiDiUnTesto(originale);
  // Con una lettura vera in mano il criterio e' il confronto con cio' che e' stato letto.
  if (letturaOggetto) {
    const vocab = vocabolarioDellaLettura(letturaOggetto);
    const fuori = frasi
      .map((fr) => ({ ...fr, motivo: contenutoDiCalendario(fr.testo, parlaDiCalendario) ? nominaQualcosaFuoriDallaLettura(fr.testo, vocab) : null }))
      .filter((fr) => fr.motivo);
    if (!fuori.length) return { testo: originale, contenuti: [] };
    let out = originale;
    for (let i = fuori.length - 1; i >= 0; i--) out = out.slice(0, fuori[i].inizio) + out.slice(fuori[i].fine);
    out = ripulisciDetriti(out);
    return {
      testo: (out ? out + "\n\n" : "") + CAL_SOSTITUZIONE_FUORI,
      contenuti: fuori.map((fr) => ({ frase: fr.testo.trim(), motivo: fr.motivo })),
    };
  }
  if (letturaRiuscita) return { testo: originale, contenuti: [] };
  const daTogliere = frasi.map((fr) => ({ ...fr, motivo: contenutoDiCalendario(fr.testo, parlaDiCalendario) })).filter((fr) => fr.motivo);
  if (!daTogliere.length) return { testo: originale, contenuti: [] };
  let out = originale;
  for (let i = daTogliere.length - 1; i >= 0; i--) {
    const fr = daTogliere[i];
    out = out.slice(0, fr.inizio) + out.slice(fr.fine);
  }
  out = ripulisciDetriti(out);
  // Il testo sostitutivo dice cosa e' successo davvero. Non "non sono sicuro", non un vuoto.
  return {
    testo: (out ? out + "\n\n" : "") + CAL_SOSTITUZIONE,
    contenuti: daTogliere.map((fr) => ({ frase: fr.testo.trim(), motivo: fr.motivo })),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// L'ELENCO DEGLI IMPEGNI LO COMPONE IL CODICE (22/08/2026, terzo giro)
// ══════════════════════════════════════════════════════════════════════════════
// Questo non e' il quinto filtro. E' il contrario di un filtro, ed e' il motivo per cui la serie
// dovrebbe finire qui.
// I quattro filtri hanno tutti la stessa forma: il modello scrive, il codice controlla e corregge.
// Ogni volta il filtro copre i casi visti e il caso dopo passa da una fessura diversa. Il quarto,
// costruito stamattina, toglie i contenuti di calendario quando NON c'e' stata una lettura. Ma
// quando la lettura c'e' — che e' la condizione normale da stamattina in poi — tace. E allora un
// evento inventato passa: e' il difetto delle 14:41, Giuseppo nominato, Petronio omesso.
// Il presupposto sotto tutti e quattro e' che il testo del modello sia la fonte degli impegni.
// Per gli impegni del Ghost quel presupposto e' falso. Il calendario e' un dato che il programma
// POSSIEDE, esatto, strutturato, appena letto da Google. Farlo passare da un modello linguistico
// che lo riformula a memoria non aggiunge niente: aggiunge solo la possibilita' di sbagliarlo.
// Quindi l'elenco lo scrive il codice, e il modello non lo scrive affatto.
// La proprieta' che ne segue e' di tipo diverso da quella di un filtro: non dipende da quali frasi
// il modello inventa. Non c'e' una fessura da cui possa passare un evento falso, perche' non e' il
// modello a scrivere l'elenco.
// Al modello resta cio' che sa fare e il codice non sa fare: la cornice, il collegamento con quello
// di cui si sta parlando, l'osservazione sensata.
function componiElencoImpegni(lettura) {
  if (!lettura || lettura.saltata || !lettura.ok) return null;
  const eventi = lettura.eventi || [];
  const periodo = lettura.etichetta ? ` (${lettura.etichetta})` : "";
  if (!eventi.length) return `Sul calendario non c'è niente${periodo}.`;
  const righe = eventi.map((e) => `· ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`);
  const testa = eventi.length === 1 ? `Sul calendario${periodo} c'è un impegno:` : `Sul calendario${periodo} ci sono ${eventi.length} impegni:`;
  return `${testa}\n${righe.join("\n")}`;
}
// Il vocabolario di cio' che la lettura contiene davvero: serve al filtro per distinguere una frase
// del modello che PARLA degli impegni letti da una che ne nomina uno che non esiste.
function vocabolarioDellaLettura(lettura) {
  const parole = new Set(), orari = new Set();
  for (const e of (lettura?.eventi || [])) {
    for (const p of senzaAccenti(e.titolo).split(/[^\p{L}\p{N}]+/u)) if (p.length >= 3) parole.add(p);
    const d = new Date(String(e.inizio || ""));
    if (!Number.isNaN(d.getTime())) {
      parole.add(senzaAccenti(GIORNI_IT[d.getDay()]));
      parole.add(senzaAccenti(MESI_IT[d.getMonth()]));
      parole.add(String(d.getDate()));
      if (!e.tuttoIlGiorno) {
        orari.add(`${d.getHours()}:${due(d.getMinutes())}`);
        orari.add(`${due(d.getHours())}:${due(d.getMinutes())}`);
        orari.add(String(d.getHours()));
      }
    }
  }
  return { parole, orari };
}
// Vero se la frase nomina un orario o un nome proprio che NON sta nella lettura. E' il criterio
// esteso che il quarto filtro usa quando una lettura c'e' stata: non "niente contenuti", ma
// "niente contenuti che non vengano dalla lettura".
function nominaQualcosaFuoriDallaLettura(frase, vocab) {
  // 23/08/2026 — IL `trim()` NON E' COSMETICO, E' LA CORREZIONE DI UN DIFETTO VERO.
  // Osservato sullo schermo del Ghost alle 03:41: la lettura era riuscita (HTTP 200, due eventi in
  // mano), e il filtro ha tolto la frase innocua "Ecco cosa ho trovato." scrivendo «"Ecco" non e'
  // in quello che ho letto». Il motivo: frasiDiUnTesto restituisce le frasi CON lo spazio che le
  // separa, quindi la frase arrivava qui come " Ecco cosa ho trovato." — e le due guardie che
  // dovevano proteggere la prima parola (`(?<!^)` e `(?<![.!?]\s)`) non scattavano piu', perche' la
  // "E" non era piu' in posizione 0 e prima dello spazio non c'era nessun punto. Cosi' la maiuscola
  // di inizio frase veniva scambiata per un nome proprio.
  // La regola sotto e' quella giusta e vale sempre: la maiuscola della PRIMA parola di una frase non
  // e' mai una prova che sia un nome proprio — lo e' solo una maiuscola in mezzo.
  const f = String(frase || "").trim();
  // Un orario che nella lettura non esiste.
  for (const m of f.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)) {
    if (!vocab.orari.has(`${Number(m[1])}:${m[2]}`)) return `l'orario ${m[1]}:${m[2]} non è in quello che ho letto`;
  }
  for (const m of f.matchAll(/(?<![\p{L}'’])alle\s+([01]?\d|2[0-3])(?![:.\d])/giu)) {
    if (!vocab.orari.has(String(Number(m[1])))) return `l'orario delle ${m[1]} non è in quello che ho letto`;
  }
  // Attenzione a un caso che sembra uguale e non lo e': una frase che afferma l'ASSENZA di qualcosa
  // nomina per forza un nome che nella lettura non c'e' — "non ho trovato nessun appuntamento con
  // Bartolomeo" — ed e' vera proprio per quello. Toglierla sarebbe togliere la risposta giusta, e
  // succedeva: sulla richiesta di cancellare qualcosa che non esiste, il programma cancellava la
  // frase corretta e ci scriveva sopra che la lettura non era avvenuta. Gli ORARI restano
  // controllati anche qui, perche' "non hai niente alle 16" parla comunque di un orario preciso.
  const affermaAssenza = /(?<![\p{L}'’])non\s+(?:ho\s+trovato|c'[eè]|ci\s+sono|risulta|risultano|hai|ne\s+hai|trovo|esiste)(?![\p{L}'’])/iu.test(f);
  if (affermaAssenza) return null;
  // Un nome proprio — parola con la maiuscola in mezzo alla frase — che nella lettura non esiste.
  for (const m of f.matchAll(/(?<![.!?]\s)(?<!^)(?<![\p{L}'’])(\p{Lu}[\p{Ll}'’]{2,})(?![\p{L}])/gu)) {
    const p = senzaAccenti(m[1]);
    if (paroleComuniMaiuscole().has(p)) continue;
    if (!vocab.parole.has(p)) return `"${m[1]}" non è in quello che ho letto`;
  }
  return null;
}
// Parole che capitano con la maiuscola senza essere nomi di eventi: mesi, giorni, l'inizio di una
// citazione. Senza questo elenco il filtro toglierebbe frasi corrette.
// Si costruisce alla PRIMA chiamata e non al caricamento del modulo: GIORNI_IT e MESI_IT sono
// dichiarati piu' sotto, e un `const` che li usa in cima esplode all'avvio dell'app. Non e' teoria:
// e' successo, e `node --check` non lo vede — l'ha trovato la prova eseguendo il modulo.
let PAROLE_COMUNI_MAIUSCOLE = null;
function paroleComuniMaiuscole() {
  if (!PAROLE_COMUNI_MAIUSCOLE) {
    PAROLE_COMUNI_MAIUSCOLE = new Set([
      ...GIORNI_IT.map(senzaAccenti), ...MESI_IT.map(senzaAccenti),
      "oggi", "domani", "dopodomani", "google", "calendario", "setup", "shell", "ghost", "non", "sul", "nel",
    ]);
  }
  return PAROLE_COMUNI_MAIUSCOLE;
}

// ══════════════════════════════════════════════════════════════════════════════
// NIENTE SURROGATI CHE NON ESISTONO (22/08/2026, ristretto il 24/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Su "cancella Petronio" lo Shell rispondeva: "non posso cancellare... posso solo aiutarti a creare
// un nuovo appuntamento o a SPOSTARE un evento esistente". La prima meta' era vera, la seconda no:
// spostare non lo sapeva fare, e questo filtro toglieva la frase.
// 24/08/2026 — spostare adesso e' un'azione vera (vedi sposta_evento_calendario). "Sto per
// spostarlo" e' diventata una frase VERA, e un filtro che la toglie sempre farebbe esattamente il
// difetto opposto: negherebbe una capacita' che esiste. Quel caso non ha piu' bisogno di questo
// filtro: lo gestisce lo stesso meccanismo generico che gia' regge crea/cancella — smentisciCapacitaSpenta
// se il modello si sbaglia sullo stato dell'interruttore, e il vincolo gemello (rilevaDomandaDiConferma)
// se promette un pulsante senza che una proposta sia nata davvero. Qui resta solo "modificare": il
// titolo o la descrizione di un evento esistente non si possono cambiare, e non e' cambiato oggi.
const OFFERTA_INESISTENTE_RE = new RegExp(
  "(" +
  `${CONF_S}(?:posso|potrei|riesco a|so)\\s+(?:solo\\s+)?(?:aiutarti\\s+a\\s+)?modificar\\w*` +
  `|${CONF_S}(?:lo|la)\\s+modifico${CONF_E}` +
  `|${CONF_S}(?:vuoi|se vuoi)\\s+(?:che\\s+)?(?:lo|la)?\\s*(?:modifichi|modifico)${CONF_E}` +
  `|${CONF_S}modificar\\w*\\s+(?:un|l')\\s*evento` +
  ")", "giu");
const OFFERTA_SOSTITUZIONE = "Modificare il titolo o la descrizione di un evento non lo so fare: quello che posso fare è cancellarlo e crearne uno nuovo, oppure spostarlo a un altro giorno o ora.";
// Si toglie la FRASE INTERA, non il pezzo di frase. La prima versione sostituiva in linea e lasciava
// relitti sgrammaticati ("Non [non posso spostare...] un evento"): una frase storta in chat e' un
// difetto quanto una frase falsa, perche' il Ghost non deve decifrare quello che legge.
function togliOfferteInesistenti(testo) {
  const originale = String(testo || "");
  if (!originale.trim()) return { testo: originale, offerte: [] };
  const frasi = frasiDiUnTesto(originale);
  const colpevoli = frasi.filter((fr) => OFFERTA_INESISTENTE_RE.test(fr.testo));
  OFFERTA_INESISTENTE_RE.lastIndex = 0;
  if (!colpevoli.length) return { testo: originale, offerte: [] };
  let out = originale;
  for (let i = colpevoli.length - 1; i >= 0; i--) out = out.slice(0, colpevoli[i].inizio) + out.slice(colpevoli[i].fine);
  out = ripulisciDetriti(out);
  return {
    testo: (out ? out + " " : "") + OFFERTA_SOSTITUZIONE,
    offerte: colpevoli.map((fr) => fr.testo.trim()),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// LA RICHIESTA CHE SOPRAVVIVE ALL'USCITA DALL'APP (29/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: "su Claude o Gemini lancio la domanda, vado a fare altro col telefono, e quando riapro
// trovo la risposta. Qui invece decade la chiamata". E' vero, ed e' strutturale: qui non c'e' nessun
// server che tenga in mano la richiesta: e' il browser, in quella scheda, a parlare con OpenRouter.
// Se Android sospende la scheda, la richiesta muore con "Failed to fetch" (nel registro ce ne sono
// gia' diversi). Il Wake Lock aggiunto il 25/08 tiene acceso lo SCHERMO, ma non fa niente se il
// Ghost cambia app di proposito.
// LA SOLUZIONE PIENA e' un relay lato server, ed e' il passo successivo gia' concordato. Questo e'
// il pezzo che si puo' avere SUBITO e senza infrastruttura: la richiesta viene messa da parte prima
// di partire, e se muore per la rete riparte DA SOLA quando il Ghost torna sull'app. Non e' "la
// trovi gia' pronta" — e' "non l'hai persa, e riparte senza che tu debba riscriverla".
// Il tetto di quindici minuti evita il caso peggiore: riaprire l'app il giorno dopo e vedere
// ripartire da sola una richiesta che il Ghost aveva ormai abbandonato (e pagarla).
const RICHIESTA_IN_SOSPESO_KEY = "richiesta-in-sospeso";
const FINESTRA_RIPRESA_MS = 15 * 60 * 1000;
function salvaRichiestaInSospeso(testo) { saveKey(RICHIESTA_IN_SOSPESO_KEY, { testo: String(testo || ""), quando: Date.now() }); }
function chiudiRichiestaInSospeso() { saveKey(RICHIESTA_IN_SOSPESO_KEY, null); }
function leggiRichiestaInSospeso(adesso = Date.now()) {
  const r = loadKey(RICHIESTA_IN_SOSPESO_KEY, null);
  if (!r || !r.testo || !Number.isFinite(r.quando)) return null;
  if (adesso - r.quando > FINESTRA_RIPRESA_MS) return null;
  return r;
}
// Solo un guasto di RETE merita la ripresa. Un errore vero (chiave sbagliata, modello che rifiuta)
// ripartirebbe all'infinito ogni volta che il Ghost riapre l'app, pagando ogni giro.
function eGuastoDiRete(messaggio) {
  return /failed to fetch|networkerror|network error|load failed|connessione|timeout|abort/i.test(String(messaggio || ""));
}
// La chiamata al modello. CORTA di proposito: quaranta piatti sono circa duemila token, un quarto
// di quello che lo faceva collassare, e soprattutto il modello non deve ricordare NIENTE mentre
// scrive — ogni piatto e' indipendente dagli altri. E' il contrario esatto del compito impossibile
// che gli si chiedeva prima.
// I CONTEGGI SONO DIVERSI PER CATEGORIA (7/8/9/6/10) e non e' un capriccio: e' cio' che fa si' che
// anche le combinazioni di giornata non si ripetano, non solo i singoli piatti (vedi montaPianoAlimentare).
// memoriaBio arriva ESPLICITAMENTE, mai da uno stato globale: e' il bug gia' pagato una volta —
// un piano generato senza vedere memory.bio, quindi senza le esclusioni che ci stavano dentro.
async function generaRepertorioPasti(richiesta, vincoliDichiarati, memoriaBio, settings, pushDebugLog = null) {
  const vincoli = (vincoliDichiarati || []).filter(Boolean);
  const bloccoVincoli = vincoli.length
    ? `\nVINCOLI GIA' DICHIARATI dal Ghost, che valgono sempre e non vanno mai contraddetti (se escludono un alimento, NON proporlo, nemmeno come alternativa): ${vincoli.join("; ")}
Un alimento escluso NON VA NEMMENO NOMINATO. Non scrivere piatti come "Pasta di ceci SKIP — pasta di ceci ESCLUSA, sostituita con: pasta di edamame": quel piatto va chiamato "Pasta di edamame al pomodoro" e basta. Il Ghost sa gia' cosa ha escluso, non serve raccontarglielo; e un nome che contiene l'alimento escluso fa scattare per sbaglio il controllo del piano. Proponi direttamente l'alternativa, col suo nome, come se l'esclusione non fosse mai esistita.`
    : "";
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro BIO. Devi produrre un REPERTORIO di piatti, NON un piano: non assegnare giorni, non fare tabelle, non calcolare medie — a montare i giorni ci pensa il programma.
Per ogni piatto: un nome breve, gli ingredienti con le grammature, e le calorie come NUMERO.
Quantità richieste, rispettale: 7 colazioni, 8 spuntini, 9 pranzi, 6 merende, 10 cene.
Fra i 9 pranzi, ALMENO 4 devono avere "portatile": true — mangiabili freddi in macchina o a studio, senza scaldare e senza posate complicate.
Varia le fonti proteiche e le verdure fra un piatto e l'altro: il programma li ruoterà, quindi più sono diversi fra loro meno il piano risulterà monotono.${bloccoVincoli}${memoriaProceduraleBlock(memoriaBio)}
Rispondi SOLO con JSON:
{"colazioni":[{"nome":"...","ingredienti":"... con grammature","kcal":000}],"spuntini":[...],"pranzi":[{"nome":"...","ingredienti":"...","kcal":000,"portatile":true}],"merende":[...],"cene":[...]}`,
    `Richiesta del Ghost, da cui ricavare gusti, esclusioni e stile dei piatti:\n${richiesta}`,
    0.8, 2500, settings, null,
    pushDebugLog ? (raw) => logAiCost(pushDebugLog, "repertorio_pasti", settings.model, raw) : null
  );
  return validaRepertorio(data);
}

// ══════════════════════════════════════════════════════════════════════════════
// LO STORICO NON DEVE POTER FARE DA CALENDARIO (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 22/08 alle 14:41 il modello ha pescato "Giuseppo domani alle 16" dalla conversazione del 20
// agosto e l'ha presentato come stato attuale del calendario. Nella diagnosi si vede perche':
// "Giuseppo" compare ZERO volte nel prompt di sistema e DUE volte nello storico — e lo storico sta
// dopo il prompt, cioe' piu' vicino al punto in cui il modello scrive.
// Quella frase era una PROPOSTA ("te lo metto in calendario per domani alle 16"), non un fatto. E
// una proposta di due giorni fa, riletta oggi, e' un impegno plausibile e scaduto.
// Costa poco marcarla, quindi si marca: quando lo storico viene ricostruito per il modello, i
// messaggi che contenevano una proposta di scrittura si portano dietro una riga che dice cos'erano
// e come sono finiti. Non e' la garanzia — la garanzia e' che l'elenco lo compone il codice — ma
// toglie l'esca invece di lasciarla li'.
function marcaPropostaNelloStorico(m) {
  const testo = String(m?.content || "");
  const p = m?.azioneProposta;
  if (!p || m.role !== "assistant") return testo;
  const scrive = p.azioneId === "crea_evento_calendario" || p.azioneId === "cancella_evento_calendario";
  if (!scrive) return testo;
  const esito = m.azioneRisolta ? "il Ghost ha poi toccato il pulsante" : "il Ghost NON l'ha mai confermata";
  return `${testo}\n[nota del programma, non detta dal Ghost: quella qui sopra era una PROPOSTA di scrivere sul calendario, e ${esito}. Non e' il calendario: per sapere cosa c'e' in agenda serve una lettura, e se una lettura c'e' stata la trovi nel blocco apposta.]`;
}

// Il modello a volte ricopia nel testo una riga che era un'istruzione per lui. E' successo con il
// blocco del calendario, che cominciava con una frase in maiuscolo: se l'e' ritrovata in risposta.
// Riscrivere il blocco aiuta, ma non e' una garanzia — questa lo e'.
const ECHI_DEL_PROMPT_RE = /^[ \t]*(?:dato interno[^\n]*|il calendario e['\u2019] stato letto davvero adesso[^\n]*|la lettura del calendario e['\u2019] fallita in questo turno[^\n]*|il calendario non e['\u2019] stato letto in questo turno[^\n]*|il ghost ha chiesto di cancellare un appuntamento[^\n]*)$/gim;
// E le didascalie che il modello si inventa per raccontare cosa sta facendo il programma:
// "[Il programma esegue la lettura del calendario e trova un impegno]". Non e' una risposta al
// Ghost, e' il modello che recita la parte del narratore. I marcatori scritti dal PROGRAMMA — quelli
// veri, "[tolto: ...]", "[non e' vero: ...]" — non nominano mai "il programma", quindi restano.
const DIDASCALIA_RE = /\[[^\]\n]*\bil programma\b[^\]\n]*\]/gi;
function togliEchiDelPrompt(testo) {
  const originale = String(testo || "");
  const trovati = [
    ...(originale.match(ECHI_DEL_PROMPT_RE) || []),
    ...(originale.match(DIDASCALIA_RE) || []),
  ].map((x) => x.trim());
  if (!trovati.length) return { testo: originale, echi: [] };
  return { testo: ripulisciDetriti(originale.replace(ECHI_DEL_PROMPT_RE, "").replace(DIDASCALIA_RE, "")), echi: trovati };
}

// ══════════════════════════════════════════════════════════════════════════════
// IL MODELLO CHE RACCONTA COME STA SCRIVENDO (28/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Stessa famiglia di DIDASCALIA_RE qui sopra — il modello che recita la parte del narratore — ma in
// una forma che quel filtro non vede: senza parentesi quadre, in prosa, in mezzo al contenuto vero.
//
// Il caso reale, misurato sulle schermate del Ghost (piano alimentare bisettimanale, 5 pasti):
// "Piccola pausa nella risposta per reset cognitivo tuo e mio", "Torna a tabella strutturata ora",
// "Fine colazione martedì settimana due. Ricomincio con spuntino ora", "Risposta prosegue con
// tabella standardizzata dal punto spuntino in poi evitando ripetizioni note tecniche fuori formato
// tabella". Insieme a lunghe divagazioni non richieste (una lezione sulla pastorizzazione delle
// uova, una sul budget alimentare, una sulla bilancia a impedenziometria) hanno mangiato tanto del
// tetto di 3000 token che il piano si e' interrotto a meta' della seconda settimana — la card
// "questa risposta e' tagliata a meta'" e' comparsa correttamente, ma il Ghost e' rimasto senza
// mezzo piano.
//
// PERCHE' QUI SI MISURA E NON SI TOGLIE, a differenza degli altri filtri di questo file.
// Gli altri tolgono frasi INTERE perche' la frase intera e' il difetto (un'offerta di una capacita'
// che non esiste, un'eco del prompt). Qui no: la meta-narrazione e' intrecciata DENTRO la stessa
// frase del contenuto vero — "Spuntino martedi' settimana due prosegue tabella: Cottage cheese
// spalmabile o classico [...] che in tabella segue comunque separatamente" e' una frase sola che
// contiene sia il rumore sia lo spuntino. Toglierla butterebbe via il contenuto; tenerla non
// recupera niente. E soprattutto: quando questo filtro gira, i token sono GIA' stati spesi e la
// risposta e' GIA' stata tagliata — nessuna pulizia a posteriori restituisce il budget.
// L'unico intervento che recupera davvero budget e' impedire che quel testo nasca, e quello sta nel
// prompt di sistema (vedi la REGOLA SUL NON RACCONTARE COME STAI SCRIVENDO). Questa funzione serve
// a sapere SE quella regola ha funzionato, invece di supporlo: stessa disciplina di
// tokensRagionamento, che e' stato aggiunto per misurare e non per correggere.
const META_NARRAZIONE_RE = new RegExp(
  "(" +
  "torn[ao]\\s+a(?:lla|l)?\\s+(?:tabella|schema|formato|elenco)" +
  "|riprend[oe]\\s+(?:la\\s+|il\\s+)?(?:tabella|schema|elenco)" +
  "|(?:la\\s+)?risposta\\s+(?:prosegue|continua|riprende|segue)" +
  "|prosegue\\s+(?:ora\\s+)?(?:come\\s+)?(?:da\\s+)?tabella" +
  "|da\\s+tabella\\s+segue" +
  "|in\\s+tabella\\s+segue" +
  "|fine\\s+nota\\s+tecnica" +
  "|reset\\s+cognitivo" +
  "|pausa\\s+nella\\s+risposta" +
  "|senza\\s+ulteriori\\s+divagazioni" +
  "|overhead\\s+cognitiv" +
  "|ricomincio\\s+(?:con|da|ora)" +
  ")", "giu");
// Restituisce i frammenti trovati (non le frasi: vedi sopra, la frase non e' l'unita' giusta qui).
// Array vuoto = nessuna meta-narrazione, cioe' la regola del prompt ha retto in questo turno.
function trovaMetaNarrazione(testo) {
  const t = String(testo || "");
  if (!t.trim()) return [];
  META_NARRAZIONE_RE.lastIndex = 0;
  return [...new Set((t.match(META_NARRAZIONE_RE) || []).map((x) => x.trim().toLowerCase()))];
}

// ── E il gemello del quarto filtro: quando la lettura FALLISCE, il fallimento si dichiara ──
// Il filtro qui sopra TOGLIE cio' che il modello non poteva sapere. Questo AGGIUNGE cio' che il
// modello avrebbe dovuto dire e a volte non dice.
// Misurato il 22/08 su sedici giri con la lettura fallita: 14 volte su 16 il modello ha dichiarato
// il guasto con il suo motivo tecnico, 2 volte ha risposto "Guardo cosa c'e' sul calendario per te"
// — cioe' al futuro, come se dovesse ancora andarci, mentre c'era gia' andato e aveva fallito.
// Non inventava impegni (0 su 16, ed e' la cosa che conta di piu'), ma lasciava il Ghost senza
// sapere che non c'era stata nessuna lettura. Due volte su sedici e' poco, e proprio per questo
// non vale la pena affidarlo a un'istruzione: e' un dato che il programma ha in mano.
const DICHIARA_FALLITA_RE = /(non\s+(?:sono\s+riuscit\w*|ci\s+sono\s+riuscit\w*|ho\s+potuto|riesco|ho\s+letto|l['’]ho\s+letto|ho\s+accesso|ho\s+guardato)|(?:e['’]|è)\s+fallit\w*|fallit\w*|non\s+ha\s+risposto|non\s+risponde|errore|\bspent\w*\b|\d{3}\b)/iu;
function dichiaraFallimentoLettura(testo, lettura) {
  const originale = String(testo || "");
  if (!lettura) return { testo: originale, aggiunta: null };
  const fallita = lettura.saltata === true || lettura.ok === false;
  if (!fallita) return { testo: originale, aggiunta: null };
  if (DICHIARA_FALLITA_RE.test(originale)) return { testo: originale, aggiunta: null };
  const motivo = lettura.motivo || "la richiesta al calendario non e' riuscita";
  const aggiunta = lettura.saltata
    ? `[non sono andato a guardare sul calendario: ${motivo}. Quindi non so cosa hai in programma.]`
    : `[la lettura del calendario non è riuscita: ${motivo}. Quindi non so cosa hai in programma, e non te lo dico a indovinare.]`;
  return { testo: (originale.trim() ? originale.trim() + "\n\n" : "") + aggiunta, aggiunta };
}

// Registro delle azioni COMPIUTE (§9): cosa proposto, cosa confermato, cosa eseguito, con orario.
// E' cio' che rende possibile capire DOPO perche' una cosa e' andata storta. Separato dal registro
// di debug perche' risponde a una domanda diversa e non deve essere spinto fuori dal suo tetto.
const REGISTRO_AZIONI_TETTO = 60;
function registraAzione(voce) {
  const n = [{ ...voce, quando: new Date().toISOString() }, ...loadKey("registro-azioni", [])].slice(0, REGISTRO_AZIONI_TETTO);
  saveKey("registro-azioni", n);
  return n;
}

//──────────────────────────────────────────────────────────
// APTICA — ritorno fisico immediato (GESTO B.1 / B.4, brief 15/08/2026)
//──────────────────────────────────────────────────────────
// navigator.vibrate funziona su Chrome Android e richiede un gesto dell'utente: va invocata
// SINCRONA dentro il gestore del tocco. Un setTimeout prima della chiamata rompe la catena del
// gesto e la vibrazione non parte, in silenzio — e' la stessa trappola gia' pagata con la voce.
// Per questo qui non c'e' nessuna attesa, nessuna promessa, nessun await: si chiama e basta.
//
// B.4 — tre firme distinte, non tre durate a caso. Devono essere riconoscibili al buio, quindi
// differiscono per NUMERO DI IMPULSI e ritmo, che si distinguono al tatto, non per durata di un
// singolo colpo, che non si distingue.
//   BIO   — un colpo pieno, singolo: il corpo, una cosa sola.
//   AIR   — due colpi rapidi: il passo doppio del fare.
//   VIDYA — tre colpi brevi in crescendo: la cosa che si articola.
const FIRME_APTICHE = {
  bio: [28],
  air: [16, 40, 16],
  vidya: [10, 30, 14, 30, 20],
  conferma: [14],
  errore: [40, 60, 40],
};
function vibra(firma) {
  try {
    const pattern = FIRME_APTICHE[firma] || FIRME_APTICHE.conferma;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate(pattern); // true se il dispositivo l'ha accettata
    }
  } catch { /* un dispositivo che non vibra non deve mai far fallire il gesto */ }
  return false;
}

//──────────────────────────────────────────────────────────
// POSTURA — lettura di stato locale, deterministica, zero rete (GESTO A.2 / C.2, brief 15/08/2026)
//──────────────────────────────────────────────────────────
// Risponde a "come sta Adam adesso" senza leggere una riga di testo e senza chiedere niente a
// nessuno: si calcola da dati gia' in localStorage, in una frazione di millisecondi, prima che
// qualunque rete parta. E' esplicitamente una LETTURA DI STATO, non un giudizio di rilevanza:
// niente qui decide se qualcosa "conta", si limita a misurare quanto e' passato e quanto c'e'.
// Per questo puo' usare soglie di giorni senza contraddire Bateson — non e' un innesco, e' un
// termometro. Il giudizio situato resta di Simbiosi, che gira altrove e con altri dati.
//
// Tre numeri per pilastro, tutti fra 0 e 1:
//  - freschezza: 1 se c'e' attivita' oggi, scende verso 0 col passare dei giorni dall'ultima voce
//  - densita': quanta memoria procedurale si e' accumulata su quel pilastro
//  - fermo: quanti percorsi sono in stallo (alza la tensione)
// La "tensione" complessiva e' quella che alimenta anche il ritmo del respiro (C.2).
const POSTURA_GIORNI_PIENI = 21; // oltre tre settimane senza una voce, la freschezza e' a zero
function calcolaPosturaPilastro(voci, percorsi, memoriaPilastro) {
  const g = daysSince(voci?.[0]?.date);
  const freschezza = g === null ? 0 : Math.max(0, 1 - g / POSTURA_GIORNI_PIENI);
  const frammenti = (memoriaPilastro?.sedimento || []).length;
  const haCorrente = (memoriaPilastro?.corrente || "").trim().length > 0;
  const densita = Math.min(1, (frammenti + (haCorrente ? 1 : 0)) / 8);
  const attivi = (percorsi || []).length;
  const fermi = stalledTitles(percorsi || []).length;
  const quotaFermi = attivi ? fermi / attivi : 0;
  // Tensione: sale quando il pilastro e' fermo da tanto o ha percorsi in stallo, scende quando
  // scorre. E' il numero che il respiro traduce in ritmo.
  const tensione = Math.min(1, Math.max(0, (1 - freschezza) * 0.7 + quotaFermi * 0.3));
  return {
    giorni: g, freschezza: Number(freschezza.toFixed(3)), densita: Number(densita.toFixed(3)),
    percorsiAttivi: attivi, percorsiFermi: fermi, tensione: Number(tensione.toFixed(3)),
  };
}
function calcolaPostura({ bio, air, vidya, pBio, pAir, pVidya, memory }) {
  const p = {
    bio: calcolaPosturaPilastro(bio, pBio, memory?.bio),
    air: calcolaPosturaPilastro(air, pAir, memory?.air),
    vidya: calcolaPosturaPilastro(vidya, pVidya, memory?.vidya),
  };
  const tensioni = [p.bio.tensione, p.air.tensione, p.vidya.tensione];
  const tensioneMedia = Number((tensioni.reduce((a, b) => a + b, 0) / 3).toFixed(3));
  // Durata di un ciclo di respiro: piu' teso = piu' corto e nervoso, piu' disteso = piu' lungo e
  // calmo. Da 3,2 s (tutto fermo) a 7,0 s (tutto in movimento). E' l'unico punto in cui un numero
  // dello stato reale diventa un tempo: senza questo aggancio il movimento sarebbe uno screensaver.
  const secondiRespiro = Number((7.0 - tensioneMedia * 3.8).toFixed(2));
  // Squilibrio: quanto i tre pilastri sono distanti fra loro. Non e' un voto, e' una distanza.
  const squilibrio = Number((Math.max(...tensioni) - Math.min(...tensioni)).toFixed(3));
  return { ...p, tensioneMedia, secondiRespiro, squilibrio };
}
// Ultimi scambi Shell in testo semplice, per il segnale linguistico diretto della cristallizzazione
// (Simbiosi mandato 4, punto d). Esclude system-note (rumore, non linguaggio del Ghost).
function recentShellText(shellChat, n = 10) {
  return (shellChat || []).slice(-n).filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Ghost" : "Shell"}: ${(m.content || "").slice(0, 300)}`).join("\n");
}

const DEFAULT_KERNEL = `STATO SISTEMA RESONANCE — V1
Ghost: Flavio (Can)
BIO — piano nutrizionale attivo (~1600 kcal/die), baseline peso 130kg → 124kg in discesa.
AIR — canale YouTube faceless in costruzione (nicchia biohacking/cognizione/AI, lingua EN).
VIDYA — collaborazione attiva con VillaMura (reggae/ska/folk).
Vincolo attivo: compartimentazione identità professionale (PhysioAlba) da asset AIR.
— Modifica e salva per generare una nuova versione (Legge 14, Versioning Atomico).`;

const DEFAULT_SETTINGS = {
  driveSyncEnabled: false,
  provider: "openrouter",
  apiKey: "",
  // 22/08/2026 — era "google/gemini-3.1-pro-preview" mentre il file di progetto dichiara Llama 3.3
  // 70B come modello di produzione. Uno scarto fra cio' che il progetto dice e cio' che il codice fa,
  // della stessa famiglia di `reversibile` e `costoStimato`: allineato al vero.
  // ATTENZIONE a cosa questa riga NON fa: updateSettings salva l'INTERO oggetto impostazioni, quindi
  // chiunque abbia gia' toccato una qualsiasi voce in Setup (anche solo per incollare la chiave) ha
  // gia' `model` scritto in localStorage, e resta dov'e'. Questo predefinito vale solo per chi apre
  // l'app per la prima volta. Chi c'e' gia' si sposta soltanto scegliendo il modello a mano.
  model: "meta-llama/llama-3.3-70b-instruct",
  voiceEnabled: true,
  armsDraftsEnabled: false,
  // calendarEnabled non esiste piu' (16/08/2026): governava il secondo braccio Calendar, ritirato.
  // Il valore resta a false per i profili gia' salvati che se lo portano dietro, cosi' nessun
  // vecchio salvataggio puo' riaccendere una strada che non c'e' piu'.
  calendarEnabled: false,
};

const MODEL_OPTIONS = [
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet (via OpenRouter)" },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
  { id: "custom", label: "Altro (slug personalizzato)" },
];

// Profilo del Ghost — prima era testo fisso (PILLAR_CTX), poi uno schema semplice (name/cognitiveNotes/
// bioConstraints/hasProfessionalConstraint/professionalIdentity), poi lo schema a 3 blocchi
// (hardConstraints/cognitiveStyle/freeform) allineato al questionario di Onboarding Fase 0 a 11 domande.
// FASE 1 (BRIEF_blocco1 12/08/2026, C.9/C.15): hardConstraints è ora un array dichiarativo uniforme
// [{id, testo, pilastro, dataDichiarazione}] — un vincolo = un'istanza rieditabile, non una categoria
// cablata (raw/bio/air/vidya/priority, formato precedente, ora prodotto solo da migrateHardConstraints
// per compatibilità con profili già salvati). hasProfessionalConstraint/professionalIdentity restano
// campi di comodo in cima al profilo — letti da Caspar/Accettore/Simbiosi come hard-stop esattamente
// come prima — ma ora DERIVATI dal record con tipo:"identita-professionale" (deriveProfessionalConstraint),
// non più duplicati a mano: G.1 è quel record, prima istanza dello schema, non un caso speciale nel codice.
// Il default replica ESATTAMENTE il profilo di Flavio: zero cambio di comportamento per lui.
// Un secondo Ghost (nuovo utente) parte dal questionario di onboarding, non da questo default.
const DEFAULT_GHOST_HARD_CONSTRAINTS = [
  { id: "g1", tipo: "identita-professionale", testo: "mai esporre l'identità professionale (PhysioAlba) con il pilastro AIR, in nessuna forma di output — vincolo reputazionale, non negoziabile", pilastro: "air", dataDichiarazione: null, identita: "fisioterapista, PhysioAlba" },
  { id: "bio-1", testo: "esclude zucchine e fagiolini", pilastro: "bio", dataDichiarazione: null },
  { id: "bio-2", testo: "quasi nessun pesce (eccetto tonno in scatola, salmone affumicato, molluschi e crostacei)", pilastro: "bio", dataDichiarazione: null },
  { id: "bio-3", testo: "target ~1600 kcal/die, 5 occasioni alimentari, colazioni/spuntini salati, alternative portatili lun/mer/ven", pilastro: "bio", dataDichiarazione: null },
];
const DEFAULT_GHOST_PROFILE = {
  name: "Flavio (Can)",
  hardConstraints: DEFAULT_GHOST_HARD_CONSTRAINTS,
  cognitiveStyle: {
    channel: "uditivo-cinestesico",
    density: "densa",
    dialectic: true,
    dialecticOverride: null, // per-sessione, mai persistente
    reasoningStyle: "saltellante", // emisfero destro dominante, elaborazione configurazionale non lineare
    // AGGIUNTO IL 20/08/2026 — la forma delle risposte vive QUI, nel profilo, non nel prompt comune.
    // Ragione architetturale, non stilistica: sul ramo `stable` c'e' un secondo Ghost con un profilo
    // cognitivo diverso, e una regola di stile scritta nel prompt di sistema condiviso lo vestirebbe
    // con la configurazione del primo — esattamente cio' che la Parte B della Costituzione esiste per
    // impedire. Un profilo che non ha questo campo non riceve nessuna riga in piu': il blocco sparisce.
    // Perche' proprio per questo Ghost: canale uditivo-cinestesico e pensiero configurazionale, gia'
    // dichiarati qui sopra. Un muro di testo su uno schermo di telefono, per lui, e' informazione che
    // non arriva.
    responseFormat: "Risposte molto BREVI. Attenzione: qui sopra il profilo dice 'densita\' densa' e 'linguaggio denso'. Denso NON vuol dire lungo — vuol dire ad alta densita' di informazione, cioe' CORTO E PIENO. Se ti trovi a scrivere un paragrafo dove basta una riga, stai facendo il contrario di quello che questo Ghost ha chiesto. Frasi corte, punti separati. Nessun preambolo, nessuna ripetizione di cio' che e' gia' stato detto, nessun esempio ridondante. La prima riga va dritta al punto. Grassetto solo sulle parole che portano informazione. TAGLIARE PAROLE, MAI CONTENUTO: se devi scegliere, di' la cosa vera in meno parole — mai dire meno cose. Un vincolo, un rischio o un'incertezza non si omettono mai per stare corti: una risposta breve che nasconde un limite e' peggio di una lunga. Risposte lunghe solo se il Ghost le chiede esplicitamente.",
    notes: "Profilo cognitivo emisfero-destro dominante, elaborazione configurazionale non lineare; canale uditivo-cinestesico prioritario e, come secondo canale, riferimenti culturali concreti come ponte verso intuizioni astratte — privilegia esercizi pratici/all'orecchio rispetto alla teoria scritta pura. Linguaggio denso ma sempre traducibile in azione concreta.",
  },
  freeform: {
    motivation: "Sistema di accelerazione evolutiva su tre dimensioni simultanee (BIO/AIR/VIDYA), non gestione/omeostasi — vedi Manifesto §0.",
    context: "",
    request: "",
  },
  ...deriveProfessionalConstraint(DEFAULT_GHOST_HARD_CONSTRAINTS),
};
// Traduce il profilo in contesto per pilastro. Il vincolo AIR resta hard-stop SOLO se il Ghost
// ne ha dichiarato uno in onboarding (hasProfessionalConstraint) — non tutti i Ghost ne avranno uno.
function buildPillarCtx(profile) {
  const cs = profile.cognitiveStyle || {};
  const cogText = [
    cs.notes, // testo libero opzionale, più ricco dei campi strutturati sotto — se presente, viene prima
    cs.channel && `Canale di elaborazione preferito: ${cs.channel}.`,
    cs.density && `Densità di risposta preferita: ${cs.density}.`,
    cs.reasoningStyle && `Stile di ragionamento: ${cs.reasoningStyle}.`,
  ].filter(Boolean).join(" ");
  const bioList = (Array.isArray(profile.hardConstraints) ? profile.hardConstraints : [])
    .filter((c) => c?.pilastro === "bio").map((c) => c.testo);
  const air = profile.hasProfessionalConstraint
    ? `Vincolo assoluto, hard-stop non negoziabile: nessuna strategia deve esporre l'identità professionale del Ghost (${profile.professionalIdentity}) né richiedere dilatazione del suo tempo lineare di lavoro. È l'unico punto del sistema dove la lettura non è negoziabile — tutto il resto resta revisionabile.`
    : `Nessun vincolo di compartimentazione professionale dichiarato per questo Ghost. Resta comunque valido il principio generale: non richiedere dilatazione insostenibile del suo tempo lineare di lavoro.`;
  // Punto di forza dichiarato in onboarding (freeform.strength): unica risorsa positiva esplicita nel
  // profilo, a differenza di hardConstraints (vincoli/cautele).
  const strengthNote = profile.freeform?.strength ? ` Punto di forza dichiarato dal Ghost, da tenere presente come risorsa su cui costruire (non solo colmare lacune): ${profile.freeform.strength}.` : "";
  // Resto del blocco freeform (motivation/context/request): testo libero raccolto in onboarding.
  const motivationNote = profile.freeform?.motivation ? ` Motivazione dichiarata dal Ghost per l'uso di Resonance: ${profile.freeform.motivation}.` : "";
  const contextNote = profile.freeform?.context ? ` Contesto aggiuntivo dichiarato dal Ghost su di sé: ${profile.freeform.context}.` : "";
  const requestNote = profile.freeform?.request ? ` Richiesta prioritaria dichiarata dal Ghost (l'unica cosa che vorrebbe da Resonance): ${profile.freeform.request}.` : "";
  // FASE 3 (BRIEF_blocco1 12/08/2026, C.10) — fino a qui il blocco freeform andava SOLO in bio/vidya:
  // nessuno dei quattro campi è filtrato, quindi ciascuno può nominare l'identità professionale del
  // Ghost (anche "punto di forza" o "richiesta" — es. "sono fisioterapista da 16 anni" ci starebbe
  // benissimo in entrambi), e il contesto air restava escluso a monte come filtro preventivo — causa
  // strutturale per cui freeform risultava inerte per AIR (Architettura Evolutiva V1 §2.4): l'Agente
  // AIR/Balthasar/Melchior non vedevano MAI la motivazione/contesto/richiesta reali del Ghost.
  // Rimossa: il vincolo G.1 resta protetto SOLO dal check agganciato alla soglia di irreversibilità
  // (runSeedGateCheck, subito prima che executeSeedContract invochi un effettore reale — l'unico punto
  // dove un Seme tocca il mondo esterno) — non da un filtro preventivo separato qui. Verificato con 2
  // chiamate reali (freeform vicino al confine identitario, non esplicito): il gate intercetta
  // correttamente prima di ogni esecuzione — vedi REPORT_BLOCCO1 per il dettaglio.
  const freeformNotes = strengthNote + motivationNote + contextNote + requestNote;
  // La forma delle risposte esce come voce SEPARATA, non dentro il contesto di un pilastro: vale per
  // tutto cio' che lo Shell scrive, non solo per VIDYA. Se il profilo non ha il campo, e' stringa
  // vuota e nel prompt non compare niente.
  const formatoNote = cs.responseFormat
    ? `FORMA DELLE RISPOSTE, richiesta da QUESTO Ghost e derivata dal suo profilo cognitivo (non e' una regola generale del sistema): ${cs.responseFormat}`
    : "";
  return {
    formato: formatoNote,
    vidya: cogText + freeformNotes,
    bio: bioList.join("; ") + " Ogni lettura BIO è una stance interpretativa rivedibile dal Ghost, mai un verdetto medico oggettivo." + freeformNotes,
    air: air + freeformNotes,
  };
}
let CURRENT_GHOST_PROFILE = DEFAULT_GHOST_PROFILE;
let PILLAR_CTX = buildPillarCtx(DEFAULT_GHOST_PROFILE);
// Normalizza SEMPRE (migrazione hardConstraints + derivazione hasProfessionalConstraint/professionalIdentity)
// prima di rendere il profilo "corrente": unico punto d'ingresso per CURRENT_GHOST_PROFILE, così nessun
// chiamante può mai impostare un profilo con lo schema vecchio o con i due campi hard-stop scaduti.
function setGhostProfile(profile) {
  CURRENT_GHOST_PROFILE = normalizeGhostProfile(profile);
  PILLAR_CTX = buildPillarCtx(CURRENT_GHOST_PROFILE);
}

// Funzione pura (nessuna dipendenza da stato globale/DOM — testabile in isolamento). Primo strato di
// difesa del vincolo AIR/PhysioAlba per la feature Seme (Manifesto §6.1): il contenuto di un Seme è
// testo libero non filtrato (canale conversazionale o pulsante manuale), quindi può nominare l'identità
// professionale del Ghost prima ancora che un qualunque prompt lo legga. Secondo strato: Caspar-del-Seme
// verifica comunque il testo ORIGINALE (vedi runSeedResearch).
// CORREZIONE 26/07/2026: il vincolo reale (§6.1) è l'esposizione dell'IDENTITÀ RICONOSCIBILE (il Ghost
// stesso, il brand/studio "PhysioAlba"), non un divieto sulla fisioterapia come dominio/materia — un
// Seme su "biomeccanica per runner" o "prevenzione infortuni" è AIR legittimo e non va MAI toccato. La
// prima versione trattava ogni token di professionalIdentity (incluso "fisioterapista", un termine di
// dominio puro) come parola-chiave da redigere sempre: troppo aggressivo. Ora:
//  1) marcatori di BRAND/NOME (es. "PhysioAlba", il nome del Ghost) — sempre redatti ovunque appaiano,
//     a prescindere dal contesto: distinti dai termini di dominio con un segnale minimo (maiuscola
//     interna, es. "PhysioAlba" — le parole comuni di dominio come "fisioterapista" sono tutte minuscole
//     e restano fuori da questo elenco). Non modifica/cura profile.professionalIdentity, che resta
//     invariato per gli altri usi già esistenti (PILLAR_CTX, runAccettore, computeResonance, Magi).
//  2) espressioni possessive/identificative dirette ("il mio studio", "i miei pazienti", "la mia
//     clinica", "il mio lavoro da/come/di <dominio>", "dove lavoro") — è la COMBINAZIONE possessivo+
//     pratica professionale reale a esporre l'identità, non la singola parola di dominio isolata.
function redactProfessionalIdentity(text, profile) {
  if (!text || !profile?.hasProfessionalConstraint) return text;
  let out = text;
  const nameTokens = (profile.name || "").replace(/\([^)]*\)/g, "").split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const brandTokens = (profile.professionalIdentity || "").split(/[,;]/).map((t) => t.trim()).filter(Boolean)
    .filter((t) => /[a-z][A-Z]/.test(t)); // solo token con maiuscola interna (marcatore di brand/nome proprio) — mai un termine di dominio tutto minuscolo
  for (const term of [...new Set([...brandTokens, ...nameTokens])]) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[identità professionale omessa]");
  }
  out = out.replace(/\bmi(?:o|a|ei|e)\b\s+(studio|ambulatorio|clinica|centro|professione|pazient[ei]|lavoro\s+(?:da|di|come)\s+\S+)\b/gi, "[identità professionale omessa]");
  out = out.replace(/\bdove\s+lavoro\b/gi, "[identità professionale omessa]");
  return out;
}

//──────────────────────────────────────────────────────────
// STORAGE (locale, sul dispositivo)
//──────────────────────────────────────────────────────────
function loadKey(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function saveKey(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
// FASE 1.1 (BRIEF_fase1_memoria_sedimento 27/07/2026) — migrazione retrocompatibile obbligatoria:
// la memoria procedurale era una stringa unica per pilastro, ora è { corrente, sedimento: [{id,date,text}] }.
// Converte il formato vecchio senza perdere nulla (necessario anche per Marta, che ha dati propri già
// salvati nel formato vecchio) — idempotente: un valore già nel formato nuovo passa invariato.
function migratePillarMemory(value) {
  if (typeof value === "string") return { corrente: value, sedimento: [] };
  if (value && typeof value === "object" && typeof value.corrente === "string" && Array.isArray(value.sedimento)) return value;
  return { corrente: "", sedimento: [] };
}
function migrateMemoryShape(raw) {
  return { bio: migratePillarMemory(raw?.bio), air: migratePillarMemory(raw?.air), vidya: migratePillarMemory(raw?.vidya) };
}

// FASE 1 (BRIEF_blocco1 12/08/2026, C.9/C.15) — hardConstraints passa da un oggetto per-pilastro
// cablato (raw/bio/air/vidya/priority) a uno schema dichiarativo uniforme, un vincolo = un'istanza
// rieditabile: [{id, testo, pilastro, dataDichiarazione}]. Migrazione retrocompatibile obbligatoria
// (stesso pattern di migratePillarMemory): un profilo salvato nel formato vecchio va convertito senza
// perdita — nessuna voce esistente (di Flavio o di un futuro secondo Ghost come Marta) sparisce.
// Idempotente: un valore già nel formato nuovo passa invariato.
function migrateHardConstraints(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const out = [];
  const push = (testo, pilastro) => { if (testo && String(testo).trim()) out.push({ id: uid(), testo: String(testo).trim(), pilastro, dataDichiarazione: null }); };
  (raw.bio?.general || []).forEach((t) => push(t, "bio"));
  (raw.bio?.medical || []).forEach((t) => push(`terapia/farmaco in corso: ${t}`, "bio"));
  (raw.air || []).forEach((t) => push(t, "air"));
  (raw.vidya || []).forEach((t) => push(t, "vidya"));
  if (raw.priority) push(raw.priority, null); // trasversale, non assegnabile a un solo pilastro
  return out;
}
// G.1 (identità professionale vs AIR) è l'UNICO vincolo davvero hard-stop del sistema (vedi commento
// storico su DEFAULT_GHOST_PROFILE) — troppo critico per restare solo testo libero in hardConstraints:
// il record che lo rappresenta porta un marcatore esplicito (tipo:"identita-professionale") e un campo
// dedicato (identita) da cui i due campi di comodo hasProfessionalConstraint/professionalIdentity
// vengono DERIVATI, non più scritti a mano in due posti paralleli. Le ~8 funzioni che leggono questi
// due campi (buildPillarCtx, redactProfessionalIdentity, Caspar-del-Seme, gate del Seme, Simbiosi)
// restano INVARIATE: continuano a leggerli in cima al profilo esattamente come prima — zero rischio di
// regressione sull'unico vincolo non negoziabile, che resta l'oggetto di massima cautela di questo file.
function deriveProfessionalConstraint(hardConstraints) {
  const g1 = (hardConstraints || []).find((c) => c?.tipo === "identita-professionale");
  return { hasProfessionalConstraint: !!g1, professionalIdentity: g1?.identita || "" };
}
// Punto unico di normalizzazione di un ghostProfile, in lettura (mai in scrittura silenziosa): applica
// la migrazione dello schema hardConstraints e ri-deriva hasProfessionalConstraint/professionalIdentity
// da esso. Va chiamata su OGNI ghostProfile prima che raggiunga buildPillarCtx o venga letto da una
// funzione di enforcement — mai assumere che un profilo caricato da localStorage/Drive sia già nel
// formato nuovo (utenti esistenti hanno dati salvati nel formato vecchio).
function normalizeGhostProfile(profile) {
  if (!profile) return profile;
  const hardConstraints = migrateHardConstraints(profile.hardConstraints);
  return { ...profile, hardConstraints, ...deriveProfessionalConstraint(hardConstraints) };
}

// FIX 20/07/2026 (Opzione 3 — compattazione automatica): la chat Shell non ha limite di lunghezza per
// il Ghost (è "sempre la stessa"), ma il payload localStorage/Drive-sync cresceva senza tetto. Il tetto
// di 20 messaggi verso il modello (vedi ShellView.send) già impedisce che il COSTO in token cresca
// all'infinito — questo qui è un problema diverso: la DIMENSIONE dell'array salvato/sincronizzato.
// Legge 14 (versioning atomico, mai sovrascrittura distruttiva): i messaggi rimossi dalla vista attiva
// NON vengono mai cancellati, solo archiviati in una chiave locale separata e sostituiti da un
// system-note visibile che rende esplicito cosa è successo — nessuna sparizione silenziosa.
const SHELL_CHAT_COMPACT_TRIGGER = 40; // sopra questa soglia scatta la compattazione
const SHELL_CHAT_KEEP_RECENT = 24;     // messaggi recenti sempre tenuti per intero, in chiaro
function compactShellChatIfNeeded(shellChat) {
  if (!Array.isArray(shellChat) || shellChat.length <= SHELL_CHAT_COMPACT_TRIGGER) return null;
  const overflow = shellChat.slice(0, shellChat.length - SHELL_CHAT_KEEP_RECENT);
  const kept = shellChat.slice(shellChat.length - SHELL_CHAT_KEEP_RECENT);
  if (!overflow.length) return null;
  const archiveKey = `shell-chat-archive-${todayISO()}-${uid()}`;
  saveKey(archiveKey, overflow); // archiviato, non distrutto — recuperabile da localStorage con questa chiave
  const marker = {
    id: uid(), role: "system-note", time: new Date().toISOString(),
    content: `— ${overflow.length} messaggi più vecchi compattati e archiviati localmente il ${fmtDate(new Date())} (chiave: ${archiveKey}). La memoria procedurale dei pilastri resta intatta e non dipende da questi messaggi grezzi; nulla è andato perso, solo alleggerito dalla vista attiva. —`,
  };
  return [marker, ...kept];
}

//──────────────────────────────────────────────────────────
// BACKUP E RIPRISTINO DEI DATI (COMPITO A.4, brief 14/08/2026)
//──────────────────────────────────────────────────────────
// Il codice è già protetto da git; i DATI no. Prima di questo blocco l'unico export
// esistente era quello del log di debug (Setup) — utile per diagnosi, inutile come backup:
// non contiene log dei pilastri, percorsi, memoria procedurale, kernel, profilo.
// Qui si esporta TUTTO lo stato locale in un unico file, e — punto che distingue un backup
// da un souvenir — lo si sa anche RILEGGERE: restoreFullBackup è l'inverso esatto di
// buildFullBackup, e i due sono verificati insieme (vedi test round-trip in REPORT).
const BACKUP_FORMAT_VERSION = 1;
// Elenco esplicito, non derivato: enumerare localStorage a runtime prenderebbe anche chiavi
// di altri siti sullo stesso dominio e chiavi future non previste da questo formato. Le
// chiavi di archivio della chat (shell-chat-archive-*, generate dinamicamente da
// compactShellChatIfNeeded) sono l'unica eccezione e vengono raccolte per prefisso.
const BACKUP_KEYS = [
  "bio-data", "air-data", "vidya-data",
  "percorsi-bio", "percorsi-air", "percorsi-vidya",
  "magi-data", "semi-data", "shell-chat", "shell-memory", "shell-style-memory",
  "kernel-data", "simbiosi-data", "simbiosi-eval-signature", "ghost-profile",
  "app-settings", "debug-log", "json-parse-failures", "sync-last-modified",
];
const BACKUP_ARCHIVE_PREFIX = "shell-chat-archive-";
function buildFullBackup() {
  const dati = {};
  for (const k of BACKUP_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) dati[k] = v; // stringa grezza: nessun re-parse, nessuna perdita di forma
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(BACKUP_ARCHIVE_PREFIX)) dati[k] = localStorage.getItem(k);
  }
  // La chiave API viene DELIBERATAMENTE esclusa: un file di backup gira per email, Drive e
  // chat, e una chiave dentro un file che gira è una chiave bruciata. Costa 10 secondi
  // rimetterla dopo un ripristino, e il file resta condivisibile senza pensieri.
  let apiKeyOmessa = false;
  if (dati["app-settings"]) {
    try {
      const s = JSON.parse(dati["app-settings"]);
      if (s && s.apiKey) { apiKeyOmessa = true; s.apiKey = ""; dati["app-settings"] = JSON.stringify(s); }
    } catch { /* impostazioni illeggibili: si esportano come sono, senza bloccare il backup */ }
  }
  // Stessa forma del file su Drive (SYNC_DEFAULTS), così il backup è confrontabile a occhio
  // con resonance-sync-state.json senza doverlo tradurre.
  const j = (k, fb) => { try { return dati[k] ? JSON.parse(dati[k]) : fb; } catch { return fb; } };
  const syncState = {
    bio: j("bio-data", []), air: j("air-data", []), vidya: j("vidya-data", []),
    pBio: j("percorsi-bio", []), pAir: j("percorsi-air", []), pVidya: j("percorsi-vidya", []),
    magi: j("magi-data", []), semi: j("semi-data", []), shellChat: j("shell-chat", []),
    memory: migrateMemoryShape(j("shell-memory", null)), styleMemory: j("shell-style-memory", ""),
    kernel: j("kernel-data", { content: DEFAULT_KERNEL, version: 1, history: [] }),
    resonance: j("simbiosi-data", { text: "", time: null }),
    ghostProfile: normalizeGhostProfile(j("ghost-profile", null)),
    lastModified: j("sync-last-modified", 0),
  };
  return {
    _formato: "resonance-backup", _versione: BACKUP_FORMAT_VERSION,
    _creato: new Date().toISOString(), _appBuild: APP_BUILD,
    _apiKeyOmessa: apiKeyOmessa,
    _chiavi: Object.keys(dati).length,
    syncState, dati,
  };
}
// Ripristino. Non fa merge e non prova a essere furbo: riporta le chiavi esattamente com'erano.
// Un merge qui produrrebbe uno stato che non è né quello di prima né quello di adesso — proprio
// la situazione da cui un ripristino dovrebbe tirare fuori.
function restoreFullBackup(backup) {
  if (!backup || backup._formato !== "resonance-backup") {
    return { ok: false, errore: "Questo file non è un backup di Resonance (manca il marcatore di formato)." };
  }
  if (Number(backup._versione) > BACKUP_FORMAT_VERSION) {
    return { ok: false, errore: `Il backup è in formato ${backup._versione}, questa versione dell'app legge fino al ${BACKUP_FORMAT_VERSION}. Aggiorna l'app prima di ripristinare.` };
  }
  const dati = backup.dati || {};
  const chiavi = Object.keys(dati);
  if (!chiavi.length) return { ok: false, errore: "Il backup non contiene nessun dato." };
  let scritte = 0;
  const fallite = [];
  for (const k of chiavi) {
    try { localStorage.setItem(k, dati[k]); scritte++; } catch (e) { fallite.push(k); }
  }
  return { ok: fallite.length === 0, scritte, fallite, apiKeyOmessa: !!backup._apiKeyOmessa, creato: backup._creato || null };
}

//──────────────────────────────────────────────────────────
// AI ENGINES
//──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
// NESSUNA CHIAMATA PUO' RESTARE APPESA PER SEMPRE (23/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Fino a oggi in tutta l'app non esisteva UN SOLO timeout: zero AbortController, zero limiti.
// Conseguenza, riprodotta: se la connessione si pianta a meta' di una richiesta — cosa normale su
// rete mobile — la promessa non si risolve mai. Il turno non finisce mai, i tre puntini restano a
// schermo per sempre, e la guardia in cima a send() butta via in silenzio ogni messaggio successivo.
// Non serve nemmeno un guasto raro: bastava che il telefono cambiasse cella.
// Il tetto e' generoso di proposito. Una generazione da 3000 token su Llama 3.3 70B puo' prendersi
// piu' di un minuto in modo del tutto legittimo, e tagliarla sarebbe peggio del male: il tetto serve
// a distinguere "lento" da "morto", non a mettere fretta al modello.
const TIMEOUT_MODELLO_MS = 150000; // due minuti e mezzo
async function fetchConTetto(url, opzioni, tetto = TIMEOUT_MODELLO_MS) {
  // AbortSignal.timeout non c'e' su tutti i browser in cui gira questa PWA: il controller esplicito
  // funziona ovunque, e il clearTimeout evita di lasciare un timer vivo a ogni chiamata riuscita.
  const controller = new AbortController();
  const tagliaOra = setTimeout(() => controller.abort(), tetto);
  try {
    return await fetch(url, { ...opzioni, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`La risposta non è arrivata entro ${Math.round(tetto / 1000)} secondi. Non è un errore tuo: la richiesta è rimasta appesa e l'ho interrotta invece di lasciarti aspettare per sempre. Riprova.`);
    throw e;
  } finally { clearTimeout(tagliaOra); }
}
function buildOpenRouterContent(text, image) {
  if (!image) return text;
  return [{ type: "text", text }, { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } }];
}
function buildClaudeContent(text, image) {
  if (!image) return text;
  return [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } }, { type: "text", text }];
}
async function askClaudeDirect(system, userText, temperature, maxTokens, apiKey, image) {
  const res = await fetchConTetto("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature: Math.min(temperature, 1), system, messages: [{ role: "user", content: buildClaudeContent(userText, image) }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore Claude API");
  const t = (data.content || []).find((b) => b.type === "text");
  return t ? t.text.trim() : "";
}
// onRaw (opzionale, retrocompatibile — i 4 chiamanti esistenti non lo passano e non cambiano
// comportamento): riceve la risposta JSON grezza PRIMA dell'estrazione del solo testo, per chi ha
// bisogno di ispezionare metadati oltre al content (es. citazioni/annotazioni di una web search
// forzata — vedi runSeedResearch/PUNTO 1 BRIEF_correzioni_post_test 26/07/2026).
async function askOpenRouter(system, userText, temperature, maxTokens, apiKey, model, useWebSearch, image, onRaw, penalties = null) {
  const body = {
    model, max_tokens: maxTokens, temperature,
    messages: [{ role: "system", content: system }, { role: "user", content: buildOpenRouterContent(userText, image) }],
    // 29/08/2026 — DIMOSTRATO DAL REGISTRO, non piu' sospettato: `reasoning.max_tokens` su questo
    // fornitore NON LIMITA NIENTE, e qui ha fatto fallire il repertorio dei pasti al primo colpo.
    // La riga incriminata: functionTag "repertorio_pasti", tokensOut 2500, tokensRagionamento **2500**.
    // Tutto il budget speso a pensare, zero token di contenuto, JSON vuoto, repertorio inutilizzabile.
    // Il confronto nello stesso registro chiude il caso:
    //   · qui (max_tokens:300)  → 2500, e prima 795 / 515 / 318 su selezione_azione: SEMPRE oltre il tetto
    //   · askModelWithHistory (enabled:false, dal 25/08) → 0, su ogni singola chiamata
    // Il dubbio era gia' scritto nel commento del 25/08 ("puo' darsi che risponda solo a enabled"), e
    // li' era stato risolto solo per la chiamata conversazionale. Qui restava il vecchio tetto finto:
    // non un tetto piu' permissivo, proprio un parametro ignorato. Nessuna di queste chiamate
    // (JSON, Magi, Semi, repertorio) ha bisogno di ragionamento interno: producono struttura, non
    // deliberazione — e una risposta vuota e' comunque il peggiore degli esiti possibili.
    reasoning: { enabled: false },
  };
  // FIX 20/07/2026: prima il tool era dichiarato ma il modello poteva ignorarlo ("auto") — con prompt
  // densi (es. Shell con Manifesto+memoria pilastri) il riflesso "non ho accesso al web" prevaleva
  // anche col tool disponibile. tool_choice:"required" costringe la chiamata a usarlo, non a deciderlo.
  // FIX 27/07/2026 (BRIEF_fix_parametri_websearch): il tool era dichiarato NUDO — nessun parametro —
  // quindi ereditava il tetto di default del provider (max_tool_calls=30 a livello di richiesta),
  // causa radice confermata della cascata "30 ricerche invece di 1" osservata in produzione (~$0,09-
  // 0,24/turno, ~960k-999k prompt_tokens). Verificato sulla documentazione ufficiale OpenRouter
  // (docs/guides/features/server-tools/web-search, 27/07/2026): max_tool_calls è un parametro di
  // RICHIESTA (livello body, accanto a model/messages/tools), NON un parametro annidato nel tool —
  // per questo il fix precedente (tool dichiarato senza alcun parametro) non lo toccava mai. Esiste
  // anche un `max_uses` annidato in parameters, ma la stessa documentazione dichiara che viene
  // "forwarded only to Anthropic (as max_uses); other native search providers ignore it" — inutile
  // per Llama 3.3 70B (produzione attuale), quindi scartato: userebbe il nome giusto sulla carta ma
  // non avrebbe alcun effetto reale sul modello che usiamo.
  // Valori scelti (nessuna configurabilità utente richiesta dal brief):
  // - max_tool_calls: 3 — tetto di richiesta condiviso da tutto il budget server-tool. L'uso reale è
  //   una domanda puntuale (Shell on-demand, Agente AIR, ricerca Seme), non esplorazione multi-query:
  //   3 lascia margine per una ricerca iniziale + 1-2 raffinamenti senza riaprire la cascata (10x
  //   sotto il vecchio comportamento anche nel caso peggiore, tipicamente 1 sola ricerca eseguita).
  //   La doc conferma che al raggiungimento del tetto il modello viene comunque invitato a produrre
  //   la risposta finale con quanto raccolto finora (non un errore secco) — mitiga il rischio "non
  //   riesce mai a concludere" con tool_choice:"required" citato nel brief, ma NON verificato dal vivo
  //   in questa sessione (nessuna chiave OpenRouter disponibile — vedi riepilogo di consegna).
  // - max_results: 5 (default documentato, reso esplicito) e max_total_results: 10 — contengono il
  //   volume cumulativo di risultati per richiesta, indipendentemente da quante ricerche vengono fatte.
  // - search_context_size: "low" — riduce il contenuto testuale recuperato per ciascun risultato:
  //   è la leva più diretta sui prompt_tokens (960k-999k osservati con 30 ricerche non ha senso
  //   spiegarlo solo col numero di ricerche, il contenuto per risultato pesa quanto il conteggio).
  if (useWebSearch) {
    body.tools = [{ type: "openrouter:web_search", parameters: { max_results: 5, max_total_results: 10, search_context_size: "low" } }];
    body.tool_choice = "required";
    body.max_tool_calls = 3;
  }
  // TASK A (SPRINT_HARDENING 26/07/2026 sera): penalità anti-loop opzionali, applicate SOLO dai
  // chiamanti plain-text ad alta temperatura (mai da askModelJSON — vedi ANTI_LOOP_PENALTIES sotto).
  if (penalties) {
    body.repetition_penalty = penalties.repetition_penalty ?? 1.15;
    body.frequency_penalty = penalties.frequency_penalty ?? 0.4;
  }
  const res = await fetchConTetto("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  if (onRaw) { try { onRaw(data); } catch { /* diagnostica best-effort: non deve mai far fallire la chiamata */ } }
  return (data.choices?.[0]?.message?.content || "").trim();
}
// onRaw: stesso hook opzionale/retrocompatibile di askOpenRouter (vedi sopra) — propagato qui SOLO
// per il ramo OpenRouter (TASK 1 BRIEF_costtracking 26/07/2026 è scoped esplicitamente a "ogni
// chiamata OpenRouter", non a Claude-direct). Nessun chiamante esistente lo passa: zero cambio di
// comportamento per chi non ne ha bisogno.
async function askModel(system, userText, temperature, maxTokens, settings, useWebSearch = false, image = null, onRaw = null, penalties = null) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") return askClaudeDirect(system, userText, temperature, maxTokens, settings.apiKey, image);
  return askOpenRouter(system, userText, temperature, maxTokens, settings.apiKey, settings.model, useWebSearch, image, onRaw, penalties);
}
async function askModelWithHistory(system, messages, temperature, maxTokens, settings, image = null, useWebSearch = false, onRaw = null, penalties = null) {
  if (!settings.apiKey) throw new Error("Nessuna chiave API impostata (vai in Setup).");
  if (settings.provider === "claude-direct") {
    const last = messages[messages.length - 1];
    return askClaudeDirect(system, last?.content || "", temperature, maxTokens, settings.apiKey, image);
  }
  // L'immagine si allega SOLO all'ultimo messaggio (turno corrente), mai alla storia passata
  const msgs = messages.map((m, i) => (i === messages.length - 1 && image ? { role: m.role, content: buildOpenRouterContent(m.content, image) } : m));
  // 25/08/2026 (notte) — MISURATO, NON PIU' UN'IPOTESI: il tetto numerico di poche righe sopra
  // (60 token, prima 300) non frenava NIENTE. Log reale del Ghost dopo quel cambiamento: turno
  // "Sicuro che non sei in grado di creare un percorso da qui?" — tokensOut 975, di cui
  // tokensRagionamento **889**. Il modello ha ragionato per 889 token nonostante un tetto di 60:
  // reasoning.max_tokens evidentemente non e' il parametro che questo modello/fornitore rispetta
  // per limitare il pensiero interno (puo' darsi che Kimi K2.6 su OpenRouter risponda solo a
  // "enabled"/"effort", non a un budget in token — nessun modo di saperlo con certezza da qui).
  // Si prova quindi a SPEGNERLO del tutto invece di provare a contenerlo con un numero che si e'
  // dimostrato ignorato: questa e' una chiamata puramente conversazionale ("parla, non pianifica"),
  // non ha mai avuto bisogno di un ragionamento interno per rispondere bene.
  // RISCHIO ACCETTATO, NON ELIMINATO: se "enabled:false" non fosse rispettato allo stesso modo di
  // "max_tokens", il comportamento resterebbe quello di oggi (ne' meglio ne' peggio) — la rete di
  // sicurezza contro la risposta vuota (askWithDegenerateGuard, gia' in vigore) resta invariata in
  // ogni caso. Verificabile SOLO dal prossimo log reale: se tokensRagionamento scende vicino a zero,
  // ha funzionato; se resta alto, il parametro giusto e' un altro e va cercato ancora.
  const body = { model: settings.model, max_tokens: maxTokens, temperature, reasoning: { enabled: false }, messages: [{ role: "system", content: system }, ...msgs] };
  // FIX 27/07/2026 (BRIEF_fix_parametri_websearch): stessi parametri e stessa motivazione di askOpenRouter
  // sopra (choke-point gemello) — vedi commento esteso lì per il ragionamento su max_tool_calls/max_uses.
  if (useWebSearch) {
    body.tools = [{ type: "openrouter:web_search", parameters: { max_results: 5, max_total_results: 10, search_context_size: "low" } }];
    body.tool_choice = "required";
    body.max_tool_calls = 3;
  } // solo OpenRouter — Claude-direct esce già sopra
  // TASK A (SPRINT_HARDENING 26/07/2026 sera): stesse penalità anti-loop opzionali di askOpenRouter.
  if (penalties) {
    body.repetition_penalty = penalties.repetition_penalty ?? 1.15;
    body.frequency_penalty = penalties.frequency_penalty ?? 0.4;
  }
  const res = await fetchConTetto("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore OpenRouter");
  if (onRaw) { try { onRaw(data); } catch { /* diagnostica best-effort: non deve mai far fallire il turno */ } }
  return (data.choices?.[0]?.message?.content || "").trim();
}
// Estrae il primo blocco {...} bilanciato da una stringa, tollerando testo prima/dopo
// (preamboli tipo "Ecco la valutazione:" che alcuni modelli aggiungono nonostante l'istruzione
// di rispondere solo JSON). Consapevole di stringhe interne — non si fa ingannare da graffe
// dentro un valore stringa — e di escape (\"). Ritorna null se il blocco non si richiude mai
// (risposta troncata), senza mai lanciare eccezioni.
function extractJsonBlock(raw) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return null;
}
// Rimuove virgole finali prima di } o ] — errore comune in modelli meno rigorosi sull'output
// strutturato (es. {"a":1,"b":2,}), invalido per JSON.parse standard. Non tocca virgole dentro
// i valori stringa (es. "elenco: a, b, c,") perché opera solo sulla sequenza ",spazi}" o ",spazi]".
function stripTrailingCommas(s) { return s.replace(/,(\s*[}\]])/g, "$1"); }
// Causa reale confermata (15/07/2026) dietro i fallimenti sistematici di Llama: il modello scrive
// prosa multi-paragrafo con newline letterali DENTRO il valore di una stringa JSON, invece di
// escaparli come \n — invalido per lo standard JSON (JSON.parse rifiuta caratteri di controllo
// non escaped in una stringa). Sostituisce newline/tab/CR/altri caratteri di controllo con la loro
// forma escaped, ma SOLO quando ci si trova dentro le virgolette — non tocca whitespace strutturale.
function sanitizeJsonControlChars(s) {
  let out = "", inString = false, escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { out += ch; escape = false; continue; }
    if (ch === "\\") { out += ch; escape = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString) {
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { continue; } // parte di CRLF o CR isolato: scartato, \n (se presente) copre l'a-capo
      if (ch === "\t") { out += "\\t"; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += "\\u" + code.toString(16).padStart(4, "0"); continue; }
    }
    out += ch;
  }
  return out;
}
function logJsonFailure(raw, settings) {
  try {
    const prev = loadKey("json-parse-failures", []);
    const entry = { time: new Date().toISOString(), model: settings?.model || settings?.provider || "?", raw: (raw || "").slice(0, 600) };
    saveKey("json-parse-failures", [entry, ...prev].slice(0, 10));
  } catch { /* diagnostica best-effort: non deve mai far fallire il turno */ }
}
async function askModelJSON(system, userText, temperature, maxTokens, settings, image = null, onRaw = null) {
  const raw = await askModel(system + "\n\nRispondi SOLO con JSON valido, nessun testo prima o dopo, nessun blocco markdown.", userText, temperature, maxTokens, settings, false, image, onRaw);
  if (!raw) return null;
  const cleaned = stripTrailingCommas(sanitizeJsonControlChars(raw.replace(/```json|```/g, "").trim()));
  try { return JSON.parse(cleaned); } catch { /* prova il fallback sotto */ }
  // Fallback: alcuni motori (Llama, Kimi, DeepSeek) aggiungono preamboli/chiusure nonostante
  // l'istruzione — estrae il blocco JSON bilanciato ignorando il testo intorno.
  const block = extractJsonBlock(raw);
  if (block) {
    try { return JSON.parse(stripTrailingCommas(sanitizeJsonControlChars(block))); } catch { /* prova comunque a loggare sotto */ }
  }
  // Entrambi i tentativi falliti: salva la risposta grezza per diagnosi (visibile in Setup),
  // invece di continuare a indovinare fix senza aver mai visto un caso reale fallire.
  logJsonFailure(raw, settings);
  return null;
}

//──────────────────────────────────────────────────────────
// TRACCIAMENTO COSTI/TOKEN (TASK 1, BRIEF_costtracking_balthasarsources 26/07/2026)
//──────────────────────────────────────────────────────────
// NON verificato empiricamente con una chiamata reale in questa sessione (nessuna chiave OpenRouter
// disponibile in questo ambiente sandboxed) — parsing costruito sullo schema OpenAI-compatibile
// standard che OpenRouter documenta (usage.prompt_tokens/completion_tokens/total_tokens), più un
// tentativo opportunistico su usage.cost (presente SOLO se l'account ha l'"usage accounting"
// abilitato — non garantito, non verificato qui). Se costUsd risulta sempre null nell'uso reale, è
// il segnale che quel campo non arriva davvero: NON va MAI stimato da un prezzario hardcoded
// (richiesta esplicita del brief — un costo inventato che si spaccia per reale sarebbe peggio di
// nessun dato). Resta un gap dichiarato per la Fase 2 di questo lavoro, da chiudere con una chiave
// vera alla prima occasione utile — vedi riepilogo di consegna.
// 25/08/2026 (notte) — GIA' OSSERVATO E MAI REGISTRATO. Sul turno "sous vide" tokensOut era 1998
// ma la risposta mostrata era lunga ~70-80 token: quasi 1900 token generati (e pagati) senza mai
// arrivare sullo schermo — la spiegazione piu' plausibile per un minuto di attesa su una domanda
// che non tocca ne' selezione ne' calendario. Fino a ieri non c'era modo di saperlo DA QUESTO log:
// ogni voce ai-cost portava solo input/output totali, mai quanto di quell'output fosse ragionamento
// interno invece di testo mostrato. Aggiunto qui, non altrove, perche' extractUsageForLog e' l'UNICO
// punto che tutte le chiamate (shell, selezione, Magi, Semi...) attraversano per finire nel log:
// aggiungerlo qui vale per tutte, non solo per quella di oggi.
function extractUsageForLog(raw) {
  const u = raw?.usage || {};
  const tokensIn = typeof u.prompt_tokens === "number" ? u.prompt_tokens : null;
  const tokensOut = typeof u.completion_tokens === "number" ? u.completion_tokens : null;
  const tokensTotal = typeof u.total_tokens === "number" ? u.total_tokens : (tokensIn !== null && tokensOut !== null ? tokensIn + tokensOut : null);
  const costUsd = typeof u.cost === "number" ? u.cost : null; // mai stimato — solo se OpenRouter lo fornisce davvero
  const tokensRagionamento = typeof u.completion_tokens_details?.reasoning_tokens === "number" ? u.completion_tokens_details.reasoning_tokens : null;
  return { tokensIn, tokensOut, tokensTotal, costUsd, tokensRagionamento };
}
// PUNTO 2 (BRIEF_fix_parametri_websearch 27/07/2026) — rete di sicurezza indipendente dalla causa
// specifica risolta al PUNTO 1: rilevatori A POSTERIORI (la chiamata è già stata pagata quando questi
// flag vengono letti), non blocchi preventivi. Servono a rendere visibile SUBITO un'eventuale
// regressione futura (es. un altro tool server-side dichiarato senza tetti) invece di scoprirla dopo
// una settimana come accaduto con la cascata delle 30 ricerche.
// Soglie proposte (nessun dato reale disponibile per calibrarle empiricamente in questa sessione):
// - 50.000 prompt_tokens: una singola ricerca web puntuale (fetchWebSearchSnapshot, max 5 risultati,
//   contesto "low") dovrebbe restare a poche migliaia di token; 50k è abbastanza alto da non scattare
//   su un uso legittimo anche con più raffinamenti (max_tool_calls:3), ma resta due ordini di grandezza
//   sotto i 960k-999k osservati nella cascata — un margine ampio ma non permissivo.
// - $0,05 di costo per singola chiamata: la cascata da 30 ricerche costava $0,09-0,24; una chiamata
//   legittima con 1-3 ricerche a $0,005 l'una resta ben sotto i 2 centesimi. $0,05 lascia margine
//   senza avvicinarsi al costo osservato del bug.
const PROMPT_TOKEN_CEILING = 50000;
const COST_CEILING_USD = 0.05;
// functionTag: SOLO i tag fissi previsti dal brief ("shell","balthasar","melchior","caspar",
// "airAgent","webSearchSnapshot","seme_ricerca","seme_esecuzione") — scelta di scope esplicita del
// brief (Shell, Magi/Balthasar/Melchior/Caspar, Seme, Agente AIR, ricerca web on-demand), non ogni
// singola chiamata askModel/askModelJSON dell'app (quiz, percorsi, resonance, ecc. restano fuori).
function logAiCost(pushDebugLog, functionTag, model, raw) {
  if (!pushDebugLog) return;
  const usage = extractUsageForLog(raw);
  const promptTokenCeilingExceeded = usage.tokensIn !== null && usage.tokensIn > PROMPT_TOKEN_CEILING;
  const costCeilingExceeded = usage.costUsd !== null && usage.costUsd > COST_CEILING_USD;
  if (promptTokenCeilingExceeded || costCeilingExceeded) {
    // Visibile anche fuori dal pannello Setup (console), non solo nel rolling debug log.
    console.warn(`[Resonance] Allarme costo/token AI su "${functionTag}"`, { promptTokenCeilingExceeded, costCeilingExceeded, ...usage });
  }
  pushDebugLog({ type: "ai-cost", functionTag, model, ...usage, promptTokenCeilingExceeded, costCeilingExceeded, error: null });
}

//──────────────────────────────────────────────────────────
// TASK A (SPRINT_HARDENING 26/07/2026 sera) — freno anti-loop degenerativo lato richiesta
//──────────────────────────────────────────────────────────
// Bug reale osservato: Balthasar-del-Seme ha generato output degenerato ("of 10 of 20 of 12..." per
// centinaia di token). Causa probabile: temperatura medio-alta (Balthasar lavora apposta a 0.95-1.35
// in Magi, voluto per il suo ruolo di perturbatore — NON abbassata) senza alcun freno anti-ripetizione,
// combinazione nota per produrre loop su modelli economici (Llama 3.3 70B, produzione attuale).
// Valori verificati sulla documentazione OpenRouter attuale (26/07/2026, non a memoria):
// repetition_penalty range (0,2] default 1.0; frequency_penalty range [-2,2] default 0. La stessa
// documentazione avverte che un valore TROPPO alto rende l'output incoerente — 1.15/0.4 sono
// deliberatamente moderati: sopra il default ma lontani dal limite superiore.
// SCOPE — solo chiamate a temperatura >= 0.6 con output in LINGUAGGIO NATURALE puro: MAI su chiamate
// che generano JSON (askModelJSON — Melchior/Caspar-del-Seme, letture multi-lente, quiz, ecc.), perché
// repetition_penalty/frequency_penalty penalizzano anche la ripetizione STRUTTURALE necessaria di
// virgolette/parentesi/chiavi in un array JSON multi-elemento e possono corromperlo. Magi Caspar (0.2)
// e le altre chiamate a bassa temperatura restano fuori: rischio di loop trascurabile, verificato ma
// non applicato (richiesta esplicita del brief di verificare comunque).
// FIX 27/07/2026 (BRIEF_batchtest_seme): la cascata web_search (30 ricerche/turno, causa radice
// risolta e verificata dal vivo il 27/07 mattina) è ora il sospetto principale per il gibberish
// osservato dopo l'introduzione di queste penalità (cirillico, "FIiationException", "getYi") — non le
// penalità in sé, che potrebbero curare un sintomo della cascata invece che un problema reale del
// modello. Abbassati qui SOLO i due valori (non rimossi: si isola l'effetto dell'abbassamento, non si
// introduce una seconda variabile), per verificare con un test reale (FASE 2/3 del brief) se il loop
// degenerativo si ripresenta ora che la cascata è chiusa.
const ANTI_LOOP_PENALTIES = { repetition_penalty: 1.05, frequency_penalty: 0.1 };

//──────────────────────────────────────────────────────────
// TASK B (SPRINT_HARDENING 26/07/2026 sera) — freno di sicurezza automatico anti-degenerazione
//──────────────────────────────────────────────────────────
// Indipendente dalla causa esatta (Task A potrebbe non coprire ogni caso futuro, es. con un altro
// modello): rileva un output chiaramente degenerato SENZA alcuna chiamata AI aggiuntiva, e se accade
// riprova UNA sola volta la stessa richiesta (mai un ciclo infinito) prima di arrendersi onestamente.
// Soglia scelta e motivata: 8 ripetizioni dello STESSO token in una finestra di 40 parole consecutive.
// Una lista puntata o una prosa densa in italiano/inglese ripete al più connettivi comuni ("di", "e",
// "il") poche volte per 40 parole (verificato a mano su testi legittimi del progetto: mai oltre 3-4
// occorrenze) — 8 è un margine ampio sopra quel rumore naturale e ben sotto le centinaia di ripetizioni
// del bug reale osservato ("of 10 of 20 of 12..."). Non configurabile ora (richiesta esplicita del brief).
// ══════════════════════════════════════════════════════════════════════════════
// 23/08/2026 — LA SOGLIA DI 8 ERA LA CAUSA DEL BLOCCO TOTALE DELL'APP.
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha chiesto un piano alimentare di 14 giorni CON LE DOSI. Un piano con le dosi contiene
// per forza righe come "40 g di pane, 10 g di olio, 120 g di pollo, 80 g di riso": la parola "di"
// compare 9 volte in 40 parole. Nove e' sopra otto, quindi il programma ha dichiarato degenerata
// una risposta perfettamente buona, l'ha buttata, ne ha rigenerata un'altra identica per forma —
// altri 3000 token, un altro minuto abbondante — e alla seconda si e' arreso con un errore.
// Per tutto quel tempo i tre puntini restavano a schermo e OGNI messaggio che il Ghost scriveva
// veniva buttato via senza dirglielo (vedi la guardia in cima a send). Da fuori: l'app si e'
// bloccata. Ha dovuto chiuderla a forza.
// La verifica originale ("mai oltre 3-4 occorrenze") era stata fatta su PROSA. Un elenco strutturato
// — un piano alimentare, una scheda di allenamento, una lista della spesa — ripete le preposizioni
// e le unita' di misura per costruzione, non per difetto. La soglia stava esattamente sopra il
// rumore della prosa e sotto quello di un elenco: cioe' nel punto peggiore possibile.
//
// I DUE CRITERI NUOVI, misurati sui casi veri di entrambi i tipi:
//   · il bug vero per cui questo rilevatore e' nato ("of 10 of 20 of 12...") ha "of" 20 volte su 40,
//     cioe' meta' del testo e' un token solo; la variante a parola singola ne ha 40 su 40.
//   · il piano alimentare con le dosi si ferma a 8 su 40, la scheda di allenamento a 7, la prosa a 3.
// Fra 8 e 20 c'e' spazio per una soglia che non tocca nessun testo legittimo: 16 su 40, cioe' il 40%
// della finestra occupato da una parola sola. Il piano sta a meta' di quella soglia.
// Il secondo criterio prende il caso che il primo potrebbe mancare — una risposta che gira su
// pochissime parole senza che nessuna sfondi il 40%: se in 40 parole ce ne sono al massimo 8 diverse,
// non e' un testo. I testi legittimi misurati stanno fra 19 e 33 parole diverse su 40.
const DEGENERATE_OUTPUT_WINDOW = 40;
const DEGENERATE_OUTPUT_THRESHOLD = 16;      // era 8: tagliava i piani alimentari con le dosi
const DEGENERATE_MIN_VOCABOLARIO = 8;        // parole diverse minime in una finestra perche' sia un testo
// 29/08/2026 — LA TERZA VOLTA CHE QUESTA GUARDIA TAGLIA UN PIANO ALIMENTARE, e stavolta la causa
// non e' la soglia: e' la conta delle parole. RIPRODOTTO prima di toccare il codice, su una tabella
// markdown a sei colonne come quelle che lo Shell scrive davvero:
//   · tabella con celle spaziose  → "|" 11 volte su 40 (passa, ma e' gia' il doppio di ogni parola vera)
//   · tabella compatta con le kcal → "|" 14 su 40 (passa per due)
//   · tabella con la riga separatrice scritta spaziata ("| :--- | :--- |") → "|" **21 su 40**: SCATTA.
// Il difetto e' che `|` non era nella punteggiatura da togliere ([.,!?;:"'()«»]), quindi ogni
// separatore di colonna veniva contato come una parola ripetuta. Una tabella e' ripetitiva per
// costruzione nella sua STRUTTURA, non nel suo contenuto: contare i separatori come vocabolario
// misura la formattazione e la chiama degenerazione. Ed e' un difetto a scatto variabile — il
// modello a volte scrive la separatrice attaccata ("|:---|:---|", un solo token) e a volte spaziata:
// la stessa richiesta passava ieri e falliva stanotte senza che niente fosse cambiato nel piano.
// Il 28/08 il Ghost e' rimasto senza niente, dopo aver pagato due chiamate ($0,028 in tutto).
//
// LA CORREZIONE NON INDEBOLISCE LA GUARDIA, verificato sul caso per cui e' nata: "of 10 of 20 of
// 12..." ha "of" 20 volte su 40 e continua a scattare, perche' li' non c'e' nessun markdown. Si
// toglie la formattazione, non le parole.
const RIGA_SEPARATRICE_TABELLA_RE = /^[ \t]*\|?[\s:|-]*-[\s:|-]*\|?[ \t]*$/gm;
function senzaFormattazioneMarkdown(testo) {
  return String(testo || "")
    .replace(RIGA_SEPARATRICE_TABELLA_RE, " ")  // la riga "|:---|:---|" non e' testo, e' una cornice
    .replace(/\|/g, " ")                        // i separatori di colonna: struttura, non vocabolario
    .replace(/[*#`_>]/g, " ");                  // grassetti, titoli, citazioni: decorazione
}
// Restituisce null se il testo e' sano, oppure la PROVA di cosa non va. Prima questa funzione
// diceva solo si'/no, e il registro annotava che era successo senza dire cosa: esattamente il buco
// gia' chiuso una volta per la risposta vuota ("l'unica cosa registrata era il fatto che fosse
// successo"). Senza la prova, ogni diagnosi resta un'ipotesi — ed e' costato due notti.
function diagnosiDegenerazione(text) {
  if (!text) return null;
  const words = senzaFormattazioneMarkdown(text).trim().toLowerCase()
    .split(/\s+/).map((w) => w.replace(/[.,!?;:"'()«»]/g, "")).filter(Boolean);
  if (words.length < DEGENERATE_OUTPUT_WINDOW) return null; // troppo corto per giudicare: evita falsi positivi su risposte brevi legittime
  for (let i = 0; i + DEGENERATE_OUTPUT_WINDOW <= words.length; i += 10) {
    const counts = {};
    for (const w of words.slice(i, i + DEGENERATE_OUTPUT_WINDOW)) counts[w] = (counts[w] || 0) + 1;
    const coppie = Object.entries(counts);
    const [parolaPiuFrequente, massimo] = coppie.reduce((a, b) => (b[1] > a[1] ? b : a));
    const diverse = coppie.length;
    if (massimo >= DEGENERATE_OUTPUT_THRESHOLD) {
      return { criterio: "ripetizione", parola: parolaPiuFrequente, occorrenze: massimo, soglia: DEGENERATE_OUTPUT_THRESHOLD, diverse, finestra: i, campione: words.slice(i, i + DEGENERATE_OUTPUT_WINDOW).join(" ").slice(0, 200) };
    }
    if (diverse <= DEGENERATE_MIN_VOCABOLARIO) {
      return { criterio: "vocabolario-povero", diverse, soglia: DEGENERATE_MIN_VOCABOLARIO, finestra: i, campione: words.slice(i, i + DEGENERATE_OUTPUT_WINDOW).join(" ").slice(0, 200) };
    }
  }
  return null;
}
function isDegenerateOutput(text) { return diagnosiDegenerazione(text) !== null; }
// `call` è una funzione zero-argomenti che rifà la richiesta originale (closure sul chiamante) — nessuna
// duplicazione della costruzione del prompt qui. Se degenerato anche al secondo tentativo, lancia un
// errore onesto (i chiamanti esistenti lo mostrano già via i loro cicli try/catch — nessuna UI nuova).
// 23/08/2026 — UNA RISPOSTA VUOTA È UNA NON-RISPOSTA, ED È L'UNICA CHE QUESTA GUARDIA LASCIAVA
// PASSARE. isDegenerateOutput comincia con `if (!text) return false`: una stringa vuota non e'
// degenerata, quindi la guardia la restituiva al chiamante come se fosse un'ottima risposta, e il
// Ghost si ritrovava la nota "non e' arrivato niente" senza che nessuno avesse riprovato.
// E' esattamente la stessa famiglia per cui questa guardia esiste — il modello che non risponde —
// solo nella forma piu' estrema. Quindi ora vale la stessa cura: si ritenta UNA volta.
// Misurato sulla rete vera con il messaggio vero del Ghost: lo stesso identico turno, ripetuto
// cinque volte, ha prodotto risposte da 3470, 541, 3316, 3401 e 1099 caratteri. La variabilita' e'
// enorme, e questo e' proprio il caso in cui un ritentativo cambia l'esito.
function rispostaNonArrivata(testo) { return !String(testo || "").trim(); }
async function askWithDegenerateGuard(call, functionTag, pushDebugLog = null) {
  const first = await call();
  if (rispostaNonArrivata(first)) {
    pushDebugLog?.({ type: "risposta-vuota-ritentata", functionTag, attempt: 1, error: null });
    const ritenta = await call();
    if (!rispostaNonArrivata(ritenta) && !isDegenerateOutput(ritenta)) return ritenta;
    if (rispostaNonArrivata(ritenta)) {
      pushDebugLog?.({ type: "risposta-vuota-anche-al-secondo-tentativo", functionTag, attempt: 2, error: "il modello ha chiuso due volte senza scrivere" });
      return ""; // il chiamante lo dice al Ghost: qui non si inventa un testo che non c'e'
    }
    return ritenta;
  }
  const diagnosiPrima = diagnosiDegenerazione(first);
  if (!diagnosiPrima) return first;
  pushDebugLog?.({ type: "degenerate-output", functionTag, attempt: 1, degenerateOutputDetected: true, ...diagnosiPrima, error: null });
  const second = await call();
  if (rispostaNonArrivata(second)) { pushDebugLog?.({ type: "risposta-vuota-dopo-degenerata", functionTag, attempt: 2, error: null }); return ""; }
  const diagnosiSeconda = diagnosiDegenerazione(second);
  if (!diagnosiSeconda) return second;
  // 29/08/2026 — NON SI BUTTA PIU' VIA UNA RISPOSTA PAGATA SULLA PAROLA DI UN'EURISTICA.
  // Fin qui questa riga lanciava un errore: il Ghost vedeva "Risposta non valida, riprova piu'
  // tardi", perdeva tutto e aveva pagato due chiamate. Il 28/08 e' successo su un piano alimentare
  // che con ogni probabilita' era buono — la guardia contava i separatori "|" della tabella come
  // parole ripetute (difetto corretto qui sopra). Il confronto fra i due errori possibili non e'
  // alla pari: se la risposta e' davvero degenerata il Ghost se ne accorge da solo in un secondo e
  // rimanda; se e' buona e la buttiamo, il lavoro e' perso e la spesa pure. Quindi si consegna, e
  // il sospetto resta scritto nel registro con la sua prova — dichiarato, non nascosto.
  pushDebugLog?.({ type: "degenerate-output", functionTag, attempt: 2, degenerateOutputDetected: true, ...diagnosiSeconda, consegnataUgualmente: true, error: "sospetta degenerazione anche al secondo tentativo: consegnata comunque, il giudizio resta al Ghost" });
  return second;
}

//──────────────────────────────────────────────────────────
// TRIADE MAGI — pipeline sequenziale fissa (Legge 15 abrogata: non è un dibattito iterativo)
//──────────────────────────────────────────────────────────
// opts: { memory, targetPillar, intensity } — Magi non è più cieco (Manifesto V3 §4.1/§4.4).
// Balthasar vede l'intera memoria procedurale (accoppiamento interpretativo largo, §6.2);
// l'intensità modula la sua temperatura (rischio dosato, §4.4); Caspar riceve il pilastro-bersaglio
// per verificare il contenimento operativo (accoppiamento operativo stretto, §4.4).
const MAGI_INTENSITY = { leggera: 0.95, media: 1.15, profonda: 1.35 };
// ── 31/08/2026 — IL COMMENTO QUI SOPRA DICEVA UNA COSA E IL CODICE NE FACEVA UN'ALTRA ───────────
// "Balthasar vede l'intera memoria procedurale (accoppiamento interpretativo largo, §6.2)": scritto
// nel commento della Triade, e falso. Il codice passava SOLO `corrente` dei tre pilastri — 900
// caratteri a testa, riscritti da capo a ogni turno. Il sedimento, che e' la storia vera e datata,
// non lo ha mai visto. E il suo stesso prompt gli chiede "una perturbazione radicata nella storia
// reale del sistema, non generica": con novecento caratteri dell'ultima riscrittura, la storia reale
// non c'era, quindi generica era l'unica cosa che potesse essere.
// E' la stessa famiglia di difetto che questo file ha gia' corretto due volte (richiedeGate che
// diceva false mentre la card c'era, azioneIrreversibile senza chiamanti): una dichiarazione che non
// produce piu' l'effetto che il suo commento descrive.
//
// I TETTI SONO ESPLICITI, come chiede C.16 del brief sui Serbatoi: nessun parametro implicito.
// Quattro frammenti per pilastro e 220 caratteri l'uno — non otto e non interi. Il conto: 3 x 4 x 220
// = circa 2.600 caratteri, ~800 token, davanti a una chiamata che ne produce 1600. Prendere tutto il
// sedimento (30 frammenti da 900 caratteri per pilastro) sarebbero ~20.000 token per una risposta di
// settanta parole: il costo mangerebbe la feature.
const MAGI_FRAMMENTI_PER_PILASTRO = 4;
const MAGI_TETTO_FRAMMENTO = 220;
function memoriaEstesaPerMagi(memory) {
  if (!memory) return "";
  const perPilastro = (pil) => {
    const m = memory[pil];
    const corrente = m?.corrente || "nessuna nota";
    const frag = (m?.sedimento || []).slice(-MAGI_FRAMMENTI_PER_PILASTRO);
    if (!frag.length) return `${pil.toUpperCase()}: ${corrente}`;
    const storia = frag
      .map((f) => `[${fmtDate(f.date)}] ${String(f.text || "").slice(0, MAGI_TETTO_FRAMMENTO)}${String(f.text || "").length > MAGI_TETTO_FRAMMENTO ? "…" : ""}`)
      .join(" · ");
    return `${pil.toUpperCase()}: ${corrente}\n  ${pil.toUpperCase()} — come si e' riorganizzato prima (dal piu' vecchio al piu' recente): ${storia}`;
  };
  return `\n\nMemoria procedurale accumulata sui pilastri — nota corrente e storia datata di come il sistema si e' riorganizzato finora. Leggila per generare una perturbazione radicata in questa storia reale, non generica: se una direzione e' gia' stata attraversata e riattraversata, spingere di nuovo li' e' l'unica cosa che non serve a niente.\n${["bio", "air", "vidya"].map(perPilastro).join("\n")}`;
}
async function runTriadeMagi(question, onStage, settings, opts = {}, pushDebugLog = null) {
  const { memory = null, targetPillar = null, intensity = "media" } = opts;
  const baseCtx = `${nowContext()} Contesto: sei parte del sistema "Resonance", framework di sviluppo personale del Ghost (Flavio), tre pilastri: BIO (salute), AIR (autonomia economica), VIDYA (crescita creativa/cognitiva). Sei l'unico polo di perturbazione deliberata del sistema — gli altri meccanismi mantengono, tu spingi oltre la cristallizzazione. Rispondi in italiano, diretto, max 70 parole, senza premesse.`;
  const memoriaCtx = memoriaEstesaPerMagi(memory);
  const targetCtx = targetPillar ? `\n\nQuesta perturbazione è MIRATA al pilastro ${targetPillar.toUpperCase()}.` : "";
  // Intensità: modula la temperatura di Balthasar. Su Claude-direct il tetto resta 1.0 (già gestito da askModel).
  const balthasarTemp = settings.provider === "openrouter" ? (MAGI_INTENSITY[intensity] || 1.15) : Math.min(MAGI_INTENSITY[intensity] || 1.0, 1.0);
  onStage("balthasar", null);
  // Ancoraggio reale (Manifesto V3 §4.5, mem #23): senza ricerca, Balthasar rimescola solo concetti
  // già noti al Ghost e suona come "eco". Web search solo su OpenRouter (Claude-direct non supporta
  // questo tool nel client attuale) — degrada silenziosamente a perturbazione da sola immaginazione.
  const balthasarWebSearch = settings.provider === "openrouter";
  const balthasarPrompt = `${baseCtx}${memoriaCtx}${targetCtx} Sei BALTHASAR, il Perturbatore.${balthasarWebSearch ? " Hai accesso alla ricerca web: usala per ancorare la perturbazione a un dato, caso o approccio reale non ancora noto al Ghost — non limitarti a rimescolare concetti che già possiede." : ""} Genera una divergenza evolutiva su questo tema, audace, non convenzionale — a intensità "${intensity}" (leggera = uno spostamento laterale; profonda = una rottura vera con l'assetto attuale).${balthasarWebSearch ? ` Cita SOLO fonti, servizi o domini effettivamente presenti nei risultati di ricerca che hai ricevuto: se non puoi attribuire un dato a una fonte reale, ometti l'attribuzione o dichiara che è una stima non verificata. Non inventare MAI nomi di siti, aziende o servizi — è già successo il 26/07/2026 e il programma adesso controlla.` : ""}`;
  // La stessa diagnostica del Balthasar-del-Seme, finalmente anche qui: si legge cio' che la
  // risposta porta gia' con se', nessuna chiamata in piu'.
  const webSearchDiag = diagnosticaVuota();
  const balthasar = await askWithDegenerateGuard(
    () => askModel(balthasarPrompt, question, balthasarTemp, 1600, settings, balthasarWebSearch, null, (raw) => {
      if (balthasarWebSearch) leggiDiagnosticaRicerca(raw, webSearchDiag);
      logAiCost(pushDebugLog, "balthasar", settings.model, raw);
    }, ANTI_LOOP_PENALTIES),
    "balthasar", pushDebugLog
  );
  // Il sospetto si calcola SEMPRE, anche senza ricerca: senza citazioni reali qualunque nome
  // fabbricato resta senza riscontro, ed e' esattamente il caso in cui va segnalato.
  const possibleHallucinatedSource = detectPossibleHallucinatedSource(balthasar, question, webSearchDiag.citationDomains);
  pushDebugLog?.({ type: "balthasar-fonti", ricercaAttiva: balthasarWebSearch, toolInvoked: webSearchDiag.toolInvoked, citazioni: webSearchDiag.citationCount, domini: webSearchDiag.citationDomains, possibileFonteInventata: possibleHallucinatedSource });
  onStage("balthasar", balthasar);
  onStage("melchior", null);
  const melchior = await askWithDegenerateGuard(
    () => askModel(`${baseCtx} Sei MELCHIOR, il Traduttore. Traduci questa idea in azione concretamente eseguibile.\n\nIdea di Balthasar: "${balthasar}"`, question, 0.7, 1600, settings, false, null, (raw) => logAiCost(pushDebugLog, "melchior", settings.model, raw), ANTI_LOOP_PENALTIES),
    "melchior", pushDebugLog
  );
  onStage("melchior", melchior);
  onStage("caspar", null);
  const containmentCtx = targetPillar
    ? `Verifica in particolare il CONTENIMENTO (Manifesto V3 §4.4): questa perturbazione è mirata a ${targetPillar.toUpperCase()}. Deve restare lì. Se il piano forza pilastri diversi da ${targetPillar.toUpperCase()} a riorganizzarsi operativamente (non solo a esserne informati via Simbiosi, ma a doverci reagire), segnala lo sconfinamento e riconducila al pilastro-bersaglio.`
    : `Verifica anche il CONTENIMENTO (Manifesto V3 §4.4): la perturbazione resta mirata o rischia di forzare una riorganizzazione operativa a cascata sugli altri pilastri?`;
  const casparIdentityLine = CURRENT_GHOST_PROFILE.hasProfessionalConstraint
    ? `compartimentazione identità professionale (${CURRENT_GHOST_PROFILE.professionalIdentity} mai esposta)`
    : "nessun vincolo di compartimentazione professionale dichiarato";
  const caspar = await askModel(`${baseCtx} Sei CASPAR, l'Ancora. Verifica il piano contro i vincoli assoluti: salute, tempo lineare del Ghost, sostenibilità economica, ${casparIdentityLine}. ${containmentCtx}\n\nPiano: "${melchior}"`, question, 0.2, 1600, settings, false, null, (raw) => logAiCost(pushDebugLog, "caspar", settings.model, raw));
  onStage("caspar", caspar);
  onStage("synthesis", null);
  // FASE 1.3 (brief 14/08/2026) — la sintesi era l'UNICA delle quattro chiamate della Triade senza
  // tracciamento costi (passava null al posto del callback): il pannello costi in Setup mostrava
  // quindi una Agora Magi sistematicamente piu' economica di quanto fosse davvero, e l'errore
  // cresceva proprio sulla chiamata finale, che e' quella con il prompt piu' lungo (contiene per
  // intero l'output dei tre Magi precedenti).
  const synthesis = await askWithDegenerateGuard(
    () => askModel(`${baseCtx} Genera la SINTESI ESECUTIVA: piano calibrato in 2-3 frasi + "Vettore di Perturbazione V+1".\n\nBalthasar: "${balthasar}"\nMelchior: "${melchior}"\nCaspar: "${caspar}"`, question, 0.6, 1500, settings, false, null, (raw) => logAiCost(pushDebugLog, "magi_synthesis", settings.model, raw), ANTI_LOOP_PENALTIES),
    "magi_synthesis", pushDebugLog
  );
  onStage("synthesis", synthesis);
  return { balthasar, melchior, caspar, synthesis, webSearchDiag, possibleHallucinatedSource };
}
// Dopo la sintesi, la perturbazione lascia una traccia nella memoria del pilastro-bersaglio (§4.1:
// il Vettore V+1 non evapora più). Il prefisso [perturbato da Magi] è una nota di CONTESTO per lo Shell
// quando rilegge la memoria — NON è più il segnale di metabolizzazione (che Simbiosi ora calcola dai dati
// strutturati delle voci post-perturbazione, vedi buildResonanceDigest). Riscrive l'INTERA memoria, non appende.
async function reflectPerturbationIntoMemoria(targetPillar, synthesis, intensity, memory, settings, pushDebugLog = null) {
  if (!targetPillar) return null;
  const testo = await askModel(
    `Il pilastro ${targetPillar.toUpperCase()} ha appena ricevuto una perturbazione deliberata da Magi (intensità "${intensity}"). Non stai verificando se è "giusta" — stai riscrivendo la memoria procedurale del pilastro per registrare che è stato scosso e in che direzione. Riscrivi l'INTERA memoria del pilastro (non aggiungere in coda), integrando la perturbazione come tensione ora aperta. Inizia il testo con "[perturbato da Magi] ". Italiano, max 90 parole, denso e concreto.`,
    `Memoria attuale di ${targetPillar.toUpperCase()}: ${memory[targetPillar]?.corrente || "nessuna nota ancora"}\nVettore di Perturbazione appena generato: ${synthesis}`,
    // FASE 1.3 — quinta chiamata di una Agora Magi mirata, anch'essa mai tracciata finora.
    0.5, 900, settings, false, null, (raw) => logAiCost(pushDebugLog, "magi_riflessione", settings.model, raw)
  );
  return testo;
}
async function runAirAgent(task, settings, pushDebugLog = null, pillarMemory = null) {
  if (settings.provider !== "openrouter") throw new Error("L'Agente AIR richiede il motore OpenRouter (per la ricerca web).");
  // FASE 1.1 — vedi memoriaProceduraleBlock: l'Agente AIR riceveva il profilo statico (PILLAR_CTX.air)
  // ma non la memoria accumulata sul pilastro, quindi non sapeva nulla di cosa era già stato provato.
  const system = `${nowContext()} Sei l'Agente AIR del sistema Resonance: assistente per il pilastro dell'autonomia economica. Hai accesso alla ricerca web — cerca informazioni aggiornate a oggi, non presentare risultati datati come attuali. ${PILLAR_CTX.air}${memoriaProceduraleBlock(pillarMemory)} Rispondi in italiano, concreto, con passi azionabili e fonti quando le usi.`;
  return askWithDegenerateGuard(
    () => askOpenRouter(system, task, 0.7, 1900, settings.apiKey, settings.model, true, null, (raw) => logAiCost(pushDebugLog, "airAgent", settings.model, raw), ANTI_LOOP_PENALTIES),
    "airAgent", pushDebugLog
  );
}
// FIX 20/07/2026 (Opzione 2 — ricerca disaccoppiata): un modulo di ricerca isolato, con system prompt
// minimale come l'Agente AIR (che si è dimostrato affidabile) — invece di far decidere al modello se
// cercare DENTRO il prompt pesante dello Shell (Manifesto+memoria+stile), qui la ricerca avviene PRIMA,
// in una chiamata leggera e dedicata, e il risultato viene poi iniettato come dato già pronto nel turno
// principale. Il modello dello Shell non deve più "scegliere" di cercare — trova i dati già in mano.
async function fetchWebSearchSnapshot(query, settings, pushDebugLog = null) {
  if (settings.provider !== "openrouter") return null;
  const system = `${nowContext()} Sei un modulo di ricerca web. Hai accesso al tool di ricerca web: usalo SEMPRE per rispondere a questa richiesta, senza eccezioni. Cerca informazioni AGGIORNATE a oggi — se i risultati che trovi sono datati mesi o anni fa, dillo esplicitamente invece di presentarli come attuali. Rispondi in italiano con i dati/fatti trovati, concreti e concisi (max 150 parole), citando brevemente le fonti quando rilevante.`;
  try { return await askOpenRouter(system, query, 0.3, 700, settings.apiKey, settings.model, true, null, (raw) => logAiCost(pushDebugLog, "webSearchSnapshot", settings.model, raw)); }
  catch { return null; } // fallimento silenzioso qui: runShellTurn lo segnala onestamente al Ghost, non lo nasconde
}

//──────────────────────────────────────────────────────────
// SEME — pre-Percorso AIR: intercettazione, ricerca autonoma, esecuzione autonoma sorvegliata
//──────────────────────────────────────────────────────────
// Un Seme nasce grezzo (frase buttata lì in chat, o testo libero dal pulsante manuale), viene
// ricercato/tradotto in strategie (Fase 1 — automatica, nessuna azione esterna, sicura di suo),
// e SOLO dopo approvazione esplicita del Ghost entra in sviluppo autonomo sorvegliato (Fase 2 —
// mai un'azione che tocchi il mondo esterno, vedi runSeedGateCheck). Avanza una sola volta per
// apertura della tab Shell (vedi l'effect di mount in ShellView), mai ad ogni messaggio.
const SEME_RESEARCH_ITERATION_CAP = 5;  // Fase 1 — round di ricerca senza convergenza
const SEME_EXECUTION_ITERATION_CAP = 5; // Fase 2 — passi di sviluppo, contatore indipendente dal precedente
// FASE 1.3 (brief 14/08/2026) — uscita anticipata: due round consecutivi a zero strategie approvate
// fermano il Seme senza aspettare il tetto di 5. Due e non uno perche' un singolo round vuoto puo'
// essere una ricerca web andata male, non un'idea che non regge; due di fila sono un segnale.
const SEME_EMPTY_ROUNDS_BEFORE_EXIT = 2;

//──────────────────────────────────────────────────────────
// EFFETTORI AIR — registro, contratto, esecutore (BRIEF_effettori_printify 27/07/2026)
//──────────────────────────────────────────────────────────
// Problema risolto: il passo di esecuzione del Seme aveva come unici "strumenti" un modello
// linguistico e la ricerca web — produceva quindi PROSA che descrive un'azione ("Eseguire una
// ricerca su Etsy per identificare le verticali..."), mai l'azione stessa. Non risolvibile
// calibrando i prompt: mancavano gli effettori. Decisione del Ghost: generalizzare il CONTRATTO
// d'azione, non i singoli connettori — ogni canale futuro deve costare un solo file adattatore
// (un endpoint /api) + una voce di registro qui, non una riscrittura del flusso Seme.
// Il registro è l'UNICA fonte di verità su "cosa il sistema può fare": il modello SCEGLIE da qui,
// non inventa verbi (vedi proposeSeedExecutionStep sotto). "nessuno_disponibile" è l'esito onesto
// quando nessun effettore reale può realizzare il passo — mai più una descrizione testuale
// spacciata per azione.
const EFFECTOR_REGISTRY = [
  {
    id: "immagine_vettoriale",
    descrizione: "Genera un design grafico come SVG (testo/lettering/composizioni geometriche, forme) e lo converte in PNG ad alta risoluzione lato server. Usa questo per grafiche TIPOGRAFICHE o con testo: il testo resta testo, nessun rischio di rendering sbagliato, costo zero, nessuna chiave, nessuna quota. L'immagine risultante viene depositata su Drive per ispezione.",
    schemaParametri: { svg: "string — markup SVG completo e valido (root <svg> con viewBox), testo/forme/colori già definiti", widthPx: "number opzionale, default 4500 (standard Printify t-shirt a 300 DPI)", heightPx: "number opzionale, default 5400", driveLabel: "string breve per il nome del file su Drive" },
    richiedeGate: false,
    reversibile: true,
    costoStimato: 0,
  },
  {
    id: "immagine_raster",
    descrizione: "Genera un'immagine da prompt testuale tramite un provider esterno di generazione immagine. Usa questo SOLO per illustrazione/texture dove l'SVG non arriva (MAI per design con testo leggibile: i modelli raster sbagliano spesso il rendering del testo dentro l'immagine). L'immagine risultante viene depositata su Drive per ispezione.",
    schemaParametri: { prompt: "string — descrizione dell'immagine da generare, in inglese se il provider lo richiede", driveLabel: "string breve per il nome del file su Drive" },
    richiedeGate: false,
    reversibile: true,
    costoStimato: 0.02,
  },
  {
    id: "printify_crea_prodotto",
    descrizione: "Crea un prodotto REALE nel catalogo Printify (verificabile aprendo la dashboard Printify), a partire da un'immagine già generata da immagine_vettoriale o immagine_raster. Azione con effetto esterno reale e irreversibile senza intervento manuale — passa SEMPRE dal gate.",
    schemaParametri: { imagePngBase64: "string — base64 del PNG da usare, ottenuto da un passo immagine_vettoriale/immagine_raster precedente", blueprintId: "number — id del blueprint di prodotto Printify (dal catalogo)", printProviderId: "number — id del print provider Printify per quel blueprint", variantIds: "array di number — id delle varianti (taglie/colori) da attivare", title: "string — titolo del prodotto", description: "string — descrizione del prodotto" },
    richiedeGate: true,
    reversibile: false,
    costoStimato: 0,
  },
  {
    id: "printify_cerca_prodotto_base",
    descrizione: "Cerca nel catalogo Printify il tipo di prodotto su cui stampare (t-shirt, tazza, poster, borsa...) e restituisce gli id concreti che servono per crearlo: blueprintId, printProviderId e l'elenco delle variantIds. Usa questo PRIMA di printify_crea_prodotto: senza, quegli id andrebbero indovinati, e un id indovinato non dà un errore leggibile — dà il prodotto sbagliato. Non crea niente, non pubblica niente, non costa niente.",
    schemaParametri: { azione: "string — usa \"prodottoPiuSemplice\" per ottenere una combinazione pronta in un colpo solo", cerca: "string — nome del tipo di prodotto in inglese, es. \"t-shirt\", \"mug\", \"poster\", \"tote bag\"" },
    richiedeGate: false,
    reversibile: true,
    costoStimato: 0,
  },
  {
    id: "printify_pubblica_su_etsy",
    descrizione: "Pubblica sul negozio Etsy collegato un prodotto GIA' creato nel catalogo Printify. È l'unico passo che rende la cosa visibile e comprabile da un estraneo: da qui in poi non si torna indietro con un comando. Passa SEMPRE dal gate. Prima di usarlo, verifica con azione \"statoNegozi\" che un negozio Etsy sia davvero collegato, altrimenti la pubblicazione fallisce dopo aver già creato il prodotto.",
    schemaParametri: { azione: "string — \"statoNegozi\" per controllare il collegamento a Etsy, \"pubblica\" per pubblicare davvero", productId: "string — l'id restituito da printify_crea_prodotto (serve solo per \"pubblica\")" },
    richiedeGate: true,
    reversibile: false,
    costoStimato: 0,
  },
  {
    id: "nessuno_disponibile",
    descrizione: "Nessun effettore di questo registro può realizzare il passo che ritieni necessario ORA. Usa questo per dichiararlo esplicitamente — MAI ripiegare su una descrizione testuale spacciata per azione.",
    schemaParametri: { spiegazione: "string — cosa servirebbe concretamente e perché non è disponibile in questo registro" },
    richiedeGate: false,
    reversibile: true,
    costoStimato: 0,
  },
];
// Mappa 1:1 effettore→endpoint /api: ogni canale futuro aggiunge UNA riga qui + un file in /api,
// mai un cambiamento al contratto o all'esecutore (vedi FASE 2 del brief).
const EFFECTOR_ENDPOINTS = {
  immagine_vettoriale: "/api/svg-to-png",
  immagine_raster: "/api/generate-image",
  printify_crea_prodotto: "/api/printify-create-product",
  printify_cerca_prodotto_base: "/api/printify-catalog",
  printify_pubblica_su_etsy: "/api/printify-publish",
};
// FASE 2 (brief 14/08/2026) — modalità "prova a vuoto". Quando è accesa, ogni effettore che tocca
// il mondo esterno riceve dryRun:true e risponde descrivendo per intero la chiamata che SAREBBE
// partita, senza farla partire. Serve a percorrere la catena completa a costo zero e senza effetti,
// che è il gate della Fase 2 del brief. Vive in localStorage e non nello stato React perché
// invokeEffector è una funzione di modulo, fuori dall'albero dei componenti.
const DRY_RUN_KEY = "effettori-prova-a-vuoto";
function isProvaAVuoto() { return loadKey(DRY_RUN_KEY, false) === true; }
function setProvaAVuoto(attiva) { saveKey(DRY_RUN_KEY, !!attiva); }
// Effettori che producono un'immagine (PNG base64) da depositare su Drive con l'infrastruttura
// già esistente (createDriveFile, già riscritta per Blob binari — vedi invokeEffector sotto).
const IMAGE_PRODUCING_EFFECTORS = new Set(["immagine_vettoriale", "immagine_raster"]);
// Formatta il contratto in una stringa leggibile per l'UI ESISTENTE di gatedActionPreview
// (SemiPanel, invariata — vedi CORREZIONE 26/07/2026 sopra su unlockGatedSeed): il Ghost deve
// vedere l'azione ESATTA prima di sbloccarla, mai un unlock generico.
function formatContractPreview(contract) {
  return `Effettore: ${contract.effettore}\nParametri: ${JSON.stringify(contract.parametri, null, 2)}\nRazionale: ${contract.razionale || "—"}`;
}
// Formatta l'esito REALE (dati veri restituiti dall'adattatore, mai un riassunto narrativo) per
// l'executionLog del Seme — stessa funzione usata sia dall'esecuzione diretta sia dopo conferma
// del gate (unlockGatedSeed), per non duplicare la logica di formattazione.
function formatRealResultNote(contract, risultato) {
  if (!risultato?.ok) return `Errore esecuzione effettore "${contract.effettore}": ${risultato?.error || "errore sconosciuto"}`;
  // FASE 2 — in prova a vuoto la nota deve dire a chiare lettere che NON è successo niente, altrimenti
  // il log di esecuzione del Seme sembrerebbe identico a quello di un'esecuzione vera.
  if (risultato.provaAVuoto) {
    const chiamate = (risultato.chiamateCheSarebberoPartite || []).map((c) => `${c.metodo} ${c.url}`).join(" · ");
    return `PROVA A VUOTO — "${contract.effettore}" NON è stato eseguito davvero. ${risultato.descrizione || ""} Chiamate che sarebbero partite: ${chiamate || "nessuna"}.`;
  }
  const { ok, ...dati } = risultato;
  const dettagli = Object.entries(dati).filter(([k]) => k !== "driveFileId" || dati.driveFileId).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
  return `Eseguito "${contract.effettore}" — ${dettagli || "nessun dettaglio restituito"}`;
}
// Esecutore di basso livello: chiama l'endpoint /api mappato, non decide MAI se eseguire (quello
// è compito di executeSeedContract, che verifica gate/AIR PRIMA di chiamare questa funzione).
// Per gli effettori che producono un'immagine, deposita SEMPRE il PNG su Drive dopo la chiamata
// (riusando createDriveFile, che vive nel client — Drive usa l'OAuth del Ghost, mai accessibile
// da un endpoint /api) e include l'id del file Drive nel risultato restituito al chiamante.
async function invokeEffector(effectorId, parametri, pushDebugLog) {
  const endpoint = EFFECTOR_ENDPOINTS[effectorId];
  if (!endpoint) return { ok: false, error: `Nessun endpoint /api mappato per l'effettore "${effectorId}".` };
  // FASE 2 — il flag viaggia nel corpo della richiesta, così è l'endpoint stesso a fermarsi:
  // un interruttore che vive solo nel frontend proteggerebbe solo finché nessuno chiama /api
  // direttamente, cioè non proteggerebbe.
  const provaAVuoto = isProvaAVuoto();
  const corpo = provaAVuoto ? { ...parametri, dryRun: true } : parametri;
  let data;
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    data = await res.json();
  } catch (e) {
    pushDebugLog?.({ type: "effettore-eseguito", effectorId, provaAVuoto, ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
  if (provaAVuoto) {
    pushDebugLog?.({ type: "effettore-eseguito", effectorId, provaAVuoto: true, ok: !!data.ok, error: data.error || null });
    return { ...data, provaAVuoto: true };
  }
  if (data.ok && IMAGE_PRODUCING_EFFECTORS.has(effectorId) && data.pngBase64) {
    try {
      const bin = atob(data.pngBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "image/png" });
      const driveLabel = parametri?.driveLabel || `effettore-${effectorId}`;
      const driveFile = await createDriveFile(`Resonance – ${driveLabel} – ${new Date().toISOString().slice(0, 19).replace("T", " ")}.png`, blob, "image/png");
      data = { ...data, driveFileId: driveFile.id };
    } catch (e) {
      // Deposito su Drive fallito: l'azione (generazione immagine) è comunque riuscita — non far
      // fallire l'intero esito per questo, ma rendere l'errore visibile nel debug log.
      pushDebugLog?.({ type: "effettore-drive-deposito", effectorId, error: e.message });
    }
  }
  pushDebugLog?.({ type: "effettore-eseguito", effectorId, ok: !!data.ok, error: data.ok ? null : (data.error || "errore sconosciuto") });
  return data;
}
// Esecutore unico (FASE 1.3): riceve il contratto, verifica il vincolo AIR e il gate SUI PARAMETRI
// CONCRETI dell'azione (mai su un riassunto), e o esegue chiamando l'adattatore o si ferma
// presentando al Ghost l'azione esatta in attesa di conferma (vedi advanceSeedIfDue/unlockGatedSeed).
async function executeSeedContract(contract, profile, settings, pushDebugLog = null) {
  const effettore = EFFECTOR_REGISTRY.find((e) => e.id === contract?.effettore);
  if (!contract || !effettore || contract.effettore === "nessuno_disponibile") {
    return { esito: "nessuna_azione", dettaglio: contract?.parametri?.spiegazione || "Nessun effettore disponibile per questo passo.", gated: false };
  }
  // Gate invariato (le 4 condizioni + vincolo AIR restano quelle di runSeedGateCheck, non
  // riprogettate) — chiamato SEMPRE, per ogni contratto, esattamente come accadeva PRIMA per ogni
  // stepText testuale: nessun bypass introdotto per gli effettori a richiedeGate:false.
  const gate = await runSeedGateCheck(contract, profile, settings, pushDebugLog);
  if (gate.gated) return { esito: "gate", gated: true, reason: gate.reason, contract };
  const risultato = await invokeEffector(contract.effettore, contract.parametri, pushDebugLog);
  return { esito: risultato.ok ? "eseguito" : "errore", gated: false, contract, risultato };
}
// Euristica leggera, zero costo — stesso stile di detectWebSearchIntent: riconosce un'idea grezza
// buttata lì in conversazione ("potrei fare X", "sarebbe interessante Y"), non una richiesta diretta
// né una domanda. Non crea nulla da sola: propone solo il tap di conferma (vedi ShellView).
function detectSeedWorthyIntent(message) {
  const t = message.trim().toLowerCase();
  return /\b(potrei\s+(fare|provare|lanciare|creare|iniziare)|sarebbe\s+interessante|forse\s+dovrei\s+(provare|fare)|e\s+se\s+provassi|mi\s+piacerebbe\s+provare|chiss[àa]\s+se)\b/.test(t);
}
// ── 31/08/2026 — LA DIAGNOSTICA DELLE FONTI ERA COLLEGATA A UNO SOLO DEI DUE BALTHASAR ──────────
// Il brief sui Serbatoi ricorda che Balthasar e' fra i componenti mai verificati in produzione dopo
// il fix max_tool_calls, e chiede di dirlo prima di costruirci sopra. Guardando il codice per
// rispondere e' venuto fuori qualcosa di piu' preciso: la diagnostica costruita il 26/07 per quel
// preciso incidente — le fonti fabbricate tipo "ShopFoundry", "RankHero" — vive dentro
// runSeedResearch e SOLO li'. Il Balthasar della Triade (Agora Magi) usa anche lui la ricerca web,
// e non ha ne' il rilevatore ne' il divieto esplicito di inventare nomi nel prompt.
// Quindi: puo' citare fonti inventate esattamente come faceva l'altro, e nessuno se ne accorge —
// nessun flag, nessuna riga nel registro, niente.
// Questa funzione e' la lettura della diagnostica, estratta dal punto in cui viveva per poter essere
// usata da entrambi. Nessuna chiamata AI in piu': legge cio' che la risposta porta gia' con se'.
// Le forme cercate sono tre perche' la forma esatta non e' verificabile senza una chiamata vera —
// stessa ragione dichiarata nel commento originale, mantenuta.
function leggiDiagnosticaRicerca(raw, diag) {
  const msg = raw?.choices?.[0]?.message || {};
  const annotations = msg.annotations || raw?.citations || msg.tool_calls || [];
  diag.toolInvoked = Array.isArray(annotations) ? annotations.length > 0 : !!annotations;
  const urls = (Array.isArray(msg.annotations) ? msg.annotations : [])
    .map((a) => a?.url_citation?.url || a?.url).filter(Boolean);
  diag.citationCount = urls.length;
  diag.citationDomains = [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return u; } }))].slice(0, 8);
  return diag;
}
const diagnosticaVuota = () => ({ toolInvoked: false, citationCount: 0, citationDomains: [] });
// TASK 2 (BRIEF_costtracking_balthasarsources 26/07/2026), caso (b) — controllo post-generazione,
// NESSUNA chiamata AI aggiuntiva (richiesta esplicita del brief): estrae nomi compound CamelCase dal
// testo di Balthasar (es. "ShopFoundry", "RankHero", "InsightAgent", "MerchTitans" — ESATTAMENTE i
// nomi fabbricati osservati nel test reale del 26/07, tutti con una maiuscola interna) e li confronta
// con i domini realmente restituiti dalla web search (webSearchDiag.citationDomains). Un nome citato
// che non trova riscontro in nessun dominio reale è un segnale di POSSIBILE allucinazione — MAI un
// blocco dell'output (Legge 10.1, niente over-gating): solo un flag visibile al Ghost via pushDebugLog.
// Esclude i nomi già presenti nell'idea originale del Ghost (es. "Printify"/"Etsy" nel test reale erano
// già nel Seme stesso, non un'attribuzione inventata da Balthasar).
// Scope deliberatamente ristretto al segnale CamelCase (maiuscola interna), non a "ogni parola con
// maiuscola": una prima versione che catturava anche parole comuni maiuscole a inizio frase (es.
// "Secondo", "Il") produceva falsi positivi sistematici — verificato con test dedicato, corretto qui.
// Trade-off accettato: non cattura fake-brand di una sola parola senza maiuscola interna (es.
// "Threadify") — euristica leggera, non un rilevatore NLP, stesso stile di detectWebSearchIntent.
function detectPossibleHallucinatedSource(balthasarText, seedContent, citationDomains) {
  if (!balthasarText) return false;
  const candidates = [...new Set((balthasarText.match(/\b[A-Za-z]*[a-z][A-Z][a-zA-Z0-9]*\b/g) || []))]
    .filter((w) => !new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(seedContent || ""));
  if (!candidates.length) return false;
  const domains = (citationDomains || []).map((d) => d.toLowerCase().replace(/^www\./, ""));
  const matchesDomain = (name) => {
    const n = name.toLowerCase();
    return domains.some((d) => d.includes(n) || d.split(".")[0] === n);
  };
  return candidates.some((c) => !matchesDomain(c));
}
// Fase 1 — un round Balthasar(ricerca web forzata)→Melchior(strategie)→Caspar(verifica vincoli).
// Prompt dedicati al Seme (non runTriadeMagi: quella pipeline è la perturbazione di Agorà Magi,
// forma di output diversa — sintesi singola, non 2-3 strategie verificate). pillarMemory esplicito
// (mai letto da uno stato globale implicito) — stessa lezione del bug generateArtifact/piano alimentare.
// Il contenuto REDATTO (redactProfessionalIdentity) è l'unico a raggiungere Balthasar/Melchior; Caspar
// riceve anche il testo originale per una verifica completa — secondo strato, vedi Parte 7 del brief.
//
// TASK 2 (BRIEF_costtracking_balthasarsources 26/07/2026) — diagnosi caso (a) vs (b):
// CASO (a) ESCLUSO per questa chiamata specifica: tool_choice="required" è applicato qui sotto
// (askOpenRouter riceve useWebSearch=true), stesso meccanismo verificato in runAirAgent — non è
// "auto", il modello non può scegliere di ignorare il tool. Nessun codice da correggere per (a).
// Resta CASO (b) come spiegazione più probabile per le fonti sospette osservate nel test del 26/07
// (nomi tipo "ShopFoundry"/"RankHero"): il tool può essere invocato correttamente mentre il modello
// mescola comunque risultati reali e confabulazione nello stesso testo di sintesi. Fix applicato:
// 1) prompt rafforzato (vedi balthasarSystem sotto — vietato inventare nomi, già in vigore dal fix
// precedente del 26/07); 2) controllo post-generazione qui sopra (detectPossibleHallucinatedSource),
// nuovo in questo giro, che rende visibile il sospetto invece di lasciarlo silenzioso nel log.
// NON confermato con un test empirico reale in questa sessione (nessuna chiave OpenRouter valida in
// questo ambiente sandboxed) — vedi riepilogo di consegna per il gap dichiarato.
async function runSeedResearch(seme, pillarMemory, settings, pushDebugLog = null) {
  if (settings.provider !== "openrouter") throw new Error("La ricerca del Seme richiede il motore OpenRouter (per la ricerca web).");
  const redactedContent = redactProfessionalIdentity(seme.content, CURRENT_GHOST_PROFILE);
  // PUNTO 1 (BRIEF_correzioni_post_test 26/07/2026): il primo test reale ha mostrato Balthasar citare
  // nomi di fonte ("ShopFoundry", "RankHero"...) non riconducibili a servizi reali — sospetto di
  // allucinazione in fase di sintesi, non necessariamente un fallimento della web search in sé.
  // tool_choice:"required" (askOpenRouter, FIX 20/07) è già applicato a QUESTA chiamata specifica
  // (useWebSearch=true qui sotto, stesso meccanismo di runAirAgent) — verificato leggendo il codice.
  // Non potendo eseguire qui una chiamata reale (nessuna API key valida in questo ambiente), estraggo
  // e logghiamo (vedi App.advanceSeedIfDue) ogni segnale diagnostico plausibile che OpenRouter possa
  // restituire per una ricerca realmente eseguita (annotazioni/citazioni con URL, in più forme note
  // perché la forma esatta non è verificabile senza una chiamata live) — così il PROSSIMO test reale
  // del Ghost (con la sua chiave vera) può confermare empiricamente invece di fidarsi a parole.
  const webSearchDiag = diagnosticaVuota();
  const balthasarSystem = `${nowContext()} Sei BALTHASAR nel sistema Resonance, pilastro AIR — funzione di ricerca per un Seme (un'idea grezza non ancora sviluppata). Hai accesso alla ricerca web: usala per trovare dati, casi reali o approcci concreti pertinenti, aggiornati a oggi — non presentare risultati datati come attuali. ${PILLAR_CTX.air}
Memoria procedurale AIR accumulata finora (non ripetere strategie già scartate): ${pillarMemory || "nessuna nota ancora"}
Rispondi in italiano, concreto, max 200 parole. Cita SOLO fonti/domini effettivamente presenti nei risultati di ricerca che hai ricevuto — se non puoi attribuire con certezza un dato a una fonte reale, ometti l'attribuzione o dichiara esplicitamente che è una stima non verificata. Non inventare mai nomi di siti o servizi.`;
  const balthasar = await askWithDegenerateGuard(
    () => askOpenRouter(balthasarSystem, `Idea da sviluppare: ${redactedContent}`, 0.7, 1200, settings.apiKey, settings.model, true, null, (raw) => {
      leggiDiagnosticaRicerca(raw, webSearchDiag);
      logAiCost(pushDebugLog, "seme_ricerca", settings.model, raw);
    }, ANTI_LOOP_PENALTIES),
    "seme_ricerca", pushDebugLog
  );
  const melchiorSystem = `${nowContext()} Sei MELCHIOR nel sistema Resonance, pilastro AIR — traduci la ricerca in strategie concrete ed eseguibili per sviluppare questa idea. ${PILLAR_CTX.air}
Genera 2-3 strategie, ciascuna specifica e azionabile (non generica). Non citare fonti/dati che Balthasar non ha già fornito — se un dettaglio non è supportato dalla ricerca ricevuta, presentalo come ipotesi da verificare, non come fatto. JSON: {"strategie":[{"titolo":"...","descrizione":"...(max 80 parole)"}]}`;
  const melchiorData = await askModelJSON(melchiorSystem, `Idea: ${redactedContent}\nRicerca di Balthasar: ${balthasar}`, 0.6, 1400, settings, null, (raw) => logAiCost(pushDebugLog, "seme_ricerca", settings.model, raw));
  const candidate = (melchiorData?.strategie || []).slice(0, 3).map((s, i) => ({ id: String(i), titolo: s.titolo || `Strategia ${i + 1}`, descrizione: s.descrizione || "" }));
  let approved = [];
  let rejected = [];
  if (candidate.length) {
    // CORREZIONE 26/07/2026: il vincolo (§6.1) riguarda l'identità RICONOSCIBILE (il nome del Ghost,
    // il brand/studio professionale), non la materia fisioterapica in astratto — va detto esplicitamente
    // a Caspar, altrimenti il modello rischia di bocciare per riflesso qualunque strategia che tocchi il
    // dominio (es. biomeccanica, prevenzione infortuni), che invece è contenuto AIR del tutto legittimo.
    const casparIdentityLine = CURRENT_GHOST_PROFILE.hasProfessionalConstraint
      ? `1) non deve esporre l'identità professionale RICONOSCIBILE del Ghost — il suo nome, il brand/studio (${CURRENT_GHOST_PROFILE.professionalIdentity}), o affermazioni che leghino esplicitamente il contenuto alla sua pratica reale (es. "il mio studio", "i miei pazienti"). Il dominio della fisioterapia in sé (biomeccanica, riabilitazione, prevenzione infortuni, ecc.) NON è vietato — bocciare per il solo dominio, senza un marcatore di identità riconoscibile, è un ERRORE da evitare; 2) non deve richiedere dilatazione del suo tempo lineare di lavoro.`
      : `non deve richiedere dilatazione insostenibile del tempo lineare di lavoro del Ghost (nessun vincolo di identità professionale dichiarato per questo Ghost).`;
    // Esclude il record G.1 (tipo:"identita-professionale"): già coperto per intero da casparIdentityLine
    // sopra — includerlo anche qui duplicherebbe la stessa istruzione due volte nello stesso prompt.
    const airHc = (Array.isArray(CURRENT_GHOST_PROFILE.hardConstraints) ? CURRENT_GHOST_PROFILE.hardConstraints : [])
      .filter((c) => c?.pilastro === "air" && c.tipo !== "identita-professionale").map((c) => c.testo).join("; ");
    const casparSystem = `Sei CASPAR nel sistema Resonance, pilastro AIR — verifica ciascuna strategia contro i vincoli ASSOLUTI e non negoziabili: ${casparIdentityLine}${airHc ? ` Vincoli AIR aggiuntivi dichiarati dal Ghost: ${airHc}.` : ""} Boccia SOLO per violazione di un vincolo assoluto, mai per qualità o preferenza. JSON: {"verdetti":[{"id":"0","approvata":true/false,"motivo":"se bocciata, max 20 parole"}]}`;
    const casparData = await askModelJSON(casparSystem, `Testo originale dell'idea (non redatto, per verifica completa): ${seme.content}\nStrategie da verificare: ${JSON.stringify(candidate.map(({ id, titolo, descrizione }) => ({ id, titolo, descrizione })))}`, 0.2, 1200, settings, null, (raw) => logAiCost(pushDebugLog, "seme_ricerca", settings.model, raw));
    const verdetti = new Map((casparData?.verdetti || []).map((v) => [String(v.id), v]));
    // Fail-safe, non fail-open: senza un verdetto ESPLICITO di approvazione la strategia resta fuori,
    // per sempre (mai riproposta) — coerente con runAccettore, l'unico hard-stop vero del sistema.
    approved = candidate.filter((c) => verdetti.get(c.id)?.approvata === true).map(({ id, ...rest }) => rest);
    // Esito di Caspar per il debug log (App.advanceSeedIfDue): SOLO id scartato + motivo breve di
    // Caspar (≤20 parole, sua sintesi) — MAI il testo/prompt completo inviato al modello, che conteneva
    // il contenuto originale non redatto dell'idea (vedi CHIARIMENTO 26/07/2026, punto 2).
    rejected = candidate.filter((c) => verdetti.get(c.id)?.approvata !== true)
      .map((c) => ({ id: c.id, reason: (verdetti.get(c.id)?.motivo || "nessun verdetto esplicito di approvazione").slice(0, 200) }));
  }
  const possibleHallucinatedSource = detectPossibleHallucinatedSource(balthasar, seme.content, webSearchDiag.citationDomains);
  return { balthasar, approvedStrategies: approved, rejectedStrategies: rejected, candidateCount: candidate.length, webSearchDiag, possibleHallucinatedSource };
}
// Fase 2 — un passo per volta (stile proposeNextStep dei Percorsi), MAI un'azione che tocchi il
// mondo esterno DIRETTAMENTE da qui: il gate-check + l'esecutore (executeSeedContract) verificano
// e/o eseguono DOPO. FIX 27/07/2026 (BRIEF_effettori_printify): questa funzione produceva PROSA
// libera che descriveva un'azione, mai l'azione — causa radice del bug osservato in produzione
// (Seme jl2qlksd: "Eseguire una ricerca approfondita su Etsy..." mai davvero eseguita). Ora produce
// un CONTRATTO strutturato: il modello SCEGLIE un effettore dal registro, non inventa verbi.
async function proposeSeedExecutionStep(seme, pillarMemory, settings, pushDebugLog = null) {
  const logDigest = (seme.executionLog || []).map((e) => `- ${e.note}`).join("\n") || "nessun passo ancora eseguito";
  const registryText = EFFECTOR_REGISTRY.map((e) => `- "${e.id}": ${e.descrizione} Parametri attesi: ${JSON.stringify(e.schemaParametri)}.`).join("\n");
  return askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro AIR — sviluppo autonomo di un Seme già approvato dal Ghost. ${PILLAR_CTX.air}
Memoria procedurale AIR: ${pillarMemory || "nessuna nota ancora"}
Il tuo compito NON è descrivere un'azione a parole: devi SCEGLIERE un effettore dal registro sottostante e produrre i parametri concreti per eseguirlo davvero. Non inventare verbi o azioni fuori dal registro.
REGISTRO EFFETTORI DISPONIBILI:
${registryText}
Se nessun effettore disponibile può realizzare il passo che ritieni necessario ORA, scegli "nessuno_disponibile" con una spiegazione nei parametri — MAI ripiegare su una descrizione testuale spacciata per azione: la prosa descrittiva non è un esito valido di questo passo.
JSON: {"effettore":"<id esatto dal registro>","parametri":{...secondo lo schema atteso per quell'effettore},"razionale":"perché questo passo, max 40 parole","costoStimato":<numero>,"richiedeGate":<bool, copia il valore dichiarato nel registro per l'effettore scelto>}`,
    `Idea: ${seme.content}\nStrategia approvata: ${seme.approvedStrategy?.titolo || ""} — ${seme.approvedStrategy?.descrizione || ""}\nPassi già fatti:\n${logDigest}`,
    0.6, 1200, settings, null, (raw) => logAiCost(pushDebugLog, "seme_esecuzione", settings.model, raw)
  );
}
// Gate-check obbligatorio (Parte 6 del brief precedente) — lista CHIUSA di 4 condizioni, non un
// giudizio discrezionale. Modellato su runAccettore (unico altro hard-stop vero e proprio del
// sistema). INVARIATA nelle 4 condizioni e nel vincolo AIR (BRIEF_effettori_printify: "non
// riprogettare il gate") — adattato SOLO nell'input: riceve il CONTRATTO strutturato invece di una
// stringa di prosa, così la verifica avviene sui parametri concreti dell'azione, non su un riassunto.
async function runSeedGateCheck(contract, profile, settings, pushDebugLog = null) {
  const identityConstraint = profile.hasProfessionalConstraint
    ? ` Vincolo aggiuntivo sempre attivo, indipendente dalle 4 condizioni sopra: il passo non deve MAI esporre l'identità professionale del Ghost (${profile.professionalIdentity}) — se lo fa, blocca comunque.`
    : "";
  const text = await askModel(
    `Sei CASPAR nel sistema Resonance, pilastro AIR — gate di sicurezza prima di eseguire un passo autonomo. Blocca SOLO se il passo descritto rientra in una di queste 4 condizioni chiuse (nessun'altra motivazione è valida):
1) transazione reale (acquisto, iscrizione, spesa anche minima);
2) pubblicazione esterna (post, listing, email a terzi, contenuto reso pubblico in qualunque forma);
3) azione irreversibile o costosa da disfare (creazione account, commit a servizi terzi, cancellazioni);
4) richiede una credenziale non disponibile in questo sistema (es. API key di un servizio esterno non configurata).${identityConstraint}
Se nessuna delle 4 condizioni scatta, via libera. Rispondi SOLO "VIA LIBERA" oppure "BLOCCATO: <quale condizione, max 20 parole>".`,
    `Effettore scelto: "${contract.effettore}"\nParametri concreti: ${JSON.stringify(contract.parametri)}\nRazionale dichiarato: ${contract.razionale || ""}`, 0.2, 300, settings, false, null, (raw) => logAiCost(pushDebugLog, "seme_esecuzione", settings.model, raw)
  );
  const gated = /BLOCCATO/i.test(text);
  return { gated, reason: text.replace(/^(VIA LIBERA|BLOCCATO):?\s*/i, "") };
}

// PUNTO 3 (BRIEF_correzioni_post_test 26/07/2026): senza questo, lo Shell non distingue "il Ghost
// parla di una feature dell'app" da "il Ghost parla del proprio lavoro/vita" — osservato nel primo
// test reale (il Ghost ha scritto "sto testando i Semi nel pilastro AIR" e lo Shell ha risposto come
// se si riferisse alla vecchia strategia contenuti/Threvane, ignaro che "Semi" fosse una feature).
// Iniettato nel system prompt di Shell nello stesso punto di PILLAR_CTX (vedi runShellTurn sotto).
// PROMEMORIA PER FUTURE SESSIONI DI SVILUPPO: aggiorna questo blocco ad ogni nuova feature spedita
// — è parte della checklist di consegna (vedi CLAUDE.md).
// ══════════════════════════════════════════════════════════════════════════════
// IL BLOCCO DELLE CAPACITÀ — ALLEGGERITO IL 22/08/2026 DOPO L'AUDIT
// ══════════════════════════════════════════════════════════════════════════════
// Questo blocco parte a OGNI turno dentro il prompt di sistema. Misurato prima di toccarlo:
// il 90% dei token dell'app sta in una sola chiamata (la risposta dello Shell), il 72% di quella
// chiamata e' questo blocco, e il 39% di questo blocco era la CRONACA dei difetti che le feature
// hanno chiuso — date, numeri di versione, "serve perche' il 22/08 lo Shell ha elencato due
// appuntamenti...". Circa un quarto di tutti i token consumati dall'app, a ogni turno, per sempre.
//
// La cronaca non e' stata buttata: e' stata spostata QUI SOTTO e nei commenti accanto a ogni
// funzione, dove serve a chi legge il codice e non costa un token. Il blocco resta alla specifica
// che il file di progetto chiede: cos'e', come si attiva, cosa significano i suoi stati.
//
// LA STORIA, per chi legge il codice e si chiede perche' certe cose esistono:
//  · 26/07/2026 — il Ghost scrisse "sto testando i Semi nel pilastro AIR" e lo Shell rispose come se
//    parlasse della vecchia strategia contenuti, ignaro che "Semi" fosse una feature. E' il difetto
//    che ha fatto nascere questo blocco, ed e' il motivo per cui ogni feature nuova va aggiunta qui.
//  · 16/08/2026 — lo Shell scriveva "Ho segnato un appuntamento" prima che il Ghost confermasse:
//    da li' la regola sul tempo verbale e il primo filtro.
//  · 17/08/2026 — chiedeva "vuoi confermare?" senza che dietro ci fosse nessuna proposta.
//  · 20/08/2026 — dichiarava spenta una capacita' che il Ghost aveva accesa davanti agli occhi;
//    e la verifica post-scrittura confrontava gli orari come stringhe invece che come istanti.
//  · 22/08/2026, mattina — elenco' due appuntamenti con nome e ora, uno con una persona inesistente
//    e uno del giorno prima, omettendo l'unico vero, senza che nessuna richiesta uscisse dal
//    telefono: da li' il quarto filtro.
//  · 22/08/2026, pomeriggio — un appuntamento chiesto per le 16:30 fini' sul calendario alle 16:00
//    e la verifica disse "c'e'", perche' confrontava il payload con la rilettura, cioe' il sistema
//    con se stesso: da li' i due percorsi indipendenti sull'ora.
//  · 22/08/2026, sera — "prossimi 7 giorni" non veniva capito e la card chiedeva un giorno preciso,
//    cioe' un'informazione gia' data; e una card senza pulsante bloccava per venti minuti ogni
//    altra richiesta di calendario, in silenzio.
const APP_CAPABILITIES_CONTEXT = `Features attive dell'app che il Ghost può nominare in conversazione. Servono a distinguere "sto parlando di una funzionalità di Resonance" da "sto parlando della mia vita o del mio lavoro". Se il Ghost nomina una di queste parole, parla dell'app.
- Percorsi: competenze o percorsi identitari tracciati per pilastro (BIO/AIR/VIDYA), con nodi, sessioni e quiz di verifica. Si aprono da un pilastro o dicendo "apri un percorso su X".
- Semi (solo AIR): un'idea grezza non ancora sviluppata. Si crea buttandola lì in chat, oppure con un pulsante in AIR → Percorsi. Stati: "nuovo/in ricerca" (lo Shell la sta ricercando e traducendo in strategie), "in attesa di approvazione" (2-3 strategie pronte, il Ghost ne sceglie una), "in sviluppo" (esecuzione sorvegliata passo per passo), "bloccato" (un gate di sicurezza ha fermato un passo e serve la conferma del Ghost). Un passo di sviluppo sceglie un effettore reale da un registro — genera un'immagine, crea un prodotto nel catalogo Printify — e lo esegue davvero, producendo dati veri: identificativi di prodotto, file su Drive. Ogni Seme ha un pulsante "Avanza ora" e mostra il contatore round/tetto.
- Agorà Magi: una perturbazione deliberata generata su richiesta, in tre stadi (Balthasar → Melchior → Caspar) più una sintesi. Si avvia dalla sua schermata, si sceglie pilastro e intensità.
- Kernel: il documento di stato del sistema, versionato. Ogni salvataggio crea una versione nuova e conserva la precedente nello storico.
- Simbiosi: la valutazione periodica di quanto l'app e il Ghost siano allineati. Vive nella sua schermata.
- Percorso proposto da Simbiosi: quando valuta lo stato del sistema, Simbiosi può proporre — mai creare da sola — un percorso NUOVO (non uno già esistente), collegato esplicitamente a un percorso già attivo che nomina per titolo, come modo di continuare a crescere sui pilastri. Compare come card in Simbiosi con due pulsanti: "Sì, aprilo" lo crea davvero (stessa scomposizione in nodi di ogni altro percorso), "Non ora" lo scarta. Al massimo una proposta alla volta: finché quella in sospeso non viene decisa, Simbiosi non ne propone un'altra.
- Lunghezza massima di una risposta: ogni risposta ha un tetto di spazio. Per la conversazione normale è basso; quando il Ghost chiede un contenuto strutturato lungo (un piano, un menu, un programma, un elenco di più giorni) il programma lo riconosce dalla richiesta e alza il tetto da solo, senza che serva chiedere. Se il tetto viene raggiunto lo stesso, la risposta si interrompe dov'era e compare la card "questa risposta è tagliata a metà" con il pulsante "Continua da dove ti sei fermato": ciò che è già scritto resta valido, manca solo il seguito.
- Vincoli dichiarati: i vincoli che il Ghost ha dichiarato in Onboarding, uno per riga, rieditabili. Quello sull'identità professionale è un hard-stop e vale su tutto ciò che riguarda AIR.
- Vincoli alimentari dichiarati parlando: quando il Ghost dice una regola alimentare in chat («escludi il pesce che non sia crostacei», «le colazioni le voglio salate», «1600 kcal»), compare una card «Questo lo tengo come regola fissa?» con due pulsanti. Tenuto, il vincolo entra nell'elenco dei Vincoli dichiarati di BIO e da lì nel prompt di ogni turno, per sempre; lasciato, vale solo per la conversazione in corso. Serve perché la conversazione che lo Shell rivede è tagliata agli ultimi venti messaggi: una regola detta e non tenuta sparisce dopo una decina di scambi.
- Piano alimentare montato dal programma: quando il Ghost chiede un piano/menu alimentare, il modello NON scrive il piano. Inventa solo un repertorio di piatti con grammature e calorie (una chiamata corta), e poi è il programma a montare la griglia dei giorni: ruota i piatti in modo che nessuno ricompaia prima di aver esaurito la sua categoria, mette i pranzi da asporto nei giorni chiesti, sceglie la cena che avvicina il totale al bersaglio calorico del giorno, fa le somme e dichiara la media VERA con lo scarto rispetto a quella chiesta. Serve perché una griglia di 14 giorni per 5 pasti è un problema combinatorio, non un testo: chiedendola al modello come testo continuo collassava a metà (osservato il 28-29/08) e comunque non poteva garantire né la media né l'assenza di ripetizioni. La variazione calorica fra i giorni è voluta, non un errore.
- Creare un percorso parlando: "genera un percorso in vidya su X", "creiamone uno nuovo su Y". Compare una card che mostra il TITOLO che nascerà — non la frase detta — e il percorso nasce solo quando il Ghost tocca il pulsante. Poi diventa da solo quello aperto, così quello che si genera subito dopo si può salvare lì dentro. Tre rifiuti espliciti invece di creare qualcosa di sbagliato: se il pilastro non è uno dei tre, se il titolo è un pezzo di frase invece del nome di una cosa, e se un percorso con quel titolo esiste già (in quel caso dice di dire "riprendi X"). Distinta da "aprire un percorso", che sposta il fuoco su uno che esiste già e non crea niente.
- Salvare nel percorso quello che lo Shell ha appena prodotto: "salvalo nel percorso", "tienilo", "mettilo nel percorso attivo". Il testo NON viene riscritto dal modello: lo copia il programma dalla conversazione, per intero, e finisce nei documenti del percorso aperto. La card mostra prima quanto è lungo e come comincia, così si vede se sta per salvare il messaggio giusto. Serve perché la conversazione ha due limiti: lo Shell rivede solo gli ultimi sei messaggi, e sopra i quaranta messaggi i più vecchi escono dalla vista e finiscono in un archivio locale. Un contenuto lungo che resta solo in chat, fra un mese, non è più raggiungibile né dal Ghost né dallo Shell; dentro il percorso sì.
- Rileggere un documento del percorso: "rileggimi l'Atto I", "riprendi i testi che abbiamo salvato", "mostrami quel pezzo". Il programma va a prendere il testo COMPLETO dal percorso aperto e lo mette davanti allo Shell PRIMA che risponda, così ci lavora sopra davvero invece di ricordarlo. Non chiede conferma: leggere non cambia niente. Se più di un documento corrisponde chiede quale, e se non lo trova lo dichiara invece di rispondere a memoria. Un documento molto lungo viene tagliato e la cosa viene detta.
- Il percorso aperto viaggia con il suo fascicolo: quando c'è un percorso aperto (il fuoco), lo Shell riceve a ogni turno i suoi nodi con lo stato, le competenze, la memoria del percorso e l'indice dei documenti. È per questo che "continuiamo con l'Atto III" funziona senza dover rispiegare cos'è stato fatto. Il fuoco scade da solo dopo otto ore.
- Voci gemelle nel log: quando lo Shell scrive da solo una voce in un pilastro e quella voce dice sostanzialmente la stessa cosa di un'altra dello STESSO GIORNO, non ne crea una seconda: aggiorna quella che c'è già, e il testo precedente scende nello storico della voce invece di essere perso. Nel log la voce mostra "N versioni di questa voce" e si tocca per rileggerle tutte. Sotto il messaggio in chat il segno dice "→ VIDYA · 3ª versione" invece di "→ VIDYA", così è visibile che ha aggiornato e non aggiunto. Le voci che contengono una misura (peso, sonno) non vengono mai fuse: due pesate nello stesso giorno sono due dati, non un doppione. Le voci scritte a mano dal Ghost non passano da qui e non vengono mai toccate.
- Fonti di Balthasar, controllate dal programma: quando l'Agorà Magi gira su OpenRouter, Balthasar ha la ricerca web. Sotto la sua risposta compare una riga che dice se la ricerca è stata eseguita DAVVERO — letta dalle citazioni che la risposta porta con sé, non dichiarata dal modello — quante citazioni e da quali domini. Se Balthasar nomina un servizio o un sito che non trova riscontro in nessun dominio realmente citato, compare un avviso di possibile fonte inventata: non blocca niente, è un sospetto da verificare. Esisteva già per la ricerca dei Semi dal 26/07/2026 e da oggi vale anche per l'Agorà. Le sessioni Magi precedenti a oggi non hanno questa riga: non è un errore, quel dato allora non veniva raccolto.
- Cosa vede Balthasar della memoria: la nota corrente di tutti e tre i pilastri PIÙ gli ultimi quattro frammenti di sedimento per pilastro, datati e tagliati a 220 caratteri. Prima vedeva solo le note correnti, quindi non aveva nessuna storia su cui appoggiarsi mentre il suo compito è proprio spingere dove il sistema non è ancora andato.
- Eliminare un percorso dalla lista: in ogni pilastro, sotto Percorsi, ogni percorso ha una ✕ di fianco. Non elimina subito: chiede una volta e dice cosa sta per sparire, contato (quanti nodi, quante sessioni, quanti documenti col loro testo, se ci sono competenze e memoria del percorso). Serve perché da quando i documenti contengono il testo intero, un percorso vale molto più di una voce di log. Resta anche il pulsante "Elimina percorso" dentro il percorso stesso.
- Nodi del percorso: ogni nodo si tocca e si apre, mostrando il materiale che gli è stato legato — i documenti col loro testo intero e le sessioni che lo nominano. Un nodo senza niente lo dichiara invece di aprirsi vuoto. La verifica (il quiz) è diventata un pulsante DENTRO il nodo aperto: prima era l'effetto obbligato del tocco, ora è una scelta.
- Sotto quale nodo finisce quello che si salva: quando il Ghost dice "salvalo nel percorso", il programma confronta il titolo del materiale con le etichette dei nodi e lo lega a quello giusto — con lo spareggio sui numeri, così "Atto I" non finisce sotto "Atto II". Se nessun nodo corrisponde o se due corrispondono allo stesso modo, il documento resta del percorso senza nodo: meglio senza che sotto quello sbagliato.
- Salvare qualcosa detto PRIMA dell'ultimo messaggio: il titolo che si dà al materiale fa anche da riferimento. "Salva i testi dell'Atto I nel percorso" fa cercare al programma, dentro la conversazione, il messaggio che parla dell'Atto I — non prende ciecamente il precedente. Se il riferimento non corrisponde a niente vale il più recente, e la card mostra sempre come comincia ciò che sta per essere salvato.
- Documenti del percorso: nel percorso, sotto "Documenti del percorso", ognuno si tocca e si riapre per intero. Quando il Ghost riapre un percorso, lo Shell riceve l'indice di questo materiale — nome, data, lunghezza, come comincia — non i testi interi: sa che esistono e riparte da lì invece di ricominciare da capo. I documenti creati prima del 31/08/2026 hanno solo il nome, non il testo.
- Andamento misurato (BIO): il programma calcola da solo le serie di peso e sonno dalle voci del log BIO — ultima misura, quanti giorni ha, variazione totale, variazione per settimana, quante misure — e le passa allo Shell e a Simbiosi già calcolate. Compaiono anche in BIO → Log, in un riquadro "Andamento misurato", nella stessa identica forma in cui le riceve il modello. Regola: se una tendenza non è in quel riquadro, il modello non l'ha ricevuta e non deve parlarne. Una misura sola non fa tendenza e viene dichiarata tale; una serie la cui ultima misura ha più di 7 giorni viene marcata "stantia", più di 30 "vecchia", e va detto invece di parlarne come se fosse di oggi. Non serve fare niente per attivarlo: legge i campi Peso e Sonno che le voci BIO hanno già, comprese quelle scritte dallo Shell durante una conversazione.
- Controllo del piano alimentare: quando lo Shell genera un piano con più giorni, il programma lo rilegge e confronta con i vincoli dichiarati. Segnala in un riquadro, senza toccare il piano: alimenti esclusi che compaiono lo stesso (sa che il salmone è un pesce), giorni dichiarati che non ci sono, giorni identici fra loro, la stessa fonte proteica a pranzo e a cena, dosi assenti quando erano state chieste, colazioni dolci quando erano state chieste salate. Non giudica il piano: elenca fatti verificabili, con il giorno preciso.
- Il vincolo AIR chiede, non decide: quando una lettura destinata ad AIR sembra legare l'identità professionale del Ghost al pilastro, il programma non la scrive e non la butta. Compare una card che mostra il dato, dice quale dei due rilevatori ha segnalato — il codice, deterministico sui termini dichiarati; il modello, come seconda opinione — e perché. Due pulsanti: "Va bene, procedi" scrive il dato, "No, lascialo fuori" lo lascia fuori. La risposta resta scritta nel messaggio, quindi la domanda non ricompare domani.
- Catena Printify → Etsy: uno dei modi in cui un Seme AIR può produrre qualcosa nel mondo. Va dal disegno all'anteprima del prodotto.
- Postura e respiro: gli esercizi brevi che l'app propone, con il loro ritorno aptico.
- Piano di controllo conversazionale: l'impianto per cui il Ghost chiede una cosa a parole e il programma la esegue. Il modello sceglie l'azione, il programma la compie. Ha tre parti: il fuoco conversazionale, l'inventario, il registro delle azioni.
- Fuoco conversazionale: il percorso o il Seme su cui si sta lavorando adesso. Compare in una barra sopra la chat, sopravvive a ricarica e riapertura, e scade da solo dopo otto ore. Si chiude con un gesto sulla barra, oppure a parole (vedi chiudi_percorso qui sotto).
- Inventario: l'elenco di percorsi e Semi che lo Shell riceve a ogni turno, così sa cosa esiste davvero senza doverlo indovinare.
- Registro delle azioni: ogni proposta, conferma, esecuzione ed esito, con l'orario. Si legge in Setup. È il posto dove si scopre dopo perché una cosa è andata storta.
- Azioni parlando: dodici azioni che il Ghost può far partire dicendole. Sei interne (aprire o riprendere un percorso, chiudere il percorso aperto, scrivere su un pilastro, creare un Seme, interrogare la memoria, avanzare un percorso) e sei che toccano il mondo fuori (creare un evento, leggere il calendario, trovare quando è un appuntamento preciso, cancellare un evento, spostare un evento a un altro giorno o ora, inviare una mail). Le sei esterne nascono spente e si accendono in Setup, una per una; le sei interne nascono accese.
- Aprire, chiudere e riprendere un percorso, tutto a parole: "apri X" o "riprendi X" porta il fuoco su un percorso o un Seme che esiste già (non ne crea uno nuovo); "chiudi questo", "chiudiamo qui", "basta per oggi" chiude il fuoco senza cancellare né archiviare niente — il percorso resta intatto con tutta la sua storia, smette solo di essere quello su cui si sta lavorando adesso; "e adesso?", "andiamo avanti" chiede il prossimo passo su quello aperto. Ogni comando mostra una card di conferma prima di eseguire, con l'etichetta di ciò che è davvero aperto in quel momento.
- Interruttori: gli accendi-e-spegni delle capacità che toccano il mondo fuori, in Setup. Lo Shell riceve a ogni turno l'elenco vero di cosa è acceso e cosa è spento adesso, quindi non deve indovinarlo. Se dichiara spenta una capacità che è accesa, il programma toglie la frase e avvisa il Ghost.
- Leggere il calendario: lo Shell va a leggere davvero gli impegni dal Calendar del Ghost. Non chiede conferma — leggere non cambia niente — e l'unico gate è l'interruttore. Il programma sceglie l'azione, legge, e solo dopo genera la risposta, così parla di impegni che ha in mano. Se la lettura fallisce lo dichiara con il motivo tecnico invece di indovinare.
- Trovare quando è un appuntamento preciso: diversa da "leggere il calendario" (quella legge un periodo intero). Questa cerca UN evento per nome — stessa ricerca già usata per cancellare e spostare — e dice solo quando è, senza offrire di toccarlo. Se ne trova più d'uno chiede di essere più preciso; se non lo trova lo dice. Anche qui la data la scrive il programma dopo averla letta, non il modello a memoria.
- L'elenco degli impegni lo compone il programma: quando c'è stata una lettura, l'elenco che compare nel messaggio lo scrive il codice dagli eventi letti, non lo Shell. Allo Shell resta la cornice: introdurre, collegare, commentare. Un evento che non è nella lettura non può comparire; uno che c'è non può mancare.
- Contenuti di calendario senza lettura: se in un turno non c'è stata una lettura, il programma toglie dalla risposta qualunque appuntamento, orario o affermazione del tipo "non hai altri impegni", e un riquadro elenca cosa ha tolto. Se una lettura c'è stata, toglie solo ciò che non proviene da quella lettura.
- Periodi in parole: "prossimi 7 giorni", "nei prossimi tre giorni", "questo weekend", "questa settimana" vengono risolti a partire da oggi, e il numero di giorni detto vale.
- Creare un evento sul calendario: si conferma con un pulsante prima che accada. La data la calcola il programma dalle parole del Ghost, e la mostra per esteso.
- L'ora si ricava due volte: il programma la calcola dal testo, il modello la riporta per conto suo. Se coincidono l'evento si può creare; se divergono la card non ha nessun pulsante e non si scrive niente. Le forme parlate sono capite: "16 e 30", "le quattro e mezza del pomeriggio", "le otto meno un quarto", "a mezzogiorno e mezzo".
- Verifica dopo la scrittura: creato un evento, il sistema lo rilegge e confronta ciò che ha mandato con ciò che trova. Il confronto è fra istanti, non fra stringhe. Tre esiti: verificata, non-combacia (e viene detto cosa: atteso X, trovato Y), non-verificabile.
- Cancellare un evento: il Ghost dice quale a parole, il programma lo cerca sul calendario e mostra su una card l'evento trovato con giorno, ora e titolo letti da Google, più un pulsante. Se ne trova più d'uno chiede quale; se non ne trova nessuno lo dice. Dopo, rilegge per verificare che sia sparito. Cancellare non si disfa, quindi il pulsante serve sempre.
- Spostare un evento a un altro giorno o ora: il Ghost dice quale evento e a quando a parole, il programma lo cerca sul calendario (stessa ricerca della cancellazione) e mostra su una card il bersaglio trovato con giorno/ora attuali e il nuovo giorno/ora proposto, letti da Google, più un pulsante. Il nuovo orario si ricava due volte come nella creazione — dal testo e dal modello — e se divergono la card non ha pulsante. Se trova più eventi che corrispondono chiede quale; se non ne trova nessuno lo dice. Dopo, rilegge per verificare che il nuovo orario sia quello confermato. MODIFICARE il titolo o la descrizione di un evento resta invece impossibile: quello si fa cancellando il vecchio e creandone uno nuovo.
- Inviare una mail: si conferma dopo aver visto il testo integrale e l'indirizzo per esteso. Una mail inviata non torna indietro. Un invio senza risposta resta "incerto" e non viene mai rispedito da solo.
- Proposte senza pulsante: una card che non ha un pulsante che esegue non conta come proposta in attesa, quindi non impedisce alle richieste successive di produrre la loro card. Se il Ghost risponde a una card scrivendo in chat invece di premere, il programma glielo dice indicando la card: una parola scritta non fa partire niente, mai.
- Il registro delle azioni dichiara per ogni azione che effetto ha (lettura o scrittura), se richiede un gate e se è reversibile, e il programma legge davvero quei tre campi. Una scrittura chiede sempre conferma; una lettura può non chiederla.
- Riquadro tecnico grezzo: sotto ogni card che tocca Google compare il codice HTTP, l'identificativo restituito e l'eventuale errore. Lo stesso in Setup. Serve al Ghost per mandare un fatto invece di un'impressione.
- Forma delle risposte: la lunghezza e il registro vengono dal profilo cognitivo del Ghost, non da una regola generale del sistema.
- Memoria procedurale: la nota che ogni pilastro accumula sugli scambi, riscritta per intero a ogni aggiornamento e non aggiunta in coda. Ha un sedimento storico e delle parole chiave per ritrovarla.
- Tetto di spesa (Setup): raggiunti 5 dollari nel mese si fermano solo le cose che partono da sole — Semi che avanzano, Simbiosi. La chat resta utilizzabile.
- Genera documento da questa conversazione: un pulsante sopra la chat trasforma quanto concordato parlando in un file .docx vero. Il programma rilegge la conversazione, ne estrae la versione FINALE (non le versioni intermedie scartate) e i vincoli dichiarati, li mostra in anteprima, e poi lo salva su Drive o lo scarica. Agganciarlo a un percorso è FACOLTATIVO: serve solo per ritrovarlo dentro l'app: se il Ghost non sceglie nessun percorso il file viene comunque prodotto e consegnato, e il programma glielo dice. Quando il contenuto è una griglia — giorni per pasti, settimane per esercizi — nel documento diventa una TABELLA vera, con righe e colonne, non i trattini e le barrette che la simulano in chat.
- Ripresa della richiesta interrotta: se il Ghost esce dall'app mentre una risposta sta arrivando, il telefono sospende la scheda e la richiesta muore (l'app non ha un server che la tenga in mano al posto suo). La richiesta però viene messa da parte prima di partire, e quando il Ghost torna sull'app riparte da sola, senza doverla riscrivere — solo se è morta per un guasto di RETE e solo entro quindici minuti. NON significa "la trovi già pronta al ritorno": per quello servirebbe un server che tenga la richiesta, non ancora costruito.
- Backup e ripristino (Setup): scarica in un unico file tutto lo stato locale e sa rileggerlo. La chiave API non finisce mai nel file. Il ripristino sostituisce i dati del dispositivo previa conferma.
Capacità NON disponibili in questa app: notifiche push; promemoria o azioni che si attivano da soli senza che il Ghost apra l'app; invio automatico di messaggi, mail o post senza la sua conferma esplicita su quello specifico invio; MODIFICARE il titolo o la descrizione di un evento del calendario (spostarlo a un altro giorno o ora invece si può); pubblicazione automatica su social o piattaforme esterne; esecuzione di un passo di un Seme oltre il gate di sicurezza senza sblocco manuale del Ghost.`;

//──────────────────────────────────────────────────────────
// SHELL — ciclo di percezione-azione (Manifesto V3 §3: accoppiamento continuo, non predici-e-verifica)
//──────────────────────────────────────────────────────────
// BRACCIO 1 — Bozze pronte da copiare. Lo Shell prepara, il Ghost esegue (Legge 8, Livello 1).
// §4 del brief del 17/08 — DIAGNOSI, non ipotesi: questa card non e' un residuo, e' una feature
// vera (Braccio Bozze), che si accende dal suo interruttore in Setup. Il difetto e' che scattava
// troppo facilmente: al Ghost bastava nominare una persona ("Torquato", "Marianno") mentre chiedeva
// un promemoria PER SE', e il modello ci leggeva un destinatario terzo.
// Due correzioni, una a costo zero e una nel prompt:
//  · sotto, una porta a costo zero che non fa nemmeno partire la chiamata quando il messaggio e'
//    una richiesta rivolta a se stessi (un promemoria, un appuntamento, una nota);
//  · qui, l'esclusione scritta a chiare lettere.
const RICHIESTA_PER_SE = /\b(promemoria|ricordami|ricordarmi|segnami|segna|annota|appuntamento|in agenda|sul calendario|al calendario|fissa|fissami|prenota|nota che|mettimi)\w*/i;
function meritaBozza(messaggio) { return !RICHIESTA_PER_SE.test(String(messaggio || "")); }
async function draftIfNeeded(recentText, settings) {
  const data = await askModelJSON(
    `Sei lo Shell. Leggi lo scambio e determina se il Ghost sta chiedendo — esplicitamente o implicitamente — di preparare un testo pronto da INVIARE A QUALCUN ALTRO fuori da questa chat: un'email a una persona reale, un messaggio a un contatto, uno script destinato a un video pubblico, un post social da pubblicare. Serve un destinatario terzo IDENTIFICABILE (una persona, un pubblico, una piattaforma) — non basta che il Ghost e lo Shell stiano discutendo un'idea tra loro in chat, quello NON è una bozza da preparare.
ESCLUSIONE IMPORTANTE: se il Ghost sta chiedendo qualcosa PER SE STESSO — un promemoria, un appuntamento da segnare, una nota da tenere — NON è una bozza, anche se nel testo compare il nome di una persona. "Fissami un promemoria per la cena con Marta" non è una bozza di messaggio a Marta: è un promemoria per lui. Serve che il Ghost voglia MANDARE un testo a qualcuno, non che nomini qualcuno.
Se non c'è un destinatario terzo chiaro, {"needed": false}.
Se sì, scrivi il testo COMPLETO e pronto all'uso, non un'idea o una scaletta. JSON: {"needed": true, "type": "email|messaggio|script|post", "recipient": "breve descrizione del destinatario", "subject": "solo se email, altrimenti omesso", "body": "testo completo pronto"} oppure {"needed": false}`,
    recentText, 0.5, 1300, settings // 1300 (era 700): una bozza completa in JSON troncava e andava persa in silenzio
  );
  return (data?.needed && data?.recipient) ? data : null;
}
// ══════════════════════════════════════════════════════════════════════════════
// SUPERFICIE DIAGNOSTICA GREZZA (17/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 17/08 il Ghost ha dovuto scoprire da uno screenshot del suo calendario che il sistema aveva
// mentito. Non aveva nessun modo di vedere cosa fosse davvero successo sulla rete.
// Qui ogni chiamata verso Google lascia una traccia NON filtrata: metodo, indirizzo, codice HTTP
// restituito, identificativo dell'oggetto se c'e', messaggio d'errore testuale se c'e'.
// Va nel registro di debug E si mostra in chat sotto la card, marcata come dato tecnico.
// Non e' una frase raccontata: e' il fatto. Se il Ghost me la incolla, io so cosa e' successo.
const ULTIME_CHIAMATE_KEY = "ultime-chiamate-google";
const ULTIME_CHIAMATE_TETTO = 20;
function registraChiamataGrezza(voce) {
  const n = [{ ...voce, quando: new Date().toISOString() }, ...loadKey(ULTIME_CHIAMATE_KEY, [])].slice(0, ULTIME_CHIAMATE_TETTO);
  saveKey(ULTIME_CHIAMATE_KEY, n);
  return n[0];
}
function leggiChiamateGrezze() { const v = loadKey(ULTIME_CHIAMATE_KEY, []); return Array.isArray(v) ? v : []; }
function formatChiamataGrezza(c) {
  if (!c) return "";
  return [
    `${c.metodo} ${c.indirizzo}`,
    `HTTP ${c.stato ?? "(nessuna risposta)"}${c.statoTesto ? " " + c.statoTesto : ""}`,
    c.idRestituito ? `id restituito da Google: ${c.idRestituito}` : "id restituito da Google: NESSUNO",
    c.riautenticazione ? `PRIMA Google aveva risposto ${c.riautenticazione.stato} e il sistema ha richiesto il login (se ${c.riautenticazione.stato} = 403, di solito manca un permesso, non il login)` : null,
    c.errore ? `errore: ${c.errore}` : null,
    `quando: ${c.quando}`,
  ].filter(Boolean).join("\n");
}
// Ogni chiamata a Google passa da qui invece che da driveFetch nudo: cosi' non esiste una strada
// che scriva sul calendario senza lasciare traccia dell'esito grezzo.
async function chiamataGoogleTracciata(etichetta, url, options = {}) {
  const metodo = options.method || "GET";
  ULTIMO_RIAUTH = null;
  let res = null, corpo = null, errore = null;
  try {
    res = await driveFetch(url, options);
    corpo = await res.json().catch(() => null);
    if (corpo?.error) errore = corpo.error.message || JSON.stringify(corpo.error);
    else if (!res.ok) errore = `risposta non riuscita (${res.status})`;
  } catch (e) {
    errore = e.message || String(e);
  }
  const grezza = registraChiamataGrezza({
    etichetta, metodo, indirizzo: url.replace(/\?.*$/, ""),
    stato: res ? res.status : null, statoTesto: res ? res.statusText : "",
    idRestituito: corpo?.id || null, errore,
    riautenticazione: ULTIMO_RIAUTH,   // se c'e', Google aveva prima risposto 401/403
  });
  return { ok: !!res && res.ok && !corpo?.error, stato: res ? res.status : null, corpo, errore, grezza };
}
// BRACCIO CALENDAR — lo Shell propone un evento strutturato, il Ghost conferma prima che venga
// scritto su Google Calendar (Legge 8 — mai scrittura automatica).
// Calendar API — riusa lo stesso token OAuth di Drive (driveFetch aggiunge già Bearer + retry su 401/403);
// serve solo che lo scope combinato includa anche calendar (vedi CONFIG.GOOGLE_DRIVE_SCOPE).
async function createCalendarEvent(proposal) {
  const body = {
    summary: proposal.title,
    description: proposal.notes || "",
    start: proposal.allDay ? { date: proposal.startISO.slice(0, 10) } : { dateTime: proposal.startISO, timeZone: "Europe/Rome" },
    end: proposal.allDay ? { date: (proposal.endISO || proposal.startISO).slice(0, 10) } : { dateTime: proposal.endISO || proposal.startISO, timeZone: "Europe/Rome" },
  };
  const r = await chiamataGoogleTracciata("calendario-scrittura", "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (r.errore) { const e = new Error(r.errore); e.grezza = r.grezza; throw e; }
  const data = r.corpo || {};
  data.__grezza = r.grezza;
  return data;
}
// LETTURA del calendario — l'azione che mancava del tutto (§3 del brief del 17/08). Finche' non
// c'era, "cosa ho domani?" era conversazione libera: il modello rispondeva da cio' che ricordava di
// aver detto in chat, e ha spacciato per impegno reale una proposta abbandonata trenta messaggi
// prima. Qui si interroga Google davvero, per un intervallo, e se la chiamata non riesce lo si
// dichiara invece di rispondere lo stesso.
async function leggiEventiDalCalendario(inizioISO, fineISO) {
  const params = new URLSearchParams({
    timeMin: new Date(inizioISO).toISOString(),
    timeMax: new Date(fineISO).toISOString(),
    singleEvents: "true", orderBy: "startTime", maxResults: "25",
  });
  const r = await chiamataGoogleTracciata("calendario-lettura", `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
  if (!r.ok) return { ok: false, motivo: r.errore || `il calendario ha risposto ${r.stato}`, grezza: r.grezza };
  const eventi = (r.corpo?.items || [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => ({
      id: e.id,
      titolo: e.summary || "(senza titolo)",
      inizio: e.start?.dateTime || e.start?.date || "",
      tuttoIlGiorno: !!e.start?.date,
      link: e.htmlLink || "",
    }));
  return { ok: true, eventi, grezza: r.grezza };
}
// ══════════════════════════════════════════════════════════════════════════════
// GLI IMPEGNI VERI ENTRANO NEL PROMPT PRIMA CHE IL MODELLO SCRIVA (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// E' la chiusura del difetto del 22/08. Fin qui il modello, mentre scriveva, non aveva MAI il
// calendario: la risposta si generava per prima, l'azione veniva scelta dopo e la lettura avveniva
// dopo ancora, solo su un tocco, e finiva in una card che il modello non vedeva. Da li' venivano
// sia gli appuntamenti inventati (misurati: 3 giri su 8) sia la frase contraddittoria del 13:29,
// "ecco cosa ho trovato... non ho accesso alle informazioni del calendario" — che non era un
// errore del modello ma la fotografia esatta della sua situazione: gli era stato chiesto di
// riferire qualcosa che nessuno gli aveva dato.
// Adesso l'ordine e' rovesciato per le sole azioni di lettura, e il modello riceve un dato in
// entrambe le direzioni: gli impegni veri quando la lettura riesce, il fallimento quando fallisce.
// Sul fallimento smette di indovinare — e prima indovinava, l'avevo misurato.
// Il gemello, per la cancellazione: dice al modello COSA il programma ha trovato, cosi' non deve
// indovinare quale evento il Ghost intendesse ne' fingere di poterlo cancellare da solo.
function formatBersaglioCancellazione(b) {
  if (!b) return "";
  if (b.esito === "spenta") return `\nIL GHOST HA CHIESTO DI CANCELLARE UN APPUNTAMENTO, ma ${b.motivo}. Diglielo, e digli che puo' accenderla in Setup. Non elencare niente e non promettere niente.`;
  if (b.esito === "lettura-fallita") return `\nIL GHOST HA CHIESTO DI CANCELLARE UN APPUNTAMENTO, ma non sono riuscito a leggere il calendario per trovarlo: ${b.motivo}. Dichiaralo cosi' com'e'. Non dire quale evento sia, perche' non lo sai.`;
  if (b.esito === "non-trovato") return `\nIL GHOST HA CHIESTO DI CANCELLARE UN APPUNTAMENTO. Ho letto il calendario e ${b.motivo}. Diglielo con queste parole: non c'e' niente da cancellare. Non proporre alternative che non esistono.`;
  if (b.esito === "ambiguo") {
    const elenco = b.candidati.map((e) => `- ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`).join("\n");
    return `\nIL GHOST HA CHIESTO DI CANCELLARE UN APPUNTAMENTO e ne ho trovati piu' d'uno che corrispondono. Il programma glieli sta mostrando con un pulsante ciascuno. Tu limitati a dirgli che ce n'e' piu' d'uno e che scelga quale. Questi sono, letti da Google adesso:
${elenco}`;
  }
  const e = b.bersaglio;
  return `\nIL GHOST HA CHIESTO DI CANCELLARE UN APPUNTAMENTO. Ho letto il calendario e l'ho trovato: ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}. Il programma gli sta mostrando la card con il pulsante per cancellarlo: TU NON CANCELLI NIENTE e non dire di averlo fatto. Di' solo quale evento hai trovato, e che basta il pulsante. Cancellare non si disfa.`;
}
// Il parametro di sposta_evento_calendario arriva come "quale | nuovo quando", stessa forma di
// "titolo | quando" per la creazione. Si spezza in un solo posto, usato sia dalla ricerca anticipata
// (che ha bisogno solo di "quale") sia da preparaClasseB (che ha bisogno di entrambi).
function parseParametroSpostamento(grezzo) {
  const pezzi = String(grezzo || "").split("|");
  return { descrizione: (pezzi[0] || "").trim(), quandoDetto: pezzi.slice(1).join("|").trim() };
}
// Il gemello di formatBersaglioCancellazione, per lo spostamento (24/08/2026). Dice al modello COSA
// il programma ha trovato e DOVE sta per spostarlo, cosi' non deve indovinare l'uno ne' l'altro ne'
// fingere di averlo gia' fatto.
function formatBersaglioSpostamento(b) {
  if (!b) return "";
  if (b.esito === "spenta") return `\nIL GHOST HA CHIESTO DI SPOSTARE UN APPUNTAMENTO, ma ${b.motivo}. Diglielo, e digli che puo' accenderla in Setup. Non elencare niente e non promettere niente.`;
  if (b.esito === "lettura-fallita") return `\nIL GHOST HA CHIESTO DI SPOSTARE UN APPUNTAMENTO, ma non sono riuscito a leggere il calendario per trovarlo: ${b.motivo}. Dichiaralo cosi' com'e'. Non dire quale evento sia, perche' non lo sai.`;
  if (b.esito === "non-trovato") return `\nIL GHOST HA CHIESTO DI SPOSTARE UN APPUNTAMENTO. Ho letto il calendario e ${b.motivo}. Diglielo con queste parole: non c'e' niente da spostare. Non proporre alternative che non esistono.`;
  if (b.esito === "ambiguo") {
    const elenco = b.candidati.map((e) => `- ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`).join("\n");
    return `\nIL GHOST HA CHIESTO DI SPOSTARE UN APPUNTAMENTO e ne ho trovati piu' d'uno che corrispondono. Il programma glieli sta mostrando con un pulsante ciascuno. Tu limitati a dirgli che ce n'e' piu' d'uno e che scelga quale. Questi sono, letti da Google adesso:
${elenco}`;
  }
  const e = b.bersaglio;
  return `\nIL GHOST HA CHIESTO DI SPOSTARE UN APPUNTAMENTO. Ho letto il calendario e l'ho trovato: ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}. Il programma gli sta mostrando la card con il nuovo giorno/ora proposto e il pulsante per confermarlo: TU NON SPOSTI NIENTE e non dire di averlo fatto. Di' solo quale evento hai trovato, e che basta il pulsante.`;
}
function formatLetturaCalendario(lettura) {
  if (!lettura) return "";
  if (lettura.saltata) {
    return `\nIL CALENDARIO NON E' STATO LETTO in questo turno, e il motivo e' questo: ${lettura.motivo}. Non hai nessun dato sugli impegni del Ghost. Dillo con quel motivo, e non elencare niente: qualunque appuntamento tu scrivessi te lo staresti ricordando dalla conversazione, non leggendo dalla sua agenda. Il programma toglie comunque dal tuo testo qualunque impegno tu nomini, e avvisa il Ghost che l'avevi scritto.`;
  }
  if (!lettura.ok) {
    return `\nLA LETTURA DEL CALENDARIO E' FALLITA in questo turno. Motivo tecnico: ${lettura.motivo || "la richiesta non e' riuscita"}. Questo e' un DATO, non una tua impressione: dichiaralo al Ghost cosi' com'e'. Non tirare a indovinare cosa ha in programma e non elencare niente — non lo sai, e stavolta lo sai di non saperlo.`;
  }
  const quando = lettura.etichetta ? ` per il periodo: ${lettura.etichetta}` : "";
  if (!lettura.eventi?.length) {
    return `\nIL CALENDARIO E' STATO LETTO DAVVERO ADESSO${quando}, e non contiene nessun impegno. Questo e' un fatto letto da Google in questo turno, non una deduzione: puoi dire al Ghost che non ha niente in programma, ed e' vero.`;
  }
  const elenco = lettura.eventi.map((e) => `- ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`).join("\n");
  // ATTENZIONE alla forma di questo blocco, non solo al contenuto: la prima versione cominciava con
  // una frase in maiuscolo che suonava come un annuncio, e il modello l'ha RICOPIATA di peso dentro
  // la risposta ("IL CALENDARIO E' STATO LETTO DAVVERO ADESSO per il periodo..."). Un'istruzione
  // scritta come un titolo si fa ricopiare. Adesso e' scritta come un'istruzione.
  return `\nDato interno, per te soltanto: il calendario e' stato letto adesso da Google${quando}, e contiene questi impegni.
${elenco}
Non ripetere questa riga di intestazione e non elencare gli impegni uno per uno: all'elenco ci pensa il programma, che lo scrive sotto la tua risposta prendendolo dagli stessi dati. Tu inquadra e commenta — quanti sono, se cambia qualcosa per il Ghost, cosa si lega a quello di cui state parlando — in una o due frasi. Sono ${lettura.eventi.length === 1 ? "l'unico impegno" : `i ${lettura.eventi.length} impegni`} del periodo, non ce ne sono altri, e non nominarne nessuno che non sia qui sopra. Non dire "vado a guardare": ci sei gia' andato.`;
}
// 25/08/2026 — il gemello di formatLetturaCalendario, per trova_evento_calendario: non un
// periodo intero, UN evento preciso trovato per nome. Stessa regola: il modello inquadra e
// commenta, la data esatta la scrive il programma sotto, presa dagli stessi dati.
function formatBersaglioRicerca(r) {
  if (!r) return "";
  if (r.esito === "spenta") return `\nIL GHOST HA CHIESTO QUANDO E' UN APPUNTAMENTO PRECISO, ma ${r.motivo}. Diglielo, e digli che puo' accenderla in Setup. Non elencare niente e non inventare un orario.`;
  if (r.esito === "lettura-fallita") return `\nIL GHOST HA CHIESTO QUANDO E' UN APPUNTAMENTO PRECISO, ma non sono riuscito a leggere il calendario per cercarlo: ${r.motivo}. Dichiaralo cosi' com'e'. Non dire quando sia, perche' non lo sai.`;
  if (r.esito === "non-trovato") return `\nIL GHOST HA CHIESTO QUANDO E' UN APPUNTAMENTO PRECISO. Ho cercato sul calendario e ${r.motivo}. Diglielo con queste parole: non l'ho trovato. Non inventare un orario e non proporre alternative che non esistono.`;
  if (r.esito === "ambiguo") {
    const elenco = r.candidati.map((e) => `- ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`).join("\n");
    return `\nDato interno, per te soltanto: il Ghost ha chiesto quando e' un appuntamento preciso, e ne ho trovati piu' d'uno che corrispondono — non elencarli tu, ci pensa il programma:
${elenco}
Digli solo che ce n'e' piu' d'uno e che sia piu' preciso su quale intende.`;
  }
  const e = r.bersaglio;
  return `\nDato interno, per te soltanto: il Ghost ha chiesto quando e' un appuntamento preciso, e l'ho cercato e trovato davvero su Google adesso: ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}. Non ripetere questa riga e non scrivere tu la data: il programma la scrive sotto la tua risposta, presa dagli stessi dati. Tu inquadra e commenta in una frase — non dire "vado a cercare" o "sto cercando": l'ho gia' cercato, e' fatto.`;
}
// Il gemello di componiElencoImpegni: la risposta che il CODICE compone per trova_evento_calendario,
// aggiunta sotto la cornice del modello. La data non la scrive mai il modello, sempre il programma.
function componiRisultatoRicerca(r) {
  if (!r) return null;
  // 25/08/2026 — anche "spenta" e "lettura-fallita" scrivono una riga, non solo i tre esiti che
  // hanno un dato da mostrare. E' lo stesso principio di dichiaraFallimentoLettura: il modello
  // riceve l'istruzione di dichiararlo da solo, ma non ci si affida solo a quello — il caso
  // osservato oggi era esattamente "il modello promette di cercare e poi non dice piu' niente".
  if (r.esito === "spenta") return `[non ho cercato: ${r.motivo}. La accendi in Setup.]`;
  if (r.esito === "lettura-fallita") return `[non sono riuscito a cercare sul calendario: ${r.motivo}. Quindi non so quando sia, e non te lo dico a indovinare.]`;
  if (r.esito === "non-trovato") return `Non ho trovato niente che assomigli a quello che cercavi, fra i tuoi impegni dei prossimi ${FINESTRA_RICERCA_BERSAGLIO_GIORNI} giorni.`;
  if (r.esito === "ambiguo") {
    const righe = r.candidati.map((e) => `· ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)} — ${e.titolo}`);
    return `Ne ho trovati più d'uno che assomigliano:\n${righe.join("\n")}`;
  }
  const e = r.bersaglio;
  return `Trovato: **${e.titolo}** — ${formatDataPerEsteso(e.inizio, e.tuttoIlGiorno)}.`;
}
// ══════════════════════════════════════════════════════════════════════════════
// TROVARE UN EVENTO GIA' ESISTENTE — CANCELLARLO O SPOSTARLO CONDIVIDONO LA STESSA RICERCA
// ══════════════════════════════════════════════════════════════════════════════
// Stessa disciplina di tutto il resto: il modello dice a parole quale evento intende, il PROGRAMMA
// va a cercarlo davvero, e cio' che il Ghost vede sulla card e' l'evento letto da Google — giorno,
// ora, titolo — non una ricostruzione. Se il modello si sbaglia sul nome, non trova niente e non
// succede niente: non c'e' nessun percorso in cui un evento viene toccato senza che il programma
// l'abbia prima letto e mostrato.
// 24/08/2026 — QUESTA RICERCA NON APPARTIENE PIU' SOLO ALLA CANCELLAZIONE. Spostare un evento parte
// dallo stesso identico problema — "quale evento, fra quelli veri, intendeva il Ghost?" — quindi usa
// la stessa funzione. trovaEventoDaCancellare resta col suo nome per non toccare chi la chiama gia',
// ma il corpo e' condiviso: e' un solo posto dove il criterio di ricerca puo' sbagliare, non due.
const FINESTRA_RICERCA_BERSAGLIO_GIORNI = 90;
// Quanto una descrizione somiglia a un evento. Non serve una somiglianza fine: serve non sbagliare
// bersaglio. Un titolo che contiene una parola della descrizione vale; un giorno nominato vale;
// e chi ha piu' riscontri vince. A parita' non si sceglie: si chiede.
function punteggioBersaglio(descrizione, evento, adesso = new Date()) {
  const d = senzaAccenti(descrizione);
  // 25/08/2026 — DIFETTO REALE, osservato due volte (Luigino/Marzio): le parole di RUMORE_BERSAGLIO_RE
  // ("appuntamento", "con", "calendario"...) sono connettivi di dominio che compaiono in QUALSIASI
  // richiesta di questo tipo — quindi in qualsiasi titolo che le contenga. Un evento chiamato
  // "appuntamento con Marzio" vinceva anche quando si cercava "Luigino", perche' quelle due parole
  // gli davano punti che il bersaglio vero non aveva modo di pareggiare. La prima correzione (PR
  // #55) puliva la frase SOLO nella scorciatoia diretta — non bastava, perche' la stessa ricerca la
  // fa anche il percorso col modello (che puo' copiare "l'appuntamento con Luigino" invece del solo
  // nome) e chi cancella/sposta. Qui e' la sede giusta: la pulizia vale per CHIUNQUE chiami questa
  // funzione, indipendentemente da chi ha costruito la descrizione.
  const parole = d.replace(RUMORE_BERSAGLIO_RE, " ").split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 3);
  const titolo = senzaAccenti(evento.titolo || "");
  let punti = 0;
  for (const p of parole) if (titolo.includes(p)) punti += 3;
  const data = new Date(String(evento.inizio || ""));
  if (!Number.isNaN(data.getTime())) {
    if (d.includes(senzaAccenti(GIORNI_IT[data.getDay()]))) punti += 2;
    if (d.includes(senzaAccenti(MESI_IT[data.getMonth()])) && d.includes(String(data.getDate()))) punti += 3;
    const base = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
    const giorniDaOggi = Math.round((new Date(data.getFullYear(), data.getMonth(), data.getDate()) - base) / 86400000);
    if (/\bdomani\b/.test(d) && giorniDaOggi === 1) punti += 3;
    if (/\boggi\b/.test(d) && giorniDaOggi === 0) punti += 3;
    if (/\bdopodomani\b/.test(d) && giorniDaOggi === 2) punti += 3;
  }
  const oraDetta = estraiOrario(descrizione);
  if (oraDetta.ok && !evento.tuttoIlGiorno && !Number.isNaN(data.getTime())
      && data.getHours() === oraDetta.ore && data.getMinutes() === oraDetta.minuti) punti += 3;
  return punti;
}
// Cerca il bersaglio LEGGENDO davvero il calendario. Tre esiti, e nessuno di essi tocca niente:
// trovato (uno solo), ambiguo (piu' d'uno a pari merito), non-trovato. Usata sia da chi cancella
// sia da chi sposta: nessuno dei due sceglie un evento senza che sia stato letto e mostrato.
async function trovaEventoBersaglio(descrizione, adesso = new Date()) {
  const inizio = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const fine = new Date(inizio.getTime() + FINESTRA_RICERCA_BERSAGLIO_GIORNI * 86400000);
  const letto = await leggiEventiDalCalendario(isoLocale(inizio), isoLocale(fine)).catch((e) => ({ ok: false, motivo: e.message }));
  if (!letto.ok) return { esito: "lettura-fallita", motivo: letto.motivo, grezza: letto.grezza };
  const eventi = letto.eventi || [];
  if (!eventi.length) return { esito: "non-trovato", motivo: `sul calendario non c'è nessun impegno nei prossimi ${FINESTRA_RICERCA_BERSAGLIO_GIORNI} giorni`, eventi, grezza: letto.grezza };
  const conPunti = eventi.map((e) => ({ evento: e, punti: punteggioBersaglio(descrizione, e, adesso) })).filter((x) => x.punti > 0);
  if (!conPunti.length) return { esito: "non-trovato", motivo: `non ho trovato niente che somigli a "${String(descrizione).trim()}" fra i tuoi impegni`, letti: eventi.length, eventi, grezza: letto.grezza };
  conPunti.sort((a, b) => b.punti - a.punti);
  const migliori = conPunti.filter((x) => x.punti === conPunti[0].punti);
  if (migliori.length > 1) return { esito: "ambiguo", candidati: migliori.map((x) => x.evento), eventi, grezza: letto.grezza };
  return { esito: "trovato", bersaglio: migliori[0].evento, eventi, grezza: letto.grezza };
}
async function trovaEventoDaCancellare(descrizione, adesso = new Date()) { return trovaEventoBersaglio(descrizione, adesso); }
async function trovaEventoDaSpostare(descrizione, adesso = new Date()) { return trovaEventoBersaglio(descrizione, adesso); }
// La cancellazione vera, con la verifica di ritorno. Stessa forma della scrittura: si esegue, poi si
// RILEGGE dalla fonte per sapere se e' davvero sparito, invece di fidarsi del codice di risposta.
// Google risponde 410 se l'evento era gia' stato cancellato: e' un successo, non un errore.
async function cancellaEventoConVerifica(eventoId, chiave) {
  const gia = leggiEsecuzione(chiave);
  if (gia && (gia.stato === "verificata" || gia.stato === "eseguita")) return { esito: "gia-eseguita", idEsterno: eventoId };
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventoId)}`;
  const r = await chiamataGoogleTracciata("calendario-cancellazione", url, { method: "DELETE" });
  if (!r.ok && r.stato !== 410) {
    return { esito: "fallita", motivo: r.errore || `il calendario ha risposto ${r.stato}`, grezza: r.grezza };
  }
  segnaEsecuzione(chiave, { stato: "eseguita", idEsterno: eventoId });
  // La verifica: si va a rileggere quell'id. Se non c'e' piu', o risulta cancellato, e' andata.
  const v = await chiamataGoogleTracciata("calendario-verifica-cancellazione", url);
  const sparito = v.stato === 404 || v.stato === 410 || v.corpo?.status === "cancelled";
  if (sparito) {
    segnaEsecuzione(chiave, { stato: "verificata", idEsterno: eventoId });
    return { esito: "verificata", grezza: v.grezza };
  }
  if (v.ok) return { esito: "ancora-presente", motivo: "l'ho cancellato ma rileggendolo risulta ancora sul calendario", grezza: v.grezza };
  return { esito: "non-verificabile", motivo: v.errore || `la rilettura ha risposto ${v.stato}`, grezza: v.grezza };
}
// BRACCIO EMAIL — invio reale via Gmail, stesso token OAuth già in uso per Drive/Calendar (driveFetch).
// Richiede lo scope gmail.send aggiunto a CONFIG.GOOGLE_DRIVE_SCOPE (vedi config.js) — senza quello
// scope, Google risponde 403 e driveFetch lo tratta come le altre chiamate autenticate.
// Mai automatico (Legge 8): sia il canale feedback (indirizzo fisso, nessuna bozza AI in mezzo) sia
// l'invio da Arms (indirizzo scelto e confermato dal Ghost, mai dedotto) passano da qui SOLO dopo
// un'azione umana esplicita — vedi FeedbackWidget e confirmEmailSend in ShellView.
function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function buildRawEmail(to, subject, body) {
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject || "")))}?=`;
  const message = [`To: ${to}`, `Subject: ${encodedSubject}`, `Content-Type: text/plain; charset=UTF-8`, ``, body].join("\r\n");
  return base64UrlEncode(message);
}
async function sendGmail(to, subject, body) {
  const r = await chiamataGoogleTracciata("mail-invio", "https://www.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
  });
  if (r.errore) { const e = new Error(r.errore); e.grezza = r.grezza; throw e; }
  const data = r.corpo || {};
  data.__grezza = r.grezza;
  return data;
}

//──────────────────────────────────────────────────────────
// BLOCCO 3 — CLASSE B: calendario e posta (16/08/2026)
//──────────────────────────────────────────────────────────
// Quattro pezzi, e nessuno dei quattro e' decorativo:
//  1. le date le calcola il CODICE, mai il modello (§3 del piano: "martedi' prossimo" e' l'errore
//     piu' frequente dei modelli e il piu' invisibile — invisibile perche' la risposta sembra giusta);
//  2. dopo ogni azione esterna si RILEGGE il risultato dalla fonte e lo si mostra (§3.1). Se la
//     rilettura non riesce, si dichiara fallimento: mai dire "fatto" per cio' che non si e' riletto;
//  3. IDEMPOTENZA (§3.2): la chiave nasce alla proposta, e prima di rifare si guarda se risulta
//     gia' fatta. Una mail spedita due volte e' un danno vero e non recuperabile;
//  4. i vincoli dichiarati si controllano PRIMA di mostrare al gate (§3.3), non dopo.

// ── 1. Le date, ricavate dal codice ──────────────────────
// Il modello riceve l'ordine di NON tradurre le date: copia le parole del Ghost ("domani alle 15")
// e basta. Qui si trasformano in un istante preciso, con regole leggibili e verificabili una per una.
const GIORNI_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
// Un solo posto dove si decide cos'e' un indirizzo valido, usato sia dal gate sia dall'esecutore.
const EMAIL_VALIDA_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const due = (n) => String(n).padStart(2, "0");
// ISO LOCALE, non UTC. createCalendarEvent manda l'ora insieme a timeZone "Europe/Rome": l'ora da
// mandare e' quella dell'orologio del Ghost. new Date().toISOString() darebbe l'ora di Greenwich e
// d'estate sposterebbe ogni appuntamento di due ore — errore silenzioso, del tipo peggiore.
function isoLocale(d) { return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}:00`; }
const NUMERI_IT = { un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, quindici: 15 };
// ALTRO ESITO DEL GATE 3: new Date(2026, 1, 30) non esplode, scivola al 2 marzo. Un "30 febbraio"
// diventava cosi' un appuntamento reale in un altro mese, senza che nessuno se ne accorgesse.
// Qui si verifica che la data costruita sia ancora quella chiesta; se non lo e', si rifiuta.
function giornoCoerente(d, anno, mese, giorno) {
  return d.getFullYear() === anno && d.getMonth() === mese && d.getDate() === giorno;
}
// Restituisce SEMPRE un oggetto, mai un'eccezione: chi chiama deve poter dire al Ghost cosa non ha
// capito, invece di mostrargli un errore tecnico.
//   { ok:false, motivo }                                   — non c'e' una data ricavabile
//   { ok:true, inizioISO, fineISO, tuttoIlGiorno, ambiguo, motivoAmbiguita }
// ══════════════════════════════════════════════════════════════════════════════
// L'ORA COME LA DICE UNA PERSONA (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 22/08 alle 14:50 il Ghost ha chiesto "giovedi' pomeriggio alle 16 e 30". La card ha detto
// 16:30, sul calendario e' finito alle 16:00, e la verifica ha dichiarato "c'e'". Il parser
// prendeva il 16 e buttava via "e 30", perche' cercava i minuti solo dopo due punti, un punto o
// una virgola.
// Misurato prima di riscriverlo, su 23 forme che una persona detta a voce: ne capiva 10.
// E tre di quelle che sbagliava le sbagliava nel modo peggiore — "alle sette e trenta" e "alle otto
// di sera" diventavano le 00:00, cioe' mezzanotte, in silenzio.
// Il Ghost detta a voce: "16 e 30" non e' un caso limite, e' il caso normale. Quindi qui l'ora si
// legge in tutte le forme parlate, i numeri anche scritti in lettere, e chi non capisce lo dichiara
// invece di restituire mezzanotte.
const NUM_ORE_IT = {
  zero: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8,
  nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16,
  diciassette: 17, diciotto: 18, diciannove: 19, venti: 20, ventuno: 21, ventidue: 22, ventitre: 23,
  ventiquattro: 24,
};
const NUM_MIN_IT = {
  ...NUM_ORE_IT,
  venticinque: 25, ventisei: 26, ventisette: 27, ventotto: 28, ventinove: 29, trenta: 30,
  trentuno: 31, trentacinque: 35, quaranta: 40, quarantacinque: 45, cinquanta: 50, cinquantacinque: 55,
};
function numeroIta(s, tabella = NUM_ORE_IT) {
  const t = String(s || "").trim().toLowerCase();
  if (/^\d{1,2}$/.test(t)) return Number(t);
  return Object.prototype.hasOwnProperty.call(tabella, t) ? tabella[t] : null;
}
const ORE_ALT = `(?:\\d{1,2}|${Object.keys(NUM_ORE_IT).join("|")})`;
const MIN_ALT = `(?:\\d{1,2}|${Object.keys(NUM_MIN_IT).join("|")})`;
// Le frazioni dette a parole, e quanto valgono in minuti.
const FRAZIONI = { "mezza": 30, "mezzo": 30, "un quarto": 15, "quarto": 15, "tre quarti": 45, "mezz'ora": 30 };
// Estrae l'orario da una frase e dice anche COSA ha consumato, cosi' chi chiama puo' togliere quel
// pezzo dal testo prima di cercare il giorno (altrimenti il "16" di "alle 16" diventa il giorno 16).
function estraiOrario(espressione) {
  const originale = senzaAccenti(espressione).replace(/\s+/g, " ").trim();
  if (!originale) return { ok: false, motivo: "non c'e' nessun orario nella frase" };
  const qualifica = (ore) => {
    if (ore === null) return null;
    if (/(?:di|del|della|nel|nella)?\s*pomeriggio|di sera|della sera|stasera/.test(originale) && ore >= 1 && ore <= 11) return ore + 12;
    if (/di notte|della notte/.test(originale) && ore >= 6 && ore <= 11) return ore + 12;
    return ore;
  };
  const chiudi = (ore, minuti, m) => {
    const o = qualifica(ore);
    if (o === null || o > 24 || minuti > 59 || minuti < 0) return { ok: false, motivo: `"${m[0].trim()}" non e' un orario valido` };
    return { ok: true, ore: o === 24 ? 0 : o, minuti, testoConsumato: m[0], indice: m.index };
  };
  let m;
  // 1. mezzogiorno / mezzanotte, con l'eventuale "e mezzo" o "e un quarto".
  m = originale.match(new RegExp(`\\b(mezzogiorno|mezzanotte)(?:\\s+e\\s+(mezza|mezzo|un quarto|tre quarti|${MIN_ALT}))?\\b`));
  if (m) {
    const base = m[1] === "mezzogiorno" ? 12 : 0;
    let min = 0;
    if (m[2]) min = FRAZIONI[m[2]] ?? numeroIta(m[2], NUM_MIN_IT) ?? 0;
    return chiudi(base, min, m);
  }
  // 2. HH:MM, HH.MM, HH,MM — con o senza "alle".
  m = originale.match(/\b(?:alle|all'|ore|h)?\s*([0-2]?\d)[:.,]([0-5]\d)\b/);
  if (m) return chiudi(Number(m[1]), Number(m[2]), m);
  // 3. "alle N meno un quarto", "alle N meno dieci" — l'ora torna indietro.
  m = originale.match(new RegExp(`\\b(?:alle|all'|ore|h|a)\\s+(${ORE_ALT})\\s+meno\\s+(un quarto|tre quarti|${MIN_ALT})\\b`));
  if (m) {
    const o = numeroIta(m[1]);
    const sottrai = FRAZIONI[m[2]] ?? numeroIta(m[2], NUM_MIN_IT);
    if (o === null || sottrai === null) return { ok: false, motivo: `non ho capito l'orario in "${m[0].trim()}"` };
    const tot = (qualifica(o) * 60 - sottrai + 1440) % 1440;
    return { ok: true, ore: Math.floor(tot / 60), minuti: tot % 60, testoConsumato: m[0], indice: m.index };
  }
  // 4. "alle N e 30", "alle N e mezza", "N e 30" — la forma che il Ghost detta.
  m = originale.match(new RegExp(`\\b(?:alle|all'|ore|h|a)?\\s*(${ORE_ALT})\\s+e\\s+(mezza|mezzo|un quarto|tre quarti|${MIN_ALT})\\b`));
  if (m) {
    const o = numeroIta(m[1]);
    const min = FRAZIONI[m[2]] ?? numeroIta(m[2], NUM_MIN_IT);
    if (o !== null && min !== null) return chiudi(o, min, m);
  }
  // 5. "alle 16", "alle sedici", "alle 16 in punto" — solo l'ora. Serve "alle"/"ore"/"h": un numero
  //    nudo in una frase e' quasi sempre un giorno del mese, non un orario.
  m = originale.match(new RegExp(`\\b(?:alle|all'|ore|h)\\s*(${ORE_ALT})\\b(?:\\s+in punto)?`));
  if (m) {
    const o = numeroIta(m[1]);
    if (o !== null) return chiudi(o, 0, m);
  }
  // 6. I momenti della giornata, quando non c'e' nessun numero.
  if (/\bstasera\b/.test(originale)) return { ok: true, ore: 21, minuti: 0, testoConsumato: "", indice: -1 };
  if (/\bstamattina\b|\bstamane\b|\bdi mattina\b|\bdel mattino\b/.test(originale)) return { ok: true, ore: 9, minuti: 0, testoConsumato: "", indice: -1 };
  return { ok: false, motivo: "non c'e' nessun orario riconoscibile nella frase" };
}
function normalizzaData(espressione, adesso = new Date()) {
  let t = senzaAccenti(espressione).replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "non mi hai detto quando" };
  let ambiguo = false, motivoAmbiguita = "";
  // MISURATO DAL GATE 3 (16/08/2026) — questo controllo non c'era e il test l'ha scoperto:
  // "ieri alle 15" finiva nel ramo "c'e' solo l'ora" e diventava OGGI alle 15. Cioe' una parola
  // che il codice non conosce veniva ignorata in silenzio e l'appuntamento nasceva nel giorno
  // sbagliato — esattamente la classe di errore che questo blocco esiste per impedire. Le
  // espressioni al passato ora si rifiutano dichiarandolo, invece di essere scavalcate.
  if (/\b(ieri|l'altro ieri|scors[ao]|passat[ao]|fa)\b/.test(t)) {
    return { ok: false, motivo: `"${String(espressione).trim()}" indica un momento passato: sul calendario si mettono cose future` };
  }

  // ORA — si estrae per prima e si toglie dal testo, cosi' il "15" di "alle 15" non viene poi
  // riletto come il giorno 15 del mese. Dal 22/08/2026 il lavoro lo fa estraiOrario, che conosce
  // le forme parlate: vedi il blocco sopra e il motivo per cui e' stato riscritto.
  let ore = null, minuti = 0;
  const oraLetta = estraiOrario(t);
  if (oraLetta.ok) {
    ore = oraLetta.ore; minuti = oraLetta.minuti;
    if (oraLetta.indice >= 0 && oraLetta.testoConsumato) {
      t = (t.slice(0, oraLetta.indice) + " " + t.slice(oraLetta.indice + oraLetta.testoConsumato.length)).replace(/\s+/g, " ").trim();
    }
  } else if (/\bmezzogiorno\b/.test(t)) { ore = 12; }
  else if (/(?<![\p{L}'\u2019])(alle|all'|ore|h)(?![\p{L}'\u2019])/iu.test(t)) {
    // 22/08/2026 — il Ghost ha detto "alle qualcosa" e quel qualcosa non e' un orario. Prima si
    // scivolava senza dire niente su un evento di UN GIORNO INTERO: un declassamento silenzioso,
    // cioe' la stessa classe di difetto dei minuti persi. Adesso si dichiara e non si scrive.
    return { ok: false, motivo: `hai detto un orario che non ho capito in "${String(espressione).trim()}": ridimmelo` };
  }
  if (ore !== null && (ore > 23 || minuti > 59)) return { ok: false, motivo: `"${ore}:${due(minuti)}" non e' un orario valido` };

  // GIORNO — in ordine di specificita': prima quello che il Ghost ha detto in chiaro, poi le
  // espressioni relative, per ultimo il nome del giorno della settimana (il caso ambiguo).
  const base = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  let giorno = null;
  let mm = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (mm) {
    const g = Number(mm[1]), me = Number(mm[2]);
    let anno = mm[3] ? Number(mm[3]) : adesso.getFullYear();
    if (anno < 100) anno += 2000;
    if (me < 1 || me > 12 || g < 1 || g > 31) return { ok: false, motivo: `"${mm[0]}" non e' una data valida` };
    giorno = new Date(anno, me - 1, g);
    if (!giornoCoerente(giorno, anno, me - 1, g)) return { ok: false, motivo: `"${mm[0]}" non esiste sul calendario` };
  }
  if (!giorno) {
    mm = t.match(new RegExp(`\\b(\\d{1,2})\\s+(${MESI_IT.map(senzaAccenti).join("|")})\\b(?:\\s+(\\d{4}))?`));
    if (mm) {
      const g = Number(mm[1]), me = MESI_IT.map(senzaAccenti).indexOf(mm[2]);
      let anno = mm[3] ? Number(mm[3]) : adesso.getFullYear();
      giorno = new Date(anno, me, g);
      if (!giornoCoerente(giorno, anno, me, g)) return { ok: false, motivo: `"${mm[0]}" non esiste sul calendario` };
      // "19 agosto" detto il 20 agosto vuol dire l'anno prossimo. Si sposta, ma lo si dichiara.
      if (!mm[3] && giorno.getTime() < base.getTime()) {
        giorno = new Date(anno + 1, me, g);
        ambiguo = true; motivoAmbiguita = "quella data quest'anno e' gia' passata: ho inteso l'anno prossimo";
      }
    }
  }
  if (!giorno && /\bdopodomani\b/.test(t)) giorno = new Date(base.getTime() + 2 * 86400000);
  if (!giorno && /\bdomani\b/.test(t)) giorno = new Date(base.getTime() + 86400000);
  if (!giorno && /\b(oggi|stasera|stamattina|stamane|stanotte)\b/.test(t)) giorno = new Date(base.getTime());
  if (!giorno) {
    mm = t.match(/\b(?:fra|tra)\s+(\d+|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|quindici)\s+(giorni?|settiman[ae]|mes[ei])\b/);
    if (mm) {
      const n = /^\d+$/.test(mm[1]) ? Number(mm[1]) : (NUMERI_IT[mm[1]] || 1);
      if (/^giorn/.test(mm[2])) giorno = new Date(base.getTime() + n * 86400000);
      else if (/^settiman/.test(mm[2])) giorno = new Date(base.getTime() + n * 7 * 86400000);
      else { giorno = new Date(base.getFullYear(), base.getMonth() + n, base.getDate()); }
    }
  }
  if (!giorno) {
    const indice = GIORNI_IT.map(senzaAccenti).findIndex((g) => new RegExp(`\\b${g}\\b`).test(t));
    if (indice >= 0) {
      // Regola dichiarata: il nome di un giorno significa la sua PRIMA ricorrenza dopo oggi.
      // Mai oggi stesso, anche se cade oggi: "vediamoci martedi'" detto di martedi' non e' fra un'ora.
      let delta = (indice - base.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      giorno = new Date(base.getTime() + delta * 86400000);
      // "martedi' prossimo" e' genuinamente ambiguo fra parlanti italiani: per alcuni e' questo
      // martedi', per altri quello della settimana dopo. Non si indovina: si sceglie la regola
      // dichiarata sopra e SI AVVISA, perche' la card mostra comunque giorno e data per esteso.
      if (/\bprossim[ao]\b/.test(t)) {
        ambiguo = true;
        motivoAmbiguita = "hai detto \"prossimo\": ho inteso la prima ricorrenza, non quella della settimana dopo";
      }
    }
  }
  // Solo l'ora, senza giorno: oggi se e' ancora nel futuro, altrimenti domani. Sempre dichiarato.
  if (!giorno && ore !== null) {
    const oggiConOra = new Date(base.getFullYear(), base.getMonth(), base.getDate(), ore, minuti);
    giorno = oggiConOra.getTime() > adesso.getTime() ? new Date(base.getTime()) : new Date(base.getTime() + 86400000);
    ambiguo = true; motivoAmbiguita = "non hai detto il giorno: ho inteso quello qui sotto";
  }
  if (!giorno) return { ok: false, motivo: "non sono riuscito a ricavare una data da quello che hai detto" };

  const tuttoIlGiorno = ore === null;
  const inizio = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate(), tuttoIlGiorno ? 0 : ore, tuttoIlGiorno ? 0 : minuti);
  if (Number.isNaN(inizio.getTime())) return { ok: false, motivo: "la data che ho ricavato non e' valida" };
  if (inizio.getTime() < adesso.getTime() - 5 * 60000) {
    return { ok: false, motivo: `la data che ho ricavato (${formatDataPerEsteso(isoLocale(inizio), tuttoIlGiorno)}) e' gia' passata` };
  }
  const fine = tuttoIlGiorno ? new Date(inizio.getTime() + 86400000) : new Date(inizio.getTime() + 3600000);
  return { ok: true, inizioISO: isoLocale(inizio), fineISO: isoLocale(fine), tuttoIlGiorno, ambiguo, motivoAmbiguita };
}
// L'intervallo da guardare sul calendario. Separato da normalizzaData di proposito: quella rifiuta
// le date passate, giustamente, perche' serve a CREARE eventi. Per LEGGERE invece "oggi" comincia a
// mezzanotte, che a mezzogiorno e' gia' passata — e rifiutarlo sarebbe assurdo.
// I numeri scritti in lettere, perche' il Ghost dice "nei prossimi tre giorni" quanto "3 giorni".
const NUMERI_IT_GIORNI = { un: 1, uno: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, quindici: 15, venti: 20, trenta: 30 };
function intervalloCalendario(espressione, adesso = new Date()) {
  const t = senzaAccenti(espressione);
  const base = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const giornoIntero = (d, quanti = 1) => ({
    ok: true,
    inizioISO: isoLocale(d),
    fineISO: isoLocale(new Date(d.getTime() + quanti * 86400000 - 1000)),
    etichetta: quanti === 1 ? formatDataPerEsteso(isoLocale(d), true).replace(" (tutto il giorno)", "") : `da ${formatDataPerEsteso(isoLocale(d), true).replace(" (tutto il giorno)", "")} per ${quanti} giorni`,
  });
  if (!t.trim() || /\boggi\b|\bin giornata\b|\bstasera\b|\bstamattina\b/.test(t)) return giornoIntero(base);
  if (/\bdopodomani\b/.test(t)) return giornoIntero(new Date(base.getTime() + 2 * 86400000));
  if (/\bdomani\b/.test(t)) return giornoIntero(new Date(base.getTime() + 86400000));
  // "prossimi 7 giorni" — il caso che il 22/08 ha bloccato il Ghost. La riga qui sotto chiedeva
  // "settimana", "prossimi giorni" o "nei prossimi": nessuna delle tre e' dentro "prossimi 7
  // giorni", perche' il numero spezza "prossimi giorni". Risultato: la lettura non era proponibile,
  // la card diceva "dimmelo con un giorno" — cioe' chiedeva un'informazione che il Ghost aveva gia'
  // dato, visto che il punto di partenza e' oggi — e senza pulsante l'azione non poteva partire.
  // Adesso il numero si legge, in cifre o in lettere, e vale davvero: "nei prossimi tre giorni"
  // guarda tre giorni, non sette come faceva prima ignorando la parola.
  const quantiGiorni = t.match(/(\d{1,2}|un|uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|quindici|venti|trenta)\s+giorn[oi]/);
  if (quantiGiorni) {
    const n = NUMERI_IT_GIORNI[quantiGiorni[1]] ?? parseInt(quantiGiorni[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 90) return giornoIntero(base, n);
  }
  if (/settimana|prossimi giorni|nei prossimi|prossim[ie] giorni/.test(t)) return giornoIntero(base, 7);
  // "questo weekend": da sabato a domenica. Se oggi e' gia' sabato o domenica, si parte da oggi.
  if (/weekend|week-end|fine settimana/.test(t)) {
    const dow = base.getDay(); // 0 = domenica, 6 = sabato
    if (dow === 6) return giornoIntero(base, 2);
    if (dow === 0) return giornoIntero(base, 1);
    const aSabato = 6 - dow;
    return giornoIntero(new Date(base.getTime() + aSabato * 86400000), 2);
  }
  if (/\bmese\b/.test(t)) return giornoIntero(base, 31);
  // Un giorno della settimana o una data esplicita: si riusa il calcolo gia' provato, chiedendogli
  // la prima ricorrenza futura, e poi si prende il giorno intero.
  const d = normalizzaData(espressione, adesso);
  if (d.ok) { const g = new Date(d.inizioISO); return giornoIntero(new Date(g.getFullYear(), g.getMonth(), g.getDate())); }
  return { ok: false, motivo: d.motivo || "non ho capito che periodo guardare" };
}
// Giorno della settimana, data e ora PER ESTESO — la forma richiesta dal piano. Scritta a mano
// invece che con toLocaleString perche' deve dare la stessa identica stringa su ogni telefono e
// dentro i test: e' il testo su cui il Ghost decide se confermare.
function formatDataPerEsteso(iso, tuttoIlGiorno) {
  const d = new Date(String(iso || ""));
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const testa = `${GIORNI_IT[d.getDay()]} ${d.getDate()} ${MESI_IT[d.getMonth()]} ${d.getFullYear()}`;
  return tuttoIlGiorno ? `${testa} (tutto il giorno)` : `${testa} alle ${due(d.getHours())}:${due(d.getMinutes())}`;
}

// ── 2. Controllo dei vincoli PRIMA del gate (§3.3) ───────
// Una mail e' output generato dal sistema: il vincolo sull'identita' professionale vale per intero.
// Non si redige in silenzio (su una mail sarebbe peggio del problema: il Ghost firmerebbe un testo
// bucato senza saperlo): si BLOCCA e si dice quale parola l'ha fatto scattare.
// Riusa redactProfessionalIdentity — stessa e unica fonte di verita', cosi' i due controlli non
// possono divergere col tempo.
function controllaVincoliInUscita(testo, profile = CURRENT_GHOST_PROFILE) {
  const originale = String(testo || "");
  const prof = normalizeGhostProfile(profile);
  if (!originale.trim() || !prof?.hasProfessionalConstraint) return { ok: true, violazioni: [] };
  if (redactProfessionalIdentity(originale, prof) === originale) return { ok: true, violazioni: [] };
  // C'e' una violazione: si cerca di NOMINARLA, parola per parola, invece di dire "c'e' qualcosa".
  const violazioni = [];
  for (const parola of new Set(originale.match(/[\p{L}\p{N}'’-]+/gu) || [])) {
    if (redactProfessionalIdentity(parola, prof) !== parola) violazioni.push(parola);
  }
  if (!violazioni.length) violazioni.push("un'espressione che richiama la tua attività professionale");
  return { ok: false, violazioni };
}

// ── 3. Idempotenza (§3.2) ────────────────────────────────
// La chiave nasce alla PROPOSTA ed e' deterministica sul contenuto: gli stessi oggetto e testo
// danno la stessa chiave, quindi un secondo tentativo si riconosce anche dopo una ricarica dell'app.
const ESECUZIONI_KEY = "azioni-esecuzioni";
const ESECUZIONI_TETTO = 200;
function hashStabile(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function chiaveIdempotenza(tipo, parti) {
  const corpo = (parti || []).map((p) => String(p == null ? "" : p).trim().toLowerCase().replace(/\s+/g, " ")).join(" ");
  return `${tipo}-${hashStabile(tipo + " " + corpo)}`;
}
// L'indirizzo si aggiunge alla chiave solo al momento dell'esecuzione: lo stesso testo mandato a
// due persone diverse sono due invii legittimi, non un doppione.
function chiaveConDestinatario(chiaveBase, indirizzo) {
  return `${chiaveBase}-${hashStabile(String(indirizzo || "").trim().toLowerCase())}`;
}
function leggiEsecuzioni() { const v = loadKey(ESECUZIONI_KEY, {}); return (v && typeof v === "object") ? v : {}; }
function leggiEsecuzione(chiave) { return leggiEsecuzioni()[chiave] || null; }
function segnaEsecuzione(chiave, voce) {
  const tutte = leggiEsecuzioni();
  tutte[chiave] = { ...(tutte[chiave] || {}), ...voce, aggiornata: new Date().toISOString() };
  const chiavi = Object.keys(tutte);
  if (chiavi.length > ESECUZIONI_TETTO) {
    chiavi.sort((a, b) => String(tutte[a].aggiornata).localeCompare(String(tutte[b].aggiornata)));
    for (const k of chiavi.slice(0, chiavi.length - ESECUZIONI_TETTO)) delete tutte[k];
  }
  saveKey(ESECUZIONI_KEY, tutte);
  return tutte[chiave];
}

// ── 4. Verifica di ritorno (§3.1) ────────────────────────
// Non ci si fida della risposta ricevuta: si torna a chiedere alla fonte e si guarda cosa c'e'
// davvero. E' C.6 applicata alle azioni invece che al codice.
// Anche la rilettura passa dalla superficie diagnostica: e' il momento in cui il sistema decide se
// puo' dire "fatto", quindi e' esattamente il momento di cui serve la prova grezza.
async function rileggiEventoDallaFonte(eventId) {
  if (!eventId) return { ok: false, motivo: "il calendario non ha restituito nessun identificativo" };
  const r = await chiamataGoogleTracciata("calendario-rilettura", `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`);
  if (!r.ok) return { ok: false, motivo: r.errore || `il calendario ha risposto ${r.stato}`, grezza: r.grezza };
  const d = r.corpo;
  if (!d || !d.id) return { ok: false, motivo: "risposta del calendario non leggibile", grezza: r.grezza };
  if (d.status === "cancelled") return { ok: false, motivo: "l'evento risulta cancellato", grezza: r.grezza };
  return { ok: true, id: d.id, titolo: d.summary || "", inizio: d.start?.dateTime || d.start?.date || "", tuttoIlGiorno: !!d.start?.date, link: d.htmlLink || "", grezza: r.grezza };
}
async function rileggiMailDallaFonte(messageId) {
  if (!messageId) return { ok: false, motivo: "Gmail non ha restituito nessun identificativo" };
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
  const r = await chiamataGoogleTracciata("mail-rilettura", url);
  if (!r.ok) return { ok: false, motivo: r.errore || `Gmail ha risposto ${r.stato}`, grezza: r.grezza };
  const d = r.corpo;
  if (!d || !d.id) return { ok: false, motivo: "risposta di Gmail non leggibile", grezza: r.grezza };
  const h = {};
  for (const x of (d.payload?.headers || [])) h[String(x.name || "").toLowerCase()] = x.value;
  return { ok: true, id: d.id, a: h.to || "", oggetto: h.subject || "", quando: h.date || "", inviata: (d.labelIds || []).includes("SENT"), grezza: r.grezza };
}

// ══════════════════════════════════════════════════════════════════════════════
// IL CONFRONTO POST-SCRITTURA (rifatto il 20/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 20/08 il primo evento e' finito DAVVERO sul calendario del Ghost — e il sistema gli ha detto
// "non combacia, controllalo a mano". Falso negativo.
// La causa, diagnosticata prima di toccare niente: l'orario veniva confrontato COME STRINGA,
// tagliando i primi 16 caratteri. Ma lo stesso istante — le 19:00 del 20 agosto a Roma — Google
// puo' restituirlo scritto come "2026-08-20T19:00:00+02:00" oppure "2026-08-20T17:00:00Z": la
// stessa ora, due stringhe diverse. Due forme su quattro producevano un falso negativo.
// La stranezza che il Ghost ha visto — il messaggio mostrava l'ora GIUSTA e diceva che non
// combaciava — viene da qui: la visualizzazione converte al fuso del telefono, il confronto no.
//
// Perche' non e' cosmetico: una verifica che grida a ogni scrittura riuscita smette di distinguere
// il successo dal fallimento, e il Ghost impara a ignorarla. Il giorno in cui gridera' per un
// motivo vero non sara' creduta.
//
// Nota su cosa NON era il difetto: il termine atteso era gia' il payload realmente inviato nel
// POST, non il testo del modello — eseguiCreaEvento costruisce un solo oggetto e lo passa sia a
// createCalendarEvent sia al confronto. Su questo il codice era gia' corretto.
const TOLLERANZA_ISTANTE_MS = 60000; // un minuto: Google puo' arrotondare i secondi
// Il titolo si confronta normalizzato: maiuscole, accenti e spazi doppi non sono una differenza
// vera. Se DOPO la normalizzazione differisce ancora, allora e' un non-combacia autentico.
function titoloNormalizzato(t) { return senzaAccenti(t).replace(/\s+/g, " ").trim(); }
// Confronta cio' che e' stato mandato con cio' che la fonte restituisce.
// Tre esiti, e la distinzione conta perche' oggi due casi diversi collassavano in uno:
//   verificata       — riletto, corrisponde;
//   non-combacia     — riletto, differisce DAVVERO: si dice cosa, atteso e trovato;
//   non-verificabile — manca un campo per poter confrontare. Non e' un fallimento della scrittura.
function confrontaEventoConLaFonte(inviato, letto) {
  const differenze = [];
  const titoloInviato = titoloNormalizzato(inviato?.title);
  const titoloLetto = titoloNormalizzato(letto?.titolo);
  if (!titoloLetto || !letto?.inizio) {
    return { esito: "non-verificabile", motivo: "la fonte non ha restituito " + (!titoloLetto ? "il titolo" : "la data") + ", non ho con cosa confrontare" };
  }
  if (titoloInviato !== titoloLetto) {
    differenze.push({ campo: "titolo", atteso: String(inviato?.title || ""), trovato: String(letto?.titolo || "") });
  }
  if (inviato?.allDay || letto?.tuttoIlGiorno) {
    // Evento di un giorno intero: si confrontano le date, non gli istanti — un giorno intero non
    // ha un'ora, e pretendere che ne abbia una sarebbe inventarsi una differenza.
    const dataInviata = String(inviato?.startISO || "").slice(0, 10);
    const dataLetta = String(letto?.inizio || "").slice(0, 10);
    if (dataInviata !== dataLetta) differenze.push({ campo: "giorno", atteso: dataInviata, trovato: dataLetta });
  } else {
    // Evento a un'ora precisa: si confrontano gli ISTANTI, non le stringhe. Date.parse riporta
    // entrambe le forme allo stesso numero, qualunque fuso ci sia scritto sopra.
    const istanteInviato = Date.parse(String(inviato?.startISO || ""));
    const istanteLetto = Date.parse(String(letto?.inizio || ""));
    if (Number.isNaN(istanteInviato) || Number.isNaN(istanteLetto)) {
      return { esito: "non-verificabile", motivo: "una delle due date non e' leggibile, non posso confrontarle" };
    }
    if (Math.abs(istanteInviato - istanteLetto) > TOLLERANZA_ISTANTE_MS) {
      differenze.push({
        campo: "quando",
        atteso: formatDataPerEsteso(inviato.startISO, false),
        trovato: formatDataPerEsteso(letto.inizio, false),
      });
    }
  }
  return differenze.length ? { esito: "non-combacia", differenze } : { esito: "verificata", differenze: [] };
}

// ── Gli esecutori di Classe B ────────────────────────────
// confermaEsplicita non e' una formalita': e' il modo di rendere VERIFICABILE §7 dell'architettura
// ("nessuna azione di Classe B puo' essere eseguita da un processo schedulato"). Solo il gestore del
// tocco sul pulsante del gate passa true. Qualunque altro chiamante — un timer, un effetto, un
// avanzamento automatico dei Semi — riceve un rifiuto, non un invio.
async function creaEventoConVerifica(evento, chiave, confermaEsplicita) {
  if (confermaEsplicita !== true) return { esito: "rifiutata", motivo: "manca la conferma esplicita: questa azione non parte da sola" };
  const vincoli = controllaVincoliInUscita([evento?.title, evento?.notes].filter(Boolean).join("\n"));
  if (!vincoli.ok) return { esito: "bloccata-dai-vincoli", violazioni: vincoli.violazioni };
  const gia = leggiEsecuzione(chiave);
  if (gia && gia.stato !== "fallita") return { esito: "gia-eseguita", precedente: gia };
  segnaEsecuzione(chiave, { stato: "in-corso", tipo: "calendario", descrizione: evento?.title || "" });
  let creato = null;
  try { creato = await createCalendarEvent(evento); }
  catch (e) {
    // Un evento e' reversibile: se il tentativo fallisce si puo' ritentare senza rischio, perche'
    // al massimo nasce un doppione cancellabile. Per questo qui "fallita" e non "incerta".
    segnaEsecuzione(chiave, { stato: "fallita", errore: e.message, grezza: e.grezza || null });
    return { esito: "fallita", motivo: e.message, grezza: e.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "eseguita", idEsterno: creato?.id || null });
  let v;
  try { v = await rileggiEventoDallaFonte(creato?.id || ""); }
  catch (e) { v = { ok: false, motivo: e.message }; }
  if (!v.ok) {
    // NON VERIFICABILE, non "fallita": la scrittura era riuscita, e' la rilettura a non essere
    // andata. E' il principio gia' acquisito nel progetto — "incerto" non e' "fallito".
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificabile", motivoVerifica: v.motivo });
    return { esito: "non-verificabile", idEsterno: creato?.id || null, motivo: v.motivo, grezza: v.grezza || creato?.__grezza || null };
  }
  const confronto = confrontaEventoConLaFonte(evento, v);
  if (confronto.esito === "non-verificabile") {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificabile", motivoVerifica: confronto.motivo });
    return { esito: "non-verificabile", idEsterno: v.id, letto: v, motivo: confronto.motivo, grezza: v.grezza || null };
  }
  if (confronto.esito === "non-combacia") {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificata", motivoVerifica: confronto.differenze.map((d) => `${d.campo}: atteso ${d.atteso}, trovato ${d.trovato}`).join(" · ") });
    return { esito: "non-combacia", idEsterno: v.id, letto: v, differenze: confronto.differenze, grezza: v.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "verificata", idEsterno: v.id });
  return { esito: "verificata", letto: v, grezza: v.grezza || null };
}
// 25/08/2026 — LO SPOSTAMENTO. Stessa forma della creazione: si scrive (qui un PATCH sull'evento
// esistente, non un POST di uno nuovo), poi si RILEGGE dalla fonte e si confronta con
// confrontaEventoConLaFonte, la stessa funzione invariata — il titolo non cambia in uno spostamento,
// cambia solo l'orario, quindi il termine atteso e' il titolo gia' letto dalla ricerca del bersaglio
// piu' il nuovo inizio/fine calcolati dal codice (mai dal modello).
// Nessun parametro confermaEsplicita: come cancellaEventoConVerifica, il gate sta nel chiamante —
// solo il gestore sincrono del tocco sul pulsante (eseguiSpostaEvento) la invoca.
async function spostaEventoDelCalendario(eventoId, nuovo) {
  const body = {
    start: nuovo.tuttoIlGiorno ? { date: nuovo.inizioISO.slice(0, 10) } : { dateTime: nuovo.inizioISO, timeZone: "Europe/Rome" },
    end: nuovo.tuttoIlGiorno ? { date: (nuovo.fineISO || nuovo.inizioISO).slice(0, 10) } : { dateTime: nuovo.fineISO || nuovo.inizioISO, timeZone: "Europe/Rome" },
  };
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventoId)}`;
  const r = await chiamataGoogleTracciata("calendario-spostamento", url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (r.errore) { const e = new Error(r.errore); e.grezza = r.grezza; throw e; }
  const data = r.corpo || {};
  data.__grezza = r.grezza;
  return data;
}
async function spostaEventoConVerifica(eventoId, nuovo, titoloAtteso, chiave) {
  const gia = leggiEsecuzione(chiave);
  if (gia && gia.stato !== "fallita") return { esito: "gia-eseguita", precedente: gia };
  segnaEsecuzione(chiave, { stato: "in-corso", tipo: "calendario-spostamento", descrizione: titoloAtteso || "" });
  let esito = null;
  try { esito = await spostaEventoDelCalendario(eventoId, nuovo); }
  catch (e) {
    segnaEsecuzione(chiave, { stato: "fallita", errore: e.message, grezza: e.grezza || null });
    return { esito: "fallita", motivo: e.message, grezza: e.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "eseguita", idEsterno: eventoId });
  let v;
  try { v = await rileggiEventoDallaFonte(eventoId); }
  catch (e) { v = { ok: false, motivo: e.message }; }
  if (!v.ok) {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificabile", motivoVerifica: v.motivo });
    return { esito: "non-verificabile", idEsterno: eventoId, motivo: v.motivo, grezza: v.grezza || esito.__grezza || null };
  }
  const confronto = confrontaEventoConLaFonte({ title: titoloAtteso, startISO: nuovo.inizioISO, endISO: nuovo.fineISO, allDay: nuovo.tuttoIlGiorno }, v);
  if (confronto.esito === "non-verificabile") {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificabile", motivoVerifica: confronto.motivo });
    return { esito: "non-verificabile", idEsterno: v.id, letto: v, motivo: confronto.motivo, grezza: v.grezza || null };
  }
  if (confronto.esito === "non-combacia") {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificata", motivoVerifica: confronto.differenze.map((d) => `${d.campo}: atteso ${d.atteso}, trovato ${d.trovato}`).join(" · ") });
    return { esito: "non-combacia", idEsterno: v.id, letto: v, differenze: confronto.differenze, grezza: v.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "verificata", idEsterno: v.id });
  return { esito: "verificata", letto: v, grezza: v.grezza || null };
}
async function inviaMailConVerifica({ a, oggetto, corpo, chiave, confermaEsplicita, forza = false }) {
  if (confermaEsplicita !== true) return { esito: "rifiutata", motivo: "manca la conferma esplicita: una mail non parte da sola" };
  if (!EMAIL_VALIDA_RE.test(String(a || "").trim())) return { esito: "rifiutata", motivo: "l'indirizzo non e' un indirizzo valido" };
  const vincoli = controllaVincoliInUscita([oggetto, corpo].join("\n"));
  if (!vincoli.ok) return { esito: "bloccata-dai-vincoli", violazioni: vincoli.violazioni };
  const gia = leggiEsecuzione(chiave);
  if (gia && !forza) return { esito: "gia-eseguita", precedente: gia };
  segnaEsecuzione(chiave, { stato: "in-corso", tipo: "mail", descrizione: `${a} — ${oggetto}` });
  let inviata = null;
  try { inviata = await sendGmail(a, oggetto || "(nessun oggetto)", corpo); }
  catch (e) {
    // Qui sta il punto di §3.2. Se la rete cade DOPO che la mail e' partita ma PRIMA della
    // risposta, questo ramo scatta lo stesso — e la mail e' gia' fuori. Segnare "fallita"
    // permetterebbe al secondo tentativo di rispedirla: mai. Si segna "incerta", il secondo
    // tentativo si ferma, e resta al Ghost la scelta consapevole di forzare.
    segnaEsecuzione(chiave, { stato: "incerta", errore: e.message, grezza: e.grezza || null });
    return { esito: "incerta", motivo: e.message, grezza: e.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "eseguita", idEsterno: inviata?.id || null });
  let v;
  try { v = await rileggiMailDallaFonte(inviata?.id || ""); }
  catch (e) { v = { ok: false, motivo: e.message }; }
  if (!v.ok) {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificata", motivoVerifica: v.motivo });
    return { esito: "non-verificata", idEsterno: inviata?.id || null, motivo: v.motivo, grezza: v.grezza || inviata?.__grezza || null };
  }
  // Combacia? Si confronta l'indirizzo davvero registrato da Gmail, non quello che credevamo.
  const destinatarioLetto = senzaAccenti(v.a).includes(senzaAccenti(a));
  if (!destinatarioLetto) {
    segnaEsecuzione(chiave, { stato: "eseguita-non-verificata", motivoVerifica: "il destinatario riletto da Gmail non e' quello confermato" });
    return { esito: "non-combacia", idEsterno: v.id, letto: v, grezza: v.grezza || null };
  }
  segnaEsecuzione(chiave, { stato: "verificata", idEsterno: v.id });
  return { esito: "verificata", letto: v, grezza: v.grezza || null };
}
// Prepara la proposta di Classe B: e' QUI che la data viene ricavata dal codice e che i vincoli
// vengono controllati — prima che qualunque cosa venga mostrata al gate, come chiede §3.3.
// E' anche qui che nasce la chiave di idempotenza (§3.2): alla proposta, non all'esecuzione.
// Torna un oggetto vuoto per tutto cio' che non e' di Classe B, cosi' il chiamante non deve sapere
// quali azioni siano di che classe.
function preparaClasseB(azioneId, parametro, adesso = new Date(), orarioModello = null) {
  const grezzo = String(parametro || "");
  if (azioneId === "crea_evento_calendario") {
    const pezzi = grezzo.split("|");
    const titolo = (pezzi[0] || "").trim();
    const quandoDetto = pezzi.slice(1).join("|").trim();
    const data = normalizzaData(quandoDetto, adesso);
    const vincoli = controllaVincoliInUscita(titolo);
    // 22/08/2026 — il confronto fra i due percorsi indipendenti che ricavano l'ora. Nasce QUI,
    // insieme alla proposta, cosi' una divergenza impedisce alla card di avere un pulsante e
    // l'azione non puo' partire. Vedi orariConcordano.
    const accordoOrario = data.ok ? orariConcordano(data.inizioISO, orarioModello, data.tuttoIlGiorno) : { concordano: true, nonConfrontato: true };
    return { evento: { titolo, quandoDetto, ...data, vincoli, accordoOrario, orarioModello }, chiaveBase: chiaveIdempotenza("calendario", [titolo, data.inizioISO || quandoDetto]) };
  }
  if (azioneId === "cancella_evento_calendario") {
    // La cancellazione non ricava una data dal testo: ricava un BERSAGLIO, che il programma andra'
    // a cercare davvero sul calendario prima di mostrare qualunque cosa. Vedi trovaEventoDaCancellare.
    return { cancellazione: { descrizione: grezzo.trim() } };
  }
  if (azioneId === "sposta_evento_calendario") {
    // Due cose da ricavare, come per la cancellazione: un BERSAGLIO (cercato davvero, non qui) e un
    // NUOVO orario (calcolato qui, con lo stesso doppio controllo della creazione: vedi
    // orariConcordano). "quale" e "nuovo quando" arrivano divisi dallo stesso separatore di crea.
    const { descrizione, quandoDetto } = parseParametroSpostamento(grezzo);
    const nuovo = normalizzaData(quandoDetto, adesso);
    const accordoOrario = nuovo.ok ? orariConcordano(nuovo.inizioISO, orarioModello, nuovo.tuttoIlGiorno) : { concordano: true, nonConfrontato: true };
    return { spostamento: { descrizione, quandoDetto, nuovo, accordoOrario, orarioModello } };
  }
  if (azioneId === "leggi_calendario") {
    const intervallo = intervalloCalendario(grezzo, adesso);
    // La lettura non produce niente nel mondo, quindi non ha bisogno di una chiave di idempotenza:
    // rifarla due volte non e' un danno, e' solo una risposta piu' fresca.
    return { lettura: { quandoDetto: grezzo, ...intervallo } };
  }
  if (azioneId === "invia_mail") {
    const pezzi = grezzo.split("|");
    const a = (pezzi[0] || "").trim();
    const oggetto = (pezzi[1] || "").trim();
    const corpo = pezzi.slice(2).join("|").trim();
    const vincoli = controllaVincoliInUscita([oggetto, corpo].join("\n"));
    return { mail: { a, oggetto, corpo, vincoli }, chiaveBase: chiaveIdempotenza("mail", [oggetto, corpo]) };
  }
  return {};
}
// ══════════════════════════════════════════════════════════════════════════════
// DUE PERCORSI INDIPENDENTI DEVONO CONCORDARE SULL'ORA (22/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il 22/08 alle 14:50 un appuntamento chiesto per le 16:30 e' finito sul calendario alle 16:00, e
// la verifica ha detto "c'e'". La verifica non poteva accorgersene: confronta il payload inviato
// con l'evento riletto, e l'ora era gia' sbagliata NEL payload. Stava confrontando il sistema con
// se stesso. In tutta la catena non esisteva un punto in cui cio' che finisce su Google venisse
// messo contro cio' che il Ghost aveva chiesto.
// Adesso i percorsi che ricavano l'ora sono due e indipendenti:
//   1. estraiOrario, deterministico, dal testo del Ghost;
//   2. il modello di selezione, che riporta l'orario a parte nella stessa chiamata di prima.
// Se concordano si procede. Se divergono NON si esegue: e' il caso raro in cui uno dei due ha
// sbagliato, e non c'e' modo di sapere quale. Perche' un'ora sbagliata arrivi sul calendario
// dovrebbero sbagliare tutti e due nello stesso identico modo.
// Non e' il Ghost a fare da controllo: il Ghost viene chiamato in causa solo quando i due
// meccanismi si contraddicono, che e' l'unico caso in cui la sua parola aggiunge qualcosa.
function oraDaISO(iso) {
  const d = new Date(String(iso || ""));
  return Number.isNaN(d.getTime()) ? null : `${due(d.getHours())}:${due(d.getMinutes())}`;
}
function orariConcordano(inizioISO, orarioModello, tuttoIlGiorno) {
  // Se l'evento e' di un giorno intero non c'e' nessun orario da confrontare.
  if (tuttoIlGiorno) return { concordano: true, motivo: "evento di un giorno intero: nessun orario" };
  // Se il modello non ha riportato un orario, il confronto non e' possibile. Non si blocca per
  // questo — bloccare qui vorrebbe dire fermare ogni evento ogni volta che il modello omette un
  // campo — ma lo si dichiara, cosi' non si scambia "non confrontato" per "concordano".
  if (!orarioModello) return { concordano: true, nonConfrontato: true, motivo: "il modello non ha riportato l'orario: confronto non possibile" };
  const dalParser = oraDaISO(inizioISO);
  if (!dalParser) return { concordano: false, dalParser: null, dalModello: orarioModello, motivo: "la data calcolata non e' valida" };
  if (dalParser === orarioModello) return { concordano: true, dalParser, dalModello: orarioModello };
  return { concordano: false, dalParser, dalModello: orarioModello, motivo: `il calcolo del programma dice ${dalParser}, il modello ha capito ${orarioModello}` };
}
// Una proposta di Classe B e' ESEGUIBILE solo se la card che ne esce ha davvero un pulsante che
// esegue. Quando la data non si ricava, quando il periodo non si capisce, quando i vincoli bloccano
// la mail, la card mostra un solo pulsante — "Va bene" — che annulla e basta.
// Perche' questa distinzione e' necessaria (22/08/2026): il programma considerava "in attesa"
// qualunque proposta non ancora risolta, e finche' una proposta di Classe B e' in attesa scarta
// silenziosamente ogni altra proposta di Classe B. Una proposta senza pulsante non puo' MAI essere
// risolta dal Ghost, quindi restava in attesa per tutti i 20 minuti della scadenza — e per venti
// minuti nessuna richiesta di calendario o di posta poteva piu' produrre una card, senza nemmeno
// una riga nel registro che dicesse perche'. E' esattamente cio' che il Ghost ha visto il 22/08:
// una proposta alle 12:11:28 senza esito, e poi il silenzio.
// Una proposta che il Ghost non puo' toccare non e' in attesa di niente: e' morta appena nata.
function propostaEseguibile(azioneProposta) {
  if (!azioneProposta) return false;
  const { azioneId } = azioneProposta;
  if (azioneId === "leggi_calendario") return !!azioneProposta.lettura?.ok;
  if (azioneId === "crea_evento_calendario") {
    // 22/08/2026 — terza condizione: i due percorsi che ricavano l'ora devono concordare. Se
    // divergono la card non ha nessun pulsante che scrive, e l'evento non puo' nascere sbagliato.
    return !!azioneProposta.evento?.ok
      && azioneProposta.evento?.vincoli?.ok !== false
      && azioneProposta.evento?.accordoOrario?.concordano !== false;
  }
  if (azioneId === "cancella_evento_calendario") return !!azioneProposta.cancellazione?.bersaglio;
  if (azioneId === "sposta_evento_calendario") {
    // Tre condizioni, come per la creazione: un bersaglio trovato DAVVERO su Google, un nuovo
    // giorno/ora che il codice e' riuscito a capire, e i due percorsi indipendenti sull'orario
    // (parser deterministico e campo riportato dal modello) devono concordare. Se anche una sola
    // manca, niente pulsante: uno spostamento a vuoto o su un orario sbagliato non e' reversibile
    // quanto crearne uno, perche' sposta un impegno che esisteva gia'.
    return !!azioneProposta.spostamento?.bersaglio
      && !!azioneProposta.spostamento?.nuovo?.ok
      && azioneProposta.spostamento?.accordoOrario?.concordano !== false;
  }
  if (azioneId === "invia_mail") return azioneProposta.mail?.vincoli?.ok !== false;
  return true;
}
// Filtro difensivo: i modelli a volte scrivono "non-letture" ("Nessuna menzione di...") nonostante il prompt.
function isGarbageReading(r) {
  const text = [r.notes, r.title, r.weight, r.sleep].filter(Boolean).join(" ").trim();
  if (!text) return true;
  if (/^(non\s|nessun[ao]?\s|niente\s|nulla\s)/i.test(text)) return true;
  if (/non\s+(ci sono|c'è|ci son|ho trovato|sono presenti)|nessun[ao]?\s+(menzione|dato|attività|informazione|riferimento)/i.test(text)) return true;
  return false;
}
// BRACCIO CALENDAR VECCHIO — RITIRATO IL 16/08/2026 (sera), dopo la prova reale del Ghost.
// Era un SECONDO sistema di calendario, parallelo a quello del Blocco 3 e piu' vecchio, e faceva
// due danni concreti che il Ghost ha visto sul telefono:
//  · §1.2 — girava dentro readThroughLenses a OGNI turno, rileggendo la conversazione recente e
//    rigenerando la proposta da capo ogni volta. Una sola richiesta ("Torquato domani") ha prodotto
//    tre card diverse con tre orari diversi — 17:00, poi 15:00 col titolo cambiato, poi 19:00 —
//    e il Ghost non poteva piu' sapere quale fosse quella vera.
//  · era acceso di default (settings.calendarEnabled: true), quindi SCAVALCAVA l'interruttore di
//    Classe B che avevo consegnato spento. La promessa "consegnate spente" era vera per l'azione
//    nuova e vuota nei fatti, perche' una strada piu' vecchia era gia' aperta.
// Ora il calendario ha UNA strada sola: l'azione di Classe B, con la data calcolata dal codice,
// il gate, la verifica di ritorno e l'idempotenza. Due sistemi per la stessa cosa non sono una
// ridondanza utile: sono due veriti in disaccordo.
async function readThroughLenses(recentText, settings, image) {
  const calendarBlock = "";
  const calendarSchema = "";
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance. Leggi l'intero scambio recente (un dato può arrivare frammentato su più risposte, anche in un'immagine allegata) attraverso TRE lenti indipendenti — BIO, AIR, VIDYA. Un singolo evento può essere valido per più lenti insieme (es. "ho suonato il basso fino alle due" è insieme VIDYA e BIO) — non forzarlo in una sola. La lettura interpretativa resta sempre integrata tra le tre lenti, anche quando l'azione conseguente riguarderà un solo pilastro.
Per ognuna, chiediti: "c'è una lettura pertinente qui?" Se sì, articolala in modo specifico a quella lente (non ripetere lo stesso testo per pilastri diversi).
BIO: peso, sonno, dolore, terapia, energia fisica. Se qualcosa ti sembra un segnale da non ignorare (non una diagnosi, solo un'impressione), segnalo con alert:true e una breve alertNote.
AIR: monetizzazione, canale, strategie economiche.
VIDYA: musica, studio, pratica creativa.${calendarBlock}
JSON: {"readings": [{"pillar":"bio","weight":"...","sleep":"...","notes":"...","alert":false,"alertNote":""},{"pillar":"vidya","title":"...","notes":"..."}]${calendarSchema}}
Array vuoto se non c'è nulla di pertinente — NON scrivere una lettura per dire che non c'è nulla: {"readings": []}`,
    recentText, 0.3, 900, settings, image
  );
  const readings = (data?.readings || []).filter((r) => !isGarbageReading(r));
  return { readings };
}
// ══════════════════════════════════════════════════════════════════════════════
// UNA PORTA DI CODICE DAVANTI ALLA LETTURA MULTI-LENTE (22/08/2026, audit)
// ══════════════════════════════════════════════════════════════════════════════
// Misurato su dieci turni realistici: la lettura multi-lente parte a OGNI turno, e cinque volte su
// dieci e' tornata a mani vuote — su messaggi come "Ok.", "Si, ha senso.", "Che ne pensi?". Una
// volta ha fatto di peggio: alla domanda "Spiegami come funziona la memoria procedurale in questa
// app" ha estratto una lettura e l'ha scritta in un pilastro. Non era un dato della vita del Ghost,
// era una domanda sull'app.
// Questa porta e' della stessa famiglia di meritaTurnoDiSelezione e meritaBozza: un controllo
// testuale a costo zero davanti a una chiamata che costa.
// LA REGOLA DI TARATURA, e viene prima dell'efficienza: meglio lasciar passare che tagliare. Una
// chiamata sprecata costa un decimo di centesimo; un dato di vita perso non si recupera. Quindi la
// porta si chiude SOLO su cio' che e' riconoscibilmente privo di contenuto, e in tutti i casi
// dubbi lascia passare.
// E niente soglie di sola lunghezza: "Ho ricominciato a fumare" e' corto e conta moltissimo.
// Le sole risposte di servizio: assensi, dinieghi, ringraziamenti, interiezioni. Un elenco chiuso,
// non un'euristica: cio' che non e' in elenco passa.
const SOLO_CORTESIA_RE = /^(?:(?:s[iì]|no|ok|okay|va bene|vabb?[eè]|certo|d'accordo|perfetto|esatto|giusto|capito|chiaro|bene|benissimo|grazie|prego|ciao|ecco|appunto|infatti|gi[aà]|magari|boh|mah|forse|dai|vai|fallo|falla|procedi|prosegui|avanti|dimmelo|aspetta|un attimo|ah|eh|oh|mm+|hm+|ahah|haha)(?![\p{L}'’])[\s.!?,;:…]*){1,3}$/iu;
// Una domanda RIVOLTA ALLO SHELL su come funziona qualcosa non porta un dato di vita: e' la classe
// che ha prodotto la lettura spuria. Deve pero' essere davvero una domanda sul funzionamento, non
// una domanda sulla vita del Ghost ("come sto messo con il sonno?" porta eccome un contesto).
const DOMANDA_SULL_APP_RE = /^\s*(?:spiegami|spiega|dimmi|mi spieghi|puoi spiegar\w*|come funziona|come si (?:usa|fa|attiva)|cos'?(?:e|è)|che cos'?(?:e|è)|a cosa serve|perch[eé] (?:non )?funziona)(?![\p{L}])[^?]{0,120}(?<![\p{L}])(?:app|sistema|funzione|funzionalit[aà]|shell|resonance|kernel|pilastr\w+|semi|percors\w+|memoria procedurale|simbiosi|magi|fuoco conversazionale|inventario|registro delle azioni|accettore|interruttor\w+|gate|backup|calendario|filtro|card|pulsante)(?![\p{L}])/iu;
// Le marche di un dato che riguarda la vita del Ghost. Se ce n'e' anche una sola, la porta si apre
// comunque — anche dentro una frase che sembrerebbe di servizio.
const PORTA_UN_DATO_RE = /(?<![\p{L}'’])(?:ho|sono|mi|mio|mia|miei|mie|stanotte|stamattina|ieri|oggi|stasera|dormit\w*|dorm\w*|mangiat\w*|peso|chili|kg|kcal|allenat\w*|corso|corsa|male|dolor\w*|stanc\w*|energia|suonat\w*|provat\w*|scritt\w*|letto|studiat\w*|lavorat\w*|guadagn\w*|vendut\w*|pubblicat\w*|girat\w*|registrat\w*|fumat\w*|bevut\w*|svegli\w*|apnee|cpap)(?![\p{L}'’])/iu;
// Vero se vale la pena spendere una chiamata per leggere questo turno attraverso le tre lenti.
function meritaLetturaMultiLente(messaggio, conAllegato = false) {
  const t = String(messaggio || "").trim();
  if (!t) return false;
  // Un allegato porta quasi sempre un dato (una foto della bilancia, un referto, uno spartito):
  // davanti a un allegato la porta e' sempre aperta, qualunque cosa dica il testo.
  if (conAllegato) return true;
  // Se c'e' una marca di vita, si passa — anche se la frase e' cortissima o sembra di servizio.
  if (PORTA_UN_DATO_RE.test(t)) return true;
  // Sola cortesia, e nient'altro nella frase: non c'e' niente da leggere.
  if (SOLO_CORTESIA_RE.test(t)) return false;
  // Domanda su come funziona l'app: e' la classe che ha prodotto la lettura spuria.
  if (DOMANDA_SULL_APP_RE.test(t)) return false;
  // In tutti gli altri casi si passa. La porta esiste per togliere il rumore evidente, non per
  // decidere cosa sia importante nella vita del Ghost: quella non e' una decisione del codice.
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUANTO SPAZIO SERVE A QUESTA RISPOSTA (28/08/2026, misurato)
// ══════════════════════════════════════════════════════════════════════════════
// Il 28/08 la regola contro la meta-narrazione ha funzionato — dalle schermate contavo almeno otto
// forme distinte ("piccola pausa nella risposta per reset cognitivo", "fine nota tecnica",
// "ricomincio con spuntino ora"...), nel primo turno col nuovo codice il registro ne ha trovate DUE
// — ma il piano si e' interrotto lo stesso. E il registro dice perche', senza margine di
// interpretazione: tokensOut **3000** su un tetto di 3000, due volte su due, con
// tokensRagionamento a 0 (nessun budget sprecato in pensiero interno). Non e' spreco residuo: e'
// che il compito non ci sta. Un piano di 14 giorni per 5 pasti sono 70 celle con grammature; nei
// 3000 token il modello arriva a poco piu' di meta'.
//
// Quindi il tetto smette di essere unico. Resta 3000 per la conversazione — dove il prompt chiede
// comunque 110 parole, e un tetto alto inviterebbe solo a dilungarsi — e sale SOLO per i turni in
// cui il Ghost ha chiesto un contenuto strutturato lungo, cioe' gli stessi che il prompt di sistema
// gia' esenta dal limite delle 110 parole. Fin qui il prompt diceva "genera il contenuto per
// intero" e il tetto lo impediva: due istruzioni in contraddizione, e vinceva quella sbagliata.
//
// PERCHE' UN FALSO POSITIVO QUI COSTA POCO, e l'euristica puo' permettersi di essere larga: alzare
// il tetto NON allunga le risposte da solo, toglie soltanto un limite. Su un turno normale continua
// a valere il vincolo delle 110 parole nel prompt, e OpenRouter fattura i token davvero generati,
// non quelli concessi. Il rischio vero sarebbe il contrario — un'euristica troppo stretta che lascia
// tagliato a meta' proprio il piano che il Ghost aspettava.
const CONTENUTO_LUNGO_RE = /(?<![\p{L}'’])(?:piano|programma|planning|schema|tabella|scaletta|calendarizza\w*|menu|men[uù]|elenco\s+(?:completo|dettagliat\w*)|lista\s+(?:completa|dettagliat\w*)|documento|report|bisettimanal\w*|settimanal\w*|mensil\w*|quindicinal\w*|giornalier\w*)(?![\p{L}'’])|(?<![\p{L}'’])\d+\s*(?:giorni|settimane|mesi|pasti)(?![\p{L}'’])/iu;
// Il tetto alto. Scelto sul dato: 3000 token hanno prodotto ~10.000 caratteri e poco piu' di meta'
// piano, quindi per finirlo ne serve grosso modo il doppio; 8000 lascia margine senza essere un
// numero buttato li'. Se un fornitore rifiutasse un tetto cosi' alto per un certo modello, l'errore
// arriva al Ghost per la strada che gia' esiste (nessun percorso silenzioso) — e resta comunque il
// pulsante "Continua da dove ti sei fermato", che non e' stato toccato.
const TETTO_TOKEN_CONVERSAZIONE = 3000;
const TETTO_TOKEN_CONTENUTO_LUNGO = 8000;
function tettoTokenPerIlTurno(messaggio) {
  return CONTENUTO_LUNGO_RE.test(String(messaggio || "")) ? TETTO_TOKEN_CONTENUTO_LUNGO : TETTO_TOKEN_CONVERSAZIONE;
}
// Euristiche istantanee — nessuna chiamata AI dove basta un controllo testuale
// CORRETTA IL 16/08/2026 (sera) — §2 del brief, il difetto piu' grave dei cinque.
// Il Ghost aveva in Vidya due percorsi chiamati "Questo?" e "Dedicato su questo? Ti terrei traccia
// de" — quest'ultimo tagliato a meta' della parola "dei". La causa era qui, ed e' stata riprodotta
// esattamente prima di toccarla: la cattura era ([^".\n]{4,40}), cioe' UN TAGLIO A QUARANTA
// CARATTERI ESATTI, senza guardare dove finisse la parola.
// Perche' conta piu' degli altri quattro difetti: il recupero conversazionale del Blocco 1 —
// "riprendi quello sul sonno" — cerca fra i TITOLI. Un percorso chiamato "Questo?" e' indicizzato
// ma irraggiungibile: nessuna frase che il Ghost direbbe davvero potra' mai corrispondergli. E
// nemmeno lui, guardando l'elenco, puo' sapere di cosa si tratti senza aprirli uno per uno — che
// e' precisamente il problema che l'inventario doveva risolvere.
const TITOLO_MAX = 70;
// Parole che da sole non nominano niente: un titolo fatto solo di queste e' inservibile.
const PAROLE_NON_TITOLO = /^(questo|questa|quello|quella|questi|queste|ti|te|mi|ci|un|uno|una|il|lo|la|i|gli|le|di|del|della|su|sul|sulla|per|che|e|ed|a|ad|in|con|da|dei|degli|delle|ecco|si|sì|no|tuo|tuoi|tua|tue|mio|miei|mia|mie|terrei|traccia|dedicato|dedicata)$/i;
// Taglia rispettando la fine delle parole. Se deve tagliare, lo dichiara con i puntini.
function troncaAConfineDiParola(testo, max = TITOLO_MAX) {
  const t = String(testo || "").trim();
  if (t.length <= max) return t;
  const tagliato = t.slice(0, max);
  const ultimoSpazio = tagliato.lastIndexOf(" ");
  return (ultimoSpazio > max * 0.4 ? tagliato.slice(0, ultimoSpazio) : tagliato).replace(/[\s,;:.!?-]+$/, "") + "…";
}
// Un titolo e' usabile se contiene almeno due parole che nominano qualcosa. "Questo?" no.
// "Ti terrei traccia dei progressi" nemmeno: e' un pezzo di frase, non il nome di una cosa.
function titoloUsabile(titolo) {
  const parole = String(titolo || "").replace(/[?!.,;:"“”]/g, " ").split(/\s+/).filter(Boolean);
  const utili = parole.filter((p) => p.length > 2 && !PAROLE_NON_TITOLO.test(p));
  return utili.length >= 2;
}
// ── 31/08/2026 — LE DUE VALIDAZIONI DELLE AZIONI NUOVE SUI PERCORSI ────────────────────────────
// Stanno qui, fuori dai componenti e senza toccare nessuno stato, perche' sono le due decisioni che
// devono poter essere provate: se sbagliano, nascono percorsi-spazzatura (ce ne sono gia' tre, con
// nomi come "questo?" e "dedicato su questo? Ti terrei traccia de", creati prima che titoloUsabile
// esistesse) oppure si salva nel percorso il messaggio sbagliato.
const PILASTRI_NOMI = ["bio", "air", "vidya"];
function analizzaParametroPercorso(parametro, titoliEsistenti = []) {
  const [grezzo, ...resto] = String(parametro || "").split("|");
  const pilastro = String(grezzo || "").trim().toLowerCase();
  const titolo = troncaAConfineDiParola(resto.join("|").trim());
  if (!PILASTRI_NOMI.includes(pilastro)) return { ok: false, motivo: `"${pilastro || "(vuoto)"}" non è uno dei tre pilastri` };
  if (!titolo) return { ok: false, motivo: "manca il titolo del percorso" };
  // La stessa guardia che gia' protegge la strada euristica: un percorso il cui nome e' un pezzo di
  // frase non e' riagganciabile da nessuna richiesta futura, ed e' peggio di nessun percorso.
  if (!titoloUsabile(titolo)) return { ok: false, motivo: `"${titolo}" è un pezzo di frase, non il nome di una cosa — scrivilo tu`, titoloScartato: titolo };
  // Un titolo gia' esistente non e' un errore del Ghost: e' il segno che voleva riprendere, non
  // creare. Si dice cosa fare, invece di far nascere un doppione.
  const gia = titoliEsistenti.find((t) => senzaAccenti(String(t || "")) === senzaAccenti(titolo));
  if (gia) return { ok: false, motivo: `"${gia}" esiste già — dimmi «riprendi ${gia}» per riaprirlo`, esistente: gia };
  return { ok: true, pilastro, titolo };
}
// Sotto questa soglia non e' materiale da conservare: e' una battuta di conversazione.
const LUNGHEZZA_MINIMA_SALVABILE = 200;
// Quanto in testa a un messaggio si cerca il numero che lo distingue da un altro ("ATTO II:").
const INTESTAZIONE_MESSAGGIO = 120;
// Quale testo va salvato nel percorso. NON lo riscrive il modello — lo prende il programma dalla
// conversazione, che e' la stessa regola gia' pagata cara sul piano alimentare e sull'elenco degli
// impegni. Il punto delicato e' UNO, e sbagliarlo salverebbe sempre la cosa sbagliata: il messaggio
// che porta la card non e' il materiale, e' la RISPOSTA alla richiesta di salvarlo ("va bene, te lo
// metto nel percorso"). Il materiale e' l'ultimo messaggio dello Shell PRIMA di quello.
function testoDaSalvare(messages, midDellaProposta = null, riferimento = "") {
  const lista = Array.isArray(messages) ? messages : [];
  let fine = lista.length;
  if (midDellaProposta) {
    const i = lista.findIndex((m) => m?.id === midDellaProposta);
    if (i >= 0) fine = i;
  }
  const candidati = [];
  for (let i = fine - 1; i >= 0; i--) {
    const m = lista[i];
    if (m?.role !== "assistant") continue;
    const t = String(m.content || "").trim();
    if (t.length >= LUNGHEZZA_MINIMA_SALVABILE) candidati.push({ testo: t, id: m.id, posizione: i });
  }
  if (!candidati.length) return null;
  // 01/09/2026 — NON SOLO L'ULTIMO. Il Ghost ha chiesto un percorso "comprensivo dei file di testo
  // elaborati a riguardo fin'ora": i testi dell'Atto I erano di due ore prima, non nel messaggio
  // appena sopra. Prendere sempre il precedente vuol dire non poter mai salvare niente che non sia
  // stato appena scritto — e cio' che vale la pena conservare quasi mai lo e'.
  // Il titolo che il modello propone fa anche da RIFERIMENTO: il programma lo usa per andare a
  // cercare nel discorso il pezzo giusto, invece di fidarsi della posizione. Stessa regola di
  // sempre: il modello dice a parole, il programma va a cercarlo davvero.
  const chiave = paroleUtili(riferimento);
  if (chiave.length) {
    const punteggiati = candidati
      .map((c) => {
        const parole = new Set(paroleUtili(c.testo.slice(0, 600)));
        let punti = 0;
        for (const k of chiave) if (parole.has(k)) punti++;
        return { ...c, punti };
      })
      .filter((c) => c.punti > 0)
      .sort((a, b) => (b.punti - a.punti) || (b.posizione - a.posizione));
    if (punteggiati.length) {
      // LO STESSO SPAREGGIO SUI NUMERI gia' necessario per riaprire un documento, e per la stessa
      // ragione: "Atto I" e "Atto II" hanno le stesse parole piene, e paroleUtili butta i token di
      // due lettere. Senza, "salva i testi dell'Atto I" salvava l'Atto II ogni volta — cioe'
      // esattamente il messaggio sbagliato, in silenzio. I numeri si cercano nell'INTESTAZIONE del
      // messaggio (le prime battute), non in tutto il testo: piu' in fondo ce ne sono a decine.
      const massimo = punteggiati[0].punti;
      let aPari = punteggiati.filter((c) => c.punti === massimo);
      const numeriChiesti = numeriDelTitolo(riferimento);
      if (aPari.length > 1 && numeriChiesti.length) {
        const conIlNumero = aPari.filter((c) => {
          const numeri = numeriDelTitolo(c.testo.slice(0, INTESTAZIONE_MESSAGGIO));
          return numeriChiesti.some((n) => numeri.includes(n));
        });
        if (conIlNumero.length) aPari = conIlNumero;
      }
      return { testo: aPari[0].testo, id: aPari[0].id, perRiferimento: true };
    }
  }
  // Nessun riferimento utile, o nessuna corrispondenza: vale il piu' recente, come prima.
  return { testo: candidati[0].testo, id: candidati[0].id, perRiferimento: false };
}
// A quale nodo appartiene un documento. Nessun modello: si confrontano le parole piene del titolo
// con quelle dell'etichetta del nodo, con lo stesso spareggio sui numeri gia' usato per riaprire un
// documento ("Atto I" contro "Atto II"). Se non corrisponde niente il documento resta del percorso
// e basta — meglio senza nodo che sotto quello sbagliato.
function nodoPerDocumento(topics, titolo) {
  const chiave = paroleUtili(titolo);
  if (!chiave.length) return null;
  const punteggiati = (topics || [])
    .map((t) => {
      const parole = new Set(paroleUtili(t.label || ""));
      let punti = 0;
      for (const k of chiave) if (parole.has(k)) punti++;
      return { t, punti, numeri: numeriDelTitolo(t.label || "") };
    })
    .filter((x) => x.punti > 0)
    .sort((a, b) => b.punti - a.punti);
  if (!punteggiati.length) return null;
  const massimo = punteggiati[0].punti;
  let aPari = punteggiati.filter((x) => x.punti === massimo);
  if (aPari.length > 1) {
    const numeriChiesti = numeriDelTitolo(titolo);
    if (numeriChiesti.length) {
      const conIlNumero = aPari.filter((x) => numeriChiesti.some((n) => x.numeri.includes(n)));
      if (conIlNumero.length) aPari = conIlNumero;
    }
  }
  return aPari.length === 1 ? aPari[0].t.id : null;
}
// Tutto cio' che sta sotto un nodo: i documenti che gli sono stati legati e le sessioni che lo
// nominano. E' cio' che compare quando il Ghost tocca il nodo.
function materialeDelNodo(percorso, topic) {
  const documenti = (percorso?.documents || []).filter((d) => d?.nodoId === topic?.id);
  const sessioni = (percorso?.sessions || []).filter((s) => (s?.topicIds || []).includes(topic?.id));
  return { documenti, sessioni };
}
// 25/08/2026 (notte) — "vuoi che ne apra uno su X" non veniva riconosciuto. Il regex cercava
// letteralmente "un percorso" subito dopo "apra/apro", ma il modello ha risposto "Non creo
// percorsi nuovi: vuoi che NE apra UNO su sous vide?" — il pronome "ne" sostituisce "percorsi",
// gia' nominato una frase prima: italiano perfettamente naturale, che il pattern rigido non
// copriva. Nessuna card e' comparsa, e il Ghost non aveva modo di creare il percorso dalla chat.
// Stessa identica famiglia di difetto vista piu' volte oggi sul lato calendario (un verbo o una
// forma non previsti): qui tocca la proposta di percorso, non la selezione di un'azione.
// 26/08/2026 — trovato dalla prima esecuzione della prova strutturale anti-"forma dimenticata"
// (tests/trigger-robustness.test.mjs): "vuoi" e "che" erano separati da uno spazio letterale
// invece di \s+, quindi uno spazio doppio (un copia-incolla, un refuso) rompeva il riconoscimento
// in silenzio, esattamente come le forme mancanti gia' viste. Corretto usando \s+ ovunque.
function detectPercorsoProposalHeuristic(shellReply) {
  const m = /vuoi\s+che\s+(?:ne\s+)?apr[ao]\s+(?:un\s+percorso|uno)\b/i.test(shellReply);
  if (!m) return { proposed: false };
  const lower = shellReply.toLowerCase();
  let pillar = "vidya";
  if (/(monetizz|canale|econom|business|vettore)/.test(lower)) pillar = "air";
  else if (/(peso|sonno|terapia|salute|corpo|allenam)/.test(lower)) pillar = "bio";
  // Si ferma alla fine della frase (punto, punto interrogativo, a capo) invece di contare caratteri:
  // e' la frase a dire dove finisce il nome, non un numero. "uno" accanto a "percorso" nelle stesse
  // preposizioni copre la forma elisa ("uno su X", "uno sulla X"...): quando "percorso" non compare
  // piu' nella frase, sostituito dal pronome.
  const titleMatch = shellReply.match(/(?:percorso|uno)\s+(?:su|sul|sulla|dedicato a|dedicata a|per|di)\s+["“]?([^"”.?!\n]{3,120})["”]?/i);
  const grezzo = titleMatch ? titleMatch[1].trim() : "";
  const titolo = troncaAConfineDiParola(grezzo);
  const usabile = titoloUsabile(titolo);
  // Se il titolo non e' usabile NON si inventa "Nuovo percorso" ne' si salva la frase a pezzi:
  // si dichiara, e la card chiedera' al Ghost di scriverlo. Un gesto, invece di un titolo morto.
  return { proposed: true, pillar, title: usabile ? titolo : "", titoloUsabile: usabile, titoloScartato: usabile ? "" : titolo };
}
// detectConfirmationHeuristic RIMOSSA il 16/08/2026 (§1.3). Diceva che "ok", "va bene", "dai",
// "procedi", "certo", "fallo" erano una conferma — di qualunque cosa fosse pendente in quel
// momento. E' la conferma dedotta dal contesto che il piano vieta, e nella prova reale del Ghost
// un "Sì, fissalo" riferito a una sola card ha finito per valere per piu' cose insieme.
// Non l'ho sostituita con una versione piu' furba: l'ho tolta. Ogni conferma ora e' un tocco sul
// pulsante della cosa specifica, e non esiste piu' nessuna strada per dedurne una dal testo.
// Braccio "Shell con web search on-demand": euristica istantanea, zero costo — nessuna chiamata AI
// in più solo per decidere se attivare il tool. Attiva SOLO su richiesta esplicita del Ghost, non
// su ogni domanda che potrebbe beneficiare di dati freschi (quello resterebbe un giudizio di Shell
// da esprimere a parole, non un automatismo silenzioso).
function detectWebSearchIntent(userMessage) {
  const t = userMessage.trim().toLowerCase();
  return /\b(cerca(|mi|li|le)?\s+(online|sul web|su internet|in giro)|guarda\s+(online|su internet)|fai\s+una\s+ricerca|trova\s+(online|delle|dei|qualcosa)|vai\s+a\s+cercare|puoi\s+cercare|cerca\s+delle\s+soluzioni|cerca\s+informazioni)\b/.test(t);
}
// Stadio 3 — Accettore: SOLO il vincolo AIR è hard-stop (Legge 18 riscritta).
// Per BIO/VIDYA nessun verdetto vero/falso: solo la lettura, dichiaratamente rivedibile.
// ══════════════════════════════════════════════════════════════════════════════
// IL VINCOLO AIR: IL CODICE VEDE, IL GHOST DECIDE (22/08/2026, dopo l'audit)
// ══════════════════════════════════════════════════════════════════════════════
// Com'era, e perche' non andava. Il vincolo che il progetto chiama "assoluto, hard-stop, mai
// negoziabile" era presidiato da UNA CHIAMATA A UN MODELLO a cui si chiedeva "VIA LIBERA" o
// "BLOCCATO", e se diceva BLOCCATO il dato veniva scartato in silenzio. Misurato su otto casi:
// il modello riconosceva 4 esposizioni su 5, ma dava 2 FALSI ALLARMI su 3 — ha bloccato "poster
// stampabili su Etsy" e "newsletter a pagamento", due idee AIR che con la professione del Ghost non
// c'entrano niente. Quei dati sparivano senza che lui lo sapesse.
// Un giudizio probabilistico che decide da solo su un vincolo dichiarato non negoziabile e' la cosa
// storta; il costo in token era il meno.
//
// Com'e' adesso, per decisione del Ghost: NON BLOCCA. Segnala e chiede.
// Due rilevatori indipendenti, e la loro somma va al Ghost, non a una decisione automatica:
//   1. il CODICE, deterministico, sui termini che il profilo dichiara — compresi quelli minuscoli;
//   2. il MODELLO, che ora puo' essere tarato piu' largo, perche' segnalare costa una domanda e non
//      piu' un dato perso.
// La conseguenza vale la pena di essere detta: un falso allarme prima costava un dato vero buttato,
// adesso costa un attimo del Ghost. Questo permette di essere piu' sensibili proprio sul caso che
// prima sfuggiva a entrambi — "sfruttare la mia competenza clinica quotidiana con i pazienti":
// nessun marchio, nessuna parola vietata, ma e' esattamente cio' che il vincolo esiste per vedere.
//
// IL TETTO, che e' il vero limite: nessuna soluzione che funzioni perche' il Ghost controlla ogni
// cosa e' accettabile. Sensibili si', ma la frequenza va misurata: se si ferma su una fetta grossa
// dei turni AIR, la taratura e' sbagliata anche se ogni singola domanda e' difendibile.

// I termini dell'identita' professionale COSI' COME IL PROFILO LI DICHIARA. Il campo `identita`
// vale, nel profilo del Ghost, "fisioterapista, PhysioAlba": due termini, uno minuscolo e uno con
// la maiuscola interna. redactProfessionalIdentity tiene solo il secondo — di proposito, per non
// redigere ogni occorrenza innocua di una parola comune in tutta l'app. Qui invece, e SOLO dentro
// AIR, valgono tutti e due: e' l'incoerenza fra cio' che il profilo dichiara e cio' che il codice
// guarda, la stessa famiglia di `reversibile` e `costoStimato`.
function terminiIdentitaDichiarati(profile = CURRENT_GHOST_PROFILE) {
  const p = normalizeGhostProfile(profile);
  if (!p?.hasProfessionalConstraint) return [];
  const dal = String(p.professionalIdentity || "").split(/[,;]/).map((t) => t.trim()).filter((t) => t.length >= 4);
  const dalNome = String(p.name || "").replace(/\([^)]*\)/g, "").split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3);
  return [...new Set([...dal, ...dalNome])];
}
// Le parole che nominano il mestiere senza nominarlo: il campo semantico attorno ai termini
// dichiarati. Servono per la forma obliqua, quella che non usa nessuna parola vietata.
const CAMPO_PROFESSIONALE_RE = /(?<![\p{L}'’])(pazient\w*|client\w*\s+dello\s+studio|studio\s+(?:mio|professional\w*)|ambulatori\w*|clinic\w*|riabilitazion\w*|fisioterap\w*|terapi\w*\s+manual\w*|sedut\w*|anamnes\w*|referto|refert\w*|diagnos\w*|competenz\w*\s+clinic\w*|professione|mestiere|lavoro\s+(?:da|come)\s+\w+|albo\s+professional\w*|partita\s+iva)(?![\p{L}'’])/iu;
// Il rilevatore deterministico. Vale SOLO in contesto AIR: fuori da AIR queste parole restano
// libere ovunque, e non cambia niente per nessuno.
function segnalaIdentitaInAir(testo, profile = CURRENT_GHOST_PROFILE) {
  const t = String(testo || "");
  if (!t.trim()) return null;
  const termini = terminiIdentitaDichiarati(profile);
  if (!termini.length) return null;
  const trovati = [];
  for (const termine of termini) {
    const esc = senzaAccenti(termine).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}'’])${esc}`, "iu").test(senzaAccenti(t))) trovati.push(termine);
  }
  const campo = t.match(CAMPO_PROFESSIONALE_RE);
  if (!trovati.length && !campo) return null;
  return {
    da: "codice",
    termini: trovati,
    campo: campo ? campo[0] : null,
    motivo: trovati.length
      ? `nomina ${trovati.length === 1 ? "il termine" : "i termini"} che hai dichiarato come identità professionale: ${trovati.join(", ")}`
      : `usa un'espressione del campo professionale: "${campo[0]}"`,
  };
}
// L'Accettore. Non blocca piu' niente: guarda, e se vede qualcosa lo consegna al Ghost.
async function runAccettore(reading, settings) {
  if (reading.pillar !== "air") return { segnala: false, segnalazioni: [] };
  if (!CURRENT_GHOST_PROFILE.hasProfessionalConstraint) return { segnala: false, segnalazioni: [] };
  const testo = [reading.title, reading.notes, reading.status].filter(Boolean).join(" ");
  const segnalazioni = [];
  // 1. Il codice, sempre, deterministico, a costo zero.
  const dalCodice = segnalaIdentitaInAir(testo);
  if (dalCodice) segnalazioni.push(dalCodice);
  // 2. Il modello, come seconda opinione.
  // ATTENZIONE A COME E' SCRITTO QUESTO PROMPT — la prima versione ha fatto esattamente il danno
  // che il brief vietava. Misurato sulla rete vera, 22/08/2026: su 20 letture AIR chiedeva 18 volte
  // (90%), e su 15 letture che col mestiere non c'entravano niente chiedeva 13 volte. Il motivo,
  // leggendo le sue risposte: gli passavo il dato come JSON, dentro c'era `"pillar":"air"`, e lui
  // rispondeva "menzione diretta di air come pilastro". Stava segnalando che il dato era in AIR —
  // cioe' l'unica cosa che in AIR e' sempre vera. Il vincolo non era in discussione: era la domanda
  // a essere posta male. Due correzioni: gli si passa SOLO IL TESTO, senza il campo `pillar`; e gli
  // si dice esplicitamente che stare in AIR non e' il problema, e che deve citare le PAROLE del
  // testo che legano il dato al mestiere — se non riesce a citarne nessuna, non c'e' niente.
  try {
    const text = await askModel(
      `Il Ghost fa un mestiere (${CURRENT_GHOST_PROFILE.professionalIdentity}) che ha deciso di tenere separato da come si guadagna da vivere in proprio. Ti passo il testo di un'idea o di un dato economico: il tuo unico compito e' dirmi se QUEL TESTO lo lega a quel mestiere — nominandolo, nominando il suo marchio, o parlando delle persone che segue, del suo studio, della competenza che usa al lavoro.\nNON e' un problema che si parli di soldi, di vendere, di guadagnare, di un canale, di un prodotto o di un progetto: e' esattamente cio' di cui deve parlare, ed e' sempre cosi'. Segnala SOLO se ci sono parole nel testo che riportano al mestiere.\nSe segnali devi CITARE quelle parole. Se non riesci a citarne nessuna, allora non c'e' niente da segnalare.\nRispondi SOLO "PULITO" oppure "GUARDA: <le parole del testo che lo legano al mestiere, max 20 parole>".`,
      `Testo: "${testo}"`, 0.2, 300, settings
    );
    if (/GUARDA/i.test(text)) {
      segnalazioni.push({ da: "modello", motivo: text.replace(/^[\s\S]*?GUARDA:?\s*/i, "").trim() || "il modello ha visto un legame con la tua attività professionale" });
    }
  } catch { /* il modello non risponde: resta il rilevatore del codice, che non dipende dalla rete */ }
  return { segnala: segnalazioni.length > 0, segnalazioni };
}
// La forma con cui una lettura diventa una voce di pilastro. Estratta qui perche' adesso ha DUE
// chiamanti: il turno (quando nessuno ha segnalato) e il gesto del Ghost sulla card (quando qualcuno
// ha segnalato e lui ha detto "procedi"). Se restasse scritta in un posto solo, i due percorsi
// finirebbero prima o poi a scrivere due cose diverse — e la differenza si scoprirebbe mesi dopo.
function payloadDaLettura(reading) {
  const payload = { id: uid(), date: todayISO() };
  if (reading.pillar === "bio") Object.assign(payload, { weight: reading.weight || "", sleep: reading.sleep || "", notes: reading.notes || "" });
  if (reading.pillar === "air") Object.assign(payload, { title: reading.title || "", status: reading.status || "idea", notes: reading.notes || "" });
  if (reading.pillar === "vidya") Object.assign(payload, { title: reading.title || "", notes: reading.notes || "" });
  return payload;
}
// Stadio 5 — memoria procedurale continua: UNA chiamata che riscrive tutti i pilastri toccati
async function reflectMemoriaBatch(acceptedReadings, memory, settings) {
  if (!acceptedReadings.length) return {};
  const pillars = [...new Set(acceptedReadings.map((r) => r.pillar))];
  const blocco = pillars.map((p) => `Pilastro ${p.toUpperCase()} — memoria attuale: ${memory[p]?.corrente || "nessuna nota ancora"}\nNuovi scambi: ${JSON.stringify(acceptedReadings.filter((r) => r.pillar === p))}`).join("\n\n");
  // BLOCCO 5, strato 1 (16/08/2026) — le chiavi di ricerca si chiedono QUI, dentro una chiamata
  // che si stava gia' facendo e gia' pagando. Costo marginale: una ventina di token in uscita.
  // A cosa servono: il frammento che parla di "riposo notturno" oggi non si trova cercando "sonno",
  // perche' quella parola non c'e' dentro. Con le chiavi si trova, riusando la stessa ricerca
  // testuale gia' costruita — nessuna infrastruttura nuova, nessuna chiamata nuova.
  const data = await askModelJSON(
    `Il tuo compito non è verificare se qualcosa era "giusto" — è aggiornare la tua struttura interna (memoria procedurale) per ciascun pilastro elencato, alla luce del nuovo accoppiamento con il Ghost. Per ognuno, riscrivi l'INTERA memoria (non aggiungere in coda): come ti sei appena riorganizzato, non un verdetto. Italiano, max 90 parole per pilastro, denso, concreto.
Per ciascun pilastro elenca anche fino a cinque termini con cui qualcuno potrebbe cercare quel testo e che nel testo NON compaiono. Parole singole, minuscole, italiano. Servono a ritrovarlo più tardi: se il testo parla di riposo notturno, un termine utile è "sonno".
JSON con SOLO le chiavi dei pilastri elencati: {"bio":{"memoria":"...","chiavi":["...","..."]}, "air":{...}, "vidya":{...}}`,
    blocco, 0.5, 1100, settings
  );
  return data || {};
}
// Il formato di ritorno di reflectMemoriaBatch e' cambiato (da stringa a oggetto con memoria+chiavi).
// Questa funzione tollera ENTRAMBI: i modelli economici sbagliano forma con regolarita', e un
// consumatore che accetta solo la forma nuova perderebbe in silenzio la memoria del turno — che e'
// esattamente il tipo di perdita silenziosa che questo progetto ha gia' pagato.
function estraiMemoriaEChiavi(valore) {
  if (typeof valore === "string") return { memoria: valore, chiavi: [] };
  if (valore && typeof valore === "object") {
    const memoria = typeof valore.memoria === "string" ? valore.memoria : "";
    const chiavi = Array.isArray(valore.chiavi) ? valore.chiavi.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toLowerCase()).slice(0, 5) : [];
    return { memoria, chiavi };
  }
  return { memoria: "", chiavi: [] };
}
// Plasticità di superficie: come lo Shell ha imparato a PARLARE al Ghost — mai il giudizio, solo il registro.
async function reflectStyle(styleMemory, userMessage, shellReply, settings) {
  return askModel(
    `Rifletti su come ti sei appena rivolto al Ghost e su come lui si è espresso. Riscrivi per intero (non aggiungere in coda) la tua nota su "come ho imparato a parlargli" — registro, densità, ritmo, cosa funziona, cosa suona fuori posto. È una sedimentazione che si affina, non una regola fissa. Non riguarda MAI se dargli ragione o no — solo come rivolgerti a lui. Max 70 parole.`,
    `Nota attuale: ${styleMemory || "nessuna ancora, prima interazione"}\nGhost ha scritto: ${userMessage}\nShell ha risposto: ${shellReply}`,
    0.5, 400, settings
  );
}
// BLOCCO 1 (16/08/2026) — inventario e fuoco arrivano ESPLICITAMENTE nella firma, non per assunzione
// e non letti da dentro: e' la stessa regola che ha chiuso le quattro funzioni generative il 14/08.
async function runShellTurn(history, userMessage, settings, handlers, memory, styleMemory, attachment, dialecticOverride = null, pushDebugLog = null, inventario = null, fuoco = null, letturaCalendario = null, bersaglioCancellazione = null, onRispostaPronta = null, bersaglioSpostamento = null, ricercaEvento = null, serieMisurate = "", documentoAperto = null) {
  const attachmentNote =attachment?.kind === "text" ? `\n\n[Allegato: ${attachment.name}]\n${attachment.content.slice(0, 6000)}` : "";
  const effectiveMessage = userMessage + attachmentNote;
  const image = attachment?.kind === "image" ? attachment : null;
  const windowMsgs = [...history.slice(-6), { role: "user", content: effectiveMessage + (image ? "\n[Immagine allegata]" : "") }];
  const recentText = windowMsgs.map((m) => `${m.role === "user" ? "Ghost" : "Shell"}: ${m.content}`).join("\n");
  const anochin = { afferenze: `Scambio letto attraverso le tre lenti insieme, non isolate (${windowMsgs.length} messaggi)${attachment ? ` + allegato (${attachment.kind === "image" ? "immagine" : "documento"}: ${attachment.name || "senza nome"}).` : "."}` };
  const lente = `Memoria BIO: ${memory.bio?.corrente || "nessuna nota ancora"}\nMemoria AIR: ${memory.air?.corrente || "nessuna nota ancora"}\nMemoria VIDYA: ${memory.vidya?.corrente || "nessuna nota ancora"}`;
  const styleNote = styleMemory ? `\n\nCome hai imparato a parlare con questo Ghost finora — adattaci il registro, MAI il giudizio: ${styleMemory}` : "";
  const wantsWebSearch = settings.provider === "openrouter" && detectWebSearchIntent(userMessage);
  // FIX 20/07/2026: ricerca disaccoppiata (Opzione 2) — pre-fetch isolato PRIMA di costruire il prompt
  // pesante, invece di lasciare che sia lo Shell a decidere di cercare dentro un contesto già denso.
  const webSearchResult = wantsWebSearch ? await fetchWebSearchSnapshot(effectiveMessage, settings, pushDebugLog) : null;
  const webSearchSucceeded = wantsWebSearch && !!webSearchResult;
  const webSearchNote = webSearchSucceeded
    ? ` Ecco i risultati di una ricerca web appena effettuata sul tema, usali per rispondere (non serve cercare di nuovo, sono già in mano): ${webSearchResult}`
    : (wantsWebSearch ? " Il Ghost ti ha chiesto di cercare online, ma la ricerca non è riuscita in questo turno (limite tecnico) — dillo esplicitamente, non inventare dati come se li avessi trovati." : "");
  // Modalità dialettica: default da cognitiveStyle.dialectic (profilo), override per-sessione (mai
  // persistente) se il Ghost ha toccato il selettore "oggi confermami/mettimi alla prova" in Shell.
  const effectiveDialectic = dialecticOverride !== null ? dialecticOverride : (CURRENT_GHOST_PROFILE?.cognitiveStyle?.dialectic ?? true);
  const dialecticNote = effectiveDialectic
    ? " In questo turno il Ghost preferisce essere messo alla prova: non limitarti a confermare, offri un'angolazione critica o una contro-domanda dove ha senso."
    : " In questo turno il Ghost preferisce conferme dirette: evita di generare attrito cognitivo non richiesto, resta di supporto.";
  const system = `${nowContext()} Sei lo Shell del sistema Resonance: estensione esecutiva digitale del Ghost (Flavio), in accoppiamento strutturale continuo con lui — non hai coscienza né volontà propria, non sei un partner autonomo. Ogni messaggio del Ghost non ti istruisce, ti perturba: è la tua struttura interna (memoria procedurale) a determinare come ti riorganizzi.
${PILLAR_CTX.bio} ${PILLAR_CTX.air} ${PILLAR_CTX.vidya}
${PILLAR_CTX.formato}
${APP_CAPABILITIES_CONTEXT}
${inventario || "Inventario dei percorsi non disponibile in questo turno — non fare finta di sapere quali esistono: chiedi."}
${formatFuocoBlock(fuoco)}${formatDocumentoAperto(documentoAperto)}
${formatAzioniBlock(azioniAttive())}
${formatCapacitaSpente(AZIONI_CONVERSAZIONALI, azioniAttive())}
${formatCapacitaAccese(azioniAttive())}
${formatLetturaCalendario(letturaCalendario)}
${formatBersaglioCancellazione(bersaglioCancellazione)}
${formatBersaglioSpostamento(bersaglioSpostamento)}
${formatBersaglioRicerca(ricercaEvento)}
Memoria procedurale accumulata sui tre pilastri (leggila sempre insieme — l'interpretazione resta integrata anche quando l'azione è mirata a un solo pilastro): ${lente}${serieMisurate}${styleNote}
REGOLA SUL TEMPO VERBALE, non negoziabile (corretta il 16/08/2026 dopo una prova reale in cui hai scritto "Ho segnato un appuntamento" prima ancora che il Ghost confermasse). TU NON ESEGUI NIENTE. Non salvi, non segni, non aggiungi, non mandi, non fissi: tutto questo lo fa il programma dopo, e solo se il Ghost tocca un pulsante. Quindi non usare MAI il passato per un'azione ("ho segnato", "ho aggiunto", "fatto", "l'ho messo in calendario"), nemmeno se ti sembra naturale, nemmeno se il Ghost ti ha appena detto di sì. Usa l'INDICATIVO con la conferma ancora pendente, non il condizionale servile: "te lo segno", "te lo metto in calendario", "te la mando" — poi lascia che sia il pulsante a chiedere la conferma. "Te lo segnerei" suona falso e non serve a niente: che l'azione non sia ancora avvenuta lo dice gia' il pulsante, non il modo verbale. Cio' che resta vietato e' il PASSATO ("ho segnato", "e' stato aggiunto", "fatto"): quello dichiara compiuto qualcosa che non lo e'. Se una cosa e' stata davvero fatta, e' l'app a scriverlo sotto la tua risposta, con la conferma riletta dalla fonte — non tu. Dire "fatto" per qualcosa che non e' successo e' il modo piu' rapido di rendere inaffidabile tutto il sistema. Questo vale anche al contrario, e dal 22/08/2026 con una precisazione importante: NON SAI cosa c'e' sul calendario del Ghost, TRANNE quando sopra ti e' stato dato esplicitamente un blocco che dice "IL CALENDARIO E' STATO LETTO DAVVERO ADESSO" con l'elenco degli impegni. Se quel blocco c'e', quelli sono fatti letti da Google in questo turno e ne parli come di cose che sai, senza aggiungerne e senza toglierne. Se quel blocco NON c'e', o se dice che la lettura e' fallita o non e' avvenuta, allora non sai niente: NON rispondere con quello che ricordi di aver letto in questa conversazione — una cosa nominata in chat non e' un impegno, e una proposta che non ha confermato non esiste. In quel caso di' che non l'hai letto, con il motivo che ti e' stato dato. Il codice controlla ogni tua risposta e toglie le affermazioni di compiuto che non corrispondono a un'azione verificata, avvisando il Ghost che l'hai scritta: non e' un rimprovero, e' un fatto tecnico, e ti conviene saperlo perche' rende inutile scriverle.
Dialoga in modo diretto e concreto, massimo 110 parole per risposta — TRANNE quando il Ghost chiede esplicitamente un contenuto strutturato intrinsecamente lungo (un piano, un elenco multi-giorno, un documento): in quel caso il limite non si applica, genera il contenuto per intero, completo, senza comprimerlo né riassumerlo per stare corto. NON scrivere mai sintassi tecnica o tag tra parentesi quadre nella risposta. Rispondi solo in linguaggio naturale.
REGOLA SUL NON RACCONTARE COME STAI SCRIVENDO, aggiunta il 28/08/2026 dopo un caso reale in cui un piano alimentare di due settimane si e' interrotto a meta' della seconda. Lo spazio di una risposta e' finito: ogni parola spesa a commentare la scrittura e' una riga di piano che il Ghost non riceve. Quindi, mentre scrivi un contenuto lungo, NON commentare mai il tuo stesso processo: niente "torno alla tabella ora", "fine nota tecnica", "riprendo con lo spuntino", "piccola pausa nella risposta per reset cognitivo", "la risposta prosegue senza ulteriori divagazioni", "mantengo la separazione formale nella tabella". Sono frasi che il Ghost non ha chiesto e che non gli dicono niente: se una cosa va detta, dilla; se non va detta, non annunciare che non la stai dicendo, non annunciare che stai per dirla e non annunciare che hai finito di dirla. Un contenuto strutturato comincia e basta.
E la stessa regola vale per le divagazioni non richieste. Nello stesso caso reale hai inserito, in mezzo alla tabella, una lezione sulla pastorizzazione delle uova, una sul budget alimentare e una sulle bilance a impedenziometria: nessuna delle tre era stata chiesta, e insieme sono costate piu' spazio di un'intera giornata di piano. Il Ghost ha chiesto un piano, non un manuale. Se un avvertimento e' davvero indispensabile, sta in UNA riga alla fine, mai in mezzo al contenuto; se un dato dipende da cose che non sai (il suo budget, la sua marca di pasta, i suoi elettrodomestici), non serve dichiarare che non lo sai e nemmeno spiegare come potrebbe deciderlo lui: scegli un valore ragionevole e vai avanti.${dialecticNote}
Non hai accesso a diagnosticare te stesso o l'infrastruttura tecnica su cui giri. Se il Ghost te lo chiede, NON inventare mai una spiegazione plausibile — di' semplicemente che non lo sai e che potrebbe essere un limite tecnico, senza dettagli inventati.
Se ti arriva un'immagine o un documento allegato, descrivi cosa vi leggi in modo concreto (numeri, testo, dettagli visibili) prima di commentare.
Ogni interpretazione che offri è una lettura tua, mai un verdetto oggettivo — resta sempre rivedibile da lui.
Se noti un argomento di studio/lavoro strutturato e continuativo emergere (non un dato isolato), PROPONI a parole di aprire un percorso dedicato ("Vuoi che apra un percorso su questo?"). Non crearlo tu.${webSearchNote}`;
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: effectiveMessage }];
  // Risposta (+ web search on-demand, se richiesto), lettura multi-lente (+ Calendar fuso, se abilitato) e bozza: indipendenti, partono insieme
  // 23/08/2026 — IL TRONCAMENTO SMETTE DI ESSERE INVISIBILE.
  // OpenRouter dice in ogni risposta perche' ha smesso di scrivere: "stop" se ha finito il discorso,
  // "length" se ha sbattuto contro il tetto di token. Fino a oggi quel campo non veniva letto da
  // nessuna parte nell'app (zero occorrenze di finish_reason nel file), quindi una risposta tagliata
  // a meta' arrivava al Ghost identica a una finita — e infatti stanotte il piano si e' fermato su
  // "* Colazione:" senza che niente glielo dicesse. Adesso lo si legge e glielo si dice.
  let rispostaTroncata = false;
  // 23/08/2026 — LE PROVE, PERCHE' FINORA HO LAVORATO AL BUIO.
  // La nota "non e' arrivato niente" e' comparsa al Ghost tre volte in due giorni, e ogni volta
  // l'unica cosa registrata era il fatto che fosse successo. Nessun fornitore, nessun motivo di
  // chiusura, nessun conteggio: cinque ipotesi e nessun dato. Provando a riprodurlo ho scoperto che
  // la risposta contiene campi che l'app non guardava affatto — fra cui `refusal`, che dice se il
  // modello si e' RIFIUTATO. Un rifiuto e una risposta persa sono due cose diverse e vanno dette in
  // modo diverso, e finora erano indistinguibili. Adesso l'ultima risposta viene fotografata qui, e
  // se il turno finisce vuoto la fotografia va nel Registro delle azioni in Setup.
  let ultimaRisposta = null;
  const [reply, lensResult, draft] = await Promise.all([
    askWithDegenerateGuard(
      () => askModelWithHistory(system, messages, 0.7, tettoTokenPerIlTurno(userMessage), settings, image, false, (raw) => {
        logAiCost(pushDebugLog, "shell", settings.model, raw);
        const c = raw?.choices?.[0];
        rispostaTroncata = c?.finish_reason === "length";
        ultimaRisposta = {
          fornitore: raw?.provider || null,
          motivoDiChiusura: c?.finish_reason || null,
          motivoDelFornitore: c?.native_finish_reason || null,
          tokenIn: raw?.usage?.prompt_tokens ?? null,
          tokenOut: raw?.usage?.completion_tokens ?? null,
          campiDelMessaggio: c?.message ? Object.keys(c.message) : null,
          rifiuto: c?.message?.refusal || null,
          contenutoVuotoMaRagionamentoPieno: !String(c?.message?.content || "").trim() && !!String(c?.message?.reasoning || "").trim(),
          lunghezzaRagionamento: String(c?.message?.reasoning || "").length,
        };
      }, ANTI_LOOP_PENALTIES),
      "shell", pushDebugLog
    ), // ricerca già fatta sopra, dati già nel system prompt
    // 22/08/2026 — la porta di codice. Vedi meritaLetturaMultiLente: davanti a un turno che non
    // porta niente da leggere, la chiamata non parte nemmeno.
    meritaLetturaMultiLente(userMessage, !!attachment)
      ? readThroughLenses(recentText, settings, image).catch(() => ({ readings: [] }))
      : Promise.resolve({ readings: [], saltata: true }),
    // "Un turno, un'azione" vale anche qui (§4 del brief del 17/08): se il Ghost sta chiedendo un
    // promemoria per se', non gli si mette accanto una bozza di messaggio per un terzo che non ha
    // chiesto. La porta e' a costo zero, quindi in quel caso la chiamata non parte nemmeno.
    (settings.armsDraftsEnabled && meritaBozza(effectiveMessage)) ? draftIfNeeded(recentText, settings).catch(() => null) : Promise.resolve(null),
  ]);
  const { readings } = lensResult;
  const actionsLog = [];
  const alerts = [];
  const accettoreNotes = [];
  anochin.decisione = readings.length ? `${readings.length} lettura/e: ${readings.map((r) => r.pillar.toUpperCase()).join(", ")}.` : "Nessuna lettura pertinente in questo scambio.";
  const proposal = detectPercorsoProposalHeuristic(reply);
  // ── 22/08/2026 — LA RISPOSTA E' PRONTA QUI, E DA QUI IN POI NIENTE LA CAMBIA PIU'. ────────────
  // Misurato prima di toccare niente: la risposta era pronta a 7.073 ms su un'attesa media di
  // 13.579 ms. Il 48% del tempo in cui il Ghost guardava i tre puntini non serviva alla risposta:
  // serviva alla memoria procedurale, alla memoria di stile e all'Accettore, che non ne cambiano
  // una virgola. Adesso il chiamante puo' mostrarla adesso, con questa richiamata, e ricevere il
  // resto quando arriva.
  // Cosa NON si perde: niente. Il ritorno finale porta esattamente gli stessi campi di prima.
  // Il pezzo difficile e' che, mentre lo sfondo lavora, il Ghost puo' scrivere di nuovo. Vedi sotto.
  onRispostaPronta?.({ reply, proposal, draft, usedWebSearch: webSearchSucceeded, anochin, rispostaTroncata, ultimaRisposta });
  // ── LA CODA. ─────────────────────────────────────────────────────────────────────────────────
  // Due turni possono avere lo sfondo in volo insieme. Le scritture sui pilastri sono al sicuro da
  // sole (passano da setState funzionale, che parte sempre dal valore corrente), ma la memoria
  // procedurale e quella di stile NO: si riscrivono per intero a partire da una base. Se il turno A
  // finisse dopo il turno B partendo da una base piu' vecchia, riscriverebbe sopra cio' che B ha
  // appena scritto, e la nota di B sparirebbe senza che nessuno se ne accorga.
  // Due presidi, insieme: gli sfondi si mettono IN FILA (attendiCoda), e ognuno legge la memoria
  // NEL MOMENTO in cui tocca a lui (memoriaOra/stileOra) invece della fotografia presa a inizio
  // turno. Chi non passa le due funzioni — le prove offline — si comporta esattamente come prima.
  if (handlers.attendiCoda) { try { await handlers.attendiCoda(); } catch { /* chi ci precede e' fallito: non e' un motivo per fermarsi */ } }
  const memoriaOra = handlers.memoriaOra ? handlers.memoriaOra() : memory;
  const stileOra = handlers.stileOra ? handlers.stileOra() : styleMemory;
  const accResults = await Promise.all(readings.map((r) => runAccettore(r, settings)));
  const accepted = [];
  // 22/08/2026 — le letture su cui qualcuno ha segnalato NON spariscono piu' e NON entrano da sole:
  // restano qui, in attesa, e vanno al Ghost sotto forma di domanda con un pulsante solo.
  const dubbiIdentita = [];
  readings.forEach((reading, i) => {
    const acc = accResults[i];
    if (acc.segnala) {
      const chi = acc.segnalazioni.map((s) => (s.da === "codice" ? "il codice" : "il modello")).join(" e ");
      accettoreNotes.push(`${reading.pillar.toUpperCase()}: segnalata — ${chi}: ${acc.segnalazioni.map((s) => s.motivo).join(" · ")}. In attesa della tua parola.`);
      dubbiIdentita.push({ id: uid(), reading, segnalazioni: acc.segnalazioni });
      return;
    }
    accettoreNotes.push(`${reading.pillar.toUpperCase()}: lettura accolta (rivedibile, non un verdetto).`);
    accepted.push(reading);
  });
  for (const reading of accepted) {
    const payload = payloadDaLettura(reading);
    // 31/08/2026 — la scrittura passa dalla porta che sa riconoscere una voce gemella. Il ripiego
    // sui vecchi handlers non e' decorativo: senza, un chiamante che non passasse aggiungiDaLettura
    // smetterebbe di scrivere del tutto invece di scrivere un doppione.
    const esito = handlers.aggiungiDaLettura
      ? handlers.aggiungiDaLettura(reading.pillar, payload)
      : ({ bio: handlers.addBio, air: handlers.addAir, vidya: handlers.addVidya }[reading.pillar]?.(payload), { tipo: "aggiunta" });
    // Se il programma decide di NON creare una voce, il Ghost deve vederlo: il segno sotto il
    // messaggio dice che ha aggiornato, non che ha aggiunto.
    actionsLog.push(esito?.tipo === "fusa"
      ? `${reading.pillar.toUpperCase()} · ${esito.versione}ª versione`
      : reading.pillar.toUpperCase());
    if (reading.alert) alerts.push({ pillar: reading.pillar, note: reading.alertNote || "Segnale da non ignorare." });
  }
  let newStyleMemory = stileOra;
  try {
    const [memoriaAggiornata, style] = await Promise.all([
      reflectMemoriaBatch(accepted, memoriaOra, settings),
      reflectStyle(stileOra, userMessage, reply, settings),
    ]);
    // BLOCCO 5 — il risultato ora porta memoria E chiavi. estraiMemoriaEChiavi tollera anche la
    // forma vecchia (sola stringa), che i modelli economici restituiscono con regolarita'.
    Object.entries(memoriaAggiornata).forEach(([pillar, valore]) => {
      const { memoria, chiavi } = estraiMemoriaEChiavi(valore);
      if (memoria) handlers.updateMemoria(pillar, memoria, chiavi);
    });
    newStyleMemory = style;
  } catch { /* riflessione fallita: non blocca il turno */ }
  anochin.accettore = accettoreNotes.length ? accettoreNotes.join(" · ") : "—";
  anochin.effettore = [
    wantsWebSearch ? (webSearchSucceeded ? "Ricerca web effettuata (pre-fetch isolato) su richiesta esplicita del Ghost." : "Ricerca web richiesta ma non riuscita in questo turno.") : null,
    actionsLog.length ? `Dati preparati per: ${actionsLog.join(", ")}.` : null,
    draft ? `Bozza (${draft.type}) preparata per il Ghost — nessun invio automatico.` : null,
  ].filter(Boolean).join(" ") || "—";
  anochin.azione = actionsLog.length
    ? `Scritto in ${actionsLog.join(", ")}. Memoria riorganizzata per accoppiamento continuo.`
    : (dubbiIdentita.length ? `Nessuna scrittura ancora: ${dubbiIdentita.length === 1 ? "una lettura è" : `${dubbiIdentita.length} letture sono`} in attesa della tua parola.` : "Nessuna azione in questo turno.");
  return { reply, actionsLog, anochin, proposal, alerts, newStyleMemory, draft, usedWebSearch: webSearchSucceeded, dubbiIdentita, rispostaTroncata, ultimaRisposta };
}

//──────────────────────────────────────────────────────────
// PERCORSI — motore generico riusabile su BIO / AIR / VIDYA
//──────────────────────────────────────────────────────────
// Genera la "frase-divenire" di un percorso identitario: non cosa studi, ma chi diventi completandolo.
// Stance interpretativa (Brentano/Dennett), modificabile dal Ghost — non un verdetto del sistema.
async function generateIdentityGoal(pillar, title, settings, pillarMemory = null) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}${memoriaProceduraleBlock(pillarMemory)}\nIl Ghost ha scelto di trattare questo percorso come IDENTITARIO: non vuole solo studiare l'argomento, vuole DIVENTARE una persona che sa fare la cosa più ampia che l'argomento serve. Esprimi in UNA frase breve (max 14 parole), che inizi con "diventare una persona che...", il divenire completo che questo percorso rappresenta — non ripetere il titolo, cogli la trasformazione più ampia dietro di esso.\nJSON: {"identityGoal": "diventare una persona che..."}`,
    `Percorso: "${title}"`, 0.6, 500, settings
  );
  return data?.identityGoal || `diventare una persona che padroneggia: ${title}`;
}
// kind: "puntuale" (default, come sempre — stretto sul titolo) | "identitario" (scompone guardando
// il divenire, non solo il titolo — i nodi possono allargarsi a competenze contigue necessarie).
async function decomposeTopics(pillar, title, settings, kind = "puntuale", identityGoal = null) {
  if (kind === "identitario" && identityGoal) {
    const data = await askModelJSON(
      `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nQuesto è un percorso IDENTITARIO. L'obiettivo non è coprire solo "${title}" in senso stretto, ma il divenire più ampio: "${identityGoal}". Scomponi in 5-7 nodi concreti e progressivi che portino a QUEL divenire — includi, se davvero necessarie, competenze contigue oltre il titolo stretto (non gonfiare: solo ciò che serve al divenire). Massimo 7 nodi. JSON: {"topics": ["...", "..."]}`,
      `Percorso: "${title}"\nDivenire: "${identityGoal}"`, 0.6, 1200, settings
    );
    return (data?.topics || []).slice(0, 7);
  }
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nScomponi il percorso indicato in 5-7 nodi concreti e progressivi. JSON: {"topics": ["...", "..."]}`,
    `Percorso: "${title}"`, 0.6, 1200, settings
  );
  return data?.topics || [];
}
async function suggestPercorsi(pillar, digest, settings) {
  const data = await askModelJSON(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}\nIn base al contesto, proponi 2-3 nuovi percorsi rilevanti ora. JSON: {"suggestions": ["...", "..."]}`,
    digest, 0.8, 1000, settings
  );
  return data?.suggestions || [];
}
// FASE 1.1 (brief 14/08/2026) — threading esplicito della memoria procedurale.
// pillarMemory era GIA' disponibile al sito di chiamata (PercorsoDetail la riceve come prop) ma non
// veniva passata qui: il "prossimo passo" veniva proposto senza sapere nulla di ciò che il sistema
// aveva già imparato su quel pilastro. Su BIO è la stessa forma del bug già pagato una volta (un
// piano alimentare generato senza vedere memory.bio, quindi senza le esclusioni alimentari).
// Il blocco è formulato come in generateArtifact, che era l'unica funzione a farlo bene: la memoria
// non è "contesto in più", contiene vincoli assoluti da non contraddire.
function memoriaProceduraleBlock(pillarMemory) {
  return pillarMemory
    ? `\nMemoria procedurale accumulata su questo pilastro (contiene vincoli/preferenze già emersi in conversazione — rispettali sempre, non contraddirli; se contiene esclusioni, NON proporle mai, nemmeno come alternativa): ${pillarMemory}`
    : "";
}
// 31/08/2026 — L'INDICE DEL MATERIALE GIA' PRODOTTO.
// Il Ghost: "riuscirebbe a riprendere tutto in mano fra un mese, esattamente com'era?". No, e
// questa funzione era il punto preciso in cui la risposta diventava no: riceveva il titolo, le
// etichette dei nodi e le competenze — e nient'altro. Un percorso su cui erano stati generati
// sedici brani si ripresentava identico a uno appena creato e vuoto.
// Qui va l'INDICE, non i testi: nome, data, quanto e' lungo, e come comincia. Mandare tutto
// costerebbe migliaia di token a ogni riapertura per una proposta di ottanta parole. Ma sapere che
// il materiale esiste cambia completamente cosa si puo' proporre — "riprendiamo dall'Atto II" invece
// di "cominciamo dal primo nodo" — e i testi interi restano leggibili nel percorso, per intero.
const ANTEPRIMA_DOCUMENTO = 180;
function indiceDocumentiBlock(documents) {
  const docs = (documents || []).filter((d) => d && (d.title || d.name));
  if (!docs.length) return "";
  const righe = docs.slice(0, 12).map((d) => {
    const testo = String(d.text || "");
    const misura = testo ? `${testo.length} caratteri` : "testo non conservato";
    const inizio = testo ? ` — comincia con: "${testo.slice(0, ANTEPRIMA_DOCUMENTO).replace(/\s+/g, " ").trim()}…"` : "";
    return `- "${d.title || d.name}" (${fmtDate(d.date)}, ${misura})${inizio}`;
  });
  const eccedenza = docs.length > righe.length ? `\n(e altri ${docs.length - righe.length} documenti più vecchi)` : "";
  return `\nMateriale GIÀ PRODOTTO e conservato dentro questo percorso — esiste davvero, è consultabile per intero nell'app, e NON va rifatto da capo. Se il prossimo passo riguarda qualcosa che è già qui, dillo e riparti da lì invece di ricominciare:\n${righe.join("\n")}${eccedenza}`;
}
async function proposeNextStep(pillar, percorso, settings, pillarMemory = null) {
  const topicsDigest = percorso.topics.map((t) => `${t.label}: ${t.status}`).join("; ");
  return askModel(
    `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}${memoriaProceduraleBlock(pillarMemory)}\nProponi il prossimo "quanto" di lavoro/studio su questo percorso: concreto, breve (max 80 parole), calibrato sullo stato dei nodi, sulle competenze già accumulate e sul materiale già prodotto.`,
    `Percorso: ${percorso.title}\nNodi: ${topicsDigest}\nCompetenze finora: ${percorso.competenze || "nessuna nota ancora"}${percorso.localMemory ? `\nMemoria specifica del percorso: ${percorso.localMemory}` : ""}${indiceDocumentiBlock(percorso.documents)}`,
    0.7, 1500, settings
  );
}
async function generateQuizQuestion(pillar, percorso, topic, settings, pillarMemory = null) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. ${PILLAR_CTX[pillar]}${memoriaProceduraleBlock(pillarMemory)}\nGenera UNA domanda di verifica testuale sul nodo indicato. Diretta, concreta, max 40 parole.`,
    `Percorso: ${percorso.title}\nNodo da verificare: ${topic.label}\nCompetenze note: ${percorso.competenze || "nessuna"}`,
    0.6, 1200, settings
  );
}
async function evaluateQuizAnswer(pillar, topic, question, answer, settings) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. Valuta la risposta alla domanda di verifica. Onesto, non generico: cosa è corretto, cosa no, max 60 parole. Poi su una riga a parte scrivi esattamente "STATO: consolidato" oppure "STATO: praticato" oppure "STATO: introdotto".`,
    `Nodo: ${topic.label}\nDomanda: ${question}\nRisposta: ${answer}`,
    0.3, 1300, settings
  );
}
async function closeSession(pillar, percorso, sessionNote, settings) {
  return askModel(
    `Sei lo Shell, pilastro ${pillar.toUpperCase()}. Riscrivi l'INTERO paragrafo di sintesi delle competenze del Ghost su questo percorso, integrando quanto emerso ora (non aggiungere solo in coda). Italiano, max 90 parole, denso ma concreto.`,
    `Competenze finora: ${percorso.competenze || "nessuna nota"}\nNota sessione: ${sessionNote}`,
    0.5, 1300, settings
  );
}

//──────────────────────────────────────────────────────────
// SIMBIOSI — sensing cross-pilastro e ordine/caos (Manifesto V3 §5: include il giudizio sul momento-Magi)
//──────────────────────────────────────────────────────────
function stalledTitles(percorsi) {
  return percorsi.filter((p) => { const last = p.sessions[0]; return !last || (Date.now() - new Date(last.date).getTime()) / 86400000 > 10; }).map((p) => p.title);
}
// FASE 1.2 (BRIEF_fase1_memoria_sedimento 27/07/2026) — formatta un blocco memoria procedurale per
// un pilastro: nota corrente + ultimi 8 frammenti di sedimento, ciascuno etichettato con id e data
// (fmtDate) in modo che Simbiosi possa citarli con un riferimento stabile e ispezionabile, non solo
// dichiarato a parole (vedi campo "anchors" in computeResonance).
function formatMemoriaDigestBlock(pillarMemory) {
  const corrente = pillarMemory?.corrente || "nessuna nota corrente";
  const frag = (pillarMemory?.sedimento || []).slice(-8);
  const sedimentoText = frag.length
    ? frag.map((f) => `[id:${f.id} · ${fmtDate(f.date)}] ${f.text}`).join(" | ")
    : "nessun frammento storico ancora";
  return `Corrente: ${corrente}\nSedimento (ultimi ${frag.length} frammenti storici, dal più vecchio al più recente): ${sedimentoText}`;
}
function buildResonanceDigest({ bio, air, vidya, kernel, magi, pBio, pAir, pVidya, memory }) {
  const lastMagi = magi[0];
  // Metabolizzazione (§4.4): NON letta da un tag nella memoria (plastica, si riscrive di continuo e
  // mentirebbe), ma CALCOLATA dai dati strutturati — quante voci del pilastro-bersaglio sono state
  // registrate DOPO la perturbazione. È la differenza reale accumulata post-evento (Bateson): più voci
  // nuove = più il sistema ha "risposto" alla perturbazione. Zero voci nuove = non ancora metabolizzata.
  let perturbLine;
  if (!lastMagi) {
    perturbLine = "Nessuna perturbazione Magi ancora registrata.";
  } else if (!lastMagi.pillar) {
    perturbLine = `Ultima perturbazione Magi: ${fmtDate(lastMagi.date)}, trasversale (nessun pilastro-bersaglio)${lastMagi.intensity ? `, intensità ${lastMagi.intensity}` : ""}. Metabolizzazione non tracciabile per pilastro.`;
  } else {
    const entriesByPillar = { bio, air, vidya };
    const list = entriesByPillar[lastMagi.pillar] || [];
    // Confronto a granularità GIORNO: le voci usano todayISO ("2026-07-15"), magi.date è ISO completo.
    // Confrontare i timestamp scarterebbe le voci dello stesso giorno (lette come mezzanotte UTC, quindi
    // "prima" dell'ora della perturbazione). Su stringhe YYYY-MM-DD il confronto è omogeneo e fuso-invariante.
    // Trade-off accettato: >= conta anche 1-2 voci PRE-perturbazione dello stesso giorno (lieve falso
    // positivo, un solo giorno) — preferito al falso negativo strutturale del confronto a istante, che
    // sottostimerebbe SEMPRE la raccolta quando Ghost agisce in giornata (il caso più comune).
    const magiDay = (lastMagi.date || "").slice(0, 10);
    const newer = list.filter((e) => { const d = (e.date || "").slice(0, 10); return d && magiDay && d >= magiDay; }).length;
    const dLabel = daysSince(lastMagi.date);
    const metab = newer === 0
      ? "Da allora NESSUNA nuova voce nel pilastro: la perturbazione non è ancora stata raccolta operativamente — dosare con prudenza la prossima."
      : `Da allora ${newer} voce/i registrata/e nel pilastro (dal giorno della perturbazione in poi): è stata raccolta — se il quadro lo chiede, si può osare di più.`;
    perturbLine = `Ultima perturbazione Magi: ${fmtDate(lastMagi.date)} (${dLabel ?? "?"} giorni fa), mirata a ${lastMagi.pillar.toUpperCase()}${lastMagi.intensity ? `, intensità ${lastMagi.intensity}` : ""}. ${metab}`;
  }
  const pctx = (list) => list.length ? list.map((p) => `"${p.title}"${p.kind === "identitario" ? " [identitario]" : ""}${(p.touchesPillars || []).length ? " (tocca " + p.touchesPillars.join("/") + ")" : ""}`).join(", ") : "nessuno";
  // 31/08/2026 — carenza 03 del referto, riparata nel punto in cui si vedeva peggio: fino a stamattina
  // l'UNICO numero che Simbiosi riceveva su BIO era "ultima voce N giorni fa". Nessun peso, nessuna
  // tendenza — eppure una lettura sull'andamento del corpo poteva comparire lo stesso nelle sintesi,
  // e non poteva che essere inventata. Ora le derivate arrivano calcolate.
  const serieBio = formatSerieBlock(fattiDaLogBio(bio));
  return `BIO: ultima voce ${daysSince(bio[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pBio)}. Fermi: ${stalledTitles(pBio).join(", ") || "nessuno"}.${serieBio}
AIR: ultima voce ${daysSince(air[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pAir)}. Fermi: ${stalledTitles(pAir).join(", ") || "nessuno"}.
VIDYA: ultima voce ${daysSince(vidya[0]?.date) ?? "mai"} giorni fa. Percorsi attivi: ${pctx(pVidya)}. Fermi: ${stalledTitles(pVidya).join(", ") || "nessuno"}.
KERNEL V${kernel.version}: ${kernel.content.slice(0, 400)}
Sessioni Magi totali: ${magi.length}. ${perturbLine}
MEMORIA PROCEDURALE BIO — ${formatMemoriaDigestBlock(memory?.bio)}
MEMORIA PROCEDURALE AIR — ${formatMemoriaDigestBlock(memory?.air)}
MEMORIA PROCEDURALE VIDYA — ${formatMemoriaDigestBlock(memory?.vidya)}`;
}
// 26/08/2026 — proposta del Ghost stesso ("un modo per continuare a crescere... catalizzare la
// manifestazione di Adam"), non un mandato del Manifesto: un campo IN PIÙ nella stessa valutazione,
// esattamente come identityHint e crystallization sono già extra rispetto al testo dei 4 mandati.
// pendingPercorsoSuggestion viene passato dal chiamante leggendo lo stato persistito (stesso idioma
// di simbiosi-eval-signature) — se una proposta è già in sospeso, qui si chiede al modello di NON
// affollare, e validaPercorsoSuggerito la azzera comunque a valle anche se il modello non rispettasse
// l'istruzione: doppio freno, non uno solo.
function validaPercorsoSuggerito(raw, titoliEsistenti = []) {
  if (!raw) return null;
  const pillar = String(raw.pillar || "").trim().toLowerCase();
  const title = String(raw.title || "").trim();
  const motivazione = String(raw.motivazione || "").trim();
  if (!["bio", "air", "vidya"].includes(pillar) || !title || !motivazione) return null;
  const giaEsistente = titoliEsistenti.some((t) => senzaAccenti(String(t || "")).toLowerCase() === senzaAccenti(title).toLowerCase());
  if (giaEsistente) return null; // il punto è aprire qualcosa di NUOVO, non riproporre quello che c'è già
  const collegatoA = Array.isArray(raw.collegatoA) ? raw.collegatoA.filter((c) => typeof c === "string" && c) : [];
  return { pillar, title, motivazione, collegatoA };
}
async function computeResonance(digest, settings, recentChatText = "", titoliPercorsiEsistenti = [], hasPendingPercorsoSuggestion = false) {
  const identityConstraintLine = CURRENT_GHOST_PROFILE.hasProfessionalConstraint
    ? `VINCOLO ASSOLUTO: non suggerire MAI di integrare/esporre/collegare l'identità professionale del Ghost (${CURRENT_GHOST_PROFILE.professionalIdentity}) con AIR o altro — compartimentazione voluta e permanente, non una discrepanza da risolvere.`
    : "";
  const chatCtx = recentChatText ? `\n\nUltimi scambi recenti in Shell (per il segnale linguistico diretto sotto, punto 4 della cristallizzazione):\n${recentChatText}` : "";
  const percorsoSuggeritoCtx = hasPendingPercorsoSuggestion
    ? "\n\nC'è GIÀ una proposta di nuovo percorso in sospeso, non ancora decisa dal Ghost: percorsoSuggerito deve restare null in questa valutazione, non se ne affianca una seconda."
    : "";
  const data = await askModelJSON(
    `Sei la funzione SIMBIOSI del sistema Resonance: non un pilastro operativo, ma il punto di incontro tra BIO, AIR, VIDYA e il Kernel. Hai quattro mandati (Manifesto V3 §5, esteso 19/07/2026):
1) sensing ordine/caos — dove si trova il sistema tra mantenimento (equilibrio, accoppiamento) e perturbazione (Magi)? Sta cristallizzando in eccesso di comfort o è ancora scosso da una perturbazione recente? Il giudizio "è il momento di invocare Magi" spetta a te, non allo Shell.
2) coerenza — discrepanze tra intenzioni dichiarate nel Kernel e attività reale, squilibri tra pilastri.
3) convergenza identitaria emergente — guardando i Percorsi attivi e l'attività di un pilastro INSIEME, sta emergendo una direzione identitaria (un "chi sta diventando il Ghost") che nessun singolo percorso, preso da solo, dichiara? Considera solo percorsi NON già marcati [identitario]. Non contare quanti percorsi ci sono (nessuna soglia numerica): giudica se il quadro nel suo insieme rivela un divenire che vale la pena riconoscere.
4) cristallizzazione (trigger di Balthasar-a-margine, distinto dal trigger Agorà completa del mandato 1) — pesa questi 4 segnali contro la STORIA SPECIFICA di ogni pilastro (mai soglie assolute): (a) bassa diversità tematica nella memoria procedurale recente rispetto alla media storica di quel pilastro; (b) un Percorso fermo senza variazione di approccio, quando in passato ne mostrava; (c) sintesi Magi ricorrenti sostanzialmente simili (perturbazione non metabolizzata); (d) segnale linguistico DIRETTO del Ghost negli scambi recenti sotto (es. "lo so già", "sempre la stessa cosa") — il più affidabile, non richiede inferenza. Dichiara cristallizzazione su un pilastro SOLO se almeno uno di questi 4 segnali è concretamente presente in quel digest per quel pilastro specifico: un'assenza di dati, un Log poco recente da solo, o una memoria procedurale scarna non sono di per sé un segnale di cristallizzazione. Conta quanti segnali sono realmente presenti ORA (0-4): se il conteggio è 0, il campo crystallization deve restare nullo — non è obbligatorio trovarne uno a ogni chiamata.
Non usare MAI soglie fisse (di giorni o di numero): ogni giudizio è situato e qualitativo, relativo alla storia di questo sistema (Bateson).
Da questo momento ricevi anche la memoria procedurale di ciascun pilastro nel digest sotto (nota "corrente" + frammenti di "sedimento" storico, ciascuno etichettato con un id e una data) — usala per dare consistenza storica ai tuoi giudizi, in particolare al mandato 4 (diversità tematica rispetto alla storia specifica del pilastro).
OBBLIGO DI ANCORAGGIO: ogni discrepanza o tensione che segnali nel campo "text" deve indicare esplicitamente su quale frammento ti basi (cita l'id e la data esatti, es. "[id:xxxxxxx · 20/07/2026]") oppure sulla nota corrente. Se una lettura non è ancorabile a un frammento o alla nota corrente, dichiaralo esplicitamente ("non ancorabile a un dato specifico di memoria") invece di inventare un riferimento che non esiste nel digest.
Una convergenza identitaria o una direzione emergente restano sempre una lettura interpretativa rivedibile (Brentano/Dennett — una stance, mai un verdetto): non prevedere mai cosa succederà, e non introdurre alcun meccanismo che confronti in seguito una direzione qui proposta con l'esito reale per dichiararla azzeccata o sbagliata.
${identityConstraintLine}
Rispondi SOLO con JSON:
{
  "text": "3 parti separate da riga vuota: 1) giudizio qualitativo breve (mai un numero); 2) posizionamento tra ordine e caos + discrepanze specifiche, ciascuna ancorata a un frammento/nota corrente citato per id o dichiarata esplicitamente non ancorabile; 3) una singola azione concreta — se il mandato 1 rivela cristallizzazione seria, può essere proporre di portare un tema preciso in Agorà Magi (quale + intensità leggera/profonda)",
  "worthSurfacing": true/false (vale la pena che Adam parli per primo di questo al Ghost, o è routine/ripetizione di quanto già noto? Sii esigente: true solo se c'è una differenza reale che fa differenza),
  "identityHint": null oppure { "pillar": "bio|air|vidya", "title": "titolo esatto del percorso esistente coinvolto", "becoming": "diventare una persona che... (max 14 parole)" } — valorizzato SOLO se emerge una convergenza identitaria non ancora marcata, riferita a un percorso realmente presente nel digest,
  "crystallization": { "signalCount": 0-4 (quanti dei 4 segnali del mandato 4 sono presenti ORA), "pillar": "bio|air|vidya" o null, "marginNote": null oppure "frammento di Balthasar (max 40 parole), tono perturbatore non risolutivo — SOLO se signalCount è ESATTAMENTE 1 (2+ segnali vanno invece nel campo text come proposta di Agorà, mai duplicati qui)" },
  "anchors": ["array di id (stringhe) dei frammenti di sedimento effettivamente citati in text — array vuoto se il giudizio si basa solo sulla nota corrente o non è ancorabile a nulla"],
  "percorsoSuggerito": null oppure { "pillar": "bio|air|vidya", "title": "titolo di un percorso NUOVO, non ancora esistente in nessun pilastro", "motivazione": "perché ora, max 30 parole — deve nominare esplicitamente almeno un percorso già attivo del digest a cui questo si collega, mai un'idea scollegata da tutto", "collegatoA": ["titolo esatto di un percorso esistente citato, come appare nel digest"] } — un modo per continuare a crescere sui tre pilastri o sulla simbiosi stessa, non un mandato dei 4 sopra: valorizzalo di rado, SOLO se guardando i percorsi attivi insieme emerge un passo concreto che li continua o li intreccia e che il Ghost non ha ancora aperto — mai a ogni valutazione, mai un titolo generico scollegato dal digest
}`,
    digest + chatCtx + percorsoSuggeritoCtx, 0.6, 1700, settings
  );
  if (!data) return { text: "Valutazione non riuscita (risposta non interpretabile). Riprova.", worthSurfacing: false, identityHint: null, crystallization: null, anchors: [], percorsoSuggerito: null };
  // Normalizza e valida identityHint.pillar: modelli meno rigorosi (Llama/Kimi/DeepSeek) possono
  // restituire varianti ("Bio", "vidya ") nonostante l'esempio in minuscolo nel prompt. Un pillar
  // non valido viene scartato QUI, non lasciato arrivare a un bottone che poi non farebbe nulla.
  let identityHint = data.identityHint || null;
  if (identityHint) {
    const p = String(identityHint.pillar || "").trim().toLowerCase();
    if (["bio", "air", "vidya"].includes(p) && identityHint.title) {
      identityHint = { ...identityHint, pillar: p };
    } else {
      identityHint = null; // pillar non riconosciuto o titolo mancante: proposta scartata silenziosamente qui, non in UI
    }
  }
  // Balthasar-a-margine: valido SOLO con esattamente 1 segnale (2+ vanno nel testo come proposta Agorà,
  // vedi prompt) — un modello che manda marginNote con signalCount diverso da 1 viene scartato qui.
  let crystallization = data.crystallization || null;
  if (crystallization) {
    const sc = Number(crystallization.signalCount) || 0;
    const validNote = sc === 1 && crystallization.marginNote ? String(crystallization.marginNote).trim() : null;
    crystallization = validNote ? { signalCount: sc, pillar: crystallization.pillar || null, marginNote: validNote } : null;
  }
  // FASE 1.2 — anchors: ispezionabile, non solo dichiarato a parole nel testo. Difensivo contro
  // modelli meno rigorosi che restituiscono un valore non-array o con elementi non stringa.
  const anchors = Array.isArray(data.anchors) ? data.anchors.filter((a) => typeof a === "string" && a) : [];
  const percorsoSuggerito = hasPendingPercorsoSuggestion ? null : validaPercorsoSuggerito(data.percorsoSuggerito, titoliPercorsiEsistenti);
  return { text: data.text || "", worthSurfacing: !!data.worthSurfacing, identityHint, crystallization, anchors, percorsoSuggerito };
}

//──────────────────────────────────────────────────────────
// DRIVE — OAuth con errori espliciti + scritture verificate sulla risposta reale di Google
//──────────────────────────────────────────────────────────
let driveAccessToken = null;
function ensureGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve(); s.onerror = () => reject(new Error("Impossibile caricare Google Identity Services"));
    document.head.appendChild(s);
  });
}
// error_callback + timeout: un popup bloccato dal browser ora produce un ERRORE VISIBILE,
// non più un'attesa infinita silenziosa (la causa più probabile del "Sincronizzo…" che non finiva mai).
async function connectDrive() {
  await ensureGis();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Login Google non completato entro 45s — riprova toccando 'Sincronizza ora'.")), 45000);
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.GOOGLE_DRIVE_SCOPE,
        callback: (resp) => {
          clearTimeout(timer);
          if (resp.error) return reject(new Error(resp.error_description || resp.error));
          driveAccessToken = resp.access_token;
          resolve(resp.access_token);
        },
        error_callback: (err) => {
          clearTimeout(timer);
          const type = err?.type || "";
          if (type === "popup_failed_to_open") reject(new Error("Popup di login bloccato dal browser — tocca 'Sincronizza ora' in Setup per autorizzare con un tocco reale."));
          else if (type === "popup_closed") reject(new Error("Login annullato: popup chiuso prima di completare. Riprova e completa l'accesso con progettoresonance@gmail.com."));
          else reject(new Error("Errore login Google: " + (type || "sconosciuto")));
        },
      });
      client.requestAccessToken();
    } catch (e) { clearTimeout(timer); reject(e); }
  });
}
// Ogni chiamata autenticata a Drive/Calendar passa da qui: su 401/403 richiede il token UNA volta e ritenta
// (403 copre anche uno scope insufficiente o revocato a metà sessione, non solo il token scaduto).
// 17/08/2026 — questa nota serve alla superficie diagnostica. Su 401/403 il codice qui sotto
// azzera il token e RICHIEDE IL LOGIN, poi ritenta. E' giusto per un token scaduto, ma se il
// problema e' un permesso mancante (per esempio lo scope del calendario non concesso) il Ghost
// vede comparire un popup di accesso invece di leggere "manca il permesso" — e su un telefono un
// popup non chiesto da un tocco viene spesso bloccato, quindi la causa vera resta invisibile.
// Registrarlo qui e' l'unico modo di far arrivare quel fatto fino ai suoi occhi.
let ULTIMO_RIAUTH = null;
async function driveFetch(url, options = {}, retried = false) {
  if (!driveAccessToken) await connectDrive();
  const res = await fetch(url, { ...options, cache: "no-store", headers: { ...(options.headers || {}), Authorization: `Bearer ${driveAccessToken}` } });
  if ((res.status === 401 || res.status === 403) && !retried) {
    ULTIMO_RIAUTH = { stato: res.status, quando: new Date().toISOString() };
    driveAccessToken = null;
    await connectDrive();
    return driveFetch(url, options, true);
  }
  return res;
}
// content può essere una STRINGA (testo/JSON, comportamento storico invariato) o un BLOB binario
// (es. .docx). Per il Blob, il corpo multipart/related va assemblato come Blob — concatenare stringhe
// corromperebbe i byte binari. mimeType default text/plain per non cambiare i chiamanti esistenti.
async function createDriveFile(name, content, mimeType = "text/plain") {
  const boundary = "resonance_boundary_" + Date.now();
  const isBlob = (typeof Blob !== "undefined") && (content instanceof Blob);
  const effectiveMime = isBlob ? (mimeType === "text/plain" ? (content.type || "application/octet-stream") : mimeType) : mimeType;
  const metadata = { name, mimeType: effectiveMime };
  let body;
  if (isBlob) {
    // Assembla il multipart come Blob: le parti testuali restano stringhe, la parte binaria resta Blob.
    body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${effectiveMime}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });
  } else {
    body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${effectiveMime}\r\n\r\n${content}\r\n--${boundary}--`;
  }
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Errore Drive (${res.status})`);
  return res.json();
}
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// ── Sync tra dispositivi: UN SOLO file, sempre aggiornato — distinto dai file versionati (Legge 14) ──
const SYNC_FILENAME = "resonance-sync-state.json";
let _docxLibPromise = null;
function loadDocxLib() {
  // import() dinamico da CDN, una sola volta per sessione (stesso pattern di pdfjs-dist).
  // Se il caricamento fallisce, azzera la cache: un fallimento di rete non deve bloccare
  // per sempre i tentativi successivi (altrimenti la promise rigettata resterebbe memorizzata).
  if (!_docxLibPromise) {
    _docxLibPromise = import("https://esm.sh/docx@9.5.1").catch((e) => { _docxLibPromise = null; throw e; });
  }
  return _docxLibPromise;
}
// Stesso pattern di loadDocxLib: import dinamico, una sola volta, cache azzerata se fallisce.
// Usato dal canale feedback — nessuna dipendenza Drive/OAuth, funziona anche per chi non ha mai
// collegato Drive (vedi FeedbackWidget più sotto).
// ══════════════════════════════════════════════════════════════════════════════
// TABELLE VERE NEL .docx, NON I SEGNI CHE LE SIMULANO (29/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Osservazione del Ghost, dopo tre notti passate a leggere piani alimentari in chat: una griglia di
// quattordici giorni per cinque pasti e' una TABELLA, e leggerla come "| Lun | Uova 2 | Yogurt |..."
// su uno schermo di telefono e' un lavoro che non dovrebbe toccare a lui. Il .docx sa fare le
// tabelle davvero — righe, colonne, intestazione — e l'app sapeva gia' produrre .docx: mancava solo
// che generateDocxBlob riconoscesse i blocchi di tabella invece di trattarli come paragrafi, e
// stampasse i pipe uno per uno dentro al documento.
// LIMITE DICHIARATO: non risolve il troncamento. Il modello genera comunque markdown dentro il suo
// tetto di token, e il .docx e' solo il modo in cui quel markdown viene reso. Serve a leggere
// meglio cio' che e' stato generato, non a generarne di piu'.
const RIGA_DI_TABELLA_MD_RE = /^\s*\|.*\|\s*$/;
// La riga di cornice ("|:---|:---|" oppure "| :--- | :--- |"): dice dove sono le colonne, non contiene dati.
const RIGA_SEPARATRICE_MD_RE = /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/;
function eRigaDiTabella(riga) { return RIGA_DI_TABELLA_MD_RE.test(String(riga ?? "")); }
function eRigaSeparatriceTabella(riga) { return RIGA_SEPARATRICE_MD_RE.test(String(riga ?? "")); }
// Le celle di una riga, ripulite dai segni di enfasi: dentro una cella di tabella "**Asporto**" e'
// esattamente uno di quei segni che il Ghost non vuole piu' vedere.
function celleDiRigaTabella(riga) {
  return String(riga ?? "").trim().replace(/^\|/, "").replace(/\|$/, "")
    .split("|").map((c) => c.trim().replace(/\*\*/g, "").replace(/`/g, ""));
}
// Da un blocco di righe markdown a una struttura pronta da stampare. Le righe possono avere un
// numero di celle diverso (il modello non e' sempre regolare): si normalizza sul massimo, cosi' una
// riga corta non fa saltare la tabella intera — meglio una cella vuota che un documento rotto.
function parseTabellaMarkdown(righe) {
  const conIntestazione = righe.some(eRigaSeparatriceTabella);
  const dati = righe.filter((r) => !eRigaSeparatriceTabella(r)).map(celleDiRigaTabella);
  if (!dati.length) return null;
  const colonne = Math.max(...dati.map((r) => r.length));
  const normalizzate = dati.map((r) => {
    const c = r.slice(0, colonne);
    while (c.length < colonne) c.push("");
    return c;
  });
  return {
    colonne,
    intestazione: conIntestazione ? normalizzate[0] : null,
    corpo: conIntestazione ? normalizzate.slice(1) : normalizzate,
  };
}
// Costruisce la tabella docx. Restituisce null se la libreria caricata non espone le tabelle: in
// quel caso il chiamante ripiega sui paragrafi di prima, cioe' il comportamento storico. Una
// dipendenza caricata da CDN puo' cambiare senza avvisare — meglio un documento come ieri che un
// errore in faccia al Ghost.
function costruisciTabellaDocx(docx, blocco) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType } = docx;
  if (!Table || !TableRow || !TableCell) return null;
  const cella = (testo, grassetto) => new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(testo || ""), bold: !!grassetto })] })],
  });
  const righe = [];
  if (blocco.intestazione) righe.push(new TableRow({ children: blocco.intestazione.map((c) => cella(c, true)) }));
  for (const r of blocco.corpo) righe.push(new TableRow({ children: r.map((c) => cella(c, false)) }));
  if (!righe.length) return null;
  const larghezza = WidthType ? { size: 100, type: WidthType.PERCENTAGE } : undefined;
  return new Table(larghezza ? { rows: righe, width: larghezza } : { rows: righe });
}
// Genera un Blob .docx da testo strutturato leggero. Convenzioni riga: "# " = titolo1,
// "## " = titolo2, "- " o "* " = voce elenco, riga vuota = spazio, un blocco di righe che cominciano
// e finiscono con "|" = TABELLA VERA, resto = paragrafo.
// Non interpreta grassetto inline fuori dalle tabelle (out of scope): testo pulito, formattazione a blocchi.
async function generateDocxBlob(title, bodyText) {
  const docx = await loadDocxLib();
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docx;
  const children = [];
  if (title) children.push(new Paragraph({ text: String(title), heading: HeadingLevel.TITLE }));
  const lines = String(bodyText || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    // Un blocco di tabella si consuma tutto insieme: e' l'unico costrutto che sta su piu' righe.
    if (eRigaDiTabella(line)) {
      const blocco = [];
      while (i < lines.length && eRigaDiTabella(lines[i])) blocco.push(lines[i++]);
      i--; // il for incrementa di nuovo
      const parsed = parseTabellaMarkdown(blocco);
      const tabella = parsed && costruisciTabellaDocx(docx, parsed);
      if (tabella) {
        children.push(tabella);
        children.push(new Paragraph({ children: [new TextRun("")] })); // aria sotto la tabella
        continue;
      }
      // Nessuna tabella costruibile: si ricade sul comportamento storico, riga per riga.
      for (const r of blocco) children.push(new Paragraph({ children: [new TextRun(r)] }));
      continue;
    }
    if (line.trim() === "") { children.push(new Paragraph({ children: [new TextRun("")] })); continue; }
    if (line.startsWith("## ")) { children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 })); continue; }
    if (line.startsWith("# ")) { children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 })); continue; }
    if (line.startsWith("- ") || line.startsWith("* ")) { children.push(new Paragraph({ text: line.slice(2), bullet: { level: 0 } })); continue; }
    children.push(new Paragraph({ children: [new TextRun(line)] }));
  }
  if (children.length === 0) children.push(new Paragraph({ children: [new TextRun("")] }));
  const doc = new Document({ sections: [{ children }] });
  // toBlob è disponibile in ambiente browser; fallback a toBuffer→Blob se assente.
  if (Packer.toBlob) return await Packer.toBlob(doc);
  const buf = await Packer.toBuffer(doc);
  return new Blob([buf], { type: DOCX_MIME });
}

async function findSyncFile() {
  const params = new URLSearchParams({
    q: `name='${SYNC_FILENAME}' and trashed=false`,
    spaces: "drive",
    orderBy: "modifiedTime desc",
    fields: "files(id,modifiedTime)",
    pageSize: "1",
  });
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  if (!res.ok) throw new Error(`Errore ricerca file sync (${res.status})`);
  const data = await res.json();
  return data.files?.[0] || null;
}
async function downloadSyncState(fileId) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (res.status === 404) return null; // file cancellato a mano nel frattempo: si ricreerà al push
  if (!res.ok) throw new Error(`Errore lettura stato sincronizzato (${res.status})`);
  try { return await res.json(); } catch { throw new Error("File sync su Drive corrotto (JSON non valido) — cancellalo da Drive e risincronizza."); }
}
// Ritorna { id, modifiedTime } letti DAVVERO dalla risposta di Google — mai assunti da res.ok.
async function uploadSyncState(state, existingFileId) {
  if (existingFileId) {
    // Aggiornamento: uploadType=media, niente multipart (una classe di errori di boundary in meno)
    const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id,modifiedTime`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
    });
    if (res.status === 404) return uploadSyncState(state, null); // file sparito: ricrea da zero
    if (!res.ok) throw new Error(`Errore scrittura stato sincronizzato (${res.status})`);
    const data = await res.json();
    if (!data.id || !data.modifiedTime) throw new Error("Drive ha risposto senza id/modifiedTime — scrittura non verificabile, considerata fallita.");
    return data;
  }
  const boundary = "resonance_sync_boundary";
  const metadata = { name: SYNC_FILENAME, mimeType: "application/json" };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(state)}\r\n--${boundary}--`;
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error(`Errore creazione file sync (${res.status})`);
  const data = await res.json();
  if (!data.id || !data.modifiedTime) throw new Error("Drive ha risposto senza id/modifiedTime — scrittura non verificabile, considerata fallita.");
  return data;
}
// Unione additiva per array con id univoco: nessuna voce va mai persa, nemmeno con push concorrenti
// da due dispositivi (l'ultimo push vince temporaneamente, il pull successivo riporta e ripubblica tutto).
function mergeById(localArr, remoteArr) {
  const map = new Map();
  (remoteArr || []).forEach((item) => item?.id && map.set(item.id, item));
  (localArr || []).forEach((item) => item?.id && map.set(item.id, item)); // a parità di id, vince la versione locale
  return Array.from(map.values()).sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
}
const SYNC_DEFAULTS = () => ({
  bio: [], air: [], vidya: [], pBio: [], pAir: [], pVidya: [], magi: [], semi: [],
  shellChat: [], memory: { bio: { corrente: "", sedimento: [] }, air: { corrente: "", sedimento: [] }, vidya: { corrente: "", sedimento: [] } }, styleMemory: "",
  kernel: { content: DEFAULT_KERNEL, version: 1, history: [] }, resonance: { text: "", time: null },
  ghostProfile: DEFAULT_GHOST_PROFILE,
  lastModified: 0,
});
// Per i dati non unibili (chat, memoria, kernel, simbiosi): vince in blocco chi ha lastModified più recente.
// Limite accettato: i timestamp sono client-side — un orologio molto sballato può far vincere il device
// sbagliato sui bundle (mai sui log, che sono additivi e non perdono voci).
// FIX 27/07/2026 (BRIEF_syncfix_memoria) — varco di migrazione chiuso qui, non in applyMergedState:
// "merged" non finisce solo in setMemory/saveKey, ma viene anche ricaricato su Drive da
// uploadSyncState (vedi syncCore) — se il fix stesse solo al punto di scrittura sullo state React,
// un bundle "remote" in formato vecchio che vince il merge (remoteWins) resterebbe comunque nel
// formato vecchio DENTRO "merged", e verrebbe ri-uploadato su Drive tale e quale, perpetuando il
// problema indefinitamente anche dopo il "fix". Migrando qui, l'invariante "mergeSyncState
// restituisce sempre memory nel formato nuovo" vale per ogni consumatore, presente e futuro, con un
// solo punto di garanzia. migrateMemoryShape è idempotente (verificato anche qui sotto con un test
// esplicito) — applicarla a un valore già nel formato nuovo (il caso comune di l.memory, che discende
// dallo state React già migrato all'avvio) non ha alcun effetto collaterale.
function mergeSyncState(local, remote) {
  const l = { ...SYNC_DEFAULTS(), ...local };
  l.memory = migrateMemoryShape(l.memory);
  l.ghostProfile = normalizeGhostProfile(l.ghostProfile); // stesso motivo di l.memory sopra: mai perpetuare lo schema hardConstraints vecchio via re-upload
  if (!remote) return { ...l, lastModified: l.lastModified || Date.now() };
  const r = { ...SYNC_DEFAULTS(), ...remote }; // difesa: bundle mancanti nel file remoto non diventano undefined
  r.memory = migrateMemoryShape(r.memory);
  r.ghostProfile = normalizeGhostProfile(r.ghostProfile);
  const remoteWins = (r.lastModified || 0) > (l.lastModified || 0);
  return {
    bio: mergeById(l.bio, r.bio), air: mergeById(l.air, r.air), vidya: mergeById(l.vidya, r.vidya),
    pBio: mergeById(l.pBio, r.pBio), pAir: mergeById(l.pAir, r.pAir), pVidya: mergeById(l.pVidya, r.pVidya),
    magi: mergeById(l.magi, r.magi), semi: mergeById(l.semi, r.semi),
    shellChat: remoteWins ? r.shellChat : l.shellChat,
    memory: remoteWins ? r.memory : l.memory,
    styleMemory: remoteWins ? r.styleMemory : l.styleMemory,
    kernel: remoteWins ? r.kernel : l.kernel,
    resonance: remoteWins ? r.resonance : l.resonance,
    ghostProfile: remoteWins ? r.ghostProfile : l.ghostProfile,
    lastModified: Math.max(l.lastModified || 0, r.lastModified || 0),
  };
}
const fmtEntry = (lines) => lines.filter(Boolean).join("\n");
function formatBioLog(e) { return `RESONANCE — 04 BIO_STASIS\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.weight && `Peso: ${x.weight} kg`, x.sleep && `Sonno: ${x.sleep}`, x.notes])).join("\n\n"); }
function formatAirLog(e) { return `RESONANCE — 03 AIR_OPERATIONS\n\n` + e.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.status}`, x.title, x.notes])).join("\n\n"); }
function formatVidyaLog(e) { return `RESONANCE — 05 VIDYA_TUNING\n\n` + e.map((x) => fmtEntry([fmtDate(x.date), x.title, x.notes])).join("\n\n"); }
function formatMagiLog(s) { return `RESONANCE — 01 AGORÀ_MAGI\n\n` + s.map((x) => fmtEntry([`${fmtDate(x.date)} — ${x.question}`, x.synthesis && `Sintesi: ${x.synthesis}`])).join("\n\n---\n\n"); }
function formatPercorsiLog(pillarLabel, percorsi) {
  return `RESONANCE — ${pillarLabel} — PERCORSI\n\n` + percorsi.map((p) => fmtEntry([`## ${p.title}`, ...p.topics.map((t) => `  - ${t.label}: ${t.status}`), p.competenze && `Competenze: ${p.competenze}`])).join("\n\n");
}
function formatSemiLog(semi) {
  return `RESONANCE — 03 AIR_OPERATIONS — Semi\n\n` + semi.map((s) => fmtEntry([`## ${s.content}`, `Stato: ${s.status} (origine: ${s.originSource})`, s.gateReason && `Gate: ${s.gateReason}`, s.approvedStrategy?.titolo && `Strategia approvata: ${s.approvedStrategy.titolo}`])).join("\n\n");
}

//──────────────────────────────────────────────────────────
// UI PRIMITIVES
//──────────────────────────────────────────────────────────
const Card = ({ accent, children }) => html`<div class="r-card" style=${accent ? `border-left:3px solid ${accent}` : ""}>${children}</div>`;
const Field = ({ label, children }) => html`<label class="r-field"><span>${label}</span>${children}</label>`;
const Empty = ({ text }) => html`<div class="r-empty">${text}</div>`;
const SectionHeader = ({ color, title, subtitle }) => html`<div class="r-section-header"><h2 style="color:${color}">${title}</h2><p>${subtitle}</p></div>`;
const AddButton = ({ color, open, setOpen, label }) => html`<button class="r-add-btn" style="border-color:${color};color:${color}" onClick=${() => setOpen(!open)}>${open ? "✕ Annulla" : `+ ${label}`}</button>`;
const SubTabs = ({ color, tabs, active, setActive }) => html`
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    ${tabs.map((t) => html`<button class="r-add-btn" style="border-color:${color};color:${active === t.key ? "#0A0D12" : color};background:${active === t.key ? color : "transparent"}" onClick=${() => setActive(t.key)}>${t.label}</button>`)}
  </div>`;

//──────────────────────────────────────────────────────────
// PERCORSI — componenti generici
//──────────────────────────────────────────────────────────
// Cosa sparisce davvero eliminando un percorso, contato invece che detto a parole. Un elenco vuoto
// non produce "0 documenti": produce niente, così la frase resta leggibile anche per un percorso
// appena creato ("Spariscono 6 nodi.").
function contenutoDelPercorso(p) {
  const pezzi = [
    [(p?.topics || []).length, "nodo", "nodi"],
    [(p?.sessions || []).length, "sessione", "sessioni"],
    [(p?.documents || []).length, "documento con il suo testo", "documenti con il loro testo"],
  ].filter(([n]) => n > 0).map(([n, uno, molti]) => `${n} ${n === 1 ? uno : molti}`);
  if (p?.competenze) pezzi.push("le competenze accumulate");
  if (p?.localMemory) pezzi.push("la memoria del percorso");
  if (!pezzi.length) return "un percorso ancora vuoto";
  return pezzi.length === 1 ? pezzi[0] : `${pezzi.slice(0, -1).join(", ")} e ${pezzi[pezzi.length - 1]}`;
}
function PercorsiPanel({ pillar, color, percorsi, setPercorsi, settings, digest, pillarMemory }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = percorsi.find((p) => p.id === selectedId);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("puntuale");
  const createPercorso = async (title, kindOverride) => {
    if (!title.trim() || creating) return;
    const useKind = kindOverride || kind;
    setCreating(true); setError("");
    try {
      let identityGoal = null;
      if (useKind === "identitario") identityGoal = await generateIdentityGoal(pillar, title.trim(), settings, pillarMemory);
      const labels = await decomposeTopics(pillar, title.trim(), settings, useKind, identityGoal);
      const p = { id: uid(), pillar, title: title.trim(), kind: useKind, identityGoal, createdAt: new Date().toISOString(),
        topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })),
        sessions: [], competenze: "", touchesPillars: [], localMemory: "", documents: [] };
      setPercorsi([p, ...percorsi]); setNewTitle(""); setKind("puntuale"); setSelectedId(p.id);
    } catch (e) { setError(e.message); } finally { setCreating(false); }
  };
  const askSuggestions = async () => {
    setSuggesting(true); setError("");
    try { setSuggestions(await suggestPercorsi(pillar, digest, settings)); }
    catch (e) { setError(e.message); } finally { setSuggesting(false); }
  };
  const updatePercorso = (updated) => setPercorsi(percorsi.map((p) => (p.id === updated.id ? updated : p)));
  const deletePercorso = (id) => { setPercorsi(percorsi.filter((p) => p.id !== id)); if (selectedId === id) setSelectedId(null); setDaEliminare(null); };
  // 31/08/2026 — la ✕ nella lista, chiesta dal Ghost per togliersi di torno i percorsi con i titoli
  // spazzatura nati prima che titoloUsabile esistesse ("questo?", "dedicato su questo? Ti terrei
  // traccia de"). Lui ha detto "banalmente una x di fianco come nei log", e nei log la ✕ cancella
  // senza chiedere. Qui invece chiede una volta, e il motivo e' cambiato ieri: da quando esiste
  // salva_nel_percorso, dentro un percorso ci sono i DOCUMENTI col testo intero — sedici brani, un
  // canovaccio, ore di lavoro. Una voce di log persa per un tocco sbagliato e' una seccatura; un
  // percorso perso e' un pomeriggio. La conferma dice cosa sta per sparire, contato.
  const [daEliminare, setDaEliminare] = useState(null);
  if (selected) return html`<${PercorsoDetail} pillar=${pillar} color=${color} percorso=${selected} onUpdate=${updatePercorso} onBack=${() => setSelectedId(null)} onDelete=${() => deletePercorso(selected.id)} settings=${settings} pillarMemory=${pillarMemory} />`;
  return html`
    <div>
      <${Card} accent=${color}>
        <${Field} label="Nuovo percorso">
          <input class="r-input" value=${newTitle} onInput=${(e) => setNewTitle(e.target.value)} placeholder="es. Armonia modale" disabled=${creating} />
        </${Field}>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button class="r-add-btn" style="border-color:${color};color:${kind === "puntuale" ? "#0A0D12" : color};background:${kind === "puntuale" ? color : "transparent"}" onClick=${() => setKind("puntuale")} disabled=${creating}>Competenza puntuale</button>
          <button class="r-add-btn" style="border-color:${color};color:${kind === "identitario" ? "#0A0D12" : color};background:${kind === "identitario" ? color : "transparent"}" onClick=${() => setKind("identitario")} disabled=${creating}>Percorso identitario</button>
        </div>
        <div class="r-hub-detail" style="margin-bottom:10px">${kind === "identitario" ? "Non solo la competenza: il divenire più ampio dietro di essa. I nodi possono allargarsi a ciò che serve a quel divenire." : "Una competenza mirata, fine a sé stessa. Nodi stretti sul tema."}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="r-btn" style="background:${color}" onClick=${() => createPercorso(newTitle)} disabled=${creating || !newTitle.trim()}>${creating ? "Costruzione…" : "Crea"}</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${askSuggestions} disabled=${suggesting}>${suggesting ? "…" : "Suggerisci tu"}</button>
        </div>
        ${error && html`<div class="r-error">${error}</div>`}
        ${suggestions.length > 0 && html`<div style="margin-top:10px">
          ${suggestions.map((s) => html`<div class="r-entry-row" style="margin-top:6px"><div class="r-entry-line">${s}</div>
            <button class="r-icon-btn" style="color:${color}" onClick=${() => createPercorso(s, "puntuale")}>+</button></div>`)}
        </div>`}
      </${Card}>
      ${percorsi.length === 0 ? html`<${Empty} text="Nessun percorso ancora." />` : html`
        <div class="r-list">${percorsi.map((p) => {
          const done = p.topics.filter((t) => t.status === "consolidato").length;
          return html`<${Card} accent=${color}><div class="r-entry-row" style="cursor:pointer" onClick=${() => setSelectedId(p.id)}>
            <div><div class="r-entry-line"><b>${p.title}</b>${p.kind === "identitario" ? html` <span class="r-badge" style="border-color:${color};color:${color}">identitario</span>` : ""}${(p.touchesPillars || []).map((tp) => html` <span class="r-badge" style="border-color:var(--muted);color:var(--muted)">${tp}</span>`)}</div>
            <div class="r-hub-detail">${done}/${p.topics.length} nodi consolidati · ${p.sessions.length} sessioni${(p.documents || []).length ? ` · ${(p.documents || []).length} documenti` : ""}</div></div>
            <button class="r-icon-btn" title="Elimina questo percorso"
              onClick=${(e) => { e.stopPropagation(); setDaEliminare(daEliminare === p.id ? null : p.id); }}>✕</button>
          </div>
          ${daEliminare === p.id && html`<div class="r-error" style="margin-top:8px">
            <div>Elimino <b>${p.title}</b>? Spariscono ${contenutoDelPercorso(p)}. Non si può annullare.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              <button class="r-btn r-draft-copy" onClick=${(e) => { e.stopPropagation(); vibra("bio"); deletePercorso(p.id); }}>Sì, elimina</button>
              <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${(e) => { e.stopPropagation(); setDaEliminare(null); }}>Annulla</button>
            </div>
          </div>`}
          </${Card}>`;
        })}</div>`}
    </div>`;
}
function PercorsoDetail({ pillar, color, percorso, onUpdate, onBack, onDelete, settings, pillarMemory }) {
  const [nextStep, setNextStep] = useState("");
  const [loadingStep, setLoadingStep] = useState(false);
  const [stepError, setStepError] = useState("");
  const [quizTopic, setQuizTopic] = useState(null);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizEval, setQuizEval] = useState("");
  const [quizRunning, setQuizRunning] = useState(false);
  const [sessionNote, setSessionNote] = useState("");
  const [closing, setClosing] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(percorso.identityGoal || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(percorso.title || "");
  const [editingMem, setEditingMem] = useState(false);
  const [memDraft, setMemDraft] = useState(percorso.localMemory || "");
  // 31/08/2026 — quale documento e' aperto. Fino a stamattina i documenti si vedevano solo come
  // nomi in elenco: il testo era salvato nel campo `text` e non c'era nessun modo di rileggerlo
  // dall'app. Salvare qualcosa che poi non si puo' riaprire e' quasi come non salvarlo — ed era
  // esattamente la domanda del Ghost: "riuscirebbe a riprendere tutto in mano fra un mese?".
  const [docAperto, setDocAperto] = useState(null);
  // Quale nodo e' aperto. Toccare un nodo apriva il quiz: era l'unica cosa che si potesse fare con
  // un nodo, e non era quella che serve — il Ghost si aspetta di trovarci dentro cio' che e' stato
  // prodotto su quel nodo. La verifica resta, ma come pulsante dentro il nodo aperto: una scelta,
  // non l'effetto obbligato di un tocco.
  const [nodoAperto, setNodoAperto] = useState(null);
  const [artBrief, setArtBrief] = useState("");
  const [artTitle, setArtTitle] = useState("");
  const [artText, setArtText] = useState("");
  const [artBusy, setArtBusy] = useState(false);
  const [artMsg, setArtMsg] = useState("");
  const fetchNextStep = async () => {
    setLoadingStep(true); setStepError("");
    try { setNextStep(await proposeNextStep(pillar, percorso, settings, pillarMemory)); }
    catch (e) { setStepError(e.message); } finally { setLoadingStep(false); }
  };
  useEffect(() => { fetchNextStep(); }, [percorso.id]);
  const startQuiz = async (topic) => {
    setQuizTopic(topic); setQuizAnswer(""); setQuizEval(""); setQuizRunning(true);
    try { setQuizQuestion(await generateQuizQuestion(pillar, percorso, topic, settings, pillarMemory)); }
    catch (e) { setQuizQuestion("Errore: " + e.message); } finally { setQuizRunning(false); }
  };
  const submitQuizAnswer = async () => {
    if (!quizAnswer.trim()) return;
    setQuizRunning(true);
    try {
      const evalText = await evaluateQuizAnswer(pillar, quizTopic, quizQuestion, quizAnswer.trim(), settings);
      setQuizEval(evalText);
      const m = evalText.match(/STATO:\s*(consolidato|praticato|introdotto)/i);
      if (m) { const topics = percorso.topics.map((t) => (t.id === quizTopic.id ? { ...t, status: m[1].toLowerCase(), lastTouched: new Date().toISOString() } : t)); onUpdate({ ...percorso, topics }); }
    } catch (e) { setQuizEval("Errore: " + e.message); } finally { setQuizRunning(false); }
  };
  const closeSess = async () => {
    if (!sessionNote.trim()) return;
    setClosing(true);
    try {
      const newCompetenze = await closeSession(pillar, percorso, sessionNote.trim(), settings);
      const session = { id: uid(), date: new Date().toISOString(), type: quizTopic ? "quiz" : "studio", topicIds: quizTopic ? [quizTopic.id] : [], summary: sessionNote.trim() };
      onUpdate({ ...percorso, competenze: newCompetenze, sessions: [session, ...percorso.sessions] });
      setSessionNote(""); setQuizTopic(null); setQuizQuestion(""); setQuizAnswer(""); setQuizEval("");
    } catch (e) { /* silenzioso, la nota resta compilata per riprovare */ } finally { setClosing(false); }
  };
  const statusColor = (s) => (s === "consolidato" ? color : s === "praticato" ? "#8FA3AC" : s === "introdotto" ? "#B7C4C8" : "#D3DCDE");
  // 01/09/2026 — IL GRIGETTO ILLEGGIBILE, portato dal Ghost con lo schermo davanti.
  // statusColor finiva sia sul bordo SIA sul testo: per un nodo "non iniziato" voleva dire scrivere
  // #D3DCDE su bianco, cioe' niente. E "non iniziato" e' lo stato in cui nasce OGNI nodo di OGNI
  // percorso nuovo — quindi il caso illeggibile non era un caso limite, era il caso normale.
  // Il colore dello stato resta dov'e' informativo (il bordo, il pallino) e il testo prende un
  // inchiostro leggibile: un badge deve dire cosa c'e' scritto prima di dire in che stato e'.
  const statusInk = (s) => (s === "consolidato" ? color : s === "praticato" ? "#5E7480" : s === "introdotto" ? "#6E8087" : "#5B6472");
  const generateArtifact = async () => {
    if (!artBrief.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const contextBlock = [
        pillarMemory ? `Memoria accumulata su questo pilastro (contiene vincoli/preferenze già emersi in conversazione — rispettali sempre, non contraddirli): ${pillarMemory}` : "",
        percorso.localMemory ? `Memoria specifica di questo percorso (vincoli/tentativi già annotati dal Ghost — priorità massima, sono espliciti): ${percorso.localMemory}` : "",
      ].filter(Boolean).join("\n");
      const sys = `Sei lo Shell del sistema Resonance, pilastro ${pillar.toUpperCase()}. Genera un documento strutturato e concreto in italiano, basato sulla richiesta del Ghost, coerente col percorso "${percorso.title}".${contextBlock ? "\n" + contextBlock : ""}\nSe la memoria sopra contiene esclusioni o vincoli (es. alimenti da evitare), NON includerli mai nel documento, nemmeno come alternativa — sono vincoli assoluti, non preferenze morbide. Usa questo markup leggero: "# " per il titolo principale, "## " per le sezioni, "- " per gli elenchi, righe normali per i paragrafi. Niente fronzoli, niente premesse: solo il documento.`;
      const text = await askModel(sys, artBrief.trim(), 0.6, 4000, settings);
      setArtText(text);
      if (!artTitle.trim()) { const firstH = (text.match(/^#\s+(.+)$/m) || [])[1]; setArtTitle(firstH || percorso.title); }
    } catch (e) { setArtMsg("Errore generazione: " + e.message); } finally { setArtBusy(false); }
  };
  const artifactFilename = () => `${(artTitle || percorso.title || "documento").replace(/[^\w\sàèéìòù-]/gi, "").trim().slice(0, 60) || "documento"}.docx`;
  const downloadArtifact = async () => {
    if (!artText.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const blob = await generateDocxBlob(artTitle || percorso.title, artText);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = artifactFilename(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      // NOTA futura: doc.text (testo intero) viaggia nella sync tra dispositivi. Ok per pochi documenti;
      // se se ne accumulano molti e lunghi, valutare di conservare solo metadati qui e il testo su Drive.
      const doc = { id: uid(), name: artifactFilename(), title: artTitle || percorso.title, text: artText, date: new Date().toISOString(), driveId: null };
      onUpdate({ ...percorso, documents: [doc, ...(percorso.documents || [])] });
      setArtMsg("Scaricato e salvato nel percorso."); setArtBrief(""); setArtText(""); setArtTitle("");
    } catch (e) { setArtMsg("Errore download: " + e.message); } finally { setArtBusy(false); }
  };
  const driveArtifact = async () => {
    if (!artText.trim() || artBusy) return;
    setArtBusy(true); setArtMsg("");
    try {
      const blob = await generateDocxBlob(artTitle || percorso.title, artText);
      const result = await createDriveFile(artifactFilename(), blob, DOCX_MIME);
      const doc = { id: uid(), name: artifactFilename(), title: artTitle || percorso.title, text: artText, date: new Date().toISOString(), driveId: result?.id || null };
      onUpdate({ ...percorso, documents: [doc, ...(percorso.documents || [])] });
      setArtMsg("Salvato su Drive."); setArtBrief(""); setArtText(""); setArtTitle("");
    } catch (e) { setArtMsg("Errore Drive: " + e.message); } finally { setArtBusy(false); }
  };
  const togglePillar = (pk) => {
    const cur = percorso.touchesPillars || [];
    const next = cur.includes(pk) ? cur.filter((x) => x !== pk) : [...cur, pk];
    onUpdate({ ...percorso, touchesPillars: next });
  };
  const OTHER_PILLARS = [{ k: "bio", label: "BIO" }, { k: "air", label: "AIR" }, { k: "vidya", label: "VIDYA" }].filter((x) => x.k !== pillar);
  return html`
    <div>
      <button class="r-btn r-btn-ghost" style="margin:0 0 12px 0" onClick=${onBack}>← Percorsi</button>
      <${Card} accent=${color}>
        ${editingTitle
          ? html`<div>
              <input class="r-input" value=${titleDraft} onInput=${(e) => setTitleDraft(e.target.value)} placeholder="titolo del percorso" />
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="r-btn" style="background:${color}" onClick=${() => { const t = titleDraft.trim(); if (t) onUpdate({ ...percorso, title: t }); setEditingTitle(false); }}>Salva</button>
                <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setTitleDraft(percorso.title || ""); setEditingTitle(false); }}>Annulla</button>
              </div>
            </div>`
          : html`<div>
              ${/* §2 — la rinomina ESISTEVA gia', ma era una matita al 40% di opacita' con un
                    suggerimento che su un telefono non compare mai: di fatto non scopribile.
                    Ora la matita e' leggibile e ha la parola accanto. */ ""}
              <div class="r-hub-title" style="color:${color};cursor:pointer" onClick=${() => setEditingTitle(true)}>${percorso.title}${percorso.kind === "identitario" ? html` <span class="r-badge" style="border-color:${color};color:${color}">identitario</span>` : ""} <span style="opacity:0.75;font-size:12px;white-space:nowrap">✎ rinomina</span></div>
              ${/* §2 — i percorsi gia' rotti (creati prima della correzione) non vengono toccati da
                    nessun batch silenzioso: quando il Ghost ne apre uno, glielo si dice e basta.
                    Vede, decide, rinomina in un gesto. */ ""}
              ${!titoloUsabile(percorso.title) && html`<div class="r-error" style="margin-top:8px">
                Questo percorso non ha un nome leggibile — così non potrai richiamarlo dicendo "riprendi quello su…", e nell'elenco non si capisce di cosa sia.
                <button class="r-btn r-btn-ghost" style="margin-left:0;margin-top:6px" onClick=${() => setEditingTitle(true)}>Dagli un nome</button>
              </div>`}
            </div>`}
        ${percorso.kind === "identitario" && html`<div style="margin-top:8px">
          ${editingGoal
            ? html`<div>
                <textarea class="r-textarea" value=${goalDraft} onInput=${(e) => setGoalDraft(e.target.value)} placeholder="diventare una persona che…" />
                <div style="display:flex;gap:8px;margin-top:6px">
                  <button class="r-btn" style="background:${color}" onClick=${() => { onUpdate({ ...percorso, identityGoal: goalDraft.trim() || percorso.identityGoal }); setEditingGoal(false); }}>Salva</button>
                  <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setGoalDraft(percorso.identityGoal || ""); setEditingGoal(false); }}>Annulla</button>
                </div>
              </div>`
            : html`<div class="r-magi-text" style="font-style:italic;cursor:pointer" onClick=${() => setEditingGoal(true)} title="Tocca per modificare">→ ${percorso.identityGoal || "diventare…"} <span style="opacity:0.5">✎</span></div>`}
        </div>`}
        <div class="r-hub-detail" style="margin-top:8px">Nodi (tocca per aprirne il materiale):</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
          ${percorso.topics.map((t) => {
            const materiale = materialeDelNodo(percorso, t);
            const aperto = nodoAperto === t.id;
            return html`<div key=${t.id}>
              <span class="r-badge" style="border-color:${statusColor(t.status)};color:${statusInk(t.status)};cursor:pointer"
                onClick=${() => setNodoAperto(aperto ? null : t.id)}>${aperto ? "▾" : "▸"} ${t.label} · ${t.status}${materiale.documenti.length || materiale.sessioni.length ? ` · ${materiale.documenti.length + materiale.sessioni.length}` : ""}</span>
              ${aperto && html`<div style="margin-top:6px;margin-left:10px;padding-left:10px;border-left:1px solid var(--border)">
                ${materiale.documenti.length === 0 && materiale.sessioni.length === 0
                  ? html`<div class="r-hub-detail">Su questo nodo non c'è ancora niente di salvato. Quello che generiamo in chat ci finisce dentro dicendo «salvalo nel percorso».</div>`
                  : html`<div>
                      ${materiale.documenti.map((d) => html`<div key=${d.id} style="margin-top:6px">
                        <div class="r-entry-date">${d.title || d.name} · ${fmtDate(d.date)}${d.text ? ` · ${d.text.length} caratteri` : ""}</div>
                        ${d.text && html`<div class="r-magi-text" style="white-space:pre-wrap;margin-top:2px">${d.text}</div>`}
                      </div>`)}
                      ${materiale.sessioni.map((se) => html`<div key=${se.id} style="margin-top:6px">
                        <div class="r-entry-date">Sessione · ${fmtDate(se.date)}</div>
                        <div class="r-entry-notes">${se.summary}</div>
                      </div>`)}
                    </div>`}
                <button class="r-btn r-btn-ghost" style="margin-top:8px;margin-left:0" onClick=${() => startQuiz(t)}>Verificati su questo nodo</button>
              </div>`}
            </div>`;
          })}
        </div>
        ${percorso.competenze && html`<div class="r-hub-detail" style="margin-top:10px"><b>Competenze:</b> ${percorso.competenze}</div>`}
      </${Card}>
      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Prossimo quanto</div>
        ${loadingStep ? html`<div class="r-hub-detail" style="margin-top:6px">Lo Shell sta valutando…</div>` : html`<div class="r-magi-text" style="margin-top:6px">${nextStep}</div>`}
        ${stepError && html`<div class="r-error">${stepError}</div>`}
        <button class="r-btn r-btn-ghost" style="margin-top:8px;margin-left:0" onClick=${fetchNextStep} disabled=${loadingStep}>Rigenera</button>
      </${Card}>
      ${quizTopic && html`<${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Verifica: ${quizTopic.label}</div>
        <div class="r-magi-text" style="margin-top:6px">${quizQuestion}</div>
        <textarea class="r-textarea" style="margin-top:8px" value=${quizAnswer} onInput=${(e) => setQuizAnswer(e.target.value)} placeholder="La tua risposta…" disabled=${quizRunning} />
        <button class="r-btn" style="background:${color};margin-top:8px" onClick=${submitQuizAnswer} disabled=${quizRunning}>${quizRunning ? "…" : "Valuta"}</button>
        ${quizEval && html`<div class="r-magi-text" style="margin-top:8px">${quizEval}</div>`}
      </${Card}>`}
      <${Card} accent=${color}>
        <${Field} label="Chiudi sessione — cosa hai fatto/imparato?">
          <textarea class="r-textarea" value=${sessionNote} onInput=${(e) => setSessionNote(e.target.value)} disabled=${closing} />
        </${Field}>
        <button class="r-btn" style="background:${color}" onClick=${closeSess} disabled=${closing || !sessionNote.trim()}>${closing ? "Salvataggio…" : "Chiudi sessione"}</button>
      </${Card}>
      ${percorso.sessions.length > 0 && html`<div class="r-list">${percorso.sessions.map((s) => html`
        <${Card}><div class="r-entry-date">${fmtDate(s.date)} · ${s.type}</div><div class="r-entry-notes">${s.summary}</div></${Card}>`)}</div>`}

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Pilastri toccati</div>
        <div class="r-hub-detail" style="margin-top:4px">Questo percorso vive in ${pillar.toUpperCase()}, ma può toccarne altri (badge visivi, nessuna duplicazione).</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${OTHER_PILLARS.map((op) => { const on = (percorso.touchesPillars || []).includes(op.k); return html`<button class="r-add-btn" style="border-color:${color};color:${on ? "#0A0D12" : color};background:${on ? color : "transparent"}" onClick=${() => togglePillar(op.k)}>${on ? "✓ " : ""}${op.label}</button>`; })}
        </div>
      </${Card}>

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Memoria del percorso</div>
        <div class="r-hub-detail" style="margin-top:4px">Cosa hai già provato, cosa non ha funzionato, riferimenti. Resta visibile a Simbiosi.</div>
        ${editingMem
          ? html`<div style="margin-top:8px">
              <textarea class="r-textarea" value=${memDraft} onInput=${(e) => setMemDraft(e.target.value)} placeholder="Note procedurali di questo percorso…" />
              <div style="display:flex;gap:8px;margin-top:6px">
                <button class="r-btn" style="background:${color}" onClick=${() => { onUpdate({ ...percorso, localMemory: memDraft }); setEditingMem(false); }}>Salva</button>
                <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => { setMemDraft(percorso.localMemory || ""); setEditingMem(false); }}>Annulla</button>
              </div>
            </div>`
          : html`<div class="r-magi-text" style="margin-top:8px;cursor:pointer;white-space:pre-wrap" onClick=${() => setEditingMem(true)} title="Tocca per modificare">${percorso.localMemory || "— vuota, tocca per scrivere —"} <span style="opacity:0.4">✎</span></div>`}
      </${Card}>

      <${Card} accent=${color}>
        <div class="r-hub-title" style="color:${color}">Artefatto documentale</div>
        <div class="r-hub-detail" style="margin-top:4px">Genera un documento .docx (es. un piano) legato a questo percorso.</div>
        <textarea class="r-textarea" style="margin-top:8px" value=${artBrief} onInput=${(e) => setArtBrief(e.target.value)} placeholder="Cosa deve contenere il documento?" disabled=${artBusy} />
        <button class="r-btn" style="background:${color};margin-top:6px" onClick=${generateArtifact} disabled=${artBusy || !artBrief.trim()}>${artBusy ? "…" : "Genera bozza"}</button>
        ${artText && html`<div style="margin-top:10px">
          <${Field} label="Titolo file"><input class="r-input" value=${artTitle} onInput=${(e) => setArtTitle(e.target.value)} placeholder="Titolo del documento" /></${Field}>
          <div class="r-magi-text" style="margin-top:6px;white-space:pre-wrap;max-height:200px;overflow:auto;background:var(--surface2);padding:10px;border-radius:8px">${artText}</div>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="r-btn" style="background:${color}" onClick=${downloadArtifact} disabled=${artBusy}>Scarica .docx</button>
            <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${driveArtifact} disabled=${artBusy}>Salva su Drive</button>
          </div>
        </div>`}
        ${artMsg && html`<div class="${artMsg.startsWith("Errore") ? "r-error" : "r-ok"}" style="margin-top:6px">${artMsg}</div>`}
        ${(percorso.documents || []).length > 0 && html`<div style="margin-top:12px">
          <div class="r-hub-detail"><b>Documenti del percorso:</b> toccane uno per rileggerlo per intero.</div>
          ${(percorso.documents || []).map((d) => html`<div key=${d.id} style="margin-top:6px">
            <div class="r-entry-row" style="cursor:pointer" onClick=${() => setDocAperto(docAperto === d.id ? null : d.id)}>
              <div class="r-entry-line">${docAperto === d.id ? "▾" : "▸"} ${d.name}${d.driveId ? " · Drive" : ""}${d.origine === "chat" ? " · dalla conversazione" : ""}<span
                style="opacity:0.5;font-size:11px"> · ${fmtDate(d.date)}${d.text ? ` · ${d.text.length} caratteri` : ""}</span></div>
            </div>
            ${docAperto === d.id && html`<div class="r-magi-text" style="white-space:pre-wrap;margin-top:4px">${d.text || "— questo documento non ha il testo salvato: è stato creato prima del 31/08/2026, quando si conservava solo il nome. Il file scaricato o su Drive resta valido. —"}</div>`}
          </div>`)}
        </div>`}
      </${Card}>

      <button class="r-btn r-btn-ghost" style="margin-top:14px;margin-left:0;color:${C.bio}" onClick=${onDelete}>Elimina percorso</button>
    </div>`;
}

//──────────────────────────────────────────────────────────
// HUB
//──────────────────────────────────────────────────────────
// Mesh di nodi fissa (non generata a ogni render): evita che la "rete neurale" tremoli
// visivamente a ogni cambio di stato. Coordinate scelte a mano, non casuali.
const MESH_NODES = [
  { x: 110, y: 106 }, { x: 151, y: 101 }, { x: 130, y: 81 },
  { x: 106, y: 146 }, { x: 155, y: 150 }, { x: 140, y: 166 }, { x: 119, y: 168 },
];
const MESH_EDGES = [[0,2],[2,1],[0,3],[1,4],[3,6],[4,5],[6,5],[0,1]];
function AnochinRing({ bioN, airN, vidyaN, onNav }) {
  const nodes = [{ key: "bio", label: "BIO", color: C.bio, angle: -90, n: bioN }, { key: "air", label: "AIR", color: C.air, angle: 30, n: airN }, { key: "vidya", label: "VIDYA", color: C.vidya, angle: 150, n: vidyaN }];
  const R = 92, cx = 130, cy = 130;
  // Esagono flat-top (raggio 64) + 3 raggi interni alternati dal centro = illusione di cubo isometrico
  const Riso = 64;
  const hexPts = [0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; return `${(cx + Riso * Math.cos(r)).toFixed(1)},${(cy + Riso * Math.sin(r)).toFixed(1)}`; }).join(" ");
  const cubeFacetAngles = [0, 120, 240];
  return html`<div class="r-ring-wrap">
    <svg width="260" height="260" viewBox="0 0 260 260">
      <defs>
        <linearGradient id="holoStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#E8B8D0" /><stop offset="35%" stop-color="#B8CDE8" />
          <stop offset="70%" stop-color="#C7E8B8" /><stop offset="100%" stop-color="#E8D4A0" />
        </linearGradient>
      </defs>
      <circle cx=${cx} cy=${cy} r="100" fill="none" stroke="#B9C2CC" stroke-width="0.75" stroke-opacity="0.35" />
      <circle cx=${cx} cy=${cy} r="124" fill="none" stroke="#B9C2CC" stroke-width="0.75" stroke-opacity="0.2" stroke-dasharray="1 7" />
      <polygon points=${hexPts} fill="none" stroke="#7A828E" stroke-width="0.9" stroke-opacity="0.4" />
      ${cubeFacetAngles.map((a) => { const r = (a * Math.PI) / 180; return html`<line x1=${cx} y1=${cy} x2=${(cx + Riso * Math.cos(r)).toFixed(1)} y2=${(cy + Riso * Math.sin(r)).toFixed(1)} stroke="#7A828E" stroke-width="0.9" stroke-opacity="0.3" />`; })}
      ${MESH_EDGES.map(([i, j]) => html`<line x1=${MESH_NODES[i].x} y1=${MESH_NODES[i].y} x2=${MESH_NODES[j].x} y2=${MESH_NODES[j].y} stroke="#9AA3AF" stroke-width="0.6" stroke-opacity="0.4" />`)}
      ${MESH_NODES.map((p) => html`<circle cx=${p.x} cy=${p.y} r="1.7" fill="#8B92A0" fill-opacity="0.6" />`)}
      ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad); return html`<line x1=${cx} y1=${cy} x2=${x} y2=${y} stroke=${n.color} stroke-opacity="0.3" stroke-width="1" />`; })}
      <circle cx=${cx} cy=${cy} r="29" fill="rgba(255,255,255,0.72)" stroke="url(#holoStroke)" stroke-width="1.5" class="r-pulse" />
    </svg>
    <div class="r-ring-core" style="left:${cx - 30}px;top:${cy - 30}px">ADAM</div>
    ${nodes.map((n) => { const rad = (n.angle * Math.PI) / 180, x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
      return html`<button class="r-ring-node r-ring-node-${n.key}" style="left:${x - 28}px;top:${y - 28}px" onClick=${() => onNav(n.key)}><span>${n.label}</span><span class="r-ring-count">${n.n}</span></button>`; })}
  </div>`;
}
// GESTO A.2 + A.3 + C — indicatore di postura: tre barre, una per pilastro.
// Altezza = freschezza (quanto di recente quel pilastro si e' mosso). Spessore del bordo = densita'
// di memoria. Il respiro (C) e' una animazione CSS la cui DURATA arriva dalla tensione reale
// calcolata sopra, non da un numero scelto a occhio: e' il vincolo che separa un organismo da uno
// screensaver. Nessun ciclo di ridisegno in JavaScript: si imposta una variabile CSS e basta.
//
// A.3 — micro-movimento all'apertura: le barre partono schiacciate e salgono alla loro altezza vera
// in poco meno di mezzo secondo. Non e' decorazione, e' la differenza fra un oggetto acceso e uno
// spento: disegnarle gia' ferme direbbe "questa cosa era gia' finita prima che tu arrivassi".
function PosturaIndicator({ postura, onNav }) {
  const [montato, setMontato] = useState(false);
  useEffect(() => {
    // Due fotogrammi di attesa, non uno: con uno solo il browser puo' accorpare lo stato iniziale
    // e quello finale in un unico calcolo di stile, e la transizione non parte proprio.
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setMontato(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const pilastri = [
    { k: "bio", etichetta: "BIO", colore: C.bio, d: postura.bio },
    { k: "air", etichetta: "AIR", colore: C.air, d: postura.air },
    { k: "vidya", etichetta: "VIDYA", colore: C.vidya, d: postura.vidya },
  ];
  return html`<div class="r-postura" style=${`--respiro:${postura.secondiRespiro}s`}>
    <div class="r-postura-barre">
      ${pilastri.map((p) => html`<div class="r-postura-col" key=${p.k} onClick=${() => onNav(p.k)}
          title=${`${p.etichetta} — ${p.d.giorni === null ? "nessuna voce ancora" : p.d.giorni === 0 ? "attività oggi" : p.d.giorni === 1 ? "ultima voce ieri" : "ultima voce " + p.d.giorni + " giorni fa"}${p.d.percorsiFermi ? ` · ${p.d.percorsiFermi} percorso/i fermo/i` : ""}`}>
        <div class="r-postura-tubo">
          <div class="r-postura-riempimento" style=${`height:${montato ? Math.round(8 + p.d.freschezza * 92) : 6}%;background:${p.colore};border-top:${1 + Math.round(p.d.densita * 3)}px solid ${p.colore}`}></div>
        </div>
        <div class="r-postura-etichetta" style=${`color:${p.colore}`}>${p.etichetta}</div>
      </div>`)}
    </div>
    <div class="r-postura-nota">Com'è adesso — letto da ciò che è già sul dispositivo. È una lettura, non un giudizio.</div>
  </div>`;
}
function Hub({ bio, air, vidya, magi, resonance, setView, pBio, pAir, pVidya, proactiveHint, postura }) {
  const lastBio = bio[0], lastAir = air[0], lastVidya = vidya[0];
  // Countdown identitario: tra TUTTI i percorsi identitari attivi, quello più vicino al traguardo
  // (meno nodi non-consolidati mancanti, ma >0). Solo distanza attuale, mai delta (niente regressi).
  const identityCountdown = (() => {
    const all = [...(pBio || []), ...(pAir || []), ...(pVidya || [])].filter((p) => p.kind === "identitario" && p.identityGoal);
    let best = null;
    for (const p of all) {
      const missing = (p.topics || []).filter((t) => t.status !== "consolidato").length;
      if (missing > 0 && (best === null || missing < best.missing)) best = { missing, goal: p.identityGoal, title: p.title };
    }
    return best;
  })();
  return html`<div class="r-screen">
    <button class="r-shell-cta" onClick=${() => setView("shell")}>
      <div class="r-shell-cta-label">SHELL${proactiveHint ? html` <span class="r-shell-cta-dot">●</span>` : ""}</div>
      <div class="r-shell-cta-sub">${proactiveHint ? "Adam ha notato qualcosa — entra e chiediglielo" : "Parlagli — penserà lui a smistare tra i pilastri"}</div>
    </button>
    ${identityCountdown && html`<div class="r-identity-countdown" onClick=${() => setView(identityCountdown.title && (pBio||[]).some(p=>p.title===identityCountdown.title) ? "bio" : (pAir||[]).some(p=>p.title===identityCountdown.title) ? "air" : "vidya")}>
      <div class="r-identity-count">${identityCountdown.missing}</div>
      <div class="r-identity-text">${identityCountdown.missing === 1 ? "passaggio" : "passaggi"} verso <b>${identityCountdown.goal}</b></div>
    </div>`}
    ${postura && html`<${PosturaIndicator} postura=${postura} onNav=${setView} />`}
    <${AnochinRing} bioN=${bio.length} airN=${air.length} vidyaN=${vidya.length} onNav=${setView} />
    <p class="r-hero-sub">Tre pilastri, un ciclo. Tocca un nodo per aprire il pilastro.</p>
    <div class="r-hub-grid">
      <${Card} accent=${C.bio}><div class="r-hub-row" onClick=${() => setView("bio")}><div><div class="r-hub-title" style="color:${C.bio}">BIO</div>
        <div class="r-hub-detail">${lastBio ? `${lastBio.weight ? lastBio.weight + " kg — " : ""}${fmtDate(lastBio.date)}` : "Nessun dato ancora"}</div></div></div></${Card}>
      <${Card} accent=${C.air}><div class="r-hub-row" onClick=${() => setView("air")}><div><div class="r-hub-title" style="color:${C.air}">AIR</div>
        <div class="r-hub-detail">${lastAir ? `${lastAir.title} — ${lastAir.status}` : "Nessun vettore tracciato"}</div></div></div></${Card}>
      <${Card} accent=${C.vidya}><div class="r-hub-row" onClick=${() => setView("vidya")}><div><div class="r-hub-title" style="color:${C.vidya}">VIDYA</div>
        <div class="r-hub-detail">${lastVidya ? `${lastVidya.title} — ${fmtDate(lastVidya.date)}` : "Nessun log creativo"}</div></div></div></${Card}>
      <${Card} accent=${C.core}><div class="r-hub-row" onClick=${() => setView("magi")}><div><div class="r-hub-title" style="color:${C.core}">AGORÀ MAGI</div>
        <div class="r-hub-detail">${magi.length} sessioni registrate</div></div></div></${Card}>
      <div class="r-card r-simbiosi-card"><div class="r-hub-row" onClick=${() => setView("simbiosi")}><div><div class="r-hub-title">SIMBIOSI${proactiveHint ? html` <span style="color:${C.core}">●</span>` : ""}</div>
        <div class="r-hub-detail">${resonance.text ? resonance.text.slice(0, 70) + "…" : "Nessuna valutazione ancora"}</div></div></div></div>
    </div>
  </div>`;
}

//──────────────────────────────────────────────────────────
// BIO / VIDYA / AIR (Log + Percorsi, AIR anche Agente)
//──────────────────────────────────────────────────────────
// 31/08/2026 — lo storico di una voce che ha assorbito le sue gemelle. Compare SOLO se la voce ha
// davvero delle versioni precedenti: una voce normale resta identica a com'era. E' la meta' visibile
// della Legge 14 applicata al log — se il programma decide di non creare una seconda voce, quello
// che c'era prima deve restare leggibile, non sparire dentro una fusione silenziosa.
function StoricoVoce({ voce, color }) {
  const versioni = voce?.versioni || [];
  const [aperto, setAperto] = useState(false);
  if (!versioni.length) return null;
  return html`<div style="margin-top:6px">
    <div class="r-hub-detail" style="cursor:pointer;color:${color}" onClick=${() => setAperto(!aperto)}>
      ${aperto ? "\u25be" : "\u25b8"} ${versioni.length + 1} versioni di questa voce${voce.ultimoAggiornamento ? ` \u00b7 aggiornata ${fmtDate(voce.ultimoAggiornamento)}` : ""}
    </div>
    ${aperto && versioni.map((v, i) => html`<div key=${i} class="r-entry-notes" style="opacity:.7;margin-top:4px">
      <b>${versioni.length - i}\u00aa</b> ${fmtDate(v.date)} \u2014 ${v.title ? v.title + ". " : ""}${v.notes || ""}
    </div>`)}
  </div>`;
}
function BioView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [weight, setWeight] = useState(""); const [sleep, setSleep] = useState(""); const [notes, setNotes] = useState("");
  // GESTO B.1 — la vibrazione parte per PRIMA, sincrona dentro il gestore del tocco: e' la
  // conferma percepibile, e deve arrivare prima di qualunque altra cosa. Poi la voce entra
  // nell'elenco e la postura si aggiorna, tutto locale, zero rete.
  const submit = () => { if (!weight && !sleep && !notes) return; vibra("bio"); onAdd({ id: uid(), date, weight, sleep, notes }); setWeight(""); setSleep(""); setNotes(""); setOpen(false); };
  // 31/08/2026 — le stesse identiche righe che finiscono nei prompt (formatSerieBlock), mostrate qui.
  // Il punto non e' decorativo: se lo Shell parla di un andamento del peso, il Ghost deve poter
  // vedere da quali numeri viene, nella stessa forma in cui li ha visti il modello. Se qui non
  // compare niente, allora il modello non ha ricevuto nessuna tendenza — e qualunque cosa dica
  // sull'andamento se l'e' inventata.
  const andamento = righeSerie(fattiDaLogBio(entries));
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.bio} title="BIO" subtitle="Sostegno biologico dell'azione" />
    <${SubTabs} color=${C.bio} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      ${andamento.length > 0 && html`<${Card} accent=${C.bio}>
        <div class="r-entry-date">Andamento misurato — calcolato sul log, non stimato</div>
        ${andamento.map((r) => html`<div class="r-entry-line" style=${r.stato && r.stato !== "fresco" ? "opacity:.7" : ""}>${r.testo}</div>`)}
      </${Card}>`}
      <${AddButton} color=${C.bio} open=${open} setOpen=${setOpen} label="Nuova voce" />
      ${open && html`<${Card} accent=${C.bio}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Peso (kg)"><input type="number" step="0.1" class="r-input" value=${weight} onInput=${(e) => setWeight(e.target.value)} /></${Field}>
        <${Field} label="Sonno / apnee"><input class="r-input" value=${sleep} onInput=${(e) => setSleep(e.target.value)} /></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.bio}" onClick=${submit}>Salva voce</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessuna voce BIO ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.bio}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)}</div>
          ${e.weight && html`<div class="r-entry-line">Peso: <b>${e.weight} kg</b></div>`}
          ${e.sleep && html`<div class="r-entry-line">Sonno: ${e.sleep}</div>`}
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
          <${StoricoVoce} voce=${e} color=${C.bio} />
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : html`<${PercorsiPanel} pillar="bio" color=${C.bio} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.bio?.corrente} />`}
  </div>`;
}
function VidyaView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [title, setTitle] = useState(""); const [notes, setNotes] = useState("");
  const submit = () => { if (!title) return; vibra("vidya"); onAdd({ id: uid(), date, title, notes }); setTitle(""); setNotes(""); setOpen(false); };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.vidya} title="VIDYA" subtitle="Attrito cognitivo, artefatto per ciclo" />
    <${SubTabs} color=${C.vidya} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      <${AddButton} color=${C.vidya} open=${open} setOpen=${setOpen} label="Nuovo artefatto" />
      ${open && html`<${Card} accent=${C.vidya}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Titolo"><input class="r-input" value=${title} onInput=${(e) => setTitle(e.target.value)} /></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.vidya}" onClick=${submit}>Salva artefatto</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessun log VIDYA ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.vidya}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)}</div>
          <div class="r-entry-line"><b>${e.title}</b></div>
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
          <${StoricoVoce} voce=${e} color=${C.vidya} />
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : html`<${PercorsiPanel} pillar="vidya" color=${C.vidya} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.vidya?.corrente} />`}
  </div>`;
}
const AIR_STATUSES = ["idea", "in corso", "attivo", "bloccato"];
// Sezione "Semi" — vive nello stesso sotto-tab Percorsi di AIR (brief 1.B/1.C: "non creare una
// sezione nuova separata"). Un Seme non è un Percorso: niente PercorsiPanel/PercorsoDetail qui,
// stati e contatori diversi (vedi runSeedResearch/proposeSeedExecutionStep/runSeedGateCheck).
const SEME_STATUS_LABELS = {
  seed: "nuovo", researching: "in ricerca", proposing: "proposte in stallo",
  awaiting_approval: "in attesa di approvazione", executing: "in sviluppo",
  gated: "bloccato", archived: "archiviato",
};
function SemiPanel({ color, semi, onAddSeed, onApproveSeedStrategy, onUnlockGatedSeed, onDiscussInShell, onAdvance, onArchiveSeed }) {
  const [newContent, setNewContent] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const submit = () => { if (!newContent.trim()) return; vibra("air"); onAddSeed(newContent.trim()); setNewContent(""); };
  const lastLogNote = (s) => {
    const log = (s.status === "executing" || s.status === "gated") ? s.executionLog : s.researchLog;
    return (log && log.length) ? log[log.length - 1].note : "Nessun avanzamento ancora — attende l'apertura della prossima sessione Shell.";
  };
  // FASE 2 (BRIEF_fase1_memoria_sedimento 27/07/2026) — prima un Seme che esauriva il tetto
  // (researchIterationCount/executionIterationCount) smetteva di avanzare senza alcun segnale in
  // UI. Mostra il contatore corrente rispetto al tetto fisso del codice, così il blocco è leggibile.
  const seedCounterInfo = (s) => {
    const isExecPhase = s.status === "executing" || s.status === "gated";
    const count = isExecPhase ? s.executionIterationCount : s.researchIterationCount;
    const cap = isExecPhase ? SEME_EXECUTION_ITERATION_CAP : SEME_RESEARCH_ITERATION_CAP;
    const atCap = count >= cap;
    return { label: `${isExecPhase ? "esecuzione" : "ricerca"} ${count}/${cap}${atCap ? " — tetto raggiunto" : ""}`, atCap };
  };
  // onAdvance è la STESSA advanceSeedIfDue già usata al mount di ShellView: non prende un id target,
  // avanza sempre il primo Seme "dovuto" trovato nell'intero elenco — se più Semi fossero attivi
  // insieme, il pulsante su QUALSIASI card avanzerebbe quello, non necessariamente quello cliccato
  // (limite reale del wiring attuale, segnalato nel report, non risolto in questa fase). Già sicura
  // da richiamare ripetutamente: verifica da sé i tetti ed esce in silenzio se non c'è nulla da fare.
  const handleAdvance = async () => { if (advancing || !onAdvance) return; setAdvancing(true); try { await onAdvance(); } finally { setAdvancing(false); } };
  return html`<div>
    <${Card} accent=${color}>
      <${Field} label="Nuovo Seme — un'idea grezza, anche non sviluppata">
        <textarea class="r-textarea" value=${newContent} onInput=${(e) => setNewContent(e.target.value)} placeholder="es. potrei provare a…" />
      </${Field}>
      <button class="r-btn" style="background:${color}" onClick=${submit} disabled=${!newContent.trim()}>+ Nuovo Seme</button>
    </${Card}>
    ${semi.length === 0 ? html`<${Empty} text="Nessun Seme ancora." />` : html`<div class="r-list">
      ${semi.map((s) => { const counter = seedCounterInfo(s); return html`<${Card} accent=${color}>
        <div class="r-entry-line"><b>${s.content}</b></div>
        <div class="r-hub-detail" style="margin-top:4px">Stato: <span class="r-badge" style="border-color:${color};color:${color}">${SEME_STATUS_LABELS[s.status] || s.status}</span> · origine: ${s.originSource === "manual" ? "manuale" : "conversazione"} · ${counter.label}</div>
        <div class="r-magi-text" style="margin-top:6px">${lastLogNote(s)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${s.status !== "archived" && html`<button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${handleAdvance} disabled=${advancing || counter.atCap}>${advancing ? "Avanzo…" : counter.atCap ? "Tetto raggiunto" : "Avanza ora"}</button>`}
          ${/* FASE 5 (brief 14/08/2026) — lo stato "archiviato" esisteva fra le etichette ma niente
                lo impostava: un Seme non poteva essere fermato in nessun modo. E' C.15 applicata al
                caso piu' semplice — il sistema deve poter togliere, non solo aggiungere. Archiviare
                non cancella: il Seme resta leggibile con tutta la sua storia, smette solo di
                avanzare e di consumare round. Da archiviato si puo' tornare indietro. */ ""}
          ${s.status !== "archived"
            ? html`<button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => onArchiveSeed?.(s.id, true)}>Archivia</button>`
            : html`<button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => onArchiveSeed?.(s.id, false)}>Riattiva</button>`}
        </div>
        ${s.status === "awaiting_approval" && html`<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
          ${(s.proposedStrategies || []).map((strat) => html`<div>
            <div class="r-entry-line"><b>${strat.titolo}</b></div>
            <div class="r-entry-notes">${strat.descrizione}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              <button class="r-btn" style="background:${color}" onClick=${() => onApproveSeedStrategy(s.id, strat)}>Approva strategia</button>
              <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => onDiscussInShell?.(s, strat)}>Discuti in Shell</button>
            </div>
          </div>`)}
        </div>`}
        ${s.status === "gated" && html`<div style="margin-top:10px">
          <div class="r-error">Bloccato: ${s.gateReason}</div>
          ${s.gatedActionPreview && html`<div style="margin-top:6px">
            <div class="r-hub-detail">Azione candidata bloccata (esattamente questa, se confermi):</div>
            <div class="r-magi-text" style="margin-top:4px;white-space:pre-wrap">${s.gatedActionPreview}</div>
          </div>`}
          <button class="r-btn r-btn-ghost" style="margin-left:0;margin-top:8px" onClick=${() => onUnlockGatedSeed(s.id)}>Sblocca/Conferma questa azione</button>
        </div>`}
      </${Card}>`; })}
    </div>`}
  </div>`;
}
function AirView({ entries, onAdd, onDelete, percorsi, setPercorsi, settings, digest, memory, semi, onAddSeed, onApproveSeedStrategy, onUnlockGatedSeed, onDiscussInShell, pushDebugLog, advanceSeedIfDue, onArchiveSeed }) {
  const [tab, setTab] = useState("log");
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO()); const [title, setTitle] = useState(""); const [status, setStatus] = useState("idea"); const [notes, setNotes] = useState("");
  const submit = () => { if (!title) return; vibra("air"); onAdd({ id: uid(), date, title, status, notes }); setTitle(""); setNotes(""); setStatus("idea"); setOpen(false); };
  const [task, setTask] = useState(""); const [running, setRunning] = useState(false); const [result, setResult] = useState(""); const [error, setError] = useState("");
  const runAgent = async () => { if (!task.trim() || running) return; setRunning(true); setError(""); setResult("");
    try { setResult(await runAirAgent(task.trim(), settings, pushDebugLog, memory?.air?.corrente)); } catch (e) { setError(e.message); } finally { setRunning(false); } };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.air} title="AIR" subtitle="Autonomia economica, sganciata dal tempo del Ghost" />
    <${SubTabs} color=${C.air} tabs=${[{ key: "log", label: "Log" }, { key: "percorsi", label: "Percorsi" }, { key: "agent", label: "Agente" }]} active=${tab} setActive=${setTab} />
    ${tab === "log" ? html`
      <${AddButton} color=${C.air} open=${open} setOpen=${setOpen} label="Nuovo vettore" />
      ${open && html`<${Card} accent=${C.air}>
        <${Field} label="Data"><input type="date" class="r-input" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
        <${Field} label="Titolo / vettore"><input class="r-input" value=${title} onInput=${(e) => setTitle(e.target.value)} /></${Field}>
        <${Field} label="Stato"><select class="r-input" value=${status} onInput=${(e) => setStatus(e.target.value)}>${AIR_STATUSES.map((s) => html`<option value=${s}>${s}</option>`)}</select></${Field}>
        <${Field} label="Note"><textarea class="r-textarea" value=${notes} onInput=${(e) => setNotes(e.target.value)} /></${Field}>
        <button class="r-btn" style="background:${C.air}" onClick=${submit}>Salva vettore</button>
      </${Card}>`}
      ${entries.length === 0 ? html`<${Empty} text="Nessun vettore AIR ancora." />` : html`<div class="r-list">${entries.map((e) => html`
        <${Card} accent=${C.air}><div class="r-entry-row"><div><div class="r-entry-date">${fmtDate(e.date)} · <span class="r-badge" style="border-color:${C.air};color:${C.air}">${e.status}</span></div>
          <div class="r-entry-line"><b>${e.title}</b></div>
          ${e.notes && html`<div class="r-entry-notes">${e.notes}</div>`}
          <${StoricoVoce} voce=${e} color=${C.air} />
        </div><button class="r-icon-btn" onClick=${() => onDelete(e.id)}>✕</button></div></${Card}>`)}</div>`}
    ` : tab === "percorsi" ? html`<div>
        <${SemiPanel} color=${C.air} semi=${semi || []} onAddSeed=${onAddSeed} onApproveSeedStrategy=${onApproveSeedStrategy} onUnlockGatedSeed=${onUnlockGatedSeed} onDiscussInShell=${onDiscussInShell} onAdvance=${advanceSeedIfDue} onArchiveSeed=${onArchiveSeed} />
        <${PercorsiPanel} pillar="air" color=${C.air} percorsi=${percorsi} setPercorsi=${setPercorsi} settings=${settings} digest=${digest} pillarMemory=${memory?.air?.corrente} />
      </div>`
    : html`<${Card} accent=${C.air}>
        <${Field} label="Cosa deve fare l'agente? (ricerca web reale)">
          <textarea class="r-textarea" value=${task} onInput=${(e) => setTask(e.target.value)} placeholder="es. Cerca 5 canali simili e riassumi cosa funziona" disabled=${running} />
        </${Field}>
        <button class="r-btn" style="background:${C.air}" onClick=${runAgent} disabled=${running}>${running ? "Ricerca in corso…" : "Avvia agente"}</button>
        ${error && html`<div class="r-error">${error}</div>`}
      </${Card}>
      ${result && html`<${Card} accent=${C.air}><div class="r-magi-text">${result}</div></${Card}>`}`}
  </div>`;
}

//──────────────────────────────────────────────────────────
// AGORÀ MAGI
//──────────────────────────────────────────────────────────
const MagiStage = ({ label, color, text, compact }) => !text ? null : html`<div class=${compact ? "r-magi-stage-compact" : "r-magi-stage"}>
  <div class="r-magi-label" style="color:${color}">${label}</div><div class="r-magi-text">${text}</div></div>`;
const MAGI_PILLARS = [{ id: "", label: "Nessuno (trasversale)" }, { id: "bio", label: "BIO" }, { id: "air", label: "AIR" }, { id: "vidya", label: "VIDYA" }];
const MAGI_INTENSITIES = [{ id: "leggera", label: "Leggera" }, { id: "media", label: "Media" }, { id: "profonda", label: "Profonda" }];
function MagiView({ sessions, onSave, onDelete, settings, memory, updateMemoria, pushDebugLog }) {
  const [question, setQuestion] = useState(""); const [running, setRunning] = useState(false);
  const [targetPillar, setTargetPillar] = useState(""); const [intensity, setIntensity] = useState("media");
  const [stage, setStage] = useState({ balthasar: "", melchior: "", caspar: "", synthesis: "" }); const [error, setError] = useState("");
  const engineLabel = MODEL_OPTIONS.find((m) => m.id === settings.model)?.label || settings.model;
  const start = async () => { if (!question.trim() || running) return; setRunning(true); setError(""); setStage({ balthasar: "", melchior: "", caspar: "", synthesis: "" });
    try {
      const result = await runTriadeMagi(question.trim(), (k, v) => setStage((s) => ({ ...s, [k]: v === null ? "…" : v })), settings, { memory, targetPillar: targetPillar || null, intensity }, pushDebugLog);
      onSave({ id: uid(), date: new Date().toISOString(), question: question.trim(), engine: engineLabel, pillar: targetPillar || null, intensity, ...result });
      // La perturbazione lascia traccia nella memoria del pilastro-bersaglio (§4.1) — non blocca in caso di errore.
      if (targetPillar && updateMemoria) {
        try { const nuovaMemoria = await reflectPerturbationIntoMemoria(targetPillar, result.synthesis, intensity, memory, settings, pushDebugLog); if (nuovaMemoria) updateMemoria(targetPillar, nuovaMemoria); }
        catch { /* la traccia in memoria è best-effort: la sessione Magi è già salvata */ }
      }
      setQuestion("");
    }
    catch (e) { setError(e.message || "La Triade non ha risposto."); } finally { setRunning(false); } };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="AGORÀ MAGI" subtitle="Balthasar → Melchior → Caspar → sintesi · motore: ${engineLabel}" />
    <${Card} accent=${C.core}>
      <${Field} label="Dilemma o domanda per il Ghost"><textarea class="r-textarea" value=${question} onInput=${(e) => setQuestion(e.target.value)} disabled=${running} /></${Field}>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <${Field} label="Pilastro bersaglio">
          <select class="r-input" value=${targetPillar} onInput=${(e) => setTargetPillar(e.target.value)} disabled=${running}>
            ${MAGI_PILLARS.map((p) => html`<option value=${p.id}>${p.label}</option>`)}
          </select>
        </${Field}>
        <${Field} label="Intensità">
          <select class="r-input" value=${intensity} onInput=${(e) => setIntensity(e.target.value)} disabled=${running}>
            ${MAGI_INTENSITIES.map((i) => html`<option value=${i.id}>${i.label}</option>`)}
          </select>
        </${Field}>
      </div>
      <button class="r-btn" onClick=${start} disabled=${running}>${running ? "Sintesi in corso…" : "Avvia la Triade"}</button>
      ${error && html`<div class="r-error">${error}</div>`}
    </${Card}>
    ${running && html`<${Card} accent=${C.core}>
      <${MagiStage} label="Balthasar · il Perturbatore" color="#C97A5C" text=${stage.balthasar} />
      <${MagiStage} label="Melchior · il Traduttore" color="#6FA3AD" text=${stage.melchior} />
      <${MagiStage} label="Caspar · l'Ancora" color="#8FAF95" text=${stage.caspar} />
      <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${stage.synthesis} />
    </${Card}>`}
    ${sessions.length === 0 ? html`<${Empty} text="Nessuna sessione ancora registrata." />` : html`<div class="r-list">${sessions.map((s) => html`
      <${Card} accent=${C.core}><div class="r-entry-row"><div style="flex:1"><div class="r-entry-date">${fmtDate(s.date)}${s.engine ? ` · ${s.engine}` : ""}${s.pillar ? ` · → ${s.pillar.toUpperCase()}` : ""}${s.intensity ? ` · ${s.intensity}` : ""}</div>
        <div class="r-entry-line"><b>${s.question}</b></div>
        <${MagiStage} label="Balthasar · il Perturbatore" color="#C97A5C" text=${s.balthasar} compact />
        <${DiagnosticaFonti} diag=${s.webSearchDiag} sospetto=${s.possibleHallucinatedSource} />
        <${MagiStage} label="Melchior · il Traduttore" color="#6FA3AD" text=${s.melchior} compact />
        <${MagiStage} label="Caspar · l'Ancora" color="#8FAF95" text=${s.caspar} compact />
        <${MagiStage} label="Sintesi Esecutiva" color=${C.core} text=${s.synthesis} compact />
      </div><button class="r-icon-btn" onClick=${() => onDelete(s.id)}>✕</button></div></${Card}>`)}</div>`}
  </div>`;
}

// 31/08/2026 — DOVE IL GHOST VEDE SE BALTHASAR HA CERCATO DAVVERO.
// Fino a stamattina questa informazione, per l'Agora, non esisteva proprio: nessun rilevatore e
// nessuna riga nel registro. Il brief sui Serbatoi chiedeva "Balthasar e' stato ritestato con chiave
// reale?" — la risposta onesta e' che non posso ritestarlo io da qui, ma da adesso si controlla da
// solo: la prossima Agora vera lascia questo riquadro, e non serve piu' fidarsi a parole.
// Compare solo quando c'e' qualcosa da dire: una sessione vecchia, o una senza ricerca, non mostra
// niente invece di mostrare un riquadro vuoto.
function DiagnosticaFonti({ diag, sospetto }) {
  if (!diag) return null;
  const domini = (diag.citationDomains || []).join(", ");
  return html`<div class="r-hub-detail" style="margin-top:4px">
    ${diag.toolInvoked
      ? html`<span>Ricerca web eseguita davvero · ${diag.citationCount} citazion${diag.citationCount === 1 ? "e" : "i"}${domini ? ` · ${domini}` : ""}</span>`
      : html`<span>Nessuna citazione nella risposta: la ricerca web non risulta eseguita in questo giro.</span>`}
    ${sospetto && html`<div class="r-error" style="margin-top:4px">Attenzione: Balthasar nomina qualcosa che non trova riscontro in nessun dominio realmente citato — possibile fonte inventata. Non è un blocco, è un sospetto: verificalo prima di usarla.</div>`}
  </div>`;
}

//──────────────────────────────────────────────────────────
// SIMBIOSI
//──────────────────────────────────────────────────────────
function SimbiosiView({ resonance, onRecalc, calculating, error, onPromoteIdentity, onDismissIdentity, onAcceptPercorsoSuggestion, onDismissPercorsoSuggestion, percorsoSuggeritoStatus }) {
  const hint = resonance.identityHint;
  const sugg = resonance.percorsoSuggerito;
  return html`<div class="r-screen">
    <${SectionHeader} color="#2A2E35" title="SIMBIOSI" subtitle="Il punto di incontro tra i pilastri — sensing tra ordine e caos" />
    ${hint && html`<${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:${C.core}">Convergenza identitaria emergente</div>
      <div class="r-magi-text" style="margin-top:8px">Il percorso <b>"${hint.title}"</b> (${(hint.pillar || "").toUpperCase()}) sembra intrecciarsi in qualcosa di più ampio: <i>${hint.becoming}</i>. Vuoi trattarlo come percorso identitario?</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="r-btn" style="background:${C.core}" onClick=${() => onPromoteIdentity(hint)}>Sì, è identitario</button>
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${onDismissIdentity}>No, resta puntuale</button>
      </div>
    </${Card}>`}
    ${sugg && html`<${Card} accent=${C[sugg.pillar]}>
      <div class="r-hub-title" style="color:${C[sugg.pillar]}">Un percorso possibile</div>
      <div class="r-magi-text" style="margin-top:8px">In <b>${sugg.pillar.toUpperCase()}</b>: <b>"${sugg.title}"</b>. ${sugg.motivazione}${sugg.collegatoA?.length ? html` <i>(si collega a ${sugg.collegatoA.join(", ")})</i>` : ""}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="r-btn" style="background:${C[sugg.pillar]}" onClick=${() => onAcceptPercorsoSuggestion(sugg)} disabled=${percorsoSuggeritoStatus === "creando"}>${percorsoSuggeritoStatus === "creando" ? "Apro…" : "Sì, aprilo"}</button>
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${onDismissPercorsoSuggestion}>Non ora</button>
      </div>
      ${percorsoSuggeritoStatus === "errore" && html`<div class="r-error" style="margin-top:6px">Non sono riuscito ad aprirlo — riprova.</div>`}
    </${Card}>`}
    <${Card}>
      <button class="r-btn" onClick=${() => onRecalc(false)} disabled=${calculating}>${calculating ? "Valutazione in corso…" : "Calcola risonanza"}</button>
      ${error && html`<div class="r-error">${error}</div>`}
      ${resonance.text && html`<div class="r-magi-text" style="margin-top:12px;white-space:pre-wrap">${resonance.text}</div>
        <div class="r-hub-detail" style="margin-top:8px">Calcolato: ${new Date(resonance.time).toLocaleString("it-IT")}</div>`}
    </${Card}>
  </div>`;
}

//──────────────────────────────────────────────────────────
// SHELL — chat con memoria, smista da solo nei pilastri
//──────────────────────────────────────────────────────────
function AnochinTrace({ trace }) {
  const [open, setOpen] = useState(false);
  const stages = [
    ["1 · Afferenze", trace.afferenze], ["2 · Decisione", trace.decisione],
    ["3 · Accettore", trace.accettore], ["4 · Effettore", trace.effettore], ["5 · Azione", trace.azione],
  ].filter(([, v]) => v);
  if (!stages.length) return null;
  return html`<div class="r-anochin-wrap">
    <button class="r-anochin-toggle" onClick=${() => setOpen(!open)}>${open ? "▾ Ciclo percezione-azione" : "▸ Ciclo percezione-azione"}</button>
    ${open && html`<div class="r-anochin-body">
      ${stages.map(([label, val]) => html`<div class="r-anochin-stage"><div class="r-anochin-label">${label}</div><div class="r-anochin-val">${val}</div></div>`)}
    </div>`}
  </div>`;
}
// ══════════════════════════════════════════════════════════════════════════════
// IL CONFINE ATTORNO A OGNI SINGOLO MESSAGGIO (23/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Stamattina la scheda Shell si apriva su una pagina bianca. Le altre schede funzionavano, quella
// no, sempre, anche a freddo dopo un riavvio — perche' il difetto non era in un turno in corso ma
// nel disegnare la conversazione salvata. Un solo elemento che va in errore mentre si disegna, e
// tutta la chat sparisce: i messaggi di ieri, quelli di una settimana fa, tutto.
// Questo e' sproporzionato. Il principio del progetto e' che il sistema si ferma e MOSTRA, mai che
// sparisce nel nulla — e all'ultimo livello, quello della semplice visualizzazione, mancava.
//
// Come funziona: `MessaggioProtetto` e' il confine, `CorpoMessaggio` e' cio' che sta dentro. La
// separazione in due non e' un vezzo: un confine non intercetta gli errori del proprio disegno, solo
// quelli dei figli, quindi il disegno vero deve stare un gradino piu' sotto. Il messaggio arriva
// come una funzione da chiamare (`disegna`) invece che gia' disegnato, altrimenti verrebbe costruito
// nel componente padre — fuori dal confine — e l'errore scapperebbe di nuovo.
// Sono definiti QUI, fuori da ShellView, e non dentro: un componente ridefinito a ogni disegno viene
// trattato come un componente nuovo, e Preact butterebbe e ricostruirebbe tutta la lista ogni volta.
function CorpoMessaggio({ disegna }) { return disegna(); }
function MessaggioProtetto({ disegna, avvisa }) {
  const [errore] = useErrorBoundary((e) => { try { avvisa?.(e); } catch { /* il registro non deve mai far cadere il disegno */ } });
  if (errore) {
    return html`<div class="r-shell-system-note">— Questo messaggio non sono riuscito a mostrarlo${errore?.message ? ` (${String(errore.message).slice(0, 120)})` : ""}. Il resto della conversazione è tutto qui sopra e qui sotto: non è andato perso niente. —</div>`;
  }
  return html`<${CorpoMessaggio} disegna=${disegna} />`;
}
function ShellView({ messages, setMessages, settings, addBio, addAir, addVidya, aggiungiDaLettura, percorsi, setPercorsi, memory, updateMemoria, styleMemory, setStyleMemory, bio, air, vidya, pushDebugLog, addSeed, advanceSeedIfDue, shellDraft, consumeShellDraft, pBio, pAir, pVidya, semi, ghostProfile, saveGhostProfile }) {
  // BLOCCO 1 — il fuoco vive qui perche' e' della conversazione, non dell'app intera.
  const [fuoco, setFuocoState] = useState(() => leggiFuoco());
  const cambiaFuoco = (f) => setFuocoState(f);
  // 31/08/2026 — il fuoco che parte verso il modello si porta dietro il fascicolo del percorso.
  // leggiFuoco() resta quello che era (etichetta e id, letti da localStorage): il fascicolo si
  // costruisce QUI, dove i percorsi ci sono, e solo per il turno di chat.
  const percorsoDelFuoco = (f) => (f && f.tipo === "percorso"
    ? PILASTRI_NOMI.map((k) => (percorsi[k] || []).find((p) => p.id === f.id)).find(Boolean) || null
    : null);
  const fuocoConDossier = () => {
    const f = leggiFuoco();
    const p = percorsoDelFuoco(f);
    return p ? { ...f, dossier: dossierPercorso(p) } : f;
  };
  const [input, setInput] = useState("");
  // Trigger di avanzamento Seme (Parte 3 del brief): una sola volta per apertura di questa tab —
  // ShellView viene smontata/rimontata ad ogni cambio di `view` in App() (reso condizionale, non
  // nascosto via CSS), quindi un effect a dipendenze vuote soddisfa esattamente "una volta per
  // sessione Shell, al mount", mai ad ogni messaggio (i re-render per nuovi messaggi non lo rieseguono).
  useEffect(() => { advanceSeedIfDue?.(); }, []);
  // PUNTO 4 (BRIEF_correzioni_post_test 26/07/2026): "Discuti in Shell" — precarica l'input, MAI invio
  // automatico (Legge 8: il Ghost decide se/come inviarlo). Consumato una sola volta (shellDraft torna
  // "" in App), così non sovrascrive un input che il Ghost sta già scrivendo in un mount successivo.
  useEffect(() => { if (shellDraft) { setInput(shellDraft); consumeShellDraft?.(); } }, [shellDraft]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Modalità dialettica per-sessione (mai persistente) — override del default cognitiveStyle.dialectic
  // del profilo. null = usa il default del profilo; true/false = override esplicito per questa sessione.
  const [dialecticOverride, setDialecticOverride] = useState(null);
  const [speakingId, setSpeakingId] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [attaching, setAttaching] = useState(false);
  // Flusso "genera documento da conversazione" (alternativa A): negozia in chat → genera → ancora a un Percorso
  const [docPanel, setDocPanel] = useState(false);
  const [docPhase, setDocPhase] = useState("idle"); // idle | generating | preview | saving
  const [docText, setDocText] = useState("");
  const [docSummary, setDocSummary] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docTargetPillar, setDocTargetPillar] = useState("bio");
  const [docTargetId, setDocTargetId] = useState("");      // id percorso esistente, o "" = nuovo
  const [docNewTitle, setDocNewTitle] = useState("");       // titolo del nuovo percorso se docTargetId vuoto
  const [docMsg, setDocMsg] = useState("");
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  // 22/08/2026 — l'impianto che regge "la risposta compare appena e' pronta".
  // codaSfondo: la fila dei lavori di sfondo. Uno alla volta, in ordine di partenza. Serve perche'
  //   memoria procedurale e memoria di stile si riscrivono per intero: due turni che ci lavorano
  //   insieme si cancellerebbero a vicenda.
  // memoriaRef / stileRef: la finestra sul presente. Uno sfondo che parte adesso deve riscrivere a
  //   partire da cio' che c'e' ADESSO, non da cio' che c'era quando il suo turno e' cominciato.
  const codaSfondo = useRef(Promise.resolve());
  const memoriaRef = useRef(memory);
  const stileRef = useRef(styleMemory);
  useEffect(() => { memoriaRef.current = memory; }, [memory]);
  useEffect(() => { stileRef.current = styleMemory; }, [styleMemory]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  const toggleSpeak = (id, text) => {
    if (speakingId === id) { stopSpeaking(); setSpeakingId(null); return; }
    setSpeakingId(id);
    speakText(text, () => setSpeakingId((cur) => (cur === id ? null : cur)));
  };
  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permette di riselezionare lo stesso file più avanti
    if (!file) return;
    setAttaching(true); setError("");
    try { setAttachment(await processAttachment(file)); }
    catch (err) { setError(err.message); } finally { setAttaching(false); }
  };
  // 23/08/2026 — IL GESTO DEL GHOST NON SI BUTTA MAI VIA IN SILENZIO.
  // Questa riga di guardia esisteva da sempre e sembrava innocua: "se sto gia' rispondendo, non
  // partire". Il difetto e' in quel `return` nudo. Stanotte, mentre un turno rigenerava per la
  // seconda volta un piano da 3000 token, il Ghost ha scritto tre messaggi — "Il resto del piano?",
  // "Hai troncato la risposta", "Ci sei?" — e tutti e tre sono stati scartati qui, senza comparire
  // in chat, senza una riga, senza niente. Da fuori quello non e' "sto elaborando": e' un'app rotta.
  // Adesso, se un turno e' ancora in volo, glielo si dice, e il testo che ha scritto resta nella
  // casella invece di sparire: non deve riscriverlo.
  // Il parametro serve al pulsante "Continua da dove ti sei fermato". Si controlla che sia una
  // STRINGA perche' questa funzione e' agganciata anche a onClick, che passa l'evento del tocco:
  // senza il controllo, un tocco su "Invia" manderebbe allo Shell un oggetto evento.
  const send = async (testoEsplicito = null) => {
    const esplicito = typeof testoEsplicito === "string" && testoEsplicito.trim() ? testoEsplicito.trim() : null;
    if (!esplicito && !input.trim() && !attachment) return;
    if (attaching) { setError("Sto ancora leggendo l'allegato. Un attimo e puoi mandare."); return; }
    if (sending) {
      setError("La risposta di prima sta ancora arrivando. Non ho buttato via quello che hai scritto — è rimasto qui sotto, e parte appena questa finisce. Se ci mette troppo, dopo due minuti e mezzo mi fermo da solo e te lo dico.");
      return;
    }
    const userText = esplicito || input.trim() || (attachment?.kind === "image" ? "Guarda questa immagine." : "Guarda questo documento.");
    const currentAttachment = attachment;
    const history = messages.slice(-20).map((m) => ({ role: m.role, content: marcaPropostaNelloStorico(m) }));
    // (lastMsg non serve piu': era l'appiglio della conferma a parole, rimossa il 16/08/2026.)
    stopSpeaking(); setSpeakingId(null);
    // Id univoci per messaggio: voce/copia non dipendono più dall'indice (che sbagliava
    // quando una nota di sistema si inseriva in mezzo alla sequenza).
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: userText, time: new Date().toISOString(), attachmentName: currentAttachment ? (currentAttachment.name || "immagine") : null, attachmentKind: currentAttachment?.kind }]);
    const assistantMsgId = uid();
    // Con il testo esplicito la casella non si tocca: se il Ghost ci aveva scritto dentro qualcosa
    // mentre aspettava, chiedere il seguito non deve cancellarglielo.
    if (!esplicito) { setInput(""); setAttachment(null); }
    setSending(true); setError("");
    // 25/08/2026 — WAKE LOCK. Il Ghost ha riprodotto un blocco di oltre un minuto e mezzo su una
    // richiesta che in realta' non passava nemmeno dal modello (la scorciatoia diretta del
    // calendario): il telefono sospendeva la richiesta in corso quando lo schermo si spegneva, e
    // riprendeva solo tenendo il dito sullo schermo per impedirlo. Questo tiene lo schermo acceso
    // DA SOLO per la durata del turno — si spegne appena la richiesta finisce, non prima e non
    // "per sempre". Se il browser non supporta l'API, o la nega, si continua esattamente come
    // prima: non deve mai bloccare l'invio del messaggio.
    let wakeLock = null;
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* nessun blocco: si continua senza */ }
    // Vedi salvaRichiestaInSospeso: messa da parte PRIMA di partire, cosi' se il telefono sospende
    // la scheda la richiesta non e' persa. Viene tolta appena la risposta compare, o appena si
    // capisce che il guasto non era di rete.
    salvaRichiestaInSospeso(userText);
    try {
      // ═══ PIANO ALIMENTARE: IL MODELLO INVENTA, IL PROGRAMMA MONTA (29/08/2026) ═══
      // Vedi montaPianoAlimentare per il perche'. E' una strada SEPARATA dal turno normale, non un
      // ramo dentro di esso: nel turno normale il modello SCRIVE la risposta, qui il modello non
      // scrive il piano — inventa solo i piatti, e la griglia la compone il codice. Percio' non
      // passa dalla selezione di un'azione (non ce n'e' nessuna da scegliere in "fammi un piano")
      // ne' dalla lettura multi-lente. Limite dichiarato e accettato: per questi turni la memoria
      // procedurale non si aggiorna da sola.
      if (richiestaDiPianoAlimentare(userText) && settings.apiKey && !currentAttachment) {
        const parametri = estraiParametriPiano(userText);
        const vincoliAlimentari = (Array.isArray(ghostProfile?.hardConstraints) ? ghostProfile.hardConstraints : [])
          .filter(eVincoloAlimentare).map((c) => c.testo).filter(Boolean);
        const repertorioGrezzo = await generaRepertorioPasti(userText, vincoliAlimentari, memoriaRef.current?.bio?.corrente || null, settings, pushDebugLog);
        // Vedi filtraRepertorioPerVincoli: al modello si CHIEDE di rispettare le esclusioni, il
        // programma le FA RISPETTARE. Un piatto che contiene un alimento escluso non entra nella
        // griglia nemmeno se il modello ha ignorato l'istruzione (30/08: "ci sono ancora le zucchine").
        const { repertorio, scartati } = filtraRepertorioPerVincoli(repertorioGrezzo, vincoliAlimentari);
        if (scartati.length) pushDebugLog?.({ type: "repertorio-filtrato-per-vincoli", quanti: scartati.length, scartati: scartati.slice(0, 10), error: null });
        const piano = repertorio && montaPianoAlimentare(repertorio, parametri);
        if (piano) {
          const testoPiano = formatPianoAlimentare(piano);
          const scartiDelPiano = controllaPianoAlimentare(testoPiano, vincoliAlimentari, userText);
          const giaDichiarati = vincoliAlimentari.map((v) => v.toLowerCase().trim());
          const vincoliProposti = proponiVincoliAlimentari(userText)
            .filter((v) => !giaDichiarati.some((g) => g === v.toLowerCase().trim() || g.includes(v.toLowerCase().trim())));
          chiudiRichiestaInSospeso();
          pushDebugLog?.({ type: "piano-montato-dal-programma", giorni: piano.righe.length, mediaChiesta: piano.kcalMedia, mediaReale: piano.mediaReale, minimo: piano.minimo, massimo: piano.massimo, scarti: scartiDelPiano ? scartiDelPiano.scarti.length : 0, error: null });
          setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: testoPiano, time: new Date().toISOString(), actions: [], alerts: [], scartiDelPiano, vincoliProposti }]);
          vibra("bio");
          return; // il finally esterno rilascia il Wake Lock e rimette a posto lo stato di invio
        }
        // Repertorio inutilizzabile: si dichiara e si prosegue col turno normale, che almeno
        // qualcosa produce. Non si finge che sia andata bene, e non si lascia il Ghost a mani vuote.
        pushDebugLog?.({ type: "piano-montato-dal-programma", error: "repertorio non utilizzabile: ripiego sul turno normale" });
      }
      // §1.3 — RIMOSSA LA CONFERMA A PAROLE (16/08/2026). Qui prima bastava che il Ghost scrivesse
      // "ok", "va bene", "dai", "procedi" perche' il programma creasse il percorso proposto nel
      // messaggio precedente. E' esattamente la conferma dedotta dal contesto che il piano vieta:
      // nella prova reale un "Sì, fissalo" riferito a UNA card ha finito per valere come conferma
      // di piu' cose insieme. Ora il percorso si crea solo toccando il pulsante della sua card
      // (vedi la proposta di percorso piu' sotto), come gia' facevano i Semi.
      // ── IL RIORDINO (22/08/2026) ────────────────────────────────────────────────
      // Fin qui l'ordine era: risposta → selezione dell'azione → esecuzione su un tocco. Voleva
      // dire che il modello, mentre scriveva, non aveva mai il calendario — e da li' venivano sia
      // gli appuntamenti inventati sia la frase contraddittoria del 13:29 ("ecco cosa ho
      // trovato... non ho accesso alle informazioni del calendario"), che non era un errore del
      // modello ma la descrizione esatta della sua situazione.
      // Adesso, per le sole azioni che non cambiano niente fuori, l'esecuzione viene PRIMA.
      // Non costa una chiamata al modello in piu': la selezione esisteva gia' ed era gia'
      // sequenziale, semplicemente stava dopo. Misurato prima di scrivere questa riga.
      const inventarioOra = costruisciInventario({ pBio, pAir, pVidya, semi });
      let sceltaAnticipata = null;
      if (meritaTurnoDiSelezione(userText)) {
        // 25/08/2026 — se la frase basta da sola (vedi candidataTrovaEventoDiretta), si salta la
        // chiamata di selezione: nessun modello da pagare ne' da aspettare per capire una cosa che
        // il codice gia' riconosce con sicurezza. Vale SOLO per questa azione (lettura, reversibile,
        // nessun effetto fuori: sbagliare qui costa una ricerca a vuoto, mai un dato toccato), e solo
        // se la capacita' e' davvero accesa — altrimenti si passa dalla selezione come sempre, che e'
        // il posto dove oggi si gestisce "il Ghost ha chiesto una cosa spenta".
        const capaceDiTrovare = azioniAttive().some((a) => a.id === "trova_evento_calendario");
        if (capaceDiTrovare && candidataTrovaEventoDiretta(userText)) {
          // Il parametro NON e' la frase intera: conterrebbe "appuntamento"/"con", le parole del
          // trigger stesso, che punteggioBersaglio confonderebbe per punti a favore di QUALSIASI
          // evento chiamato "appuntamento con qualcuno" — vedi RUMORE_BERSAGLIO_RE per il perche'.
          sceltaAnticipata = { azioneId: "trova_evento_calendario", parametro: estraiBersaglioPerRicercaDiretta(userText), orarioModello: null };
          pushDebugLog?.({ type: "selezione-diretta", azioneId: "trova_evento_calendario", motivo: "frase riconosciuta dal codice, nessuna chiamata al modello" });
        } else {
          try {
            sceltaAnticipata = await scegliAzione(userText, inventarioOra, leggiFuoco(), azioniAttive(), settingsPerSelezione(settings), pushDebugLog, history);
          } catch (e) {
            // Una selezione fallita non deve MAI far fallire la conversazione: il Ghost ha comunque
            // la sua risposta, semplicemente senza azione.
            pushDebugLog?.({ type: "selezione-azione", error: e.message });
          }
        }
      }
      // L'esecuzione immediata riguarda SOLO cio' che il registro dichiara non richiedere conferma,
      // e oggi e' una sola azione: leggere il calendario. L'interruttore resta l'unico gate davanti
      // a essa — se il Ghost l'ha spento, non parte niente e il modello riceve il perche'.
      let letturaCalendario = null;
      if (sceltaAnticipata?.azioneId === "leggi_calendario" && eseguibileSubito("leggi_calendario")) {
        if (!azioniAttive().some((a) => a.id === "leggi_calendario")) {
          letturaCalendario = { saltata: true, motivo: "il Ghost ha SPENTO in Setup la capacita' di leggere il calendario" };
          pushDebugLog?.({ type: "lettura-calendario-saltata", motivo: "interruttore spento" });
        } else {
          const periodo = preparaClasseB("leggi_calendario", sceltaAnticipata.parametro).lettura;
          if (!periodo?.ok) {
            letturaCalendario = { saltata: true, motivo: `non ho capito che periodo guardare da "${sceltaAnticipata.parametro}"` };
            registraAzione({ fase: "rifiutata", azioneId: "leggi_calendario", motivo: periodo?.motivo || "periodo non capito" });
          } else {
            const r = await leggiEventiDalCalendario(periodo.inizioISO, periodo.fineISO).catch((e) => ({ ok: false, motivo: e.message }));
            letturaCalendario = { ...r, etichetta: periodo.etichetta };
            // Ogni lettura eseguita finisce nel registro. Ora conta piu' di prima: non c'e' piu' un
            // gesto del Ghost a marcarla, quindi il registro e' l'unico posto dove resta traccia.
            registraAzione({ fase: r.ok ? "eseguita-e-verificata" : "esito-fallita", azioneId: "leggi_calendario", etichetta: periodo.etichetta, motivo: r.motivo || "", trovati: r.eventi?.length ?? 0, automatica: true });
          }
        }
      }
      // 25/08/2026 — TROVARE UN EVENTO PER NOME, SENZA TOCCARLO. Stessa disciplina di
      // leggi_calendario: e' una lettura, non chiede conferma, e il risultato deve essere pronto
      // PRIMA che il modello scriva — cosi' la data che dice non e' la sua memoria, e' quella
      // appena letta da Google. Riusa la stessa ricerca di cancella/sposta, ma qui non si tocca
      // niente: si dice solo quando e'.
      let ricercaEvento = null;
      if (sceltaAnticipata?.azioneId === "trova_evento_calendario" && eseguibileSubito("trova_evento_calendario")) {
        if (!azioniAttive().some((a) => a.id === "trova_evento_calendario")) {
          ricercaEvento = { esito: "spenta", motivo: "il Ghost ha SPENTO in Setup la capacita' di cercare un appuntamento per nome" };
        } else {
          ricercaEvento = await trovaEventoBersaglio(sceltaAnticipata.parametro).catch((e) => ({ esito: "lettura-fallita", motivo: e.message }));
          registraAzione({ fase: ricercaEvento.esito === "trovato" ? "eseguita-e-verificata" : "esito-" + ricercaEvento.esito, azioneId: "trova_evento_calendario", parametro: sceltaAnticipata.parametro, esitoRicerca: ricercaEvento.esito, candidati: (ricercaEvento.candidati || []).map((c) => ({ id: c.id, etichetta: c.titolo })) });
        }
      }
      // 31/08/2026 — RIAPRIRE UN DOCUMENTO DEL PERCORSO. Stessa disciplina delle due letture qui
      // sopra: si esegue PRIMA che il modello scriva, cosi' il testo su cui lavora e' quello vero e
      // non il suo ricordo. Il percorso da cui prenderlo e' quello aperto adesso, non uno nominato
      // nella frase: se non c'e' un fuoco su un percorso, non si indovina — si dichiara.
      let documentoAperto = null;
      if (sceltaAnticipata?.azioneId === "apri_documento" && eseguibileSubito("apri_documento")) {
        documentoAperto = trovaDocumentoNelPercorso(percorsoDelFuoco(leggiFuoco()), sceltaAnticipata.parametro);
        registraAzione({ fase: documentoAperto.esito === "trovato" ? "eseguita-e-verificata" : "esito-" + documentoAperto.esito, azioneId: "apri_documento", parametro: sceltaAnticipata.parametro, etichetta: documentoAperto.doc?.title || "", motivo: documentoAperto.motivo || "", automatica: true });
      }
      // 22/08/2026 — LA RICERCA DEL BERSAGLIO DA CANCELLARE. Cancellare e' una scrittura e passera'
      // dalla card e dal pulsante, come ogni scrittura. Ma per poter NOMINARE l'evento sulla card
      // bisogna prima averlo letto: quindi la ricerca — che e' una lettura, e non cambia niente —
      // avviene qui, prima che il modello scriva, e il modello riceve cio' che si e' trovato.
      // Cosi' la card mostra l'evento come sta su Google, non come il modello se lo ricorda.
      let bersaglioCancellazione = null;
      if (sceltaAnticipata?.azioneId === "cancella_evento_calendario") {
        if (!azioniAttive().some((a) => a.id === "cancella_evento_calendario")) {
          bersaglioCancellazione = { esito: "spenta", motivo: "il Ghost ha SPENTO in Setup la capacita' di cancellare appuntamenti" };
        } else {
          bersaglioCancellazione = await trovaEventoDaCancellare(sceltaAnticipata.parametro).catch((e) => ({ esito: "lettura-fallita", motivo: e.message }));
          registraAzione({ fase: "ricerca-bersaglio", azioneId: "cancella_evento_calendario", parametro: sceltaAnticipata.parametro, esitoRicerca: bersaglioCancellazione.esito, candidati: (bersaglioCancellazione.candidati || []).map((c) => ({ id: c.id, etichetta: c.titolo })) });
        }
      }
      // 25/08/2026 — IL GEMELLO PER LO SPOSTAMENTO. Stessa disciplina della cancellazione: il
      // bersaglio si cerca DAVVERO su Google prima che il modello scriva, cosi' la card mostra
      // l'evento come sta sul calendario, non come il modello se lo ricorda. Il parametro arriva
      // nella forma "quale | nuovo quando": qui serve solo "quale".
      let bersaglioSpostamento = null;
      if (sceltaAnticipata?.azioneId === "sposta_evento_calendario") {
        if (!azioniAttive().some((a) => a.id === "sposta_evento_calendario")) {
          bersaglioSpostamento = { esito: "spenta", motivo: "il Ghost ha SPENTO in Setup la capacita' di spostare appuntamenti" };
        } else {
          const { descrizione } = parseParametroSpostamento(sceltaAnticipata.parametro);
          bersaglioSpostamento = await trovaEventoDaSpostare(descrizione).catch((e) => ({ esito: "lettura-fallita", motivo: e.message }));
          registraAzione({ fase: "ricerca-bersaglio", azioneId: "sposta_evento_calendario", parametro: descrizione, esitoRicerca: bersaglioSpostamento.esito, candidati: (bersaglioSpostamento.candidati || []).map((c) => ({ id: c.id, etichetta: c.titolo })) });
        }
      }
      // 22/08/2026 — la risposta compare appena e' pronta. Tutto cio' che sta dentro `mostra` e'
      // deterministico e a costo zero: filtri, composizione dell'elenco impegni, card della
      // proposta. Nessuna chiamata a modello. Quindi puo' girare nell'istante in cui il testo
      // arriva, senza aspettare Accettore, memoria procedurale e memoria di stile — che non
      // cambiano una virgola di quel testo e continuano dietro.
      let mostrato = false;
      const mostra = ({ reply, proposal, draft, usedWebSearch, anochin, rispostaTroncata, ultimaRisposta }) => {
      if (mostrato) return; mostrato = true;
      // La risposta e' arrivata sotto gli occhi del Ghost: non c'e' piu' niente da riprendere.
      chiudiRichiestaInSospeso();
      // 23/08/2026 — UNA BOLLA VUOTA NON E' UNA RISPOSTA.
      // Stanotte il Ghost ha ricevuto due bolle senza una parola dentro e nessuna spiegazione.
      // Succede quando il provider restituisce una scelta senza contenuto — per un rifiuto, per un
      // limite di contesto sfondato dalla storia (venti messaggi che contengono ognuno un piano
      // alimentare intero sono decine di migliaia di token), o per un errore che non arriva come
      // errore. Il codice faceva `content || ""` e mostrava quel vuoto come se fosse una risposta.
      // Adesso il vuoto viene chiamato col suo nome, e il turno non lascia niente a schermo che
      // sembri una risposta e non lo sia.
      // 23/08/2026, poche ore dopo — E QUESTO MESSAGGIO NON DEVE OFFRIRE COSE CHE NON ESISTONO.
      // La prima versione, scritta stanotte di corsa per chiudere il blocco totale, finiva con
      // "se ricapita apri una chat nuova". In questa app una chat nuova NON SI PUO' APRIRE: la
      // conversazione di ogni pilastro e' un flusso unico, non c'e' nessun pulsante e nessun
      // percorso per iniziarne un'altra. Il Ghost l'ha cercata e non l'ha trovata.
      // E' la stessa famiglia di "posso aiutarti a spostare un evento esistente" del calendario:
      // un rimedio ineseguibile e' peggio di nessun rimedio, perche' si spende tempo a cercarlo
      // prima di scoprire che si deve fare comunque a meno.
      // Cio' che il Ghost puo' fare davvero, oggi, in questa app, e' esattamente una cosa:
      // rimandare lo stesso messaggio. Quindi il messaggio dice quella, e non promette altro.
      //
      // E VIA ANCHE LA CAUSA, perche' non l'ho mai dimostrata. Stanotte avevo scritto "puo'
      // succedere quando la conversazione e' diventata molto lunga" come se fosse un fatto. Misurato
      // oggi sulla rete vera: al tetto assoluto di quello che questa app puo' mandare — 52.733 token,
      // venti messaggi tutti pieni di piani alimentari interi — il modello ha risposto bene quattro
      // volte su quattro, e la sua finestra dichiarata (131.072) e' il doppio di quel tetto. Quindi
      // la lunghezza da sola NON spiega il vuoto. Attribuire una causa che non si e' verificata e'
      // lo stesso difetto di offrire un rimedio che non esiste: manda il Ghost a risolvere un
      // problema che non ha. Finche' non so, il messaggio dice che non so.
      if (!String(reply || "").trim()) {
        // 23/08/2026 — tre cose cambiano rispetto a ieri, e tutte e tre servono.
        // 1. Adesso il programma HA GIA' RIPROVATO da solo (vedi askWithDegenerateGuard): dirgli
        //    "rimanda il messaggio" come prima cosa era chiedergli di fare a mano un lavoro fatto.
        // 2. Un RIFIUTO del modello e una risposta persa sono due cose diverse. Il campo che lo dice
        //    arriva in ogni risposta e l'app non lo guardava: adesso, se c'e', lo si legge al Ghost.
        // 3. Cio' che si sa del turno finisce nel Registro, cosi' la prossima volta c'e' un fatto da
        //    guardare invece di cinque ipotesi.
        const rifiuto = ultimaRisposta?.rifiuto;
        const soloRagionamento = ultimaRisposta?.contenutoVuotoMaRagionamentoPieno;
        const contenuto = rifiuto
          ? `Il modello si è rifiutato di rispondere, e ha detto perché: «${String(rifiuto).slice(0, 300)}». Non è un guasto dell'app — è una sua decisione. Se la richiesta ti sembra del tutto innocua, riscrivila con parole diverse: a volte basta.`
          : soloRagionamento
          ? "Il modello ha ragionato sulla tua richiesta ma non ha scritto la risposta: ha speso tutto il fiato a pensarci. Ho già riprovato una volta e ha rifatto lo stesso. Prova a chiedere meno cose in una volta — per esempio una settimana invece di due — e dovrebbe uscirne."
          : "Non è arrivato niente. Il modello ha chiuso la risposta senza scrivere una parola, due volte di seguito: ho già riprovato da solo prima di scriverti, quindi rimandare lo stesso messaggio probabilmente non basta. Se stavi chiedendo una cosa lunga, prova a spezzarla — una settimana invece di due — perché è la richiesta che gli costa di più. Se invece era una domanda breve, mandami una segnalazione col pulsante «Segnala»: da adesso il Registro delle azioni in Setup conserva cosa è successo davvero, e con quello in mano lo trovo.";
        setMessages((prev) => [...prev, { id: assistantMsgId, role: "system-note", time: new Date().toISOString(), content: contenuto }]);
        setSending(false);
        pushDebugLog?.({ type: "risposta-vuota-dal-modello", userText: userText.slice(0, 100), model: settings.model, ...(ultimaRisposta || {}) });
        registraAzione({ fase: "esito-fallita", azioneId: "risposta_shell", motivo: rifiuto ? "rifiuto del modello" : soloRagionamento ? "solo ragionamento, nessun testo" : "nessun contenuto, due tentativi", ...(ultimaRisposta || {}) });
        return;
      }
      // Canale primario Seme (brief Parte 1.A): euristica a costo zero sul messaggio del Ghost, non
      // sulla risposta dello Shell. Non crea nulla da sola — solo una proposta con un tap di conferma
      // (vedi card sotto), mai il pattern "conferma nel messaggio successivo" già usato per i Percorsi.
      const seedSuggestion = detectSeedWorthyIntent(userText) ? { content: userText } : null;
      // 23/08/2026 — i vincoli alimentari che il Ghost dichiara PARLANDO. Vedi proponiVincoliAlimentari.
      // Si propongono soltanto quelli che non sono gia' nell'elenco: riproporre una cosa gia' tenuta
      // sarebbe rumore, e il Ghost imparerebbe in fretta a ignorare la card.
      const giaDichiarati = (Array.isArray(ghostProfile?.hardConstraints) ? ghostProfile.hardConstraints : [])
        .filter(eVincoloAlimentare).map((c) => String(c.testo || "").toLowerCase().trim());
      const vincoliProposti = proponiVincoliAlimentari(userText)
        .filter((v) => !giaDichiarati.some((g) => g === v.toLowerCase().trim() || g.includes(v.toLowerCase().trim())));
      // BLOCCO 1 — il modello ha PROPOSTO un'azione? La proposta viene tolta dal testo e resa un
      // oggetto separato: cosi' il Ghost la vede come proposta (§7.2d, sempre visibile prima
      // dell'esecuzione) invece che come una riga di sintassi in mezzo alla risposta.
      // La risoluzione e' di Grado 0: deterministica, zero token, e se e' ambigua NON sceglie.
      // BLOCCO 2 — la proposta arriva ora dal TURNO DI SELEZIONE, una chiamata dedicata e brevissima,
      // non piu' da una riga di sintassi nascosta nella risposta. Due vantaggi concreti: la risposta
      // in chat resta pulita, e chi sceglie l'azione non deve anche parlare bene nello stesso fiato.
      // Il turno parte solo se il messaggio contiene un verbo di comando: una frase di sola
      // conversazione non merita una chiamata in piu', e cosi' il costo segue le richieste vere.
      let azioneProposta = null;
      // §1.4 — la rete di sicurezza. Qualunque tag il modello produca non arriva mai agli occhi del
      // Ghost, e se ne produce uno lo si scopre dal log invece che da uno screenshot suo.
      const ripulito = ripulisciTagAzione(reply);
      if (ripulito.rimossi.length) pushDebugLog?.({ type: "tag-azione-rimosso", rimossi: ripulito.rimossi, model: settings.model });
      // 17/08/2026 — IL VINCOLO STRUTTURALE. In un turno di chat NESSUNA azione esterna e' ancora
      // avvenuta: la conferma del Ghost, se serve, arriva dopo, toccando il pulsante della card.
      // Quindi qui azioneVerificata e' sempre falso, e qualunque "e' stato aggiornato" sparisce
      // prima di raggiungere lo schermo. L'unico testo al passato che il Ghost puo' leggere e'
      // quello che scrive il programma sotto la card, dopo aver riletto dalla fonte.
      const senzaEsiti = ripulisciAffermazioniDiEsito(ripulito.testo, false);
      if (senzaEsiti.affermazioni.length) pushDebugLog?.({ type: "affermazione-di-esito-neutralizzata", affermazioni: senzaEsiti.affermazioni, model: settings.model, userText: userText.slice(0, 100) });
      const esitiFalsi = senzaEsiti.affermazioni;
      // 20/08/2026 — IL TERZO FILTRO. Lo stato degli interruttori e' un dato che il programma ha in
      // mano: se il modello dice "quella capacita' e' spenta" e il dato dice che e' accesa, non e'
      // un'opinione, e' una frase falsa. Si toglie prima che il Ghost la legga.
      const senzaSmentite = smentisciCapacitaSpenta(senzaEsiti.testo, azioniAttive());
      const capacitaSmentite = senzaSmentite.smentite;
      const capacitaAccese = senzaSmentite.accese;
      if (capacitaSmentite.length) pushDebugLog?.({ type: "capacita-dichiarata-spenta-ma-accesa", frasi: capacitaSmentite, accese: capacitaAccese, userText: userText.slice(0, 100) });
      // 22/08/2026 — IL QUARTO FILTRO, e da questo giro il suo secondo argomento e' un fatto VERO
      // invece di una costante. Quando l'ho scritto stamattina passavo `false` e basta, perche' non
      // esisteva nessun percorso in cui il modello potesse avere il calendario mentre scriveva.
      // Adesso quel percorso esiste: se la lettura e' partita in cima al turno ed e' riuscita, il
      // modello ha ricevuto gli impegni veri e ne sta parlando legittimamente — toglierglieli
      // sarebbe un falso allarme. In tutti gli altri casi (interruttore spento, chiamata fallita,
      // periodo incomprensibile, nessuna lettura richiesta) il filtro resta acceso e severo come
      // stamattina: sono esattamente i casi in cui il modello inventa.
      const letturaRiuscita = !!(letturaCalendario && !letturaCalendario.saltata && letturaCalendario.ok);
      // Gli si passa la LETTURA, non un booleano: con la lettura in mano il filtro puo' distinguere
      // una frase che parla degli impegni letti da una che ne nomina uno che non c'era. Vedi
      // ripulisciContenutiDiCalendario, che dal 22/08 sera ha due criteri invece di uno.
      // 22/08/2026 — anche la RICERCA del bersaglio da cancellare e' una lettura del calendario, e
      // vale come tale per il filtro. Senza questa riga, su "cancella Bartolomeo" il programma
      // toglieva la frase vera "non ho trovato nessun appuntamento con Bartolomeo" scrivendo che la
      // lettura non era avvenuta — mentre era avvenuta eccome, solo che il suo esito stava in un
      // altro posto. Il filtro riceve cio' che e' stato letto; l'elenco composto dal codice invece
      // resta legato alla sola lettura richiesta dal Ghost, perche' qui si e' guardato tre mesi.
      const letturaPerIlFiltro = letturaRiuscita
        ? letturaCalendario
        : (bersaglioCancellazione?.eventi ? { ok: true, eventi: bersaglioCancellazione.eventi }
        : (bersaglioSpostamento?.eventi ? { ok: true, eventi: bersaglioSpostamento.eventi }
        : (ricercaEvento?.eventi ? { ok: true, eventi: ricercaEvento.eventi } : false)));
      // 23/08/2026 — L'ORDINE FRA QUESTI DUE FILTRI E' STATO INVERTITO, E NON E' UN DETTAGLIO.
      // Osservato sullo schermo del Ghost alle 03:42. Alla richiesta di cancellare, il modello ha
      // risposto "Posso solo aiutarti a creare un nuovo appuntamento o a SPOSTARE un evento
      // esistente, ma non posso cancellare nulla." La frase e' sbagliata per un motivo preciso e
      // dicibile: spostare un evento non si puo' fare, non esiste. Ma il filtro del calendario
      // arrivava prima, la toglieva perche' conteneva "non posso cancellare nulla" (la scambiava
      // per un'affermazione di assenza di impegni) e ci scriveva sopra "la lettura del calendario
      // non e' avvenuta, questo non viene da Google" — una spiegazione che col difetto vero non
      // c'entra niente e che manda il Ghost a cercare nel posto sbagliato.
      // Ora chi ha la spiegazione giusta parla per primo: togliOfferteInesistenti toglie la frase e
      // ci mette la riga onesta ("spostare un evento non lo so fare"), e al filtro del calendario
      // arriva un testo in cui quella frase non c'e' piu'.
      const offertePrima = togliOfferteInesistenti(senzaSmentite.testo);
      if (offertePrima.offerte.length) pushDebugLog?.({ type: "offerta-di-capacita-inesistente", frasi: offertePrima.offerte, model: settings.model });
      const senzaCalendario = ripulisciContenutiDiCalendario(offertePrima.testo, letturaPerIlFiltro);
      // E il gemello: se la lettura e' fallita e il modello non l'ha detto, lo dice il programma.
      const conFallimento = dichiaraFallimentoLettura(senzaCalendario.testo, letturaCalendario);
      if (conFallimento.aggiunta) pushDebugLog?.({ type: "fallimento-lettura-dichiarato-dal-programma", aggiunta: conFallimento.aggiunta, model: settings.model });
      // Secondo passaggio sulle offerte inesistenti: il primo (sopra) guarda il testo del modello,
      // questo guarda cio' che i filtri hanno lasciato, comprese le righe che il programma ha
      // aggiunto. Passare due volte non toglie mai niente in piu' di sbagliato — la funzione e'
      // idempotente, la sua riga onesta non contiene nessuna offerta — e chiude il caso in cui una
      // frase diventa un'offerta solo dopo che le e' stata tolta la parte davanti.
      const senzaOfferte = togliOfferteInesistenti(conFallimento.testo);
      const offerteInesistenti = [...offertePrima.offerte, ...senzaOfferte.offerte];
      if (senzaOfferte.offerte.length) pushDebugLog?.({ type: "offerta-di-capacita-inesistente", frasi: senzaOfferte.offerte, model: settings.model });
      // E via le righe del prompt che il modello si e' ritrovato a ricopiare. Vedi togliEchiDelPrompt.
      const senzaEchi = togliEchiDelPrompt(senzaOfferte.testo);
      if (senzaEchi.echi.length) pushDebugLog?.({ type: "eco-del-prompt-rimossa", righe: senzaEchi.echi, model: settings.model });
      // E QUI il cambio di strategia: l'elenco degli impegni non lo scrive il modello, lo compone il
      // codice dagli eventi letti, e viene aggiunto sotto la cornice del modello. Anche se il
      // modello non li avesse nominati affatto — come il 22/08 alle 14:41, dove ha omesso Petronio —
      // il Ghost li vede lo stesso, esatti.
      const elencoDalCodice = componiElencoImpegni(letturaCalendario);
      // 25/08/2026 — lo stesso principio per trova_evento_calendario: la data del singolo evento
      // trovato la scrive il codice, non il modello. Le due composizioni non si sovrappongono mai
      // nello stesso turno (sono due azioni diverse), quindi si concatenano senza conflitto.
      const risultatoRicercaDalCodice = componiRisultatoRicerca(ricercaEvento);
      const elencoOrisultato = [elencoDalCodice, risultatoRicercaDalCodice].filter(Boolean).join("\n\n");
      const replyPulita = elencoOrisultato ? `${senzaEchi.testo.trim()}\n\n${elencoOrisultato}`.trim() : senzaEchi.testo;
      const contenutiCalendarioInventati = senzaCalendario.contenuti;
      if (contenutiCalendarioInventati.length) pushDebugLog?.({ type: "contenuto-calendario-senza-lettura", frasi: contenutiCalendarioInventati, userText: userText.slice(0, 100), model: settings.model });
      // 28/08/2026 — MISURA, NON CORREZIONE. Vedi trovaMetaNarrazione: il testo non viene toccato
      // (togliere la frase butterebbe via il contenuto intrecciato, e a questo punto i token sono
      // gia' spesi comunque). Serve a sapere se la regola aggiunta al prompt di sistema regge sul
      // modello vero, invece di supporlo. `troncata` viaggia insieme di proposito: meta-narrazione
      // DA SOLA e' fastidiosa, meta-narrazione PIU' troncamento e' il difetto vero — spazio speso a
      // commentare invece che a scrivere il piano, che poi si interrompe.
      const metaNarrazione = trovaMetaNarrazione(replyPulita);
      if (metaNarrazione.length) pushDebugLog?.({ type: "meta-narrazione-nella-risposta", frammenti: metaNarrazione, quanti: metaNarrazione.length, troncata: rispostaTroncata, model: settings.model, userText: userText.slice(0, 100) });
      // 23/08/2026 — IL CONTROLLO DEL PIANO ALIMENTARE. Vedi controllaPianoAlimentare.
      // Non tocca il testo: il piano resta intero e leggibile, esattamente come il modello l'ha
      // scritto. Aggiunge solo l'elenco di cio' che non torna, perche' rileggersi quattordici giorni
      // riga per riga per scoprire che al Giorno 2 c'e' il salmone e' un lavoro che tocca al codice.
      const vincoliAlimentariDichiarati = (Array.isArray(ghostProfile?.hardConstraints) ? ghostProfile.hardConstraints : [])
        .filter(eVincoloAlimentare).map((c) => c.testo).filter(Boolean);
      const scartiDelPiano = controllaPianoAlimentare(replyPulita, vincoliAlimentariDichiarati, userText);
      if (scartiDelPiano) pushDebugLog?.({ type: "scarti-nel-piano-alimentare", quanti: scartiDelPiano.scarti.length, tipi: scartiDelPiano.scarti.map((s) => s.tipo), userText: userText.slice(0, 100) });
      // §1.2 — UNA PROPOSTA DI CLASSE B PENDENTE NON SI RIGENERA (16/08/2026), RIFATTA IL 20/08.
      // La versione del 16/08 aveva un difetto peggiore di quello che curava, e ha tenuto il Ghost
      // fermo per quattro giorni: la condizione guardava `azioneStatus`, che e' stato di componente
      // (`useState({})`, si azzera a ogni riapertura dell'app), mentre `messages` e' PERSISTITO in
      // localStorage. Quindi qualunque vecchia proposta di Classe B mai confermata tornava
      // "pendente" a ogni ricarica, per sempre — e la stessa riga bloccava il turno di selezione
      // per TUTTE le azioni, non solo per la Classe B. Risultato: nessuna voce "proposta" nel
      // registro, nessuna card, e il Ghost che leggeva frasi invece di vedere pulsanti.
      // Tre cose cambiano, e ognuna chiude un pezzo del difetto:
      //  1. la risoluzione si scrive DENTRO il messaggio (azioneRisolta), che e' persistito come i
      //     messaggi stessi: una ricarica non resuscita piu' niente;
      //  2. una proposta ha una scadenza. Una proposta di ieri non e' "in attesa": e' morta;
      //  3. il controllo si sposta DOPO la selezione, dove finalmente si sa di che classe e'
      //     l'azione richiesta — cosi' una proposta di calendario in sospeso non puo' piu' impedire
      //     di aprire un percorso o di scrivere su un pilastro.
      const proposteClasseBPendenti = messages.filter((mm) =>
        mm.azioneProposta
        && AZIONI_CONVERSAZIONALI.find((a) => a.id === mm.azioneProposta.azioneId)?.classe === "B"
        && !mm.azioneRisolta && !azioneStatus[mm.id]
        && !propostaScaduta(mm.time)
        // 22/08/2026 — e, quarta condizione, deve esistere un pulsante che la esegua. Vedi
        // propostaEseguibile: una card senza pulsante non e' in attesa del Ghost, e' morta.
        && propostaEseguibile(mm.azioneProposta));
      const classeBPendente = proposteClasseBPendenti[0] || null;
      // La selezione e' gia' avvenuta, in cima al turno: qui si decide solo cosa farne. Le azioni
      // gia' eseguite (le letture) non producono nessuna proposta — sono fatte, non in attesa.
      const scelta = sceltaAnticipata;
      if (scelta && !eseguibileSubito(scelta.azioneId)) {
        const classeScelta = AZIONI_CONVERSAZIONALI.find((a) => a.id === scelta.azioneId)?.classe;
        if (classeScelta === "B" && classeBPendente) {
          // Solo QUESTO caso va fermato: una seconda proposta di Classe B mentre la prima aspetta
          // ancora un tocco. Tutto il resto passa.
          pushDebugLog?.({ type: "classe-b-gia-pendente", azioneId: classeBPendente.azioneProposta.azioneId, scartata: scelta.azioneId });
        } else {
          // Solo le azioni che puntano a un oggetto esistente passano dal recupero: scrivere una
          // voce o creare un Seme non si riferiscono a niente di gia' presente.
          const cercaOggetto = scelta.azioneId === "apri_percorso";
          const ric = cercaOggetto ? recuperoGrado0(scelta.parametro, { pBio, pAir, pVidya, semi }) : { esito: "diretto", candidati: [] };
          // Il quarto argomento e' l'orario che il MODELLO ha ricavato per conto suo: serve al
          // confronto fra i due percorsi indipendenti. Vedi orariConcordano.
          const preparata = preparaClasseB(scelta.azioneId, scelta.parametro, new Date(), scelta.orarioModello);
          // Per la cancellazione, il bersaglio e' quello che il programma ha gia' LETTO da Google in
          // cima al turno: non lo sceglie il modello e non lo ricostruisce nessuno.
          if (scelta.azioneId === "cancella_evento_calendario" && preparata.cancellazione) {
            preparata.cancellazione.esitoRicerca = bersaglioCancellazione?.esito || "non-cercato";
            preparata.cancellazione.bersaglio = bersaglioCancellazione?.bersaglio || null;
            preparata.cancellazione.candidati = bersaglioCancellazione?.candidati || [];
            preparata.cancellazione.motivo = bersaglioCancellazione?.motivo || "";
            preparata.chiaveBase = preparata.cancellazione.bersaglio ? chiaveIdempotenza("cancellazione", [preparata.cancellazione.bersaglio.id]) : null;
          }
          // Lo stesso, per lo spostamento: il bersaglio e' quello gia' letto da Google in cima al
          // turno (bersaglioSpostamento), il nuovo orario e' quello che normalizzaData ha calcolato
          // in preparaClasseB. La chiave include ANCHE il nuovo orario: spostare due volte lo stesso
          // evento verso due orari diversi sono due azioni distinte, non un doppione da bloccare.
          if (scelta.azioneId === "sposta_evento_calendario" && preparata.spostamento) {
            preparata.spostamento.esitoRicerca = bersaglioSpostamento?.esito || "non-cercato";
            preparata.spostamento.bersaglio = bersaglioSpostamento?.bersaglio || null;
            preparata.spostamento.candidati = bersaglioSpostamento?.candidati || [];
            preparata.spostamento.motivo = bersaglioSpostamento?.motivo || "";
            preparata.chiaveBase = (preparata.spostamento.bersaglio && preparata.spostamento.nuovo?.ok)
              ? chiaveIdempotenza("spostamento", [preparata.spostamento.bersaglio.id, preparata.spostamento.nuovo.inizioISO])
              : null;
          }
          azioneProposta = { azioneId: scelta.azioneId, parametro: scelta.parametro, esito: ric.esito, candidati: ric.candidati, stato: "proposta", ...preparata };
          registraAzione({ fase: "proposta", azioneId: scelta.azioneId, parametro: scelta.parametro, esitoRicerca: ric.esito, candidati: ric.candidati.map((c) => ({ id: c.id, etichetta: c.etichetta })) });
        }
      }
      // ── IL VINCOLO GEMELLO (17/08/2026 mattina) ──────────────────────────────────
      // Adesso, e solo adesso, il programma SA se una proposta esiste. Quindi e' qui che si
      // controlla se il modello ha promesso un pulsante che non comparira'.
      // Tre casi diversi, tre risposte diverse — perche' "non ho capito" e "e' spento" sono due
      // problemi diversi e dirgli la frase sbagliata lo manderebbe a cercare nel posto sbagliato.
      const domandeDiConferma = rilevaDomandaDiConferma(replyPulita);
      // 23/08/2026 — E QUI MANCAVA LA META' DELLA CONDIZIONE, CHE E' LA PIU' IMPORTANTE.
      // Fin qui bastava che la RISPOSTA contenesse una parola tipo "confermi" perche' l'avviso
      // scattasse. Ma "confermi" e' una parola italiana comune, e in una domanda di chiarimento non
      // promette nessun pulsante: promette una risposta a voce.
      // Osservato alle 08:31, conversazione BIO sul piano alimentare. Lo Shell aveva fatto esattamente
      // cio' che il Ghost gli aveva chiesto — quattro domande di chiarimento — e la quarta era
      // "4. Confermi pasta di legumi, pane di segale e Wasa come carboidrati base per l'IG?".
      // Il rilevatore ha visto "Confermi", e il Ghost si e' ritrovato un riquadro rosso che gli
      // parlava di pulsanti che non sarebbero comparsi e gli chiedeva di ripetere la richiesta
      // "con giorno e ora", in mezzo a una conversazione sul cibo. Misurato: su sette domande di
      // chiarimento innocue nei tre pilastri, scattava sette volte su sette.
      // E' la solita famiglia — un rilevatore che cerca una PAROLA invece di guardare un FATTO.
      //
      // Il fatto da guardare c'era gia', e non lo si guardava: IL GHOST AVEVA CHIESTO UN'AZIONE?
      // L'avviso dice "non comparira' nessun pulsante". Quella frase ha senso solo se un pulsante
      // era atteso, cioe' se il messaggio del Ghost chiedeva qualcosa che l'app SA FARE. Se ha
      // chiesto un piano alimentare, nessun pulsante era in arrivo e non c'e' niente da avvisare.
      // meritaTurnoDiSelezione e' esattamente quel fatto: e' la stessa porta che decide se far
      // partire la scelta dell'azione, ed e' gia' usata due righe piu' sotto per lo stesso scopo.
      // Il caso per cui questo avviso e' nato — il Ghost chiede un appuntamento, il modello dice
      // "vuoi confermare?", e nessuna card nasce — passa da quella porta e continua a scattare.
      const chiedevaUnAzione = meritaTurnoDiSelezione(userText);
      // 29/08/2026 — LO STESSO DIFETTO DEL 17/08, RIENTRATO DA UN'ALTRA PORTA.
      // Osservato dal vivo: il Ghost chiede un piano alimentare, il modello gli fa una domanda di
      // chiarimento ("Confermi il repertorio piatti della prima settimana?"), e compare un riquadro
      // rosso che gli dice che la capacita' che serve e' spenta — nominando "Inviare una mail".
      // Con un piano alimentare la mail non c'entra niente.
      // La causa: qui si guardava se esisteva ANCHE UNA SOLA azione spenta da qualche parte
      // (`AZIONI_CONVERSAZIONALI.some(...)`), non se fosse spenta quella che il Ghost aveva chiesto.
      // Siccome le sei azioni esterne nascono spente, la condizione era praticamente sempre vera:
      // bastava un verbo d'azione nella frase ("Crea un piano...") per far comparire un avviso che
      // accusava una capacita' a caso. Il rilevatore giusto c'era gia' e non veniva usato qui:
      // capacitaNominata dice QUALE capacita' nomina la frase, e restituisce null quando non ne
      // nomina nessuna o e' ambigua — cioe' esattamente il caso del piano alimentare.
      const capacitaChiesta = capacitaNominata(userText);
      const haChiestoUnaCosaSpenta = chiedevaUnAzione && capacitaChiesta !== null
        && !azioniAttive().some((b) => b.id === capacitaChiesta);
      let confermaSenzaBersaglio = null;
      if (chiedevaUnAzione && !azioneProposta && !classeBPendente && domandeDiConferma.length) {
        confermaSenzaBersaglio = {
          motivo: haChiestoUnaCosaSpenta ? "forse-spenta" : "nessuna-proposta",
          // Solo la capacita' DAVVERO chiesta e spenta: elencare tutte quelle spente faceva dire
          // all'avviso cose che non c'entravano con la domanda del Ghost.
          spente: haChiestoUnaCosaSpenta
            ? AZIONI_CONVERSAZIONALI.filter((a) => a.id === capacitaChiesta).map((a) => a.etichetta)
            : [],
          frasi: domandeDiConferma,
          // 23/08/2026 (voce 2.2 del brief) — il testo dell'avviso diceva sempre "con giorno e ora",
          // che e' la lingua del calendario. Anche quando l'avviso scatta a ragione, l'azione in
          // gioco puo' essere aprire un percorso o salvare un Seme, dove giorno e ora non
          // significano niente. Ora il riquadro lo chiede solo se la richiesta parlava di agenda.
          diCalendario: PARLA_DI_CALENDARIO_RE.test(userText),
        };
        pushDebugLog?.({ type: "conferma-senza-bersaglio", frasi: domandeDiConferma, userText: userText.slice(0, 100) });
      }
      // E il caso che rompe il giro: il Ghost ha risposto a parole a una domanda a vuoto. Non si
      // esegue niente (una parola non ha mai confermato niente e non lo fara' mai): si smette di
      // ripetere lo schema rotto e glielo si dice.
      if (!azioneProposta && !classeBPendente && !confermaSenzaBersaglio && sembraUnaConfermaAParole(userText)) {
        confermaSenzaBersaglio = {
          motivo: "conferma-a-vuoto",
          spente: AZIONI_CONVERSAZIONALI.filter((a) => !azioniAttive().some((b) => b.id === a.id)).map((a) => a.etichetta),
          frasi: [],
        };
        pushDebugLog?.({ type: "conferma-a-vuoto", userText: userText.slice(0, 100) });
      }
      // 22/08/2026 — IL CASO OPPOSTO, ED E' QUELLO CHE HA LASCIATO IL GHOST NEL SILENZIO.
      // La proposta esiste, ha il suo pulsante, e il Ghost ha risposto a parole ("Dimmelo",
      // "Fallo", "Va bene") invece di toccarlo — che e' come risponde davvero, l'ho visto nelle
      // schermate. Fin qui non succedeva NIENTE: nessuna azione (giusto, una parola non conferma
      // mai niente), ma nemmeno una riga che glielo dicesse. Restava a fissare una card che
      // sembrava ignorarlo. Adesso non si esegue lo stesso, ma glielo si dice, indicando la card.
      if (!azioneProposta && classeBPendente && !confermaSenzaBersaglio && sembraUnaConfermaAParole(userText)) {
        const inAttesa = AZIONI_CONVERSAZIONALI.find((a) => a.id === classeBPendente.azioneProposta.azioneId);
        confermaSenzaBersaglio = {
          motivo: "tocca-il-pulsante",
          etichettaInAttesa: inAttesa?.etichetta || "quella proposta",
          spente: [],
          frasi: [],
        };
        pushDebugLog?.({ type: "conferma-a-parole-con-proposta-viva", azioneId: classeBPendente.azioneProposta.azioneId, userText: userText.slice(0, 100) });
      }
      // 25/08/2026 — IL CASO TROVATO OGGI, E NESSUNA DELLE FRASI SOPRA LO COPRIVA.
      // Il Ghost aveva una card di calendario ancora in sospeso (mai toccata). Ha chiesto un
      // appuntamento NUOVO. Lo Shell — che non sa cosa il codice deciderà di fare, e non puo'
      // saperlo: quella decisione arriva DOPO che lui ha gia' scritto — ha risposto "Te lo metto
      // in calendario... conferma sulla card che compare". Ma la seconda proposta di Classe B non
      // nasce mai finche' la prima aspetta ancora un tocco (vedi classeBPendente sopra): nessuna
      // card, nessun avviso, il Ghost lasciato a fissare una promessa vuota.
      // I due casi sopra non lo intercettavano: quello delle 5751 richiede `!classeBPendente`
      // per costruzione, e quello delle 5787 richiede che IL GHOST stia rispondendo "si'" a
      // qualcosa — qui invece stava chiedendo una cosa NUOVA. Il fatto che li distingue tutti e
      // tre non e' una parola nella risposta del modello: e' se il Ghost ha chiesto un'azione,
      // se ne esiste gia' una in sospeso, e se lui sta parlando a parole o chiedendo altro.
      if (chiedevaUnAzione && !azioneProposta && classeBPendente && !confermaSenzaBersaglio && !sembraUnaConfermaAParole(userText)) {
        const inAttesa = AZIONI_CONVERSAZIONALI.find((a) => a.id === classeBPendente.azioneProposta.azioneId);
        confermaSenzaBersaglio = {
          motivo: "richiesta-nuova-con-proposta-viva",
          etichettaInAttesa: inAttesa?.etichetta || "quella proposta",
          spente: [],
          frasi: [],
        };
        pushDebugLog?.({ type: "richiesta-nuova-con-proposta-viva", azioneId: classeBPendente.azioneProposta.azioneId, richiesta: scelta?.azioneId || null, userText: userText.slice(0, 100) });
      }
      // 25/08/2026 — SECONDO CASO TROVATO OGGI. Il Ghost ha chiesto "quali sono gli appuntamenti
      // per i prossimi 7 giorni", due volte, con parole diverse. Lo Shell ha risposto "Leggo
      // subito cosa c'è sul calendario" — poi niente. Nessun elenco, nessuna spiegazione.
      // Il motivo, verificato leggendo il codice: leggi_calendario e' spenta in Setup, quindi
      // il turno di selezione non puo' proprio sceglierla (l'elenco che riceve e' quello delle
      // sole azioni ACCESE — verificato il 20/08 col brief, e' cosi' apposta: vedi GATE 2, non
      // va toccato). Il modello riceve SOLO l'avviso generico che elenca tutto cio' che e' spento
      // (formatCapacitaSpente) e dovrebbe dirlo onestamente — ma qui non l'ha fatto: ha scritto
      // una promessa e basta. Lo stesso difetto di "conferma sulla card che compare" di stanotte,
      // stavolta senza nemmeno la forma di una promessa di conferma: solo un'azione mai arrivata.
      // Non si nomina UNA capacita' precisa — potrebbe essere leggere, creare, cancellare o
      // spostare, il messaggio da solo non lo dice — si elencano quelle di calendario spente
      // adesso, che e' un fatto verificabile e non un'ipotesi.
      if (chiedevaUnAzione && PARLA_DI_CALENDARIO_RE.test(userText) && !azioneProposta && !classeBPendente && !confermaSenzaBersaglio && !letturaRiuscita) {
        const speneCalendario = AZIONI_CONVERSAZIONALI.filter((a) =>
          ["crea_evento_calendario", "leggi_calendario", "cancella_evento_calendario", "sposta_evento_calendario"].includes(a.id)
          && !azioniAttive().some((b) => b.id === a.id));
        if (speneCalendario.length) {
          confermaSenzaBersaglio = {
            motivo: "calendario-spento-senza-dirlo",
            spente: speneCalendario.map((a) => a.etichetta),
            frasi: [],
          };
          pushDebugLog?.({ type: "calendario-spento-senza-dirlo", userText: userText.slice(0, 100), spente: speneCalendario.map((a) => a.id) });
        }
      }
      setMessages((prev) => {
        const next = [...prev, { id: assistantMsgId, role: "assistant", content: replyPulita, time: new Date().toISOString(), actions: [], anochin, proposal, alerts: [], draft, usedWebSearch, seedSuggestion, azioneProposta, esitiFalsi, confermaSenzaBersaglio, capacitaSmentite, capacitaAccese, contenutiCalendarioInventati, letturaCalendario, offerteInesistenti, dubbiIdentita: [], rispostaTroncata, scartiDelPiano, vincoliProposti }];
        return compactShellChatIfNeeded(next) || next; // Opzione 3: compatta+archivia (Legge 14) se sopra soglia, altrimenti passa
      });
      // I tre puntini si fermano QUI, non alla fine dello sfondo: il Ghost puo' gia' scrivere.
      setSending(false);
      // L'auto-play parte dopo un await e può perdere lo status di "gesto utente" su Chrome mobile;
      // in quel caso il 🔊 manuale funziona sempre (chiamata sincrona dentro il tap).
      if (settings.voiceEnabled) toggleSpeak(assistantMsgId, replyPulita);
      };
      // Lo sfondo di questo turno si mette in fila dietro quello del turno precedente, e riceve due
      // finestre sul presente invece di una fotografia: vedi il commento sulla coda dentro
      // runShellTurn. Senza la fila, due turni ravvicinati si sovrascrivono la memoria a vicenda.
      const codaPrecedente = codaSfondo.current;
      let sbloccaLaCoda;
      codaSfondo.current = new Promise((r) => { sbloccaLaCoda = r; });
      try {
        const esito = await runShellTurn(history, userText, settings, {
          addBio, addAir, addVidya, aggiungiDaLettura, updateMemoria,
          attendiCoda: () => codaPrecedente,
          memoriaOra: () => memoriaRef.current,
          stileOra: () => stileRef.current,
        }, memory, styleMemory, currentAttachment, dialecticOverride, pushDebugLog, inventarioOra, fuocoConDossier(), letturaCalendario, bersaglioCancellazione, mostra, bersaglioSpostamento, ricercaEvento, formatSerieBlock(fattiDaLogBio(bio)), documentoAperto);
        // Rete di sicurezza: se per qualunque ragione la richiamata non fosse partita, il messaggio
        // compare comunque adesso. `mostrato` impedisce che compaia due volte.
        mostra(esito);
        // Lo sfondo ha finito. Si aggiorna SOLO il messaggio di QUESTO turno, per identificativo:
        // un secondo turno partito nel frattempo ha il suo, e non viene toccato.
        setMessages((prev) => prev.map((mm) => (mm.id === assistantMsgId
          ? { ...mm, actions: esito.actionsLog, anochin: esito.anochin, alerts: esito.alerts, dubbiIdentita: esito.dubbiIdentita }
          : mm)));
        // stileRef.current, non styleMemory: la fotografia di inizio turno qui sarebbe vecchia.
        if (esito.newStyleMemory && esito.newStyleMemory !== stileRef.current) setStyleMemory(esito.newStyleMemory);
        // `tetto` e `troncata` viaggiano insieme da qui in avanti (28/08/2026): senza sapere con
        // quale tetto e' stato generato un turno, "tokensOut 3000" da solo non distingue "il
        // modello aveva finito" da "il modello e' stato interrotto" — ed e' la distinzione che
        // serve per decidere se il tetto va ancora alzato o se il problema e' altrove.
        pushDebugLog?.({ type: "shell-turn", userText: userText.slice(0, 100), model: settings.model, provider: settings.provider, attachment: currentAttachment ? currentAttachment.kind : null, replyLength: esito.reply.length, tetto: tettoTokenPerIlTurno(userText), troncata: !!esito.rispostaTroncata, actionsLog: esito.actionsLog, alertsCount: esito.alerts?.length || 0, hasDraft: !!esito.draft, anochinDecisione: esito.anochin?.decisione, anochinAccettore: esito.anochin?.accettore, error: null });
      } catch (e) {
        // Se la risposta era gia' comparsa, resta valida: e' fallito solo cio' che veniva dopo, e
        // quel fallimento va nel log invece che addosso al Ghost.
        if (mostrato) pushDebugLog?.({ type: "sfondo-turno-fallito", userText: userText.slice(0, 100), error: e.message });
        else setError(e.message);
        // La ripresa al ritorno vale SOLO per i guasti di rete, e solo se il Ghost non ha ancora
        // visto niente: se la risposta era gia' comparsa non c'e' niente da riprendere, e se
        // l'errore e' vero (chiave, rifiuto del modello) ripartirebbe all'infinito pagando ogni giro.
        if (mostrato || !eGuastoDiRete(e.message)) chiudiRichiestaInSospeso();
        pushDebugLog?.({ type: "shell-turn", userText: userText.slice(0, 100), model: settings.model, provider: settings.provider, attachment: currentAttachment ? currentAttachment.kind : null, error: e.message });
      } finally { sbloccaLaCoda(); setSending(false); }
    } catch (e) {
      // Qui arriva solo cio' che e' fallito PRIMA del turno: la selezione anticipata, la lettura
      // del calendario, la ricerca del bersaglio. Il turno vero ha il suo catch, qui sopra.
      setError(e.message);
      if (!eGuastoDiRete(e.message)) chiudiRichiestaInSospeso();
      pushDebugLog?.({ type: "shell-turn", userText: userText.slice(0, 100), model: settings.model, provider: settings.provider, attachment: currentAttachment ? currentAttachment.kind : null, error: e.message });
    } finally {
      setSending(false);
      if (wakeLock) { try { await wakeLock.release(); } catch (e) { /* gia' rilasciato o non piu' valido: non e' un errore da mostrare */ } }
    }
  };
  // ── LA RIPRESA AL RITORNO (29/08/2026) — vedi salvaRichiestaInSospeso ──
  // Quando il Ghost torna sull'app, se c'e' una richiesta morta per la rete negli ultimi quindici
  // minuti, riparte da sola. Non e' il relay lato server (quello e' il passo successivo, e da' la
  // cosa vera: "la trovi gia' pronta"): e' il pezzo che si puo' avere senza infrastruttura.
  // I riferimenti passano da una ref perche' l'ascoltatore vive una volta sola, mentre `send` viene
  // ricreata a ogni render: senza la ref, l'ascoltatore chiamerebbe per sempre la prima versione.
  const sendRef = useRef(null);
  const sendingRef = useRef(false);
  sendRef.current = send;
  sendingRef.current = sending;
  useEffect(() => {
    const alRitorno = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (sendingRef.current) return;                      // ne sta gia' arrivando una: non si accavallano
      const inSospeso = leggiRichiestaInSospeso();
      if (!inSospeso) return;
      // D4/C.16 — questa parte da sola, quindi si ferma al tetto di spesa come ogni cosa automatica.
      if (!operazioniAutomaticheConsentite()) {
        chiudiRichiestaInSospeso();
        pushDebugLog?.({ type: "tetto-raggiunto", operazione: "ripresa-richiesta-interrotta", spesaMese: Number(spesaDelMeseCorrente().toFixed(4)), tetto: TETTO_MENSILE_USD });
        return;
      }
      chiudiRichiestaInSospeso();                          // tolta PRIMA di ripartire: mai due giri per lo stesso testo
      pushDebugLog?.({ type: "richiesta-ripresa-al-ritorno", userText: inSospeso.testo.slice(0, 100), attesaSecondi: Math.round((Date.now() - inSospeso.quando) / 1000), error: null });
      sendRef.current?.(inSospeso.testo);
    };
    document.addEventListener("visibilitychange", alRitorno);
    alRitorno();                                           // anche all'apertura, non solo al cambio di scheda
    return () => document.removeEventListener("visibilitychange", alRitorno);
  }, []);
  // ── Flusso "genera documento da conversazione" (alternativa A) ──
  const CONV_WINDOW = 30; // ultimi N messaggi usati come base per il documento
  const conversationText = () => messages.slice(-CONV_WINDOW)
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => `${m.role === "user" ? "GHOST" : "SHELL"}: ${m.content}`).join("\n\n");
  const openDocPanel = () => {
    setDocPanel(true); setDocPhase("idle"); setDocText(""); setDocSummary(""); setDocTitle("");
    setDocTargetPillar("bio"); setDocTargetId(""); setDocNewTitle(""); setDocMsg("");
  };
  const generateFromConversation = async () => {
    if (docPhase === "generating") return;
    setDocPhase("generating"); setDocMsg("");
    try {
      const convo = conversationText();
      // 29/08/2026 — le tabelle sono entrate in questo elenco, e non e' un dettaglio di stile: fin
      // qui il markup consentito erano solo titoli, elenchi e paragrafi, quindi un piano di
      // quattordici giorni per cinque pasti — che e' una griglia — veniva appiattito in una sequenza
      // di elenchi. Adesso generateDocxBlob sa stampare una tabella vera nel .docx, ma puo' farlo
      // solo se il documento ne contiene una.
      const sysDoc = `Sei lo Shell del sistema Resonance. Dalla conversazione qui sotto tra GHOST e SHELL, estrai e formalizza il documento concordato (es. un piano). Riporta la versione FINALE emersa dalla negoziazione, non le versioni intermedie scartate. Rispetta ogni vincolo o esclusione dichiarato dal Ghost. Usa markup leggero: "# " titolo, "## " sezioni, "- " elenchi, righe normali per paragrafi. Quando il contenuto e' una griglia — giorni per pasti, settimane per esercizi, qualunque cosa abbia righe e colonne — usa una TABELLA markdown (prima riga di intestazione, poi la riga "|---|---|", poi le righe di dati): diventa una tabella vera nel documento finale, con le sue colonne. Non spezzare mai una griglia in elenchi. Solo il documento, nessuna premessa.`;
      const sysSum = `Sei lo Shell del sistema Resonance. Dalla conversazione qui sotto, estrai in forma sintetica SOLO i vincoli, le esclusioni e le preferenze stabili che il Ghost ha dichiarato (es. "no zucchine", "calorie discontinue", "pranzi portatili lun/mer/ven"). Sono la memoria procedurale che guiderà le prossime versioni. Elenco secco, una riga per vincolo, niente altro.`;
      // 30/08/2026 — IL DOCUMENTO VUOTO. Il Ghost ha scaricato un .docx che conteneva solo il
      // titolo "Documento": il modello aveva restituito una risposta vuota, il pannello e' passato
      // lo stesso all'anteprima (di niente), e il pulsante ha prodotto un file di niente.
      // Due reti, nessuna delle quali c'era: la prima e' askWithDegenerateGuard, che esiste
      // apposta per la risposta vuota e ritenta una volta — questa chiamata non ci passava; la
      // seconda e' il controllo qui sotto, che si rifiuta di mostrare un'anteprima inesistente.
      const [doc, sum] = await Promise.all([
        // Il tetto qui era 4000, cioe' lo stesso ordine di grandezza che il 28/08 ha tagliato a
        // meta' il piano in chat. Un DOCUMENTO e' per definizione il caso "contenuto lungo": usa lo
        // stesso tetto alto, altrimenti la formalizzazione si interrompe proprio come la chat.
        askWithDegenerateGuard(() => askModel(sysDoc, convo, 0.5, TETTO_TOKEN_CONTENUTO_LUNGO, settings), "documento", pushDebugLog),
        askModel(sysSum, convo, 0.4, 800, settings),
      ]);
      if (!String(doc || "").trim()) {
        setDocMsg("Il modello non ha scritto niente, nemmeno al secondo tentativo. Non ti faccio scaricare un documento vuoto: riprova fra poco, oppure premi Rigenera.");
        pushDebugLog?.({ type: "documento-generato", fase: "formalizzazione", error: "risposta vuota anche dopo il ritentativo" });
        setDocPhase("idle");
        return;
      }
      setDocText(doc); setDocSummary(sum);
      const firstH = (doc.match(/^#\s+(.+)$/m) || [])[1];
      setDocTitle(firstH || "Documento");
      setDocPhase("preview");
    } catch (e) { setDocMsg("Errore generazione: " + e.message); setDocPhase("idle"); }
  };
  // 30/08/2026 — "I TASTI NON FUNZIONANO". E in effetti non facevano niente, ma non erano rotti:
  // la prima riga rifiutava tutto finche' il Ghost non sceglieva un percorso di destinazione, e
  // l'unico segno era una riga grigia sotto i pulsanti ("Scegli un percorso o dai un nome al
  // nuovo") facile da non vedere. Da fuori: premi, non succede niente, il documento non esiste.
  // Ma il difetto vero e' a monte del messaggio: SCARICARE UN FILE NON DEVE RICHIEDERE DI
  // ARCHIVIARLO. Erano due cose diverse tenute insieme da un solo gesto — produrre il .docx, e
  // agganciarlo a un percorso perche' l'app se lo ricordi. La seconda e' utile ma facoltativa: se
  // il Ghost vuole solo il file in mano, deve poterlo avere.
  // Ora l'aggancio avviene SOLO se un percorso e' stato scelto, e in entrambi i casi il messaggio
  // finale dice esattamente cosa e' successo — file consegnato e archiviato, oppure file consegnato
  // e basta, dichiarando che non e' stato agganciato a niente.
  const confirmDoc = async (toDrive) => {
    if (docPhase === "saving") return;
    // Ultima rete prima di consegnare: un .docx col solo titolo dentro non e' un documento. E'
    // successo il 30/08 — vedi generateFromConversation — e va fermato anche qui, perche' il testo
    // puo' essere stato svuotato a mano nell'anteprima.
    if (!String(docText || "").trim()) { setDocMsg("Non c'è niente da mettere nel documento: il testo è vuoto. Premi Rigenera."); return; }
    setDocPhase("saving"); setDocMsg("");
    try {
      const list = percorsi[docTargetPillar] || [];
      const setList = setPercorsi[docTargetPillar];
      const percorsoScelto = list.find((p) => p.id === docTargetId) || null;
      // Percorso nuovo al volo (competenza puntuale, senza scomposizione AI: è un contenitore per
      // l'artefatto). Nasce solo se il Ghost gli ha dato un nome: senza nome non se ne crea uno vuoto.
      const percorsoNuovo = (!percorsoScelto && docNewTitle.trim())
        ? { id: uid(), pillar: docTargetPillar, title: docNewTitle.trim(), kind: "puntuale", identityGoal: null,
            createdAt: new Date().toISOString(), topics: [{ id: uid(), label: "Verifica efficacia", status: "non iniziato", lastTouched: null }],
            sessions: [], competenze: "", touchesPillars: [], localMemory: "", documents: [] }
        : null;
      const target = percorsoScelto || percorsoNuovo;
      const titolo = docTitle || target?.title || "documento";
      const fname = `${titolo.replace(/[^\w\sàèéìòù-]/gi, "").trim().slice(0, 60) || "documento"}.docx`;
      // IL FILE SI PRODUCE SEMPRE: e' la cosa che il Ghost ha chiesto premendo il pulsante.
      let driveId = null;
      const blob = await generateDocxBlob(titolo, docText);
      if (toDrive) { const r = await createDriveFile(fname, blob, DOCX_MIME); driveId = r?.id || null; }
      else { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      // L'aggancio al percorso: solo se c'e' un percorso, e senza far fallire la consegna del file
      // se qualcosa qui non torna — il file e' gia' in mano al Ghost a questo punto.
      if (target && setList) {
        const doc = { id: uid(), name: fname, title: titolo, text: docText, date: new Date().toISOString(), driveId };
        const stamp = new Date().toISOString().slice(0, 10);
        const newMem = (target.localMemory ? target.localMemory + "\n\n" : "") + `[${stamp}] Vincoli da conversazione:\n${docSummary}`;
        const updated = { ...target, documents: [doc, ...(target.documents || [])], localMemory: newMem };
        setList(list.some((p) => p.id === target.id) ? list.map((p) => (p.id === target.id ? updated : p)) : [updated, ...list]);
        setDocMsg(toDrive ? "Salvato su Drive e agganciato al percorso." : "Scaricato e agganciato al percorso.");
      } else {
        setDocMsg(toDrive
          ? "Salvato su Drive. Non l'ho agganciato a nessun percorso: non ne avevi scelto uno — se lo vuoi anche dentro l'app, scegli un percorso qui sopra e premi di nuovo."
          : "Scaricato. Non l'ho agganciato a nessun percorso: non ne avevi scelto uno — se lo vuoi anche dentro l'app, scegli un percorso qui sopra e premi di nuovo.");
      }
      pushDebugLog?.({ type: "documento-generato", suDrive: !!toDrive, agganciato: !!target, nomeFile: fname, error: null });
      setDocPhase("done");
    } catch (e) {
      // Un fallimento qui va DETTO, non lasciato sembrare "il pulsante non funziona": la libreria
      // .docx si carica da un CDN, e se quella chiamata non riesce il Ghost deve sapere perche'.
      setDocMsg("Errore: " + e.message);
      pushDebugLog?.({ type: "documento-generato", suDrive: !!toDrive, error: e.message });
      setDocPhase("preview");
    }
  };
  const [copiedId, setCopiedId] = useState(null);
  const copyDraft = (mid, draft) => {
    const text = draft.subject ? `Oggetto: ${draft.subject}\n\n${draft.body}` : draft.body;
    navigator.clipboard?.writeText(text).then(() => { setCopiedId(mid); setTimeout(() => setCopiedId((c) => (c === mid ? null : c)), 2000); });
  };
  // Calendar: mai scrittura automatica (Legge 8) — il Ghost conferma o scarta ogni proposta.
  // I gestori del vecchio braccio Calendar (calStatus/confirmCalendarEvent/dismissCalendarEvent)
  // sono stati rimossi il 16/08/2026 insieme alla loro card: il calendario passa dalla Classe B.
  // Seme: un solo tap crea, nessuna azione se ignorato/rifiutato (nessuna traccia persistente, brief 1.A).
  const [seedStatus, setSeedStatus] = useState({}); // mid -> "added" | "dismissed"
  const confirmSeed = (mid, content) => {
    addSeed?.(content, "conversational");
    setSeedStatus((s) => ({ ...s, [mid]: "added" }));
    setMessages((prev) => [...prev, { id: uid(), role: "system-note", content: `✓ Seme AIR salvato.` }]);
  };
  const dismissSeed = (mid) => setSeedStatus((s) => ({ ...s, [mid]: "dismissed" }));
  // Il seguito di una risposta tagliata. Passa dalla stessa strada di ogni altro messaggio — nessun
  // percorso parallelo, nessuna eccezione: il modello ha la risposta tronca nella storia e riprende
  // da li'. Se il seguito viene tagliato a sua volta, ricompare la stessa card e si puo' rifare.
  const chiediIlSeguito = () => send("Continua esattamente da dove ti sei fermato, senza ricominciare da capo e senza ripetere quello che hai già scritto.");
  // 23/08/2026 — TENERE UN VINCOLO ALIMENTARE, CON UN GESTO SOLO.
  // Un vincolo detto parlando vive quanto la conversazione, cioe' dieci scambi. Tenuto, entra
  // nell'elenco dei vincoli dichiarati e da li' nel prompt di sistema di ogni turno, per sempre —
  // e diventa anche il metro con cui il codice controlla i piani generati.
  // La risoluzione si scrive DENTRO il messaggio, come per ogni altra card: uno stato di sessione
  // farebbe ricomparire domani una domanda a cui il Ghost ha risposto oggi.
  const [vincoloStatus, setVincoloStatus] = useState({});
  const tieniVincolo = (mid, testo) => {
    const attuali = Array.isArray(ghostProfile?.hardConstraints) ? ghostProfile.hardConstraints : [];
    // 26/08/2026 (quick win #4 dell'audit "Motoko") — ambito, non solo pilastro. "niente zucchine"
    // e "una composizione artistica con delle zucchine" possono condividere il pilastro (BIO/VIDYA
    // non c'entrano qui, ma il principio si generalizza) senza condividere il senso: taggare questo
    // vincolo come "alimentare" e' cio' che permette a chi legge di sapere CHE TIPO di vincolo e',
    // non solo a quale pilastro appartiene — cosi' un domani un generatore non-alimentare puo'
    // ignorarlo a prescindere dal pilastro, senza dover indovinare dal testo.
    saveGhostProfile?.({ ...ghostProfile, hardConstraints: [...attuali, { id: uid(), testo, pilastro: "bio", ambito: "alimentare", dataDichiarazione: todayISO() }] });
    vibra("bio");
    setVincoloStatus((s) => ({ ...s, [`${mid}|${testo}`]: "tenuto" }));
    setMessages((prev) => [...prev, { id: uid(), role: "system-note", time: new Date().toISOString(),
      content: `✓ «${testo}» è ora un vincolo dichiarato di BIO. Da adesso lo Shell lo riceve a ogni turno, anche fra un mese, e io controllo che i piani lo rispettino. Lo trovi e lo modifichi in Setup → Vincoli dichiarati.` }]);
    registraAzione({ fase: "eseguita", azioneId: "scrivi_su_pilastro", pilastro: "bio", etichetta: testo, nota: "vincolo alimentare dichiarato dalla chat" });
  };
  const lasciaVincolo = (mid, testo) => setVincoloStatus((s) => ({ ...s, [`${mid}|${testo}`]: "lasciato" }));
  // §1.3 — il percorso proposto si crea SOLO da qui, toccando il pulsante di questa card. Nessuna
  // parola detta in chat lo crea piu'. Se il titolo che lo Shell ha dedotto e' inservibile, il
  // campo parte vuoto e il Ghost lo scrive: meglio chiedere una volta che ritrovarsi in Vidya un
  // percorso chiamato "Questo?" che nessuna richiesta potra' mai riagganciare.
  const [percorsoStatus, setPercorsoStatus] = useState({}); // mid -> "creato" | "scartato"
  const [percorsoTitolo, setPercorsoTitolo] = useState({}); // mid -> titolo digitato dal Ghost
  // 31/08/2026 — UN SOLO POSTO DOVE NASCE UN PERCORSO DALLA CHAT.
  // Prima ce n'era uno (qui dentro) e l'azione nuova ne avrebbe fatto un secondo: due funzioni che
  // costruiscono lo stesso oggetto in modo leggermente diverso sono il modo garantito di ritrovarsi
  // fra un mese con percorsi a cui manca un campo a seconda di come sono nati. Ed era gia' cosi':
  // questa costruiva un percorso senza touchesPillars, localMemory e documents — proprio il campo
  // in cui adesso finisce il contenuto salvato. Un percorso nato dalla chat non poteva ricevere
  // niente, e nessuno se ne sarebbe accorto finche' non avesse provato a salvarci dentro qualcosa.
  const creaPercorsoDavvero = async (pillar, titolo) => {
    const labels = await decomposeTopics(pillar, titolo, settings);
    const p = { id: uid(), pillar, title: titolo, kind: "puntuale", identityGoal: null, createdAt: new Date().toISOString(),
      topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })),
      sessions: [], competenze: "", touchesPillars: [], localMemory: "", documents: [] };
    setPercorsi[pillar]([p, ...percorsi[pillar]]);
    // Il fuoco si sposta sul percorso appena nato: e' cio' che il Ghost si aspetta quando dice
    // "genera un percorso" e subito dopo "salvalo nel percorso attivo". Senza questo, la frase
    // successiva non troverebbe niente di aperto.
    cambiaFuoco(apriFuoco("percorso", p.id, p.title));
    return p;
  };
  const confermaPercorso = async (mid, proposta) => {
    const titolo = (percorsoTitolo[mid] ?? (proposta.titoloUsabile ? proposta.title : "")).trim();
    if (!titolo) { setPercorsoStatus((s) => ({ ...s, [mid]: "serve-titolo" })); return; }
    vibra(proposta.pillar);
    setPercorsoStatus((s) => ({ ...s, [mid]: "creando" }));
    try {
      await creaPercorsoDavvero(proposta.pillar, titolo);
      setPercorsoStatus((s) => ({ ...s, [mid]: "creato" }));
      setMessages((prev) => [...prev, { id: uid(), role: "system-note", content: `✓ Percorso "${titolo}" creato in ${proposta.pillar.toUpperCase()}.` }]);
      registraAzione({ fase: "eseguita", azioneId: "crea_percorso", etichetta: titolo, pilastro: proposta.pillar });
    } catch (e) { setPercorsoStatus((s) => ({ ...s, [mid]: "errore: " + e.message })); }
  };
  const scartaPercorso = (mid) => setPercorsoStatus((s) => ({ ...s, [mid]: "scartato" }));
  // 22/08/2026 — IL VINCOLO AIR CHIEDE, NON DECIDE.
  // Quando uno dei due rilevatori (il codice deterministico, il modello come seconda opinione) vede
  // qualcosa che lega l'identita' professionale del Ghost al pilastro AIR, la lettura NON viene
  // scritta e NON viene buttata: resta qui, e il Ghost decide con un gesto solo.
  // La risoluzione si scrive DENTRO il messaggio, non in uno stato di sessione: e' la stessa lezione
  // di `azioneRisolta` (20/08) — uno stato che vive solo in memoria fa ricomparire domani una
  // domanda a cui il Ghost ha gia' risposto oggi.
  const risolviDubbio = (mid, dubbio, scelta) => {
    if (scelta === "procedi") {
      const payload = payloadDaLettura(dubbio.reading);
      if (dubbio.reading.pillar === "bio") addBio(payload);
      else if (dubbio.reading.pillar === "air") addAir(payload);
      else if (dubbio.reading.pillar === "vidya") addVidya(payload);
      vibra(dubbio.reading.pillar);
      registraAzione({ fase: "eseguita", azioneId: "scrivi_su_pilastro", pilastro: dubbio.reading.pillar, etichetta: dubbio.reading.title || dubbio.reading.notes || "", nota: "sbloccata dal Ghost dopo una segnalazione del vincolo AIR" });
    } else {
      registraAzione({ fase: "annullata", azioneId: "scrivi_su_pilastro", pilastro: dubbio.reading.pillar, nota: "il Ghost ha lasciato fuori una lettura segnalata dal vincolo AIR" });
    }
    setMessages((prev) => prev.map((mm) => (mm.id === mid ? { ...mm, dubbiRisolti: { ...(mm.dubbiRisolti || {}), [dubbio.id]: scelta } } : mm)));
  };
  // BLOCCO 1 §2.3 — l'esecuzione e' del PROGRAMMA, mai del modello. Il modello ha solo proposto;
  // qui si valida (l'identificativo deve esistere davvero, §2.4), si esegue, si registra.
  // Classe A: nessun gate, ma annullamento sempre disponibile nel turno stesso (§5.1).
  const [azioneStatus, setAzioneStatus] = useState({});
  // 20/08/2026 — la risoluzione di una proposta va scritta DENTRO il messaggio, che e' persistito,
  // non solo in azioneStatus, che si azzera a ogni riapertura dell'app. Senza questo, una proposta
  // confermata ieri torna "in attesa" domani e blocca quelle nuove: e' il difetto che ha tenuto il
  // Ghost fermo quattro giorni.
  const segnaPropostaRisolta = (mid) => setMessages((prev) => prev.map((mm) => (mm.id === mid ? { ...mm, azioneRisolta: true } : mm)));
  const aggiornaAzione = (mid, stato) => { segnaPropostaRisolta(mid); setAzioneStatus((s) => ({ ...s, [mid]: stato })); };
  // BLOCCO 2 — esecutori delle azioni di Classe A. Uno per azione, tutti nel PROGRAMMA: il modello
  // ha solo proposto. Tutti reversibili, tutti con annullamento nel turno stesso.
  //
  // Il brief chiede esplicitamente che il ritorno immediato del gesto — vibrazione, comparsa nella
  // lista, aggiornamento della postura — si attivi anche quando l'azione arriva dalla CHAT e non
  // solo dal pulsante del pilastro. Qui il percorso e' unificato: si chiama la stessa funzione di
  // aggiunta (addBio/addAir/addVidya) usata dal modulo del pilastro, quindi la postura si ricalcola
  // e la voce compare esattamente come se il Ghost avesse premuto il pulsante. La vibrazione parte
  // sincrona dentro il gestore del tocco, con la firma del pilastro giusto.
  const PILASTRI_VALIDI = { bio: addBio, air: addAir, vidya: addVidya };
  const eseguiScriviSuPilastro = (mid, parametro) => {
    // Validazione dal codice, mai dal modello (§4.3): il pilastro deve essere uno dei tre veri.
    const [grezzo, ...resto] = String(parametro || "").split("|");
    const pil = String(grezzo || "").trim().toLowerCase();
    const testo = resto.join("|").trim();
    if (!PILASTRI_VALIDI[pil] || !testo) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: !PILASTRI_VALIDI[pil] ? `"${pil}" non è uno dei tre pilastri` : "il testo della voce è vuoto" });
      registraAzione({ fase: "rifiutata", azioneId: "scrivi_su_pilastro", motivo: "parametro non valido", parametro });
      return;
    }
    vibra(pil); // firma aptica del pilastro: la stessa del pulsante, cosi' al buio si riconosce uguale
    const voce = pil === "bio" ? { id: uid(), date: todayISO(), weight: "", sleep: "", notes: testo }
      : pil === "air" ? { id: uid(), date: todayISO(), title: testo.slice(0, 60), status: "idea", notes: testo }
      : { id: uid(), date: todayISO(), title: testo.slice(0, 60), notes: testo };
    PILASTRI_VALIDI[pil](voce);
    aggiornaAzione(mid, { tipo: "scritto", pilastro: pil, testo, voceId: voce.id });
    registraAzione({ fase: "eseguita", azioneId: "scrivi_su_pilastro", pilastro: pil, voceId: voce.id, testo: testo.slice(0, 120) });
  };
  const eseguiCreaSeme = (mid, parametro) => {
    const testo = String(parametro || "").trim();
    if (!testo) { aggiornaAzione(mid, { tipo: "rifiutato", motivo: "l'idea è vuota" }); return; }
    vibra("air"); // i Semi sono solo di AIR
    addSeed(testo, "conversazione");
    aggiornaAzione(mid, { tipo: "seme", testo });
    registraAzione({ fase: "eseguita", azioneId: "crea_seme", testo: testo.slice(0, 120) });
  };
  // Interrogare la memoria e' l'unica delle quattro che LEGGE invece di scrivere: non modifica
  // niente, quindi non ha bisogno di annullamento. Cerca davvero, a costo zero, e mostra dove ha
  // guardato (§3.4: dove il sistema sceglie cosa recuperare, la scelta si mostra, mai si nasconde).
  const eseguiInterrogaMemoria = (mid, parametro) => {
    vibra("conferma");
    const esito = cercaNellaMemoria(parametro, memory);
    aggiornaAzione(mid, { tipo: "memoria", argomento: parametro, ...esito });
    registraAzione({ fase: "eseguita", azioneId: "interroga_memoria", argomento: parametro, trovati: esito.frammenti.length });
  };
  const eseguiAvanzaPercorso = (mid) => {
    const f = leggiFuoco();
    if (f.tipo === "nessuno") {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "non c'è nessun percorso aperto: dimmi quale prima" });
      registraAzione({ fase: "rifiutata", azioneId: "avanza_percorso", motivo: "nessun fuoco aperto" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "avanza", etichetta: f.etichetta, id: f.id });
    registraAzione({ fase: "eseguita", azioneId: "avanza_percorso", id: f.id, etichetta: f.etichetta });
  };
  // 25/08/2026 — il gemello di eseguiAvanzaPercorso: valida il fuoco AL MOMENTO DEL TOCCO, non a
  // quando la card e' nata (il Ghost puo' chiudere o cambiare fuoco fra i due momenti). Non
  // cancella e non archivia niente: chiude solo il fuoco, che si riapre dicendo "riprendi X".
  const eseguiChiudiPercorso = (mid) => {
    const f = leggiFuoco();
    if (f.tipo === "nessuno") {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "non c'è nessun percorso aperto da chiudere" });
      registraAzione({ fase: "rifiutata", azioneId: "chiudi_percorso", motivo: "nessun fuoco aperto" });
      return;
    }
    vibra("conferma");
    const etichetta = f.etichetta;
    cambiaFuoco(chiudiFuoco());
    aggiornaAzione(mid, { tipo: "chiuso", etichetta });
    registraAzione({ fase: "eseguita", azioneId: "chiudi_percorso", etichetta });
  };
  // ── 31/08/2026 — i due esecutori nuovi sui percorsi (vedi il commento nel registro azioni) ──
  const eseguiCreaPercorso = async (mid, parametro) => {
    const titoli = [...(percorsi.bio || []), ...(percorsi.air || []), ...(percorsi.vidya || [])].map((p) => p.title);
    const a = analizzaParametroPercorso(parametro, titoli);
    if (!a.ok) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: a.motivo });
      registraAzione({ fase: "rifiutata", azioneId: "crea_percorso", motivo: a.motivo, parametro });
      return;
    }
    vibra(a.pilastro);
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto scomponendo il percorso in nodi" });
    try {
      const p = await creaPercorsoDavvero(a.pilastro, a.titolo);
      aggiornaAzione(mid, { tipo: "percorso-creato", titolo: p.title, pilastro: a.pilastro, nodi: p.topics.length });
      registraAzione({ fase: "eseguita", azioneId: "crea_percorso", etichetta: p.title, pilastro: a.pilastro, nodi: p.topics.length });
    } catch (e) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "non sono riuscito a scomporlo in nodi: " + e.message });
      registraAzione({ fase: "fallita", azioneId: "crea_percorso", motivo: e.message });
    }
  };
  // Il fuoco si legge AL MOMENTO DEL TOCCO, non a quando la card e' nata: fra i due istanti il
  // Ghost puo' aver chiuso o cambiato percorso (stessa regola gia' applicata ad avanza/chiudi).
  const eseguiSalvaNelPercorso = (mid, parametro) => {
    const f = leggiFuoco();
    if (f.tipo !== "percorso") {
      const motivo = f.tipo === "nessuno"
        ? "non c'è nessun percorso aperto: dimmi quale riprendere, o creiamone uno"
        : "quello aperto è un Seme, non un percorso — i documenti stanno nei percorsi";
      aggiornaAzione(mid, { tipo: "rifiutato", motivo });
      registraAzione({ fase: "rifiutata", azioneId: "salva_nel_percorso", motivo });
      return;
    }
    const pil = PILASTRI_NOMI.find((k) => (percorsi[k] || []).some((p) => p.id === f.id));
    const target = pil ? percorsi[pil].find((p) => p.id === f.id) : null;
    if (!target) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "il percorso aperto non esiste più: forse è stato cancellato" });
      registraAzione({ fase: "rifiutata", azioneId: "salva_nel_percorso", motivo: "percorso del fuoco inesistente", id: f.id });
      return;
    }
    const materiale = testoDaSalvare(messages, mid, String(parametro || ""));
    if (!materiale) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: `qui sopra non trovo un contenuto lungo almeno ${LUNGHEZZA_MINIMA_SALVABILE} caratteri da salvare` });
      registraAzione({ fase: "rifiutata", azioneId: "salva_nel_percorso", motivo: "nessun materiale abbastanza lungo" });
      return;
    }
    vibra(pil);
    const titolo = String(parametro || "").trim() || `Dalla conversazione del ${fmtDate(new Date())}`;
    // Stessa forma dei documenti creati dentro il percorso (vedi downloadArtifact): il testo INTERO
    // viaggia nel campo `text`, non un riassunto — e' tutto il punto di questa azione.
    const nodoId = nodoPerDocumento(target.topics, titolo);
    const doc = { id: uid(), name: `${titolo}.md`, title: titolo, text: materiale.testo, date: new Date().toISOString(), driveId: null, origine: "chat", messaggioId: materiale.id, nodoId };
    setPercorsi[pil](percorsi[pil].map((p) => (p.id === target.id ? { ...p, documents: [doc, ...(p.documents || [])] } : p)));
    const etichettaNodo = nodoId ? (target.topics.find((t) => t.id === nodoId)?.label || "") : "";
    aggiornaAzione(mid, { tipo: "salvato-nel-percorso", percorso: target.title, titolo, caratteri: materiale.testo.length, nodo: etichettaNodo, perRiferimento: materiale.perRiferimento });
    registraAzione({ fase: "eseguita", azioneId: "salva_nel_percorso", etichetta: titolo, percorso: target.title, caratteri: materiale.testo.length });
  };
  // ── BLOCCO 3 — esecutori di Classe B ──────────────────────────────────────────────
  // Differenza dalla Classe A: qui si tocca il mondo fuori. Quindi (a) si conferma sempre prima,
  // (b) dopo si RILEGGE dalla fonte, (c) la chiave di idempotenza impedisce il doppio invio.
  // L'indirizzo della mail e' un campo che il Ghost vede e puo' correggere: il modello non ne
  // inventa mai uno, e se non l'ha detto lui il campo resta vuoto finche' non lo scrive.
  const [indirizzoMail, setIndirizzoMail] = useState({}); // mid -> indirizzo digitato
  const eseguiCreaEvento = async (mid, proposta) => {
    const ev = proposta.evento;
    if (!ev?.ok || !ev.titolo) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: ev?.motivo || "manca il titolo dell'evento" });
      registraAzione({ fase: "rifiutata", azioneId: "crea_evento_calendario", motivo: ev?.motivo || "titolo mancante" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto scrivendo sul calendario e poi lo rileggo" });
    const evento = { title: ev.titolo, notes: "", startISO: ev.inizioISO, endISO: ev.fineISO, allDay: ev.tuttoIlGiorno };
    const r = await creaEventoConVerifica(evento, proposta.chiaveBase, true);
    aggiornaAzione(mid, { tipo: "esito-calendario", ...r, evento: ev });
    registraAzione({ fase: r.esito === "verificata" ? "eseguita-e-verificata" : "esito-" + r.esito, azioneId: "crea_evento_calendario", etichetta: ev.titolo, motivo: r.motivo || "" });
  };
  // La LETTURA del calendario. Regola non negoziabile, ed e' il motivo per cui questa azione
  // esiste: cio' che compare qui viene SOLO da Google. Nessuna proposta mai confermata, nessuna
  // cosa detta in chat, nessun ricordo del modello entra in questo elenco. Se la chiamata non
  // riesce si dichiara, e non si risponde lo stesso con quello che "si ricorda".
  const eseguiLeggiCalendario = async (mid, proposta) => {
    const l = proposta.lettura;
    if (!l?.ok) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: l?.motivo || "non ho capito che periodo guardare" });
      registraAzione({ fase: "rifiutata", azioneId: "leggi_calendario", motivo: l?.motivo || "periodo non capito" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto guardando sul calendario" });
    const r = await leggiEventiDalCalendario(l.inizioISO, l.fineISO).catch((e) => ({ ok: false, motivo: e.message }));
    aggiornaAzione(mid, { tipo: "esito-lettura", ...r, etichetta: l.etichetta });
    registraAzione({ fase: r.ok ? "eseguita-e-verificata" : "esito-fallita", azioneId: "leggi_calendario", etichetta: l.etichetta, motivo: r.motivo || "", trovati: r.eventi?.length ?? 0 });
  };
  // 22/08/2026 — LA CANCELLAZIONE. Il bersaglio non si ricava qui: e' gia' stato LETTO da Google in
  // cima al turno e mostrato al Ghost sulla card. Qui si cancella quell'id li', e poi si va a
  // rileggere per sapere se e' davvero sparito — la stessa disciplina della scrittura.
  const eseguiCancellaEvento = async (mid, proposta, bersaglio) => {
    const ev = bersaglio || proposta.cancellazione?.bersaglio;
    if (!ev?.id) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "non ho un evento da cancellare: non l'ho trovato sul calendario" });
      registraAzione({ fase: "rifiutata", azioneId: "cancella_evento_calendario", motivo: "nessun bersaglio" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto cancellando e poi rileggo dal calendario" });
    const chiave = chiaveIdempotenza("cancellazione", [ev.id]);
    const r = await cancellaEventoConVerifica(ev.id, chiave).catch((e) => ({ esito: "fallita", motivo: e.message }));
    aggiornaAzione(mid, { tipo: "esito-cancellazione", ...r, evento: ev });
    registraAzione({ fase: r.esito === "verificata" ? "eseguita-e-verificata" : "esito-" + r.esito, azioneId: "cancella_evento_calendario", etichetta: `${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)} — ${ev.titolo}`, motivo: r.motivo || "" });
  };
  // 25/08/2026 — LO SPOSTAMENTO. Il bersaglio, come per la cancellazione, e' gia' stato LETTO da
  // Google in cima al turno. Il nuovo orario e' quello calcolato dal codice in preparaClasseB. Qui
  // si scrive (PATCH) e poi si rilegge, la stessa disciplina di crea e cancella.
  const eseguiSpostaEvento = async (mid, proposta, bersaglio) => {
    const ev = bersaglio || proposta.spostamento?.bersaglio;
    const nuovo = proposta.spostamento?.nuovo;
    if (!ev?.id) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: "non ho un evento da spostare: non l'ho trovato sul calendario" });
      registraAzione({ fase: "rifiutata", azioneId: "sposta_evento_calendario", motivo: "nessun bersaglio" });
      return;
    }
    if (!nuovo?.ok) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: nuovo?.motivo || "non ho capito a quando spostarlo" });
      registraAzione({ fase: "rifiutata", azioneId: "sposta_evento_calendario", motivo: nuovo?.motivo || "nuovo quando non capito" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto spostando e poi rileggo dal calendario" });
    const chiave = proposta.chiaveBase || chiaveIdempotenza("spostamento", [ev.id, nuovo.inizioISO]);
    const r = await spostaEventoConVerifica(ev.id, nuovo, ev.titolo, chiave).catch((e) => ({ esito: "fallita", motivo: e.message }));
    aggiornaAzione(mid, { tipo: "esito-spostamento", ...r, evento: ev, nuovo });
    registraAzione({ fase: r.esito === "verificata" ? "eseguita-e-verificata" : "esito-" + r.esito, azioneId: "sposta_evento_calendario", etichetta: `${ev.titolo}: ${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)} → ${formatDataPerEsteso(nuovo.inizioISO, nuovo.tuttoIlGiorno)}`, motivo: r.motivo || "" });
  };
  const eseguiInviaMail = async (mid, proposta, forza = false) => {
    const ml = proposta.mail;
    const a = (indirizzoMail[mid] ?? ml?.a ?? "").trim();
    if (!EMAIL_VALIDA_RE.test(a)) {
      aggiornaAzione(mid, { tipo: "rifiutato", motivo: a ? `"${a}" non e' un indirizzo valido` : "manca l'indirizzo: scrivilo tu, non lo invento" });
      return;
    }
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "in-corso", cosa: "sto inviando e poi rileggo da Gmail" });
    const r = await inviaMailConVerifica({ a, oggetto: ml.oggetto, corpo: ml.corpo, chiave: chiaveConDestinatario(proposta.chiaveBase, a), confermaEsplicita: true, forza });
    aggiornaAzione(mid, { tipo: "esito-mail", ...r, a, oggetto: ml.oggetto, proposta });
    registraAzione({ fase: r.esito === "verificata" ? "eseguita-e-verificata" : "esito-" + r.esito, azioneId: "invia_mail", etichetta: `${a} — ${ml.oggetto}`, motivo: r.motivo || "" });
  };
  const confermaAzione = (mid, candidato) => {
    vibra("conferma"); // sincrona dentro il gestore del tocco: mai dopo un'attesa
    // Validazione: l'oggetto deve esistere ANCORA adesso, non solo quando fu proposto.
    const esisteOra = [...(pBio || []), ...(pAir || []), ...(pVidya || []), ...(semi || [])].some((o) => o.id === candidato.id);
    if (!esisteOra) {
      aggiornaAzione(mid, { tipo: "annullato" });
      registraAzione({ fase: "rifiutata", azioneId: "apri_percorso", motivo: "identificativo non piu' esistente", id: candidato.id });
      return;
    }
    const nuovo = apriFuoco(candidato.tipo, candidato.id, candidato.etichetta);
    cambiaFuoco(nuovo);
    aggiornaAzione(mid, { tipo: "aperto", etichetta: candidato.etichetta, id: candidato.id });
    registraAzione({ fase: "eseguita", azioneId: "apri_percorso", id: candidato.id, etichetta: candidato.etichetta, tipo: candidato.tipo });
  };
  const annullaAzione = (mid) => {
    vibra("conferma");
    aggiornaAzione(mid, { tipo: "annullato" });
    registraAzione({ fase: "annullata-prima-di-eseguire", azioneId: "apri_percorso" });
  };
  // Annullamento DOPO l'esecuzione: e' quello che rende l'azione davvero reversibile (C.14).
  const annullaApertura = (mid) => {
    vibra("conferma");
    cambiaFuoco(chiudiFuoco());
    aggiornaAzione(mid, { tipo: "annullato" });
    registraAzione({ fase: "annullata-dopo-esecuzione", azioneId: "apri_percorso" });
  };
  // Email da bozza Arms: stesso principio del Calendar, mai scrittura/invio automatico (Legge 8).
  // Il "recipient" nella bozza è una DESCRIZIONE dedotta dall'AI ("il tuo commercialista"), mai un
  // indirizzo verificato — l'indirizzo vero lo digita e conferma sempre il Ghost, qui, prima dell'invio.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const [emailSendStatus, setEmailSendStatus] = useState({}); // mid -> "editing"|"sending"|"done"|"error: <msg>"
  const [emailAddrDraft, setEmailAddrDraft] = useState({});
  const startEmailSend = (mid) => setEmailSendStatus((s) => ({ ...s, [mid]: "editing" }));
  const cancelEmailSend = (mid) => setEmailSendStatus((s) => { const n = { ...s }; delete n[mid]; return n; });
  const confirmEmailSend = async (mid, draft) => {
    const addr = (emailAddrDraft[mid] || "").trim();
    if (!EMAIL_RE.test(addr)) { setEmailSendStatus((s) => ({ ...s, [mid]: "error: indirizzo non valido" })); return; }
    setEmailSendStatus((s) => ({ ...s, [mid]: "sending" }));
    try {
      await sendGmail(addr, draft.subject || "(nessun oggetto)", draft.body);
      setEmailSendStatus((s) => ({ ...s, [mid]: "done" }));
      setMessages((prev) => [...prev, { id: uid(), role: "system-note", content: `✓ Email inviata a ${addr}.` }]);
    } catch (e) { setEmailSendStatus((s) => ({ ...s, [mid]: "error: " + e.message })); }
  };
  const actionColor = { BIO: C.bio, AIR: C.air, VIDYA: C.vidya };
  // 31/08/2026 — da quando un segno puo' dire "VIDYA · 3ª versione", la chiave non e' piu' l'intera
  // etichetta: il colore si prende dal pilastro, che e' la prima parola. Senza questo, ogni voce
  // fusa perdeva il colore e diventava un badge grigio senza che nessun errore lo segnalasse.
  const coloreDelSegno = (a) => actionColor[String(a).split(" ")[0]] || C.muted;
  const lastBio = bio?.[0], lastAir = air?.[0], lastVidya = vidya?.[0];
  return html`<div class="r-screen">
    <${SectionHeader} color="#2A2E35" title="SHELL" subtitle="Dialogo diretto — ciclo di percezione-azione visibile per verifica" />
    ${/* BLOCCO 1 §2.2 — il fuoco e' VISIBILE e CHIUDIBILE IN UN GESTO. Un copilota che non dice
          dove siete non e' affidabile; e C.14 vuole che ogni cosa mediata resti disfabile senza
          attrito. La barra compare solo quando c'e' un fuoco: a vuoto non occupa spazio. */ ""}
    ${fuoco.tipo !== "nessuno" && html`<div class="r-fuoco">
      <span class="r-fuoco-testo">Stiamo lavorando su: <b>${fuoco.etichetta}</b></span>
      <button class="r-fuoco-chiudi" title="Chiudi il fuoco" onClick=${() => { vibra("conferma"); cambiaFuoco(chiudiFuoco()); }}>chiudi</button>
    </div>`}
    <div class="r-settings-row" style="font-size:13px;margin-bottom:8px">
      <span>Modalità oggi: ${dialecticOverride === null ? "default profilo" : dialecticOverride ? "mettimi alla prova" : "confermami"}</span>
      <div style="display:flex;gap:6px">
        <button type="button" class="r-btn-ghost" style="font-size:12px" onClick=${() => setDialecticOverride((v) => (v === true ? null : true))}>Mettimi alla prova</button>
        <button type="button" class="r-btn-ghost" style="font-size:12px" onClick=${() => setDialecticOverride((v) => (v === false ? null : false))}>Confermami</button>
      </div>
    </div>
    <div class="r-shell-digest">
      <div class="r-shell-digest-card" style="border-left-color:${C.bio}">
        <div class="r-shell-digest-label" style="color:${C.bio}">BIO</div>
        <div class="r-shell-digest-detail">${lastBio ? `${lastBio.weight ? lastBio.weight + " kg — " : ""}${fmtDate(lastBio.date)}` : "Nessun dato ancora"}</div>
      </div>
      <div class="r-shell-digest-card" style="border-left-color:${C.air}">
        <div class="r-shell-digest-label" style="color:${C.air}">AIR</div>
        <div class="r-shell-digest-detail">${lastAir ? `${lastAir.title || "Vettore"} — ${lastAir.status || "idea"}` : "Nessun vettore ancora"}</div>
      </div>
      <div class="r-shell-digest-card" style="border-left-color:${C.vidya}">
        <div class="r-shell-digest-label" style="color:${C.vidya}">VIDYA</div>
        <div class="r-shell-digest-detail">${lastVidya ? (lastVidya.title || "Log creativo") : "Nessun log ancora"}</div>
      </div>
    </div>
    <div class="r-shell-log">
      ${messages.length === 0 && html`<div class="r-empty">Scrivi qualcosa. Lo Shell ricorda lo scambio e registra da solo ciò che riguarda BIO/AIR/VIDYA.</div>`}
      ${messages.map((m, i) => { const mid = m.id || i; return html`<${MessaggioProtetto} key=${mid} avvisa=${(e) => pushDebugLog?.({ type: "messaggio-non-disegnabile", messaggioId: mid, ruolo: m.role, error: String(e?.message || e) })} disegna=${() => m.role === "system-note"
        ? html`<div key=${mid} class="r-shell-system-note">${m.content}</div>`
        : m.role === "balthasar-margin"
        ? html`<div key=${mid} class="r-balthasar-margin-card"><div class="r-balthasar-margin-label">🜃 BALTHASAR — a margine${m.pillar ? ` · ${m.pillar.toUpperCase()}` : ""}</div><div class="r-balthasar-margin-text">${m.note}</div></div>`
        : html`<div key=${mid} class="r-shell-row ${m.role}">
            <div class="r-shell-bubble ${m.role}">${m.content}</div>
            ${/* 17/08/2026 — quando il codice ha dovuto togliere di mezzo un "e' stato aggiornato",
                  il Ghost deve saperlo. Non e' un dettaglio tecnico: e' il momento in cui il
                  sistema gli sta dicendo "quello che hai appena letto era falso, e l'ho fermato".
                  Questo riquadro lo scrive il programma, non il modello, quindi il modello non
                  puo' ne' evitarlo ne' contraddirlo. */ ""}
            ${/* 17/08/2026 mattina — il gemello del riquadro qui sotto. Il modello ha chiesto una
                  conferma senza che dietro ci fosse niente da confermare, e il Ghost si e' trovato
                  davanti a una domanda a cui non poteva rispondere se non a parole. Questo riquadro
                  lo scrive il programma, che sa se la proposta esiste. */ ""}
            ${m.confermaSenzaBersaglio && html`<div class="r-esito-falso">
              ${m.confermaSenzaBersaglio.motivo === "forse-spenta"
                ? html`<div><b>Ti ho chiesto una conferma, ma non comparirà nessun pulsante.</b> Quello che hai chiesto richiede una capacità che in questo momento è <b>spenta</b>${m.confermaSenzaBersaglio.spente.length ? html` — spente adesso: ${m.confermaSenzaBersaglio.spente.join(", ")}` : ""}. Le accendi in <b>Setup → Cosa lo Shell può fare parlando</b>. Finché è spenta non posso farlo, e non avrei dovuto chiedertelo.</div>`
                : m.confermaSenzaBersaglio.motivo === "tocca-il-pulsante"
                ? html`<div><b>C'è una proposta in attesa, ma il pulsante non l'hai toccato.</b> Hai risposto a parole, e una parola scritta qui non fa partire niente — mai, per nessuna azione: è una regola, non una svista. La card di <b>${m.confermaSenzaBersaglio.etichettaInAttesa}</b> è qui sopra: tocca il suo pulsante e parte.</div>`
                : m.confermaSenzaBersaglio.motivo === "conferma-a-vuoto"
                ? html`<div><b>Non ho niente in attesa da confermare.</b> Hai risposto di sì, ma non c'è nessuna proposta pronta: una parola scritta qui non fa partire niente, mai — serve il pulsante di una card. Ripeti la richiesta per intero${m.confermaSenzaBersaglio.spente.length ? html`, e controlla che la capacità che ti serve non sia spenta in Setup (spente adesso: ${m.confermaSenzaBersaglio.spente.join(", ")})` : ""}.</div>`
                : m.confermaSenzaBersaglio.motivo === "richiesta-nuova-con-proposta-viva"
                ? html`<div><b>Quello che hai appena chiesto non è partito.</b> C'è ancora una proposta di prima in sospeso — <b>${m.confermaSenzaBersaglio.etichettaInAttesa}</b> — e finché non tocchi il suo pulsante (o la annulli) il programma non ne prepara una seconda. Lo Shell non lo sapeva mentre scriveva, quindi ti ha risposto come se fosse tutto pronto: non lo era. Chiudi prima quella card, poi ripeti questa richiesta.</div>`
                : m.confermaSenzaBersaglio.motivo === "calendario-spento-senza-dirlo"
                ? html`<div><b>Non è successo niente, e lo Shell non te l'ha detto.</b> Hai chiesto qualcosa di calendario, ma almeno una delle capacità che servono è <b>spenta</b> adesso — spente: ${m.confermaSenzaBersaglio.spente.join(", ")}. Le accendi in <b>Setup → Cosa lo Shell può fare parlando</b>. Non so dirti con certezza quale ti serviva: il messaggio da solo non lo distingue.</div>`
                : html`<div><b>Ti ho chiesto una conferma, ma non ho preparato niente da confermare.</b> Non comparirà nessun pulsante: la proposta non è stata creata. Ripeti la richiesta scrivendo per esteso cosa vuoi che faccia${m.confermaSenzaBersaglio.diCalendario ? ", con giorno e ora" : ""}.</div>`}
            </div>`}
            ${/* 20/08/2026 — il terzo riquadro. Il Ghost aveva l'interruttore acceso davanti agli
                  occhi e lo Shell gli diceva che era spento. Qui il programma, che il dato ce
                  l'ha, lo smentisce a voce alta invece di lasciarlo credere. */ ""}
            ${m.capacitaSmentite?.length > 0 && html`<div class="r-esito-falso">
              <b>Attenzione: qui sopra ti ho detto una cosa falsa.</b> Ho scritto che una capacità è spenta o limitata, ma non è vero — <b>${m.capacitaAccese.join(", ")}</b> ${m.capacitaAccese.length === 1 ? "è accesa" : "sono accese"} in questo momento. L'ho tolto dal testo. Se non è comparso nessun pulsante il motivo è un altro, e lo trovi nel Registro delle azioni in Setup: mandamelo.
            </div>`}
            ${/* 22/08/2026 — il quarto riquadro, ed e' il piu' importante dei quattro. Gli altri
                  tre avvisano che una FRASE era falsa. Questo avvisa che un CONTENUTO era falso —
                  appuntamenti con nome, giorno e ora, che il Ghost non aveva nessun modo di
                  distinguere da quelli veri, perche' erano esattamente cio' che aveva chiesto e
                  nella forma che si aspettava. Il riquadro elenca cosa e' stato tolto: cosi' non
                  deve fidarsi che il filtro abbia funzionato, lo vede. */ ""}
            ${/* 23/08/2026 — LA RISPOSTA TAGLIATA A META' LO DICE, E SI PUO' CHIEDERE IL SEGUITO.
                  Stanotte il piano alimentare si e' fermato su "* Colazione:" e il Ghost ha dovuto
                  indovinare da solo che fosse tronco, scrivendo "Hai troncato la risposta". Il
                  programma lo sapeva — OpenRouter lo dice in ogni risposta — e non glielo diceva. */ ""}
            ${/* 23/08/2026 — GLI SCARTI DEL PIANO ALIMENTARE. Vedi controllaPianoAlimentare.
                  Questo riquadro non toglie niente e non riscrive niente: il piano qui sopra resta
                  intero. Elenca solo cio' che non torna, con il giorno preciso, perche' rileggersi
                  quattordici giorni per scoprire che al Giorno 2 c'e' il salmone che avevi escluso
                  e' un lavoro che tocca al codice, non al Ghost. */ ""}
            ${(m.vincoliProposti || []).filter((v) => !vincoloStatus[`${mid}|${v}`]).map((v) => html`<div class="r-draft-card" key=${v}>
              <div class="r-draft-label">▸ QUESTO LO TENGO COME REGOLA FISSA?</div>
              <div class="r-draft-body">${v}</div>
              <div class="r-hub-detail">Se lo tengo, lo Shell lo riceve a ogni turno da qui in avanti — anche fra un mese, anche quando questa conversazione sarà lontana — e io controllo che i piani che genera lo rispettino. Se lo lascio, vale solo per adesso.</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="r-btn r-draft-copy" onClick=${() => tieniVincolo(mid, v)}>Tienilo</button>
                <button class="r-btn r-btn-ghost" onClick=${() => lasciaVincolo(mid, v)}>Solo per adesso</button>
              </div>
            </div>`)}
            ${m.scartiDelPiano?.scarti?.length > 0 && html`<div class="r-esito-falso">
              <b>Ho controllato il piano qui sopra: ${m.scartiDelPiano.scarti.length === 1 ? "una cosa non torna" : `${m.scartiDelPiano.scarti.length} cose non tornano`}.</b>
              <div class="r-hub-detail">Il piano resta com'è — non l'ho toccato. Questi sono i punti da farti rifare, se ti interessano.</div>
              ${m.scartiDelPiano.scarti.map((s, i) => html`<div class="r-draft-body" key=${i} style="margin-top:6px">
                · ${s.cosa}${s.dove?.length ? html` <i>(${s.dove.join(", ")})</i>` : ""}
              </div>`)}
            </div>`}
            ${m.rispostaTroncata && html`<div class="r-draft-card">
              <div class="r-draft-label">▸ QUESTA RISPOSTA È TAGLIATA A METÀ</div>
              <div class="r-hub-detail">Ho raggiunto il tetto di lunghezza di una singola risposta e mi sono fermato dov'ero, non perché avessi finito. Quello che c'è scritto sopra è valido: manca il seguito.</div>
              <button class="r-btn r-draft-copy" onClick=${() => chiediIlSeguito()}>Continua da dove ti sei fermato</button>
            </div>`}
            ${/* 23/08/2026 — IL RIQUADRO DEVE DIRE LA VERITA' DEL CASO IN CUI SI TROVA.
                  Fino a ieri ne aveva UNA sola, scritta per il caso "nessuna lettura": «la lettura
                  del calendario non è avvenuta in questo turno». Osservato sullo schermo del Ghost
                  alle 03:41: la lettura ERA avvenuta — HTTP 200, due eventi, la card con l'elenco
                  proprio sotto il riquadro — e il riquadro gli diceva che non era avvenuta.
                  E' esattamente il difetto che questo riquadro esiste per curare, commesso dal
                  riquadro stesso: un testo del programma che contraddice un fatto che il programma
                  ha in mano. I due casi sono diversi e ora hanno due testi diversi. */ ""}
            ${m.contenutiCalendarioInventati?.length > 0 && html`<div class="r-esito-falso">
              ${(m.letturaCalendario && !m.letturaCalendario.saltata && m.letturaCalendario.ok)
                ? html`<div><b>Attenzione: qui sopra avevo scritto qualcosa che non viene da quello che ho letto.</b> Il calendario l'ho letto davvero in questo turno — l'elenco vero è nella card qui sotto — ma in quella frase c'era qualcosa che in quella lettura non c'era, quindi l'ho tolta invece di lasciartela leggere come se fosse tua agenda. Ecco cosa ho tolto, per esteso: <i>${m.contenutiCalendarioInventati.map((c) => `«${c.frase}» — ${c.motivo}`).join(" · ")}</i>. L'elenco della card qui sotto lo scrive il programma dagli eventi letti, non io: quello è esatto.</div>`
                : html`<div><b>Attenzione: qui sopra ti avevo elencato degli impegni che nessuno ha letto.</b> La lettura del calendario <b>non è avvenuta</b> in questo turno: non è partita nessuna richiesta verso Google, quindi quegli appuntamenti erano ricostruiti a memoria dalla nostra conversazione, non presi dalla tua agenda. Li ho tolti. Ecco cosa ho tolto, per esteso: <i>${m.contenutiCalendarioInventati.map((c) => c.frase).join(" · ")}</i>. Per sapere davvero cosa hai in programma serve la card <b>«Vado a guardare sul calendario»</b> e il suo pulsante: solo quello legge da Google.</div>`}
            </div>`}
            ${/* 22/08/2026 — l'esito della lettura, che ora avviene da sola in cima al turno.
                  Vive DENTRO il messaggio invece che in azioneStatus: azioneStatus e' stato di
                  componente e si azzera a ogni riapertura dell'app — e' la lezione del 20/08, dove
                  una risoluzione tenuta li' dentro spariva a ogni ricarica. Cosi' il Ghost ritrova
                  quello che ha letto anche domani. */ ""}
            ${m.letturaCalendario && html`<div class="r-draft-card">
              ${m.letturaCalendario.saltata
                ? html`<div><div class="r-draft-label">↳ NON SONO ANDATO A GUARDARE</div>
                    <div class="r-error">${m.letturaCalendario.motivo}. Quindi non ti dico cosa hai in programma: non l'ho letto.</div></div>`
                : m.letturaCalendario.ok === false
                ? html`<div><div class="r-draft-label">↳ NON SONO RIUSCITO A LEGGERE IL CALENDARIO</div>
                    <div class="r-error">${m.letturaCalendario.motivo}. Non ti dico cosa hai in programma tirando a indovinare: guarda tu sul calendario.</div></div>`
                : html`<div>
                    <div class="r-draft-label">↳ LETTO DAL CALENDARIO — ${m.letturaCalendario.etichetta}</div>
                    ${m.letturaCalendario.eventi.length === 0
                      ? html`<div class="r-draft-body">Non c'è niente. Il calendario è vuoto per quel periodo — e questo l'ho letto da Google, non dedotto.</div>`
                      : html`<div>${m.letturaCalendario.eventi.map((ev) => html`<div class="r-draft-body" key=${ev.id} style="margin-bottom:6px">
                          <b>${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)}</b> — ${ev.titolo}
                        </div>`)}</div>`}
                  </div>`}
              ${m.letturaCalendario.grezza && html`<div class="r-grezzo">${formatChiamataGrezza(m.letturaCalendario.grezza)}</div>`}
            </div>`}
            ${m.esitiFalsi?.length > 0 && html`<div class="r-esito-falso">
              <b>Attenzione.</b> Qui sopra avevo scritto che qualcosa era già stato fatto${m.esitiFalsi.length === 1 ? "" : ` (${m.esitiFalsi.length} volte)`}: <i>${m.esitiFalsi.join(" · ")}</i>. Non era vero e l'ho tolto. Non ho toccato né il calendario né la posta: se c'è un pulsante di conferma qui sotto, l'azione parte solo quando lo tocchi tu.
            </div>`}
            ${m.attachmentName && html`<div class="r-shell-attach-badge">${m.attachmentKind === "image" ? "🖼" : "📄"} ${m.attachmentName}</div>`}
            ${m.alerts && m.alerts.length > 0 && m.alerts.map((a) => html`<div class="r-shell-alert"><div class="r-shell-alert-label">⚠ ALLERTA — ${a.pillar.toUpperCase()}</div><div>${a.note}</div></div>`)}
            ${(m.dubbiIdentita || []).filter((d) => !(m.dubbiRisolti || {})[d.id]).map((d) => html`<div class="r-draft-card">
              <div class="r-draft-label">▸ QUESTO LO SCRIVO SU ${d.reading.pillar.toUpperCase()}? — guarda prima tu</div>
              <div class="r-hub-detail">Il tuo vincolo dice che la tua identità professionale non deve legarsi ad AIR. Qui qualcosa l'ha fatto scattare. Non decido io: non l'ho scritto, non l'ho buttato via.</div>
              <div class="r-draft-body">${[d.reading.title, d.reading.notes, d.reading.status].filter(Boolean).join(" — ")}</div>
              ${d.segnalazioni.map((s) => html`<div class="r-hub-detail">${s.da === "codice" ? "Ha segnalato il codice" : "Ha segnalato il modello"}: ${s.motivo}</div>`)}
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="r-btn r-draft-copy" onClick=${() => risolviDubbio(mid, d, "procedi")}>Va bene, procedi</button>
                <button class="r-btn r-btn-ghost" onClick=${() => risolviDubbio(mid, d, "lascia")}>No, lascialo fuori</button>
              </div>
            </div>`)}
            ${(m.dubbiIdentita || []).filter((d) => (m.dubbiRisolti || {})[d.id]).map((d) => html`<div class="r-draft-card">
              <div class="r-draft-label">${(m.dubbiRisolti || {})[d.id] === "procedi" ? `✓ SCRITTO SU ${d.reading.pillar.toUpperCase()} — l'hai sbloccato tu` : "✕ LASCIATO FUORI — l'hai deciso tu"}</div>
            </div>`)}
            ${m.draft && html`<div class="r-draft-card">
              <div class="r-draft-label">📝 BOZZA — ${m.draft.type.toUpperCase()}${m.draft.recipient ? ` · per: ${m.draft.recipient}` : ""}</div>
              ${m.draft.subject && html`<div class="r-draft-subject">Oggetto: ${m.draft.subject}</div>`}
              <div class="r-draft-body">${m.draft.body}</div>
              <button class="r-btn r-draft-copy" onClick=${() => copyDraft(mid, m.draft)}>${copiedId === mid ? "✓ Copiato" : "Copia"}</button>
              ${m.draft.type === "email" && emailSendStatus[mid] !== "done" && !emailSendStatus[mid] && html`
                <button class="r-btn r-btn-ghost" onClick=${() => startEmailSend(mid)}>Invia email…</button>`}
              ${m.draft.type === "email" && emailSendStatus[mid] === "editing" && html`<div style="margin-top:8px">
                <input class="r-input" type="email" placeholder="indirizzo@destinatario.it" value=${emailAddrDraft[mid] || ""}
                  onInput=${(e) => setEmailAddrDraft((s) => ({ ...s, [mid]: e.target.value }))} />
                <div style="margin-top:6px;display:flex;gap:8px">
                  <button class="r-btn" onClick=${() => confirmEmailSend(mid, m.draft)}>Conferma invio</button>
                  <button class="r-btn-ghost" onClick=${() => cancelEmailSend(mid)}>Annulla</button>
                </div>
              </div>`}
              ${emailSendStatus[mid] === "sending" && html`<div style="margin-top:6px"><span class="r-spin">⏳</span> Invio…</div>`}
              ${emailSendStatus[mid] === "done" && html`<div class="r-ok" style="margin-top:6px">✓ Inviata.</div>`}
              ${emailSendStatus[mid]?.startsWith?.("error") && html`<div class="r-error" style="margin-top:6px">${emailSendStatus[mid].replace("error: ", "")}</div>`}
            </div>`}
            ${/* La vecchia card "📅 CALENDAR — proposta, non ancora salvata" e' stata tolta il
                  16/08/2026: era la faccia visibile del secondo sistema di calendario, quello che
                  rigenerava una proposta diversa a ogni turno. Il calendario ora passa tutto dalla
                  card di Classe B qui sotto, che ha la data calcolata dal codice e la rilettura
                  dalla fonte. */ ""}
            ${/* BLOCCO 1 — la proposta d'azione, sempre visibile PRIMA dell'esecuzione (§7.2d),
                  anche in Classe A dove non c'e' gate: vedere "apro il percorso X" prima che
                  accada e' cio' che consente di fermarlo. Tre casi, tre comportamenti diversi:
                  trovato -> si conferma; ambiguo -> si mostra e si CHIEDE, mai scegliere il piu'
                  recente (§7.2b); nessun riscontro -> si dichiara, non si inventa. */ ""}
            ${m.azioneProposta && !azioneStatus[mid] && html`<div class="r-draft-card">
              ${m.azioneProposta.esito === "trovato" && html`<div>
                <div class="r-draft-label">▸ APRO QUESTO — conferma prima che accada</div>
                <div class="r-draft-body">${m.azioneProposta.candidati[0].etichetta} <span style="opacity:.6">(${m.azioneProposta.candidati[0].tipo}, ${m.azioneProposta.candidati[0].pilastro.toUpperCase()})</span></div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => confermaAzione(mid, m.azioneProposta.candidati[0])}>Sì, aprilo</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "ambiguo" && html`<div>
                <div class="r-draft-label">▸ QUALE DEI DUE? — non scelgo io</div>
                <div class="r-draft-body">Con "${m.azioneProposta.parametro}" possono intendersi più cose. Dimmi quale.</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  ${m.azioneProposta.candidati.map((c) => html`<button class="r-btn r-draft-copy" key=${c.id} onClick=${() => confermaAzione(mid, c)}>${c.etichetta}</button>`)}
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Nessuno</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "scrivi_su_pilastro" && html`<div>
                <div class="r-draft-label">▸ SEGNO QUESTO — conferma prima che accada</div>
                <div class="r-draft-body">${m.azioneProposta.parametro}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiScriviSuPilastro(mid, m.azioneProposta.parametro)}>Sì, segnalo</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "crea_seme" && html`<div>
                <div class="r-draft-label">▸ SALVO QUESTA IDEA COME SEME AIR</div>
                <div class="r-draft-body">${m.azioneProposta.parametro}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiCreaSeme(mid, m.azioneProposta.parametro)}>Sì, salvala</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "interroga_memoria" && html`<div>
                <div class="r-draft-label">▸ CERCO NELLA MEMORIA</div>
                <div class="r-draft-body">"${m.azioneProposta.parametro}"</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiInterrogaMemoria(mid, m.azioneProposta.parametro)}>Cerca</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Lascia stare</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "avanza_percorso" && html`<div>
                <div class="r-draft-label">▸ AVANZO SU QUELLO CHE È APERTO</div>
                <div class="r-draft-body">${fuoco.tipo !== "nessuno" ? fuoco.etichetta : "non c'è niente di aperto in questo momento"}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiAvanzaPercorso(mid)}>Avanti</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${/* 31/08/2026 — le due card nuove. Quella di creazione mostra il TITOLO che nascera',
                    non la frase del Ghost: e' l'unico momento in cui si puo' vedere prima che un
                    percorso prenda un nome sbagliato per sempre. Quella di salvataggio mostra
                    quanto materiale sta per entrare e come comincia, perche' l'errore possibile
                    qui e' salvare il messaggio sbagliato, e si vede solo guardando l'inizio. */ ""}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "crea_percorso" && html`<div>
                <div class="r-draft-label">▸ CREO QUESTO PERCORSO — conferma prima che nasca</div>
                <div class="r-draft-body">${m.azioneProposta.parametro}</div>
                <div class="r-hub-detail">Lo scompongo in nodi e diventa quello aperto. Non cancella e non tocca niente di esistente.</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiCreaPercorso(mid, m.azioneProposta.parametro)}>Sì, crealo</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "salva_nel_percorso" && (() => {
                const anteprima = testoDaSalvare(messages, mid, String(m.azioneProposta.parametro || ""));
                return html`<div>
                  <div class="r-draft-label">▸ SALVO QUESTO NEL PERCORSO APERTO</div>
                  <div class="r-draft-body">${fuoco.tipo === "percorso" ? fuoco.etichetta : "non c'è nessun percorso aperto in questo momento"}</div>
                  ${anteprima
                    ? html`<div class="r-hub-detail">«${m.azioneProposta.parametro || "senza titolo"}» — ${anteprima.testo.length} caratteri, per intero. Comincia con: "${anteprima.testo.slice(0, 120)}…"</div>`
                    : html`<div class="r-hub-detail">Qui sopra non trovo un contenuto abbastanza lungo da salvare.</div>`}
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="r-btn r-draft-copy" onClick=${() => eseguiSalvaNelPercorso(mid, m.azioneProposta.parametro)}>Salva nel percorso</button>
                    <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                  </div>
                </div>`;
              })()}
              ${/* 25/08/2026 — il gemello: chiudere il fuoco. Mostra sempre l'etichetta di cio' che
                    e' aperto ADESSO (letta al render, non a quando la card e' nata), cosi' se il
                    Ghost lo ha gia' chiuso o cambiato nel frattempo la card non mente. */ ""}
              ${m.azioneProposta.esito === "diretto" && m.azioneProposta.azioneId === "chiudi_percorso" && html`<div>
                <div class="r-draft-label">▸ CHIUDO QUESTO</div>
                <div class="r-draft-body">${fuoco.tipo !== "nessuno" ? fuoco.etichetta : "non c'è niente di aperto in questo momento"}</div>
                <div class="r-hub-detail">Non cancello e non archivio niente: resta tutto com'è, smette solo di essere quello su cui stiamo lavorando adesso. Lo riprendi quando vuoi dicendomelo.</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="r-btn r-draft-copy" onClick=${() => eseguiChiudiPercorso(mid)}>Chiudi</button>
                  <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                </div>
              </div>`}
              ${/* BLOCCO 3 — GATE LEGGERO (calendario). L'evento si cancella, quindi basta vedere
                    e confermare. Ma la data e' scritta PER ESTESO — giorno della settimana, data,
                    ora — perche' e' li' che l'errore del modello si nasconde, e l'ha ricavata il
                    programma dalle parole del Ghost, non il modello. */ ""}
              ${m.azioneProposta.azioneId === "crea_evento_calendario" && html`<div>
                ${m.azioneProposta.evento?.vincoli?.ok === false
                  ? html`<div><div class="r-draft-label">▸ NON LO METTO</div>
                      <div class="r-error">Il titolo richiama la tua identità professionale (${m.azioneProposta.evento.vincoli.violazioni.join(", ")}). È il vincolo che mi hai dato: non lo mando fuori. Riscrivilo diversamente.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : !m.azioneProposta.evento?.ok
                  ? html`<div><div class="r-draft-label">▸ NON HO CAPITO QUANDO</div>
                      <div class="r-draft-body">Hai detto "${m.azioneProposta.evento?.quandoDetto || ""}" e ${m.azioneProposta.evento?.motivo || "non sono riuscito a ricavarne una data"}. Non me la invento: ridimmela con giorno e ora.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.evento?.accordoOrario?.concordano === false
                  ? html`<div><div class="r-draft-label">▸ NON LO METTO: DUE CONTI DIVERSI SULL'ORA</div>
                      <div class="r-draft-body">Hai detto "${m.azioneProposta.evento.quandoDetto}". ${m.azioneProposta.evento.accordoOrario.motivo}.</div>
                      <div class="r-hub-detail">Due meccanismi indipendenti ricavano l'ora, e quando non concordano non scrivo niente: uno dei due ha sbagliato e non posso sapere quale. Ridimmi l'ora e riparto.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : html`<div>
                      <div class="r-draft-label">▸ METTO QUESTO SUL CALENDARIO — conferma prima che accada</div>
                      <div class="r-draft-subject">${m.azioneProposta.evento.titolo}</div>
                      <div class="r-draft-body"><b>${formatDataPerEsteso(m.azioneProposta.evento.inizioISO, m.azioneProposta.evento.tuttoIlGiorno)}</b></div>
                      <div class="r-hub-detail">L'ora è stata ricavata due volte, dal programma e dal modello, e le due coincidono${m.azioneProposta.evento.accordoOrario?.nonConfrontato ? " — o meglio: il modello non l'ha riportata, quindi il confronto non è stato possibile" : ""}.</div>
                      ${m.azioneProposta.evento.ambiguo && html`<div class="r-error">Attenzione: ${m.azioneProposta.evento.motivoAmbiguita}.</div>`}
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiCreaEvento(mid, m.azioneProposta)}>Sì, mettilo</button>
                        <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                      </div>
                    </div>`}
              </div>`}
              ${/* 17/08/2026 — la LETTURA del calendario, con la sua card e il suo pulsante.
                    22/08/2026: QUESTO RAMO NON SI RAGGIUNGE PIU' PER I MESSAGGI NUOVI. La lettura
                    ora parte da sola in cima al turno e non produce nessuna proposta, quindi
                    m.azioneProposta.azioneId non vale piu' "leggi_calendario" per niente di nuovo.
                    Resta qui, insieme a eseguiLeggiCalendario, per una sola ragione: i messaggi
                    gia' salvati sul telefono del Ghost contengono ancora quelle card, e togliere
                    il codice le renderebbe pulsanti morti dentro la sua cronologia. Va rimosso
                    quando quei messaggi saranno usciti dalla finestra della chat. */ ""}
              ${m.azioneProposta.azioneId === "leggi_calendario" && html`<div>
                ${!m.azioneProposta.lettura?.ok
                  ? html`<div><div class="r-draft-label">▸ CHE PERIODO GUARDO?</div>
                      <div class="r-draft-body">Hai detto "${m.azioneProposta.lettura?.quandoDetto || ""}" e ${m.azioneProposta.lettura?.motivo || "non ho capito il periodo"}. Dimmelo con un giorno.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : html`<div>
                      <div class="r-draft-label">▸ VADO A GUARDARE SUL CALENDARIO</div>
                      <div class="r-draft-body"><b>${m.azioneProposta.lettura.etichetta}</b></div>
                      <div class="r-hub-detail">Leggo da Google, non dalla nostra conversazione. Quello che ti dirò sarà quello che c'è davvero.</div>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiLeggiCalendario(mid, m.azioneProposta)}>Guarda</button>
                        <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Lascia stare</button>
                      </div>
                    </div>`}
              </div>`}
              ${/* 22/08/2026 — LA CANCELLAZIONE. Gate pieno: cancellare non si disfa. Cio' che
                    compare qui e' l'evento LETTO da Google in cima al turno, non una ricostruzione
                    del modello: se il programma non l'ha trovato, non c'e' nessun pulsante. */ ""}
              ${m.azioneProposta.azioneId === "cancella_evento_calendario" && html`<div>
                ${m.azioneProposta.cancellazione?.esitoRicerca === "spenta"
                  ? html`<div><div class="r-draft-label">▸ NON POSSO CANCELLARE</div>
                      <div class="r-error">${m.azioneProposta.cancellazione.motivo}. La accendi in <b>Setup → Cosa lo Shell può fare parlando</b>.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.cancellazione?.esitoRicerca === "lettura-fallita"
                  ? html`<div><div class="r-draft-label">▸ NON SONO RIUSCITO A CERCARLO</div>
                      <div class="r-error">${m.azioneProposta.cancellazione.motivo}. Non cancello niente alla cieca: riprova fra poco.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.cancellazione?.esitoRicerca === "non-trovato"
                  ? html`<div><div class="r-draft-label">▸ NON L'HO TROVATO</div>
                      <div class="r-draft-body">${m.azioneProposta.cancellazione.motivo}. Ho guardato davvero sul calendario, non a memoria.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.cancellazione?.esitoRicerca === "ambiguo"
                  ? html`<div><div class="r-draft-label">▸ QUALE DI QUESTI? — ne ho trovati ${m.azioneProposta.cancellazione.candidati.length}</div>
                      <div class="r-hub-detail">Non scelgo io: cancellare non torna indietro.</div>
                      ${m.azioneProposta.cancellazione.candidati.map((ev) => html`<div key=${ev.id} style="margin-top:8px">
                        <div class="r-draft-body"><b>${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)}</b> — ${ev.titolo}</div>
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiCancellaEvento(mid, m.azioneProposta, ev)}>Cancella questo</button>
                      </div>`)}
                      <div style="margin-top:8px"><button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Nessuno</button></div></div>`
                  : html`<div>
                      <div class="r-draft-label">▸ STO PER CANCELLARE QUESTO — non torna indietro</div>
                      <div class="r-draft-subject">${m.azioneProposta.cancellazione.bersaglio.titolo}</div>
                      <div class="r-draft-body"><b>${formatDataPerEsteso(m.azioneProposta.cancellazione.bersaglio.inizio, m.azioneProposta.cancellazione.bersaglio.tuttoIlGiorno)}</b></div>
                      <div class="r-hub-detail">Questo l'ho letto adesso dal tuo calendario, non me lo sono ricordato. Un evento cancellato non si recupera.</div>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiCancellaEvento(mid, m.azioneProposta)}>Sì, cancellalo</button>
                        <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Lascia stare</button>
                      </div>
                    </div>`}
              </div>`}
              ${/* 25/08/2026 — LO SPOSTAMENTO. Stesso gate pieno della cancellazione (il bersaglio
                    e' quello letto DAVVERO da Google in cima al turno) piu' lo stesso doppio
                    controllo sull'ora della creazione (due percorsi indipendenti devono concordare
                    sul NUOVO orario). L'ordine dei controlli conta: prima si scarta cio' che rende
                    l'azione impossibile a monte (capacita' spenta, ricerca fallita, niente trovato),
                    poi cio' che riguarda il nuovo orario — che vale per qualunque candidato — e solo
                    per ultimo l'ambiguita' fra piu' eventi trovati, perche' a quel punto scegliere
                    quale spostare e' l'unica cosa che resta da decidere. */ ""}
              ${m.azioneProposta.azioneId === "sposta_evento_calendario" && html`<div>
                ${m.azioneProposta.spostamento?.esitoRicerca === "spenta"
                  ? html`<div><div class="r-draft-label">▸ NON POSSO SPOSTARE</div>
                      <div class="r-error">${m.azioneProposta.spostamento.motivo}. La accendi in <b>Setup → Cosa lo Shell può fare parlando</b>.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.spostamento?.esitoRicerca === "lettura-fallita"
                  ? html`<div><div class="r-draft-label">▸ NON SONO RIUSCITO A CERCARLO</div>
                      <div class="r-error">${m.azioneProposta.spostamento.motivo}. Non sposto niente alla cieca: riprova fra poco.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.spostamento?.esitoRicerca === "non-trovato"
                  ? html`<div><div class="r-draft-label">▸ NON L'HO TROVATO</div>
                      <div class="r-draft-body">${m.azioneProposta.spostamento.motivo}. Ho guardato davvero sul calendario, non a memoria.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : !m.azioneProposta.spostamento?.nuovo?.ok
                  ? html`<div><div class="r-draft-label">▸ NON HO CAPITO QUANDO</div>
                      <div class="r-draft-body">Hai detto "${m.azioneProposta.spostamento?.quandoDetto || ""}" e ${m.azioneProposta.spostamento?.nuovo?.motivo || "non sono riuscito a ricavarne una data"}. Non me la invento: ridimmi il nuovo giorno e ora.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.spostamento?.accordoOrario?.concordano === false
                  ? html`<div><div class="r-draft-label">▸ NON LO SPOSTO: DUE CONTI DIVERSI SULL'ORA</div>
                      <div class="r-draft-body">Hai detto "${m.azioneProposta.spostamento.quandoDetto}". ${m.azioneProposta.spostamento.accordoOrario.motivo}.</div>
                      <div class="r-hub-detail">Due meccanismi indipendenti ricavano la nuova ora, e quando non concordano non sposto niente: uno dei due ha sbagliato e non posso sapere quale. Ridimmi l'ora e riparto.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : m.azioneProposta.spostamento?.esitoRicerca === "ambiguo"
                  ? html`<div><div class="r-draft-label">▸ QUALE DI QUESTI? — ne ho trovati ${m.azioneProposta.spostamento.candidati.length}</div>
                      <div class="r-hub-detail">Non scelgo io: dimmi tu quale spostare a <b>${formatDataPerEsteso(m.azioneProposta.spostamento.nuovo.inizioISO, m.azioneProposta.spostamento.nuovo.tuttoIlGiorno)}</b>.</div>
                      ${m.azioneProposta.spostamento.candidati.map((ev) => html`<div key=${ev.id} style="margin-top:8px">
                        <div class="r-draft-body"><b>${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)}</b> — ${ev.titolo}</div>
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiSpostaEvento(mid, m.azioneProposta, ev)}>Sposta questo</button>
                      </div>`)}
                      <div style="margin-top:8px"><button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Nessuno</button></div></div>`
                  : html`<div>
                      <div class="r-draft-label">▸ STO PER SPOSTARE QUESTO — conferma prima che accada</div>
                      <div class="r-draft-subject">${m.azioneProposta.spostamento.bersaglio.titolo}</div>
                      <div class="r-draft-body">Da: <b>${formatDataPerEsteso(m.azioneProposta.spostamento.bersaglio.inizio, m.azioneProposta.spostamento.bersaglio.tuttoIlGiorno)}</b></div>
                      <div class="r-draft-body">A: <b>${formatDataPerEsteso(m.azioneProposta.spostamento.nuovo.inizioISO, m.azioneProposta.spostamento.nuovo.tuttoIlGiorno)}</b></div>
                      <div class="r-hub-detail">Questo l'ho letto adesso dal tuo calendario, non me lo sono ricordato. L'ora nuova è stata ricavata due volte, dal programma e dal modello, e le due coincidono${m.azioneProposta.spostamento.accordoOrario?.nonConfrontato ? " — o meglio: il modello non l'ha riportata, quindi il confronto non è stato possibile" : ""}.</div>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiSpostaEvento(mid, m.azioneProposta)}>Sì, spostalo</button>
                        <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Lascia stare</button>
                      </div>
                    </div>`}
              </div>`}
              ${/* GATE PIENO C.10 (mail). Irreversibile: il sistema si ferma e mostra ESATTAMENTE
                    cio' che sta per uscire — testo integrale, mai troncato, e indirizzo per esteso —
                    e non parte finche' il Ghost non tocca quel pulsante. Il pulsante nomina
                    l'indirizzo: cosi' la conferma non e' deducibile dal contesto, e' su quell'invio
                    li'. Un "si'" scritto in chat tre messaggi dopo non e' e non sara' mai una conferma. */ ""}
              ${m.azioneProposta.azioneId === "invia_mail" && html`<div>
                ${m.azioneProposta.mail?.vincoli?.ok === false
                  ? html`<div><div class="r-draft-label">▸ NON LA MANDO</div>
                      <div class="r-error">Il testo richiama la tua identità professionale (${m.azioneProposta.mail.vincoli.violazioni.join(", ")}). È il vincolo che mi hai dato, e una mail è output che esce davvero: mi fermo qui. Riscrivila diversamente.</div>
                      <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button></div>`
                  : html`<div>
                      <div class="r-draft-label">▸ STO PER INVIARE QUESTA MAIL — leggila tutta prima di confermare</div>
                      <div class="r-hub-detail">Una mail inviata non torna indietro. Qui sotto c'è esattamente quello che parte, per intero.</div>
                      <div style="margin-top:8px"><span class="r-hub-detail">A:</span>
                        <input class="r-input" type="email" inputmode="email" placeholder="scrivi tu l'indirizzo — non lo invento"
                          value=${indirizzoMail[mid] ?? m.azioneProposta.mail.a ?? ""}
                          onInput=${(e) => setIndirizzoMail((s) => ({ ...s, [mid]: e.target.value }))} /></div>
                      <div class="r-draft-subject">Oggetto: ${m.azioneProposta.mail.oggetto || "(nessun oggetto)"}</div>
                      <div class="r-mail-integrale">${m.azioneProposta.mail.corpo}</div>
                      <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="r-btn r-draft-copy" onClick=${() => eseguiInviaMail(mid, m.azioneProposta)}>Invia adesso a ${(indirizzoMail[mid] ?? m.azioneProposta.mail.a ?? "").trim() || "…"}</button>
                        <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Annulla</button>
                      </div>
                    </div>`}
              </div>`}
              ${(m.azioneProposta.esito === "nessun-riscontro" || m.azioneProposta.esito === "nessuna-parola-utile") && html`<div>
                <div class="r-draft-label">▸ NON L'HO TROVATO</div>
                <div class="r-draft-body">Non c'è niente che corrisponda a "${m.azioneProposta.parametro}" fra i percorsi e i semi che esistono adesso. Non ne apro uno a caso: dimmi tu quale, o creiamolo.</div>
                <button class="r-btn r-btn-ghost" onClick=${() => annullaAzione(mid)}>Va bene</button>
              </div>`}
            </div>`}
            ${azioneStatus[mid]?.tipo === "aperto" && html`<div class="r-ok">✓ Aperto: ${azioneStatus[mid].etichetta} — <button class="r-fuoco-chiudi" onClick=${() => annullaApertura(mid)}>annulla</button></div>`}
            ${azioneStatus[mid]?.tipo === "annullato" && html`<div class="r-hub-detail">Annullato — non è stato fatto niente.</div>`}
            ${azioneStatus[mid]?.tipo === "rifiutato" && html`<div class="r-error">Non l'ho fatto: ${azioneStatus[mid].motivo}.</div>`}
            ${azioneStatus[mid]?.tipo === "scritto" && html`<div class="r-ok">✓ Segnato su ${azioneStatus[mid].pilastro.toUpperCase()}: ${azioneStatus[mid].testo}</div>`}
            ${azioneStatus[mid]?.tipo === "seme" && html`<div class="r-ok">✓ Salvato come Seme AIR — lo trovi in AIR → Percorsi.</div>`}
            ${azioneStatus[mid]?.tipo === "avanza" && html`<div class="r-ok">✓ Fuoco su ${azioneStatus[mid].etichetta} — chiedimi pure il prossimo passo.</div>`}
            ${azioneStatus[mid]?.tipo === "chiuso" && html`<div class="r-ok">✓ Chiuso: ${azioneStatus[mid].etichetta}. Resta tutto com'era — dimmi "riprendi" quando vuoi tornarci.</div>`}
            ${azioneStatus[mid]?.tipo === "percorso-creato" && html`<div class="r-ok">✓ Percorso "${azioneStatus[mid].titolo}" creato in ${azioneStatus[mid].pilastro.toUpperCase()}, ${azioneStatus[mid].nodi} nodi. È quello aperto adesso: quello che generiamo lo posso salvare lì dentro.</div>`}
            ${azioneStatus[mid]?.tipo === "salvato-nel-percorso" && html`<div class="r-ok">✓ "${azioneStatus[mid].titolo}" salvato per intero (${azioneStatus[mid].caratteri} caratteri) nel percorso ${azioneStatus[mid].percorso}${azioneStatus[mid].nodo ? `, sotto il nodo "${azioneStatus[mid].nodo}"` : ""}. Lo ritrovi lì fra un mese, anche quando questa conversazione sarà stata compattata.</div>`}
            ${/* BLOCCO 3 §3.1 — la verifica di ritorno mostrata al Ghost. "Verificata" vuol dire
                  una cosa sola: sono tornato a chiedere alla fonte e l'ho visto. Ogni altro esito
                  e' scritto come un fallimento, anche quando l'invio potrebbe essere riuscito —
                  perche' dichiarare fatto cio' che non si e' riletto e' esattamente il difetto che
                  questo blocco esiste per chiudere. */ ""}
            ${azioneStatus[mid]?.tipo === "in-corso" && html`<div class="r-hub-detail">… ${azioneStatus[mid].cosa}</div>`}
            ${/* 17/08/2026 — l'esito della LETTURA. Se Google non risponde si dichiara e basta:
                  non si ripiega su cio' che il modello ricorda, che e' esattamente il modo in cui
                  sono nati i due impegni immaginari del 17/08. */ ""}
            ${azioneStatus[mid]?.tipo === "esito-lettura" && html`<div class="r-draft-card">
              ${azioneStatus[mid].ok === false
                ? html`<div><div class="r-draft-label">↳ NON SONO RIUSCITO A LEGGERE IL CALENDARIO</div>
                    <div class="r-error">${azioneStatus[mid].motivo}. Non ti dico cosa hai in programma tirando a indovinare: guarda tu sul calendario.</div></div>`
                : html`<div>
                    <div class="r-draft-label">↳ LETTO DAL CALENDARIO — ${azioneStatus[mid].etichetta}</div>
                    ${azioneStatus[mid].eventi.length === 0
                      ? html`<div class="r-draft-body">Non c'è niente. Il calendario è vuoto per quel periodo — e questo l'ho letto da Google, non dedotto.</div>`
                      : html`<div>${azioneStatus[mid].eventi.map((ev) => html`<div class="r-draft-body" key=${ev.id} style="margin-bottom:6px">
                          <b>${formatDataPerEsteso(ev.inizio, ev.tuttoIlGiorno)}</b> — ${ev.titolo}
                        </div>`)}</div>`}
                  </div>`}
              ${azioneStatus[mid].grezza && html`<div class="r-grezzo">${formatChiamataGrezza(azioneStatus[mid].grezza)}</div>`}
            </div>`}
            ${/* 22/08/2026 — l'esito della cancellazione, riletto dalla fonte come ogni scrittura. */ ""}
            ${azioneStatus[mid]?.tipo === "esito-cancellazione" && html`<div>
              ${azioneStatus[mid].esito === "verificata" && html`<div class="r-ok">✓ Cancellato. Sono andato a rileggerlo e non c'è più: <b>${azioneStatus[mid].evento.titolo}</b> — ${formatDataPerEsteso(azioneStatus[mid].evento.inizio, azioneStatus[mid].evento.tuttoIlGiorno)}.</div>`}
              ${azioneStatus[mid].esito === "gia-eseguita" && html`<div class="r-ok">Quello l'avevo già cancellato: non lo cancello due volte.</div>`}
              ${azioneStatus[mid].esito === "ancora-presente" && html`<div class="r-error">Ho mandato la cancellazione, ma rileggendo il calendario l'evento risulta ancora lì. Non ti dico che è fatta quando non lo è: guarda tu su Google.</div>`}
              ${azioneStatus[mid].esito === "non-verificabile" && html`<div class="r-error">La cancellazione è partita, ma non sono riuscito a rileggere per confermarlo (${azioneStatus[mid].motivo}). Probabilmente è andata, ma non te lo garantisco.</div>`}
              ${azioneStatus[mid].esito === "fallita" && html`<div class="r-error">Non sono riuscito a cancellarlo: ${azioneStatus[mid].motivo}. L'evento è ancora sul calendario.</div>`}
              ${azioneStatus[mid].grezza && html`<div class="r-grezzo">${formatChiamataGrezza(azioneStatus[mid].grezza)}</div>`}
            </div>`}
            ${/* 25/08/2026 — l'esito dello spostamento, riletto dalla fonte come ogni scrittura.
                  "Verificata" qui vuol dire: sono tornato a leggere l'evento e il nuovo orario
                  combacia con quello confermato — non che il PATCH ha risposto 200. */ ""}
            ${azioneStatus[mid]?.tipo === "esito-spostamento" && html`<div>
              ${azioneStatus[mid].esito === "verificata" && html`<div class="r-ok">✓ Spostato. Sono andato a rileggerlo: <b>${azioneStatus[mid].letto.titolo}</b> è adesso a ${formatDataPerEsteso(azioneStatus[mid].letto.inizio, azioneStatus[mid].letto.tuttoIlGiorno)}.${azioneStatus[mid].letto.link ? html` <a href=${azioneStatus[mid].letto.link} target="_blank" rel="noopener">aprilo</a>` : ""}</div>`}
              ${azioneStatus[mid].esito === "gia-eseguita" && html`<div class="r-hub-detail">Questo spostamento risulta già fatto (${new Date(azioneStatus[mid].precedente.aggiornata).toLocaleString("it-IT")}). Non lo rifaccio.</div>`}
              ${azioneStatus[mid].esito === "non-verificabile" && html`<div class="r-error">Lo spostamento è partito, ma non sono riuscito a rileggere per confermarlo (${azioneStatus[mid].motivo}). Probabilmente è andato, ma non te lo garantisco.</div>`}
              ${azioneStatus[mid].esito === "non-combacia" && html`<div class="r-error">L'ho spostato, ma quello che c'è sul calendario è diverso da quello che avevi confermato${azioneStatus[mid].differenze?.length ? html`:<div style="margin-top:4px">${azioneStatus[mid].differenze.map((d) => html`<div key=${d.campo}>· <b>${d.campo}</b> — avevi confermato "${d.atteso}", sul calendario c'è "${d.trovato}"</div>`)}</div>` : "."} Controllalo a mano.</div>`}
              ${azioneStatus[mid].esito === "fallita" && html`<div class="r-error">Non sono riuscito a spostarlo: ${azioneStatus[mid].motivo}. L'evento è rimasto dov'era.</div>`}
              ${azioneStatus[mid].grezza && html`<div class="r-grezzo">${formatChiamataGrezza(azioneStatus[mid].grezza)}</div>`}
            </div>`}
            ${azioneStatus[mid]?.tipo === "esito-calendario" && html`<div>
              ${azioneStatus[mid].esito === "verificata" && html`<div class="r-ok">✓ C'è, l'ho riletto dal calendario: <b>${azioneStatus[mid].letto.titolo}</b> — ${formatDataPerEsteso(azioneStatus[mid].letto.inizio, azioneStatus[mid].letto.tuttoIlGiorno)}.${azioneStatus[mid].letto.link ? html` <a href=${azioneStatus[mid].letto.link} target="_blank" rel="noopener">aprilo</a>` : ""}</div>`}
              ${/* 20/08/2026 — tre esiti, tre messaggi diversi. Prima "non sono riuscito a
                    rileggere" e "l'ho riletto ma e' diverso" finivano nella stessa frase
                    allarmante, e per giunta partiva anche quando era tutto a posto. */ ""}
              ${azioneStatus[mid].esito === "non-verificabile" && html`<div class="r-error">L'ho creato — la scrittura è riuscita — ma non sono riuscito a rileggerlo per controllare (${azioneStatus[mid].motivo}). <b>Non vuol dire che non c'è:</b> vuol dire che non posso confermartelo io. Dai un'occhiata al calendario.</div>`}
              ${azioneStatus[mid].esito === "non-combacia" && html`<div class="r-error">L'ho creato, ma quello che c'è sul calendario è diverso da quello che avevi confermato${azioneStatus[mid].differenze?.length ? html`:<div style="margin-top:4px">${azioneStatus[mid].differenze.map((d) => html`<div key=${d.campo}>· <b>${d.campo}</b> — avevi confermato "${d.atteso}", sul calendario c'è "${d.trovato}"</div>`)}</div>` : "."} Controllalo a mano.</div>`}
              ${azioneStatus[mid].esito === "fallita" && html`<div class="r-error">Non è stato creato: ${azioneStatus[mid].motivo}. Un evento si può ritentare senza rischio — al massimo nasce un doppione e si cancella.</div>`}
              ${azioneStatus[mid].esito === "gia-eseguita" && html`<div class="r-hub-detail">Questo evento risulta già messo (${new Date(azioneStatus[mid].precedente.aggiornata).toLocaleString("it-IT")}). Non lo rifaccio.</div>`}
              ${azioneStatus[mid].esito === "bloccata-dai-vincoli" && html`<div class="r-error">Bloccato dal vincolo sull'identità professionale (${azioneStatus[mid].violazioni.join(", ")}).</div>`}
              ${/* 17/08/2026 — il dato tecnico grezzo, non filtrato. Il Ghost non deve indagare un
                    log: gli basta copiare questo e incollarmelo. E' un fatto, non un racconto. */ ""}
              ${azioneStatus[mid].grezza && html`<div class="r-grezzo">${formatChiamataGrezza(azioneStatus[mid].grezza)}</div>`}
            </div>`}
            ${azioneStatus[mid]?.tipo === "esito-mail" && html`<div>
              ${azioneStatus[mid].esito === "verificata" && html`<div class="r-ok">✓ Inviata, e riletta da Gmail: a <b>${azioneStatus[mid].letto.a}</b>, oggetto "${azioneStatus[mid].letto.oggetto}"${azioneStatus[mid].letto.quando ? `, ${azioneStatus[mid].letto.quando}` : ""}.</div>`}
              ${azioneStatus[mid].esito === "non-verificata" && html`<div class="r-error">È partita, ma NON sono riuscito a rileggerla da Gmail (${azioneStatus[mid].motivo}). Non ti dico che è arrivata: guarda nella cartella "Inviata" prima di darla per fatta.</div>`}
              ${azioneStatus[mid].esito === "non-combacia" && html`<div class="r-error">È partita, ma il destinatario che Gmail mi ha restituito ("${azioneStatus[mid].letto.a}") non è quello che avevi confermato. Controlla subito.</div>`}
              ${azioneStatus[mid].esito === "incerta" && html`<div class="r-error">Non ho ricevuto risposta (${azioneStatus[mid].motivo}). <b>Potrebbe essere partita lo stesso.</b> Non la rimando da solo: controlla in "Posta inviata". Se non c'è, puoi farla partire di nuovo qui sotto — sapendo che se invece c'era, ne arrivano due.
                <button class="r-btn r-btn-ghost" style="margin-left:0;margin-top:6px" onClick=${() => eseguiInviaMail(mid, azioneStatus[mid].proposta, true)}>Ho controllato: non è partita, mandala</button></div>`}
              ${azioneStatus[mid].esito === "gia-eseguita" && html`<div class="r-hub-detail">Questa mail risulta già gestita (stato: ${azioneStatus[mid].precedente.stato}, ${new Date(azioneStatus[mid].precedente.aggiornata).toLocaleString("it-IT")}). Non la rimando: un doppio invio non si annulla.</div>`}
              ${azioneStatus[mid].esito === "bloccata-dai-vincoli" && html`<div class="r-error">Bloccata dal vincolo sull'identità professionale (${azioneStatus[mid].violazioni.join(", ")}).</div>`}
              ${azioneStatus[mid].esito === "rifiutata" && html`<div class="r-error">Non l'ho mandata: ${azioneStatus[mid].motivo}.</div>`}
              ${azioneStatus[mid].grezza && html`<div class="r-grezzo">${formatChiamataGrezza(azioneStatus[mid].grezza)}</div>`}
            </div>`}
            ${azioneStatus[mid]?.tipo === "memoria" && html`<div class="r-draft-card">
              <div class="r-draft-label">↳ HO GUARDATO ${azioneStatus[mid].doveHoGuardato.toUpperCase()}</div>
              ${azioneStatus[mid].frammenti.length === 0
                ? html`<div class="r-draft-body">Non ho trovato niente su "${azioneStatus[mid].argomento}". Non vuol dire che non ne abbiamo parlato: vuol dire che non è finito nella memoria.</div>`
                : html`<div>${azioneStatus[mid].frammenti.map((f) => html`<div class="r-draft-body" key=${f.id} style="margin-bottom:6px">
                    <b>${f.pilastro.toUpperCase()}</b>${f.date ? " · " + fmtDate(f.date) : " · nota corrente"}${f.viaChiavi ? " · trovato per affinità, la parola non c'era nel testo" : ""}<br/>${f.text}
                  </div>`)}</div>`}
              ${azioneStatus[mid].perContiguita?.length > 0 && html`<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,0,0,.08)">
                <div class="r-hub-detail">Nato lo stesso giorno, anche se non c'entra:</div>
                ${azioneStatus[mid].perContiguita.map((f) => html`<div class="r-draft-body" key=${f.id} style="opacity:.75">${f.text}</div>`)}
              </div>`}
            </div>`}
            ${/* §1.3 — la proposta di percorso, con il suo pulsante. Prima non c'era: lo Shell la
                  proponeva a parole e un "ok" qualsiasi nel messaggio dopo la faceva diventare vera.
                  Ora e' un oggetto con un gesto suo, e il titolo si legge e si corregge PRIMA. */ ""}
            ${/* 23/08/2026 — LA CARD NON PUO' SPARIRE MENTRE CHIEDE QUALCOSA.
                  Osservato alle 18:38. Il Ghost ha toccato «Sì, aprilo» senza aver scritto il nome.
                  Il programma ha risposto «Dammi un nome per il percorso» — giusto — e nello stesso
                  istante ha fatto sparire la card, cioe' l'UNICO posto dove quel nome si poteva
                  scrivere: la condizione qui sotto era `!percorsoStatus[mid]`, e "serve-titolo" e'
                  uno stato come un altro. Gli restava una riga che chiedeva una cosa e nessun modo
                  di darla. Ha risposto in chat, perche' non aveva altra scelta.
                  Vale anche per l'errore: se la creazione fallisce, il Ghost deve poter ritoccare il
                  pulsante, non restare davanti a un messaggio e basta.
                  La regola generale: una card che chiede si toglie quando ha avuto risposta, mai
                  mentre sta ancora aspettando. */ ""}
            ${m.proposal?.proposed && (!percorsoStatus[mid] || percorsoStatus[mid] === "serve-titolo" || String(percorsoStatus[mid]).startsWith("errore")) && html`<div class="r-draft-card">
              <div class="r-draft-label">▸ APRO UN PERCORSO IN ${m.proposal.pillar.toUpperCase()}? — conferma prima che accada</div>
              ${percorsoStatus[mid] === "serve-titolo" && html`<div class="r-error">Dammi un nome per il percorso: senza, non lo ritroveresti più parlando. Scrivilo qui sotto e ritocca il pulsante.</div>`}
              ${String(percorsoStatus[mid] || "").startsWith("errore") && html`<div class="r-error">${percorsoStatus[mid]}. Puoi ritoccare il pulsante.</div>`}
              ${m.proposal.titoloUsabile === false
                ? html`<div class="r-hub-detail">Da quello che ho scritto non ricavo un nome sensato per questo percorso${m.proposal.titoloScartato ? ` (mi veniva "${m.proposal.titoloScartato}", che non dice niente)` : ""}. Scrivilo tu: è il nome con cui potrai richiamarlo dicendo "riprendi quello su…".</div>`
                : html`<div class="r-hub-detail">Controlla il nome: è quello con cui potrai richiamarlo dicendo "riprendi quello su…".</div>`}
              <input class="r-input" style="margin:6px 0" placeholder="nome del percorso"
                value=${percorsoTitolo[mid] ?? (m.proposal.titoloUsabile ? m.proposal.title : "")}
                onInput=${(e) => setPercorsoTitolo((s) => ({ ...s, [mid]: e.target.value }))} />
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="r-btn r-draft-copy" onClick=${() => confermaPercorso(mid, m.proposal)}>Sì, aprilo</button>
                <button class="r-btn r-btn-ghost" onClick=${() => scartaPercorso(mid)}>No grazie</button>
              </div>
            </div>`}
            ${percorsoStatus[mid] === "creando" && html`<div class="r-hub-detail">… sto preparando i primi passi del percorso</div>`}
            ${percorsoStatus[mid] === "scartato" && html`<div class="r-hub-detail">Va bene — non ho aperto niente.</div>`}
            ${m.seedSuggestion && !seedStatus[mid] && html`<div class="r-draft-card">
              <div class="r-draft-label">🌱 SEME AIR — vuoi salvare questa idea?</div>
              <div class="r-draft-body">${m.seedSuggestion.content}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="r-btn r-draft-copy" onClick=${() => confirmSeed(mid, m.seedSuggestion.content)}>Salva come Seme AIR</button>
                <button class="r-btn r-btn-ghost" onClick=${() => dismissSeed(mid)}>No grazie</button>
              </div>
            </div>`}
            <div class="r-shell-msg-footer">
              ${m.usedWebSearch && html`<span class="r-badge" style="border-color:${C.core};color:${C.core}">🌐 WEB</span>`}
              ${m.actions && m.actions.length > 0 && html`<div class="r-shell-actions">${m.actions.map((a) => html`<span class="r-badge" style="border-color:${coloreDelSegno(a)};color:${coloreDelSegno(a)}">→ ${a}</span>`)}</div>`}
              ${m.role === "assistant" && html`<button class="r-shell-speak-btn" onClick=${() => toggleSpeak(mid, m.content)} title=${speakingId === mid ? "Interrompi" : "Riascolta"}>${speakingId === mid ? "⏹" : "🔊"}</button>`}
            </div>
            ${m.anochin && html`<${AnochinTrace} trace=${m.anochin} />`}
          </div>`} />`; })}
      ${sending && html`<div class="r-shell-row assistant"><div class="r-shell-listening"><span class="r-listening-dot"></span><span class="r-listening-dot"></span><span class="r-listening-dot"></span> <span class="r-listening-text">sto leggendo tra le righe…</span></div></div>`}
      <div ref=${bottomRef}></div>
    </div>
    ${error && html`<div class="r-error">${error}</div>`}
    ${messages.length >= 2 && !docPanel && html`<button class="r-btn r-btn-ghost" style="margin:0 0 10px 0;width:100%" onClick=${openDocPanel}>Genera documento da questa conversazione</button>`}
    ${docPanel && html`<div class="r-card" style="margin-bottom:10px">
      <div class="r-hub-title" style="color:${C.core}">Documento da conversazione</div>
      ${docPhase === "idle" && html`<div>
        <div class="r-hub-detail" style="margin-top:6px">Userò gli ultimi ${CONV_WINDOW} messaggi. Genererò il documento e una bozza dei vincoli emersi, da agganciare a un percorso.</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="r-btn" style="background:${C.core}" onClick=${generateFromConversation}>Genera bozza</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Annulla</button>
        </div>
      </div>`}
      ${docPhase === "generating" && html`<div class="r-hub-detail" style="margin-top:8px">Sto formalizzando il documento e i vincoli…</div>`}
      ${(docPhase === "preview" || docPhase === "saving") && html`<div style="margin-top:8px">
        <${Field} label="Titolo file"><input class="r-input" value=${docTitle} onInput=${(e) => setDocTitle(e.target.value)} /></${Field}>
        <div class="r-hub-detail" style="margin-top:6px">Anteprima documento:</div>
        <div class="r-magi-text" style="white-space:pre-wrap;max-height:180px;overflow:auto;background:var(--surface2);padding:10px;border-radius:8px;margin-top:4px">${docText}</div>
        <div class="r-hub-detail" style="margin-top:10px">Vincoli che salverò nella memoria del percorso (modificabili):</div>
        <textarea class="r-textarea" style="margin-top:4px" value=${docSummary} onInput=${(e) => setDocSummary(e.target.value)} />
        <${Field} label="Pilastro"><select class="r-input" value=${docTargetPillar} onChange=${(e) => { setDocTargetPillar(e.target.value); setDocTargetId(""); }}>
          <option value="bio">BIO</option><option value="air">AIR</option><option value="vidya">VIDYA</option>
        </select></${Field}>
        <${Field} label="Percorso di destinazione (facoltativo)"><select class="r-input" value=${docTargetId} onChange=${(e) => setDocTargetId(e.target.value)}>
          <option value="">➕ Nuovo percorso…</option>
          ${(percorsi[docTargetPillar] || []).map((p) => html`<option value=${p.id}>${p.title}</option>`)}
        </select></${Field}>
        ${!docTargetId && html`<input class="r-input" style="margin-bottom:4px" value=${docNewTitle} onInput=${(e) => setDocNewTitle(e.target.value)} placeholder="Nome del nuovo percorso" />`}
        ${/* 30/08/2026 — prima questo era un requisito nascosto: i pulsanti sembravano attivi ma
              rifiutavano finche' non c'era un percorso, e l'unico segno era una riga grigia in
              fondo. Ora e' scritto qui, prima di premere. */ ""}
        <div class="r-hub-detail" style="margin-bottom:10px">Serve solo se vuoi ritrovare il documento dentro l'app, agganciato a un percorso. Per avere il file e basta, lascia pure vuoto e premi.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="r-btn" style="background:${C.core}" onClick=${() => confirmDoc(false)} disabled=${docPhase === "saving"}>${docPhase === "saving" ? "…" : "Scarica .docx"}</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => confirmDoc(true)} disabled=${docPhase === "saving"}>Salva su Drive</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${generateFromConversation} disabled=${docPhase === "saving"}>Rigenera</button>
          <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Chiudi</button>
        </div>
      </div>`}
      ${docPhase === "done" && html`<div style="margin-top:8px">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${() => setDocPanel(false)}>Chiudi</button>
      </div>`}
      ${docMsg && html`<div class="${docMsg.startsWith("Errore") ? "r-error" : "r-ok"}" style="margin-top:8px">${docMsg}</div>`}
    </div>`}
    ${attachment && html`<div class="r-shell-attach-preview">
      <span>${attachment.kind === "image" ? "🖼" : "📄"} ${attachment.name || "immagine"}</span>
      <button class="r-icon-btn" onClick=${() => setAttachment(null)}>✕</button>
    </div>`}
    <div class="r-shell-inputbar">
      <input ref=${fileInputRef} type="file" accept="image/*,.pdf,.txt,.md" style="display:none" onChange=${onFileChosen} />
      <button class="r-shell-attach-btn" onClick=${() => fileInputRef.current?.click()} disabled=${sending || attaching} title="Allega immagine o documento">${attaching ? "…" : "📎"}</button>
      <textarea class="r-textarea" value=${input} onInput=${(e) => setInput(e.target.value)} placeholder=${attachment ? "Aggiungi una nota (opzionale)…" : "Scrivi al tuo Shell…"} disabled=${sending} />
      <button class="r-btn" onClick=${send} disabled=${sending || attaching || (!input.trim() && !attachment)}>${sending ? "…" : "Invia"}</button>
    </div>
  </div>`;
}

//──────────────────────────────────────────────────────────
// KERNEL
//──────────────────────────────────────────────────────────
function KernelView({ kernel, onSave, driveStatus }) {
  const [draft, setDraft] = useState(kernel.content); const [showHistory, setShowHistory] = useState(false);
  useEffect(() => setDraft(kernel.content), [kernel.content]);
  const dirty = draft !== kernel.content;
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="KERNEL" subtitle="Versione V${kernel.version} — versioning atomico" />
    <${Card} accent=${C.core}>
      <textarea class="r-textarea r-kernel-textarea" value=${draft} onInput=${(e) => setDraft(e.target.value)} rows="14" />
      <div class="r-kernel-actions">
        <button class="r-btn" style=${!dirty ? "background:#E4E9EA;color:#8FA3AC" : ""} onClick=${() => dirty && onSave(draft)} disabled=${!dirty}>Salva come V${kernel.version + 1}</button>
        <button class="r-btn r-btn-ghost" onClick=${() => setShowHistory(!showHistory)}>Storico (${kernel.history.length})</button>
      </div>
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">Drive: ${driveStatus.state === "syncing" ? "sincronizzazione…" : driveStatus.state === "ok" ? `sincronizzato — conferma Drive ${driveStatus.remoteTime ? new Date(driveStatus.remoteTime).toLocaleTimeString("it-IT") : "—"}` : `errore — ${driveStatus.error}`}</div>`}
    </${Card}>
    ${showHistory && (kernel.history.length === 0 ? html`<${Empty} text="Nessuna versione precedente." />` : html`<div class="r-list">${[...kernel.history].reverse().map((h) => html`
      <${Card}><div class="r-entry-date">V${h.version} — ${fmtDate(h.date)}</div><div class="r-kernel-preview">${h.content.slice(0, 220)}${h.content.length > 220 ? "…" : ""}</div></${Card}>`)}</div>`)}
  </div>`;
}

//──────────────────────────────────────────────────────────
// SETTINGS
//──────────────────────────────────────────────────────────
// TASK 1 (BRIEF_costtracking_balthasarsources 26/07/2026) — aggregatore costi/token in Setup.
// Legge le entry type:"ai-cost" dal debug log esistente (nessun nuovo storage). LIMITE DICHIARATO:
// pushDebugLog tiene un rolling log di SOLO 50 voci totali, condivise fra TUTTI i tipi di entry (non
// solo ai-cost) — con uso attivo, "ultimi 7 giorni" in pratica mostra molto meno di 7 giorni reali,
// perché le voci più vecchie vengono scartate ben prima. Non risolto qui deliberatamente: il brief
// chiede di riusare la struttura esistente, non di crearne una parallela senza tetto.
// §12 — tetto di spesa dichiarato dal Ghost il 15/08/2026. Un tetto che non si vede non esiste
// (C.16), quindi il contatore mensile e la distanza dal tetto stanno in Setup insieme al resto.
const TETTO_MENSILE_USD = 5;
// D4 (approvata dal Ghost, 16/08/2026) — al raggiungimento del tetto si fermano SOLO le operazioni
// automatiche: Semi che avanzano da soli, Simbiosi proattiva, qualunque cosa parta senza che il
// Ghost la stia chiedendo in quel momento. La chat resta utilizzabile.
// Ragione: il tetto protegge dalle spese che il Ghost non vede partire, non da quelle che sta
// decidendo lui adesso — ed e' la lettura corretta di C.16, che governa le operazioni AUTONOME.
// Fermare la chat a meta' di una frase sarebbe protezione applicata proprio dove non serve.
function spesaDelMeseCorrente() {
  const mese = todayISO().slice(0, 7);
  return (loadKey("debug-log", []) || [])
    .filter((e) => e.type === "ai-cost" && (e.time || "").slice(0, 7) === mese)
    .reduce((a, e) => a + (typeof e.costUsd === "number" ? e.costUsd : 0), 0);
}
function operazioniAutomaticheConsentite() { return spesaDelMeseCorrente() < TETTO_MENSILE_USD; }
function CostSummaryPanel({ debugLog }) {
  const costEntries = (debugLog || []).filter((e) => e.type === "ai-cost");
  const today = todayISO();
  const now = Date.now();
  const isToday = (t) => (t || "").slice(0, 10) === today;
  const isLast7d = (t) => { const d = new Date(t).getTime(); return !isNaN(d) && now - d <= 7 * 86400000; };
  const byTag = (entries) => {
    const map = {};
    entries.forEach((e) => {
      const tag = e.functionTag || "?";
      const row = map[tag] || (map[tag] = { calls: 0, tokensTotal: 0, costUsd: 0, hasCost: false, tokensRagionamento: 0, hasRagionamento: false });
      row.calls++;
      if (typeof e.tokensTotal === "number") row.tokensTotal += e.tokensTotal;
      if (typeof e.costUsd === "number") { row.costUsd += e.costUsd; row.hasCost = true; }
      if (typeof e.tokensRagionamento === "number") { row.tokensRagionamento += e.tokensRagionamento; row.hasRagionamento = true; }
    });
    return map;
  };
  const todayEntries = costEntries.filter((e) => isToday(e.time));
  const weekEntries = costEntries.filter((e) => isLast7d(e.time));
  const weekByTag = byTag(weekEntries);
  const sumTokens = (entries) => entries.reduce((a, e) => a + (typeof e.tokensTotal === "number" ? e.tokensTotal : 0), 0);
  const sumCost = (entries) => entries.reduce((a, e) => a + (typeof e.costUsd === "number" ? e.costUsd : 0), 0);
  // 26/08/2026 (quick win #3 dell'audit "Motoko") — prima questo campo esisteva solo nel JSON
  // esportato: per vederlo il Ghost doveva esportare il log e mandarmelo. Il mistero che l'ha fatto
  // aggiungere (889 token di ragionamento su 975 totali, per una risposta di poche righe) va visto
  // qui, subito, senza quel giro.
  const sumRagionamento = (entries) => entries.reduce((a, e) => a + (typeof e.tokensRagionamento === "number" ? e.tokensRagionamento : 0), 0);
  const anyRagionamentoToday = todayEntries.some((e) => typeof e.tokensRagionamento === "number");
  const anyRagionamentoWeek = weekEntries.some((e) => typeof e.tokensRagionamento === "number");
  // Spesa del mese in corso e distanza dal tetto. Limite dichiarato apertamente: il registro di
  // debug tiene 50 voci a rotazione, quindi con molto uso il totale mensile e' un MINIMO osservato,
  // non la spesa reale. Dirlo e' meglio di mostrare un numero che si crede completo.
  const meseCorrente = today.slice(0, 7);
  const meseEntries = costEntries.filter((e) => (e.time || "").slice(0, 7) === meseCorrente);
  const spesaMese = meseEntries.reduce((a, e) => a + (typeof e.costUsd === "number" ? e.costUsd : 0), 0);
  const quotaTetto = Math.min(100, Math.round((spesaMese / TETTO_MENSILE_USD) * 100));
  const anyCostToday = todayEntries.some((e) => typeof e.costUsd === "number");
  const anyCostWeek = weekEntries.some((e) => typeof e.costUsd === "number");
  return html`<${Card} accent=${C.core}>
    <div class="r-hub-title" style="color:#3A4750">Costi/token IA</div>
    <div class="r-hub-detail">Solo le chiamate tracciate: Shell, Magi per intero (Balthasar, Melchior, Caspar, sintesi finale e — se la perturbazione è mirata a un pilastro — la riscrittura della sua memoria), Agente AIR, ricerca web on-demand, Seme (ricerca/esecuzione). Non include refresh pagina, login Google o sync Drive — non toccano mai un modello.</div>
    <div class="r-hub-detail" style="margin-top:10px">
      <b>Questo mese</b>: $${spesaMese.toFixed(4)} su un tetto di $${TETTO_MENSILE_USD} (${quotaTetto}%).
      ${quotaTetto >= 80 ? html`<span style="color:#B4553A"> — ci sei quasi.</span>` : ""}
      <br/><span style="opacity:.7">È un minimo osservato, non la spesa certa: il registro tiene le ultime 50 voci, quindi le più vecchie del mese possono esserne già uscite.</span>
    </div>
    ${costEntries.length === 0 ? html`<div class="r-hub-detail" style="margin-top:8px">Nessuna chiamata tracciata ancora nel log (max 50 voci totali, condivise con tutti gli eventi di debug).</div>` : html`
      <div class="r-hub-detail" style="margin-top:10px"><b>Oggi</b>: ${todayEntries.length} chiamate · ${sumTokens(todayEntries)} token (di cui ${anyRagionamentoToday ? sumRagionamento(todayEntries) : "n/d"} di ragionamento) · ${anyCostToday ? `$${sumCost(todayEntries).toFixed(4)}` : "costo non disponibile (OpenRouter non lo ha restituito)"}</div>
      <div class="r-hub-detail" style="margin-top:4px"><b>Ultimi 7 giorni</b> (entro il tetto di 50 voci del log): ${weekEntries.length} chiamate · ${sumTokens(weekEntries)} token (di cui ${anyRagionamentoWeek ? sumRagionamento(weekEntries) : "n/d"} di ragionamento) · ${anyCostWeek ? `$${sumCost(weekEntries).toFixed(4)}` : "costo non disponibile (OpenRouter non lo ha restituito)"}</div>
      <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="text-align:left;opacity:.6"><th>Funzione</th><th>Chiamate</th><th>Token</th><th>Ragionamento</th><th>Costo</th></tr></thead>
        <tbody>
          ${Object.entries(weekByTag).map(([tag, row]) => html`<tr key=${tag} style="border-top:1px solid var(--border)">
            <td style="padding:4px 0">${tag}</td><td>${row.calls}</td><td>${row.tokensTotal || "—"}</td><td>${row.hasRagionamento ? row.tokensRagionamento : "n/d"}</td><td>${row.hasCost ? `$${row.costUsd.toFixed(4)}` : "n/d"}</td>
          </tr>`)}
        </tbody>
      </table>
    `}
  </${Card}>`;
}
function SettingsView({ settings, updateSettings, driveStatus, debugLog, clearDebugLog, pullAndMergeOnce, ghostProfile, saveGhostProfile }) {
  // FASE 2 (BRIEF_blocco1 12/08/2026, C.9) — chiude il gap per cui ghostProfile era scrivibile una
  // sola volta: OnboardingView (e quindi saveGhostProfile) era raggiungibile SOLO quando ghostProfile
  // era ancora null (vedi condizione di render in App). I vincoli sono dichiarati dal Ghost (C.9):
  // deve poterli rieditare in qualunque momento, non solo al primo avvio. saveGhostProfile fa già
  // sostituzione integrale (mai append, verificato in Fase 1) — qui costruiamo l'array hardConstraints
  // aggiornato per intero e lo passiamo così com'è: una modifica sostituisce, non accumula.
  const hardConstraints = Array.isArray(ghostProfile?.hardConstraints) ? ghostProfile.hardConstraints : [];
  const [newConstraintText, setNewConstraintText] = useState("");
  const [newConstraintPillar, setNewConstraintPillar] = useState("bio");
  const [editProfessional, setEditProfessional] = useState(!!ghostProfile?.hasProfessionalConstraint);
  const [editProfessionalIdentity, setEditProfessionalIdentity] = useState(ghostProfile?.professionalIdentity || "");
  const addConstraint = () => {
    if (!newConstraintText.trim() || !ghostProfile) return;
    const next = [...hardConstraints, { id: uid(), testo: newConstraintText.trim(), pilastro: newConstraintPillar, dataDichiarazione: todayISO() }];
    saveGhostProfile({ ...ghostProfile, hardConstraints: next });
    setNewConstraintText("");
  };
  const removeConstraint = (id) => {
    if (!ghostProfile) return;
    saveGhostProfile({ ...ghostProfile, hardConstraints: hardConstraints.filter((c) => c.id !== id) });
  };
  // Il record G.1 (tipo:"identita-professionale") è sempre AL MASSIMO uno: salvare qui lo sostituisce
  // per intero (o lo rimuove, se il checkbox torna disattivato) — mai un secondo record accumulato.
  const saveProfessionalConstraint = () => {
    if (!ghostProfile) return;
    const withoutG1 = hardConstraints.filter((c) => c.tipo !== "identita-professionale");
    const next = editProfessional && editProfessionalIdentity.trim()
      ? [...withoutG1, { id: "g1", tipo: "identita-professionale", pilastro: "air", dataDichiarazione: todayISO(), identita: editProfessionalIdentity.trim(), testo: `mai esporre l'identità professionale (${editProfessionalIdentity.trim()}) con il pilastro AIR, in nessuna forma di output — vincolo reputazionale, non negoziabile` }]
      : withoutG1;
    saveGhostProfile({ ...ghostProfile, hardConstraints: next });
  };
  const presetIds = MODEL_OPTIONS.filter((m) => m.id !== "custom").map((m) => m.id);
  const isCustom = !presetIds.includes(settings.model);
  const [driveMsg, setDriveMsg] = useState(""); const [connecting, setConnecting] = useState(false);
  const clientIdReady = CONFIG.GOOGLE_CLIENT_ID && !CONFIG.GOOGLE_CLIENT_ID.startsWith("INCOLLA");
  const feedbackReady = CONFIG.FEEDBACK_EMAIL && !CONFIG.FEEDBACK_EMAIL.startsWith("INCOLLA");
  const testConnect = async () => { setConnecting(true); setDriveMsg("");
    try { await connectDrive(); setDriveMsg("Connesso — puoi attivare la sincronizzazione."); } catch (e) { setDriveMsg("Errore: " + e.message); } finally { setConnecting(false); } };
  const [logSyncMsg, setLogSyncMsg] = useState(""); const [logSyncing, setLogSyncing] = useState(false);
  const exportDebugLog = () => {
    const blob = new Blob([JSON.stringify(debugLog, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `resonance-debug-log-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const syncDebugLogToDrive = async () => {
    setLogSyncing(true); setLogSyncMsg("");
    try { await createDriveFile(`00_DEBUG_LOG_${todayISO()}.json`, JSON.stringify(debugLog, null, 2)); setLogSyncMsg("Sincronizzato su Drive."); }
    catch (e) { setLogSyncMsg("Errore: " + e.message); } finally { setLogSyncing(false); }
  };
  const [jsonFailures, setJsonFailures] = useState(() => loadKey("json-parse-failures", []));
  const refreshJsonFailures = () => setJsonFailures(loadKey("json-parse-failures", []));
  const clearJsonFailures = () => { saveKey("json-parse-failures", []); setJsonFailures([]); };
  const exportJsonFailures = () => {
    const blob = new Blob([JSON.stringify(jsonFailures, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `resonance-json-failures-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  // BLOCCO 1 §2.5 — interruttori per capacita'. Il ripristino protegge dal codice ROTTO, non da
  // quello che funziona male, ed e' tutto-o-niente: se otto capacita' su dieci vanno e due no,
  // tornare indietro butta via anche le otto. Qui si spegne la singola capacita', senza deploy.
  const [interruttori, setInterruttoriState] = useState(() => leggiInterruttori());
  const cambiaInterruttore = (id, accesa) => setInterruttoriState(scriviInterruttore(id, accesa));
  const [modelloCapace, setModelloCapaceState] = useState(() => usaModelloCapacePerSelezione());
  const cambiaModelloCapace = (v) => setModelloCapaceState(impostaModelloCapacePerSelezione(v));
  const [registroAzioni, setRegistroAzioni] = useState(() => loadKey("registro-azioni", []));
  const svuotaRegistroAzioni = () => { saveKey("registro-azioni", []); setRegistroAzioni([]); };
  const [chiamateGrezze, setChiamateGrezze] = useState(() => leggiChiamateGrezze());
  const svuotaChiamateGrezze = () => { saveKey(ULTIME_CHIAMATE_KEY, []); setChiamateGrezze([]); };
  // FASE 2 — interruttore della modalità "prova a vuoto" degli effettori.
  const [provaAVuoto, setProvaAVuotoState] = useState(() => isProvaAVuoto());
  const cambiaProvaAVuoto = (attiva) => { setProvaAVuoto(attiva); setProvaAVuotoState(attiva); };
  // COMPITO A.4 — backup completo dei DATI (il codice lo protegge git, i dati no).
  const [backupMsg, setBackupMsg] = useState("");
  const [ripristinoInCorso, setRipristinoInCorso] = useState(false);
  const scaricaBackup = () => {
    try {
      const backup = buildFullBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `resonance-backup-${todayISO()}.json`; a.click();
      URL.revokeObjectURL(url);
      setBackupMsg(`Backup scaricato: ${backup._chiavi} voci salvate.${backup._apiKeyOmessa ? " La chiave API non è stata inclusa (di proposito) — dopo un ripristino va rimessa a mano." : ""}`);
    } catch (e) { setBackupMsg("Errore durante il backup: " + e.message); }
  };
  // Il ripristino sovrascrive TUTTI i dati locali: passa da una conferma esplicita, e ricarica
  // subito dopo — senza reload l'app resterebbe a schermo con i dati vecchi in memoria mentre
  // localStorage ne ha già di nuovi, cioè lo stato più confuso possibile.
  const caricaBackup = (file) => {
    if (!file) return;
    setRipristinoInCorso(true); setBackupMsg("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        const quando = backup?._creato ? new Date(backup._creato).toLocaleString("it-IT") : "data sconosciuta";
        if (!confirm(`Stai per sostituire TUTTI i dati di questo dispositivo con quelli del backup del ${quando}.\n\nQuello che c'è ora su questo telefono/computer viene perso, a meno che tu non ne abbia fatto un backup poco fa.\n\nProcedo?`)) {
          setRipristinoInCorso(false); setBackupMsg("Ripristino annullato — non è stato toccato nulla."); return;
        }
        const esito = restoreFullBackup(backup);
        if (!esito.ok && !esito.scritte) { setRipristinoInCorso(false); setBackupMsg("Ripristino non riuscito: " + (esito.errore || `non sono state scritte ${esito.fallite?.length || 0} voci`)); return; }
        setBackupMsg(`Ripristinate ${esito.scritte} voci. Ricarico l'app…`);
        setTimeout(() => location.reload(), 1200);
      } catch (e) { setRipristinoInCorso(false); setBackupMsg("Il file non è leggibile come backup: " + e.message); }
    };
    reader.onerror = () => { setRipristinoInCorso(false); setBackupMsg("Non sono riuscito a leggere il file."); };
    reader.readAsText(file);
  };
  return html`<div class="r-screen">
    <${SectionHeader} color=${C.core} title="SETUP" subtitle="Motore AI e sincronizzazione Drive" />
    <${Card} accent=${C.core}>
      <${Field} label="Motore AI">
        <select class="r-input" value=${settings.provider} onInput=${(e) => updateSettings({ provider: e.target.value })}>
          <option value="openrouter">OpenRouter (Gemini / Kimi / DeepSeek / Llama / Claude / altro)</option>
          <option value="claude-direct">Claude — API diretta (sperimentale)</option>
        </select>
      </${Field}>
      <${Field} label="Chiave API"><input type="password" class="r-input" value=${settings.apiKey} onInput=${(e) => updateSettings({ apiKey: e.target.value })} placeholder=${settings.provider === "openrouter" ? "sk-or-..." : "sk-ant-..."} /></${Field}>
      ${settings.provider === "openrouter" && html`
        <${Field} label="Modello">
          <select class="r-input" value=${isCustom ? "custom" : settings.model} onInput=${(e) => updateSettings({ model: e.target.value === "custom" ? "" : e.target.value })}>
            ${MODEL_OPTIONS.map((m) => html`<option value=${m.id}>${m.label}</option>`)}
          </select>
        </${Field}>
        ${isCustom && html`<${Field} label="Slug personalizzato"><input class="r-input" value=${settings.model} onInput=${(e) => updateSettings({ model: e.target.value })} placeholder="es. z-ai/glm-5.2" /></${Field}>`}
      `}
      <div class="r-hub-detail">La chiave resta solo su questo dispositivo (localStorage).</div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Vincoli dichiarati</div>
      <div class="r-hub-detail">Ogni vincolo è un'istanza dichiarata da te, rieditabile in qualunque momento — non più cablata nel codice. Aggiungerne o toglierne uno sostituisce lo stato salvato, non lo accumula.</div>
      ${hardConstraints.filter((c) => c.tipo !== "identita-professionale").length === 0 && html`<div class="r-hub-detail" style="margin-top:8px">Nessun vincolo dichiarato.</div>`}
      ${/* 31/08/2026 — LO SCARTO FRA "L'HO DICHIARATO" E "IL PROGRAMMA L'HA CAPITO".
            Il Ghost ha aggiunto l'esclusione delle zucchine e se l'e' vista comparire qui: da fuori
            sembrava attiva. Ma il filtro che la fa rispettare agisce su cio' che riesce a
            INTERPRETARE, non sul testo grezzo — e misurando dodici modi plausibili di scrivere la
            stessa cosa, cinque non producevano niente ("zucchine" scritto da solo fra questi).
            Un vincolo che c'e' nell'elenco ma non ha effetto e' peggio di un vincolo che manca:
            produce fiducia dove non c'e' copertura. Quindi qui si mostra cosa il programma ha
            capito davvero, vincolo per vincolo, e soprattutto quando non ha capito niente. */ ""}
      ${hardConstraints.filter((c) => c.tipo !== "identita-professionale").map((c) => {
        const alimentare = eVincoloAlimentare(c);
        const esclusi = alimentare ? alimentiEsclusiDaiVincoli([c.testo]) : [];
        return html`<div class="r-settings-row" key=${c.id}>
          <div>
            <div><b>[${c.pilastro || "generale"}${c.ambito ? ` · ${c.ambito}` : ""}]</b> ${c.testo}</div>
            ${alimentare && html`<div class="r-hub-detail" style="margin-top:2px">${esclusi.length
              ? `Capito come esclusione di: ${esclusi.slice(0, 6).join(", ")}${esclusi.length > 6 ? ` e altri ${esclusi.length - 6}` : ""}. Nei piani non compariranno.`
              : "Non ci leggo nessuna esclusione: lo Shell lo riceve come testo, ma il filtro automatico dei piani non lo fa rispettare. Se volevi escludere qualcosa, scrivilo come «niente X» o «escludi X»."}</div>`}
          </div>
          <button class="r-btn-ghost" onClick=${() => removeConstraint(c.id)}>Rimuovi</button>
        </div>`;
      })}
      <div class="r-settings-row" style="margin-top:10px; gap:8px; flex-wrap:wrap;">
        <select class="r-input" style="flex:0 0 auto" value=${newConstraintPillar} onInput=${(e) => setNewConstraintPillar(e.target.value)}>
          <option value="bio">BIO</option><option value="air">AIR</option><option value="vidya">VIDYA</option>
        </select>
        <input class="r-input" style="flex:1" value=${newConstraintText} onInput=${(e) => setNewConstraintText(e.target.value)} placeholder="Nuovo vincolo..." />
        <button class="r-btn" onClick=${addConstraint}>Aggiungi</button>
      </div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Identità professionale/reputazionale</div>
      <div class="r-hub-detail">L'unico vincolo hard-stop del sistema — mai esposto in output AIR quando attivo. Sempre da confermare tu, mai solo dedotto.</div>
      <div class="r-settings-row" style="margin-top:10px">
        <span>Hai un'identità professionale/pubblica da tenere separata dal pilastro AIR?</span>
        <input type="checkbox" checked=${editProfessional} onInput=${(e) => setEditProfessional(e.target.checked)} />
      </div>
      ${editProfessional && html`<${Field} label="Descrivila brevemente — non verrà mai esposta in output AIR">
        <input class="r-input" value=${editProfessionalIdentity} onInput=${(e) => setEditProfessionalIdentity(e.target.value)} placeholder="es. fisioterapista, Studio Rossi" />
      </${Field}>`}
      <button class="r-btn" style="margin-top:10px" onClick=${saveProfessionalConstraint}>Salva</button>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Braccia — Bozze pronte</div>
        <div class="r-hub-detail">Lo Shell prepara email/messaggi/script pronti da copiare — non li invia mai da solo</div></div>
        <input type="checkbox" checked=${settings.armsDraftsEnabled} onInput=${(e) => updateSettings({ armsDraftsEnabled: e.target.checked })} /></div>
    </${Card}>
    ${/* L'interruttore "Braccio — Calendar" e' stato tolto il 16/08/2026. Era il secondo comando
          del calendario, acceso di fabbrica, e scavalcava quello di Classe B consegnato spento:
          due interruttori per la stessa cosa, uno dei quali il Ghost non sapeva di avere acceso.
          Ne resta uno solo, qui sopra, nell'elenco delle azioni. */ ""}
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Lettura vocale dello Shell</div>
        <div class="r-hub-detail">Legge automaticamente ogni risposta (voce del browser, gratuita)</div></div>
        <input type="checkbox" checked=${settings.voiceEnabled} onInput=${(e) => updateSettings({ voiceEnabled: e.target.checked })} /></div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Sincronizzazione tra dispositivi</div>
        <div class="r-hub-detail">Unisce i log tra i tuoi dispositivi (nessuna voce va persa); l'ultima modifica vince solo su chat/memoria/kernel/simbiosi. Lo stato qui sotto è letto dalla risposta reale di Drive, non presunto.</div></div>
        <input type="checkbox" checked=${settings.driveSyncEnabled} disabled=${!clientIdReady} onInput=${(e) => updateSettings({ driveSyncEnabled: e.target.checked })} /></div>
      ${!clientIdReady && html`<div class="r-hub-detail" style="margin-top:8px">Manca il Client ID Google in config.js — vedi README.md.</div>`}
      ${clientIdReady && html`<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${testConnect} disabled=${connecting}>${connecting ? "Connessione…" : "Testa connessione Drive"}</button>
        ${settings.driveSyncEnabled && html`<button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${pullAndMergeOnce} disabled=${driveStatus.state === "syncing"}>${driveStatus.state === "syncing" ? "Sincronizzo…" : "Sincronizza ora"}</button>`}
      </div>
        ${driveMsg && html`<div class="r-hub-detail" style="margin-top:6px">${driveMsg}</div>`}`}
      ${driveStatus.time && html`<div class="r-hub-detail" style="margin-top:8px">
        Ultima sincronizzazione: ${new Date(driveStatus.time).toLocaleTimeString("it-IT")} — ${driveStatus.state === "ok" ? "riuscita" : driveStatus.state === "syncing" ? "in corso…" : `errore: ${driveStatus.error}`}
        ${driveStatus.state === "ok" && driveStatus.remoteTime && html`<br/>Conferma da Drive — file modificato: ${new Date(driveStatus.remoteTime).toLocaleString("it-IT")}`}
      </div>`}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Feedback</div>
      <div class="r-hub-detail">Il pulsante "Segnala" (in alto a destra, in ogni schermata) manda un'email diretta via Gmail — nessuna cartella o condivisione da configurare, nessun servizio terzo. Richiede lo stesso login Google già usato per la sincronizzazione.</div>
      ${!feedbackReady && html`<div class="r-hub-detail" style="margin-top:8px">Manca FEEDBACK_EMAIL in config.js — vedi README.md.</div>`}
      ${feedbackReady && html`<div class="r-hub-detail" style="margin-top:8px">Configurato — le segnalazioni arrivano a ${CONFIG.FEEDBACK_EMAIL} via Gmail (stesso account Google del login).</div>`}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Cosa lo Shell può fare parlando</div>
      <div class="r-hub-detail">Ogni capacità si spegne da sola, senza toccare le altre e senza aspettare un rilascio. Se una si comporta male, spegni quella e il resto continua a funzionare.</div>
      <div class="r-settings-row" style="margin-top:12px">
        <div><div style="font-weight:600;font-size:13px">Modello più accurato per capire cosa vuoi</div>
        <div class="r-hub-detail">Misurato il 16/08: con le cinque azioni di oggi il modello normale ci azzecca 18 volte su 18, esattamente come quello caro, che però costa 35 volte tanto. Tienilo spento finché le azioni non diventano molte di più.</div></div>
        <input type="checkbox" checked=${modelloCapace} onInput=${(e) => cambiaModelloCapace(e.target.checked)} />
      </div>
      ${/* BLOCCO 3 — le capacita' che toccano il mondo esterno (Classe B) sono marcate come tali e
            nascono spente: chi legge questa schermata deve vedere a colpo d'occhio quali restano
            dentro l'app e quali escono. */ ""}
      ${AZIONI_CONVERSAZIONALI.map((a) => html`<div class="r-settings-row" key=${a.id} style="margin-top:10px">
        <div><div style="font-weight:600;font-size:13px">${a.etichetta}${a.classe === "B" ? " — esce fuori dall'app" : ""}</div>
        <div class="r-hub-detail">${a.reversibile ? "Reversibile — si annulla subito." : "Non reversibile — passa sempre da una conferma."}${a.classe === "B" ? " Nasce spenta: accendila tu quando la vuoi. Prima di ogni esecuzione ti mostro cosa sta per uscire, e dopo torno a controllare alla fonte che sia davvero successo." : ""}</div></div>
        <input type="checkbox" checked=${interruttori[a.id]} onInput=${(e) => cambiaInterruttore(a.id, e.target.checked)} />
      </div>`)}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Registro delle azioni — ${registroAzioni.length} voci</div>
      <div class="r-hub-detail">Cosa è stato proposto, cosa hai confermato, cosa è stato eseguito, con l'orario. Serve a capire dopo perché una cosa è andata storta, invece di ricostruirla a memoria.</div>
      ${registroAzioni.length === 0
        ? html`<div class="r-hub-detail" style="margin-top:8px">Nessuna azione ancora.</div>`
        : html`<div style="margin-top:8px">${registroAzioni.slice(0, 12).map((v, i) => html`<div class="r-hub-detail" key=${i} style="margin-top:4px">
            ${new Date(v.quando).toLocaleString("it-IT")} — <b>${v.fase}</b> · ${v.azioneId}${v.etichetta ? ` · ${v.etichetta}` : ""}${v.esitoRicerca ? ` · ricerca: ${v.esitoRicerca}` : ""}${v.motivo ? ` · ${v.motivo}` : ""}
          </div>`)}</div>`}
      ${registroAzioni.length > 0 && html`<button class="r-btn r-btn-ghost" style="margin-left:0;margin-top:10px" onClick=${svuotaRegistroAzioni}>Svuota registro</button>`}
    </${Card}>
    ${/* 17/08/2026 — LA SUPERFICIE DIAGNOSTICA. Il Ghost ha dovuto scoprire da uno screenshot del
          suo calendario che il sistema aveva mentito, perche' non aveva nessun modo di vedere cosa
          fosse successo sulla rete. Qui c'e' l'esito grezzo delle ultime chiamate verso Google:
          non una frase raccontata, il fatto. Il testo e' selezionabile tutto in un tocco, cosi'
          puo' copiarlo e mandarmelo. */ ""}
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Ultime chiamate verso Google — ${chiamateGrezze.length}</div>
      <div class="r-hub-detail">Cosa è davvero successo sulla rete, senza filtri: l'indirizzo, il codice di risposta, l'identificativo che Google ha restituito, l'errore se c'è stato. Se una cosa non torna, tocca un riquadro per selezionarlo e mandamelo così com'è — è un fatto, non un'impressione.</div>
      ${chiamateGrezze.length === 0
        ? html`<div class="r-hub-detail" style="margin-top:8px">Nessuna chiamata verso Google ancora.</div>`
        : html`<div style="margin-top:8px">${chiamateGrezze.slice(0, 8).map((c, i) => html`<div key=${i}>
            <div class="r-hub-detail" style="margin-top:8px"><b>${c.etichetta}</b>${c.errore ? " — non riuscita" : " — riuscita"}</div>
            <div class="r-grezzo">${formatChiamataGrezza(c)}</div>
          </div>`)}</div>`}
      ${chiamateGrezze.length > 0 && html`<button class="r-btn r-btn-ghost" style="margin-left:0;margin-top:10px" onClick=${svuotaChiamateGrezze}>Svuota</button>`}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-settings-row"><div><div class="r-hub-title" style="color:#3A4750">Prova a vuoto</div>
        <div class="r-hub-detail">Quando è accesa, i Semi percorrono tutta la catena — cercare il prodotto nel catalogo, crearlo, pubblicarlo — ma nessuna chiamata parte davvero. Al posto del risultato vero ti viene mostrato, per intero, cosa sarebbe partito. Serve a controllare che il giro funzioni prima di far uscire qualcosa nel mondo, a costo zero.</div></div>
        <input type="checkbox" checked=${provaAVuoto} onInput=${(e) => cambiaProvaAVuoto(e.target.checked)} /></div>
      ${provaAVuoto && html`<div class="r-hub-detail" style="margin-top:8px"><b>Accesa.</b> Finché resta accesa non verrà creato né pubblicato niente di reale, nemmeno se confermi un'azione bloccata dal gate.</div>`}
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Backup e ripristino dei dati</div>
      <div class="r-hub-detail">Salva in un unico file tutto quello che questa app sa di te: log dei tre pilastri, percorsi, memoria, semi, kernel, profilo, impostazioni. Serve perché il codice è già al sicuro su GitHub, i tuoi dati no. Tienilo dove tieni le cose che non vuoi perdere.</div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${scaricaBackup}>Scarica backup completo</button>
        <label class="r-btn r-btn-ghost" style="margin-left:0; cursor:pointer">
          Ripristina da backup
          <input type="file" accept="application/json,.json" style="display:none" disabled=${ripristinoInCorso}
            onChange=${(e) => { caricaBackup(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>
      ${backupMsg && html`<div class="r-hub-detail" style="margin-top:8px">${backupMsg}</div>`}
      <div class="r-hub-detail" style="margin-top:8px">Il ripristino sostituisce i dati di questo dispositivo con quelli del file, e poi ricarica l'app. Ti viene chiesta conferma prima. La chiave API non finisce mai dentro il file di backup — così puoi mandartelo via mail senza pensieri — quindi dopo un ripristino va rimessa qui sopra.</div>
    </${Card}>
    <${CostSummaryPanel} debugLog=${debugLog} />
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Log di debug — ${debugLog?.length || 0} eventi registrati</div>
      <div class="r-hub-detail">Turni dello Shell ed eventi di sincronizzazione (modello, esito, errori) — per capire cosa è successo senza screenshot</div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn" onClick=${exportDebugLog} disabled=${!debugLog?.length}>Esporta (.json)</button>
        ${clientIdReady && html`<button class="r-btn r-btn-ghost" onClick=${syncDebugLogToDrive} disabled=${logSyncing || !debugLog?.length}>${logSyncing ? "Sincronizzo…" : "Sincronizza su Drive"}</button>`}
        <button class="r-btn r-btn-ghost" onClick=${clearDebugLog} disabled=${!debugLog?.length}>Svuota</button>
      </div>
      ${logSyncMsg && html`<div class="r-hub-detail" style="margin-top:6px">${logSyncMsg}</div>`}
      <div class="r-hub-detail" style="margin-top:10px">Build: ${APP_BUILD}</div>
    </${Card}>
    <${Card} accent=${C.core}>
      <div class="r-hub-title" style="color:#3A4750">Diagnostica JSON — ${jsonFailures.length} fallimenti recenti</div>
      <div class="r-hub-detail">Quando un modello (es. Llama, Kimi) risponde con un JSON non interpretabile nonostante l'istruzione, la risposta grezza viene salvata qui — utile per capire il motivo esatto invece di indovinare correzioni.</div>
      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="r-btn r-btn-ghost" style="margin-left:0" onClick=${refreshJsonFailures}>Aggiorna</button>
        <button class="r-btn" onClick=${exportJsonFailures} disabled=${!jsonFailures.length}>Esporta (.json)</button>
        <button class="r-btn r-btn-ghost" onClick=${clearJsonFailures} disabled=${!jsonFailures.length}>Svuota</button>
      </div>
      ${jsonFailures.length > 0 && html`<div class="r-list" style="margin-top:10px">${jsonFailures.slice(0, 3).map((f) => html`
        <${Card}><div class="r-entry-date">${new Date(f.time).toLocaleString("it-IT")} · ${f.model}</div>
          <div class="r-kernel-preview">${f.raw}</div></${Card}>`)}</div>`}
    </${Card}>
  </div>`;
}

//──────────────────────────────────────────────────────────
// ROOT
//──────────────────────────────────────────────────────────
const TABS = [
  { key: "hub", label: "Hub" }, { key: "shell", label: "Shell" }, { key: "bio", label: "Bio" }, { key: "air", label: "Air" },
  { key: "vidya", label: "Vidya" }, { key: "magi", label: "Magi" }, { key: "simbiosi", label: "Adam" },
  { key: "kernel", label: "Kernel" }, { key: "settings", label: "Setup" },
];
function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(" ");
}
function HexTexture() {
  const r = 15, rows = 14, cols = 10;
  const hexes = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) hexes.push({ x: col * r * 1.73 + (row % 2 ? r * 0.87 : 0), y: row * r * 1.5, k: (row * cols + col) % 5 });
  const palette = [C.core, C.air, C.vidya, C.bio, "#C9D9DC"];
  return html`<svg class="r-hex-texture" viewBox="0 0 480 ${rows * r * 1.5}" preserveAspectRatio="xMidYMin slice">
    ${hexes.map((h, i) => html`<polygon points=${hexPoints(h.x, h.y, r * 0.98)} fill="none" stroke=${palette[h.k]} stroke-width="0.6" style="animation-delay:${(i % 7) * 0.3}s" />`)}
  </svg>`;
}
// Onboarding Fase 0 — questionario a 11 domande/4 blocchi, sequenza clinica (leggero→sensibile),
// design chiuso col Ghost il 20/07/2026. Deliberatamente grezzo (Sez 0 Manifesto: l'architettura è
// universale, il profilo che la abita va ricalibrato per ogni Ghost, non riusato) — Simbiosi lo
// affina nel tempo (criterio "seconda pelle"), questo è solo il seme.
// Chiamata AI unificata post-questionario (one-shot): fa insieme (a) classificazione multi-pilastro
// dei vincoli grezzi con confidence/reasoning — mai scrittura silenziosa, l'output è una PROPOSTA
// mostrata in conferma prima di consolidare (Legge 8) — e (b) distress check sul testo libero, soglia
// conservativa, mai etichetta clinica, solo istruzione operativa. Usa lo stesso `settings`/modello già
// configurato per l'uso di produzione (non un worker economico): dato sensibile, non delegabile.
async function classifyOnboardingProfile(answers, settings) {
  const system = `Sei un classificatore per il sistema Resonance. Ricevi le risposte grezze di un questionario di onboarding e produci SOLO JSON secondo lo schema indicato, nessun testo prima o dopo.
Compiti:
(1) Per ogni voce di "vincoliGrezzi", classificala in quali pilastri ricade (bio/air/vidya — anche più di uno insieme, coerente con la Lente Integrata: una voce può toccare più pilastri), con un campo confidence ("alta"/"media"/"bassa") e un breve reasoning. Se una voce segnala un'identità professionale/pubblica/reputazionale da tenere separata dal pilastro AIR, imposta anche hasProfessionalConstraint=true e professionalIdentity con un riassunto breve di quella voce (es. "fisioterapista, Studio X"). Se nessuna voce lo indica, hasProfessionalConstraint=false e professionalIdentity="".
(2) Valuta SOLO il testo libero fornito (motivazione/contesto/richiesta) per segnali di distress reale — non semplice difficoltà quotidiana. Soglia CONSERVATIVA: in caso di dubbio, segnala (un falso positivo è accettabile, un falso negativo no). NON produrre MAI un'etichetta clinica o una diagnosi — solo un giudizio operativo binario, una motivazione breve non clinica, e un'azione consigliata in stile "escludi da pool Balthasar, mantieni come contesto passivo Shell/Simbiosi". Se un campo è vuoto o dice "preferisco non rispondere", NON è un'anomalia: è una scelta esplicita, tratta come flagged=false per quel campo.
Rispondi SOLO con questo JSON, nessun altro testo:
{"hardConstraintsClassified":[{"text":"...","pillars":["bio"],"confidence":"alta","reasoning":"..."}],"hasProfessionalConstraint":false,"professionalIdentity":"","distressCheck":{"flagged":false,"field":null,"reasoning":null,"action":null}}`;
  const userText = `Vincoli grezzi (uno per riga):\n${(answers.rawConstraints || []).map((x) => `- ${x}`).join("\n") || "(nessuno indicato)"}\n\nTesto libero — motivazione: ${answers.motivation || "(preferisco non rispondere)"}\nTesto libero — contesto: ${answers.context || "(preferisco non rispondere)"}\nTesto libero — richiesta: ${answers.request || "(preferisco non rispondere)"}`;
  return askModelJSON(system, userText, 0.2, 1400, settings);
}
const SKIP_TEXT = "preferisco non rispondere";
function SkippableField({ label, value, onChange, placeholder, textarea, hint, maxLength }) {
  const skipped = value === SKIP_TEXT;
  const Field = textarea ? "textarea" : "input";
  return html`<label class="r-field">
    <span>${label}</span>
    ${hint && html`<small style="opacity:.7">${hint}</small>`}
    <${Field} class=${textarea ? "r-textarea" : "r-input"} value=${skipped ? "" : value} disabled=${skipped} maxLength=${maxLength}
      onInput=${(e) => onChange(e.target.value)} placeholder=${skipped ? SKIP_TEXT : placeholder} />
    <button type="button" class="r-btn-ghost" style="margin-top:4px;font-size:12px"
      onClick=${() => onChange(skipped ? "" : SKIP_TEXT)}>${skipped ? "Annulla" : "Preferisco non rispondere"}</button>
  </label>`;
}
function OnboardingView({ onComplete, settings, driveRecovery, onRecoverFromDrive }) {
  const [step, setStep] = useState("form"); // form → processing → confirm
  const [error, setError] = useState("");
  // Blocco 1 — Come ti muovi (cognitiveStyle)
  const [name, setName] = useState("");
  const [channelList, setChannelList] = useState([]); // multi-select: array di "visivo"/"uditivo"/"pratico"
  const [density, setDensity] = useState("densa");
  const [dialectic, setDialectic] = useState(true);
  const [reasoningStyle, setReasoningStyle] = useState("misto");
  const toggleChannel = (val) => setChannelList((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);
  // Blocco 2 — Cosa non si tocca (hardConstraints)
  const [rawConstraintsText, setRawConstraintsText] = useState("");
  const [timeRhythm, setTimeRhythm] = useState("");
  const [priority, setPriority] = useState("");
  // Blocco 3 — Salute (+ domanda di risorsa in chiusura blocco)
  const [medical, setMedical] = useState("");
  const [bodyMindConcern, setBodyMindConcern] = useState("");
  const [familyHistory, setFamilyHistory] = useState("");
  const [strengthAbility, setStrengthAbility] = useState("");
  // Blocco 4 — Il resto (freeform)
  const [motivation, setMotivation] = useState("");
  const [context, setContext] = useState("");
  const [request, setRequest] = useState("");
  // Esito della chiamata AI unificata — editabile prima di confermare (Legge 8)
  const [classification, setClassification] = useState(null);
  // Hard-stop professionale: troppo critico per dipendere solo dalla classificazione AI — sempre
  // editabile manualmente in conferma, pre-compilato dalla classificazione quando disponibile.
  const [manualHasProfessional, setManualHasProfessional] = useState(false);
  const [manualProfessionalIdentity, setManualProfessionalIdentity] = useState("");

  const canSubmit = name.trim().length > 0;

  const runClassification = async () => {
    if (!canSubmit) return;
    setStep("processing"); setError("");
    const rawConstraints = rawConstraintsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const answers = {
      rawConstraints,
      motivation: motivation === SKIP_TEXT ? "" : motivation,
      context: context === SKIP_TEXT ? "" : context,
      request: request === SKIP_TEXT ? "" : request,
    };
    // Onboarding è il primissimo schermo mostrato (Setup non è raggiungibile finché ghostProfile è
    // null) — se non c'è ancora una chiave API configurata, la classificazione AI non può girare.
    // Fallback esplicito e mai silenzioso: assegna ogni vincolo a tutti e tre i pilastri (sicuro
    // per costruzione, coerente con la Lente Integrata) a bassa confidenza, e lo segnala chiaramente
    // in conferma — l'utente potrà rilanciare la classificazione vera da Setup una volta configurata.
    if (!settings?.apiKey) {
      setClassification({
        hardConstraintsClassified: rawConstraints.map((text) => ({
          text, pillars: ["bio", "air", "vidya"], confidence: "bassa",
          reasoning: "Classificazione automatica non ancora eseguita: nessuna chiave API configurata. Assegnato a tutti i pilastri per prudenza.",
        })),
        hasProfessionalConstraint: false, professionalIdentity: "",
        distressCheck: { flagged: false, field: null, reasoning: "Controllo non eseguito: nessuna chiave API configurata ancora.", action: null },
        _fallback: true,
      });
      setManualHasProfessional(false); setManualProfessionalIdentity("");
      setStep("confirm");
      return;
    }
    try {
      const result = await classifyOnboardingProfile(answers, settings);
      if (!result) throw new Error("Risposta non interpretabile dal modello.");
      setClassification(result);
      setManualHasProfessional(!!result.hasProfessionalConstraint);
      setManualProfessionalIdentity(result.professionalIdentity || "");
      setStep("confirm");
    } catch (e) {
      setError(e.message || "Errore durante la classificazione.");
      setStep("form");
    }
  };

  // FASE 1 (BRIEF_blocco1 12/08/2026): costruisce direttamente il nuovo schema hardConstraints
  // [{id, testo, pilastro, dataDichiarazione}] invece dell'oggetto per-categoria precedente. Il
  // checkbox/campo di identità professionale resta manuale (mai solo dedotto dalla classificazione AI
  // — commento storico più sotto), ma ora produce un record hardConstraints con tipo:"identita-
  // professionale" invece di due campi paralleli: hasProfessionalConstraint/professionalIdentity
  // vengono derivati da questo record da normalizeGhostProfile/setGhostProfile, non scritti qui.
  const finalize = () => {
    const hc = [];
    const pushHc = (testo, pilastro) => { if (testo && testo.trim()) hc.push({ id: uid(), testo: testo.trim(), pilastro, dataDichiarazione: todayISO() }); };
    (classification?.hardConstraintsClassified || []).forEach((item) => {
      (item.pillars || []).forEach((p) => pushHc(item.text, p));
    });
    // bodyMindConcern e familyHistory restano letture aperte (non farmaci): "terapia/farmaco in corso"
    // resta un prefisso esplicito solo per il campo medical, non per queste due.
    if (medical.trim() && medical !== SKIP_TEXT) pushHc(`terapia/farmaco in corso: ${medical.trim()}`, "bio");
    if (bodyMindConcern.trim() && bodyMindConcern !== SKIP_TEXT) pushHc(bodyMindConcern.trim(), "bio");
    if (familyHistory.trim() && familyHistory !== SKIP_TEXT) pushHc(`familiarità (non confermata): ${familyHistory.trim()}`, "bio");
    if (timeRhythm.trim() && timeRhythm !== SKIP_TEXT) pushHc(timeRhythm.trim(), "air");
    if (priority.trim()) pushHc(priority.trim(), null); // trasversale, non assegnabile a un solo pilastro
    if (manualHasProfessional && manualProfessionalIdentity.trim()) {
      hc.push({
        id: "g1", tipo: "identita-professionale", pilastro: "air", dataDichiarazione: todayISO(),
        identita: manualProfessionalIdentity.trim(),
        testo: `mai esporre l'identità professionale (${manualProfessionalIdentity.trim()}) con il pilastro AIR, in nessuna forma di output — vincolo reputazionale, non negoziabile`,
      });
    }
    onComplete({
      name: name.trim(),
      hardConstraints: hc,
      cognitiveStyle: { channel: channelList.join(", "), density, dialectic, dialecticOverride: null, reasoningStyle },
      // Tutto il blocco è agganciato a buildPillarCtx, ma SOLO per bio/vidya — mai per air, dove nessuna
      // nota freeform viene iniettata (nessuno di questi campi è filtrato e potrebbe nominare l'identità
      // professionale del Ghost). Vedi PILLAR_CTX più in alto nel file.
      freeform: {
        motivation: motivation === SKIP_TEXT ? "" : motivation.trim(),
        context: context === SKIP_TEXT ? "" : context.trim(),
        request: request === SKIP_TEXT ? "" : request.trim(),
        strength: strengthAbility === SKIP_TEXT ? "" : strengthAbility.trim(),
      },
      distressCheck: classification?.distressCheck || null,
    });
  };

  if (step === "processing") {
    return html`<div class="r-screen"><div class="r-card"><p>Un momento — sto leggendo le tue risposte per organizzarle...</p></div></div>`;
  }

  if (step === "confirm") {
    const items = classification?.hardConstraintsClassified || [];
    const dc = classification?.distressCheck;
    return html`<div class="r-screen">
      <div class="r-section-header"><h2>Conferma prima di salvare</h2><p>Ecco come ho letto le tue risposte. Puoi correggere qualunque cosa prima di procedere — niente si salva senza la tua conferma.</p></div>
      ${classification?._fallback && html`<div class="r-card" style="border-left:3px solid var(--air)"><p>Nessuna chiave API era ancora configurata: i vincoli sotto sono assegnati a tutti i pilastri per prudenza, non classificati davvero. Vai in Setup, imposta la chiave, e potrai rilanciare una classificazione più precisa in futuro.</p></div>`}
      <div class="r-card">
        <h3>Vincoli e a quale pilastro li ho assegnati</h3>
        ${items.length === 0 && html`<p style="opacity:.7">Nessun vincolo da classificare.</p>`}
        ${items.map((it, i) => html`<div class="r-field" key=${i}>
          <span><b>${it.text}</b> → ${(it.pillars || []).join(" + ") || "non assegnato"} <small style="opacity:.6">(confidenza: ${it.confidence || "n/d"})</small></span>
          <small style="opacity:.7">${it.reasoning || ""}</small>
        </div>`)}
      </div>
      <div class="r-card">
        <h3>Identità professionale/reputazionale</h3>
        <p style="opacity:.7">Sempre da confermare tu, mai solo dedotta — è l'unico vincolo hard-stop del sistema.</p>
        <div class="r-settings-row" style="margin-bottom:10px">
          <span>Hai un'identità professionale/pubblica da tenere separata dal pilastro AIR?</span>
          <input type="checkbox" checked=${manualHasProfessional} onInput=${(e) => setManualHasProfessional(e.target.checked)} />
        </div>
        ${manualHasProfessional && html`<label class="r-field"><span>Descrivila brevemente — non verrà mai esposta in output AIR</span><input class="r-input" value=${manualProfessionalIdentity} onInput=${(e) => setManualProfessionalIdentity(e.target.value)} placeholder="es. fisioterapista, Studio Rossi" /></label>`}
      </div>
      ${dc?.flagged && html`<div class="r-card" style="border-left:3px solid var(--air)"><span>Nota: una parte del testo libero (${dc.field}) verrà trattata come contesto passivo per Shell/Simbiosi, esclusa dal materiale di perturbazione Magi. ${dc.reasoning || ""}</span></div>`}
      <div class="r-card">
        <button class="r-btn" onClick=${finalize}>Conferma e inizia</button>
        <button class="r-btn-ghost" onClick=${() => setStep("form")}>Torna indietro e correggi</button>
      </div>
    </div>`;
  }

  return html`<div class="r-screen">
    <div class="r-section-header"><h2>Benvenuto in Resonance</h2>
      <p>Resonance è un sistema che si adatta al tuo modo di pensare, invece di chiederti di adattarti a lui. Lo "Shell" è la parte dell'app che ti parla e ti accompagna — pensalo come un assistente che, da queste risposte, impara come parlarti, cosa non toccare mai, e come aiutarti a fare quello che vuoi fare.</p>
      <p>Le domande che seguono servono solo a questo. Restano solo tue: si salvano sul tuo Google Drive personale, nessun altro le vede, e puoi modificarle o cancellarle quando vuoi. Nessuna è obbligatoria — se una non ti va di compilarla ora, salta pure.</p>
      <p>Una nota prima di iniziare: alcune domande toccano salute e vita privata. Resonance non è un medico né uno psicologo, e non li sostituisce.</p></div>
    <div class="r-card" style="border-left:3px solid ${C.core}">
      ${driveRecovery.phase === "idle" && html`<div>
        <h3>Hai già un account?</h3>
        <p style="opacity:.7">Se hai già usato Resonance su un altro dispositivo, o hai perso i dati locali, recupera il tuo profilo da Google Drive invece di ripartire da qui.</p>
        <button class="r-btn r-btn-ghost" onClick=${onRecoverFromDrive}>Ho già un account — Accedi con Google</button>
      </div>`}
      ${driveRecovery.phase === "connecting" && html`<p><span class="r-spin">⏳</span> Connessione con Google in corso…</p>`}
      ${driveRecovery.phase === "checking" && html`<p><span class="r-spin">⏳</span> Recupero i tuoi dati da Drive…</p>`}
      ${driveRecovery.phase === "notfound" && html`<div>
        <p>Nessun dato precedente trovato per questo account.</p>
        <p style="opacity:.7">Nessun problema — prosegui pure con il questionario qui sotto.</p>
      </div>`}
      ${driveRecovery.phase === "error" && html`<div>
        <p class="r-error">Recupero non riuscito: ${driveRecovery.error} I tuoi dati non sono stati toccati — puoi riprovare quando vuoi.</p>
        <button class="r-btn" onClick=${onRecoverFromDrive}>Riprova</button>
      </div>`}
    </div>
    ${error && html`<div class="r-card" style="border-left:3px solid var(--air)"><p>${error}</p></div>`}
    <div class="r-card">
      <h3>Come ti muovi</h3>
      <label class="r-field"><span>Come vuoi essere chiamato dallo Shell?</span><input class="r-input" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Il tuo nome" /></label>

      <label class="r-field"><span>Quando devi capire qualcosa di nuovo — un'idea, una tecnica, un ragionamento — cosa ti aiuta di più, di solito? Puoi scegliere anche più di una.</span></label>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Vedere uno schema o una struttura che organizzi le cose</span><input type="checkbox" checked=${channelList.includes("visivo")} onInput=${() => toggleChannel("visivo")} /></div>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Sentirne parlare, seguire un discorso a voce</span><input type="checkbox" checked=${channelList.includes("uditivo")} onInput=${() => toggleChannel("uditivo")} /></div>
      <div class="r-settings-row" style="margin-bottom:10px"><span>Provarci direttamente, con qualcosa di pratico da fare</span><input type="checkbox" checked=${channelList.includes("pratico")} onInput=${() => toggleChannel("pratico")} /></div>

      <label class="r-field"><span>Quando lo Shell ti risponde, preferisci una risposta breve e diretta, o preferisci che sviluppi il ragionamento per intero, anche se più lunga?</span></label>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Breve e diretta</span><input type="radio" name="density" checked=${density === "semplice"} onInput=${() => setDensity("semplice")} /></div>
      <div class="r-settings-row" style="margin-bottom:10px"><span>Completa, anche se lunga</span><input type="radio" name="density" checked=${density === "densa"} onInput=${() => setDensity("densa")} /></div>

      <label class="r-field"><span>Un'ultima cosa su come parlare con te: se lo Shell nota una contraddizione o un punto debole in quello che dici, preferisci che te lo faccia notare apertamente (anche a costo di doverti smentire), o preferisci che ti accompagni senza metterti in discussione? Potrai cambiarlo in ogni conversazione, quindi non è una scelta definitiva.</span></label>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Fammelo notare, anche se scomodo</span><input type="radio" name="dialectic" checked=${dialectic === true} onInput=${() => setDialectic(true)} /></div>
      <div class="r-settings-row" style="margin-bottom:10px"><span>Accompagnami senza mettermi in discussione</span><input type="radio" name="dialectic" checked=${dialectic === false} onInput=${() => setDialectic(false)} /></div>

      <label class="r-field"><span>Quando devi risolvere un problema, come procedi di solito?</span></label>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Un passo alla volta, in ordine</span><input type="radio" name="reasoning" checked=${reasoningStyle === "strutturato"} onInput=${() => setReasoningStyle("strutturato")} /></div>
      <div class="r-settings-row" style="margin-bottom:6px"><span>Vedo prima il quadro d'insieme, poi torno sui dettagli</span><input type="radio" name="reasoning" checked=${reasoningStyle === "saltellante"} onInput=${() => setReasoningStyle("saltellante")} /></div>
      <div class="r-settings-row" style="margin-bottom:10px"><span>Dipende molto dalla situazione</span><input type="radio" name="reasoning" checked=${reasoningStyle === "misto"} onInput=${() => setReasoningStyle("misto")} /></div>
    </div>
    <div class="r-card">
      <h3>Cosa non si tocca</h3>
      <label class="r-field"><span>C'è qualcosa che non va mai toccato, suggerito o nominato — nemmeno per gioco o come battuta? Può essere di qualunque tipo: una persona, un argomento, una parte della tua vita, un'abitudine, una condizione di salute. Una voce per riga. Se ti va, spiega brevemente perché.</span>
        <small style="opacity:.7">Qualche esempio per farti un'idea (non serve che i tuoi assomiglino a questi): "il mio lavoro attuale — non deve mai comparire vicino a contenuti economici/pubblici" · "un certo periodo della mia vita — non ne voglio parlare" · "zucchine — intolleranza"</small>
        <textarea class="r-textarea" value=${rawConstraintsText} onInput=${(e) => setRawConstraintsText(e.target.value)} placeholder="una voce per riga" /></label>
      <${SkippableField} label="Tempo e ritmo — momenti o ritmi intoccabili?" value=${timeRhythm} onChange=${setTimeRhythm} placeholder="es. mai il weekend" />
      <label class="r-field"><span>Tra le cose che hai scritto sopra, ce n'è una che conta più di tutte le altre? Se sì, quale? (Puoi lasciare vuoto se non senti il bisogno di sceglierne una.)</span><input class="r-input" value=${priority} onInput=${(e) => setPriority(e.target.value)} /></label>
    </div>
    <div class="r-card">
      <h3>Salute <small style="opacity:.7">(facoltativo — salta pure se preferisci non condividere nulla qui)</small></h3>
      <p style="opacity:.7">Le informazioni che scrivi restano solo tue, salvate sul tuo Drive personale. Resonance non è un medico e non sostituisce una diagnosi o una terapia — le usa solo per evitare di suggerirti, per errore, qualcosa in conflitto con quello che già segui o che ti riguarda.</p>
      <${SkippableField} label="Prendi farmaci o terapie in questo momento? Se vuoi, scrivi anche il dosaggio — aiuta a evitare suggerimenti sbagliati, ma non è indispensabile." value=${medical} onChange=${setMedical} placeholder="farmaco/terapia + dosaggio se noto" textarea=${true} />
      <${SkippableField} label="C'è qualcosa che ti pesa o ti crea difficoltà, nel corpo o nel modo in cui sei fatto, anche se non ha mai avuto un nome ufficiale?" value=${bodyMindConcern} onChange=${setBodyMindConcern} textarea=${true} />
      <${SkippableField} label="Qualcosa di simile che ricorre spesso in famiglia — anche solo come sospetto, senza bisogno di conferme?" value=${familyHistory} onChange=${setFamilyHistory} textarea=${true} />
      <${SkippableField} label="C'è qualcosa in cui ti senti particolarmente bravo? Qualcosa che ti riesce naturale, anche se magari non ci hai mai pensato in questi termini." value=${strengthAbility} onChange=${setStrengthAbility} textarea=${true} />
    </div>
    <div class="r-card">
      <h3>Il resto</h3>
      <${SkippableField} label="Cosa speri che Resonance possa aiutarti a fare o a capire? Non serve una risposta definitiva — anche un'idea vaga va benissimo." value=${motivation} onChange=${setMotivation} textarea=${true} maxLength=${500} />
      <${SkippableField} label="C'è qualcosa di te, non chiesta finora nel questionario, che ritieni utile per comprenderti meglio?" value=${context} onChange=${setContext} textarea=${true} maxLength=${500} />
      <${SkippableField} label="Se Resonance potesse fare perfettamente una cosa sola per te, quale sceglieresti?" value=${request} onChange=${setRequest} maxLength=${500} />
      <button class="r-btn" disabled=${!canSubmit} onClick=${runClassification}>Continua</button>
    </div>
    <p style="opacity:.6;text-align:center;font-size:13px">Puoi tornare qui e modificare ogni risposta quando vuoi — niente qui è scritto nella pietra.</p>
  </div>`;
}
//──────────────────────────────────────────────────────────
// FEEDBACK — canale UX/bug: invio diretto via Gmail, stesso account Google già usato per Drive/Calendar.
// L'indirizzo di destinazione è FISSO in config.js (mai scelto dal client) — chiunque usi l'app,
// una volta effettuato il login Google già richiesto per la sincronizzazione, può inviare senza
// altro setup: nessuna condivisione, nessun servizio terzo, nessuna cartella da collegare.
// Separato dal debug log (pushDebugLog): quello cattura eventi tecnici automatici ad ogni turno,
// questo è un report esplicito scritto dalla persona, con più contesto e meno rumore.
//──────────────────────────────────────────────────────────
async function sendFeedbackEmail(text, screenLabel) {
  const when = new Date().toLocaleString("it-IT");
  const subject = `Resonance – Segnalazione (${screenLabel})`;
  const body = `${when} · ${screenLabel}\n\n${text}`;
  await sendGmail(CONFIG.FEEDBACK_EMAIL, subject, body);
}
function FeedbackWidget({ view, pushDebugLog }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const feedbackReady = CONFIG.FEEDBACK_EMAIL && !CONFIG.FEEDBACK_EMAIL.startsWith("INCOLLA");
  const screenLabel = TABS.find((t) => t.key === view)?.label || view;
  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true); setMsg("");
    try {
      await sendFeedbackEmail(body, screenLabel);
      setMsg("Inviato.");
      setText("");
      pushDebugLog?.({ type: "user-feedback", screen: screenLabel, error: null });
      setTimeout(() => { setOpen(false); setMsg(""); }, 1800);
    } catch (e) {
      setMsg("Errore: " + e.message);
      pushDebugLog?.({ type: "user-feedback", screen: screenLabel, error: e.message });
    } finally { setSending(false); }
  };
  return html`<div>
    <button class="r-btn-ghost" style="position:fixed;top:10px;right:12px;z-index:60;background:rgba(20,24,30,.55);backdrop-filter:blur(4px)"
      onClick=${() => setOpen(!open)}>${open ? "✕" : "Segnala"}</button>
    ${open && html`<div class="r-card" style="position:fixed;top:46px;right:12px;z-index:60;width:min(320px,90vw);box-shadow:0 6px 24px rgba(0,0,0,.35)">
      ${!feedbackReady && html`<div class="r-hub-detail" style="margin-bottom:8px">Canale feedback non ancora configurato (manca FEEDBACK_EMAIL in config.js) — chiedi a chi gestisce l'app.</div>`}
      <div class="r-hub-detail" style="margin-bottom:8px">Cosa non va, o cosa vorresti diverso? Poche righe bastano.</div>
      <textarea class="r-textarea" rows="4" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="Scrivi qui…"></textarea>
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button class="r-btn" style="border-color:${C.core}" onClick=${submit} disabled=${sending || !text.trim() || !feedbackReady}>${sending ? "Invio…" : "Invia"}</button>
        <button class="r-btn-ghost" onClick=${() => { setOpen(false); setMsg(""); }}>Annulla</button>
      </div>
      ${msg && html`<div class="r-hub-detail" style="margin-top:8px">${msg}</div>`}
    </div>`}
  </div>`;
}
function App() {
  const [view, setView] = useState("hub");
  const [bio, setBio] = useState(() => loadKey("bio-data", []));
  const [air, setAir] = useState(() => loadKey("air-data", []));
  const [vidya, setVidya] = useState(() => loadKey("vidya-data", []));
  const [magi, setMagi] = useState(() => loadKey("magi-data", []));
  const [shellChat, setShellChatRaw] = useState(() => loadKey("shell-chat", []));
  const setShellChat = useCallback((updater) => setShellChatRaw((prev) => { const next = typeof updater === "function" ? updater(prev) : updater; saveKey("shell-chat", next); return next; }), []);
  const [pBio, setPBio] = useState(() => loadKey("percorsi-bio", []));
  const [pAir, setPAir] = useState(() => loadKey("percorsi-air", []));
  const [pVidya, setPVidya] = useState(() => loadKey("percorsi-vidya", []));
  const [semi, setSemi] = useState(() => loadKey("semi-data", []));
  // PUNTO 4 (BRIEF_correzioni_post_test 26/07/2026): "Discuti in Shell" — messaggio di contesto
  // PREPARATO nell'input di Shell, mai inviato automaticamente (Legge 8). Non persistente (solo
  // stato di sessione): consumato dall'effect in ShellView al mount successivo alla navigazione.
  const [shellDraft, setShellDraft] = useState("");
  const discussSeedInShell = useCallback((seed, strategy) => {
    setShellDraft(`Vorrei discutere questa strategia proposta per il Seme AIR (id: ${seed.id}) — "${seed.content}":\n\n"${strategy.titolo}": ${strategy.descrizione}\n\nHo delle domande/aggiustamenti prima di approvarla. L'approvazione resta comunque dal pannello Semi, non da qui.`);
    setView("shell");
  }, []);
  const [kernel, setKernel] = useState(() => loadKey("kernel-data", { content: DEFAULT_KERNEL, version: 1, history: [] }));
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadKey("app-settings", {}) }));
  const [driveStatus, setDriveStatus] = useState({ state: "idle", time: null, error: null, remoteTime: null, fileId: null });
  const [resonance, setResonance] = useState(() => loadKey("simbiosi-data", { text: "", time: null }));
  // null = nessun profilo ancora salvato per QUESTO account → mostra onboarding invece dell'Hub.
  // Se esiste già (caso di Flavio, che ha sempre usato l'app), lo applica subito al modulo.
  // Distingue "installazione esistente che aggiorna" da "account davvero nuovo" guardando se
  // esistono già dati storici (kernel-data è presente fin dalla primissima versione dell'app).
  // Senza questo controllo, Flavio stesso vedrebbe l'onboarding al primo caricamento post-update
  // — "ghost-profile" è una chiave nuova, non esiste ancora per nessuno, lui incluso.
  const isExistingInstall = () => localStorage.getItem("kernel-data") !== null || localStorage.getItem("bio-data") !== null || localStorage.getItem("shell-chat") !== null;
  const [ghostProfile, setGhostProfileRaw] = useState(() => {
    const saved = loadKey("ghost-profile", null);
    if (saved) return normalizeGhostProfile(saved); // profili salvati prima della FASE 1 sono nello schema hardConstraints vecchio
    if (isExistingInstall()) { saveKey("ghost-profile", DEFAULT_GHOST_PROFILE); return DEFAULT_GHOST_PROFILE; }
    return null; // davvero nessun dato pregresso: onboarding
  });
  useEffect(() => { if (ghostProfile) setGhostProfile(ghostProfile); }, []); // solo al mount, stato già caricato sincrono sopra
  const saveGhostProfile = useCallback((profile) => {
    const normalized = normalizeGhostProfile(profile);
    setGhostProfileRaw(normalized); saveKey("ghost-profile", normalized); setGhostProfile(normalized);
  }, []);
  const [resCalculating, setResCalculating] = useState(false);
  const [resError, setResError] = useState("");
  const [memory, setMemory] = useState(() => migrateMemoryShape(loadKey("shell-memory", { bio: "", air: "", vidya: "" })));
  const [styleMemory, setStyleMemoryRaw] = useState(() => loadKey("shell-style-memory", ""));
  // FASE 1.1 — Legge 14 applicata alla memoria procedurale (finora l'unica esclusa): prima di
  // sovrascrivere la nota corrente, la versione precedente viene archiviata come frammento datato
  // invece di essere distrutta. Lo strato corrente resta plastico (Manifesto §3.1) — si sovrascrive
  // per intero come oggi — ma il sedimento dà al sistema una storia che prima non aveva.
  // Tetto sedimento: 30 frammenti/pilastro, i più vecchi cadono (.slice(-30), array cresce in coda).
  // Tetto corrente: 900 caratteri — il limite tecnico oggi mancante (AUDIT_SPRINT_HARDENING 26/07),
  // finora solo un'istruzione nel prompt di reflectMemoriaBatch (max 90 parole), mai applicata nel codice.
  // BLOCCO 5 — le chiavi arrivano insieme alla nuova memoria e vengono scritte sul frammento che
  // sta per sedimentare, cioe' su quello che ESCE dallo strato corrente: e' quel testo che le
  // chiavi descrivono, non quello nuovo che lo sostituisce.
  const updateMemoria = useCallback((pillar, text, chiavi = []) => setMemory((prev) => {
    const prevPillar = prev[pillar] || { corrente: "", sedimento: [] };
    const sedimento = (prevPillar.corrente && text !== prevPillar.corrente)
      ? [...prevPillar.sedimento, { id: uid(), date: new Date().toISOString(), text: prevPillar.corrente, chiavi: Array.isArray(chiavi) ? chiavi : [] }].slice(-30)
      : prevPillar.sedimento;
    const corrente = text.length > 900 ? text.slice(0, 900) : text;
    const n = { ...prev, [pillar]: { corrente, sedimento } };
    saveKey("shell-memory", n);
    return n;
  }), []);
  const setStyleMemory = useCallback((text) => setStyleMemoryRaw(() => { saveKey("shell-style-memory", text); return text; }), []);
  const [debugLog, setDebugLog] = useState(() => loadKey("debug-log", []));
  const pushDebugLog = useCallback((entry) => setDebugLog((prev) => { const n = [{ ...entry, time: new Date().toISOString() }, ...prev].slice(0, 50); saveKey("debug-log", n); return n; }), []);
  const clearDebugLog = useCallback(() => { setDebugLog([]); saveKey("debug-log", []); }, []);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  // File versionati per compartimento (Legge 14): silenziosi in UI, ma tracciati nel log di debug.
  const syncIfEnabled = useCallback((label, content) => {
    if (!settingsRef.current.driveSyncEnabled) return;
    createDriveFile(`Resonance – ${label} – ${new Date().toISOString().slice(0, 19).replace("T", " ")}`, content)
      .catch((e) => pushDebugLog({ type: "versioned-file", label, error: e.message }));
  }, [pushDebugLog]);
  const updateSettings = useCallback((patch) => setSettings((prev) => { const next = { ...prev, ...patch }; saveKey("app-settings", next); return next; }), []);

  // ═══ SYNC TRA DISPOSITIVI ═══
  // Due percorsi distinti, mai in conflitto:
  //  • pullAndMergeOnce = pull → merge → APPLICA localmente → push   (solo al mount e sul bottone manuale)
  //  • pushMergedOnce   = pull → merge → push, SENZA applicare       (autosave: evita il loop apply→autosave→apply)
  // Flag dedicati distinguono i cambi di stato "veri" da quelli causati dall'apply:
  //  1) l'apply non falsifica il timestamp locale (skipStampRef)
  //  2) l'apply non fa ripartire l'autosave (skipAutosaveRef)
  // Un lucchetto (syncBusyRef) con coda-di-uno (pendingPushRef) impedisce sync concorrenti
  // senza mai perdere l'ultimo push.
  const syncFileIdRef = useRef(null);
  // Inizializzazione SINCRONA alla prima render: così il primo pull al mount trova già lo stato
  // reale in stateRef, senza dipendere dall'ordine di esecuzione degli effetti (Bug A).
  const stateRef = useRef({ bio, air, vidya, pBio, pAir, pVidya, magi, semi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile });
  const hasMountedRef = useRef(false);
  const skipStampRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const hasMountedAutosaveRef = useRef(false);
  const syncBusyRef = useRef(false);
  const pendingPushRef = useRef(false);
  const pushMergedOnceRef = useRef(null);

  // (1) Mirroring dello stato + timbro temporale sulle modifiche REALI.
  // NOTA: quest'effetto deve restare dichiarato PRIMA degli effetti di sync — l'ordine di
  // dichiarazione è l'ordine di esecuzione, e al mount stateRef va popolato prima del primo pull.
  useEffect(() => {
    stateRef.current = { bio, air, vidya, pBio, pAir, pVidya, magi, semi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile };
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }          // idratazione iniziale: non è una modifica
    if (skipStampRef.current) { skipStampRef.current = false; return; }            // apply da Drive: il timestamp giusto l'ha già scritto applyMergedState
    saveKey("sync-last-modified", Date.now());                                     // modifica reale dell'utente/Shell
  }, [bio, air, vidya, pBio, pAir, pVidya, magi, semi, shellChat, memory, styleMemory, kernel, resonance, ghostProfile]);

  const applyMergedState = (merged) => {
    // Tutti i setState qui sotto sono sincroni e vengono raggruppati in un solo re-render:
    // NON inserire await in mezzo, o i flag skip coprirebbero solo una parte degli aggiornamenti.
    skipStampRef.current = true;
    skipAutosaveRef.current = true;
    setBio(merged.bio); saveKey("bio-data", merged.bio);
    setAir(merged.air); saveKey("air-data", merged.air);
    setVidya(merged.vidya); saveKey("vidya-data", merged.vidya);
    setPBio(merged.pBio); saveKey("percorsi-bio", merged.pBio);
    setPAir(merged.pAir); saveKey("percorsi-air", merged.pAir);
    setPVidya(merged.pVidya); saveKey("percorsi-vidya", merged.pVidya);
    setMagi(merged.magi); saveKey("magi-data", merged.magi);
    setSemi(merged.semi); saveKey("semi-data", merged.semi);
    setShellChatRaw(merged.shellChat); saveKey("shell-chat", merged.shellChat);
    setMemory(merged.memory); saveKey("shell-memory", merged.memory);
    setStyleMemoryRaw(merged.styleMemory); saveKey("shell-style-memory", merged.styleMemory);
    setKernel(merged.kernel); saveKey("kernel-data", merged.kernel);
    setResonance(merged.resonance); saveKey("simbiosi-data", merged.resonance);
    setGhostProfileRaw(merged.ghostProfile); saveKey("ghost-profile", merged.ghostProfile); setGhostProfile(merged.ghostProfile);
    stateRef.current = { bio: merged.bio, air: merged.air, vidya: merged.vidya, pBio: merged.pBio, pAir: merged.pAir, pVidya: merged.pVidya, magi: merged.magi, semi: merged.semi, shellChat: merged.shellChat, memory: merged.memory, styleMemory: merged.styleMemory, kernel: merged.kernel, resonance: merged.resonance, ghostProfile: merged.ghostProfile };
    saveKey("sync-last-modified", merged.lastModified);
  };

  // ═══ BRIEF2_login_precoce (26/07/2026) — "Ho già un account" in onboarding ═══
  // Incidente reale che ha motivato questa feature: localStorage cancellato per errore → utente
  // bloccato dentro l'onboarding completo, dati veri irraggiungibili su Drive, rischio di sovrascrivere
  // il profilo vero con uno vuoto al termine del questionario (merge "ultima scrittura vince").
  // idle → connecting (OAuth, STESSO connectDrive già usato per Drive/Calendar/Gmail, nessun secondo
  // meccanismo di auth) → checking (ricerca+download del file di sync) → notfound | error, oppure
  // successo silenzioso (ghostProfile smette di essere null, OnboardingView si smonta da sola).
  const [driveRecovery, setDriveRecovery] = useState({ phase: "idle", error: "" });
  const recoverFromDrive = useCallback(async () => {
    setDriveRecovery({ phase: "connecting", error: "" });
    try {
      await connectDrive();
      setDriveRecovery({ phase: "checking", error: "" });
      const found = await findSyncFile();
      if (!found) { setDriveRecovery({ phase: "notfound", error: "" }); return; }
      const remote = await downloadSyncState(found.id);
      if (!remote) { setDriveRecovery({ phase: "notfound", error: "" }); return; }
      // CASO LIMITE 2 (BRIEF2): "local" è SYNC_DEFAULTS() puro, MAI stateRef.current — che a questo punto
      // non contiene comunque risposte di onboarding (quelle vivono solo nello state locale, mai letto
      // qui, di OnboardingView), ma usare i default esplicitamente rende il punto inequivocabile: il
      // recupero non eredita MAI nulla dalla sessione di onboarding in corso, a prescindere da cosa il
      // Ghost abbia già digitato in quello schermo.
      const merged = mergeSyncState(SYNC_DEFAULTS(), remote);
      syncFileIdRef.current = found.id;
      // CASO LIMITE 5 (BRIEF2): applyMergedState è lo STESSO, UNICO percorso di scrittura già usato dal
      // pull Drive manuale/automatico — mai saveGhostProfile/onComplete (quella scrive un profilo nuovo
      // assemblato dalle risposte di onboarding, esattamente la funzione che ha causato l'incidente).
      applyMergedState(merged);
      // CASO LIMITE 3 (BRIEF2): già garantito da applyMergedState, che scrive bio-data/kernel-data/
      // shell-chat/ecc. in localStorage anche se gli array sono vuoti — isExistingInstall() li troverà
      // al prossimo avvio, quindi l'onboarding non ricomparirà.
      updateSettings({ driveSyncEnabled: true }); // Drive è appena stato collegato: la sync va accesa
      setDriveRecovery({ phase: "idle", error: "" }); // consumato — ghostProfile non è più null, OnboardingView si smonta
    } catch (e) {
      // CASO LIMITE 1 (BRIEF2), il più pericoloso: nessun applyMergedState è stato chiamato sopra se si
      // arriva qui — zero stato parziale scritto. L'utente resta sulla stessa schermata con un errore
      // esplicito e un modo di riprovare, mai forzato verso il questionario come unica via d'uscita.
      setDriveRecovery({ phase: "error", error: e.message || "Errore sconosciuto durante il recupero." });
    }
  }, [updateSettings]);

  const syncCore = useCallback(async (applyLocally) => {
    const found = syncFileIdRef.current ? { id: syncFileIdRef.current } : await findSyncFile();
    let fileId = found?.id || null;
    syncFileIdRef.current = fileId;
    const remote = fileId ? await downloadSyncState(fileId) : null;
    if (fileId && remote === null) { fileId = null; syncFileIdRef.current = null; } // file cancellato a mano: si ricrea
    const local = { ...stateRef.current, lastModified: loadKey("sync-last-modified", 0) };
    const merged = mergeSyncState(local, remote);
    if (applyLocally) applyMergedState(merged);
    const written = await uploadSyncState(merged, fileId); // { id, modifiedTime } REALI dalla risposta di Google
    syncFileIdRef.current = written.id;
    return written;
  }, []);

  const drainPendingPush = () => {
    if (pendingPushRef.current) {
      pendingPushRef.current = false;
      setTimeout(() => { pushMergedOnceRef.current && pushMergedOnceRef.current(); }, 300);
    }
  };

  // Pull completo con applicazione locale: al mount (o attivazione del toggle) e sul bottone manuale.
  const pullAndMergeOnce = useCallback(async () => {
    if (!settingsRef.current.driveSyncEnabled || syncBusyRef.current) return;
    syncBusyRef.current = true;
    setDriveStatus((s) => ({ ...s, state: "syncing", error: null }));
    try {
      const written = await syncCore(true);
      setDriveStatus({ state: "ok", time: Date.now(), error: null, remoteTime: written.modifiedTime, fileId: written.id });
      pushDebugLog({ type: "sync-pull", remoteTime: written.modifiedTime, error: null });
    } catch (e) {
      setDriveStatus({ state: "error", time: Date.now(), error: e.message, remoteTime: null, fileId: syncFileIdRef.current });
      pushDebugLog({ type: "sync-pull", error: e.message });
    } finally {
      syncBusyRef.current = false;
      drainPendingPush();
    }
  }, [syncCore, pushDebugLog]);

  // Push con merge, senza applicazione locale: usato dall'autosave. Nessun setState sui dati → nessun loop.
  const pushMergedOnce = useCallback(async () => {
    if (!settingsRef.current.driveSyncEnabled) return;
    if (syncBusyRef.current) { pendingPushRef.current = true; return; } // sync già in volo: accoda un solo retry
    syncBusyRef.current = true;
    setDriveStatus((s) => ({ ...s, state: "syncing", error: null }));
    try {
      const written = await syncCore(false);
      setDriveStatus({ state: "ok", time: Date.now(), error: null, remoteTime: written.modifiedTime, fileId: written.id });
      pushDebugLog({ type: "sync-push", remoteTime: written.modifiedTime, error: null });
    } catch (e) {
      setDriveStatus({ state: "error", time: Date.now(), error: e.message, remoteTime: null, fileId: syncFileIdRef.current });
      pushDebugLog({ type: "sync-push", error: e.message });
    } finally {
      syncBusyRef.current = false;
      drainPendingPush();
    }
  }, [syncCore, pushDebugLog]);
  useEffect(() => { pushMergedOnceRef.current = pushMergedOnce; }, [pushMergedOnce]);

  // (2) Al mount o all'attivazione del toggle: pull completo.
  // Al mount senza gesture il popup di login può essere bloccato dal browser — in quel caso
  // l'error_callback produce un errore visibile che invita a usare "Sincronizza ora" (tap reale).
  useEffect(() => { if (settings.driveSyncEnabled) pullAndMergeOnce(); }, [settings.driveSyncEnabled]);

  // (3) Autosave con ritardo di 2s: push-merge (senza apply) a ogni modifica reale.
  useEffect(() => {
    if (!settings.driveSyncEnabled) { skipAutosaveRef.current = false; return; } // sync off: non lasciare il flag armato (Bug B)
    if (!hasMountedAutosaveRef.current) { hasMountedAutosaveRef.current = true; return; } // il mount ha già il suo pull
    if (skipAutosaveRef.current) { skipAutosaveRef.current = false; return; }             // cambio causato da un apply: già sincronizzato
    const t = setTimeout(() => { pushMergedOnce(); }, 2000);
    return () => clearTimeout(t);
  }, [bio, air, vidya, pBio, pAir, pVidya, magi, semi, shellChat, memory, styleMemory, kernel, resonance, settings.driveSyncEnabled]);

  const addBio = useCallback((e) => setBio((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("bio-data", n); syncIfEnabled("04 BIO_STASIS", formatBioLog(n)); return n; }), [syncIfEnabled]);
  const delBio = useCallback((id) => setBio((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("bio-data", n); syncIfEnabled("04 BIO_STASIS", formatBioLog(n)); return n; }), [syncIfEnabled]);
  const addAir = useCallback((e) => setAir((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("air-data", n); syncIfEnabled("03 AIR_OPERATIONS", formatAirLog(n)); return n; }), [syncIfEnabled]);
  const delAir = useCallback((id) => setAir((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("air-data", n); syncIfEnabled("03 AIR_OPERATIONS", formatAirLog(n)); return n; }), [syncIfEnabled]);
  const addVidya = useCallback((e) => setVidya((prev) => { const n = [e, ...prev].sort((a, b) => b.date.localeCompare(a.date)); saveKey("vidya-data", n); syncIfEnabled("05 VIDYA_TUNING", formatVidyaLog(n)); return n; }), [syncIfEnabled]);
  const delVidya = useCallback((id) => setVidya((prev) => { const n = prev.filter((e) => e.id !== id); saveKey("vidya-data", n); syncIfEnabled("05 VIDYA_TUNING", formatVidyaLog(n)); return n; }), [syncIfEnabled]);
  // 31/08/2026 — LA PORTA DELLE LETTURE AUTOMATICHE, distinta da quella dei pulsanti.
  // addBio/addAir/addVidya restano quello che erano: se il Ghost scrive due voci simili a mano,
  // sono affari suoi e nessuno le tocca. Qui passano SOLO le letture che il programma scrive da
  // solo a ogni turno — quelle che si erano moltiplicate per cinque sullo stesso album.
  const CHIAVI_PILASTRO = { bio: "bio-data", air: "air-data", vidya: "vidya-data" };
  const SYNC_PILASTRO = { bio: ["04 BIO_STASIS", formatBioLog], air: ["03 AIR_OPERATIONS", formatAirLog], vidya: ["05 VIDYA_TUNING", formatVidyaLog] };
  const aggiungiDaLettura = useCallback((pillar, voce) => {
    const applica = { bio: setBio, air: setAir, vidya: setVidya }[pillar];
    if (!applica) return { tipo: "aggiunta" };
    // Il DATO si decide dentro l'aggiornatore, sul valore vero: e' l'unico modo di essere corretti
    // anche se in un turno arrivassero due letture sullo stesso pilastro. Cio' che si RIFERISCE al
    // Ghost si calcola qui sopra, dallo stato corrente: nel caso raro delle due letture ravvicinate
    // il messaggio potrebbe dire "aggiunta" per la seconda invece di "fusa" — una riga di racconto
    // imprecisa, mai un dato sbagliato.
    const previsto = fondiOAggiungiVoce({ bio, air, vidya }[pillar] || [], voce).esito;
    applica((prev) => {
      const { lista } = fondiOAggiungiVoce(prev, voce);
      saveKey(CHIAVI_PILASTRO[pillar], lista);
      const [etichetta, formatta] = SYNC_PILASTRO[pillar];
      syncIfEnabled(etichetta, formatta(lista));
      return lista;
    });
    return previsto;
  }, [bio, air, vidya, syncIfEnabled]);
  const addMagi = useCallback((s) => setMagi((prev) => { const n = [s, ...prev]; saveKey("magi-data", n); syncIfEnabled("01 AGORÀ_MAGI", formatMagiLog(n)); return n; }), [syncIfEnabled]);
  const delMagi = useCallback((id) => setMagi((prev) => { const n = prev.filter((s) => s.id !== id); saveKey("magi-data", n); syncIfEnabled("01 AGORÀ_MAGI", formatMagiLog(n)); return n; }), [syncIfEnabled]);
  const setPBioSync = useCallback((n) => { setPBio(n); saveKey("percorsi-bio", n); syncIfEnabled("04 BIO_STASIS — Percorsi", formatPercorsiLog("BIO", n)); }, [syncIfEnabled]);
  const setPAirSync = useCallback((n) => { setPAir(n); saveKey("percorsi-air", n); syncIfEnabled("03 AIR_OPERATIONS — Percorsi", formatPercorsiLog("AIR", n)); }, [syncIfEnabled]);
  const setPVidyaSync = useCallback((n) => { setPVidya(n); saveKey("percorsi-vidya", n); syncIfEnabled("05 VIDYA_TUNING — Percorsi", formatPercorsiLog("VIDYA", n)); }, [syncIfEnabled]);
  const setSemiSync = useCallback((n) => { setSemi(n); saveKey("semi-data", n); syncIfEnabled("03 AIR_OPERATIONS — Semi", formatSemiLog(n)); }, [syncIfEnabled]);
  const addSeed = useCallback((content, originSource) => {
    const s = {
      id: uid(), createdAt: new Date().toISOString(), ttl: new Date(Date.now() + 90 * 86400000).toISOString(),
      pillar: "air", content, originSource, status: "seed",
      researchIterationCount: 0, executionIterationCount: 0, consecutiveEmptyRounds: 0, researchLog: [], executionLog: [],
      proposedStrategies: [], approvedStrategy: null, gateReason: null,
      gatedActionPreview: null, // stringa leggibile dell'azione candidata bloccata — vedi unlockGatedSeed
      gatedActionContract: null, // FASE 1 (BRIEF_effettori_printify): contratto strutturato { effettore, parametri, ... } dietro gatedActionPreview — è quello che unlockGatedSeed esegue davvero alla conferma, gatedActionPreview resta solo la sua resa leggibile per la UI esistente
    };
    setSemiSync([s, ...stateRef.current.semi]);
    pushDebugLog({ type: "seme-created", id: s.id, originSource, error: null });
    return s;
  }, [setSemiSync, pushDebugLog]);
  const approveSeedStrategy = useCallback((id, strategy) => {
    setSemiSync(stateRef.current.semi.map((s) => (s.id === id ? { ...s, approvedStrategy: strategy, status: "executing", gateReason: null } : s)));
    pushDebugLog({ type: "seme-approved", id, strategyTitolo: strategy?.titolo || null, error: null });
  }, [setSemiSync, pushDebugLog]);
  // CORREZIONE 26/07/2026: "Sblocca/Conferma" non è più un bypass generico del gate — segue lo stesso
  // pattern propose→confirm→execute già validato per Calendar/email (il Ghost vede il contenuto
  // ESATTO dell'azione PRIMA di confermarla). gatedActionPreview è l'azione candidata mostrata in UI
  // (SemiPanel, invariata). Non incrementa executionIterationCount (il tentativo bloccato l'ha già
  // consumata) — un solo gate pendente per Seme, quindi nessun rischio di scavalcare più azioni
  // bloccate in sequenza alla cieca.
  // FIX 27/07/2026 (BRIEF_effettori_printify, FASE 1.3): prima confermare scriveva solo una NOTA in
  // executionLog ("Confermato manualmente..."), nessuna azione reale veniva mai eseguita — coerente
  // col fatto che allora non esistevano effettori. Ora, se il Seme ha un gatedActionContract (Seme
  // creato/bloccato DOPO questo fix), la conferma esegue DAVVERO l'effettore tramite invokeEffector
  // e registra l'esito reale. Retrocompatibilità: un Seme più vecchio, bloccato PRIMA di questo fix
  // (solo gatedActionPreview testuale, nessun contratto salvato), mantiene il comportamento
  // precedente — non c'è alcun contratto da eseguire davvero, quindi si limita a registrare la nota.
  // FASE 5 (brief 14/08/2026) — archiviazione di un Seme. Lo stato "archived" era gia' fra le
  // etichette ma niente lo impostava: un Seme partito male non poteva essere fermato in nessun modo,
  // continuava a comparire e a proporre "Avanza ora". E' C.15 (contrazione adattiva) nel caso piu'
  // semplice: il sistema deve poter togliere, non solo aggiungere.
  // Archiviare NON cancella (Legge 14, mai sovrascrittura distruttiva): il Seme resta per intero,
  // con tutta la sua storia, e si puo' riattivare. Cambia solo il fatto che smette di avanzare.
  // Alla riattivazione torna a "seed": ripartire dal principio e' l'unico stato sensato senza sapere
  // quanto tempo e' passato, e i contatori di round restano dov'erano — riattivare non regala giri.
  const archiveSeed = useCallback((id, archivia) => {
    setSemiSync(stateRef.current.semi.map((s) => (s.id === id ? { ...s, status: archivia ? "archived" : "seed" } : s)));
    pushDebugLog({ type: "seme-archiviazione", id, archiviato: !!archivia });
  }, [pushDebugLog]);
  const unlockGatedSeed = useCallback(async (id) => {
    const seed = stateRef.current.semi.find((s) => s.id === id);
    const contract = seed?.gatedActionContract || null;
    if (!contract) {
      const confirmedAction = seed?.gatedActionPreview || null;
      setSemiSync(stateRef.current.semi.map((s) => {
        if (s.id !== id) return s;
        const log = confirmedAction
          ? [...s.executionLog, { date: new Date().toISOString(), note: `Confermato manualmente dal Ghost nonostante il gate: ${confirmedAction}` }]
          : s.executionLog;
        return { ...s, status: "executing", gateReason: null, gatedActionPreview: null, executionLog: log };
      }));
      // Nessun testo grezzo nel log di debug (CHIARIMENTO 26/07/2026, punto 2) — il contenuto confermato
      // resta solo nell'executionLog del Seme stesso (dato del Ghost, non un prompt inviato a un modello).
      pushDebugLog({ type: "seme-unlocked", id, hadPendingAction: !!confirmedAction, error: null });
      return;
    }
    const risultato = await invokeEffector(contract.effettore, contract.parametri, pushDebugLog);
    const note = formatRealResultNote(contract, risultato);
    setSemiSync(stateRef.current.semi.map((s) => (s.id === id
      ? { ...s, status: "executing", gateReason: null, gatedActionPreview: null, gatedActionContract: null, executionLog: [...s.executionLog, { date: new Date().toISOString(), note }] }
      : s)));
    // Nessun parametro grezzo nel log di debug (stesso principio del CHIARIMENTO 26/07/2026, punto 2):
    // solo esito booleano + errore eventuale, i dati reali restano nell'executionLog del Seme.
    pushDebugLog({ type: "seme-unlocked", id, effettore: contract.effettore, ok: !!risultato.ok, error: risultato.ok ? null : (risultato.error || null) });
  }, [setSemiSync, pushDebugLog]);
  // Un solo avanzamento per apertura della tab Shell (Parte 3 del brief) — chiamata dall'effect di
  // mount di ShellView, MAI da un timer o da ogni messaggio. Legge stato FRESCO via stateRef (stesso
  // motivo della Simbiosi proattiva: subito dopo un pull Drive la closure del primo render sarebbe
  // stale). Sceglie il primo Seme in "seed"/"researching" (Fase 1) o "executing" (Fase 2) trovato.
  const advanceSeedIfDue = useCallback(async () => {
    // D4 — operazione automatica: si ferma al tetto. Il Ghost non l'ha chiesta adesso.
    if (!operazioniAutomaticheConsentite()) {
      pushDebugLog({ type: "tetto-raggiunto", operazione: "avanzamento-seme", spesaMese: Number(spesaDelMeseCorrente().toFixed(4)), tetto: TETTO_MENSILE_USD });
      return;
    }
    const s = stateRef.current;
    const target = s.semi.find((x) => x.status === "seed" || x.status === "researching" || x.status === "executing");
    if (!target) return;
    if (target.status === "seed" || target.status === "researching") {
      if (target.researchIterationCount >= SEME_RESEARCH_ITERATION_CAP) return;
      try {
        const { balthasar, approvedStrategies, rejectedStrategies, webSearchDiag, possibleHallucinatedSource } = await runSeedResearch(target, s.memory.air?.corrente, settingsRef.current, pushDebugLog);
        const nextCount = target.researchIterationCount + 1;
        const newlyApproved = approvedStrategies.filter((a) => !target.proposedStrategies.some((p) => p.titolo === a.titolo));
        const mergedStrategies = [...target.proposedStrategies, ...newlyApproved];
        // FASE 1.3 (brief 14/08/2026) — uscita anticipata. Prima, un Seme che non produceva NESSUNA
        // strategia continuava comunque fino al tetto di 5 round. Ogni round e' una runSeedResearch
        // intera (3 chiamate: Balthasar con ricerca web + Melchior + Caspar), misurata oggi a
        // ~$0,0078: cinque round a vuoto sono ~4 centesimi spesi per non concludere niente.
        // Due round consecutivi a zero strategie sono gia' un segnale sufficiente: l'idea, cosi'
        // com'e' formulata, non produce strategie che superino Caspar. Il Seme si ferma in
        // "proposte in stallo" — lo stesso stato terminale del tetto, che l'interfaccia gia'
        // conosce — invece di consumare altri tre round per arrivarci lo stesso.
        const zeroQuestoRound = approvedStrategies.length === 0;
        const vuotiConsecutivi = zeroQuestoRound ? (target.consecutiveEmptyRounds || 0) + 1 : 0;
        const uscitaAnticipata = vuotiConsecutivi >= SEME_EMPTY_ROUNDS_BEFORE_EXIT && !mergedStrategies.length;
        const nextStatus = mergedStrategies.length
          ? "awaiting_approval"
          : (uscitaAnticipata || nextCount >= SEME_RESEARCH_ITERATION_CAP ? "proposing" : "researching");
        // TASK 2 (BRIEF_costtracking_balthasarsources): il sospetto di fonte allucinata va reso
        // visibile al Ghost, non solo al log di debug tecnico — vedi detectPossibleHallucinatedSource.
        const hallucinationNote = possibleHallucinatedSource ? " ⚠ possibile fonte non verificata nel testo — controlla prima di fidartene." : "";
        const notaUscita = uscitaAnticipata ? ` — fermato qui: ${vuotiConsecutivi} round consecutivi senza nessuna strategia approvata. Riformula l'idea in modo più concreto e riavvia, invece di far girare a vuoto i round rimasti.` : "";
        const logEntry = { date: new Date().toISOString(), note: `Round ${nextCount}/${SEME_RESEARCH_ITERATION_CAP} — ${approvedStrategies.length} strategia/e approvata/e. Ricerca: ${balthasar.slice(0, 160)}${hallucinationNote}${notaUscita}` };
        const updated = { ...target, status: nextStatus, researchIterationCount: nextCount, consecutiveEmptyRounds: vuotiConsecutivi, researchLog: [...target.researchLog, logEntry], proposedStrategies: mergedStrategies };
        setSemiSync(stateRef.current.semi.map((x) => (x.id === target.id ? updated : x)));
        // Esito di Caspar-del-Seme nel log di debug: SOLO id scartato + motivo breve (≤200 caratteri,
        // sintesi di Caspar) — MAI il testo/prompt completo inviato al modello (CHIARIMENTO 26/07/2026, p.2).
        // webSearch*: diagnostica PUNTO 1 (BRIEF_correzioni_post_test) — permette di verificare nel
        // prossimo test reale se Balthasar ha ricevuto citazioni vere o le sta inventando in sintesi.
        // possibleHallucinatedSource: TASK 2 (BRIEF_costtracking_balthasarsources), caso (b).
        pushDebugLog({ type: "seme-research", id: target.id, originSource: target.originSource, round: nextCount, approvedCount: approvedStrategies.length, casparRejections: rejectedStrategies, webSearchToolInvoked: webSearchDiag.toolInvoked, webSearchCitationCount: webSearchDiag.citationCount, webSearchCitationDomains: webSearchDiag.citationDomains, possibleHallucinatedSource, status: nextStatus, error: null });
      } catch (e) {
        pushDebugLog({ type: "seme-research", id: target.id, originSource: target.originSource, error: e.message });
      }
      return;
    }
    if (target.executionIterationCount >= SEME_EXECUTION_ITERATION_CAP) return;
    try {
      // FIX 27/07/2026 (BRIEF_effettori_printify): stepText/prosa sostituito dal contratto strutturato
      // (vedi proposeSeedExecutionStep) — executeSeedContract verifica gate/AIR sui parametri concreti
      // ed esegue davvero (o si ferma) tramite invokeEffector, mai più solo una nota narrativa.
      const contract = await proposeSeedExecutionStep(target, s.memory.air?.corrente, settingsRef.current, pushDebugLog);
      const nextCount = target.executionIterationCount + 1;
      if (!contract) throw new Error("Contratto d'azione non interpretabile (risposta JSON non valida).");
      const esito = await executeSeedContract(contract, CURRENT_GHOST_PROFILE, settingsRef.current, pushDebugLog);
      // Se bloccato, il contratto candidato resta visibile (gatedActionPreview leggibile +
      // gatedActionContract eseguibile) finché il Ghost non lo conferma o lo scarta (vedi
      // unlockGatedSeed) — mai un unlock alla cieca senza vedere ESATTAMENTE cosa si sblocca.
      let updated;
      if (esito.esito === "gate") {
        updated = { ...target, status: "gated", executionIterationCount: nextCount, gateReason: esito.reason, gatedActionPreview: formatContractPreview(contract), gatedActionContract: contract, executionLog: [...target.executionLog, { date: new Date().toISOString(), note: `Bloccato: ${esito.reason}` }] };
      } else if (esito.esito === "nessuna_azione") {
        updated = { ...target, executionIterationCount: nextCount, executionLog: [...target.executionLog, { date: new Date().toISOString(), note: `Nessuna azione disponibile: ${esito.dettaglio}` }] };
      } else {
        // "eseguito" o "errore": in entrambi i casi l'azione è stata TENTATA davvero (mai solo narrata)
        // — formatRealResultNote distingue i due casi nel testo registrato.
        updated = { ...target, executionIterationCount: nextCount, gatedActionPreview: null, gatedActionContract: null, executionLog: [...target.executionLog, { date: new Date().toISOString(), note: formatRealResultNote(contract, esito.risultato) }] };
      }
      setSemiSync(stateRef.current.semi.map((x) => (x.id === target.id ? updated : x)));
      // reason incluso (breve, ≤20 parole, verdetto di Caspar) — MAI il contratto/prompt completo nel log di debug.
      pushDebugLog({ type: "seme-execution", id: target.id, originSource: target.originSource, round: nextCount, effettore: contract.effettore, esito: esito.esito, gated: esito.esito === "gate", reason: esito.esito === "gate" ? esito.reason : null, error: esito.esito === "errore" ? (esito.risultato?.error || null) : null });
    } catch (e) {
      pushDebugLog({ type: "seme-execution", id: target.id, originSource: target.originSource, error: e.message });
    }
  }, [setSemiSync, pushDebugLog]);
  const saveKernel = useCallback((content) => setKernel((prev) => {
    const n = { content, version: prev.version + 1, history: [...prev.history, { version: prev.version, content: prev.content, date: new Date().toISOString() }] };
    saveKey("kernel-data", n); syncIfEnabled("00 KERNEL_LOG", content); return n;
  }), [syncIfEnabled]);
  const resonanceBusyRef = useRef(false);
  const recalcResonance = useCallback(async (silent = false) => {
    if (resonanceBusyRef.current) return; // una valutazione (manuale o proattiva) è già in volo: non sovrapporre
    resonanceBusyRef.current = true;
    if (!silent) { setResCalculating(true); setResError(""); }
    try {
      const digest = buildResonanceDigest({ bio, air, vidya, kernel, magi, pBio, pAir, pVidya, memory });
      const recentChatText = recentShellText(stateRef.current.shellChat);
      const titoliPercorsiEsistenti = [...pBio, ...pAir, ...pVidya].map((p) => p.title);
      const percorsoSuggeritoPendente = loadKey("simbiosi-data", {}).percorsoSuggerito || null;
      const res = await computeResonance(digest, settingsRef.current, recentChatText, titoliPercorsiEsistenti, !!percorsoSuggeritoPendente);
      const next = { text: res.text, time: Date.now(), worthSurfacing: res.worthSurfacing, identityHint: res.identityHint || null, percorsoSuggerito: res.percorsoSuggerito || percorsoSuggeritoPendente };
      setResonance(next); saveKey("simbiosi-data", next);
      // Balthasar-a-margine (1 solo segnale): card dedicata in Shell, mai pipeline completa.
      if (res.crystallization?.marginNote) {
        setShellChat((prev) => [...prev, { id: uid(), role: "balthasar-margin", pillar: res.crystallization.pillar || null, note: res.crystallization.marginNote }]);
      }
      // TTS solo su recalc manuale (gesto utente) e solo se vale la pena. Non sulla proattiva (parte
      // dopo setTimeout: gesture-standing perso, non partirebbe). Best-effort come l'autoplay di Shell.
      if (!silent && res.worthSurfacing && res.text) { try { speakText(res.text); } catch { /* TTS best-effort */ } }
      // Allinea la signature: un recalc manuale conta come "valutazione fatta", la proattiva non lo ripeterà.
      const s = stateRef.current;
      saveKey("simbiosi-eval-signature", `${s.bio.length}|${s.air.length}|${s.vidya.length}|${s.pBio.length}|${s.pAir.length}|${s.pVidya.length}|${s.magi.length}|${s.bio[0]?.date||""}|${s.air[0]?.date||""}|${s.vidya[0]?.date||""}`);
    } catch (e) { if (!silent) setResError(e.message); } finally { resonanceBusyRef.current = false; if (!silent) setResCalculating(false); }
  }, [bio, air, vidya, kernel, magi, pBio, pAir, pVidya]);
  // Applica una proposta identitaria emergente di Simbiosi: promuove un percorso esistente a "identitario".
  // Coerente con Legge 8 (conferma esplicita) — chiamata solo su azione del Ghost, mai in automatico.
  const promoteToIdentity = useCallback((hint) => {
    if (!hint?.pillar || !hint?.title) { pushDebugLog({ type: "promote-identity", error: "hint mancante di pillar/title", hint }); return; }
    const setter = { bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }[hint.pillar];
    const list = { bio: pBio, air: pAir, vidya: pVidya }[hint.pillar];
    if (!setter || !list) { pushDebugLog({ type: "promote-identity", error: "pillar non riconosciuto", pillar: hint.pillar }); return; }
    setter(list.map((p) => (p.title === hint.title ? { ...p, kind: "identitario", identityGoal: hint.becoming || p.identityGoal || `diventare una persona che padroneggia: ${p.title}` } : p)));
    // consumato l'hint: lo rimuovo dalla risonanza così la proposta non ricompare
    setResonance((prev) => { const n = { ...prev, identityHint: null }; saveKey("simbiosi-data", n); return n; });
  }, [pBio, pAir, pVidya, setPBioSync, setPAirSync, setPVidyaSync]);
  const dismissIdentityHint = useCallback(() => {
    setResonance((prev) => { const n = { ...prev, identityHint: null }; saveKey("simbiosi-data", n); return n; });
  }, []);
  // Crea davvero il percorso proposto da Simbiosi. Stessa disciplina di §1.3 (confermaPercorso in
  // Shell): si crea SOLO toccando il pulsante di questa card, mai da sola — e stessa forma di
  // creazione (decomposeTopics prima, mai un percorso senza nodi).
  const [percorsoSuggeritoStatus, setPercorsoSuggeritoStatus] = useState("idle"); // idle | creando | errore
  const acceptPercorsoSuggestion = useCallback(async (sugg) => {
    if (!sugg?.pillar || !sugg?.title) return;
    setPercorsoSuggeritoStatus("creando");
    try {
      const labels = await decomposeTopics(sugg.pillar, sugg.title, settingsRef.current);
      const p = { id: uid(), pillar: sugg.pillar, title: sugg.title, createdAt: new Date().toISOString(),
        topics: (labels.length ? labels : ["Primo passo"]).map((l) => ({ id: uid(), label: l, status: "non iniziato", lastTouched: null })),
        sessions: [], competenze: "" };
      const setter = { bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }[sugg.pillar];
      const list = { bio: pBio, air: pAir, vidya: pVidya }[sugg.pillar];
      setter([p, ...list]);
      setResonance((prev) => { const n = { ...prev, percorsoSuggerito: null }; saveKey("simbiosi-data", n); return n; });
      pushDebugLog({ type: "percorso-suggerito-simbiosi", esito: "creato", pillar: sugg.pillar, title: sugg.title });
      setPercorsoSuggeritoStatus("idle");
    } catch (e) { setPercorsoSuggeritoStatus("errore"); pushDebugLog({ type: "percorso-suggerito-simbiosi", esito: "errore", error: e.message }); }
  }, [pBio, pAir, pVidya, setPBioSync, setPAirSync, setPVidyaSync, pushDebugLog]);
  const dismissPercorsoSuggestion = useCallback(() => {
    setResonance((prev) => { const n = { ...prev, percorsoSuggerito: null }; saveKey("simbiosi-data", n); return n; });
    pushDebugLog({ type: "percorso-suggerito-simbiosi", esito: "scartato" });
  }, [pushDebugLog]);

  // ═══ SIMBIOSI PROATTIVA ═══
  // Al mount (una sola volta per sessione), se c'è una chiave API e se è cambiato qualcosa dall'ultima
  // valutazione, Simbiosi si auto-valuta in silenzio. Nessun timer, nessuna soglia di giorni (Bateson):
  // l'innesco è "è cambiato lo stato del sistema da quando ho guardato l'ultima volta?", giudizio
  // qualitativo delegato poi a computeResonance (worthSurfacing). Il risultato non interrompe: appare
  // solo come indicatore ● sul bottone SHELL/SIMBIOSI in Hub, che il Ghost trova quando entra.
  const proactiveRanRef = useRef(false);
  useEffect(() => {
    if (proactiveRanRef.current) return;
    proactiveRanRef.current = true;
    if (!settingsRef.current.apiKey) return; // niente API: niente valutazione
    // D4 — la Simbiosi proattiva parte da sola: e' esattamente il tipo di spesa che il Ghost non
      // vede partire, quindi si ferma al tetto.
    if (!operazioniAutomaticheConsentite()) {
      pushDebugLog({ type: "tetto-raggiunto", operazione: "simbiosi-proattiva", spesaMese: Number(spesaDelMeseCorrente().toFixed(4)), tetto: TETTO_MENSILE_USD });
      return;
    }
    // Ritardo: lascia finire mount + eventuale sync (che popola stateRef via applyMergedState) prima di valutare.
    const t = setTimeout(async () => {
      if (resonanceBusyRef.current) return; // recalc manuale già in volo: la proattiva si astiene
      const s = stateRef.current; // stato FRESCO (post-sync), non la closure del primo render (evita stale closure)
      // FASE 4 (BRIEF_blocco1 12/08/2026, gap segnalato dal Blocco 0): la memoria procedurale non
      // entrava mai nella firma — solo Log/Percorsi. Bug reale osservato: un aggiornamento di
      // memory.air (via reflectMemoriaBatch) non cambiava la firma, quindi non riattivava mai una
      // nuova valutazione anche quando la memoria fresca contraddiceva il giudizio già salvato.
      // Aggiunta SOLA inclusione richiesta dal Blocco 0, nessun altro cambio alla logica del gate.
      const memSedimentoLast = (pillar) => (s.memory?.[pillar]?.sedimento || []).slice(-1)[0]?.id || "";
      const signature = `${s.bio.length}|${s.air.length}|${s.vidya.length}|${s.pBio.length}|${s.pAir.length}|${s.pVidya.length}|${s.magi.length}|${s.bio[0]?.date||""}|${s.air[0]?.date||""}|${s.vidya[0]?.date||""}|${s.memory?.bio?.sedimento?.length||0}|${s.memory?.air?.sedimento?.length||0}|${s.memory?.vidya?.sedimento?.length||0}|${memSedimentoLast("bio")}|${memSedimentoLast("air")}|${memSedimentoLast("vidya")}|${s.memory?.bio?.corrente||""}|${s.memory?.air?.corrente||""}|${s.memory?.vidya?.corrente||""}`;
      if (signature === loadKey("simbiosi-eval-signature", "")) return; // nulla di nuovo dall'ultima valutazione
      resonanceBusyRef.current = true;
      try {
        const digest = buildResonanceDigest({ bio: s.bio, air: s.air, vidya: s.vidya, kernel: s.kernel, magi: s.magi, pBio: s.pBio, pAir: s.pAir, pVidya: s.pVidya, memory: s.memory });
        const titoliPercorsiEsistenti = [...s.pBio, ...s.pAir, ...s.pVidya].map((p) => p.title);
        const percorsoSuggeritoPendente = loadKey("simbiosi-data", {}).percorsoSuggerito || null;
        const res = await computeResonance(digest, settingsRef.current, recentShellText(s.shellChat), titoliPercorsiEsistenti, !!percorsoSuggeritoPendente);
        const next = { text: res.text, time: Date.now(), worthSurfacing: res.worthSurfacing, identityHint: res.identityHint || null, percorsoSuggerito: res.percorsoSuggerito || percorsoSuggeritoPendente };
        setResonance(next); saveKey("simbiosi-data", next);
        if (res.crystallization?.marginNote) {
          setShellChat((prev) => [...prev, { id: uid(), role: "balthasar-margin", pillar: res.crystallization.pillar || null, note: res.crystallization.marginNote }]);
        }
        saveKey("simbiosi-eval-signature", signature); // salvata SOLO dopo successo: un fallimento può riprovare al prossimo mount
        pushDebugLog({ type: "simbiosi-proactive", worthSurfacing: res.worthSurfacing, hasIdentityHint: !!res.identityHint, anchorsCount: res.anchors.length, anchors: res.anchors, error: null });
      } catch (e) { pushDebugLog({ type: "simbiosi-proactive", error: e.message }); } // signature NON salvata: si riproverà
      finally { resonanceBusyRef.current = false; }
    }, 3500);
    return () => clearTimeout(t);
  }, []); // intenzionalmente solo al mount; legge stato fresco via stateRef

  // GESTO A.2 — la postura si calcola qui, in modo sincrono, da stato che e' gia' in memoria perche'
  // caricato da localStorage al primo render. Sta quindi PRIMA di qualunque rete per costruzione,
  // non per accordo: non c'e' un punto in cui potrebbe aspettare qualcosa.
  // Si ricalcola quando cambiano i dati che la compongono — compreso subito dopo una nuova voce,
  // che e' cio' che fa muovere l'indicatore nel gesto B senza aspettare niente.
  const postura = calcolaPostura({ bio, air, vidya, pBio, pAir, pVidya, memory });
  const digestBio = `Kernel: ${kernel.content.slice(0, 300)}\nUltime voci BIO: ${bio.slice(0, 5).map((e) => e.notes || e.weight).join("; ")}\nPercorsi esistenti: ${pBio.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestAir = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi vettori AIR: ${air.slice(0, 5).map((e) => `${e.title} (${e.status})`).join("; ")}\nPercorsi esistenti: ${pAir.map((p) => p.title).join(", ") || "nessuno"}`;
  const digestVidya = `Kernel: ${kernel.content.slice(0, 300)}\nUltimi log VIDYA: ${vidya.slice(0, 5).map((e) => e.title).join("; ")}\nPercorsi esistenti: ${pVidya.map((p) => p.title).join(", ") || "nessuno"}`;
  // PUNTO 2 (BRIEF_correzioni_post_test 26/07/2026): badge sul tab AIR — "c'è qualcosa che avanza"
  // visibile senza dover entrare in Percorsi. "archived" è l'unico stato che non richiede attenzione.
  const activeSeedCount = semi.filter((s) => s.status !== "archived").length;

  return html`<div>
    <div class="r-ghost-texture"></div>
    <${HexTexture} />
    <div class="r-topbar"><div class="r-brand">RESONANCE<span>•</span></div></div>
    ${!ghostProfile && html`<${OnboardingView} onComplete=${saveGhostProfile} settings=${settings} driveRecovery=${driveRecovery} onRecoverFromDrive=${recoverFromDrive} />`}
    ${ghostProfile && html`<div>
    <${FeedbackWidget} view=${view} pushDebugLog=${pushDebugLog} />
    ${view === "hub" && html`<${Hub} bio=${bio} air=${air} vidya=${vidya} magi=${magi} resonance=${resonance} setView=${setView} pBio=${pBio} pAir=${pAir} pVidya=${pVidya} proactiveHint=${resonance.worthSurfacing} postura=${postura} />`}
    ${view === "shell" && html`<${ShellView} messages=${shellChat} setMessages=${setShellChat} settings=${settings} addBio=${addBio} addAir=${addAir} addVidya=${addVidya} aggiungiDaLettura=${aggiungiDaLettura}
      percorsi=${{ bio: pBio, air: pAir, vidya: pVidya }} setPercorsi=${{ bio: setPBioSync, air: setPAirSync, vidya: setPVidyaSync }}
      memory=${memory} updateMemoria=${updateMemoria} styleMemory=${styleMemory} setStyleMemory=${setStyleMemory} bio=${bio} air=${air} vidya=${vidya} pushDebugLog=${pushDebugLog}
      addSeed=${addSeed} advanceSeedIfDue=${advanceSeedIfDue} shellDraft=${shellDraft} consumeShellDraft=${() => setShellDraft("")}
      pBio=${pBio} pAir=${pAir} pVidya=${pVidya} semi=${semi}
      ghostProfile=${ghostProfile} saveGhostProfile=${saveGhostProfile} />`}
    ${view === "bio" && html`<${BioView} entries=${bio} onAdd=${addBio} onDelete=${delBio} percorsi=${pBio} setPercorsi=${setPBioSync} settings=${settings} digest=${digestBio} memory=${memory} />`}
    ${view === "air" && html`<${AirView} entries=${air} onAdd=${addAir} onDelete=${delAir} percorsi=${pAir} setPercorsi=${setPAirSync} settings=${settings} digest=${digestAir} memory=${memory}
      semi=${semi} onAddSeed=${(content) => addSeed(content, "manual")} onApproveSeedStrategy=${approveSeedStrategy} onUnlockGatedSeed=${unlockGatedSeed} onDiscussInShell=${discussSeedInShell} pushDebugLog=${pushDebugLog} advanceSeedIfDue=${advanceSeedIfDue} onArchiveSeed=${archiveSeed} />`}
    ${view === "vidya" && html`<${VidyaView} entries=${vidya} onAdd=${addVidya} onDelete=${delVidya} percorsi=${pVidya} setPercorsi=${setPVidyaSync} settings=${settings} digest=${digestVidya} memory=${memory} />`}
    ${view === "magi" && html`<${MagiView} sessions=${magi} onSave=${addMagi} onDelete=${delMagi} settings=${settings} memory=${memory} updateMemoria=${updateMemoria} pushDebugLog=${pushDebugLog} />`}
    ${view === "simbiosi" && html`<${SimbiosiView} resonance=${resonance} onRecalc=${recalcResonance} calculating=${resCalculating} error=${resError} onPromoteIdentity=${promoteToIdentity} onDismissIdentity=${dismissIdentityHint} onAcceptPercorsoSuggestion=${acceptPercorsoSuggestion} onDismissPercorsoSuggestion=${dismissPercorsoSuggestion} percorsoSuggeritoStatus=${percorsoSuggeritoStatus} />`}
    ${view === "kernel" && html`<${KernelView} kernel=${kernel} onSave=${saveKernel} driveStatus=${driveStatus} />`}
    ${view === "settings" && html`<${SettingsView} settings=${settings} updateSettings=${updateSettings} driveStatus=${driveStatus} debugLog=${debugLog} clearDebugLog=${clearDebugLog} pullAndMergeOnce=${pullAndMergeOnce} ghostProfile=${ghostProfile} saveGhostProfile=${saveGhostProfile} />`}
    <div class="r-tab-bar"><div class="r-tab-bar-inner">${TABS.map((t) => html`<button class="r-tab ${view === t.key ? "active" : ""}" onClick=${() => setView(t.key)}>${t.label}${t.key === "air" && activeSeedCount > 0 ? html`<span class="r-tab-badge">${activeSeedCount}</span>` : ""}</button>`)}</div></div>
    </div>`}
  </div>`;
}
render(html`<${App} />`, document.getElementById("app"));
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
