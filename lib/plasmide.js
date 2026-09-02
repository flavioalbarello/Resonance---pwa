// ══════════════════════════════════════════════════════════════════════════════
// IL PLASMIDE — 02/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Da dove viene. Il Ghost: «vorrei che in una certa misura l'app fosse in grado di autoprogrammarsi
// e autoprodurre strumenti propri per la risoluzione di un problema incontrato, e che queste
// competenze acquisite fossero trasferibili come un plasmide tra due batteri».
//
// COS'È UN PLASMIDE, E PERCHÉ IL NOME È GIUSTO. In biologia è un anello di DNA separato dal
// cromosoma: porta una FUNZIONE (la resistenza a un antibiotico), non l'identità della cellula;
// passa in orizzontale fra cellule anche di specie diverse; l'ospite può esprimerlo o perderlo; e
// porta con sé la propria origine di replicazione — è mantenibile senza chi l'ha generato.
// Tradotto qui, le cinque proprietà diventano cinque vincoli di progetto, non metafore:
//   1. FUORI DAL CROMOSOMA — un plasmide non sta in app.js e non passa da un deploy. Il merge fra
//      `main` e `stable` è ereditarietà VERTICALE; questo è orizzontale, ed è il punto.
//   2. PORTA FUNZIONE, NON IDENTITÀ — zero dati personali dentro. Non è igiene: è il vincolo
//      assoluto del progetto. Un plasmide che portasse un frammento di memoria AIR nell'app di
//      Marta sarebbe insieme una fuga di dati e una violazione della compartimentazione.
//   3. TRASFERIMENTO ORIZZONTALE — un file. Si esporta, si importa.
//   4. L'OSPITE PUÒ RIFIUTARE — e soprattutto NON SI FIDA: rigira le prove sul proprio dispositivo
//      prima di esprimere lo strumento. È l'immunità, ed è la parte che rende la cosa onesta.
//   5. ORIGINE DI REPLICAZIONE PROPRIA — porta le proprie prove con sé. Uno strumento che dice di
//      funzionare non vale niente; uno che passa le proprie prove sul telefono è qualcosa.
//
// COSA UN PLASMIDE NON PUÒ ESSERE, e va detto qui perché è il confine dell'intera idea: una
// FUNZIONE PURA e basta. Dato in ingresso, dato in uscita. Niente rete, niente localStorage, niente
// interfaccia. Tutto ciò che tocca il mondo — Printify, mail, calendario, Drive — resta nel registro
// degli effettori, chiuso e scritto a mano. L'invariante del progetto («il modello NON inventa
// azioni a runtime... è la sola ragione per cui l'impianto è ispezionabile») non viene cancellato:
// viene spostato nel punto dove serve davvero, cioè davanti alle azioni irreversibili.
//
// Questo file è la parte PURA: la forma, la validazione, il guardiano dei dati personali,
// l'impronta. Non tocca il browser, quindi si prova in Node come tutto il resto.

const PLASMIDE_VERSIONE_FORMATO = 1;
// Un plasmide che non dichiara a cosa serve non è mantenibile da chi lo riceve: fra un mese, sul
// telefono di un'altra persona, "cosa fa questo" deve essere leggibile senza leggere il codice.
const CAMPI_OBBLIGATORI = ["id", "nome", "problema", "attacco", "codice", "prove"];
// Gli attacchi esistenti: i punti dell'app dove uno strumento acquisito può essere chiamato.
// L'elenco è FISSO e scritto a mano, ed è la vera misura di quanto l'app può crescere: il modello
// genera l'organo, ma l'attacco dove innestarlo lo decide chi scrive app.js. Un plasmide che
// dichiara un attacco inesistente non entra — meglio rifiutarlo che tenerlo lì senza che lo chiami
// mai nessuno (è il modo in cui un magazzino di strumenti diventa cianfrusaglia).
const ATTACCHI = [
  {
    id: "criterio-degenerazione",
    etichetta: "Riconoscere una risposta guasta del modello",
    // Contratto: (testo: string) => null | { criterio: string, ...prove del sospetto }
    descrizione: "Riceve il testo di una risposta del modello. Restituisce null se va bene, oppure un oggetto con un campo \"criterio\" e i numeri su cui si basa il sospetto.",
    ingresso: "string",
  },
];
const attaccoDi = (id) => ATTACCHI.find((a) => a.id === id) || null;

// ── IL GUARDIANO DEI DATI PERSONALI ─────────────────────────────────────────────────────────────
// Euristica dichiarata, non una garanzia: riduce il rischio, non lo elimina. La garanzia vera resta
// il gesto — il Ghost VEDE il plasmide prima di esportarlo. Stessa forma di ogni altra scrittura in
// quest'app: il programma controlla, la persona decide.
// Cosa cerca: indirizzi di posta, numeri di telefono, sequenze lunghe di cifre (identificativi,
// misure, date di nascita), e i termini dell'identità professionale che il Ghost ha dichiarato —
// quelli arrivano dal chiamante perché questo file non conosce il profilo.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const TELEFONO_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){9,}/;
const CIFRE_LUNGHE_RE = /\b\d{6,}\b/;
function contieneDatiPersonali(plasmide, terminiVietati = []) {
  // Si guarda TUTTO il plasmide serializzato, non solo il codice: i dati personali finiscono nelle
  // PROVE molto più facilmente che nel codice — è lì che un modello mette un caso reale preso dal
  // log invece di inventarne uno.
  const testo = JSON.stringify(plasmide || {});
  const trovati = [];
  if (EMAIL_RE.test(testo)) trovati.push("un indirizzo di posta");
  if (TELEFONO_RE.test(testo)) trovati.push("qualcosa che somiglia a un numero di telefono");
  if (CIFRE_LUNGHE_RE.test(testo)) trovati.push("una sequenza lunga di cifre");
  for (const t of terminiVietati) {
    const term = String(t || "").trim();
    if (term.length >= 3 && new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(testo)) {
      trovati.push(`il termine dichiarato come da non esporre ("${term}")`);
    }
  }
  return trovati;
}

