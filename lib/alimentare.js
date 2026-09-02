// Il piano alimentare, per intero tranne la chiamata al modello (generaRepertorioPasti resta in
// app.js, perche' e' l'unica parte che parla con la rete). Qui dentro c'e' tutto cio' che il
// PROGRAMMA sa fare da solo: leggere un vincolo dichiarato, capire cosa esclude, montare la griglia
// dei giorni, formattarla, e rileggerla dopo per dire cosa non torna.
// Estratto da app.js il 31/08/2026 senza cambiare una riga di logica: solo spostato e reso esplicito
// cio' che entra (senzaAccenti) e cio' che esce (l'elenco in fondo).

import { senzaAccenti } from "./base.js";
import { montaGriglia } from "./griglia.js";

// ══════════════════════════════════════════════════════════════════════════════
// IL PIANO ALIMENTARE: IL CODICE NON SA COMPORLO, MA SA CONTROLLARLO (23/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha elencato cinque difetti di un piano generato, e aveva ragione su tutti e cinque:
// il salmone che aveva escluso compariva lo stesso; le colazioni erano dolci invece che salate;
// mancavano le dosi, chieste due volte; il piano si dichiarava "bisettimanale, 14 giorni diversi" e
// ripeteva uno schema piu' corto; e il pollo compariva a pranzo e a cena lo stesso giorno.
//
// La diagnosi, misurata sul prompt vero. Le esclusioni che il Ghost dichiara PARLANDO vivono solo
// dentro la conversazione: nel prompt di sistema non c'e' una parola di "pesce", "crostacei",
// "colazioni salate". E la conversazione che rientra e' tagliata agli ultimi venti messaggi —
// misurato: dopo dieci scambi di contorno l'esclusione del pesce E' USCITA, e il modello smette
// semplicemente di vederla. Non e' che la ignora: non ce l'ha piu' davanti.
//
// Per il calendario la cura e' stata "l'elenco lo compone il codice". Qui non si puo': un menu il
// codice non sa inventarlo, e non deve. Ma l'altra meta' della cura vale identica — IL CODICE
// CONTROLLA DOPO, E DICE COSA NON TORNA. Un piano con un errore resta utile; un piano con un errore
// che nessuno segnala costa al Ghost il lavoro di rileggerselo riga per riga, che e' esattamente
// quello che ha dovuto fare.
// Il piano NON viene mai cancellato ne' riscritto: si aggiunge un riquadro che elenca gli scarti.

