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
// UNA SOLA PREPARAZIONE DELLA RIGA, usata sia per contare le note sia per controllare i caratteri.
// Prima erano due: `noteDi` toglieva le annotazioni fra virgolette e il controllo sui caratteri no.
// Misurato sul repertorio vero: `"Em"`, `"slide"`, `"D/H"` — accordi e indicazioni perfettamente
// legittimi — facevano bocciare una trascrizione su cinque, perché la «m» di «Em» non è una nota.
// È il difetto che la regola di casa descrive: due scritture della stessa cosa divergono. Qui erano
// già divergenti alla nascita, e nessuno se ne era accorto finché non è arrivato materiale vero.
function soloMusica(riga) {
  return senzaMarcatoreVoce(String(riga || ""))
    .replace(/\[V:[^\]]*\]/g, " ")  // un marcatore di voce non è un accordo (e `[...]` lo sembrava)
    .replace(/"[^"]*"/g, " ")      // gli accordi e le annotazioni scritte sopra ("Am", "slide")
    .replace(/![^!]*!/g, " ")      // le decorazioni fra punti esclamativi
    .replace(/%.*$/, " ");         // un commento in coda a una riga di note
}
export function noteDi(testo) {
  const s = soloMusica(testo).replace(/\[[^\]]*\]/g, "N"); // un accordo suonato insieme vale una nota sola
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
// Le decorazioni ABC che stanno ATTACCATE a una nota sono lettere: `u` e `v` (arcata in su e in
// giù) e le maiuscole H..W (corona, trillo, staccato, arpeggio…). Misurate nel repertorio vero:
// `Ja2{g}fd`, `uE2BE`, `vE2BE`. Vanno ammesse, o metà della musica scritta da musicisti veri viene
// rifiutata come se fosse prosa.
// Le minuscole restano chiuse — a parte a-g, u, v — ed è ciò che continua a prendere la prosa: in
// «Ecco la melodia» le lettere l, o, m, i non sono musica in nessuna notazione.
const CARATTERI_DI_MUSICA = /[A-Ga-gzuvHIJKLMNOPQRSTUVW0-9_^=,'/|\[\]():<>~.\-\s{}&"!+*]/;

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
      // Dopo K: sono vietati SOLO i campi che cambiano come si leggono le note: un altro K:, il
      // metro, l'unità, l'andamento, l'indice. Tutto il resto — V: (le voci di una partitura, dove
      // è anzi la forma più comune), T:, R:, N:, W:, I: — è informazione e non sposta niente. Nel
      // repertorio vero un secondo T: a metà brano è il titolo della seconda parte: vietarlo
      // bocciava musica corretta.
      if (vistoK && ["K", "M", "L", "Q", "X", "U"].includes(campo)) a.kPerUltima = false;
      if (campo === "K") vistoK = true;
      const nome = INTESTAZIONI[campo];
      if (nome && !a[nome]) a[nome] = valore;
      return;
    }
    a.righeDiNote++;
    noteDellUltimaRiga = noteDi(riga).length;
    // Il marcatore di voce esce PRIMA del controllo: `[V:Violino I]` non è musica, ma nemmeno la
    // prosa che questo controllo esiste per prendere.
    for (const c of soloMusica(riga)) if (!CARATTERI_DI_MUSICA.test(c) && !a.caratteriEstranei.includes(c)) a.caratteriEstranei.push(c);
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

