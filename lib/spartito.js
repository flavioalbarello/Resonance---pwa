// ══════════════════════════════════════════════════════════════════════════════
// GLI SPARTITI — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// PERCHE' ABC E NON ALTRO. La regola del progetto dice cosa deve sopravvivere a un cambio di
// sostrato: le forme dei dati, non le librerie. Quindi la domanda non è «con che cosa lo disegno»
// ma «in che forma lo tengo», e la risposta cambia tutto il resto.
//  · ABC è TESTO. Quindi uno spartito è un documento come gli altri: entra in un percorso, va nel
//    magazzino dei testi, sale nel file di sync, finisce nel backup, si cerca con le stesse parole.
//    Zero storage nuovo, zero forme nuove — la cosa più grossa di questo lavoro è ciò che NON serve.
//  · Un modello lo sa scrivere. MusicXML è XML che nessun umano scrive a mano e che un modello
//    sbaglia in silenzio; il MIDI è binario, non si legge in un diff e non si corregge a mano.
//  · Si legge e si corregge con gli occhi. Uno spartito sbagliato si aggiusta senza strumenti.
//
// PERCHE' L'ANCORA DI UN PROMEMORIA E' LA BATTUTA E NON LA POSIZIONE NEL TESTO. Un promemoria
// attaccato al carattere 412 muore alla prima riscrittura: basta aggiungere una parola al titolo.
// La battuta è una posizione MUSICALE: sopravvive alla trasposizione, alla riscrittura, all'aggiunta
// dei versi sotto le note. È la stessa scelta del resto del progetto — l'ancora sta nel dato, non
// nella sua rappresentazione di oggi.
//
// LA FORMA IN PIU' CHE IL GHOST NON AVEVA CHIESTO, e il motivo per cui la propongo: ABC allinea i
// VERSI sotto le note (righe `w:`). Il Ghost sta scrivendo un concept album e i suoi Atti sono già
// documenti di testo nell'app. Così la musica e le parole restano UN documento solo invece di due
// che divergono — ed è verificabile: il programma conta le sillabe e le note e dice se non tornano,
// che è esattamente il genere di errore che un modello fa senza accorgersene.

export const SPARTITO_VERSIONE_FORMATO = 1;
// I campi d'intestazione ABC che questo programma legge. Gli altri passano invariati: non si butta
// via quello che non si capisce.
const INTESTAZIONI = { X: "indice", T: "titolo", C: "autore", M: "metro", L: "unita", Q: "andamento", K: "tonalita", I: "istruzione", V: "voce" };

