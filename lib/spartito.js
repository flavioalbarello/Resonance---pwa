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
// ══════════════════════════════════════════════════════════════════════════════
// LE BATTUTE DEVONO TORNARE COL METRO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Nato da una proposta del Ghost: «basterebbe banalmente una ricerca Google e poi osservare le
// immagini oltre che i testi». Ha ragione che i mattoni ci sono — la ricerca web e la visione sono
// già cablate in app.js. Ma prima di metterli in fila va tappato il buco che li rende pericolosi:
// NESSUNO DEI SETTE REQUISITI GUARDA LE DURATE. `metro-dichiarato` controlla solo che M: esista.
//
// Un modello che legge uno spartito da un'immagine sbaglia le durate — è l'errore tipico di quel
// mestiere, e sbaglia in modo PLAUSIBILE: note giuste, ritmo storto. Il risultato è ABC formalmente
// perfetto che passa tutti e sette i controlli. Misurato: prendendo una trascrizione vera e
// cambiando UNA durata, l'accettore di oggi la accetta.
//
// Questo controllo è calcolabile: il metro dice quanto vale una battuta, e le durate delle note si
// sommano. Zero token, zero modelli — «il programma va a cercarlo davvero».
//
// L'ANACRUSI NON E' UN ERRORE, ED E' IL DATO VERO CHE ME L'HA INSEGNATO. Prima misura su Cooley's:
// battuta 1 = «D2» (vale 2), battuta 9 = «DEFD E2» (vale 6). 2+6 = 8 = il metro. In un brano con la
// levata, la battuta iniziale incompleta e quella che chiude la sezione INSIEME fanno una battuta
// intera: chi suona conta così. Quindi le parziali si ACCOPPIANO, non si tollerano a caso.
//
// E SOPRATTUTTO — LA SCOPERTA CHE HA CAMBIATO IL DISEGNO. Misurato su 192 trascrizioni vere di
// dieci brani: 161 tornano (83,9%), 31 no. Guardandole una per una, quelle 31 NON sono falsi
// positivi miei: sono trascrizioni vere e IMPERFETTE. «FED AD BDAD» vale 9 dove un'altra versione
// dello stesso brano scrive «F/E/D AD BDAD» e vale 8; «Adfd Adfd Adfd edBd» vale 16 perché manca
// una stanghetta. The Session le raccoglie da musicisti che scrivono a orecchio, ed è musica vera.
//
// Quindi il controllo NON può essere un rifiuto sempre:
//   · su uno spartito che SCRIVE UN MODELLO (inventato, o trascritto da un'immagine) è un ERRORE
//     bloccante: lì la battuta storta è un errore suo, e torna indietro perché la rifaccia;
//   · su una trascrizione presa DA UN ARCHIVIO è un AVVISO: si mostra e si tiene, dicendo quali
//     battute non tornano. Buttare la musica di qualcun altro perché il suo autore non ha contato
//     le crome sarebbe la Legge 14 rotta al contrario.
const FRAZIONE_ABC = (s) => { const [n, d] = String(s).split("/"); return Number(n) / (Number(d) || 1); };
// `C` è 4/4 e `C|` è 2/2: entrambi valgono 1 come frazione di semibreve.
export function metroInUnita(metro, unita) {
  const m = /^C\|?$/.test(String(metro || "").trim()) ? 1
    : /^\d+\/\d+$/.test(String(metro || "").trim()) ? FRAZIONE_ABC(metro) : NaN;
  const l = /^\d+\/\d+$/.test(String(unita || "").trim()) ? FRAZIONE_ABC(unita) : 1 / 8;
  return Number.isFinite(m) && l > 0 ? m / l : NaN;
}
// `(3` = tre note nel tempo di due, `(2` = due nel tempo di tre, e così via.
const TUPLA_ABC = { 2: 3 / 2, 3: 2 / 3, 4: 3 / 4, 5: 2 / 5, 6: 2 / 6, 7: 2 / 7, 8: 3 / 8, 9: 2 / 9 };
// Quanto vale una battuta, in unità di L:. `a>b` (ritmo zoppo) non serve trattarlo: sposta durata
// dall'una all'altra e la SOMMA resta quella, che è l'unica cosa che qui interessa.
export function durataDellaBattuta(testo) {
  // `[1` e `[2` sono la prima e la seconda volta, `[K:...]` è un campo dentro la riga: nessuno dei
  // due è un accordo, e leggerli come accordi conta note che non esistono.
  let s = String(testo || "")
    .replace(/!([^!]*)!/g, " ").replace(/"[^"]*"/g, " ").replace(/\{[^}]*\}/g, " ").replace(/%.*$/g, " ")
    .replace(/\[[A-Za-z]:[^\]]*\]/g, " ").replace(/\[\s*\d/g, " ").replace(/^\s*\d+\s/, " ");
  let tot = 0, i = 0, fattore = 1, restaTupla = 0;
  const durata = () => {
    const m = /^(\d*)(\/*)(\d*)/.exec(s.slice(i));
    i += m[0].length;
    const num = m[1] ? Number(m[1]) : 1;
    const den = m[3] ? Number(m[3]) : (m[2] ? Math.pow(2, m[2].length) : 1);
    return den > 0 ? num / den : num;
  };
  const conta = (d) => { tot += d * fattore; if (restaTupla > 0 && --restaTupla === 0) fattore = 1; };
  while (i < s.length) {
    const c = s[i];
    if (c === "(") {
      const m = /^\((\d)/.exec(s.slice(i));
      if (m) { fattore = TUPLA_ABC[Number(m[1])] || 1; restaTupla = Number(m[1]); i += m[0].length; continue; }
      i++; continue;                                   // legatura di frase: non è durata
    }
    if (c === "[") {                                   // accordo: UNA durata per tutto il gruppo
      const fine = s.indexOf("]", i);
      if (fine < 0) { i++; continue; }
      i = fine + 1; conta(durata()); continue;
    }
    if (/[A-Ga-gzx]/.test(c)) {                        // nota, pausa, pausa invisibile
      i++;
      while (i < s.length && /[,']/.test(s[i])) i++;   // ottave
      conta(durata()); continue;
    }
    i++;                                               // alterazioni, legature, decorazioni, spazi
  }
  return tot;
}
// Il verdetto. `null` = tutto torna (o non si può giudicare); altrimenti la frase che dice cosa.
export function battuteCheNonTornano(abc, battute, metro, unita) {
  const attesa = metroInUnita(metro, unita);
  if (!Number.isFinite(attesa) || attesa <= 0) return null;  // senza metro non si giudica
  const parziali = [];
  for (const b of battute || []) {
    const vale = durataDellaBattuta(b.testo);
    if (Math.abs(vale - attesa) > 1e-6) parziali.push({ numero: b.numero, vale });
  }
  if (!parziali.length) return null;
  const lunghe = parziali.filter((p) => p.vale > attesa + 1e-6);
  if (lunghe.length) {
    return `${lunghe.length === 1 ? "una battuta più lunga" : `${lunghe.length} battute più lunghe`} del metro (${attesa} unità di L:): ${lunghe.slice(0, 4).map((p) => `n.${p.numero} vale ${p.vale}`).join(", ")}`;
  }
  if (parziali.length % 2) {
    const ultima = parziali[parziali.length - 1];
    return `battuta parziale spaiata: la n.${ultima.numero} vale ${ultima.vale} su ${attesa} e non c'è un'altra parziale che la completi (in un brano con la levata, le incomplete vanno a due a due)`;
  }
  for (let k = 0; k < parziali.length; k += 2) {
    const somma = parziali[k].vale + parziali[k + 1].vale;
    if (Math.abs(somma - attesa) > 1e-6) {
      return `le battute n.${parziali[k].numero} e n.${parziali[k + 1].numero} sono incomplete e insieme valgono ${somma}, non ${attesa}`;
    }
  }
  return null;                                          // anacrusi regolari: tornano a coppie
}

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
    // L'unico requisito che NON vale allo stesso modo per tutti, e il dato vero l'ha imposto: su 192
    // trascrizioni di archivio 31 hanno battute che non tornano, e sono musica vera scritta a
    // orecchio. Per un modello è un errore da rifare; per una trascrizione altrui è un avviso.
    id: "battute-che-tornano",
    avvisoPer: ["archivio"],
    detta: "Ogni battuta deve valere esattamente quanto dice il metro. Con M:4/4 e L:1/8 una battuta vale 8 crome: conta le durate prima di chiudere la stanghetta. Se il brano comincia con una levata, la battuta finale deve completarla.",
    verifica: (a) => battuteCheNonTornano(a.abc, a.battute, a.metro, a.unita),
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

export function analizzaSpartito(abc, origine = "modello", extra = []) {
  const righe = righeDi(abc);
  const a = {
    abc: String(abc || ""), origine,
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
  // Un requisito con `avvisoPer` che contiene questa origine non blocca: si registra e si mostra.
  // Non e' una tolleranza generica — e' scritto nel requisito, caso per caso, dove si vede.
  // `extra`: i requisiti nati dalla ricerca di questo turno (vedi requisitiDallaScheda). Non
  // sono nell'array fisso perché non esistono prima della domanda: valgono per QUESTO spartito.
  const esiti = [...REQUISITI_SPARTITO, ...(Array.isArray(extra) ? extra : [])].map((r) => {
    const motivo = r.verifica(a);
    return motivo ? { id: r.id, motivo, avviso: (r.avvisoPer || []).includes(origine) } : null;
  }).filter(Boolean);
  a.errori = esiti.filter((e) => !e.avviso);
  a.avvisi = esiti.filter((e) => e.avviso);
  a.ok = a.errori.length === 0;
  return a;
}

// Quello che si dice al modello: la stessa riga dello stesso array, letta dall'altro lato.
export function briefDelloSpartito({ argomento, battute = 16, strumento = "", conVersi = false, conVoci = false, scheda = null } = {}) {
  // I requisiti FISSI più quelli che nascono dalla ricerca: un oggetto solo letto due volte, anche
  // per i vincoli che non esistevano prima del turno.
  const tutti = [...REQUISITI_SPARTITO, ...requisitiDallaScheda(scheda)];
  const righe = tutti
    .filter((r) => conVersi || r.id !== "versi-allineati")
    .map((r, i) => `${i + 1}. ${r.detta}`);
  // QUELLO CHE LA RICERCA HA TROVATO va prima dei requisiti e si chiama per quello che è: non
  // «secondo me», ma «questo l'ho letto». Il modello deve poter distinguere ciò che gli è stato
  // ACCERTATO da ciò che sta inventando — è la stessa separazione che l'app pretende da sé stessa.
  const daRicerca = scheda && scheda.trovato ? [
    "",
    "QUELLO CHE HO LETTO SUL BRANO DI RIFERIMENTO (ricerca sul web, non memoria tua):",
    scheda.tonalita ? `· tonalità: ${scheda.tonalita}` : "",
    scheda.metro ? `· metro: ${scheda.metro}` : "",
    scheda.bpm ? `· andamento: ${scheda.bpm} bpm (mettilo in Q:)` : "",
    scheda.peculiarita ? `· cosa lo rende riconoscibile: ${scheda.peculiarita}` : "",
    "Scrivi qualcosa che stia in QUESTO mondo sonoro. Non copiarlo: è un riferimento, non un modello",
    "da riprodurre. Ma se ignori tonalità e metro qui sopra, il programma se ne accorge e te lo rimanda.",
  ].filter(Boolean) : [];
  return [
    `Scrivi uno spartito in notazione ABC${argomento ? ` su: ${argomento}` : ""}.`,
    strumento ? `Strumento: ${strumento}.` : "",
    `Circa ${battute} battute.`,
    conVoci
      ? `Scrivilo come PARTITURA, una voce per strumento: dichiarale con righe V: (per esempio V:Vc name="Violoncello" clef=bass) e poi marca ogni riga di musica con [V:...]. Raggruppale con %%score e le parentesi QUADRE (per esempio %%score [V1 V2 Va Vc]), mai con le tonde. Le chiavi disponibili sono clef=treble (violino), clef=bass (basso), clef=alto (contralto/viola), clef=tenor, clef=perc (percussioni). Tutte le voci devono avere lo STESSO numero di battute: la battuta 3 è la 3 per tutti.`
      : "",
    ...daRicerca,
    "",
    "Requisiti, controllati dal programma prima di tenere il risultato:",
    ...righe,
    "",
    "Rispondi SOLO con l'ABC, niente spiegazioni.",
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
    const analisi = analizza(abc, "archivio");
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
  // NON SI AFFERMA L'ASSENZA DA UN INSIEME CHE NON ESISTE. Con la lista vuota il filtro qui sotto
  // restituirebbe TUTTE le parole come «assenti» — vero in senso logico (`[].some()` è sempre
  // falso) e falso in senso pratico: non ci sono titoli in cui quelle parole manchino. Il Ghost se
  // l'è visto scritto il 14/09: «L'archivio ha risposto con 0 brani, ma le parole «lateralus»,
  // «tool» non compaiono in nessuno di QUEI titoli... te li ho tolti». Zero titoli, niente tolto,
  // e una potatura raccontata che non era avvenuta.
  if (!lista.length) return { risposte: [], scartati: 0, paroleAssenti: [] };
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

// IL TESTO CHE COMPARE IN CHAT LO SCRIVE IL PROGRAMMA, e vive QUI e non dentro il componente,
// perché afferma dei FATTI — quanti brani ha restituito l'archivio, quanti ne ho tolti io, quale
// parola è caduta a vuoto — e un testo che afferma fatti deve stare sotto banco. Dentro ShellView
// nessuna prova lo raggiungeva, ed è esattamente lì che il 14/09 ha detto al Ghost «te li ho tolti»
// avendo tolto niente.
//
// I QUATTRO CASI SONO QUATTRO, e ognuno ha la sua verità:
//   errore   — la ricerca non è partita. Diverso da "non c'è": riprovare ha senso.
//   nessuno  — l'archivio non conosce niente con quelle parole. Zero risposte, zero potature.
//   potati   — l'archivio ne ha restituiti N ma nessuno rispondeva (cerca in OR). Qui la parola
//              caduta a vuoto è la spiegazione, ed è la differenza fra "non trovo" e "so perché".
//   trovati  — ci sono. Se qualcuno è stato tolto si dice quanti e perché.
// ── «NON CE NE SONO ALTRI» ERA UNA FRASE SBAGLIATA — 14/09/2026 ─────────────────────────────────
// Il Ghost ha risposto al messaggio dell'app mandando tre schermate: Lateralus dei Tool su
// MuseScore, con la riga del basso, e la stessa su Songsterr con la parte di Justin Chancellor e
// l'accordatura giusta. Aveva ragione: ESISTONO, e dire «gli archivi di tablature per quella
// musica non si lasciano interrogare da un'app come questa» lo faceva suonare come «non esistono».
//
// Sono due frasi diverse e solo la seconda è vera. Misurato oggi, non supposto:
//   Songsterr  — la sua interfaccia dati risponde 200 con il JSON giusto (songId 20198, traccia
//                «Electric Bass (pick) · Justin Chancellor»), ma NON manda `access-control-allow-
//                origin` e il preflight OPTIONS risponde 404. Un browser non può leggerla: non è
//                una scelta mia, è il muro del browser.
//   MuseScore  — 403 Cloudflare («Just a moment...») a chiunque non sia un browser vero, e la sua
//                API ufficiale vuole una chiave di client. Nemmeno da un server ci si arriva.
//
// QUINDI: quello che l'app PUO' fare è dire dove sono e portarci il Ghost. Un link non è una
// ricerca dentro l'app, ed è onesto chiamarlo per quello che è — si apre fuori, e quello che c'è
// là fuori resta là fuori. Meglio di un «non ce ne sono altri» che è falso.
export const ARCHIVI_NON_INTERROGABILI = [
  {
    id: "songsterr",
    nome: "Songsterr",
    perChe: "tablature di rock, metal e pop, con la parte separata di ogni strumento",
    muro: "la sua interfaccia dati risponde, ma senza le intestazioni che servono a un browser per leggerla (CORS). Misurato il 14/09/2026.",
    cerca: (q) => `https://www.songsterr.com/?pattern=${encodeURIComponent(q)}`,
  },
  {
    // 15/09/2026 — aggiunto perché il Ghost ha chiesto «la primavera di Vivaldi» e i due archivi di
    // prima sono tutti e due di musica moderna: per il CLASSICO non c'era niente da offrire.
    id: "imslp",
    nome: "IMSLP",
    perChe: "musica classica di pubblico dominio: partiture e parti staccate, Vivaldi e Beethoven compresi",
    muro: "è una biblioteca di PDF e scansioni, non di notazione leggibile da un programma: quello che c'è là non si trasforma in ABC da solo. Misurato il 15/09/2026.",
    cerca: (q) => `https://imslp.org/index.php?title=Special:Search&search=${encodeURIComponent(q)}`,
  },
  {
    id: "musescore",
    nome: "MuseScore",
    perChe: "spartiti caricati dalle persone, spesso partiture intere",
    muro: "sta dietro una protezione anti-robot: risponde 403 a chiunque non sia un browser vero. Misurato il 14/09/2026.",
    cerca: (q) => `https://musescore.com/sheetmusic?text=${encodeURIComponent(q)}`,
  },
];
export const altroveDoveCercare = (query) => ARCHIVI_NON_INTERROGABILI.map((a) => ({
  id: a.id, nome: a.nome, perChe: a.perChe, muro: a.muro, url: a.cerca(String(query || "")),
}));

export function spiegazioneRicerca({ query, strumento = "", autore = "", esito, archivio = ARCHIVIO_SPARTITI }) {
  const e = esito || {};
  const tunes = Array.isArray(e.tunes) ? e.tunes : [];
  const assenti = Array.isArray(e.paroleAssenti) ? e.paroleAssenti : [];
  const grezzi = Number(e.grezzi) || 0;
  const scartati = Number(e.scartati) || 0;
  const pertinenti = Number(e.pertinenti) || tunes.length;
  const altrove = altroveDoveCercare(query);
  // 15/09/2026 — DENSO, NON LUNGO, e vale anche per me. Il Ghost ha mandato tre schermate di
  // messaggio per dire «non c'è»: il muro spiegava CORS, 403, il repertorio dell'archivio e le
  // alternative, tutto in prosa. È la regola di casa rotta dall'app che la predica (vedi MAGI_FORMA
  // e la riga «si tolgono le parole, mai i fatti»). I fatti restano tutti — il motivo tecnico di
  // ogni archivio è nella card, accanto al suo link, dove serve a chi lo sta per toccare.
  const note = [
    strumento ? `«${strumento}» non filtra: l'archivio indicizza i brani, non gli arrangiamenti.` : "",
    autore ? `«${autore}» l'ho letto come autore e non l'ho messo nella ricerca.` : "",
  ].filter(Boolean);
  const coda = (righe) => [righe, note.length ? "\n" + note.join(" ") : ""].filter(Boolean).join("\n");
  if (e.errore) {
    return { caso: "errore", altrove: [], testo: coda(`Ho cercato «${query}» in ${archivio.nome} ma la richiesta non è partita: ${e.errore}. Non è «non c'è»: è «non ho potuto guardare». Riprova fra poco.`) };
  }
  if (!tunes.length && !grezzi) {
    return { caso: "nessuno", altrove, testo: coda(`Ho cercato «${query}» in ${archivio.nome}: zero. Quell'archivio tiene solo ${archivio.perChe} — è il suo repertorio, non un guasto.\n\nI link qui sotto portano dove invece c'è: si aprono fuori dall'app.`) };
  }
  if (!tunes.length) {
    const perche = assenti.length
      ? `${grezzi} ${grezzi === 1 ? "risultato" : "risultati"}, ma ${assenti.map((p) => `«${p}»`).join(", ")} non ${assenti.length === 1 ? "compare" : "compaiono"} in nessun titolo: è altra musica, non te la mostro.`
      : `${grezzi} ${grezzi === 1 ? "risultato" : "risultati"}, nessuno con tutte le parole che hai chiesto: non te li mostro.`;
    return { caso: "potati", altrove, testo: coda(`Ho cercato «${query}» in ${archivio.nome} e non c'è. ${perche}\n\nQuell'archivio tiene solo ${archivio.perChe}. I link qui sotto portano dove invece c'è.`) };
  }
  const tolti = scartati ? ` (${scartati} scartati su ${grezzi}: non contenevano quello che hai chiesto)` : "";
  return { caso: "trovati", altrove: [], testo: coda(`«${query}» in ${archivio.nome}: ${pertinenti} ${pertinenti === 1 ? "brano" : "brani"}${pertinenti > tunes.length ? `, te ne mostro ${tunes.length}` : ""}${tolti}. Aprine uno per vedere le sue trascrizioni.`) };
}


// ══════════════════════════════════════════════════════════════════════════════
// INFORMARSI PRIMA DI INVENTARE — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «se chiedessi di generare una linea di basso sullo stile di Stratus di Billy Cobham,
// non basta che trovi lo spartito: dovrebbe informarsi online sulle peculiarità di quel brano e di
// quella linea di basso in particolare, PRIMA di generare una risposta».
//
// Fino a oggi `generaSpartito` passava il brief al modello nudo, e il modello inventava da quello
// che ricorda. Su un riferimento preciso — un brano che esiste, con un groove che chi suona
// riconosce — quello che ricorda è mediamente il NIENTE: sa che Stratus è funk e scrive un funk
// generico, in 4/4, in Do. È la stessa forma di difetto di tutto il resto: il modello dice a parole.
//
// E C'E' UN SECONDO GUADAGNO, più grande del primo. Quello che la ricerca trova non è solo
// contesto da leggere: tonalità, metro e andamento sono DATI, e un dato si può CONTROLLARE. Quindi
// la scheda che esce dalla ricerca diventa un requisito in più per lo spartito generato — se la
// ricerca dice 16/16 e il modello scrive 4/4, il disaccordo torna indietro come tutti gli altri.
// È l'accettore d'azione di Anochin nella sua forma piena: il controllo si forma PRIMA di agire,
// insieme alla decisione, e SPECIFICA che forma dovrà avere il risultato.
const RIFERIMENTO_RE = /\b(?:(?:sullo|nello)\s+stile\s+di|alla\s+maniera\s+di|nello\s+spirito\s+di|ispirat[oa]\s+a|come\s+(?:in|quell[ao]\s+di)|tipo|à\s+la)\s+(.+)$/i;
// «Stratus di Billy Cobham» → brano «Stratus», artista «Billy Cobham». Stessa regola dell'italiano
// già usata per la ricerca: l'autore è la coda «di <Nome>», e si stacca solo se prima resta altro.
export function riferimentoDaBrief(testo) {
  const t = String(testo || "");
  const m = RIFERIMENTO_RE.exec(t);
  if (!m) return null;
  let resto = m[1].trim().replace(/[.,;!?]+\s*$/, "");
  // Si ferma alla prima congiunzione che apre un'altra idea: «...di Billy Cobham, ma più lenta».
  resto = resto.split(/\s*,\s*(?:ma|però|anche se|solo che)\b/i)[0].trim();
  if (!resto) return null;
  let brano = resto, artista = "";
  const coda = /\s(?:di|dei|degli|delle|della|del|d')\s+((?!(?:di|dei|degli|delle|della|del|d')\b)[A-Za-zÀ-ù'.]+(?:\s+(?!(?:di|dei|degli|delle|della|del|d')\b)[A-Za-zÀ-ù'.]+){0,2})\s*$/i.exec(resto);
  if (coda && resto.slice(0, coda.index).trim()) {
    artista = coda[1].trim();
    brano = resto.slice(0, coda.index).trim();
  }
  brano = brano.replace(/^(?:il|lo|la|l'|un|uno|una)\s+/i, "").trim();
  return brano ? { brano, artista, testo: resto } : null;
}
// Cosa si chiede alla ricerca. NON «raccontami il brano»: cinque dati precisi, perché su quelli il
// programma può poi controllare. Il resto è prosa e serve solo al modello che scriverà le note.
export function briefRicercaCaratteristiche({ brano, artista = "", strumento = "" } = {}) {
  const che = [brano, artista ? `di ${artista}` : ""].filter(Boolean).join(" ");
  return [
    `Cerca sul web le caratteristiche musicali di: ${che}.`,
    strumento ? `Interessa in particolare la parte di ${strumento}.` : "",
    "",
    "Rispondi ESATTAMENTE in questa forma, una riga per campo, e lascia vuoto quello che la ricerca",
    "non dice invece di riempirlo a memoria:",
    "TONALITA: (per esempio Mi minore, o E minor, o vuoto)",
    "METRO: (per esempio 4/4, 6/8, 16/16, o vuoto)",
    "ANDAMENTO: (battiti al minuto, solo il numero, o vuoto)",
    "PECULIARITA: (2-4 righe: cosa rende riconoscibile quel brano e quella parte — il groove, gli",
    "intervalli, la tecnica, la figura ritmica che torna, l'ambito dello strumento)",
    "",
    "Se la ricerca non trova niente di specifico su questo brano, scrivi tutti i campi vuoti e",
    `PECULIARITA: non trovato. Meglio dirlo che descrivere un brano generico: il programma userà`,
    "quello che scrivi come vincolo, e un vincolo inventato produce musica sbagliata con sicurezza.",
  ].filter(Boolean).join("\n");
}
const CHIAVI_ITA = { do: "C", re: "D", mi: "E", fa: "F", sol: "G", la: "A", si: "B" };
// Dal testo della ricerca ai DATI. Solo quello che si riconosce con certezza: un campo che non si
// legge resta vuoto, e un campo vuoto non diventa un vincolo.
export function schedaDaRicerca(testo) {
  const t = String(testo || "");
  // Le parentesi NON sono facoltative: senza, `^TONALITA|TONALITÀ\s*:` vuol dire «comincia per
  // TONALITA» OPPURE «TONALITÀ seguito da due punti», e il gruppo catturato esiste solo nel secondo
  // ramo. La tonalità non veniva letta mai — trovato provandolo, non rileggendolo.
  const campo = (nome) => (new RegExp(`^(?:${nome})\\s*:\\s*(.*)$`, "im").exec(t) || [])[1]?.trim() || "";
  const grezzaTon = campo("TONALITA|TONALITÀ");
  const grezzoMetro = campo("METRO");
  const grezzoBpm = campo("ANDAMENTO");
  const peculiarita = campo("PECULIARITA|PECULIARITÀ");
  // «Mi minore» → «Em»; «E minor» → «Em»; «Do maggiore» → «C».
  let tonalita = "";
  const mIta = /\b(do|re|mi|fa|sol|la|si)\b\s*(diesis|bemolle)?\s*(minore|maggiore)?/i.exec(grezzaTon);
  const mIng = /\b([A-G])\s*(#|b)?\s*(min(?:or)?|maj(?:or)?|m)\b/i.exec(grezzaTon);
  if (mIta) tonalita = CHIAVI_ITA[mIta[1].toLowerCase()] + (mIta[2] ? (/diesis/i.test(mIta[2]) ? "#" : "b") : "") + (/minore/i.test(mIta[3] || "") ? "m" : "");
  else if (mIng) tonalita = mIng[1].toUpperCase() + (mIng[2] || "") + (/^m(in)?/i.test(mIng[3]) ? "m" : "");
  const metro = (/\b(\d{1,2}\/\d{1,2})\b/.exec(grezzoMetro) || [])[1] || "";
  const bpm = Number((/\b(\d{2,3})\b/.exec(grezzoBpm) || [])[1]) || 0;
  const trovato = !/^\s*non trovato\s*$/i.test(peculiarita) && !!(tonalita || metro || bpm || peculiarita);
  return { tonalita, metro, bpm, peculiarita: /^\s*non trovato\s*$/i.test(peculiarita) ? "" : peculiarita, trovato };
}
// I VINCOLI CHE NASCONO DALLA RICERCA. Si aggiungono ai requisiti fissi solo per i campi che la
// ricerca ha davvero riempito: quello che non si sa non si pretende.
export function requisitiDallaScheda(scheda) {
  const s = scheda || {};
  const fuori = [];
  if (s.metro) fuori.push({
    id: "metro-della-ricerca",
    detta: `La ricerca dice che questo brano è in ${s.metro}: usa M:${s.metro}.`,
    verifica: (a) => (a.metro || "").replace(/\s/g, "") === s.metro ? null
      : `la ricerca dice che il brano è in ${s.metro}, lo spartito dichiara ${a.metro || "niente"}`,
  });
  if (s.tonalita) fuori.push({
    id: "tonalita-della-ricerca",
    detta: `La ricerca dice che la tonalità è ${s.tonalita}: usa K:${s.tonalita}.`,
    // SI CONFRONTA LA FONDAMENTALE E SE IL COLORE E' MINORE, non la scritta esatta. `Edor` è il
    // modo dorico di MI ed è minore: rispetto a `Em` è una variante, non un errore da rifare — e
    // nel repertorio vero si scrive così di continuo. Un giro di banco è servito a scoprirlo: il
    // primo confronto guardava solo «m» o «min» e bocciava Edor.
    // Minori: m, min, dor, phr, aeo, loc. Maggiori: niente, maj, ion, mix, lyd.
    verifica: (a) => {
      const leggi = (x) => {
        const m = /^([A-G][#b]?)\s*([A-Za-z]*)/.exec(String(x || "").trim());
        if (!m) return null;
        return { nota: m[1].toUpperCase(), minore: /^(m|min|dor|phr|aeo|loc)/i.test(m[2] || "") };
      };
      const vuole = leggi(s.tonalita), ha = leggi(a.tonalita);
      if (!vuole) return null;                                   // non so cosa pretendere
      return ha && ha.nota === vuole.nota && ha.minore === vuole.minore ? null
        : `la ricerca dice tonalità ${s.tonalita}, lo spartito dichiara ${a.tonalita || "niente"}`;
    },
  });
  return fuori;
}

// ══════════════════════════════════════════════════════════════════════════════
// CERCARE IN TUTTO IL WEB, NON SOLO IN UN ARCHIVIO — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «deve cercare online, in tutto il web, come una ricerca Google, non solo in archivi».
// Ha ragione, e il mattone c'era già: `openrouter:web_search` è cablato in app.js dal 26/07/2026 e
// lo usa Balthasar. Mancava di puntarlo sugli spartiti.
//
// PERCHE' E' DIVERSA DALLA RICERCA IN ARCHIVIO, e le due convivono invece di sostituirsi:
//   · L'ARCHIVIO (The Session) costa zero e restituisce ABC PRONTO — si apre, si suona, si salva
//     nel percorso. Ma ha un repertorio solo, perché ABC è la notazione del folk.
//   · IL WEB costa (passa da un modello) e restituisce INDIRIZZI, non musica. Copre tutto —
//     Vivaldi, i Tool, qualunque cosa — ma quello che trova resta fuori dall'app finché il Ghost
//     non ci va, fa uno screenshot e lo fa trascrivere.
// Quindi si fanno tutte e due, in quest'ordine, e la card le tiene separate: quello che si può
// TENERE e quello che si può solo APRIRE. Confonderle sarebbe promettere musica e dare link.
//
// I LINK LI MOSTRA IL PROGRAMMA, NON IL MODELLO. La risposta di OpenRouter porta le `annotations`:
// gli indirizzi che il motore di ricerca ha DAVVERO restituito. Un modello che elenca link se li
// ricorda, e un link ricordato male porta a una pagina che non esiste — stessa classe di difetto
// degli appuntamenti inventati. Quindi il programma mostra le annotazioni, e il testo del modello
// serve solo da commento. Per costruzione non può comparire un indirizzo inventato.
export function briefRicercaWebSpartito({ query, autore = "", strumento = "" } = {}) {
  const che = [query, autore ? `di ${autore}` : "", strumento ? `per ${strumento}` : ""].filter(Boolean).join(" ");
  return [
    `Cerca sul web dove si può trovare lo spartito o la tablatura di: ${che}.`,
    "",
    "Cerca in tutto il web, non in un archivio solo. Vanno bene siti di spartiti, biblioteche di",
    "pubblico dominio, forum di musicisti, pagine di trascrizioni, video con la trascrizione a",
    "schermo. Se il brano è di pubblico dominio (musica classica) dillo, perché cambia dove cercare.",
    "",
    "Poi scrivi al massimo sei righe, una per ogni posto che hai trovato, in questa forma:",
    "- NOME DEL SITO — cosa c'è (pentagramma, tablatura, PDF, MIDI, MusicXML, ABC) — gratis o a pagamento",
    "",
    "NON SCRIVERE GLI INDIRIZZI: li mette il programma, presi dai risultati veri della ricerca.",
    "Se scrivi un indirizzo a memoria e sbagliato, il Ghost ci clicca e non trova niente.",
    "Se la ricerca non ha trovato niente di utile, dillo in una riga invece di riempire lo spazio.",
  ].join("\n");
}
// Il giudizio su cosa offre ogni posto trovato, fatto dal PROGRAMMA sul dominio — non chiesto al
// modello. Serve a ordinare i risultati per quanto sono vicini a qualcosa di usabile qui dentro:
// una pagina che dà ABC o MusicXML si può portare nell'app, un PDF si può solo guardare.
const DOMINI_NOTI = [
  { re: /(^|\.)thesession\.org$/i, che: "notazione ABC, tradizionale irlandese", portabile: "abc" },
  { re: /(^|\.)abcnotation\.com$/i, che: "notazione ABC", portabile: "abc" },
  { re: /(^|\.)imslp\.org$/i, che: "PDF di pubblico dominio, spesso con le parti staccate", portabile: "immagine" },
  { re: /(^|\.)mutopiaproject\.org$/i, che: "pubblico dominio, anche MusicXML e MIDI", portabile: "musicxml" },
  { re: /(^|\.)musescore\.com$/i, che: "spartiti caricati dalle persone", portabile: "immagine" },
  { re: /(^|\.)songsterr\.com$/i, che: "tablature con la parte di ogni strumento", portabile: "immagine" },
  { re: /(^|\.)ultimate-guitar\.com$/i, che: "accordi e tablature testuali", portabile: "immagine" },
  { re: /(^|\.)8notes\.com$/i, che: "spartiti per strumento singolo", portabile: "immagine" },
  { re: /(^|\.)cpdl\.org$/i, che: "musica corale di pubblico dominio", portabile: "immagine" },
  { re: /(^|\.)youtube\.com$/i, che: "video: la trascrizione scorre a schermo", portabile: "no" },
];
export function fontiPerSpartito(fonti) {
  const lista = Array.isArray(fonti) ? fonti : [];
  const peso = { abc: 0, musicxml: 1, immagine: 2, no: 3, "": 4 };
  return lista
    .filter((f) => f && f.url)
    .map((f) => {
      const noto = DOMINI_NOTI.find((d) => d.re.test(f.dominio || ""));
      return { ...f, che: noto ? noto.che : "", portabile: noto ? noto.portabile : "" };
    })
    .sort((a, b) => (peso[a.portabile] ?? 4) - (peso[b.portabile] ?? 4));
}
// Se il modello ha scritto un indirizzo nonostante il divieto, si toglie: quello che si mostra deve
// venire dalle annotazioni. Restituisce anche QUANTI ne ha scritti, perché un modello che continua
// a farlo è un fatto da vedere, non da nascondere.
export function senzaIndirizziInventati(testo, fonti) {
  const veri = new Set((Array.isArray(fonti) ? fonti : []).map((f) => String(f.url || "")));
  let quanti = 0;
  const pulito = String(testo || "").replace(/https?:\/\/[^\s)\]<>"']+/gi, (u) => {
    if (veri.has(u)) return u;
    quanti++;
    return "";
  }).replace(/[ \t]{2,}/g, " ").replace(/\(\s*\)|\[\s*\]/g, "").trim();
  return { testo: pulito, inventati: quanti };
}

// ══════════════════════════════════════════════════════════════════════════════
// LEGGERE UNO SPARTITO DA UN'IMMAGINE — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Proposta del Ghost: «basterebbe banalmente una ricerca Google e poi osservare le immagini».
// I mattoni c'erano già (la visione è cablata in app.js dal primo giorno, `image_url` in base64):
// mancava di metterli in fila, e mancava soprattutto l'accettore delle DURATE, senza il quale
// questa strada fabbrica spartiti plausibili e falsi. Quello adesso c'è.
//
// QUESTA E' LA DIFFERENZA CHE NON VA MAI PERSA DI VISTA: uno spartito generato è un'INVENZIONE, e
// se è brutto si vede. Uno spartito TRASCRITTO da un'immagine pretende di essere fedele a una cosa
// che esiste, e se è sbagliato NON si vede — note giuste e ritmo storto sono indistinguibili da una
// lettura corretta, per chi non ha l'originale sotto gli occhi. Quindi:
//  · l'accettore pretende che le battute tornino col metro (lì cade un modello che legge male);
//  · quello che il programma NON può controllare — se le note sono LE NOTE GIUSTE — si dichiara
//    ogni volta, senza attenuanti. Il confronto lo fa il Ghost, che è musicista, e l'app gli mette
//    il pentagramma ridisegnato a un dito di distanza dall'immagine che ha appena mandato.
//  · il modello dice cosa NON è riuscito a leggere in righe di commento `%`: sono legittime in ABC,
//    l'accettore le ignora già, e il programma le estrae e le mostra. Un «non ci sono arrivato»
//    dentro le note sarebbe prosa e verrebbe scartato — il posto per dirlo va DATO.
const VERBI_TRASCRIVI = /\b(trascriv\w*|trascrizione|leggi(?:mi)?|leggere|convert\w+|trasform\w+|digitalizz\w+|estrai|ricav\w+)\b/i;
const OGGETTO_TRASCRIVI = /\b(spartit[oi]|tablatur[ae]|partitur[ae]|pentagramm[ai]|abc|musica|note|bass[oi]|accordi)\b/i;
export function richiestaDiTrascrizione(frase) {
  const t = String(frase || "");
  if (!VERBI_TRASCRIVI.test(t) || !OGGETTO_TRASCRIVI.test(t)) return null;
  const strumento = (/\b(?:per|del|della|il|la|l')\s*(bass[oi]|chitarr[ae]|violin[oi]|pianoforte|piano|flaut[oi]|mandolin[oi]|voce|batteri[ae])\w*/i.exec(t) || [])[1] || "";
  return { strumento, conVersi: /\b(vers[oi]|parole|testo|liriche|cantat[oa])\b/i.test(t), frase: t.trim() };
}
// Quello che si dice al modello quando LEGGE invece di inventare. I requisiti sono gli stessi —
// un oggetto solo letto due volte — ma le istruzioni attorno sono l'opposto: qui non deve avere
// idee, deve copiare, e deve dire dove non ci arriva invece di riempire il buco.
export function briefDiTrascrizione({ strumento = "", conVersi = false } = {}) {
  const righe = REQUISITI_SPARTITO
    .filter((r) => conVersi || r.id !== "versi-allineati")
    .map((r, i) => `${i + 1}. ${r.detta}`);
  return [
    "Nell'immagine c'è uno spartito. Trascrivilo in notazione ABC il più fedelmente possibile.",
    strumento ? `Trascrivi la parte di: ${strumento}.` : "Se ci sono più strumenti, trascrivi quello più completo e dillo in un commento.",
    "",
    "NON INVENTARE. Non stai componendo: stai copiando. Se una battuta non si legge, NON riempirla a orecchio:",
    "scrivila come pausa e dillo in una riga di commento che comincia con %. Una battuta inventata è peggio",
    "di una battuta mancante, perché non si distingue da una letta bene.",
    "",
    "Se c'è sia il pentagramma sia la TABLATURA, leggi il PENTAGRAMMA: dicono la stessa cosa, ma il",
    "pentagramma porta le durate, che sono la cosa che si sbaglia più facilmente.",
    "Se c'è un'accordatura dichiarata (per esempio Drop D), scrivila in un commento %: l'altezza delle note",
    "in ABC è quella che suona, non la posizione sul manico.",
    conVersi ? "Metti i versi sotto le note con w:, una sillaba per nota." : "",
    "",
    "Requisiti di forma, controllati dal programma prima di tenere il risultato:",
    ...righe,
    "",
    "PRIMA DI CHIUDERE OGNI STANGHETTA, CONTA. È l'errore che si fa leggendo: le note giuste nel ritmo sbagliato.",
    "",
    "Rispondi SOLO con l'ABC. Le note di lettura vanno in righe che cominciano con % dentro l'ABC stesso.",
  ].filter(Boolean).join("\n");
}
// Le righe di commento che il modello ha lasciato: sono il suo «qui non ci sono arrivato».
export function noteDiLettura(abc) {
  return String(abc || "").replace(/\r\n?/g, "\n").split("\n")
    .filter((r) => /^%(?!%)/.test(r.trim()))
    .map((r) => r.trim().replace(/^%\s*/, ""))
    .filter((r) => r && !/^source\s/i.test(r));
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
  const strumento = (/\bper\s+(?:il\s+|lo\s+|la\s+|l')?(bass[oi]|chitarr[ae]|violin[oi]|viol[ea]|pianoforte|piano|flaut[oi]|ottavin[oi]|clarinett[oi]|oboe|fagott[oi]|tromb[ae]|tromboni?|cornon?|sassofon[oi]|sax|mandolin[oi]|fisarmonic[ah]|violoncell[oi]|contrabbass[oi]|arp[ae]|organo|batteri[ae]|voce|cant[oo])\w*(?:\s+travers[oa]|\s+elettric[oa]|\s+acustic[ao]|\s+classic[ao])?/i.exec(t) || [])[1] || "";
  // ── IL BRANO STA DOPO «DELLA», L'AUTORE DOPO «DI» — 15/09/2026 ────────────────────────────────
  // Difetto trovato dal Ghost: «Cerca lo spartito per flauto traverso DELLA PRIMAVERA DI ANTONIO
  // VIVALDI» cercava «Antonio Vivaldi». Prendeva il PRIMO «di» della frase, e in italiano quello è
  // quasi sempre l'autore, mentre il titolo sta prima, dopo «della/del/dei». Su «il chiaro di luna
  // di Beethoven» era anche peggio: «luna Beethoven», con «chiaro» perso per strada.
  //
  // La regola vera dell'italiano: il pezzo finale «di <Nome>» è l'AUTORE, e va tolto — ma SOLO se
  // prima resta qualcosa, altrimenti in «lo spartito di Cooley's» si butterebbe via il titolo.
  // L'autore non si getta: si DICHIARA, così il Ghost vede cosa ho tolto e perché.
  const dopoOggetto = new RegExp(`${OGGETTO_SPARTITO.source}\\s+(.+)$`, "i").exec(t);
  let resto = (dopoOggetto ? dopoOggetto[2] : (/\bdi\s+(.+)$/i.exec(t) || [])[1] || "").trim();
  // Via lo strumento, prima di tutto: «per flauto traverso» sta in mezzo al titolo e lo spezza.
  resto = resto.replace(/\bper\s+(?:il\s+|lo\s+|la\s+|l')?[a-zà-ù]+(?:\s+(?:travers[oa]|elettric[oa]|acustic[ao]|classic[ao]))?/i, " ");
  // E via la coda di cortesia PRIMA di cercare l'autore: senza, «dei Beatles e mostramelo» finiva
  // tutto nel nome del gruppo.
  resto = resto.replace(/\s*(?:\be\b\s*)?(?:mostramel[oa]|fammel[oa]\s+vedere|per favore|online|in rete|su internet)\s*$/gi, " ").trim();
  let autore = "";
  // L'ULTIMA occorrenza, non la prima, e al massimo tre parole. Il primo giro prendeva la prima e
  // catturava fino in fondo: su «della primavera di Antonio Vivaldi» matchava «della» e si portava
  // via tutto il titolo, lasciando l'autore dentro la ricerca. Su «il chiaro di luna di Beethoven»
  // prendeva «di luna di Beethoven» e «chiaro» restava solo.
  // La cattura NON può contenere a sua volta una preposizione, o si mangia il titolo: senza questo
  // divieto «di One dei Metallica» matchava dall'inizio catturando «One dei Metallica», e il
  // titolo spariva dentro il nome del gruppo.
  const NO_PREP = "(?!(?:di|dei|degli|delle|della|del|d')\\b)";
  const CODA_AUTORE = new RegExp(`\\s(?:di|dei|degli|delle|della|del|d')\\s+(${NO_PREP}[A-Za-zÀ-ù'.]+(?:\\s+${NO_PREP}[A-Za-zÀ-ù'.]+){0,2})\\s*$`, "gi");
  let ultima = null;
  for (const m of resto.matchAll(CODA_AUTORE)) ultima = m;
  if (ultima) {
    const senzaCoda = resto.slice(0, ultima.index).trim();
    // Si toglie SOLO se prima resta un titolo. Con «di Cooley's» non resta niente: quello È il
    // titolo, e buttarlo lascerebbe la ricerca senza niente da cercare.
    if (senzaCoda.replace(RUMORE_QUERY_SPARTITO, " ").replace(/\s+/g, " ").trim()) {
      autore = ultima[1].trim();
      resto = senzaCoda;
    }
  }
  const query = resto
    .replace(RUMORE_QUERY_SPARTITO, " ")
    .replace(/\be\s*$/i, " ")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ").slice(0, 6).join(" ");
  return query ? { query, strumento, autore, frase: t.trim() } : null;
}