// ══════════════════════════════════════════════════════════════════════════════
// GLI SPARTITI CHE ARRIVANO DA UN ARCHIVIO ONLINE — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// L'archivio è thesession.org: musica tradizionale, già in notazione ABC, con due estremi che
// rispondono `access-control-allow-origin: *` — misurato, non supposto, ed è la condizione senza la
// quale un browser non li potrebbe chiamare affatto e servirebbe un ponte lato server.
// Perché QUESTO archivio e non un altro: i brani sono tradizionali, quindi la musica è di tutti;
// e soprattutto è già ABC. Gli archivi pieni di PDF non servono a niente qui — una scansione è
// un'immagine, e riconoscere la musica dentro un'immagine è un altro mestiere.
//
// QUELLO CHE ARRIVA NON E' UNO SPARTITO. È un frammento: solo il corpo, senza intestazione, con "!"
// al posto degli a capo. Titolo, metro e tonalità stanno altrove nella risposta e vanno rimessi
// insieme. Quindi questa non è una copia, è una RICOSTRUZIONE — e come ogni cosa ricostruita passa
// dall'accettore prima di essere offerta: se l'ABC rimontato non è valido, quel risultato non si
// propone. Vale la stessa regola del modello: il programma va a controllare davvero.
//
// LA PROVENIENZA RESTA ATTACCATA. Ogni spartito preso da fuori porta l'indirizzo da cui viene e il
// numero della trascrizione. Non è una formalità: le trascrizioni sono di chi le ha scritte, e uno
// spartito senza provenienza fra sei mesi è indistinguibile da uno scritto dal Ghost.
export const ARCHIVIO_SPARTITI = {
  id: "thesession",
  nome: "The Session",
  perChe: "musica tradizionale irlandese e scozzese, già in notazione ABC",
  cerca: (q, pagina = 1) => `https://thesession.org/tunes/search?q=${encodeURIComponent(q)}&format=json&page=${pagina}`,
  brano: (id) => `https://thesession.org/tunes/${encodeURIComponent(id)}?format=json`,
};
// Il metro non arriva: arriva il TIPO di danza, e il metro è una sua proprietà. Chi suona questa
// musica lo sa a memoria; il programma no, e senza M: lo spartito non passa il proprio accettore.
const METRO_PER_TIPO = {
  reel: "4/4", hornpipe: "4/4", strathspey: "4/4", barndance: "4/4", march: "4/4",
  jig: "6/8", "slip jig": "9/8", slide: "12/8",
  polka: "2/4", waltz: "3/4", mazurka: "3/4", "three-two": "3/2",
};
const MODI_ABC = { major: "", ionian: "", minor: "m", aeolian: "m", dorian: "dor", mixolydian: "mix", lydian: "lyd", phrygian: "phr", locrian: "loc" };
// "Edorian" → "Edor", "Bbminor" → "Bbm", "F#major" → "F#".
export function chiaveAbc(chiave) {
  const m = /^([A-G][#b]?)(.*)$/.exec(String(chiave || "").trim());
  if (!m) return String(chiave || "").trim();
  const modo = m[2].toLowerCase();
  const suffisso = MODI_ABC[modo] !== undefined ? MODI_ABC[modo] : modo.slice(0, 3);
  return m[1] + suffisso;
}
export const metroPerTipo = (tipo) => METRO_PER_TIPO[String(tipo || "").toLowerCase()] || "4/4";
// Rimonta lo spartito intero. `unita` a 1/8 è la convenzione di questo repertorio: le crome sono
// l'unità con cui è scritto, e cambiarla farebbe suonare tutto al doppio o alla metà.
export function abcDaArchivio({ titolo, tipo, chiave, corpo, autore = "", fonte = "" }) {
  const righe = String(corpo || "").split(/\s*!\s*|\r?\n/).map((r) => r.trim()).filter(Boolean);
  // QUANDO LA TRASCRIZIONE PORTA GIA' LA SUA TONALITA', vince la sua. Trovato su un caso vero
  // (The Lakes Of Sligo, trascrizione 15239): l'archivio dichiara Re nei suoi dati, la trascrizione
  // comincia con `K: BbMaj`. Aggiungendo comunque la mia si creavano DUE tonalità di fila, e lo
  // spartito veniva giustamente rifiutato — ma il conflitto lo stavo creando io.
  // Chi ha scritto le note sa in che tonalità le ha scritte meglio di una scheda di catalogo.
  const suaTonalita = /^K:\s*(.+)$/.exec(righe[0] || "");
  if (suaTonalita) righe.shift();
  const tonalita = suaTonalita ? suaTonalita[1].trim() : chiaveAbc(chiave);
  return [
    "X:1",
    `T:${String(titolo || "senza titolo").trim()}`,
    tipo ? `R:${tipo}` : "",
    autore ? `C:${autore}` : "",
    fonte ? `%%source ${fonte}` : "",
    `M:${metroPerTipo(tipo)}`,
    "L:1/8",
    `K:${tonalita}`,
    ...righe,
  ].filter(Boolean).join("\n");
}
// Da una risposta dell'archivio a una lista di spartiti già rimontati e già CONTROLLATI.
// `scelta` è l'indice della trascrizione: un brano tradizionale ne ha spesso cinque o sei, tutte
// legittime e diverse fra loro — è il repertorio che funziona così, non un difetto dei dati.
export function spartitiDalBrano(brano, analizza = analizzaSpartito) {
  const impostazioni = Array.isArray(brano?.settings) ? brano.settings : [];
  return impostazioni.map((s, i) => {
    const abc = abcDaArchivio({
      titolo: brano.name, tipo: brano.type, chiave: s.key, corpo: s.abc,
      fonte: s.url || brano.url || "",
    });
    const analisi = analizza(abc);
    return {
      scelta: i, abc, analisi,
      chiave: chiaveAbc(s.key), battute: analisi.battute.length,
      fonte: { archivio: ARCHIVIO_SPARTITI.id, url: s.url || brano.url || "", brano: brano.id, trascrizione: s.id, autore: s.member?.name || "" },
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// UN ARCHIVIO CHE RISPONDE NON E' UN ARCHIVIO CHE HA CAPITO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Trovato misurando, un'ora prima di mandare in produzione la ricerca da chat, sulla seconda frase
// vera del Ghost: «Cerca lo spartito per basso di One dei Metallica».
//
// The Session cerca in OR. Alla query «One metallica» risponde `total: 100` — cento brani che
// contengono «One»: «Paddy Connelly Buys One Gets One Free», «T'Owd Yowe Wi' One Horn», giighe
// irlandesi. Quanti contengono «metallica»? ZERO.
//
// Mostrati com'erano, quei cento sarebbero stati PEGGIO del «non posso cercare online» di cui il
// Ghost si stava lamentando: una bugia che dice «non so» è fastidiosa, una che dice «ecco» con
// cento risultati sbagliati sotto è indistinguibile da una risposta. Il numero era vero, l'archivio
// non ha mentito, e proprio per questo nessun controllo sulla rete lo avrebbe preso.
//
// E' la regola di casa applicata a una fonte che non è un modello: il programma non si fida di
// quello che TORNA, va a guardare se risponde davvero alla domanda. Regola: un risultato è una
// risposta solo se il suo nome (o l'alias, o il tipo di danza) contiene TUTTE le parole che
// contano della richiesta — che è quello che intende una persona quando scrive due parole.
// E le parole che non compaiono in NESSUN risultato si dicono per nome: è l'informazione che
// spiega al Ghost perché il suo brano non c'è, invece di lasciargli credere a un guasto.
const PAROLE_IGNORATE_RILEVANZA = new Set(["the", "a", "an", "il", "lo", "la", "i", "gli", "le", "di", "del", "dei", "della", "e", "and", "of", "o", "or"]);
// L'APOSTROFO SPARISCE, non diventa uno spazio. Questo repertorio è pieno di «Cooley's» e
// «Morrison's», e l'archivio contiene ENTRAMBE le grafie — con e senza apostrofo, a seconda di chi
// ha caricato il brano. Trasformandolo in spazio, «Cooley's» diventa «cooley s» e non incontra mai
// «cooleys»: chi scrive la grafia sbagliata delle due si sente dire che il brano non esiste.
// Togliendolo, le due grafie collassano sulla stessa parola e la ricerca funziona in tutti e due i
// versi. (Trovato dalla verifica di rottura: rompendo questa riga il banco restava verde, perché
// tutte le mie prove usavano la stessa grafia da una parte e dall'altra.)
const normalizzaPerConfronto = (s) => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "").replace(/['’ʼ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function risultatiCheRispondono(query, tunes) {
  const lista = Array.isArray(tunes) ? tunes : [];
  const parole = normalizzaPerConfronto(query).split(" ").filter((p) => p && !PAROLE_IGNORATE_RILEVANZA.has(p));
  if (!parole.length) return { risposte: lista, scartati: 0, paroleAssenti: [] };
  // Il tipo di danza entra nel pagliaio: «Egan's polka» ha il nome «Egan's» e «polka» nel tipo, e
  // senza questo la ricerca più naturale del repertorio verrebbe scartata da sola.
  const pagliaio = (t) => normalizzaPerConfronto([t?.name, t?.alias, t?.type].filter(Boolean).join(" "));
  const risposte = lista.filter((t) => { const h = pagliaio(t); return parole.every((p) => h.includes(p)); });
  return {
    risposte,
    scartati: lista.length - risposte.length,
    paroleAssenti: parole.filter((p) => !lista.some((t) => pagliaio(t).includes(p))),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CHIEDERE UNO SPARTITO PARLANDO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha scritto in chat: «Cerca online lo spartito per basso elettrico di Come Together dei
// Beatles e mostramelo». Lo Shell ha risposto «Non posso cercare online. Non ho accesso a internet,
// a database musicali, né a spartiti» — e per come era l'app in quel momento era vero, ma la
// ricerca c'era già, in un pulsante dentro un percorso. Un pulsante che nessuno trova non esiste:
// il modo naturale di chiedere una cosa è chiederla.
//
// COME LA NAVIGAZIONE, NON COME UN'AZIONE DEL MODELLO: il riconoscimento è deterministico e la
// ricerca la fa il programma. Zero token, nessun turno di selezione da pagare, e soprattutto niente
// da indovinare — l'archivio si interroga, non si immagina.
//
// LA QUERY NON SI FINGE PERFETTA: si estrae, e si MOSTRA al Ghost quello che è stato cercato. Una
// frase parlata contiene il brano, lo strumento, l'artista e un «e mostramelo» in coda; separarli
// bene tutte le volte è impossibile, e fingere di averlo fatto produce una ricerca a vuoto senza
// che si capisca perché. Dichiarare la query la rende correggibile in un secondo.
const VERBI_CERCA_SPARTITO = /\b(cerca|cercami|cercare|cerchi|trova|trovami|trovare|scarica|scaricami|procurami|recupera|recuperami)\b/i;
const OGGETTO_SPARTITO = /\b(spartit[oi]|tablatur[ae]|partitur[ae]|pentagramm[ai])\b/i;
// Il rumore che circonda il nome del brano in una frase parlata.
const RUMORE_QUERY_SPARTITO = /\b(online|in rete|su internet|nell'archivio|nell archivio|per favore|e mostramel[oa]|mostramel[oa]|e fammel[oa] vedere|fammel[oa] vedere|brano|canzone|pezzo|del gruppo|dei|degli|delle|del|della|di|per|un|uno|una|il|lo|la|i|gli|le)\b/gi;
// CERCARE DENTRO NON E' CERCARE FUORI, e le due frasi si somigliano troppo: «cerca lo spartito di
// Cooley's» e «cerca lo spartito che abbiamo fatto ieri» hanno lo stesso verbo e lo stesso oggetto.
// Senza questo veto la seconda partirebbe verso l'archivio con query «che abbiamo fatto ieri»,
// tornerebbe vuota, e direbbe al Ghost che il SUO spartito non esiste. Un falso negativo qui costa
// un pulsante in più da premere; un falso positivo costa una bugia.
const CERCARE_DENTRO = /\b(nel percorso|nei percorsi|nei documenti|nei miei documenti|nell'app|nell app|nella chat|nell'archivio del percorso|che abbiamo (?:fatto|scritto|generato|salvato)|che ho (?:fatto|scritto|generato|salvato)|che hai (?:fatto|scritto|generato|salvato)|salvat[oi]|di ieri|dell'altro giorno)\b/i;
export function richiestaDiSpartito(frase) {
  const t = String(frase || "");
  if (!VERBI_CERCA_SPARTITO.test(t) || !OGGETTO_SPARTITO.test(t)) return null;
  if (CERCARE_DENTRO.test(t)) return null;
  // Lo strumento, se nominato, non entra nella ricerca — l'archivio indicizza i brani, non gli
  // arrangiamenti — ma si dice al Ghost, così sa perché non ha filtrato per quello.
  const strumento = (/\bper\s+(?:il\s+|lo\s+|la\s+|l')?(bass[oi]|chitarr[ae]|violin[oi]|pianoforte|piano|flaut[oi]|mandolin[oi]|fisarmonic[ah]|vioncell[oi]|violoncell[oi]|voce)\w*/i.exec(t) || [])[1] || "";
  // In italiano il brano arriva dopo «di»: «lo spartito ... DI Come Together». Se non c'è, si
  // prende quello che resta dopo la parola «spartito».
  const dopoDi = /\bdi\s+(.+)$/i.exec(t);
  const dopoOggetto = new RegExp(`${OGGETTO_SPARTITO.source}\\s+(.+)$`, "i").exec(t);
  const grezza = (dopoDi ? dopoDi[1] : dopoOggetto ? dopoOggetto[2] : "");
  const query = grezza
    .replace(RUMORE_QUERY_SPARTITO, " ")
    .replace(/\be\s*$/i, " ")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 6).join(" ");
  return query ? { query, strumento, frase: t.trim() } : null;
}
