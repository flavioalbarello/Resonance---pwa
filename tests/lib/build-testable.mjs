// Ricostruisce app.js come modulo testabile in Node, SENZA toccare app.js.
//
// Perché esiste: fino a stanotte questa trasformazione viveva a mano, rifatta ogni volta con
// comandi bash in una cartella scratch (/tmp) — e infatti è sparita con un riavvio del
// contenitore, portandosi via l'intero banco di prova costruito in una serata. Questo file
// rigenera SEMPRE il modulo testabile dal vero app.js corrente (mai una copia congelata), quindi
// non può disallinearsi da app.js come succedeva prima, e vive nel repository — sopravvive a un
// riavvio.
//
// Cosa fa: legge app.js, toglie le 4 importazioni browser-only (preact/htm/config — non servono
// e non esistono in Node), le sostituisce con stub minimi, toglie le due righe finali che montano
// l'app nel DOM reale (`render(...)`, la registrazione del service worker), ed esporta tutto ciò
// che i test chiedono.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = join(HERE, "..", "..", "app.js");
// Un nome per processo, non uno fisso: `node --test` esegue piu' file di prova insieme, e due
// processi che scrivono e leggono lo STESSO file generato nello stesso istante si calpesterebbero
// a vicenda. Il pid basta a distinguerli senza bisogno di un lock.
const OUT_PATH = join(HERE, `.generated-app.${process.pid}.mjs`);

const STUB_HEADER = `// FILE GENERATO — non modificare a mano. Rigenerato da tests/lib/build-testable.mjs
// da app.js ad ogni esecuzione dei test. Se lo modifichi qui, il prossimo test lo sovrascrive.
const h = () => {};
const render = () => {};
const useState = (v) => [v, () => {}];
const useEffect = () => {};
const useCallback = (fn) => fn;
const useRef = (v) => ({ current: v });
const useErrorBoundary = () => [null, () => {}];
const htm = { bind: () => () => {} };
const CONFIG = { GOOGLE_CLIENT_ID: "", GOOGLE_DRIVE_SCOPE: "", FEEDBACK_EMAIL: "" };
// localStorage finto, fedele all'API reale usata da app.js (getItem/setItem/key/length/removeItem).
const __store = new Map();
const localStorage = {
  get length() { return __store.size; },
  key(i) { return Array.from(__store.keys())[i] ?? null; },
  getItem(k) { return __store.has(k) ? __store.get(k) : null; },
  setItem(k, v) { __store.set(String(k), String(v)); },
  removeItem(k) { __store.delete(k); },
  clear() { __store.clear(); },
};
globalThis.__store = __store;
`;

// Nomi che i test possono chiedere. Un nome qui che non esiste (piu') in app.js fa fallire la
// generazione SUBITO, con un errore leggibile — non un test che fallisce misteriosamente dopo.
const EXPORT_NAMES = [
  "trovaEventoBersaglio", "formatBersaglioRicerca", "componiRisultatoRicerca",
  "AZIONI_CONVERSAZIONALI", "richiedeConfermaEsplicita", "eseguibileSubito",
  "PAROLE_DELLE_CAPACITA", "capacitaNominata", "VERBI_AZIONE", "meritaTurnoDiSelezione",
  "formatDataPerEsteso", "FINESTRA_RICERCA_BERSAGLIO_GIORNI", "ripulisciContenutiDiCalendario",
  "candidataTrovaEventoDiretta", "TROVA_EVENTO_DIRETTO_RE", "formatAzioniBlock", "azioniAttive",
  "scriviInterruttore", "leggiInterruttori", "estraiBersaglioPerRicercaDiretta",
  "RUMORE_BERSAGLIO_RE", "extractUsageForLog", "detectPercorsoProposalHeuristic",
  "titoloUsabile", "troncaAConfineDiParola", "validaPercorsoSuggerito", "eVincoloAlimentare",
  "trovaMetaNarrazione", "META_NARRAZIONE_RE",
  "tettoTokenPerIlTurno", "TETTO_TOKEN_CONVERSAZIONE", "TETTO_TOKEN_CONTENUTO_LUNGO",
  "isDegenerateOutput", "diagnosiDegenerazione", "senzaFormattazioneMarkdown",
];

export function buildTestableApp() {
  const src = readFileSync(APP_JS_PATH, "utf8");
  const allLines = src.split("\n");
  // Un file che finisce con newline produce un ultimo elemento vuoto dopo lo split: va tolto PRIMA
  // di contare "le ultime 2 righe", altrimenti si toglie la riga vuota e quella sbagliata (bug
  // reale, trovato scrivendo questo stesso file: `render(...)` restava dentro per errore).
  const lines = allLines[allLines.length - 1] === "" ? allLines.slice(0, -1) : allLines;
  // Le prime 12 righe sono le importazioni browser-only (vedi STUB_HEADER sopra, le sostituisce).
  // Le ultime 2 righe montano l'app nel DOM reale: non hanno senso in Node e nessun test le chiama.
  const body = lines.slice(12, -2).join("\n");
  const missing = EXPORT_NAMES.filter((n) => !new RegExp(`\\b${n}\\b`).test(body));
  if (missing.length) {
    throw new Error(`build-testable: questi nomi non esistono (piu') in app.js, aggiorna EXPORT_NAMES: ${missing.join(", ")}`);
  }
  const tail = `\nexport { ${EXPORT_NAMES.join(", ")} };\n`;
  const out = STUB_HEADER + body + tail;
  mkdirSync(HERE, { recursive: true });
  writeFileSync(OUT_PATH, out, "utf8");
  return OUT_PATH;
}

// Quello che ogni file di prova chiama davvero: genera e importa in un colpo solo.
export async function loadApp() {
  const path = buildTestableApp();
  return import(`file://${path}`);
}

// Eseguito direttamente (non importato): rigenera e basta, utile per debug manuale.
if (import.meta.url === `file://${process.argv[1]}`) {
  const p = buildTestableApp();
  console.log(`Rigenerato: ${p}`);
}