// ── PRIMA DEL CONTROLLO, IL POSTO DOVE UN VINCOLO VIVE. ──────────────────────────────────────
// Il controllo qui sotto funziona solo se sa cosa il Ghost ha escluso. E li' c'era il buco vero:
// un'esclusione detta parlando ("escludi il pesce che non sia crostacei") vive SOLO dentro la
// conversazione, e la conversazione che rientra nel prompt e' tagliata agli ultimi venti messaggi.
// Misurato: dopo dieci scambi di contorno quella frase e' fuori, e il modello smette di vederla —
// non la ignora, non ce l'ha piu'. Un posto durevole esiste gia' ed e' l'elenco dei vincoli
// dichiarati (hardConstraints con pilastro "bio"), che finisce nel prompt di sistema a ogni turno,
// per sempre. Quello che mancava era un modo per arrivarci senza cambiare schermata e riscrivere
// tutto a mano.
// Questo rilevatore e' deterministico e costa zero: riconosce le forme in cui una regola alimentare
// si dichiara. Non salva niente da solo — propone, e decide il Ghost con un gesto, come per i Semi
// e per il vincolo AIR. Un vincolo dedotto e salvato in silenzio sarebbe la stessa cosa storta di
// una conferma dedotta dal contesto.
// Due forme, e la differenza fra loro conta. I VERBI di esclusione hanno senso solo all'inizio di
// una proposizione — "non mangio latticini" e' un vincolo, "so che non mangio volentieri" no — e
// quindi vogliono un separatore davanti. Le altre due forme si riconoscono da sole ovunque stiano
// nella frase, perche' sono gia' complete: "colazioni salate", "1600 kcal".
const VINCOLO_CON_VERBO_RE = /(?:^|[.;,]\s*|\b(?:con|da|ma|e)\s+)((?:esclud|niente\s|non\s+(?:mangio|voglio|bevo)|evit|togli\s|elimin|no\s+(?:al|ai|alla|alle|il|la|i|gli|le)\s|sono\s+(?:intollerante|allergic)|mai\s+)[^.;!?\n]{3,90})/gi;
const VINCOLO_AUTONOMO_RE = /((?:le\s+)?colazion\w*[^.;!?\n]{0,40}(?:salat|dolc)\w*|\d{3,4}\s*kcal(?:\s+al\s+giorno)?)/gi;
function proponiVincoliAlimentari(messaggio) {
  const t = String(messaggio || "");
  if (!t.trim()) return [];
  const fuori = [];
  for (const m of [...t.matchAll(VINCOLO_CON_VERBO_RE), ...t.matchAll(VINCOLO_AUTONOMO_RE)]) {
    const frase = m[1].trim().replace(/[,;\s]+$/, "");
    // Una frase troppo corta non dice niente di utile, e una troppo lunga non e' un vincolo: e' un
    // discorso. Il tetto tiene fuori i periodi interi che nominano un'esclusione di passaggio.
    if (frase.length >= 7 && frase.length <= 90) fuori.push(frase);
  }
  return [...new Set(fuori)].slice(0, 4);
}
// La tassonomia serve a una cosa sola e precisa: il Ghost ha escluso "il pesce", e nel piano e'
// comparso "il salmone". Nessuna corrispondenza di parole puo' collegarli — "salmone" non e' scritto
// da nessuna parte nella sua esclusione. Serve sapere che il salmone e' un pesce.
// E' volutamente corta e volutamente incompleta: copre le categorie che una persona esclude davvero.
// Ogni voce non coperta e' un controllo che non scatta, mai un falso allarme.
const CATEGORIE_ALIMENTARI = {
  pesce: ["salmone", "orata", "branzino", "spigola", "merluzzo", "baccalà", "baccala", "nasello", "sgombro", "sardine", "sarde", "alici", "acciughe", "tonno", "pesce spada", "platessa", "sogliola", "trota", "cernia", "dentice", "ricciola", "halibut", "aringa", "salmerino", "persico", "rombo"],
  crostacei: ["gamberi", "gamberetti", "scampi", "astice", "aragosta", "granchio", "mazzancolle"],
  molluschi: ["cozze", "vongole", "calamari", "seppie", "polpo", "moscardini", "capesante", "totani"],
  "carne rossa": ["manzo", "vitello", "vitellone", "bovino", "bistecca", "hamburger", "agnello", "montone", "cavallo"],
  maiale: ["maiale", "prosciutto", "speck", "pancetta", "guanciale", "salame", "salsiccia", "mortadella", "bresaola", "wurstel", "lardo", "coppa", "capocollo"],
  "carne bianca": ["pollo", "tacchino", "coniglio", "gallina", "petto di pollo"],
  latticini: ["latte", "formaggio", "formaggi", "yogurt", "ricotta", "mozzarella", "stracchino", "grana", "parmigiano", "pecorino", "burro", "panna", "mascarpone", "philadelphia", "caciotta", "scamorza", "provola", "feta"],
  glutine: ["pane", "pasta", "farro", "orzo", "cous cous", "couscous", "seitan", "biscotti", "cracker", "grissini", "piadina", "focaccia", "brioche", "cornetto"],
  legumi: ["ceci", "lenticchie", "fagioli", "piselli", "fave", "soia", "edamame", "cannellini", "borlotti", "lupini"],
  uova: ["uova", "uovo", "frittata", "omelette", "albume", "tuorlo"],
  "frutta secca": ["mandorle", "noci", "nocciole", "pistacchi", "anacardi", "arachidi", "pinoli", "noci pecan"],
  zucchero: ["zucchero", "miele", "marmellata", "confettura", "nutella", "cioccolato", "sciroppo", "dolcificante"],
};
// Gli alimenti che rendono una colazione DOLCE. Serve al vincolo "le colazioni le voglio salate",
// che il Ghost ha dichiarato e che e' stato disatteso: e' un controllo sulla riga della colazione,
// non su tutto il piano.
const MARCATORI_DOLCE = ["marmellata", "confettura", "miele", "nutella", "cioccolato", "biscotti", "brioche", "cornetto", "fette biscottate", "cereali", "muesli", "granola", "yogurt alla frutta", "zucchero", "crostata", "torta", "pancake", "porridge"];
// Un vincolo dichiarato e' un'ESCLUSIONE? E, se lo e', cosa esclude e cosa risparmia?
// "Escludi il pesce che non sia crostacei, molluschi o tonno in scatola" ha tutte e tre le parti:
// il verbo che esclude, la categoria esclusa, e le eccezioni dopo "che non sia".
const ESCLUDE_RE = /(?:^|[.;,]\s*)(?:esclud\w*|niente|non\s+(?:mangio|voglio|metter\w*|usare)|evit\w*|togli\w*|elimin\w*|senza|no)\s+(?:il\s+|lo\s+|la\s+|i\s+|gli\s+|le\s+|l')?([^.;!?\n]{2,80})/gi;
const ECCEZIONE_RE = /\b(?:che\s+non\s+sia|tranne|eccetto|a\s+parte|salvo|ad\s+eccezione\s+di|escluso\s+il|fuorché|fuorche)\b([^.;!?\n]{2,120})/i;
// 31/08/2026 — LE FORME POSTPOSTE. Misurato su dodici modi plausibili di scrivere la stessa cosa in
// un campo "Vincoli": cinque non producevano niente, e fra questi "zucchine escluse" e "non mi
// piacciono le zucchine" — costruzioni in cui il verbo viene DOPO l'alimento, mentre ESCLUDE_RE
// cerca solo il verbo PRIMA. Aggiunte qui invece che allargando ESCLUDE_RE: quel regex serve anche
// al controllo del piano, e allargarlo avrebbe cambiato anche cosa viene cercato dentro i piani.
// Resta fuori di proposito il caso "zucchine" scritto da solo: in un campo vincoli una parola nuda
// puo' voler dire tutto il contrario ("colazioni salate", "1600 kcal" sono vincoli, non esclusioni).
// Indovinare li' sarebbe peggio che non capire — e infatti la seconda meta' della correzione e'
// DIRE al Ghost quando non si e' capito, invece di lasciarlo credere che il vincolo sia attivo.
const ESCLUDE_POSTPOSTO_RE = /([^.;!?\n,]{2,60}?)\s+(?:esclus[oaie]|vietat[oaie]|bandit[oaie]|proibit[oaie])\b/gi;
const NON_MI_PIACE_RE = /non\s+mi\s+piac(?:e|ciono)\s+(?:il\s+|lo\s+|la\s+|i\s+|gli\s+|le\s+|l')?([^.;!?\n]{2,60})/gi;
function analizzaVincoloAlimentare(testo) {
  const t = String(testo || "");
  const esclusi = new Set(), risparmiati = new Set();
  const ecc = t.match(ECCEZIONE_RE);
  if (ecc) for (const parola of ecc[1].toLowerCase().split(/[,;]|\bo\b|\be\b/)) {
    const p = parola.trim().replace(/^(il|lo|la|i|gli|le|l')\s*/, "");
    if (p.length >= 3) risparmiati.add(p);
  }
  // La parte prima dell'eccezione: e' li' che sta la cosa esclusa.
  const primaDellEccezione = ecc ? t.slice(0, t.indexOf(ecc[0])) : t;
  const aggiungi = (grezzo) => {
    for (const parola of String(grezzo).toLowerCase().split(/[,;]|\bo\b|\be\b/)) {
      const p = parola.trim().replace(/^(il|lo|la|i|gli|le|l')\s*/, "").replace(/\s+$/, "");
      if (p.length >= 3) esclusi.add(p);
    }
  };
  for (const m of primaDellEccezione.matchAll(ESCLUDE_RE)) aggiungi(m[1]);
  // Le due forme postposte (vedi sopra): "zucchine escluse", "non mi piacciono le zucchine".
  for (const m of primaDellEccezione.matchAll(ESCLUDE_POSTPOSTO_RE)) aggiungi(m[1]);
  for (const m of primaDellEccezione.matchAll(NON_MI_PIACE_RE)) aggiungi(m[1]);
  return { esclusi: [...esclusi], risparmiati: [...risparmiati] };
}
// Da una cosa esclusa alla lista concreta di alimenti da cercare nel piano.
// "pesce" diventa l'elenco dei pesci; "salmone" resta se stesso. Le eccezioni vengono tolte.
// Un vincolo e' "alimentare" se dichiara esplicitamente questo ambito (flusso dalla card di chat,
// vedi tieniVincolo) — o, per compatibilita' con chi e' stato dichiarato PRIMA che l'ambito esistesse
// (26/08/2026, quick win #4 dell'audit "Motoko"), se e' un vincolo BIO senza ambito dichiarato:
// fallback che preserva esattamente il comportamento di sempre per lo storico, senza dover indovinare
// dal testo se un vecchio vincolo BIO senza tag fosse alimentare o no.
function eVincoloAlimentare(c) {
  return c?.ambito === "alimentare" || (c?.ambito == null && c?.pilastro === "bio");
}
function alimentiDaCercare(escluso, risparmiati = []) {
  const e = String(escluso || "").toLowerCase().trim();
  const salvo = new Set(risparmiati.map((r) => String(r).toLowerCase().trim()));
  let lista = [];
  for (const [categoria, membri] of Object.entries(CATEGORIE_ALIMENTARI)) {
    if (e === categoria || e.startsWith(categoria) || categoria.startsWith(e)) lista.push(...membri);
  }
  if (!lista.length) lista = [e]; // non e' una categoria nota: si cerca la parola cosi' com'e'
  // Un'eccezione toglie sia se stessa sia la categoria che nomina.
  const daTogliere = new Set();
  for (const r of salvo) {
    daTogliere.add(r);
    for (const [categoria, membri] of Object.entries(CATEGORIE_ALIMENTARI)) {
      if (r === categoria || r.startsWith(categoria) || categoria.startsWith(r)) membri.forEach((x) => daTogliere.add(x));
    }
    // "tonno in scatola" salva "tonno".
    for (const parola of r.split(/\s+/)) if (parola.length >= 4) daTogliere.add(parola);
  }
  return [...new Set(lista)].filter((x) => !daTogliere.has(x));
}
// Spezza un piano nei suoi giorni. Riconosce "Giorno 3", "**Giorno 3**", "GIORNO 3", "Lunedì".
// 30/08/2026 — LA RETE ERA COLLEGATA A UN FORMATO CHE NON SAPEVA LEGGERE.
// Da quando il piano lo monta il programma, i giorni stanno dentro una riga di tabella
// ("| Lun | ... |"), non a inizio riga per esteso. Misurato: su quel formato questo regex trovava
// ZERO giorni, quindi controllaPianoAlimentare usciva subito con null — nessun controllo, nessun
// avviso possibile, mai. Il difetto non era nel controllo ma nel fatto che non veniva mai eseguito.
// La seconda alternativa qui sotto copre la riga di tabella, e le abbreviazioni (Lun/Mar/...) sono
// ammesse SOLO li': a inizio riga, in mezzo alla prosa, "mar" o "dom" produrrebbero falsi tagli.
const GIORNO_RE = /^[\s*#_]*(?:\*\*)?\s*(giorno\s+\d+|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b[^\n]*$|^\s*\|\s*(?:\*\*)?\s*(lun|mar|mer|gio|ven|sab|dom|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\b[^\n]*$/gim;
function giorniDelPiano(testo) {
  const t = String(testo || "");
  const tagli = [...t.matchAll(GIORNO_RE)];
  if (!tagli.length) return [];
  return tagli.map((m, i) => {
    // In un piano a PROSA il nome del giorno e' un'intestazione e il contenuto sta nelle righe
    // sotto: il corpo comincia dopo il match. In una riga di TABELLA il contenuto sta dentro la
    // riga stessa, e il match se la mangia tutta ([^\n]*$) — quindi il corpo comincia dal match,
    // non dopo, altrimenti resta vuoto e non c'e' niente da controllare. E' il difetto per cui il
    // controllo, pur trovando i quattordici giorni, non vedeva un solo alimento (30/08/2026).
    const eRigaDiTabella = !!m[2];
    const inizio = eRigaDiTabella ? m.index : m.index + m[0].length;
    return {
      etichetta: (m[1] || m[2] || "").trim(),
      corpo: t.slice(inizio, i + 1 < tagli.length ? tagli[i + 1].index : t.length).trim(),
    };
  });
}
// La riga di un pasto dentro un giorno.
const PASTO_RE = /^[\s*\-•·]*(colazione|spuntino|pranzo|merenda|cena|snack)\s*:?\s*(.+)$/gim;
function pastiDelGiorno(corpo) {
  const out = {};
  for (const m of String(corpo || "").matchAll(PASTO_RE)) {
    const nome = m[1].toLowerCase();
    out[nome] = (out[nome] ? out[nome] + " " : "") + m[2].trim();
  }
  return out;
}
// Un'unita' di misura dentro una riga: e' cosi' che si vede se le dosi ci sono davvero.
const DOSE_RE = /\b\d+\s*(?:g|gr|grammi|ml|kg|l\b|cucchia\w+|fette?|cucchiaini?|porzion\w+|pezzi?|tazze?|bicchier\w+)\b|\b\d+\s*(?:uova|uovo)\b/i;
// "petto di pollo" e "pollo" sono la stessa cosa trovata due volte: elencarle entrambe fa sembrare
// due difetti quello che ne e' uno. Si tiene solo il nome piu' lungo che contiene gli altri.
function senzaDoppioni(nomi) {
  const unici = [...new Set(nomi)];
  return unici.filter((a) => !unici.some((b) => b !== a && b.includes(a)));
}
// ══════════════════════════════════════════════════════════════════════════════
// IL REPERTORIO LO INVENTA IL MODELLO, LA GRIGLIA LA MONTA IL PROGRAMMA (29/08/2026)
// ══════════════════════════════════════════════════════════════════════════════
// Tre notti di tentativi falliti, e la diagnosi vera e' arrivata solo fermandosi a ragionare invece
// di rincorrere il sintomo. Un piano di quattordici giorni per cinque pasti NON E' UN TESTO: e' un
// problema combinatorio con vincoli aritmetici. Chiedere al modello di risolverlo SCRIVENDO DI FILA
// significa chiedergli di tenere a mente settanta celle, una media calorica, le rotazioni e le
// esclusioni per ottomila token consecutivi. Misurato: a 3000 token divagava, a 8000 e' collassato
// del tutto (Heidegger, meccanica quantistica, generi punk — vedi il registro del 29/08 04:53).
// E il punto decisivo e' che ANCHE SE NON COLLASSASSE non potrebbe garantire niente: ne' la media di
// 1600, ne' l'assenza di ripetizioni. Sono proprieta' che si dimostrano, non che si sperano.
//
// E' esattamente la lezione che questo file ha gia' imparato per il calendario — "l'elenco degli
// impegni lo compone il programma, non il modello" — mai applicata qui.
//
// Divisione del lavoro, secca:
//   · il MODELLO inventa un repertorio di piatti con grammature e calorie (una chiamata corta, ben
//     dentro l'orizzonte di coerenza: e' cio' in cui e' bravo, e non deve ricordare niente);
//   · il PROGRAMMA monta i giorni, ruota i piatti, sceglie la cena che avvicina il totale al
//     bersaglio, fa le somme e dichiara le medie vere.
// Effetto collaterale non secondario: rimontare una variante diversa non costa NIENTE, perche' il
// repertorio e' gia' in mano e non serve richiamare il modello.
const RICHIESTA_PIANO_ALIMENTARE_RE =/(?<![\p{L}'’])(?:piano|programma|schema|menu|men[uù]|dieta)(?![\p{L}'’])[^.!?\n]{0,60}(?<![\p{L}'’])(?:alimentar\w*|nutrizional\w*|pasti|dietetic\w*|settimanal\w*|bisettimanal\w*)(?![\p{L}'’])|(?<![\p{L}'’])(?:piano|programma|schema)\s+(?:alimentare|dei\s+pasti)(?![\p{L}'’])/iu;
function richiestaDiPianoAlimentare(testo) {
  const t = String(testo || "");
  // Serve la CO-PRESENZA di due cose: che sia un piano, e che parli di cibo. "programma settimanale"
  // da solo puo' essere un allenamento — e questa macchina, oggi, sa montare solo pasti.
  if (!RICHIESTA_PIANO_ALIMENTARE_RE.test(t)) return false;
  return /(?<![\p{L}'’])(?:pasti|colazion\w*|pranz\w*|cen[ae]|spuntin\w*|merend\w*|kcal|calorie|aliment\w*|mangia\w*)(?![\p{L}'’])/iu.test(t);
}
// Cio' che si puo' ricavare dalla richiesta SENZA chiedere al modello: quanti giorni, che media
// calorica, quali giorni vogliono il pranzo da asporto. Sono numeri, e i numeri li legge il codice.
const GIORNI_SETTIMANA_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const NOMI_GIORNI_PER_INDICE = [/luned/i, /marted/i, /mercoled/i, /gioved/i, /venerd/i, /sabat/i, /domenic/i];
function estraiParametriPiano(testo) {
  const t = String(testo || "");
  let giorni = 7;
  if (/bisettimanal|due\s+settimane|2\s+settimane|quindicinal/i.test(t)) giorni = 14;
  const nGiorni = t.match(/(?<![\p{L}\d])(\d{1,2})\s*giorni(?![\p{L}])/iu);
  if (nGiorni) { const n = Number(nGiorni[1]); if (n >= 2 && n <= 31) giorni = n; }
  const nSettimane = t.match(/(?<![\p{L}\d])(\d)\s*settimane(?![\p{L}])/iu);
  if (nSettimane) { const n = Number(nSettimane[1]); if (n >= 1 && n <= 4) giorni = n * 7; }
  const kcal = t.match(/(?<![\p{L}\d])(\d{3,4})\s*(?:kcal|calorie)(?![\p{L}])/iu);
  // I giorni con il pranzo da asporto: si leggono dai nomi dei giorni nominati nella richiesta, ma
  // solo se l'asporto e' davvero nominato — altrimenti "lunedì" potrebbe essere li' per altro.
  const parlaDiAsporto = /(?<![\p{L}'’])(?:asporto|portatil\w*|in\s+macchina|a\s+studio|fuori\s+casa|schiscet\w*|pranzo\s+al\s+sacco)(?![\p{L}'’])/iu.test(t);
  const giorniPortatili = parlaDiAsporto
    ? NOMI_GIORNI_PER_INDICE.map((re, i) => (re.test(t) ? i : -1)).filter((i) => i >= 0)
    : [];
  return { giorni, kcalMedia: kcal ? Number(kcal[1]) : null, giorniPortatili };
}
// Il repertorio che torna dal modello, ripulito. Un piatto senza nome o senza calorie non e'
// utilizzabile: si scarta QUI, non si lascia arrivare alla griglia dove produrrebbe una cella vuota.
// 29/08/2026 — LA META-NARRAZIONE E' RIENTRATA DAL NOME DEL PIATTO. Osservato dal vivo:
//   "Pasta di ceci SKIP — pasta di ceci ESCLUSA, sostituita con: pasta di edamame 80g..."
//   "Hummus di ceci SKIP — hummus di ceci ESCLUSO, sostituito con: Philadelphia light 40g..."
// Il piatto sostitutivo e' ottimo; e' il NOME che racconta al Ghost cosa e' stato escluso, invece di
// chiamare il piatto per quello che e'. E c'e' un danno oltre alla bruttezza: il nome contiene
// l'alimento escluso, quindi il controllo del piano lo trova e segnala una violazione che non c'e'.
// Un piatto cosi' si scarta: il repertorio ne ha in abbondanza (ne chiediamo 40 e ne servono meno),
// e perderne uno costa molto meno che mostrarne uno che si contraddice da solo.
const NOME_CHE_NARRA_ESCLUSIONE_RE = /\bskip\b|\besclus\w*|\bsostituit\w*\s+con\b|\bnon\s+ammess\w*/i;
function validaRepertorio(raw) {
  if (!raw || typeof raw !== "object") return null;
  const categoria = (v) => (Array.isArray(v) ? v : []).map((p) => ({
    nome: String(p?.nome || "").trim(),
    ingredienti: String(p?.ingredienti || "").trim(),
    kcal: Number(p?.kcal),
    portatile: !!p?.portatile,
  })).filter((p) => p.nome && Number.isFinite(p.kcal) && p.kcal > 0
    && !NOME_CHE_NARRA_ESCLUSIONE_RE.test(p.nome));
  const r = {
    colazioni: categoria(raw.colazioni), spuntini: categoria(raw.spuntini),
    pranzi: categoria(raw.pranzi), merende: categoria(raw.merende), cene: categoria(raw.cene),
  };
  // Servono tutte e cinque le categorie: con una vuota la griglia avrebbe una colonna di buchi.
  for (const k of ["colazioni", "spuntini", "pranzi", "merende", "cene"]) if (!r[k].length) return null;
  return r;
}
// ── L'ESCLUSIONE LA FA RISPETTARE IL PROGRAMMA, NON LA BUONA VOLONTA' DEL MODELLO (30/08/2026) ──
// Il Ghost: "ci sono ancora le zucchine". Il prompt del repertorio riceve i vincoli e chiede di non
// proporre cio' che e' escluso — ma "chiedere" a un modello non e' una garanzia, ed e' esattamente
// la lezione che questo file ripete da settimane. Qui c'e' pero' un aggravante scoperta guardando:
// la rete di sicurezza a valle (controllaPianoAlimentare) NON LEGGEVA il piano montato dal
// programma. Misurato: sul formato a tabella che produce formatPianoAlimentare, giorniDelPiano
// riconosce ZERO giorni, quindi il controllo usciva subito restituendo null. Avevo collegato la
// rete a un formato che non sa leggere: nessun avviso poteva comparire, mai.
// Quindi due mosse, e questa e' la prima e la piu' importante: PREVENZIONE. Un piatto che contiene
// un alimento escluso non entra proprio nel repertorio, quindi non puo' finire nella griglia
// nemmeno se il modello ignora l'istruzione. Si riusa la tassonomia che gia' esiste
// (analizzaVincoloAlimentare + alimentiDaCercare), quella che sa che il salmone e' un pesce.
function alimentiEsclusiDaiVincoli(vincoli) {
  const fuori = new Set();
  for (const v of vincoli || []) {
    const { esclusi, risparmiati } = analizzaVincoloAlimentare(v);
    for (const e of esclusi) for (const a of alimentiDaCercare(e, risparmiati)) fuori.add(String(a).toLowerCase());
  }
  return [...fuori].filter((a) => a.length >= 3);
}
// Restituisce { repertorio, scartati } — quanti piatti sono stati tolti e quali alimenti li hanno
// fatti togliere, cosi' finisce nel registro invece di essere una sparizione silenziosa.
function filtraRepertorioPerVincoli(repertorio, vincoli) {
  const r = validaRepertorio(repertorio);
  if (!r) return { repertorio: null, scartati: [] };
  const esclusi = alimentiEsclusiDaiVincoli(vincoli);
  if (!esclusi.length) return { repertorio: r, scartati: [] };
  const scartati = [];
  const pulisci = (lista) => lista.filter((p) => {
    const testo = senzaAccenti(`${p.nome} ${p.ingredienti}`);
    const colpevole = esclusi.find((a) => new RegExp(`(?<![\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu").test(testo));
    if (colpevole) { scartati.push({ piatto: p.nome, per: colpevole }); return false; }
    return true;
  });
  const fuori = {
    colazioni: pulisci(r.colazioni), spuntini: pulisci(r.spuntini), pranzi: pulisci(r.pranzi),
    merende: pulisci(r.merende), cene: pulisci(r.cene),
  };
  // Se un'intera categoria resta vuota il repertorio non e' montabile: si dichiara, non si ripiega
  // reintroducendo cio' che era escluso — meglio nessun piano che un piano che viola un vincolo.
  for (const k of ["colazioni", "spuntini", "pranzi", "merende", "cene"]) if (!fuori[k].length) return { repertorio: null, scartati };
  return { repertorio: fuori, scartati };
}
// LA GARANZIA, dichiarata per intero perche' e' il punto di tutto questo: un piatto non ricompare
// prima di L giorni, dove L e' quanti piatti ha la sua categoria. Non e' una speranza riposta nel
// modello: e' una proprieta' della rotazione (indice = giorno modulo L), dimostrabile guardandola.
// Chiedendo al modello NUMERI DIVERSI per categoria (7 colazioni, 8 spuntini, 9 pranzi...) anche le
// COMBINAZIONI di giornata non si ripetono per il minimo comune multiplo dei conteggi, non per L.
const VARIAZIONE_CALORICA = [0, 120, -80, 60, -140, 100, -60]; // la "non linearita'" chiesta dal Ghost, resa esatta
// Quanti giorni deve passare un piatto prima di poter tornare. Era 3, ed era troppo poco: il Ghost
// si e' ritrovato la stessa cena mercoledi' e domenica — dentro la regola, ma nella stessa settimana,
// e con dieci cene in repertorio non c'era nessun motivo. Sei giorni significa "mai due volte nella
// stessa settimana", che e' la cosa che si nota davvero mangiando.
// 02/09/2026 — LA MECCANICA DELLA GRIGLIA È USCITA DA QUI, ED È RIMASTO L'ADATTATORE.
// La distanza minima fra ripetizioni, il registro condiviso degli ultimi usi, la scelta del meno
// recente e la colonna-leva sul bersaglio vivono ora in lib/griglia.js, dove non sanno di cibo.
// Qui resta ciò che è davvero alimentare: quali sono le cinque colonne, quale lista serve un giorno
// da asporto, che la cena è la leva, che il valore è una caloria e il bersaglio la media chiesta.
// Il difetto del 29/08 (lo stesso pranzo due giorni di fila, perché portatili e non-portatili
// avevano contatori indipendenti) è chiuso dentro la primitiva, non qui: chi la userà per un piano
// di allenamento o un calendario editoriale non deve ritrovarlo da capo.
// Nessuna riga di comportamento è cambiata: le prove di piano-montato.test.mjs, scritte prima di
// questa estrazione, restano la dimostrazione — non il commento qui sopra.
function montaPianoAlimentare(repertorio, opzioni = {}) {
  const r = validaRepertorio(repertorio);
  if (!r) return null;
  const giorni = Math.max(1, Math.min(60, Number(opzioni.giorni) || 14));
  const kcalMedia = Number(opzioni.kcalMedia) || null;
  const portatiliDi = new Set(Array.isArray(opzioni.giorniPortatili) ? opzioni.giorniPortatili : []);
  const pranziPortatili = r.pranzi.filter((p) => p.portatile);
  const pranziNonPortatili = r.pranzi.filter((p) => !p.portatile);
  const griglia = montaGriglia({
    righe: giorni, ciclo: 7,
    chiave: (p) => p.nome,
    valore: (p) => p.kcal,
    // La variazione calorica fra i giorni è voluta, non un errore di arrotondamento.
    bersaglioDiRiga: (d) => (kcalMedia ? kcalMedia + VARIAZIONE_CALORICA[d % VARIAZIONE_CALORICA.length] : null),
    colonne: [
      { id: "colazione", lista: r.colazioni },
      { id: "spuntino", lista: r.spuntini },
      // Su un giorno da asporto si pesca dai portatili, se ce ne sono: altrimenti si usa il pranzo
      // normale e lo si dichiara dopo (giorniPortatiliSenzaPiatti), invece di fingere che lo sia.
      // Liste DISGIUNTE, un registro solo: è la primitiva a garantire che la distanza valga
      // attraverso le due, ed è lì che sta il commento sul difetto che l'ha imposto.
      { id: "pranzo", modo: "meno-recente",
        listaPerRiga: (d, gs) => (portatiliDi.has(gs) && pranziPortatili.length
          ? pranziPortatili
          : (pranziNonPortatili.length ? pranziNonPortatili : r.pranzi)) },
      { id: "merenda", lista: r.merende },
      // LA CENA È LA LEVA. Gli altri quattro pasti ruotano; la cena viene scelta per ultima, fra
      // quelle non usate di recente, prendendo quella che avvicina di più il totale al bersaglio.
      { id: "cena", lista: r.cene, modo: "meno-recente", leva: true },
    ],
  });
  if (!griglia) return null;
  const righe = griglia.righe.map((x) => ({
    indice: x.indice, settimana: x.blocco, giorno: GIORNI_SETTIMANA_BREVI[x.posizione],
    colazione: x.celle.colazione, spuntino: x.celle.spuntino, pranzo: x.celle.pranzo,
    merenda: x.celle.merenda, cena: x.celle.cena,
    portatile: portatiliDi.has(x.posizione) && pranziPortatili.length > 0,
    totale: x.totale,
  }));
  return {
    righe,
    mediaReale: griglia.media, minimo: griglia.minimo, massimo: griglia.massimo,
    kcalMedia, giorniPortatiliSenzaPiatti: portatiliDi.size > 0 && pranziPortatili.length === 0,
  };
}
// Da griglia montata a tabella markdown. Il markdown non e' decorazione: generateDocxBlob lo
// trasforma in una tabella VERA nel documento, quindi questa e' anche la strada verso il .docx.
function formatPianoAlimentare(piano) {
  if (!piano) return "";
  const cella = (p) => `${p.nome}${p.ingredienti ? ` — ${p.ingredienti}` : ""} (${p.kcal})`;
  const fuori = [];
  let settimanaCorrente = 0;
  for (const r of piano.righe) {
    if (r.settimana !== settimanaCorrente) {
      settimanaCorrente = r.settimana;
      if (fuori.length) fuori.push("");
      fuori.push(`## Settimana ${settimanaCorrente}`, "");
      fuori.push("| Giorno | Colazione | Spuntino | Pranzo | Merenda | Cena | Totale |");
      fuori.push("|---|---|---|---|---|---|---|");
    }
    fuori.push(`| ${r.giorno} | ${cella(r.colazione)} | ${cella(r.spuntino)} | ${r.portatile ? "Asporto: " : ""}${cella(r.pranzo)} | ${cella(r.merenda)} | ${cella(r.cena)} | ${r.totale} kcal |`);
  }
  fuori.push("");
  // Le medie sono CALCOLATE, non dichiarate dal modello: e' la differenza fra un numero vero e un
  // numero che suona bene. Se il bersaglio era dichiarato, si dice anche di quanto ci si discosta.
  const scarto = piano.kcalMedia ? ` (chiesta ${piano.kcalMedia}, scarto ${piano.mediaReale - piano.kcalMedia >= 0 ? "+" : ""}${piano.mediaReale - piano.kcalMedia})` : "";
  fuori.push(`Media reale: **${piano.mediaReale} kcal** al giorno${scarto}. Giorno più leggero ${piano.minimo}, più pesante ${piano.massimo} — la variazione è voluta, non un errore di arrotondamento.`);
  if (piano.giorniPortatiliSenzaPiatti) fuori.push("Nota: avevi chiesto un pranzo da asporto in certi giorni, ma nel repertorio non c'era nessun pranzo marcato come portatile — ho usato i pranzi normali. Chiedimelo di nuovo e te li rifaccio portatili.");
  return fuori.join("\n");
}
// ── IL CONTROLLO. Tutto quello che qui viene segnalato e' un FATTO verificabile riga per riga:
// nessun giudizio sul gusto, nessuna opinione su cosa sia un buon piano.
function controllaPianoAlimentare(testo, vincoliBio = [], richiestaDelGhost = "") {
  const t = String(testo || "");
  const giorni = giorniDelPiano(t);
  if (giorni.length < 2) return null; // non e' un piano: non c'e' niente da controllare
  const scarti = [];

  // 1. LE ESCLUSIONI DICHIARATE. E' il caso del salmone.
  for (const vincolo of vincoliBio) {
    const { esclusi, risparmiati } = analizzaVincoloAlimentare(vincolo);
    for (const escluso of esclusi) {
      const daCercare = alimentiDaCercare(escluso, risparmiati);
      const trovati = [];
      for (const g of giorni) {
        for (const alimento of daCercare) {
          const re = new RegExp(`(?<![\\p{L}])${alimento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu");
          if (re.test(g.corpo)) trovati.push({ giorno: g.etichetta, alimento });
        }
      }
      if (trovati.length) scarti.push({
        tipo: "esclusione",
        vincolo,
        cosa: `hai escluso ${escluso}, e nel piano compare ${senzaDoppioni(trovati.map((x) => x.alimento)).join(", ")}`,
        dove: [...new Set(trovati.map((x) => x.giorno))],
      });
    }
  }

  // 2. I GIORNI DICHIARATI CONTRO QUELLI DAVVERO DIVERSI. E' il "bisettimanale" che ripete.
  const dichiarati = t.match(/\b(\d{1,2})\s*giorni\b/i);
  const nDichiarati = dichiarati ? Number(dichiarati[1]) : (/bisettimanal\w*/i.test(t) ? 14 : 0);
  if (nDichiarati && giorni.length < nDichiarati) {
    scarti.push({ tipo: "giorni-mancanti", cosa: `il piano dice ${nDichiarati} giorni ma ne ho contati ${giorni.length}`, dove: [] });
  }
  const impronte = new Map();
  for (const g of giorni) {
    const impronta = g.corpo.toLowerCase().replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (!impronta) continue;
    if (impronte.has(impronta)) scarti.push({ tipo: "giorno-ripetuto", cosa: `${g.etichetta} è identico a ${impronte.get(impronta)}`, dove: [g.etichetta] });
    else impronte.set(impronta, g.etichetta);
  }

  // 3. LO STESSO ALIMENTO A PRANZO E A CENA. E' il pollo due volte.
  for (const g of giorni) {
    const p = pastiDelGiorno(g.corpo);
    if (!p.pranzo || !p.cena) continue;
    const tuttiGliAlimenti = Object.values(CATEGORIE_ALIMENTARI).flat();
    const ripetuti = tuttiGliAlimenti.filter((a) => {
      const re = new RegExp(`(?<![\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu");
      return re.test(p.pranzo) && re.test(p.cena);
    });
    // Il pane e i condimenti si ripetono per forza: si guardano solo le fonti proteiche.
    const proteine = ripetuti.filter((a) => [...CATEGORIE_ALIMENTARI.pesce, ...CATEGORIE_ALIMENTARI["carne bianca"], ...CATEGORIE_ALIMENTARI["carne rossa"], ...CATEGORIE_ALIMENTARI.maiale, ...CATEGORIE_ALIMENTARI.uova, ...CATEGORIE_ALIMENTARI.legumi].includes(a));
    if (proteine.length) scarti.push({ tipo: "ripetuto-nel-giorno", cosa: `${g.etichetta}: ${senzaDoppioni(proteine).join(", ")} sia a pranzo che a cena`, dove: [g.etichetta] });
  }

  // 4. LE DOSI, se il Ghost le ha chieste o se il piano dichiara di averle.
  const doseRichiesta = /\b(?:dos\w+|grammatur\w+|quantit\w+|grammi|porzion\w+)\b/i.test(String(richiestaDelGhost) + " " + t);
  if (doseRichiesta) {
    const senzaDose = giorni.filter((g) => !DOSE_RE.test(g.corpo)).map((g) => g.etichetta);
    if (senzaDose.length) scarti.push({ tipo: "dosi-mancanti", cosa: `hai chiesto le dosi e ${senzaDose.length === giorni.length ? "non ce ne sono da nessuna parte" : `mancano in ${senzaDose.length} giorni su ${giorni.length}`}`, dove: senzaDose });
  }

  // 5. LE COLAZIONI SALATE, se dichiarate.
  const vuoleSalato = vincoliBio.some((v) => /colazion\w*[^.]{0,40}salat\w*|salat\w*[^.]{0,40}colazion\w*/i.test(String(v)));
  if (vuoleSalato) {
    const dolci = [];
    for (const g of giorni) {
      const p = pastiDelGiorno(g.corpo);
      if (!p.colazione) continue;
      const marcatori = MARCATORI_DOLCE.filter((d) => new RegExp(`(?<![\\p{L}])${d}`, "iu").test(p.colazione));
      if (marcatori.length) dolci.push({ giorno: g.etichetta, marcatori });
    }
    if (dolci.length) scarti.push({
      tipo: "colazione-dolce",
      cosa: `hai chiesto colazioni salate, e in ${dolci.length} ${dolci.length === 1 ? "giorno" : "giorni"} sono dolci (${[...new Set(dolci.flatMap((d) => d.marcatori))].join(", ")})`,
      dove: dolci.map((d) => d.giorno),
    });
  }

  return scarti.length ? { giorni: giorni.length, scarti } : null;
}

export {
  CATEGORIE_ALIMENTARI,
  DOSE_RE,
  ECCEZIONE_RE,
  ESCLUDE_POSTPOSTO_RE,
  ESCLUDE_RE,
  GIORNI_SETTIMANA_BREVI,
  GIORNO_RE,
  MARCATORI_DOLCE,
  NOME_CHE_NARRA_ESCLUSIONE_RE,
  NOMI_GIORNI_PER_INDICE,
  NON_MI_PIACE_RE,
  PASTO_RE,
  RICHIESTA_PIANO_ALIMENTARE_RE,
  VARIAZIONE_CALORICA,
  VINCOLO_AUTONOMO_RE,
  VINCOLO_CON_VERBO_RE,
  alimentiDaCercare,
  alimentiEsclusiDaiVincoli,
  analizzaVincoloAlimentare,
  controllaPianoAlimentare,
  eVincoloAlimentare,
  estraiParametriPiano,
  filtraRepertorioPerVincoli,
  formatPianoAlimentare,
  giorniDelPiano,
  montaPianoAlimentare,
  pastiDelGiorno,
  proponiVincoliAlimentari,
  richiestaDiPianoAlimentare,
  senzaDoppioni,
  validaRepertorio,
};