const righeDi = (abc) => String(abc || "").replace(/\r\n?/g, "\n").split("\n");
const eIntestazione = (r) => /^[A-Za-z]:/.test(r);
const eVerso = (r) => /^w:/i.test(r);
// `%` è un commento ABC; `%%` è una direttiva di impaginazione (per esempio `%%score` che raggruppa
// gli strumenti di una partitura). Nessuna delle due è musica, e nessuna delle due è un errore.
const eCommento = (r) => /^%/.test(r);
// ── LE PARTITURE (14/09/2026) ────────────────────────────────────────────────────────────────
// Riparazione di un difetto MIO, trovato dal Ghost con tre domande: «legge le chiavi? sa fare uno
// spartito da direttore d'orchestra?». Misurato: abcjs le disegna eccome — due voci danno due
// pentagrammi con le loro chiavi e i loro nomi — ma il controllo che ho scritto io le RIFIUTAVA.
// `solo-caratteri-di-musica` esisteva per prendere la prosa che un modello infila fra le note, e
// prendeva invece i marcatori di voce `[V:Violino]`, che musica non sono ma nemmeno prosa.
// Un guardiano che scarta il caso buono è peggio di nessun guardiano: quello lascia passare, questo
// convince che la cosa non si possa fare.
const MARCATORE_VOCE = /^\s*\[V:\s*([^\]]+)\]\s*/;
const senzaMarcatoreVoce = (riga) => String(riga).replace(MARCATORE_VOCE, "");
// Le voci dichiarate nell'intestazione: `V:V1 name="Violino I" clef=treble`.
export function vociDichiarate(abc) {
  const fuori = [];
  for (const r of righeDi(abc)) {
    const m = /^V:\s*(\S+)(.*)$/.exec(r);
    if (!m) continue;
    const resto = m[2] || "";
    const nome = (/name\s*=\s*"([^"]*)"/.exec(resto) || /name\s*=\s*(\S+)/.exec(resto) || [])[1] || "";
    const chiave = (/clef\s*=\s*(\S+)/.exec(resto) || [])[1] || "";
    if (!fuori.some((v) => v.id === m[1])) fuori.push({ id: m[1], nome, chiave });
  }
  return fuori;
}
// La direttiva %%score dice come impaginare le voci, e la differenza NON è cosmetica — misurata
// disegnando le quattro varianti e contando i pentagrammi:
//   %%score (V1 V2)   → i due strumenti finiscono sullo STESSO pentagramma, e il secondo perde la
//                       propria chiave: una viola in chiave di contralto sparisce dentro il rigo
//                       del violino;
//   %%score [V1 V2]   → un pentagramma per strumento, uniti da una graffa quadra (partitura);
//   %%score {V1 V2}   → idem, graffa da pianoforte;
//   nessuna direttiva → un pentagramma per strumento.
// Un modello che scrive una partitura usa le parentesi tonde molto volentieri, perché nella
// notazione ABC "raggruppare" suona come "mettere insieme". Qui sotto si legge quali voci sono
// state forzate sullo stesso rigo, e il requisito più giù lo dichiara un errore quando le chiavi
// non coincidono.
export function vociSulloStessoRigo(abc) {
  const gruppi = [];
  for (const r of righeDi(abc)) {
    if (!/^%%score\b/.test(r)) continue;
    for (const m of r.matchAll(/\(([^)]*)\)/g)) {
      const voci = m[1].trim().split(/\s+/).filter(Boolean);
      if (voci.length > 1) gruppi.push(voci);
    }
  }
  return gruppi;
}
// Le righe di musica raggruppate per voce. Chi non dichiara voci ne ha una sola, senza nome: è il
// caso normale, e deve restare identico a com'era.
function righePerVoce(abc) {
  const voci = new Map();
  let corrente = "";
  for (const r of righeDi(abc)) {
    if (eCommento(r) || eVerso(r) || !r.trim()) continue;
    if (eIntestazione(r) && !MARCATORE_VOCE.test(r)) continue;
    const m = MARCATORE_VOCE.exec(r);
    if (m) corrente = m[1].trim();
    if (!voci.has(corrente)) voci.set(corrente, []);
    voci.get(corrente).push(senzaMarcatoreVoce(r));
  }
  return voci;
}

// Le battute: si separano sulle stanghette. `|:` `:|` `||` `|]` sono tutte stanghette, e una ripresa
// non crea una battuta vuota — contarla farebbe sbagliare ogni ancora dopo la prima ripetizione.
// IN UNA PARTITURA LA BATTUTA 3 E' LA 3 PER TUTTI. Quindi le battute dello spartito sono quelle di
// UNA voce, non la somma di tutte: senza questo, un quartetto di 2 battute ne conterebbe 8, e il
// promemoria attaccato alla battuta 3 finirebbe in mezzo alla seconda battuta del secondo violino.
// È la stessa ragione per cui l'ancora è la battuta e non il carattere: deve essere una posizione
// MUSICALE, e in una partitura la posizione musicale è comune a tutti gli strumenti.
export function battuteDi(abc) {
  const voci = righePerVoce(abc);
  const righeRiferimento = voci.size ? Array.from(voci.values())[0] : [];
  const battute = [];
  let numero = 0;
  for (const riga of righeRiferimento) {
    for (const pezzo of riga.split(/\|\]|\|\||:\||\|:|\|/)) {
      const testo = pezzo.trim();
      if (!testo) continue;
      numero++;
      battute.push({ numero, testo });
    }
  }
  return battute;
}

