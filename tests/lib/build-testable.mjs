// Ricostruisce app.js come modulo testabile in Node, SENZA toccare app.js.
//
// Perché esiste: fino a stanotte questa trasformazione viveva a mano, rifatta ogni volta con
// comandi bash in una cartella scratch (/tmp) — e infatti è sparita con un riavvio del
// contenitore, portandosi via l'intero banco di prova costruito in una serata. Questo file
// rigenera SEMPRE il modulo testabile dal vero app.js corrente (mai una copia congelata), quindi
// non può disallinearsi da app.js come succedeva prima, e vive nel repository — sopravvive a un
// riavvio.
//
// 31/08/2026 — RISCRITTO PERCHÉ app.js NON È PIÙ UN FILE SOLO. La prima versione tagliava "le prime
// 12 righe" e "le ultime 2": numeri fissi, che hanno smesso di essere veri nel momento in cui parte
// del codice è uscita in lib/*.js e sono comparse nuove righe di import. Ora niente più conteggi:
// le importazioni browser-only si riconoscono da cosa importano, e quelle verso i moduli estratti
// vengono solo riscritte col percorso giusto per questa cartella. Un modulo estratto viene provato
// per quello che è — un vero modulo importato da Node — invece che come testo ritagliato.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RADICE = join(HERE, "..", "..");
const APP_JS_PATH = join(RADICE, "app.js");
// Un nome per processo, non uno fisso: `node --test` esegue piu' file di prova insieme, e due
// processi che scrivono e leggono lo STESSO file generato nello stesso istante si calpesterebbero
// a vicenda. Il pid basta a distinguerli senza bisogno di un lock.
const OUT_PATH = join(HERE, `.generated-app.${process.pid}.mjs`);

// I moduli estratti da app.js: importati davvero, non ritagliati. L'elenco sta qui perche' la
// generazione deve fallire subito e a voce alta se un modulo viene rinominato o sparisce.
const MODULI = ["lib/base.js", "lib/misure.js", "lib/griglia.js", "lib/plasmide.js", "lib/capitolato.js", "lib/alimentare.js"];

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

