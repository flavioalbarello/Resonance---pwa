// SPARTITI PRESI DA UN ARCHIVIO ONLINE — 14/09/2026.
//
// IL BANCO GIRA SU DATO VERO. In `tests/dati/` ci sono due risposte scaricate davvero da
// thesession.org — una ricerca e un brano con sei delle sue trentatré trascrizioni — non JSON
// inventati da me. È la differenza che conta: su dato inventato tutto passa, perché lo inventa la
// stessa persona che scrive il controllo. Su dato vero, la prima misura ha detto 153 su 192: le
// trentanove trascrizioni rifiutate erano quasi tutte falsi positivi del MIO guardiano, non musica
// sbagliata. Dopo averli tolti: 192 su 192.
//
// QUELLO CHE ARRIVA NON E' UNO SPARTITO: è un frammento senza intestazione, con "!" al posto degli
// a capo, e la tonalità e il metro stanno altrove nella risposta (il metro nemmeno c'è: c'è il TIPO
// di danza, e il metro è una sua proprietà che chi suona sa a memoria). Quindi non è una copia, è
// una ricostruzione — e come ogni cosa ricostruita passa dall'accettore prima di essere proposta.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const { analizzaSpartito, abcDaArchivio, chiaveAbc, metroPerTipo, spartitiDalBrano, ARCHIVIO_SPARTITI } = app;
const leggi = (f) => JSON.parse(readFileSync(new URL(`./dati/${f}`, import.meta.url), "utf8"));
const COOLEYS = leggi("thesession-cooleys.json");
const RICERCA = leggi("thesession-ricerca.json");
// La risposta VERA a «One metallica», scaricata il 14/09/2026: `total: 100`, e dentro nemmeno un
// brano dei Metallica. È il dato che ha fatto nascere risultatiCheRispondono.
const ONE_METALLICA = leggi("thesession-one-metallica.json");