// ── VALIDAZIONE ─────────────────────────────────────────────────────────────────────────────────
// Rifiuta con un MOTIVO leggibile, mai con un false secco: chi riceve un plasmide rifiutato deve
// poter capire perché senza aprire il codice.
// LE PROVE SONO OBBLIGATORIE E DEVONO ESSERE ALMENO DUE. Una sola prova la passa anche una funzione
// che restituisce sempre la stessa cosa — e per un criterio di guasto la seconda prova serve a
// dimostrare che sa anche dire di NO, che è il caso in cui i falsi positivi fanno danno.
const PROVE_MINIME = 2;
const CODICE_MAX = 8000;
function validaPlasmide(plasmide) {
  const errori = [];
  const p = plasmide || {};
  for (const c of CAMPI_OBBLIGATORI) {
    const v = p[c];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) errori.push(`manca "${c}"`);
  }
  if (p.attacco && !attaccoDi(p.attacco)) errori.push(`l'attacco "${p.attacco}" non esiste in questa versione dell'app`);
  if (typeof p.codice === "string" && p.codice.length > CODICE_MAX) errori.push(`il codice supera i ${CODICE_MAX} caratteri`);
  if (!Array.isArray(p.prove)) {
    if (p.prove !== undefined) errori.push("le prove devono essere un elenco");
  } else {
    if (p.prove.length < PROVE_MINIME) errori.push(`servono almeno ${PROVE_MINIME} prove (una sola la passa anche una funzione che risponde sempre uguale)`);
    p.prove.forEach((pr, i) => {
      if (!pr || typeof pr !== "object") { errori.push(`la prova ${i + 1} non è un oggetto`); return; }
      if (!("ingresso" in pr)) errori.push(`la prova ${i + 1} non dice cosa dare in ingresso`);
      if (!("atteso" in pr)) errori.push(`la prova ${i + 1} non dice cosa ci si aspetta`);
      if (!pr.perche || !String(pr.perche).trim()) errori.push(`la prova ${i + 1} non dice PERCHÉ — una prova senza motivo non si può giudicare fra un mese`);
    });
  }
  return { valido: errori.length === 0, errori };
}

// ── IMPRONTA ────────────────────────────────────────────────────────────────────────────────────
// Serve a due cose concrete: riconoscere che due app hanno lo STESSO strumento (evitando doppioni
// al trasferimento), e accorgersi che un plasmide è cambiato rispetto a quello che era stato
// provato. Non è una firma: non dimostra CHI l'ha scritto, dimostra solo che il contenuto è quello.
// djb2, deterministico, nessuna dipendenza: qui non serve crittografia, serve un identificatore
// stabile e uguale su ogni dispositivo.
function improntaPlasmide(plasmide) {
  const materia = JSON.stringify({ codice: plasmide?.codice || "", prove: plasmide?.prove || [], attacco: plasmide?.attacco || "" });
  let h = 5381;
  for (let i = 0; i < materia.length; i++) h = ((h << 5) + h + materia.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// Legge 14 anche qui: un plasmide che evolve non sovrascrive il precedente, diventa V+1 e si porta
// dietro l'impronta di quello da cui viene. Così la storia di uno strumento resta leggibile.
function nuovaVersioneDi(plasmide, cambiamenti) {
  return {
    ...plasmide, ...cambiamenti,
    versione: (Number(plasmide?.versione) || 1) + 1,
    derivaDa: improntaPlasmide(plasmide),
    formato: PLASMIDE_VERSIONE_FORMATO,
  };
}

// ── IL PACCHETTO DI TRASFERIMENTO ───────────────────────────────────────────────────────────────
// Quello che viaggia fra due app. Dichiara il formato, così un'app più vecchia sa dire "questo non
// lo so leggere" invece di leggerlo male.
function impacchetta(plasmidi, origine) {
  return {
    tipo: "resonance-plasmidi", formato: PLASMIDE_VERSIONE_FORMATO,
    creato: new Date().toISOString(), origine: origine || null,
    plasmidi: (plasmidi || []).map((p) => ({ ...p, formato: PLASMIDE_VERSIONE_FORMATO })),
  };
}
function spacchetta(pacchetto) {
  if (!pacchetto || pacchetto.tipo !== "resonance-plasmidi") {
    return { ok: false, motivo: "questo file non è un pacchetto di plasmidi di Resonance", plasmidi: [] };
  }
  if (Number(pacchetto.formato) > PLASMIDE_VERSIONE_FORMATO) {
    return { ok: false, motivo: `il pacchetto usa il formato ${pacchetto.formato}, questa app arriva al ${PLASMIDE_VERSIONE_FORMATO}: aggiorna l'app invece di importarlo a metà`, plasmidi: [] };
  }
  const plasmidi = Array.isArray(pacchetto.plasmidi) ? pacchetto.plasmidi : [];
  return { ok: true, motivo: "", plasmidi, origine: pacchetto.origine || null };
}

export {
  PLASMIDE_VERSIONE_FORMATO, CAMPI_OBBLIGATORI, ATTACCHI, attaccoDi,
  PROVE_MINIME, CODICE_MAX,
  contieneDatiPersonali, validaPlasmide, improntaPlasmide, nuovaVersioneDi,
  impacchetta, spacchetta,
};