// ── IndexedDB finto (13/09/2026) ────────────────────────────────────────────────────────────────
// Senza questo, in Node \`indexedDB\` non esiste, \`_idbAttivo\` resta false e il codice del magazzino
// dei testi NON VIENE MAI ESEGUITO dal banco: le prove sarebbero verdi su un ramo morto. Che è
// esattamente la forma di buco che questo progetto ha già trovato tre volte.
// Copre solo ciò che app.js usa davvero: open/createObjectStore/transaction/put/get/getAll/
// getAllKeys, con i risultati che arrivano DOPO il blocco sincrono, come nel browser vero — è quel
// dettaglio di tempi che fa fallire un wrapper scritto male, e va riprodotto.
const __idbDati = new Map();
globalThis.__idbDati = __idbDati;
globalThis.__idbGuasto = null; // "scrittura" | "lettura" | "apertura" — per far dire no al magazzino
function __richiesta(esegui) {
  const req = { onsuccess: null, onerror: null, result: undefined };
  queueMicrotask(() => {
    try { req.result = esegui(); req.onsuccess && req.onsuccess(); }
    catch (e) { req.error = e; req.onerror && req.onerror(); }
  });
  return req;
}
function __negozioFinto(tx) {
  const vietato = (modo) => {
    if (globalThis.__idbGuasto === "scrittura" && modo === "w") throw new Error("magazzino in sola lettura (finto)");
    if (globalThis.__idbGuasto === "lettura" && modo === "r") throw new Error("magazzino illeggibile (finto)");
  };
  return {
    put(valore, chiave) { return __richiesta(() => { vietato("w"); __idbDati.set(String(chiave), valore); tx.__conta++; return chiave; }); },
    get(chiave) { return __richiesta(() => { vietato("r"); return __idbDati.get(String(chiave)); }); },
    getAll() { return __richiesta(() => { vietato("r"); return Array.from(__idbDati.values()); }); },
    getAllKeys() { return __richiesta(() => { vietato("r"); return Array.from(__idbDati.keys()); }); },
    delete(chiave) { return __richiesta(() => { vietato("w"); __idbDati.delete(String(chiave)); return undefined; }); },
  };
}
globalThis.__accendiIdb = () => {
  globalThis.indexedDB = {
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null };
      queueMicrotask(() => {
        if (globalThis.__idbGuasto === "apertura") { req.error = new Error("apertura negata (finta)"); req.onerror && req.onerror(); return; }
        req.result = {
          createObjectStore() { return {}; },
          transaction() {
            const tx = { oncomplete: null, onerror: null, onabort: null, __conta: 0 };
            tx.objectStore = () => __negozioFinto(tx);
            // Due giri di microtask: le richieste si risolvono nel primo, la transazione si chiude
            // nel secondo. Nel browser vero oncomplete arriva DOPO tutti gli onsuccess.
            queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => tx.oncomplete && tx.oncomplete())));
            return tx;
          },
        };
        req.onupgradeneeded && req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
};
globalThis.__spegniIdb = () => { delete globalThis.indexedDB; __idbDati.clear(); globalThis.__idbGuasto = null; };
`;

// Nomi che i test possono chiedere. Un nome qui che non esiste (piu') ne' in app.js ne' in un modulo
// estratto fa fallire la generazione SUBITO, con un errore leggibile — non un test che fallisce
// misteriosamente dopo.
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
  "eRigaDiTabella", "eRigaSeparatriceTabella", "celleDiRigaTabella", "parseTabellaMarkdown",
  "costruisciTabellaDocx",
  "richiestaDiPianoAlimentare", "estraiParametriPiano", "validaRepertorio",
  "montaPianoAlimentare", "formatPianoAlimentare", "filtraRepertorioPerVincoli", "alimentiEsclusiDaiVincoli",
  "salvaRichiestaInSospeso", "chiudiRichiestaInSospeso", "leggiRichiestaInSospeso",
  "controllaPianoAlimentare", "giorniDelPiano", "analizzaVincoloAlimentare", "alimentiDaCercare",
  "eGuastoDiRete", "FINESTRA_RIPRESA_MS",
  "numeroItaliano", "oreDaTesto", "fattiDaLogBio", "serieDi", "derivata", "freschezza",
  "numeroBreve", "etaInParole", "righeSerie", "formatSerieBlock",
  "GIORNI_FRESCO", "GIORNI_STANTIO", "PESO_MIN", "PESO_MAX",
  "analizzaParametroPercorso", "testoDaSalvare", "LUNGHEZZA_MINIMA_SALVABILE",
  "indiceDocumentiBlock", "ripulisciAffermazioniDiEsito", "ESITO_COMPIUTO_RE",
  "similaritaTesti", "voceGemella", "fondiOAggiungiVoce", "SOGLIA_VOCE_GEMELLA",
  "dossierPercorso", "formatFuocoBlock", "trovaDocumentoNelPercorso", "formatDocumentoAperto",
  "TETTO_DOCUMENTO_NEL_TURNO", "contenutoDelPercorso",
  "leggiDiagnosticaRicerca", "diagnosticaVuota", "detectPossibleHallucinatedSource",
  "memoriaEstesaPerMagi", "MAGI_FRAMMENTI_PER_PILASTRO", "MAGI_TETTO_FRAMMENTO",
  "nodoPerDocumento", "materialeDelNodo", "numeriDelTitolo",
  "contaPercorso", "costruisciInventario",
  "finestraConversazione", "ORE_DI_STACCO_CONVERSAZIONE", "titoloSuggeritoDaTesto",
  "senzaDeliberazione", "testoDelMagio", "LUNGHEZZA_MINIMA_MAGI", "MAGI_TETTO_PAROLE",
  "documentoDaContesto", "cercaNellaMemoria", "TETTO_DOCUMENTO_IN_RICERCA",
  "montaGriglia", "scegliMenoRecente", "DISTANZA_MINIMA_RIPETIZIONE", "MARCHI_NOTI",
  "OSSERVABILI", "osservabileDi", "registraAtto", "leggiAtti", "statoAtto", "formatAnelloBlock",
  "ATTI_KEY", "ATTI_TETTO", "buildResonanceDigest",
  "DEGENERATE_QUOTA_NON_LATINA", "DEGENERATE_MIN_LETTERE_NON_LATINE",
  "ragionamentoObbligatorioPer", "segnaRagionamentoObbligatorio",
  "RINUNCE_POSSIBILI", "rinunciaPerErrore", "rinunceDelModello", "segnaRinuncia",
  "senzaRinuncia", "corpoPerIlModello", "TETTO_RIPIEGHI", "MODELLI_RINUNCE_KEY",
  "modelliConRagionamentoObbligatorio", "MODELLI_RAGIONAMENTO_OBBLIGATORIO_NOTI",
  "ATTACCHI", "attaccoDi", "validaPlasmide", "contieneDatiPersonali", "improntaPlasmide",
  "nuovaVersioneDi", "impacchetta", "spacchetta", "PROVE_MINIME", "PLASMIDE_VERSIONE_FORMATO",
  "PLASMIDI_KEY", "leggiPlasmidi", "salvaPlasmide", "dimenticaPlasmide", "plasmidiPerAttacco",
  "segnaPlasmideUsato", "NOMI_DA_CHIUDERE", "SANDBOX_TETTO_MS",
  "eRifacimento", "registraTrappola", "leggiTrappole", "dimenticaTrappola",
  "TRAPPOLE_KEY", "TRAPPOLE_TETTO", "LUNGHEZZA_MINIMA_RIFATTA",
  "REQUISITI", "montaCapitolato", "briefDelCapitolato", "confrontaColCapitolato",
  "briefDelDisaccordo", "frammentoCopiato", "rispettaIlContratto", "TETTO_GENERAZIONE",
  "COPIATURA_MINIMA", "CASI_MOSTRATI", "CASO_MAX_CARATTERI",
  "terminiVietatiDelGhost", "TRAPPOLA_DA_GUASTO_RE", "guastiDaTrappole", "CONTROLLI_SANI",
  "generaPlasmide", "registraGenerazione", "leggiGenerazioni", "dimenticaGenerazione",
  "GENERAZIONI_KEY", "GENERAZIONI_TETTO", "SISTEMA_GENERATORE",
  "leggiNoteDiRete", "registraNotaDiRete", "provaSulBanco",
  "STATI_SEME", "statoSeme", "semeVivo", "semeAvanzabile", "semeInEsecuzione", "SEME_STATUS_LABELS",
  "mergeTracce", "mergeById", "mergeSyncState", "SYNC_DEFAULTS", "buildFullBackup",
  "restoreFullBackup", "BACKUP_KEYS",
  // 09/09/2026 — i tre nomi che il report del mattino ha misurato IRRAGGIUNGIBILI dal banco, ed
  // erano i tre punti in cui il sistema tocca il mondo. L'export da solo non difende niente: il
  // valore sta nelle prove che lo fanno fallire (identita-e-recinto.test.mjs).
  "INVOLUCRO_SANDBOX", "redactProfessionalIdentity", "APP_CAPABILITIES_CONTEXT",
  "normalizeGhostProfile", "DEFAULT_GHOST_PROFILE",
  // 10/09/2026 — il caso «non esistono»: la ricerca che non vedeva i numeri romani, e il filtro
  // sulle negazioni che non c'era.
  "TETTO_FRAMMENTI_RICERCA", "SEQUENZA_NEL_TITOLO_PUNTI", "coppieContigueNelTitolo",
  "rilevaNegazioneDiMateriale", "smentisciAssenzaDiMateriale", "NEGA_ESISTENZA_RE",
  // 10/09/2026 — il testo che va alla voce.
  "perLaVoce", "tabellaParlata", "VOCE_DI_ELENCO_RE", "RIGHELLO_RE", "PILLAR_CTX",
  // 12/09/2026 — il controllo di ingegneria. Sei punti, ognuno con la sua misura, ognuno con le
  // prove che lo difendono: il tetto di spesa che non poteva scattare, saveKey che falliva muta,
  // gli archivi che non lasciavano mai il dispositivo, e il blocco delle capacità a richiamo.
  "saveKey", "loadKey", "memoriaPiena", "dimenticaMemoriaPiena", "quandoLaMemoriaSiRiempie",
  "leggiSpesa", "registraSpesa", "spesaDelMeseCorrente", "tokenDelMeseCorrente",
  "motivoTettoRaggiunto", "operazioniAutomaticheConsentite", "ilFornitoreMandaIlCosto", "logAiCost",
  "TETTO_MENSILE_USD", "TETTO_MENSILE_TOKEN", "SPESA_KEY", "SPESA_STORICO_MESI",
  "compactShellChatIfNeeded", "SHELL_CHAT_COMPACT_TRIGGER", "SHELL_CHAT_KEEP_RECENT",
  "sfollaArchiviSuDrive", "chiaviArchivioChat", "leggiArchiviSuDrive",
  "ARCHIVI_LOCALI_DA_TENERE", "ARCHIVI_SU_DRIVE_KEY", "BACKUP_ARCHIVE_PREFIX",
  "nomeFileVersionato", "CHAT_SYNC_INTERVALLO_MS", "chiaveIdempotenza",
  "CAPACITA", "CAPACITA_INDICIZZATE", "CAPACITA_RICHIAMATE_MAX", "capacitaRichiamate",
  "costruisciBloccoCapacita", "CAPACITA_INTESTAZIONE", "CAPACITA_CHIUSURA",
  // 13/09/2026 — il magazzino dei testi: i documenti escono da localStorage.
  "caricaTestiDocumenti", "migraTestiInIdb", "salvaPercorsi", "leggiPercorsi",
  "percorsiSnelli", "percorsiPieni", "coppieDiTesto", "CHIAVI_PERCORSI",
  "IDB_NOME", "IDB_NEGOZIO", "scriviTestiDocumenti", "testiDavveroNelMagazzino",
  "BACKUP_FORMAT_VERSION",
  // 14/09/2026 — i numeri detti a parole, dal banco microfono fatto in macchina.
  "numeroDaParola", "numeriChiestiForti", "formeDelToken", "paroleUtili",
  "DESTINAZIONI", "TABS", "comandoDiNavigazione", "VERBI_NAVIGAZIONE", "RIEMPITIVI_NAVIGAZIONE",
  "ROMANI_A_NUMERO", "ORDINALI_A_NUMERO",
];

// Le importazioni che in Node non hanno senso e vengono sostituite dagli stub qui sopra.
const IMPORT_BROWSER_RE = /^import\s.*from\s+"\.\/(?:vendor\/|config\.js)/;
// Le due righe finali che montano l'app nel DOM reale: `render(...)` e la registrazione del
// service worker. Riconosciute da cosa fanno, non da dove stanno.
const RIGA_DI_MONTAGGIO_RE = /^\s*(?:render\(|(?:if\s*\()?["']serviceWorker["']\s+in\s+navigator|navigator\.serviceWorker)/;

export function buildTestableApp() {
  const src = readFileSync(APP_JS_PATH, "utf8");
  const righe = src.split("\n");

  const corpo = righe
    .filter((l) => !IMPORT_BROWSER_RE.test(l) && !RIGA_DI_MONTAGGIO_RE.test(l))
    // Le importazioni verso i moduli estratti restano — vanno solo ripuntate: il file generato vive
    // in tests/lib/, non nella radice del progetto.
    .map((l) => l.replace(/from\s+"\.\/lib\//, 'from "../../lib/'))
    .join("\n");

  // Dove vive ogni nome richiesto: nel corpo di app.js, o in uno dei moduli estratti?
  const testiModuli = Object.fromEntries(MODULI.map((m) => [m, readFileSync(join(RADICE, m), "utf8")]));
  const nelCorpo = [], daiModuli = [], mancanti = [];
  for (const n of EXPORT_NAMES) {
    const re = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function|const|let|var|class)\\s+${n}\\b|,\\s*${n}\\s*=`, "m");
    if (re.test(corpo)) nelCorpo.push(n);
    else if (MODULI.some((m) => re.test(testiModuli[m]))) daiModuli.push(n);
    else mancanti.push(n);
  }
  if (mancanti.length) {
    throw new Error(`build-testable: questi nomi non esistono (piu') ne' in app.js ne' in ${MODULI.join("/")}, aggiorna EXPORT_NAMES: ${mancanti.join(", ")}`);
  }

  // I nomi che vivono nei moduli si ri-esportano dalla loro fonte vera. Quelli che app.js importa
  // per uso proprio non vanno ri-dichiarati qui: sarebbero un doppione dello stesso binding.
  const riesporta = MODULI.map((m) => `export * from "../../${m}";`).join("\n");
  const out = `${STUB_HEADER}${corpo}\n${riesporta}\nexport { ${nelCorpo.join(", ")} };\n`;
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