// Le note di una battuta, contate come le conta un musicista: una nota è una lettera A-G o a-g
// (o `z` per la pausa), con le sue alterazioni e la sua durata attaccate. Un accordo fra parentesi
// quadre vale UNA nota, perché sotto ci va UNA sillaba.
export function noteDi(testo) {
  const s = senzaMarcatoreVoce(String(testo || ""))
    .replace(/\[V:[^\]]*\]/g, " ")  // un marcatore di voce non è un accordo (e `[...]` lo sembrava)
    .replace(/"[^"]*"/g, " ")      // gli accordi scritti sopra ("Am") non sono note
    .replace(/![^!]*!/g, " ")      // le decorazioni nemmeno
    .replace(/\[[^\]]*\]/g, "N");  // un accordo suonato insieme vale una nota sola
  const trovate = s.match(/N|[_^=]*[A-Ga-gz][,']*\d*\/*\d*/g) || [];
  return trovate.filter((n) => n);
}

// ── L'ACCETTORE ───────────────────────────────────────────────────────────────────────────────
// Un oggetto solo, letto due volte: `detta` è quello che si dice al modello, `verifica` è quello
// che il programma controlla. Stanno nella stessa riga dello stesso array perché due scritture
// separate divergono entro un mese — è la regola di casa dal 04/09, e col piano alimentare è già
// successo davvero.
export const REQUISITI_SPARTITO = [
  {
    id: "intestazione-minima",
    detta: "Ogni spartito comincia con X:1, poi T: col titolo, e finisce l'intestazione con K: (la tonalità). K: deve essere l'ULTIMA riga d'intestazione, prima delle note.",
    verifica: (a) => (a.indice && a.titolo && a.tonalita) ? null : `manca ${!a.indice ? "X:" : !a.titolo ? "T: (il titolo)" : "K: (la tonalità)"}`,
  },
  {
    id: "k-per-ultima",
    detta: "Dopo K: cominciano le note: nessuna riga d'intestazione va dopo K:.",
    verifica: (a) => a.kPerUltima ? null : "c'è una riga d'intestazione dopo K:, quindi le note non cominciano dove dovrebbero",
  },
  {
    id: "abbastanza-musica",
    detta: "Almeno due battute vere, separate da |. Uno spartito di una battuta non è uno spartito.",
    verifica: (a) => a.battute.length >= 2 ? null : `${a.battute.length} battute: ce ne vogliono almeno 2`,
  },
  {
    id: "solo-caratteri-di-musica",
    detta: "Nel corpo vanno solo note (A-G, a-g), pause (z), alterazioni (^ _ =), durate (numeri e /), legature, stanghette e accordi fra virgolette. Niente prosa.",
    verifica: (a) => a.caratteriEstranei.length ? `caratteri che non sono musica: ${a.caratteriEstranei.slice(0, 6).join(" ")}` : null,
  },
  {
    id: "metro-dichiarato",
    detta: "Dichiara il metro con M: (per esempio M:4/4) e l'unità con L: (per esempio L:1/8).",
    verifica: (a) => a.metro ? null : "manca M: (il metro)",
  },
  {
    id: "pentagrammi-non-mescolati",
    detta: "In una partitura usa %%score con le parentesi QUADRE — %%score [V1 V2 Va Vc] — così ogni strumento ha il suo pentagramma e la sua chiave. Le parentesi TONDE mettono due strumenti sullo stesso rigo e il secondo perde la propria chiave: usale solo se è davvero quello che vuoi.",
    verifica: (a) => {
      const chiaveDi = (id) => (a.voci.find((v) => v.id === id) || {}).chiave || "";
      const mescolati = a.vociSulloStessoRigo.filter((g) => new Set(g.map(chiaveDi).filter(Boolean)).size > 1);
      return mescolati.length
        ? `%%score mette sullo stesso pentagramma strumenti con chiavi diverse (${mescolati.map((g) => g.join("+")).join(", ")}): con le parentesi tonde il secondo perde la sua chiave. Servono le quadre.`
        : null;
    },
  },
  {
    id: "versi-allineati",
    detta: "Se metti i versi con w:, ogni riga w: sta SOTTO la riga di note a cui appartiene e ha una sillaba per nota (usa - per legare le sillabe di una parola e * per saltare una nota).",
    verifica: (a) => {
      const storti = a.versi.filter((v) => v.note > 0 && Math.abs(v.sillabe - v.note) > Math.max(2, Math.round(v.note * 0.25)));
      return storti.length ? `i versi non tornano con le note: ${storti.map((v) => `riga ${v.riga} ha ${v.sillabe} sillabe su ${v.note} note`).join("; ")}` : null;
    },
  },
];

// Il corpo può contenere solo questi caratteri. Fuori da qui è prosa finita per sbaglio in mezzo
// alle note — l'errore tipico di un modello che spiega quello che sta scrivendo.
const CARATTERI_DI_MUSICA = /[A-Ga-gz0-9_^=,'/|\[\]():<>~.\-\s{}&"!+*]/;

export function analizzaSpartito(abc) {
  const righe = righeDi(abc);
  const a = {
    indice: "", titolo: "", autore: "", metro: "", unita: "", andamento: "", tonalita: "",
    kPerUltima: true, battute: [], versi: [], voci: [], vociSulloStessoRigo: [], caratteriEstranei: [], righeDiNote: 0,
  };
  let vistoK = false;
  let noteDellUltimaRiga = 0;
  righe.forEach((riga, i) => {
    if (eCommento(riga) || !riga.trim()) return;
    if (eVerso(riga)) {
      const testo = riga.slice(2).trim();
      // Le sillabe: separate da spazi e da trattini. `*` salta una nota, `~` lega due parole su una.
      const sillabe = testo.split(/[\s-]+/).filter((s) => s && s !== "|").length;
      a.versi.push({ riga: i + 1, testo, sillabe, note: noteDellUltimaRiga });
      return;
    }
    if (eIntestazione(riga)) {
      const campo = riga[0].toUpperCase();
      const valore = riga.slice(2).trim();
      // V: e I: possono stare DOPO K: — in una partitura è anzi la forma più comune: prima la
      // tonalità, poi l'elenco degli strumenti. W: sono i versi in coda. Nessuna delle tre sposta
      // il punto in cui cominciano le note, che è quello che questo requisito difende.
      if (vistoK && !["W", "V", "I"].includes(campo)) a.kPerUltima = false;
      if (campo === "K") vistoK = true;
      const nome = INTESTAZIONI[campo];
      if (nome && !a[nome]) a[nome] = valore;
      return;
    }
    a.righeDiNote++;
    noteDellUltimaRiga = noteDi(riga).length;
    // Il marcatore di voce esce PRIMA del controllo: `[V:Violino I]` non è musica, ma nemmeno la
    // prosa che questo controllo esiste per prendere.
    for (const c of senzaMarcatoreVoce(riga)) if (!CARATTERI_DI_MUSICA.test(c) && !a.caratteriEstranei.includes(c)) a.caratteriEstranei.push(c);
  });
  a.battute = battuteDi(abc);
  a.voci = vociDichiarate(abc);
  a.vociSulloStessoRigo = vociSulloStessoRigo(abc);
  a.ok = false;
  a.errori = REQUISITI_SPARTITO.map((r) => { const e = r.verifica(a); return e ? { id: r.id, motivo: e } : null; }).filter(Boolean);
  a.ok = a.errori.length === 0;
  return a;
}

// Quello che si dice al modello: la stessa riga dello stesso array, letta dall'altro lato.
export function briefDelloSpartito({ argomento, battute = 16, strumento = "", conVersi = false, conVoci = false } = {}) {
  const righe = REQUISITI_SPARTITO
    .filter((r) => conVersi || r.id !== "versi-allineati")
    .map((r, i) => `${i + 1}. ${r.detta}`);
  return [
    `Scrivi uno spartito in notazione ABC${argomento ? ` su: ${argomento}` : ""}.`,
    strumento ? `Strumento: ${strumento}.` : "",
    `Circa ${battute} battute.`,
    conVoci
      ? `Scrivilo come PARTITURA, una voce per strumento: dichiarale con righe V: (per esempio V:Vc name="Violoncello" clef=bass) e poi marca ogni riga di musica con [V:...]. Raggruppale con %%score e le parentesi QUADRE (per esempio %%score [V1 V2 Va Vc]), mai con le tonde. Le chiavi disponibili sono clef=treble (violino), clef=bass (basso), clef=alto (contralto/viola), clef=tenor, clef=perc (percussioni). Tutte le voci devono avere lo STESSO numero di battute: la battuta 3 è la 3 per tutti.`
      : "",
    conVersi ? "Metti anche i versi sotto le note con righe w:." : "",
    "Rispondi SOLO con il testo ABC, senza spiegazioni, senza virgolette di codice, senza commenti.",
    "",
    "Requisiti, tutti obbligatori:",
    ...righe,
  ].filter(Boolean).join("\n");
}

// ── I PROMEMORIA ──────────────────────────────────────────────────────────────────────────────
// Ancorati alla BATTUTA. Il testo dello spartito può essere riscritto, trasposto, arricchito di
// versi: il promemoria della battuta 9 resta alla battuta 9.
export const PROMEMORIA_TETTO = 60;
export function nuovoPromemoria({ battuta, testo, id = null, quando = null }) {
  const n = Math.round(Number(battuta));
  const t = String(testo || "").trim();
  if (!Number.isFinite(n) || n < 1) return { ok: false, motivo: "la battuta deve essere un numero da 1 in su" };
  if (!t) return { ok: false, motivo: "un promemoria senza testo non serve a niente" };
  return { ok: true, promemoria: { id: id || `pr-${n}-${Math.random().toString(36).slice(2, 8)}`, battuta: n, testo: t, quando: quando || new Date().toISOString() } };
}
// Ordinati per battuta, con un tetto: un promemoria per battuta è utile, venti sono rumore.
export function ordinaPromemoria(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((p) => p && Number.isFinite(Number(p.battuta)) && String(p.testo || "").trim())
    .sort((a, b) => Number(a.battuta) - Number(b.battuta) || String(a.quando || "").localeCompare(String(b.quando || "")))
    .slice(0, PROMEMORIA_TETTO);
}
// Un promemoria oltre l'ultima battuta non si butta: si segnala. Uno spartito si accorcia mentre lo
// si lavora, e buttare una nota del Ghost perché ha tagliato due battute sarebbe la sovrascrittura
// distruttiva che la Legge 14 vieta.
export function promemoriaOrfani(lista, quanteBattute) {
  return ordinaPromemoria(lista).filter((p) => Number(p.battuta) > quanteBattute);
}
export function promemoriaDellaBattuta(lista, battuta) {
  return ordinaPromemoria(lista).filter((p) => Number(p.battuta) === Number(battuta));
}

// Uno spartito è un documento come gli altri: stessa forma, più tre campi. `text` resta il posto
// dove vive il contenuto, quindi magazzino, sync, backup e ricerca funzionano senza sapere niente
// di musica.
export function documentoSpartito({ id, titolo, abc, promemoria = [], strumento = "", nodoId = null, date = null }) {
  return {
    id, name: `${String(titolo || "spartito").replace(/[^\w\s-]/g, "").trim() || "spartito"}.abc`,
    title: titolo, text: abc, date: date || new Date().toISOString(), driveId: null,
    tipo: "spartito", formatoSpartito: SPARTITO_VERSIONE_FORMATO,
    strumento: strumento || "", promemoria: ordinaPromemoria(promemoria), nodoId,
  };
}
export const eSpartito = (doc) => !!doc && (doc.tipo === "spartito" || /\.abc$/i.test(String(doc.name || "")));

// Uno spartito minimo che serve a due cose: far vedere subito com'è fatto, e dare al banco un caso
// valido che non sia inventato riga per riga dentro le prove.
export const SPARTITO_ESEMPIO = [
  "X:1",
  "T:Prova",
  "M:4/4",
  "L:1/4",
  "Q:1/4=90",
  "K:Cmaj",
  "C D E F | G A B c | c B A G | F E D C |",
].join("\n");