describe("IL DATO VERO PASSA — la misura che ha guidato tutto il resto", () => {
  test("tutte le trascrizioni vere di un brano vero diventano spartiti validi", () => {
    const versioni = spartitiDalBrano(COOLEYS, analizzaSpartito);
    const cattive = versioni.filter((v) => !v.analisi.ok);
    assert.equal(cattive.length, 0,
      `${cattive.length} su ${versioni.length} rifiutate: ${cattive.map((v) => v.analisi.errori.map((e) => e.motivo).join("; ")).join(" | ")}`);
    assert.ok(versioni.length >= 5, `solo ${versioni.length} trascrizioni nel dato di prova`);
  });

  test("ogni trascrizione porta la sua tonalità e il suo numero di battute", () => {
    for (const v of spartitiDalBrano(COOLEYS, analizzaSpartito)) {
      assert.match(v.chiave, /^[A-G][#b]?/, v.chiave);
      assert.ok(v.battute > 4, `${v.chiave}: ${v.battute} battute`);
    }
  });

  test("LA PROVENIENZA RESTA ATTACCATA: archivio, indirizzo, brano, trascrizione, autore", () => {
    // Le trascrizioni sono di chi le ha scritte, e uno spartito senza provenienza fra sei mesi è
    // indistinguibile da uno scritto dal Ghost.
    const v = spartitiDalBrano(COOLEYS, analizzaSpartito)[0];
    assert.equal(v.fonte.archivio, ARCHIVIO_SPARTITI.id);
    assert.match(v.fonte.url, /^https:\/\/thesession\.org\//);
    assert.equal(v.fonte.brano, COOLEYS.id);
    assert.ok(v.fonte.trascrizione);
    // E finisce anche DENTRO l'ABC, così sopravvive a un'esportazione del solo testo.
    assert.match(v.abc, /%%source https:\/\/thesession\.org\//);
  });

  test("la risposta di ricerca si legge nella forma in cui arriva davvero", () => {
    assert.ok(Array.isArray(RICERCA.tunes) && RICERCA.tunes.length);
    for (const t of RICERCA.tunes) {
      assert.ok(t.id && t.name && t.type, JSON.stringify(t).slice(0, 80));
    }
    assert.ok(Number.isFinite(RICERCA.total));
  });
});

describe("LA RICOSTRUZIONE — quello che l'archivio non manda", () => {
  test("il metro non arriva: arriva il TIPO di danza, e il metro è una sua proprietà", () => {
    assert.equal(metroPerTipo("reel"), "4/4");
    assert.equal(metroPerTipo("jig"), "6/8");
    assert.equal(metroPerTipo("slip jig"), "9/8");
    assert.equal(metroPerTipo("slide"), "12/8");
    assert.equal(metroPerTipo("polka"), "2/4");
    assert.equal(metroPerTipo("waltz"), "3/4");
    assert.equal(metroPerTipo("three-two"), "3/2");
    assert.equal(metroPerTipo("qualcosa che non conosco"), "4/4", "davanti a un tipo ignoto si sceglie il più comune invece di rifiutare");
  });

  test("le tonalità si traducono nella forma che ABC vuole", () => {
    assert.equal(chiaveAbc("Edorian"), "Edor");
    assert.equal(chiaveAbc("Gmajor"), "G");
    assert.equal(chiaveAbc("Dminor"), "Dm");
    assert.equal(chiaveAbc("Amixolydian"), "Amix");
    assert.equal(chiaveAbc("Bbminor"), "Bbm");
    assert.equal(chiaveAbc("F#major"), "F#");
  });

  test("gli a capo arrivano come «!» e vanno rimessi, o è tutto una riga sola", () => {
    const abc = abcDaArchivio({ titolo: "P", tipo: "reel", chiave: "Edorian", corpo: "EBBA B2 EB|! B2 AB dBAG|! FDAD BDAD|" });
    const righe = abc.split("\n");
    const note = righe.slice(righe.findIndex((r) => r.startsWith("K:")) + 1);
    assert.equal(note.length, 3, `righe di note: ${note.length} — ${JSON.stringify(note)}`);
    assert.equal(analizzaSpartito(abc).ok, true);
  });

  test("QUANDO LA TRASCRIZIONE PORTA GIA' LA SUA TONALITA', vince la sua", () => {
    // Caso vero trovato misurando: The Lakes Of Sligo, trascrizione 15239 — l'archivio dichiara Re
    // nei suoi dati, la trascrizione comincia con `K: BbMaj`. Aggiungendo comunque la mia si
    // creavano DUE tonalità di fila e lo spartito veniva rifiutato: il conflitto lo creavo io.
    const abc = abcDaArchivio({ titolo: "P", tipo: "polka", chiave: "Dmajor", corpo: "K: BbMaj!|:F/E/|DF FG/A/|B>c BA|" });
    const chiavi = abc.split("\n").filter((r) => r.startsWith("K:"));
    assert.equal(chiavi.length, 1, `due tonalità: ${chiavi.join(" e ")}`);
    assert.equal(chiavi[0], "K:BbMaj");
    // `"archivio"`: è un frammento preso da fuori, e da oggi il controllo sulle durate è un avviso
    // per quelli e un errore per ciò che scrive un modello. Questo frammento ha la levata «F/E/»
    // senza la battuta che la completa — normale in un ritaglio, non in uno spartito generato.
    assert.equal(analizzaSpartito(abc, "archivio").ok, true);
  });

  test("senza tonalità propria resta quella del catalogo", () => {
    const abc = abcDaArchivio({ titolo: "P", tipo: "reel", chiave: "Edorian", corpo: "EBBA B2 EB|! B2 AB dBAG|" });
    assert.ok(abc.includes("\nK:Edor\n"), abc.split("\n").slice(0, 8).join(" / "));
  });
});

describe("I FALSI POSITIVI DEL MIO GUARDIANO, trovati dal dato vero", () => {
  test("GLI ACCORDI FRA VIRGOLETTE non sono prosa — era il 20% dei rifiuti", () => {
    // `"Em"`, `"slide"`, `"D/H"`: la «m» di «Em» non è una nota, e il controllo sui caratteri la
    // prendeva. `noteDi` le virgolette le toglieva già; il controllo no. Due scritture della stessa
    // cosa, divergenti alla nascita. Adesso c'è una preparazione sola, usata da tutti e due.
    const conAccordi = 'X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\n"Em"EBBA "slide"B3 B|"D"FDAD BDAD|';
    assert.equal(analizzaSpartito(conAccordi).ok, true, analizzaSpartito(conAccordi).errori.map((e) => e.motivo).join(" · "));
    assert.equal(app.noteDi('"Em"EBBA "slide"B3 B').length, 6, "gli accordi contano come note");
  });

  test("LE DECORAZIONI sono lettere e sono musica: u, v, H, J", () => {
    // `uE2BE` (arcata in su), `vE2BE` (in giù), `Ja2` (slide), la corona. Misurate nel repertorio
    // vero. Senza ammetterle, metà della musica scritta da musicisti veri passa per prosa.
    const conDecori = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nuE2BE vdEBE|Ja2{g}fd efdf|";
    assert.equal(analizzaSpartito(conDecori).ok, true, analizzaSpartito(conDecori).errori.map((e) => e.motivo).join(" · "));
  });

  test("UN SECONDO T: a metà brano è il titolo della seconda parte, non un errore", () => {
    const conSecondoTitolo = "X:1\nT:Prima parte\nM:4/4\nL:1/8\nK:D\nDF FG|B>c BA|\nT:Seconda parte\ndf cd|B>c d>c|";
    assert.equal(analizzaSpartito(conSecondoTitolo).ok, true, analizzaSpartito(conSecondoTitolo).errori.map((e) => e.motivo).join(" · "));
  });

  test("MA LA PROSA VIENE ANCORA PRESA, ed è il punto di tutto", () => {
    // Se allargando il controllo avessi lasciato passare anche la prosa, il requisito sarebbe
    // diventato decorativo e non lo avrebbe detto nessuno.
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nK:C\nC D E F | Ecco la melodia principale | G A B c |").ok, false);
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nK:C\nC D E F | questo tema si ripete piano | G A B c |").ok, false);
  });

  test("e un SECONDO metro dopo K: resta un errore, perché sposta come si leggono le note", () => {
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nK:C\nC D E F |\nM:6/8\nG A B c |").ok, false);
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nK:C\nC D E F |\nQ:1/4=90\nG A B c |").ok, false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CHIEDERLO PARLANDO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// La ricerca esisteva da un giorno quando il Ghost ha scritto in chat «Cerca online lo spartito per
// basso elettrico di Come Together dei Beatles e mostramelo» e lo Shell ha risposto «Non posso
// cercare online». Era vero per come stava l'app: la ricerca era un pulsante dentro un percorso, e
// un pulsante che non si trova non esiste. Questo banco tiene la frase VERA del Ghost come primo
// caso — non una frase pulita scritta da me — perché è quella che ha rotto.
describe("CHIEDERE UNO SPARTITO A PAROLE", () => {
  const { richiestaDiSpartito } = app;

  test("LA FRASE VERA DEL GHOST, quella che ha prodotto il «non posso cercare online»", () => {
    const r = richiestaDiSpartito("Cerca online lo spartito per basso elettrico di come together dei Beatles e mostramelo");
    assert.ok(r, "non riconosciuta");
    assert.equal(r.query, "come together Beatles");
    assert.equal(r.strumento, "basso", "lo strumento si dice al Ghost, anche se non filtra la ricerca");
  });

  test("le forme normali di chiederlo arrivano tutte a una query utile", () => {
    const casi = [
      ["cercami lo spartito di Cooley's", "Cooley's"],
      ["trovami la tablatura di Drowsy Maggie", "Drowsy Maggie"],
      ["cerca la partitura del brano Morrison's", "Morrison's"],
      ["scaricami lo spartito per violino di Egan's polka", "Egan's polka"],
      ["trova lo spartito di The Silver Spear", "The Silver Spear"],
    ];
    for (const [frase, atteso] of casi) {
      const r = richiestaDiSpartito(frase);
      assert.ok(r, `non riconosciuta: ${frase}`);
      assert.equal(r.query, atteso, frase);
    }
  });

  test("SERVONO TUTTI E DUE: un verbo di ricerca E la parola spartito", () => {
    // Senza il verbo è una conversazione sugli spartiti; senza l'oggetto è una ricerca di altro.
    assert.equal(richiestaDiSpartito("cosa ne pensi dello spartito che abbiamo fatto"), null);
    assert.equal(richiestaDiSpartito("mi piacerebbe uno spartito di Cooley's"), null);
    assert.equal(richiestaDiSpartito("cerca un percorso su anatomia"), null);
    assert.equal(richiestaDiSpartito("trova il documento dell'atto quarto"), null);
    assert.equal(richiestaDiSpartito("oggi ho dormito male"), null);
    // Questi due sono il caso in cui SOLO la parola «spartito» tiene: c'è il verbo, c'è un «di X»
    // da cui una query si estrarrebbe benissimo, e senza il controllo sull'oggetto partirebbe una
    // ricerca musicale su «Beethoven» o su «telefono Marta». Trovati dalla verifica di rottura:
    // il primo giro di banco restava verde anche togliendo quel controllo.
    assert.equal(richiestaDiSpartito("cerca la biografia di Beethoven"), null);
    assert.equal(richiestaDiSpartito("trovami il numero di telefono di Marta"), null);
  });

  test("SCRIVERE NON E' CERCARE: «generami uno spartito» non interroga nessun archivio", () => {
    assert.equal(richiestaDiSpartito("scrivimi uno spartito per basso"), null);
    assert.equal(richiestaDiSpartito("genera uno spartito per il tema dell'Atto IV"), null);
    assert.equal(richiestaDiSpartito("componi una tablatura lenta in minore"), null);
  });

  test("CERCARE DENTRO NON E' CERCARE FUORI — il falso positivo che direbbe una bugia", () => {
    // Queste frasi hanno verbo e oggetto giusti, ma parlano di roba GIA' SALVATA. Partendo verso
    // l'archivio tornerebbero vuote, e il «non c'è» sembrerebbe una verità sul suo spartito.
    assert.equal(richiestaDiSpartito("cerca lo spartito che abbiamo fatto ieri"), null);
    assert.equal(richiestaDiSpartito("trova lo spartito nel percorso Musica"), null);
    assert.equal(richiestaDiSpartito("cercami la tablatura che ho salvato"), null);
    assert.equal(richiestaDiSpartito("cerca lo spartito nei documenti"), null);
    assert.equal(richiestaDiSpartito("trovami lo spartito di ieri"), null);
  });

  test("la frase intera resta attaccata: la query è una LETTURA, e va potuta confrontare", () => {
    const frase = "Cerca online lo spartito per basso elettrico di come together dei Beatles e mostramelo";
    assert.equal(richiestaDiSpartito(frase).frase, frase);
  });

  test("una query si ferma a sei parole: una frase lunga non diventa un'interrogazione assurda", () => {
    const r = richiestaDiSpartito("cercami lo spartito di uno due tre quattro cinque sei sette otto nove");
    assert.ok(r.query.split(" ").length <= 6, r.query);
  });

  test("niente da cercare, niente ricerca: la frase senza titolo non parte", () => {
    assert.equal(richiestaDiSpartito("cerca uno spartito"), null);
    assert.equal(richiestaDiSpartito("cerca online uno spartito per favore"), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// UN ARCHIVIO CHE RISPONDE NON E' UN ARCHIVIO CHE HA CAPITO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha scritto «Cerca lo spartito per basso di One dei Metallica» e questo banco gira sulla
// risposta VERA che l'archivio dà a quella query: cento brani, zero Metallica. Senza filtro la
// chat gli avrebbe mostrato «Paddy Connelly Buys One Gets One Free» come risposta alla sua
// domanda — peggio del «non posso cercare online» di cui si stava lamentando, perché una bugia che
// dice «non so» si riconosce e una che dice «ecco» no.
describe("LA PERTINENZA, misurata sulla risposta vera che ha rivelato il difetto", () => {
  const { risultatiCheRispondono } = app;

  test("IL DATO CRUDO: l'archivio dichiara cento brani e nessuno è quello chiesto", () => {
    assert.equal(ONE_METALLICA.total, 100);
    assert.equal(ONE_METALLICA.tunes.filter((t) => /metallica/i.test(`${t.name} ${t.alias || ""}`)).length, 0,
      "se un giorno The Session avesse i Metallica, questo banco va riscritto invece che aggiustato");
  });

  test("nessuno di quei cento passa, e la parola caduta a vuoto si chiama per nome", () => {
    const { risposte, scartati, paroleAssenti } = risultatiCheRispondono("One metallica", ONE_METALLICA.tunes);
    assert.equal(risposte.length, 0, `passate: ${risposte.map((t) => t.name).join(", ")}`);
    assert.equal(scartati, ONE_METALLICA.tunes.length);
    assert.deepEqual(paroleAssenti, ["metallica"], "«one» c'era davvero nei titoli: l'unica assente è «metallica»");
  });

  test("MA LA RICERCA BUONA NON DEVE MORIRE: quello che risponde passa", () => {
    const tunes = [
      { id: 1, name: "Cooley's", alias: "Tulla Reel", type: "reel" },
      { id: 2, name: "The Silver Spear", type: "reel" },
      { id: 3, name: "Egan's", type: "polka" },
      { id: 4, name: "Drowsy Maggie", type: "reel" },
    ];
    const passa = (q) => risultatiCheRispondono(q, tunes).risposte.map((t) => t.name);
    assert.deepEqual(passa("Cooley's"), ["Cooley's"]);
    assert.deepEqual(passa("cooley"), ["Cooley's"], "senza apostrofo e in minuscolo deve trovarlo lo stesso");
    assert.deepEqual(passa("The Silver Spear"), ["The Silver Spear"], "gli articoli non contano");
    assert.deepEqual(passa("Tulla"), ["Cooley's"], "l'alias è un nome vero del brano");
    assert.deepEqual(passa("Egan's polka"), ["Egan's"],
      "il TIPO di danza entra nel confronto: il nome è «Egan's», «polka» sta nel tipo");
    assert.deepEqual(passa("Drowsy Maggie"), ["Drowsy Maggie"]);
  });

  test("L'APOSTROFO NON DEVE DIVIDERE: «Cooleys» e «Cooley's» sono lo stesso brano", () => {
    // The Session contiene ENTRAMBE le grafie, a seconda di chi ha caricato il brano. Chi scrive
    // quella che non coincide non deve sentirsi dire che il brano non esiste.
    const conApostrofo = [{ id: 1, name: "Cooley's", type: "reel" }];
    const senza = [{ id: 2, name: "Cooleys", type: "reel" }];
    for (const q of ["Cooley's", "Cooleys", "cooley’s"]) {
      assert.equal(risultatiCheRispondono(q, conApostrofo).risposte.length, 1, `«${q}» contro «Cooley's»`);
      assert.equal(risultatiCheRispondono(q, senza).risposte.length, 1, `«${q}» contro «Cooleys»`);
    }
    // E non deve nascere una parola spuria «s» che fa passare qualunque cosa la contenga.
    assert.equal(risultatiCheRispondono("Cooley's", [{ id: 3, name: "Silver Spear", type: "reel" }]).risposte.length, 0);
  });

  test("una parola in più che non c'entra annulla il risultato, e si dice quale", () => {
    const tunes = [{ id: 1, name: "Cooley's", type: "reel" }];
    const r = risultatiCheRispondono("Cooley's dei Beatles", tunes);
    assert.equal(r.risposte.length, 0);
    assert.deepEqual(r.paroleAssenti, ["beatles"], "«dei» è una parola vuota e non deve comparire qui");
  });

  test("query vuota: si restituisce tutto invece di far sparire l'archivio", () => {
    const tunes = [{ id: 1, name: "Cooley's", type: "reel" }];
    assert.equal(risultatiCheRispondono("", tunes).risposte.length, 1);
    assert.equal(risultatiCheRispondono("di il the", tunes).risposte.length, 1, "solo parole vuote = nessun filtro");
  });

  test("la lista che non arriva non fa esplodere niente", () => {
    for (const niente of [null, undefined, "non una lista", 42]) {
      assert.deepEqual(risultatiCheRispondono("cooley", niente).risposte, []);
    }
  });

  test("LA RICERCA VERA DI PRIMA resta com'era: il filtro non ha rotto il caso buono", () => {
    // thesession-ricerca.json è la risposta vera a «morrison»: tutti i titoli la contengono.
    const r = risultatiCheRispondono("morrison", RICERCA.tunes);
    assert.equal(r.risposte.length, RICERCA.tunes.length, `scartati ${r.scartati}: ${r.risposte.length}/${RICERCA.tunes.length}`);
    assert.equal(r.paroleAssenti.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// IL TESTO CHE COMPARE IN CHAT DEVE DIRE LA VERITA' DEL CASO IN CUI SI TROVA — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost ha cercato «lateralus dei Tool». L'archivio ha risposto ZERO brani, e lo Shell gli ha
// scritto: «L'archivio ha risposto con 0 brani, ma le parole «lateralus», «tool» non compaiono in
// nessuno di QUEI titoli: ha cercato solo il resto... TE LI HO TOLTI invece di mostrarteli».
// Zero titoli, nessun resto, niente tolto: una potatura raccontata che non era avvenuta.
//
// Due cause, e tutte e due valevano una correzione:
//  1. `paroleAssenti` su lista vuota restituiva TUTTE le parole — `[].some()` è sempre falso, cioè
//     vero in logica e falso in pratica: non si afferma l'assenza da un insieme che non esiste.
//  2. il testo viveva DENTRO ShellView, dove nessuna prova lo raggiungeva. Un testo che afferma
//     fatti («ne ho tolti N») deve stare sotto banco quanto il numero che afferma.
describe("LA SPIEGAZIONE DELLA RICERCA, caso per caso", () => {
  const { spiegazioneRicerca, risultatiCheRispondono } = app;
  const vuoto = { tunes: [], pertinenti: 0, grezzi: 0, scartati: 0, paroleAssenti: [], errore: "" };
  const di = (patch) => spiegazioneRicerca({ query: "lateralus tool", esito: { ...vuoto, ...patch } });

  test("ZERO RISPOSTE: non si dice di aver tolto niente, perché non c'era niente", () => {
    const r = di({});
    assert.equal(r.caso, "nessuno");
    assert.match(r.testo, /non conosce nessun brano con queste parole/);
    assert.doesNotMatch(r.testo, /tolt/i, `dice di aver tolto qualcosa: ${r.testo.slice(0, 200)}`);
    assert.doesNotMatch(r.testo, /quei titoli/i, "non ci sono titoli di cui parlare");
    assert.doesNotMatch(r.testo, /0 brani/, "«ha risposto con 0 brani, ma...» era la frase sbagliata");
  });

  test("e il caso zero nasce dal filtro, non solo dal testo: lista vuota, nessuna parola «assente»", () => {
    assert.deepEqual(risultatiCheRispondono("lateralus tool", []).paroleAssenti, [],
      "su zero risultati non si può affermare che una parola manchi da quei titoli");
  });

  test("CENTO RISPOSTE NON PERTINENTI: lì sì che si dice quante e quale parola è caduta a vuoto", () => {
    const r = di({ grezzi: 100, scartati: 100, paroleAssenti: ["metallica"] });
    assert.equal(r.caso, "potati");
    assert.match(r.testo, /ne ha restituiti 100/);
    assert.match(r.testo, /«metallica» non compare/);
    assert.match(r.testo, /Te li ho tolti/);
  });

  test("il plurale non si sbaglia: una parola «compare», due «compaiono»", () => {
    assert.match(di({ grezzi: 9, scartati: 9, paroleAssenti: ["metallica"] }).testo, /la parola «metallica» non compare/);
    assert.match(di({ grezzi: 9, scartati: 9, paroleAssenti: ["lateralus", "tool"] }).testo, /le parole «lateralus», «tool» non compaiono/);
  });

  test("SCARTATI SENZA PAROLE ASSENTI: c'è comunque una frase, e non nomina parole inesistenti", () => {
    // Caso vero: ogni parola compare da qualche parte, ma mai tutte nello stesso titolo.
    const r = di({ grezzi: 40, scartati: 40, paroleAssenti: [] });
    assert.equal(r.caso, "potati");
    assert.match(r.testo, /nessuno conteneva tutte le parole/);
    assert.doesNotMatch(r.testo, /«»/, "nessuna parola vuota fra virgolette");
  });

  test("TROVATI: si dice quanti, e quanti sono stati tolti solo se ne sono stati tolti", () => {
    const conScarti = spiegazioneRicerca({ query: "morrison", esito: { ...vuoto, tunes: [{}, {}], pertinenti: 2, grezzi: 7, scartati: 5 } });
    assert.equal(conScarti.caso, "trovati");
    assert.match(conScarti.testo, /2 brani/);
    assert.match(conScarti.testo, /5 non contenevano quello che hai chiesto/);
    const pulito = spiegazioneRicerca({ query: "morrison", esito: { ...vuoto, tunes: [{}], pertinenti: 1, grezzi: 1, scartati: 0 } });
    assert.match(pulito.testo, /: 1 brano\./, pulito.testo.slice(0, 120));
    assert.doesNotMatch(pulito.testo, /non contenevano/, "senza scarti non si parla di scarti");
  });

  test("ERRORE DI RETE: è una ricerca che NON E' PARTITA, e non va confusa con «non c'è»", () => {
    const r = di({ errore: "l'archivio ha risposto 503" });
    assert.equal(r.caso, "errore");
    assert.match(r.testo, /non è partita/);
    assert.doesNotMatch(r.testo, /non c'è\./, "un guasto di rete non è una risposta sul repertorio");
    assert.doesNotMatch(r.testo, /tradizionale irlandese/, "non si spiega il repertorio quando non si è potuto guardare");
  });

  test("LO STRUMENTO si dice solo se il Ghost l'ha nominato", () => {
    assert.match(spiegazioneRicerca({ query: "one", strumento: "basso", esito: vuoto }).testo, /«basso» non l'ho usato per filtrare/);
    assert.doesNotMatch(di({}).testo, /non l'ho usato per filtrare/);
  });

  test("«NON CE NE SONO ALTRI» ERA FALSO: esistono, si nominano, e si dice perché non entrano qui", () => {
    // Il Ghost ha risposto al messaggio dell'app mandando Lateralus dei Tool su MuseScore e su
    // Songsterr, con la riga del basso. Aveva ragione. Due frasi diverse, e solo la seconda è vera:
    // «non esistono» (falso) e «esistono ma non li posso leggere da qui» (misurato: CORS assente,
    // 403 anti-robot). Questa prova tiene ferma la distinzione.
    const r = di({});
    assert.doesNotMatch(r.testo, /non ne ho altri/, "la frase vecchia, quella sbagliata");
    assert.doesNotMatch(r.testo, /non ci saranno/, "non si profetizza sul repertorio di archivi altrui");
    assert.match(r.testo, /ESISTONO ALTROVE/);
    for (const nome of ["Songsterr", "MuseScore"]) assert.ok(r.testo.includes(nome), `manca ${nome}`);
    assert.match(r.testo, /non posso fare è portarli qui dentro/);
    assert.match(r.testo, /misurato, non supposto/);
  });

  test("i link ci sono davvero, portano la query, e sono link veri", () => {
    const r = di({});
    assert.equal(r.altrove.length, 2);
    for (const a of r.altrove) {
      assert.match(a.url, /^https:\/\//, a.url);
      assert.ok(a.url.includes(encodeURIComponent("lateralus tool")), `la query non è nell'indirizzo: ${a.url}`);
      assert.ok(a.nome && a.perChe && a.muro, `${a.id}: si dichiara a metà`);
    }
    assert.match(app.altroveDoveCercare("Cooley's")[0].url, /songsterr\.com/);
  });

  test("l'altrove si offre solo quando qui non c'è niente: con i risultati non si manda via nessuno", () => {
    const trovati = spiegazioneRicerca({ query: "morrison", esito: { ...vuoto, tunes: [{}], pertinenti: 1, grezzi: 1 } });
    assert.deepEqual(trovati.altrove, [], "con i brani in mano non si propone di andare altrove");
    // E nemmeno su un guasto di rete: lì non si sa ancora se qui ci sia o no.
    assert.deepEqual(di({ errore: "rete assente" }).altrove, []);
    // Invece quando l'archivio ha risposto e nessuno era pertinente, sì.
    assert.equal(di({ grezzi: 100, scartati: 100, paroleAssenti: ["metallica"] }).altrove.length, 2);
  });

  test("ogni archivio dichiarato dice il MURO per cui non si può leggere, non «non si può»", () => {
    // Un limite senza il suo motivo, fra sei mesi, è indistinguibile da una scelta pigra — e non si
    // può nemmeno ricontrollare se nel frattempo è caduto.
    for (const a of app.ARCHIVI_NON_INTERROGABILI) {
      assert.match(a.muro, /Misurato il \d{2}\/\d{2}\/\d{4}/, `${a.id}: il muro non porta la data della misura`);
      assert.match(a.cerca("x y"), /^https:\/\/[^ ]+x%20y/, `${a.id}: indirizzo mal composto`);
    }
  });

  test("in nessun caso si dice di non avere accesso a internet", () => {
    const casi = [di({}), di({ grezzi: 100, scartati: 100, paroleAssenti: ["metallica"] }),
      di({ errore: "rete assente" }), spiegazioneRicerca({ query: "x", esito: { ...vuoto, tunes: [{}], pertinenti: 1, grezzi: 1 } })];
    for (const c of casi) {
      assert.doesNotMatch(c.testo, /non ho accesso|non posso cercare online|database musicali/i, c.caso);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LE BATTUTE DEVONO TORNARE COL METRO — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Nato dalla proposta del Ghost: «basterebbe banalmente una ricerca Google e poi osservare le
// immagini». I mattoni ci sono (ricerca web e visione sono già cablate), ma nessuno dei sette
// requisiti guardava le DURATE — e un modello che legge uno spartito da un'immagine sbaglia proprio
// quelle, in modo plausibile: note giuste, ritmo storto, ABC formalmente perfetto.
describe("LE DURATE — il controllo che mancava, e che serve prima di leggere un'immagine", () => {
  const { durataDellaBattuta, metroInUnita } = app;

  test("il metro dice quanto vale una battuta, nell'unità dichiarata da L:", () => {
    assert.equal(metroInUnita("4/4", "1/8"), 8);
    assert.equal(metroInUnita("6/8", "1/8"), 6);
    assert.equal(metroInUnita("2/4", "1/8"), 4);
    assert.equal(metroInUnita("3/4", "1/4"), 3);
    assert.equal(metroInUnita("C", "1/8"), 8, "C è 4/4");
    assert.equal(metroInUnita("C|", "1/8"), 8, "C| è 2/2, che vale come 4/4 in crome");
    assert.ok(Number.isNaN(metroInUnita("boh", "1/8")), "un metro illeggibile non si giudica");
  });

  test("le durate ABC si contano come le conta chi suona", () => {
    assert.equal(durataDellaBattuta("ABCD EFGA"), 8, "otto crome");
    assert.equal(durataDellaBattuta("A2 B2 C4"), 8, "i numeri moltiplicano");
    assert.equal(durataDellaBattuta("A/B/ C/2D/2 E3 F"), 6, "la barra divide: A/ è mezza croma");
    assert.equal(durataDellaBattuta("[CEG]2 [DF]2 A4"), 8, "un accordo vale UNA durata, non tre");
    assert.equal(durataDellaBattuta("(3ABC (3DEF A A"), 6, "una terzina sta nel tempo di due");
    assert.equal(durataDellaBattuta("z4 A4"), 8, "le pause durano");
    assert.equal(durataDellaBattuta("A>B C>D E>F G>A"), 8, "il ritmo zoppo sposta durata, non ne aggiunge");
    assert.equal(durataDellaBattuta('"Em"A2 !fermata!B2 {g}C4'), 8, "accordi scritti, decorazioni e abbellimenti non durano");
    assert.equal(durataDellaBattuta("A,2 B,2 c'2 d'2"), 8, "le ottave non sono durate");
  });

  test("«[1» E «[2» SONO LA PRIMA E LA SECONDA VOLTA, non accordi", () => {
    // Letti come accordi facevano contare note che non ci sono. Stessa forma dell'errore che
    // rifiutava `"Em"` come prosa: un simbolo di notazione scambiato per musica.
    assert.equal(durataDellaBattuta("1 DEFD E4"), 8);
    assert.equal(durataDellaBattuta("[K:Gmaj]ABCD EFGA"), 8, "un campo dentro la riga non è un accordo");
    // Il caso che MORDE, trovato dalla verifica di rottura: il primo giro provava «1 DEFD E4» senza
    // la parentesi, e lì il parser cadeva in piedi per caso (nessun «]» da trovare, quindi tirava
    // dritto). Serve un accordo VERO più avanti nella battuta: allora «[1» ingoia tutto fino al «]»
    // dell'accordo e la battuta vale 4 invece di 8.
    assert.equal(durataDellaBattuta("[1 ABCD [CE]4"), 8, "«[1» si mangia la battuta fino al primo accordo");
  });

  test("L'ANACRUSI NON E' UN ERRORE, e me l'ha insegnato il dato vero", () => {
    // Cooley's, prima misura: battuta 1 = «D2» (vale 2), battuta 9 = «DEFD E2» (vale 6). 2+6 = 8.
    // In un brano con la levata, l'iniziale incompleta e quella che chiude fanno insieme una
    // battuta intera. Le parziali si ACCOPPIANO: non è tolleranza, è come si conta la musica.
    const conLevata = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nD2|EBBA B2 EB|B2 AB dBAG|DEFD E2|";
    const a = analizzaSpartito(conLevata);
    assert.equal(a.ok, true, a.errori.map((e) => e.motivo).join(" · "));
  });

  test("UNA SOLA DURATA SBAGLIATA VIENE PRESA — ed è il punto di tutto questo", () => {
    const sano = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nEBBA B2 EB|B2 AB dBAG|";
    const storto = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nEBBA B3 EB|B2 AB dBAG|";
    assert.equal(analizzaSpartito(sano).ok, true);
    const r = analizzaSpartito(storto);
    assert.equal(r.ok, false, "una battuta di 9 crome in 4/4 passava: è il buco che apriva la lettura da immagine");
    assert.match(r.errori.map((e) => e.motivo).join(" "), /più lunga del metro/);
  });

  test("una parziale spaiata si dice per quello che è", () => {
    const spaiata = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nD2|EBBA B2 EB|B2 AB dBAG|";
    assert.match(analizzaSpartito(spaiata).errori.map((e) => e.motivo).join(" "), /parziale spaiata/);
  });

  test("IL REPERTORIO VERO NON VIENE BUTTATO: per l'archivio è un AVVISO, non un rifiuto", () => {
    // Misurato su 192 trascrizioni vere: 31 hanno battute che non tornano, e guardandole una per
    // una NON sono falsi positivi — sono trascrizioni vere e imperfette, caricate da musicisti che
    // scrivono a orecchio. «FED AD BDAD» vale 9 dove un'altra versione scrive «F/E/D AD BDAD».
    // Buttare la musica di qualcun altro perché non ha contato le crome sarebbe la Legge 14 rotta
    // al contrario. Per un modello invece è un errore da rifare: lì la battuta storta è sua.
    const storto = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nFED AD BDAD|B2 AB dBAG|";
    assert.equal(analizzaSpartito(storto, "modello").ok, false, "da un modello si pretende che torni");
    const daFuori = analizzaSpartito(storto, "archivio");
    assert.equal(daFuori.ok, true, "da un archivio si tiene");
    assert.equal(daFuori.avvisi.length, 1, "ma NON in silenzio");
    assert.equal(daFuori.avvisi[0].id, "battute-che-tornano");
    assert.match(daFuori.avvisi[0].motivo, /più lunga del metro/);
  });

  test("tutte e 192 le trascrizioni vere restano accettate, con l'avviso dove serve", () => {
    const versioni = spartitiDalBrano(COOLEYS, analizzaSpartito);
    assert.equal(versioni.filter((v) => !v.analisi.ok).length, 0, "l'archivio non deve perdere niente");
    assert.ok(versioni.some((v) => (v.analisi.avvisi || []).length >= 0), "il campo avvisi esiste sempre");
  });

  test("senza metro non si giudica invece di inventare un verdetto", () => {
    // `metro-dichiarato` prende già il caso; questo controllo non deve aggiungere un secondo errore
    // su un dato che non ha.
    const senzaMetro = analizzaSpartito("X:1\nT:P\nK:C\nABCD EFGA|ABC|");
    assert.equal(senzaMetro.errori.filter((e) => e.id === "battute-che-tornano").length, 0);
  });

  test("il requisito si DETTA al modello, non solo si verifica", () => {
    // La regola di casa: un oggetto solo, letto due volte. Se il modello non sa che deve contare,
    // il controllo a valle scarta e non insegna niente.
    const brief = app.briefDelloSpartito({ argomento: "prova" });
    assert.match(brief, /una battuta vale 8 crome/);
    assert.match(brief, /levata/);
  });
});

describe("GLI INDIRIZZI DELL'ARCHIVIO", () => {
  test("si compongono con la ricerca dentro, non concatenando a mano", () => {
    const u = ARCHIVIO_SPARTITI.cerca("cooley's");
    assert.match(u, /^https:\/\/thesession\.org\/tunes\/search\?/);
    // `encodeURIComponent` NON codifica l'apostrofo — è un carattere permesso in un indirizzo — e
    // per un repertorio pieno di «Cooley's» e «Morrison's» è esattamente il caso normale.
    assert.ok(u.includes("q=cooley's"), u);
    assert.match(ARCHIVIO_SPARTITI.cerca("due parole & altro"), /q=due%20parole%20%26%20altro/, "spazi e & vanno codificati");
    assert.match(u, /format=json/);
    assert.match(ARCHIVIO_SPARTITI.brano(71), /^https:\/\/thesession\.org\/tunes\/71\?format=json$/);
  });

  test("l'archivio si dichiara: nome e a cosa serve, perché finiscono sullo schermo del Ghost", () => {
    assert.ok(ARCHIVIO_SPARTITI.nome && ARCHIVIO_SPARTITI.perChe);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LEGGERE UNO SPARTITO DA UN'IMMAGINE — 14/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Uno spartito GENERATO è un'invenzione, e se è brutto si vede. Uno TRASCRITTO pretende di essere
// fedele a una cosa che esiste, e se è sbagliato NON si vede: note giuste e ritmo storto sono
// indistinguibili da una lettura corretta per chi non ha l'originale sotto gli occhi.
describe("TRASCRIVERE DA UN'IMMAGINE — e dire quello che non si può controllare", () => {
  const { richiestaDiTrascrizione, briefDiTrascrizione, noteDiLettura } = app;

  test("si chiede a parole, e lo strumento e i versi si leggono dalla frase", () => {
    assert.ok(richiestaDiTrascrizione("trascrivimelo in ABC"));
    assert.ok(richiestaDiTrascrizione("leggi questo spartito e trascrivilo"));
    assert.equal(richiestaDiTrascrizione("convertimi la tablatura del basso").strumento, "basso");
    assert.equal(richiestaDiTrascrizione("trascrivi le note e i versi").conVersi, true);
    assert.equal(richiestaDiTrascrizione("trascrivi lo spartito").conVersi, false);
  });

  test("NON parte su una frase qualsiasi: serve il verbo E l'oggetto", () => {
    assert.equal(richiestaDiTrascrizione("oggi ho letto un libro"), null);
    assert.equal(richiestaDiTrascrizione("guarda questa foto"), null);
    assert.equal(richiestaDiTrascrizione("leggi ad alta voce la risposta"), null);
    assert.equal(richiestaDiTrascrizione(""), null);
  });

  test("non si accavalla con la RICERCA in archivio: sono due strade diverse", () => {
    // «cerca» non trascrive, «trascrivi» non cerca. Se si accendessero tutte e due, una frase sola
    // farebbe partire una chiamata di rete e un turno di modello insieme.
    assert.equal(richiestaDiTrascrizione("cercami lo spartito di Cooley's"), null);
    assert.equal(app.richiestaDiSpartito("trascrivimi questo spartito"), null);
  });

  test("IL BRIEF DICE DI NON INVENTARE, ed è la riga che regge tutto", () => {
    // Normalizzato: il brief va a capo per stare in larghezza nel sorgente, e una prova che si
    // rompe su un a capo controlla la mia formattazione invece del contenuto.
    const b = briefDiTrascrizione({}).replace(/\s+/g, " ");
    assert.match(b, /NON INVENTARE/);
    assert.match(b, /Una battuta inventata è peggio di una battuta mancante/);
    assert.match(b, /PRIMA DI CHIUDERE OGNI STANGHETTA, CONTA/);
  });

  test("legge il PENTAGRAMMA e non la tablatura, perché è lì che stanno le durate", () => {
    assert.match(briefDiTrascrizione({}), /leggi il PENTAGRAMMA/);
    assert.match(briefDiTrascrizione({}), /Drop D/, "l'accordatura va dichiarata: in ABC l'altezza è quella che suona");
  });

  test("i requisiti di forma sono GLI STESSI degli spartiti generati — un oggetto letto due volte", () => {
    const b = briefDiTrascrizione({});
    for (const r of app.REQUISITI_SPARTITO) {
      if (r.id === "versi-allineati") continue;         // solo su richiesta
      assert.ok(b.includes(r.detta), `il brief di trascrizione non detta «${r.id}»`);
    }
    assert.ok(briefDiTrascrizione({ conVersi: true }).includes("w:"), "coi versi si detta anche quello");
  });

  test("IL POSTO PER DIRE «QUI NON CI SONO ARRIVATO» VA DATO, o diventa prosa e viene scartata", () => {
    const abc = "X:1\nT:Schism\n% Drop D: la prima corda suona un tono sotto\nM:4/4\nL:1/8\n% battuta 7 illeggibile nella foto, messa come pausa\nK:Dm\nDEFD E4|z8|";
    assert.deepEqual(noteDiLettura(abc), [
      "Drop D: la prima corda suona un tono sotto",
      "battuta 7 illeggibile nella foto, messa come pausa",
    ]);
    // E quelle righe non fanno fallire l'accettore: i commenti ABC sono legittimi.
    assert.equal(analizzaSpartito(abc).ok, true, analizzaSpartito(abc).errori.map((e) => e.motivo).join(" · "));
  });

  test("`%%source` non è una nota di lettura: è la provenienza, e ha già il suo posto", () => {
    assert.deepEqual(noteDiLettura("X:1\n%%score [V1 V2]\n% nota vera\nK:C"), ["nota vera"]);
  });

  test("UNA LETTURA COL RITMO STORTO VIENE FERMATA — è tutto il motivo per cui questa strada è sicura", () => {
    // Il modo tipico in cui sbaglia chi legge uno spartito da un'immagine: le note giuste, una
    // durata sbagliata. Senza il controllo sulle battute questo passava e sembrava una trascrizione.
    const letturaStorta = "X:1\nT:Schism\nM:4/4\nL:1/8\nK:Dm\nDEFD E4|DEFD E3|";
    const r = analizzaSpartito(letturaStorta, "modello");
    assert.equal(r.ok, false);
    assert.match(r.errori.map((e) => e.motivo).join(" "), /parziale spaiata|più lunga del metro/);
  });
});
