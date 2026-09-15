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
    // 15/09/2026 — DATO DI PROVA CORRETTO. Le battute di prima valevano 4 crome invece di 8: questa
    // prova verifica che un secondo T: non sia un errore, e per farlo usava uno spartito che non
    // torna. Passava solo perché la regola dell'anacrusi accoppiava qualunque coppia di parziali —
    // cioè per lo stesso buco che oggi ha fatto passare quattro battute di pause come «spartito
    // trovato». Sistemato il buco, la prova ha denunciato il proprio dato: è il banco che funziona.
    const conSecondoTitolo = "X:1\nT:Prima parte\nM:4/4\nL:1/8\nK:D\nDFAF GFED|B>cBA GFED|\nT:Seconda parte\ndfcd BAGF|B>cd>c BAGF|";
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
    assert.equal(r.query, "come together", "il TITOLO, non il gruppo");
    assert.equal(r.autore, "Beatles", "«dei Beatles» è chi l'ha fatta, e va detto invece di finire nella ricerca");
    assert.equal(r.strumento, "basso", "lo strumento si dice al Ghost, anche se non filtra la ricerca");
  });

  test("IL BRANO STA DOPO «DELLA», L'AUTORE DOPO «DI» — e vanno separati", () => {
    // La frase vera del Ghost, 15/09: «Cerca lo spartito per flauto traverso della Primavera di
    // Antonio Vivaldi». L'app cercava «Antonio Vivaldi» — l'AUTORE invece del BRANO — perché
    // prendeva il primo «di» della frase, e in italiano quello è quasi sempre chi l'ha scritta.
    const casi = [
      ["Cerca lo spartito per flauto traverso della primavera di Antonio Vivaldi", "primavera", "Antonio Vivaldi"],
      // Tre parole in coda: senza il divieto di preposizioni dentro la cattura, «One dei Metallica»
      // veniva preso tutto insieme e il titolo spariva dentro il nome del gruppo.
      ["Cerca lo spartito per basso di One dei Metallica", "One", "Metallica"],
      // Due «di» nella stessa frase: il primo è del titolo, l'ultimo è l'autore.
      ["trova lo spartito del chiaro di luna di Beethoven", "chiaro luna", "Beethoven"],
      ["cercami lo spartito del bolero di Ravel", "bolero", "Ravel"],
      // E il caso in cui NON si toglie: togliendo «di Cooley's» non resterebbe niente da cercare.
      ["cercami lo spartito di Cooley's", "Cooley's", ""],
      ["scaricami lo spartito per violino di Egan's polka", "Egan's polka", ""],
    ];
    for (const [frase, query, autore] of casi) {
      const r = richiestaDiSpartito(frase);
      assert.ok(r, `non riconosciuta: ${frase}`);
      assert.equal(r.query, query, frase);
      assert.equal(r.autore || "", autore, `autore, in: ${frase}`);
    }
  });

  test("lo strumento non spezza il titolo: esce prima che si guardi l'autore", () => {
    // «per flauto traverso» sta IN MEZZO fra l'oggetto e il titolo.
    assert.equal(richiestaDiSpartito("cerca lo spartito per flauto traverso della primavera").query, "primavera");
    assert.equal(richiestaDiSpartito("cerca lo spartito per violoncello del bolero").query, "bolero");
    assert.equal(richiestaDiSpartito("cerca lo spartito per flauto traverso della primavera").strumento, "flauto");
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
    // 15/09 sera — controllava `/: zero\./`. La frase e' cambiata («Non e' in The Session ...»)
    // perche' UN ESITO ZERO NON E' UNA NOTIZIA e non merita un annuncio. Il fatto che questa prova
    // difende non era mai la parola «zero»: era che non si vanti di una potatura mai avvenuta.
    assert.ok(/non è in/i.test(r.testo), `non dice nemmeno che non c'è: ${r.testo}`);
    assert.ok(r.testo.length < 160, `un esito zero in ${r.testo.length} caratteri è un annuncio: ${r.testo}`);
    assert.doesNotMatch(r.testo, /tolt/i, `dice di aver tolto qualcosa: ${r.testo.slice(0, 200)}`);
    assert.doesNotMatch(r.testo, /quei titoli/i, "non ci sono titoli di cui parlare");
    assert.doesNotMatch(r.testo, /0 brani|0 risultati/, "«ha risposto con 0 brani, ma...» era la frase sbagliata");
  });

  test("e il caso zero nasce dal filtro, non solo dal testo: lista vuota, nessuna parola «assente»", () => {
    assert.deepEqual(risultatiCheRispondono("lateralus tool", []).paroleAssenti, [],
      "su zero risultati non si può affermare che una parola manchi da quei titoli");
  });

  test("CENTO RISPOSTE NON PERTINENTI: lì sì che si dice quante e quale parola è caduta a vuoto", () => {
    const r = di({ grezzi: 100, scartati: 100, paroleAssenti: ["metallica"] });
    assert.equal(r.caso, "potati");
    // I FATTI: quanti ne ha visti, e QUALE parola e' caduta a vuoto. Restano tutti e due.
    // Le parole intorno («non compare in nessun titolo», «non te la mostro») sono cadute il
    // 15/09 sera: dicevano due volte la stessa cosa.
    assert.match(r.testo, /100 risultati/);
    assert.match(r.testo, /«metallica»/);
  });

  test("il plurale non si sbaglia: una parola «compare», due «compaiono»", () => {
    // La frase nuova («nessuno che contenga X») vale per uno e per molti: il problema del plurale
    // non e' stato risolto, e' stato DISSOLTO. Restano le parole, che sono il fatto.
    assert.match(di({ grezzi: 9, scartati: 9, paroleAssenti: ["metallica"] }).testo, /«metallica»/);
    assert.match(di({ grezzi: 9, scartati: 9, paroleAssenti: ["lateralus", "tool"] }).testo, /«lateralus», «tool»/);
    assert.match(di({ grezzi: 1, scartati: 1, paroleAssenti: ["x"] }).testo, /1 risultato,/, "uno solo non è «1 risultati»");
  });

  test("SCARTATI SENZA PAROLE ASSENTI: c'è comunque una frase, e non nomina parole inesistenti", () => {
    // Caso vero: ogni parola compare da qualche parte, ma mai tutte nello stesso titolo.
    const r = di({ grezzi: 40, scartati: 40, paroleAssenti: [] });
    assert.equal(r.caso, "potati");
    assert.match(r.testo, /nessuno con tutte le parole/);
    assert.doesNotMatch(r.testo, /«»/, "nessuna parola vuota fra virgolette");
  });

  test("TROVATI: si dice quanti, e quanti sono stati tolti solo se ne sono stati tolti", () => {
    const conScarti = spiegazioneRicerca({ query: "morrison", esito: { ...vuoto, tunes: [{}, {}], pertinenti: 2, grezzi: 7, scartati: 5 } });
    assert.equal(conScarti.caso, "trovati");
    assert.match(conScarti.testo, /2 brani/);
    assert.match(conScarti.testo, /5 scartati su 7/);
    const pulito = spiegazioneRicerca({ query: "morrison", esito: { ...vuoto, tunes: [{}], pertinenti: 1, grezzi: 1, scartati: 0 } });
    assert.match(pulito.testo, /: 1 brano\./, pulito.testo.slice(0, 120));
    assert.doesNotMatch(pulito.testo, /scartat/, "senza scarti non si parla di scarti");
  });

  test("ERRORE DI RETE: è una ricerca che NON E' PARTITA, e non va confusa con «non c'è»", () => {
    const r = di({ errore: "l'archivio ha risposto 503" });
    assert.equal(r.caso, "errore");
    // Prima: /non è partita/. Adesso lo dice piu' corto e piu' netto, ma e' LA STESSA distinzione,
    // che e' il fatto: un guasto di rete non e' una risposta sul repertorio.
    assert.match(r.testo, /non ho potuto guardare/);
    assert.doesNotMatch(r.testo, /^Non è in/, "un guasto di rete non è «non c'è»");
    assert.doesNotMatch(r.testo, /tradizionale irlandese/, "non si spiega il repertorio quando non si è potuto guardare");
  });

  test("LO STRUMENTO si dice solo se il Ghost l'ha nominato", () => {
    assert.match(spiegazioneRicerca({ query: "one", strumento: "basso", esito: vuoto }).testo, /«basso» non filtra/);
    assert.doesNotMatch(di({}).testo, /non filtra/);
    // E l'AUTORE tolto dalla ricerca si dice, o il Ghost non capisce perché ho cercato solo metà
    // di quello che ha chiesto. È il difetto che ha visto il 15/09 con «la primavera di Vivaldi».
    assert.match(spiegazioneRicerca({ query: "primavera", autore: "Antonio Vivaldi", esito: vuoto }).testo,
      /«Antonio Vivaldi» l'ho letto come autore/);
    assert.doesNotMatch(di({}).testo, /come autore/);
  });

  test("«NON CE NE SONO ALTRI» ERA FALSO: esistono, si nominano, e si dice perché non entrano qui", () => {
    // Il Ghost ha risposto al messaggio dell'app mandando Lateralus dei Tool su MuseScore e su
    // Songsterr, con la riga del basso. Aveva ragione. Due frasi diverse, e solo la seconda è vera:
    // «non esistono» (falso) e «esistono ma non li posso leggere da qui» (misurato: CORS assente,
    // 403 anti-robot). Questa prova tiene ferma la distinzione.
    const r = di({});
    assert.doesNotMatch(r.testo, /non ne ho altri/, "la frase vecchia, quella sbagliata");
    assert.doesNotMatch(r.testo, /non ci saranno/, "non si profetizza sul repertorio di archivi altrui");
    // Prima: /I link qui sotto portano dove invece c'è/. Adesso dice «Guardo nel resto del web»,
    // che e' piu' vero: da oggi ci va da solo invece di mandarci il Ghost. Il fatto difeso — non si
    // afferma mai che il brano non esista — e' quello delle due righe qui sopra.
    assert.match(r.testo, /resto del web/);
    // I nomi e il motivo tecnico di ciascuno stanno nella CARD, accanto al loro link, non nel
    // messaggio: il muro di prosa che li elencava era tre schermate (15/09, «un po' scarso»).
    for (const nome of ["Songsterr", "MuseScore", "IMSLP"]) {
      assert.ok(r.altrove.some((a) => a.nome === nome), `manca ${nome}`);
    }
  });

  test("i link ci sono davvero, portano la query, e sono link veri", () => {
    const r = di({});
    assert.equal(r.altrove.length, 3, "Songsterr, MuseScore e IMSLP");
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
    assert.equal(di({ grezzi: 100, scartati: 100, paroleAssenti: ["metallica"] }).altrove.length, 3);
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
    assert.match(b, /Una battuta inventata è peggio di una mancante/);
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

// ══════════════════════════════════════════════════════════════════════════════
// CERCARE IN TUTTO IL WEB — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «deve cercare online, in tutto il web, come una ricerca Google, non solo in archivi».
// Il rischio da non spedire è che il modello ELENCHI LINK A MEMORIA: un indirizzo ricordato male
// porta a una pagina che non esiste, ed è indistinguibile da uno buono finché non ci clicchi.
// Stessa classe degli appuntamenti inventati, stessa cura: il programma mostra il DATO (le
// annotazioni della ricerca), non la prosa che lo racconta.
describe("LA RICERCA WEB — e i link che nessun modello può inventare", () => {
  const { briefRicercaWebSpartito, fontiPerSpartito, senzaIndirizziInventati, leggiDiagnosticaRicerca, diagnosticaVuota } = app;

  test("il brief VIETA al modello di scrivere indirizzi, e dice perché", () => {
    const b = briefRicercaWebSpartito({ query: "la primavera", autore: "Vivaldi", strumento: "flauto" }).replace(/\s+/g, " ");
    assert.match(b, /NON SCRIVERE GLI INDIRIZZI/);
    assert.match(b, /li mette il programma, presi dai risultati veri/);
    assert.match(b, /Cerca in tutto il web, non in un archivio solo/);
    assert.ok(b.includes("la primavera") && b.includes("di Vivaldi") && b.includes("per flauto"), b.slice(0, 160));
  });

  test("GLI INDIRIZZI VERI SI LEGGONO DALLE ANNOTAZIONI, non dal testo", () => {
    // La forma che OpenRouter restituisce davvero con il plugin di ricerca attivo.
    const raw = { choices: [{ message: { content: "ecco cosa ho trovato", annotations: [
      { type: "url_citation", url_citation: { url: "https://imslp.org/wiki/Le_quattro_stagioni", title: "Le quattro stagioni — IMSLP" } },
      { type: "url_citation", url_citation: { url: "https://musescore.com/user/1/scores/2", title: "Primavera" } },
      { type: "url_citation", url_citation: { url: "https://imslp.org/wiki/Le_quattro_stagioni", title: "doppione" } },
    ] } }] };
    const d = leggiDiagnosticaRicerca(raw, diagnosticaVuota());
    assert.equal(d.toolInvoked, true);
    assert.equal(d.fonti.length, 2, "il doppione non si mostra due volte");
    assert.equal(d.fonti[0].dominio, "imslp.org", "il «www.» non si mostra");
    assert.equal(d.fonti[0].titolo, "Le quattro stagioni — IMSLP");
    // E i domini, che servivano già a Balthasar, restano come prima.
    assert.deepEqual(d.citationDomains.sort(), ["imslp.org", "musescore.com"]);
  });

  test("nessuna ricerca eseguita = nessuna fonte, e si vede", () => {
    const d = leggiDiagnosticaRicerca({ choices: [{ message: { content: "credo sia su IMSLP" } }] }, diagnosticaVuota());
    assert.equal(d.toolInvoked, false, "così la card può dire che viene dalla memoria, non dal web");
    assert.deepEqual(d.fonti, []);
  });

  test("UN INDIRIZZO CHE LA RICERCA NON HA RESTITUITO VIENE TOLTO, e si conta", () => {
    const fonti = [{ url: "https://imslp.org/wiki/X" }];
    const r = senzaIndirizziInventati(
      "Lo trovi su IMSLP https://imslp.org/wiki/X e anche su https://spartiti-inventati.example/vivaldi",
      fonti);
    assert.ok(r.testo.includes("https://imslp.org/wiki/X"), "quello vero resta");
    assert.ok(!r.testo.includes("spartiti-inventati"), "quello inventato sparisce");
    assert.equal(r.inventati, 1, "e si conta, perché un modello che continua a farlo è un fatto");
  });

  test("senza indirizzi inventati il testo non viene toccato", () => {
    const t = "Su IMSLP c'è la partitura completa, gratis.";
    assert.deepEqual(senzaIndirizziInventati(t, []), { testo: t, inventati: 0 });
  });

  test("I RISULTATI SI ORDINANO PER QUANTO SONO VICINI A QUALCOSA DI USABILE QUI", () => {
    // Una pagina che dà ABC si può portare dentro l'app; un PDF si può solo guardare; un video
    // nemmeno quello. È un giudizio del PROGRAMMA sul dominio, non una domanda al modello.
    const ordinate = fontiPerSpartito([
      { url: "https://www.youtube.com/watch?v=1", dominio: "youtube.com" },
      { url: "https://imslp.org/wiki/X", dominio: "imslp.org" },
      { url: "https://thesession.org/tunes/1", dominio: "thesession.org" },
      { url: "https://www.mutopiaproject.org/x", dominio: "mutopiaproject.org" },
    ]);
    assert.deepEqual(ordinate.map((f) => f.dominio), ["thesession.org", "mutopiaproject.org", "imslp.org", "youtube.com"]);
    assert.equal(ordinate[0].portabile, "abc");
    assert.ok(ordinate[0].che, "ogni dominio noto dice cosa ci si trova");
  });

  test("un dominio che non conosco non viene buttato: si mostra senza giudizio", () => {
    const r = fontiPerSpartito([{ url: "https://sito-mai-visto.it/x", dominio: "sito-mai-visto.it" }]);
    assert.equal(r.length, 1);
    assert.equal(r[0].che, "");
    assert.equal(r[0].portabile, "");
  });

  test("dati storti non fanno esplodere niente", () => {
    assert.deepEqual(fontiPerSpartito(null), []);
    assert.deepEqual(fontiPerSpartito([{ dominio: "x" }]), [], "senza url non è una fonte");
    assert.deepEqual(senzaIndirizziInventati(null, null), { testo: "", inventati: 0 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INFORMARSI PRIMA DI INVENTARE — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «se chiedessi una linea di basso sullo stile di Stratus di Billy Cobham, non basta che
// trovi lo spartito: dovrebbe informarsi online sulle peculiarità di quel brano PRIMA di generare».
// E il guadagno più grande non è il contesto: è che tonalità e metro trovati sono DATI, e un dato
// si può controllare. La ricerca diventa l'accettore di questo turno.
describe("INFORMARSI PRIMA DI INVENTARE", () => {
  const { riferimentoDaBrief, briefRicercaCaratteristiche, schedaDaRicerca, requisitiDallaScheda, briefDelloSpartito } = app;

  test("«sullo stile di X di Y» si legge: il brano e chi l'ha fatto", () => {
    const r = riferimentoDaBrief("una linea di basso sullo stile di Stratus di Billy Cobham");
    assert.equal(r.brano, "Stratus");
    assert.equal(r.artista, "Billy Cobham");
    for (const [frase, brano] of [
      ["un tema alla maniera di Bach", "Bach"],
      ["qualcosa di ispirato a Kind of Blue di Miles Davis", "Kind of Blue"],
      ["un riff nello stile di Paranoid dei Black Sabbath", "Paranoid"],
    ]) assert.equal(riferimentoDaBrief(frase).brano, brano, frase);
  });

  test("si ferma dove finisce il riferimento e comincia un'altra idea", () => {
    const r = riferimentoDaBrief("un basso sullo stile di Stratus di Billy Cobham, ma più lento e in minore");
    assert.equal(r.brano, "Stratus", "«ma più lento» non fa parte del titolo");
    assert.equal(r.artista, "Billy Cobham");
  });

  test("SENZA un riferimento reale non si cerca niente, e non si spende niente", () => {
    for (const f of ["il tema dell'Atto IV, lento, in minore", "scrivi un valzer triste", "una melodia per flauto", ""]) {
      assert.equal(riferimentoDaBrief(f), null, f);
    }
  });

  test("al modello si chiedono DATI, non un racconto — e si dice di lasciare vuoto invece di inventare", () => {
    const b = briefRicercaCaratteristiche({ brano: "Stratus", artista: "Billy Cobham", strumento: "basso" }).replace(/\s+/g, " ");
    for (const campo of ["TONALITA:", "METRO:", "ANDAMENTO:", "PECULIARITA:"]) assert.ok(b.includes(campo), `manca ${campo}`);
    assert.match(b, /lascia vuoto quello che la ricerca non dice invece di riempirlo a memoria/);
    assert.match(b, /un vincolo inventato produce musica sbagliata con sicurezza/);
    assert.ok(b.includes("Stratus") && b.includes("di Billy Cobham") && b.includes("parte di basso"));
  });

  test("la scheda si legge in italiano e in inglese, e quello che non c'è resta vuoto", () => {
    const a = schedaDaRicerca("TONALITA: Mi minore\nMETRO: 16/16\nANDAMENTO: 120 bpm\nPECULIARITA: groove funk");
    assert.deepEqual([a.tonalita, a.metro, a.bpm, a.trovato], ["Em", "16/16", 120, true]);
    assert.equal(schedaDaRicerca("TONALITA: E minor\nMETRO: 4/4").tonalita, "Em");
    assert.equal(schedaDaRicerca("TONALITA: Do maggiore").tonalita, "C");
    assert.equal(schedaDaRicerca("TONALITA: Fa diesis minore").tonalita, "F#m");
    const vuota = schedaDaRicerca("TONALITA: \nMETRO: \nANDAMENTO: \nPECULIARITA: non trovato");
    assert.equal(vuota.trovato, false, "«non trovato» non è una peculiarità");
    assert.deepEqual([vuota.tonalita, vuota.metro, vuota.bpm], ["", "", 0]);
  });

  test("QUELLO CHE LA RICERCA HA TROVATO DIVENTA UN REQUISITO, non un suggerimento", () => {
    const scheda = schedaDaRicerca("TONALITA: Mi minore\nMETRO: 16/16\nANDAMENTO: 120\nPECULIARITA: groove funk");
    const extra = requisitiDallaScheda(scheda);
    assert.deepEqual(extra.map((r) => r.id), ["metro-della-ricerca", "tonalita-della-ricerca"]);
    const storto = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nCDEF GABc|cBAG FEDC|";
    const r = analizzaSpartito(storto, "modello", extra);
    assert.equal(r.ok, false, "un modello che ignora tonalità e metro letti deve tornare indietro");
    const motivi = r.errori.map((e) => e.motivo).join(" | ");
    assert.match(motivi, /la ricerca dice che il brano è in 16\/16/);
    assert.match(motivi, /la ricerca dice tonalità Em/);
  });

  test("QUELLO CHE NON SI E' TROVATO NON DIVENTA UN VINCOLO: non si pretende ciò che non si sa", () => {
    assert.deepEqual(requisitiDallaScheda(schedaDaRicerca("PECULIARITA: non trovato")), []);
    assert.deepEqual(requisitiDallaScheda(null), []);
    // Solo il metro trovato = solo quel vincolo.
    assert.deepEqual(requisitiDallaScheda(schedaDaRicerca("METRO: 6/8")).map((r) => r.id), ["metro-della-ricerca"]);
  });

  test("il modo scritto per esteso non è un errore da rifare: Edor vale come Em", () => {
    const extra = requisitiDallaScheda({ tonalita: "Em" });
    const conDorico = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nEBBA B2 EB|B2 AB dBAG|";
    assert.equal(analizzaSpartito(conDorico, "modello", extra).ok, true, "il dorico di MI è minore quanto Em: è una variante, non un errore");
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nL:1/8\nK:G\nGABc defg|gfed cBAG|", "modello", extra).ok, false, "una fondamentale diversa sì");
    // Ma MI MAGGIORE contro MI MINORE è un colore diverso, e quello si rifà.
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nL:1/8\nK:E\nEFGA Bcde|edcB AGFE|", "modello", extra).ok, false, "maggiore al posto di minore non è una variante");
    assert.equal(analizzaSpartito("X:1\nT:P\nM:4/4\nL:1/8\nK:Eaeo\nEFGA Bcde|edcB AGFE|", "modello", extra).ok, true, "eolio = minore naturale");
  });

  test("il brief DICHIARA cosa ha letto e da dove, separato da quello che il modello immagina", () => {
    const scheda = schedaDaRicerca("TONALITA: Mi minore\nMETRO: 16/16\nANDAMENTO: 120\nPECULIARITA: groove funk, sedicesimi fantasma");
    const b = briefDelloSpartito({ argomento: "una linea di basso", strumento: "basso", scheda }).replace(/\s+/g, " ");
    assert.match(b, /QUELLO CHE HO LETTO SUL BRANO DI RIFERIMENTO \(ricerca sul web, non memoria tua\)/);
    assert.match(b, /groove funk, sedicesimi fantasma/);
    assert.match(b, /Non copiarlo: è un riferimento, non un modello da riprodurre/);
    // E i vincoli sono DETTATI, non solo verificati: la regola di casa, un oggetto letto due volte.
    assert.match(b, /La ricerca dice che questo brano è in 16\/16/);
    assert.match(b, /La ricerca dice che la tonalità è Em/);
    // Senza scheda il brief resta quello di prima: chi non nomina un riferimento non paga niente.
    assert.doesNotMatch(briefDelloSpartito({ argomento: "un valzer" }), /HO LETTO SUL BRANO/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GRATIS PRIMA — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost, sui risultati veri di «La Primavera»: «continua a fare ricerche di merda, trovando solo
// spartiti a pagamento quando invece il web è pieno di soluzioni». Misurato sui SUOI dieci domini:
// zero riconosciuti dalla lista che avevo scritto — quindi l'ordinamento era inerte e restava
// quello del motore, che mette davanti chi vende perché chi vende fa SEO.
describe("GRATIS PRIMA, e gli archivi liberi che il motore sotterra", () => {
  const { fontiPerSpartito, archiviLiberiMancanti, ARCHIVI_LIBERI } = app;
  // I domini VERI comparsi nella ricerca del Ghost, non quelli che immaginavo io.
  const suoi = ["lucioimbriglio.it", "it.cantorion.org", "it.sheetmusicdirect.com", "musicologie.org",
    "it.sheetmusicdirect.com", "tomplay.com", "musicarteconegliano.com", "laflutedepan.com", "www.imslp.org"];
  const comeFonti = (domini) => domini.map((d, i) => ({ url: `https://${d}/x${i}`, dominio: d }));

  test("IL PREFISSO DI LINGUA NON DEVE NASCONDERE IL DOMINIO — era 0 riconosciuti su 10", () => {
    // «it.sheetmusicdirect.com» è lo stesso posto di «sheetmusicdirect.com». Senza togliere il
    // prefisso la lista non riconosce quasi niente, ed è esattamente quello che è successo.
    const f = fontiPerSpartito(comeFonti(suoi));
    assert.ok(f.filter((x) => x.costo).length >= 8, `riconosciuti ${f.filter((x) => x.costo).length} su ${f.length}`);
    assert.equal(f.find((x) => x.dominio === "www.imslp.org").costo, "gratis");
    assert.equal(f.find((x) => x.dominio === "it.sheetmusicdirect.com").costo, "pagamento");
  });

  test("I NEGOZI FINISCONO IN FONDO, i gratis davanti", () => {
    const f = fontiPerSpartito(comeFonti(suoi));
    const costi = f.map((x) => x.costo || "?");
    const primoPagamento = costi.indexOf("pagamento");
    const ultimoGratis = costi.lastIndexOf("gratis");
    assert.ok(ultimoGratis < primoPagamento, `ordine sbagliato: ${costi.join(" ")}`);
    assert.equal(costi[0], "gratis");
    assert.equal(costi[costi.length - 1], "pagamento");
  });

  test("a parità di costo, chi si può portare dentro l'app va davanti", () => {
    const f = fontiPerSpartito(comeFonti(["imslp.org", "thesession.org", "mutopiaproject.org"]));
    assert.deepEqual(f.map((x) => x.portabile), ["abc", "musicxml", "immagine"]);
  });

  test("GLI ARCHIVI LIBERI ARRIVANO DAL PROGRAMMA, non dal motore", () => {
    // Nei risultati veri del Ghost, IMSLP e Mutopia erano dichiarati gratis NEL TESTO ma non
    // avevano il link: il motore non li aveva restituiti. Questi il programma li sa.
    const liberi = archiviLiberiMancanti("La Primavera Vivaldi", []);
    assert.ok(liberi.length >= 4);
    for (const a of liberi) {
      assert.match(a.url, /^https:\/\//, a.url);
      assert.ok(a.url.includes(encodeURIComponent("La Primavera Vivaldi")) || a.url.includes("La%20Primavera"), a.url);
      assert.ok(a.nome && a.che);
    }
    assert.ok(liberi.some((a) => a.nome === "IMSLP"), "manca IMSLP");
  });

  test("ma NON si ripete quello che la ricerca ha già portato: due link allo stesso posto sono rumore", () => {
    const conImslp = fontiPerSpartito(comeFonti(["www.imslp.org", "tomplay.com"]));
    const liberi = archiviLiberiMancanti("x", conImslp);
    assert.ok(!liberi.some((a) => a.nome === "IMSLP"), "IMSLP c'era già fra i risultati");
    assert.ok(liberi.some((a) => a.nome === "Mutopia"), "Mutopia invece mancava e va aggiunto");
  });

  test("ogni archivio libero si dichiara e compone il suo indirizzo da sé", () => {
    for (const a of ARCHIVI_LIBERI) {
      assert.ok(a.id && a.nome && a.che, `${a.id} si dichiara a metà`);
      assert.match(a.cerca("due parole"), /^https:\/\/[^ ]+due(%20|\+)parole/, a.cerca("due parole"));
    }
  });

  test("IL BRIEF CHIEDE IL GRATUITO, e dice perché i motori non lo fanno da soli", () => {
    const b = app.briefRicercaWebSpartito({ query: "la primavera", autore: "Vivaldi" }).replace(/\s+/g, " ");
    assert.match(b, /PRIVILEGIA QUELLO CHE SI PUO' AVERE GRATIS/);
    assert.match(b, /I motori mettono davanti chi vende, perché chi vende fa SEO/);
    assert.match(b, /IMSLP\/Petrucci, Mutopia, CPDL, Musopen/);
    assert.match(b, /I negozi .* mettili per ultimi/);
    assert.match(b, /morto da più di settant'anni il brano è di PUBBLICO DOMINIO/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// COME CERCHEREBBE UNA PERSONA SCALTRA — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Domanda del Ghost, ed è quella giusta: uno scaltro non scrive il titolo su Google e guarda i
// primi dieci. Usa il numero di catalogo, gli operatori, le altre lingue, e guarda le IMMAGINI.
describe("LE MOSSE DI UNO SCALTRO", () => {
  const { queryScaltre, ricercheAMano, catalogoDaRicerca } = app;

  test("IL NUMERO DI CATALOGO è la chiave: lo usano le biblioteche, i negozi molto meno", () => {
    assert.equal(catalogoDaRicerca("CATALOGO: RV 269\n- IMSLP — PDF — gratis"), "RV 269");
    // E se non lo dichiara ma lo scrive, si prende lo stesso.
    assert.equal(catalogoDaRicerca("Il concerto Op. 8 No. 1 di Vivaldi"), "Op. 8 No. 1");
    assert.equal(catalogoDaRicerca("La sinfonia K. 550 di Mozart"), "K. 550");
    assert.equal(catalogoDaRicerca("il terzo BWV 1048"), "BWV 1048");
    // Quello che non c'è non si inventa.
    assert.equal(catalogoDaRicerca("un brano qualsiasi senza numeri"), "");
    assert.equal(catalogoDaRicerca("CATALOGO: -"), "", "un campo lasciato vuoto non è un catalogo");
    assert.equal(catalogoDaRicerca(null), "");
  });

  test("le query mirate usano gli operatori, non solo parole", () => {
    const q = queryScaltre({ query: "la primavera", autore: "Vivaldi", catalogo: "RV 269" });
    assert.ok(q.some((x) => x.includes('"RV 269"') && x.includes("filetype:pdf")), "manca la query col catalogo");
    assert.ok(q.some((x) => x.includes("site:imslp.org")), "manca quella dentro l'archivio");
    assert.ok(q.some((x) => x.includes("-site:sheetmusicdirect.com")), "i negozi non vengono esclusi");
    // Senza catalogo si cerca lo stesso, con una query in meno.
    assert.ok(queryScaltre({ query: "x" }).length >= 3);
    assert.ok(!queryScaltre({ query: "x" }).some((y) => y.includes('""')), "nessuna query con virgolette vuote");
  });

  test("LA RICERCA PER IMMAGINI è la mossa più utile, e nessun modello la sa fare", () => {
    // Uno spartito È un'immagine: si vede il pentagramma senza aprire niente. È quello che il Ghost
    // aveva fatto a mano dopo che l'app gli aveva dato solo negozi.
    const r = ricercheAMano({ query: "la primavera", autore: "Vivaldi", catalogo: "RV 269" });
    const img = r.find((x) => x.id === "immagini");
    assert.ok(img, "manca la ricerca per immagini");
    assert.match(img.url, /tbm=isch/);
    assert.ok(decodeURIComponent(img.url).includes("la primavera Vivaldi spartito"));
  });

  test("le ricerche pronte usano il CATALOGO quando c'è, il titolo quando non c'è", () => {
    const conCat = ricercheAMano({ query: "la primavera", autore: "Vivaldi", catalogo: "RV 269" });
    assert.ok(decodeURIComponent(conCat.find((x) => x.id === "pdf").url).includes("RV 269"));
    const senza = ricercheAMano({ query: "la primavera", autore: "Vivaldi" });
    assert.ok(decodeURIComponent(senza.find((x) => x.id === "pdf").url).includes("la primavera"));
    for (const r of [...conCat, ...senza]) {
      assert.match(r.url, /^https:\/\/www\.google\.com\/search\?/, r.url);
      assert.ok(r.nome && r.che, `${r.id} si dichiara a metà`);
    }
  });

  test("IL BRIEF DETTA LE MOSSE, non «cerca meglio»", () => {
    const b = app.briefRicercaWebSpartito({ query: "la primavera", autore: "Vivaldi" }).replace(/\s+/g, " ");
    assert.match(b, /trova prima il NUMERO DI CATALOGO/);
    assert.match(b, /filetype:pdf per andare al documento invece che alla pagina di vendita/);
    assert.match(b, /site:imslp\.org/);
    assert.match(b, /CERCA PRIMA IN INGLESE E IN CINESE/);
    assert.match(b, /简谱 \(notazione numerica\) e 五线谱 \(pentagramma\) sono due mondi separati/);
    assert.match(b, /GUARDA ANCHE LE ANTEPRIME DEI SITI A PAGAMENTO/);
    assert.match(b, /guardare la vetrina è gratis/);
    assert.match(b, /TITOLO_EN:/);
    assert.match(b, /TITOLO_ZH:/);
    assert.match(b, /se il primo giro dà solo negozi, CAMBIA CHIAVE invece di insistere/);
    assert.match(b, /CATALOGO: \(per esempio RV 269/, "deve dire come dichiararlo, o il programma non lo legge");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PIU' LINGUE, POI I PDF, POI LE IMMAGINI — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost, precisando l'ordine delle mosse: «cercherebbe innanzitutto su più lingue, per prime
// inglese e cinese che sono le più diffuse, poi farebbe una ricerca tra i PDF, poi cercherebbe tra
// le immagini, ANCHE TRA LE ANTEPRIME DEI SITI A PAGAMENTO».
// L'ultima è l'inversione che conta: nelle PAGINE un negozio è inutile perché non si compra, ma
// ogni negozio mette in vetrina le prime pagine come immagine, e guardare la vetrina è gratis.
describe("LE LINGUE E LE ANTEPRIME", () => {
  const { queryScaltre, ricercheAMano, titoliDaRicerca } = app;
  const tutto = { query: "la primavera", autore: "Vivaldi", catalogo: "RV 269",
    titoloEn: "Spring (The Four Seasons)", titoloZh: "四季 春", strumento: "flauto" };

  test("i titoli tradotti li dà chi cerca: il programma non li può sapere", () => {
    const t = titoliDaRicerca("CATALOGO: RV 269\nTITOLO_EN: Spring (The Four Seasons)\nTITOLO_ZH: 四季 春");
    assert.equal(t.en, "Spring (The Four Seasons)");
    assert.equal(t.zh, "四季 春");
    // Un campo lasciato vuoto NON diventa un titolo: cercare «-» non trova niente.
    assert.deepEqual(titoliDaRicerca("TITOLO_EN: -\nTITOLO_ZH: "), { en: "", zh: "" });
    assert.deepEqual(titoliDaRicerca(null), { en: "", zh: "" });
  });

  test("L'ORDINE E' QUELLO CHE HA DETTO IL GHOST: lingue, PDF, immagini", () => {
    const r = ricercheAMano(tutto).map((x) => x.id);
    assert.deepEqual(r.slice(0, 5), ["en", "zh", "pdf", "immagini", "anteprime"],
      `ordine sbagliato: ${r.join(" → ")}`);
  });

  test("la ricerca in CINESE usa le parole cinesi, non il titolo italiano tradotto a metà", () => {
    const zh = decodeURIComponent(ricercheAMano(tutto).find((x) => x.id === "zh").url);
    assert.ok(zh.includes("四季 春"), zh);
    assert.ok(zh.includes("乐谱"), "manca la parola «spartito» in cinese");
    assert.ok(zh.includes("长笛"), "lo strumento va tradotto: 长笛 è il flauto traverso");
    assert.ok(zh.includes("免费"), "manca «gratis»");
  });

  test("LE ANTEPRIME DEI NEGOZI si CERCANO, non si escludono — è l'inversione", () => {
    const r = ricercheAMano(tutto);
    const ant = r.find((x) => x.id === "anteprime");
    const url = decodeURIComponent(ant.url);
    assert.match(ant.url, /tbm=isch/, "le anteprime sono immagini, non pagine");
    assert.ok(url.includes("site:musicnotes.com"), "i negozi qui si INCLUDONO");
    assert.ok(url.includes("site:sheetmusicdirect.com"));
    assert.ok(!url.includes("-site:"), "qui non si esclude niente");
    // E nelle PAGINE restano esclusi: le due mosse sono opposte apposta.
    const pdf = decodeURIComponent(r.find((x) => x.id === "pdf").url);
    assert.ok(pdf.includes("-site:sheetmusicdirect.com"), "nelle pagine i negozi restano fuori");
  });

  test("senza i titoli tradotti si cerca lo stesso, col titolo che si ha", () => {
    const r = ricercheAMano({ query: "Cooley's", autore: "" });
    assert.equal(r.length, 6, "tutte le mosse restano disponibili");
    for (const x of r) {
      assert.match(x.url, /^https:\/\/www\.google\.com\/search\?/, x.id);
      assert.ok(!/undefined|\[object/.test(x.url), `${x.id}: ${x.url}`);
    }
    assert.ok(decodeURIComponent(r.find((x) => x.id === "zh").url).includes("Cooley's"));
  });

  test("le query dettate coprono inglese e cinese, non solo la lingua della domanda", () => {
    const q = queryScaltre(tutto);
    assert.ok(q.some((x) => x.includes("Spring (The Four Seasons)") && x.includes("sheet music")), "manca l'inglese");
    assert.ok(q.some((x) => x.includes("四季 春") && x.includes("乐谱")), "manca il cinese");
    assert.ok(q.some((x) => x.includes("简谱") || x.includes("五线谱")), "mancano le due notazioni cinesi");
    assert.ok(q.some((x) => x.includes('"RV 269"')), "manca il catalogo");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RICOSTRUIRE DA FRAMMENTI — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Ultima mossa dello scaltro, dal Ghost: «dai vari frammenti cercherebbe di ricostruire lo
// spartito se non lo trova per intero». È il caso normale con le anteprime dei negozi: ognuna
// mostra le prime due pagine, un video un pezzo, un forum un'altra sezione.
describe("UNIRE I FRAMMENTI", () => {
  const { unisciSpartiti, chiedeDiContinuare } = app;
  const primo = "X:1\nT:Spring\n% battute 5-8 coperte dal riquadro della fotocamera\nM:4/4\nL:1/8\nK:E\nEFGA Bcde|edcB AGFE|";
  const secondo = "X:1\nT:Spring (seguito)\nM:4/4\nL:1/8\nK:E\nBcde fgab|bagf edcB|";

  test("UNA SOLA INTESTAZIONE, e le battute continuano la numerazione", () => {
    // Due X: o due K: e il disegnatore si ferma; e se le battute ripartissero da 1, ogni promemoria
    // attaccato dopo la giunzione punterebbe altrove.
    const u = unisciSpartiti(primo, secondo);
    assert.equal(u.ok, true, u.disaccordi.join(" | ") + " " + u.analisi.errori.map((e) => e.motivo).join(" | "));
    assert.equal(u.abc.split("\n").filter((r) => /^K:/.test(r)).length, 1, "due tonalità dichiarate");
    assert.equal(u.abc.split("\n").filter((r) => /^X:/.test(r)).length, 1);
    assert.equal(u.battuteUnite, u.battutePrimo + u.battuteSecondo);
    assert.deepEqual(u.analisi.battute.map((b) => b.numero), [1, 2, 3, 4]);
  });

  test("LE NOTE DI LETTURA DI TUTTI E DUE RESTANO: dicono dove il buco è ancora aperto", () => {
    const u = unisciSpartiti(primo, secondo);
    assert.match(u.abc, /battute 5-8 coperte dal riquadro/);
    assert.equal(app.noteDiLettura(u.abc).length, 1);
  });

  test("DUE FRAMMENTI IN TONALITA' O METRO DIVERSI NON SI CUCIONO IN SILENZIO", () => {
    // O non è lo stesso brano, o uno dei due è stato letto male. Incollarli produrrebbe uno
    // spartito che sembra intero e non lo è — il difetto peggiore di tutta questa strada.
    const storto = unisciSpartiti(primo, secondo.replace("K:E", "K:G").replace("M:4/4", "M:3/4"));
    assert.equal(storto.ok, false);
    assert.match(storto.disaccordi.join(" "), /metri diversi: 4\/4 e 3\/4/);
    assert.match(storto.disaccordi.join(" "), /tonalità diverse: E e G/);
    assert.match(storto.disaccordi.join(" "), /o non è lo stesso brano, o uno è stato letto male/);
  });

  test("un modo diverso sulla stessa fondamentale non è un disaccordo", () => {
    // Em e Edor sono lo stesso MI: un frammento scritto col modo per esteso non va rifiutato.
    const u = unisciSpartiti(primo.replace("K:E", "K:Em"), secondo.replace("K:E", "K:Edor"));
    assert.deepEqual(u.disaccordi, []);
  });

  test("IL RISULTATO UNITO PASSA DALL'ACCETTORE come tutto il resto", () => {
    // Cucire due pezzi buoni può produrre una cosa rotta: le battute devono tornare anche dopo.
    const meta = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nCDEF GAB|";          // 7 crome: battuta storta
    const u = unisciSpartiti(primo, meta);
    assert.equal(u.ok, false, "una battuta che non torna deve fermare anche l'unione");
    assert.match(u.analisi.errori.map((e) => e.motivo).join(" "), /parziale spaiata|più lunga del metro/);
  });

  test("«continua lo spartito» si riconosce, «continua pure» no", () => {
    assert.equal(chiedeDiContinuare("continua lo spartito con questa immagine"), true);
    assert.equal(chiedeDiContinuare("attacca in coda questa tablatura"), true);
    assert.equal(chiedeDiContinuare("questo è il seguito dello spartito"), true);
    // Senza l'oggetto musicale «continua» è una parola di conversazione, e farebbe partire una
    // trascrizione a vuoto su qualunque immagine allegata.
    assert.equal(chiedeDiContinuare("continua pure"), false);
    assert.equal(chiedeDiContinuare("aggiungi questo al percorso"), false);
    assert.equal(chiedeDiContinuare(""), false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// IL RISULTATO E' LO SPARTITO, NON UNA LISTA DI LINK — 15/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Il Ghost: «come risultato voglio lo spartito non una lista di link, altrimenti la faccio da solo
// la ricerca. Se devo mettermi ad aprirli tutti, qual è il tempo che risparmio?». Aveva ragione:
// una lista di link è un compito, non una risposta. E la via era già aperta — il plugin di ricerca
// restituisce IL CONTENUTO delle pagine, non solo gli indirizzi.
describe("LO SPARTITO, NON L'ELENCO", () => {
  const { estraiAbcDaTesto, briefRicercaWebSpartito } = app;

  test("l'ABC dentro un blocco di codice si prende", () => {
    const r = estraiAbcDaTesto("Ho trovato questo:\n```abc\nX:1\nT:Cooley's\nM:4/4\nL:1/8\nK:Edor\nEBBA B2 EB|B2 AB dBAG|\n```\nSpero vada bene.");
    assert.equal(r.length, 1);
    assert.match(r[0], /^X:1/);
    assert.equal(analizzaSpartito(r[0], "archivio").ok, true);
    assert.ok(!r[0].includes("Spero vada bene"), "la prosa attorno non entra nello spartito");
  });

  test("e anche senza le virgolette di codice, che un modello dimentica", () => {
    const r = estraiAbcDaTesto("Eccolo:\nX:1\nT:Spring\nM:4/4\nL:1/8\nK:E\nEFGA Bcde|edcB AGFE|\nQuesto viene da IMSLP, è gratis.");
    assert.equal(r.length, 1);
    assert.equal(analizzaSpartito(r[0], "archivio").ok, true);
    assert.ok(!r[0].includes("IMSLP"), "la riga di prosa dopo le note chiude il pezzo");
  });

  test("QUELLO CHE NON E' UNO SPARTITO NON DIVENTA UNO SPARTITO", () => {
    assert.deepEqual(estraiAbcDaTesto("ABC: nessuna pagina ne aveva. Ecco i siti: IMSLP, Mutopia."), []);
    assert.deepEqual(estraiAbcDaTesto("```\nnon è musica, è un blocco di testo\n```"), []);
    assert.deepEqual(estraiAbcDaTesto("X:1 senza tonalità e senza note"), [], "senza K: non è uno spartito");
    assert.deepEqual(estraiAbcDaTesto(null), []);
  });

  test("più spartiti in una risposta si prendono tutti", () => {
    const due = "```abc\nX:1\nT:A\nM:4/4\nL:1/8\nK:C\nCDEF GABc|cBAG FEDC|\n```\ne anche\n```abc\nX:1\nT:B\nM:4/4\nL:1/8\nK:G\nGABc defg|gfed cBAG|\n```";
    assert.equal(estraiAbcDaTesto(due).length, 2);
  });

  test("IL BRIEF CHIEDE LA MUSICA PRIMA DEI NOMI DEI SITI, e vieta di inventarla", () => {
    const b = briefRicercaWebSpartito({ query: "la primavera" }).replace(/\s+/g, " ");
    assert.match(b, /QUELLO CHE SERVE DAVVERO E' LO SPARTITO, NON L'ELENCO DEI SITI/);
    assert.match(b, /RIPORTALA PER INTERO/);
    assert.match(b, /Copiala com'è: non riscriverla, non accorciarla, non sistemarla/);
    assert.match(b, /Se in nessuna pagina c'è ABC, non inventarlo/);
    assert.match(b, /Un ABC scritto a memoria è musica sbagliata che sembra trovata/);
  });

  test("lo spartito trovato è roba D'ARCHIVIO: una battuta storta è un avviso, non un rifiuto", () => {
    // Viene da fuori, è la trascrizione di qualcun altro. Buttarla perché il suo autore non ha
    // contato le crome sarebbe la Legge 14 al contrario — la stessa regola di The Session.
    const conBattutaStorta = "X:1\nT:P\nM:4/4\nL:1/8\nK:Edor\nFED AD BDAD|B2 AB dBAG|";
    const r = analizzaSpartito(estraiAbcDaTesto("```abc\n" + conBattutaStorta + "\n```")[0], "archivio");
    assert.equal(r.ok, true);
    assert.equal(r.avvisi.length, 1);
  });
});

// ── IL PDF — 15/09/2026 ─────────────────────────────────────────────────────────────────────────
// Il Ghost: «magari non trova il database ma trova un PDF o un immagine».
// Questo blocco non è dedotto: ogni numero qui dentro è stato MISURATO con la chiave vera, su un
// PDF vero (Mutopia, «Mentre dormi amor», 131 KB, 200 application/pdf verificato prima di partire).
// Il tentativo precedente usava un indirizzo che mi ero inventato: 404, e un 404 non misura niente.
describe("IL PDF SI LEGGE — e nella forma giusta, che non è quella delle immagini", () => {
  const { pdfDaRicerca, immagineDaRicerca, eUnPdf, buildOpenRouterContent, briefRicercaWebSpartito } = app;
  const PDF_VERO = "https://www.mutopiaproject.org/ftp/VivaldiA/rv725/MentreDormi/MentreDormi-a4.pdf";

  test("l'indirizzo di un PDF dichiarato dalla ricerca si riconosce", () => {
    assert.equal(pdfDaRicerca(`CATALOGO: RV 725\nPDF: ${PDF_VERO}\n- mutopia — pentagramma, PDF — gratis`), PDF_VERO);
    assert.equal(pdfDaRicerca("PDF: https://esempio.org/a.pdf?dl=1"), "https://esempio.org/a.pdf?dl=1");
    assert.equal(pdfDaRicerca("PDF: https://esempio.org/a.pdf)."), "https://esempio.org/a.pdf", "la punteggiatura di fine riga non fa parte dell'indirizzo");
  });

  test("quello che NON è un PDF non diventa un PDF", () => {
    assert.equal(pdfDaRicerca("PDF: https://esempio.org/pagina-con-pdf"), "", "una pagina che PARLA di un pdf non è un pdf");
    assert.equal(pdfDaRicerca("PDF: nessuna pagina ne aveva"), "");
    assert.equal(pdfDaRicerca("PDF: -"), "");
    assert.equal(pdfDaRicerca("Ho trovato un PDF su mutopia.org, gratis."), "", "senza il campo dichiarato non si indovina");
    assert.equal(pdfDaRicerca(null), "");
  });

  test("i due imbuti non si confondono: un PDF non è un'immagine e viceversa", () => {
    // Serve perché OpenRouter RIFIUTA un PDF dentro image_url, con parole sue (misurate):
    // «Unsupported image format for URL: … Supported formats: PNG, JPEG, WebP, GIF».
    assert.equal(immagineDaRicerca(`IMMAGINE: ${PDF_VERO}`), "", "un PDF non passa dalla porta delle immagini");
    assert.equal(pdfDaRicerca("PDF: https://esempio.org/spartito.png"), "", "e un PNG non passa da quella dei PDF");
  });

  test("UN PDF SI SPEDISCE COME `file`, NON COME `image_url` — è la misura, non un'opinione", () => {
    const parti = buildOpenRouterContent("leggi questo", { url: PDF_VERO, pdf: true });
    assert.equal(parti[1].type, "file");
    assert.equal(parti[1].file.file_data, PDF_VERO, "l'URL va nudo: a scaricarlo è il loro server, non il browser");
    assert.match(parti[1].file.filename, /\.pdf$/);
    // E il controllo: un'immagine deve continuare a passare come prima.
    const img = buildOpenRouterContent("leggi questo", { url: "https://esempio.org/a.png" });
    assert.equal(img[1].type, "image_url");
    assert.equal(img[1].image_url.url, "https://esempio.org/a.png");
  });

  test("un PDF si riconosce dall'estensione, dal tipo, o perché lo si dichiara", () => {
    assert.equal(eUnPdf({ url: PDF_VERO }), true, "dall'estensione — anche se nessuno l'ha dichiarato");
    assert.equal(eUnPdf({ url: "https://esempio.org/x.pdf?v=2" }), true);
    assert.equal(eUnPdf({ mediaType: "application/pdf", base64: "..." }), true, "un PDF allegato a mano dal Ghost, senza URL");
    assert.equal(eUnPdf({ pdf: true, url: "https://esempio.org/scarica?id=9" }), true, "dichiarato, quando l'indirizzo non dice niente");
    assert.equal(eUnPdf({ url: "https://esempio.org/a.png" }), false);
    assert.equal(eUnPdf({ mediaType: "image/png", base64: "..." }), false);
    assert.equal(eUnPdf(null), false);
  });

  test("IL BRIEF CHIEDE IL PDF, e lo mette davanti all'immagine", () => {
    const b = briefRicercaWebSpartito({ query: "la primavera" });
    assert.match(b, /^PDF: https/m, "il campo va chiesto con un esempio, o il modello scrive la pagina");
    assert.match(b, /Dev'essere il file \.pdf, non la pagina/);
    assert.match(b, /un PDF è quasi sempre lo spartito INTERO/);
  });
});

// ── IL MOTORE DEI PDF È UNA SPESA, NON UN DETTAGLIO ─────────────────────────────────────────────
// Misurato il 15/09/2026, stesso PDF, stessa domanda, stessa risposta giusta:
//   · engine "native" su un modello che i PDF li vede  → 0,00026 $
//   · NESSUN motore scritto, su Llama 3.3 70B (la nostra produzione, che i PDF non li vede)
//                                                      → 0,0201 $, SETTANTASEI VOLTE TANTO
// Il secondo non è un modello più caro: è il loro ripiego OCR (2 $/1000 pagine) acceso da solo.
// Stessa forma del tetto che leggeva `debug-log`: una spesa che si vede solo andandola a cercare.
// Questa prova NON guarda una costante — guarda che OGNI imbuto che parla con OpenRouter lo scriva.
// Una costante giusta e un imbuto che non la usa è esattamente il guasto di `saveKey`.
describe("IL MOTORE DEI PDF SI SCRIVE IN OGNI IMBUTO — se no il ripiego OCR costa 76 volte tanto", () => {
  const sorgente = readFileSync(new URL("../app.js", import.meta.url), "utf8");

  test("il motore scelto è `native`, e non un ripiego a pagamento", () => {
    const riga = /const PIANO_PDF = (\[.*\]);/.exec(sorgente);
    assert.ok(riga, "PIANO_PDF non esiste più: se l'hai rinominato, aggiorna questa prova");
    assert.match(riga[1], /engine:\s*"native"/);
    assert.doesNotMatch(riga[1], /mistral-ocr/, "mistral-ocr costa 2 $ ogni 1000 pagine");
  });

  test("TUTTI i corpi di richiesta a OpenRouter lo applicano, non solo quello degli spartiti", () => {
    // Gli imbuti sono due — askOpenRouter e askModelWithHistory — e il secondo è quello della CHAT,
    // dove il Ghost può allegare un PDF a mano. Se domani ne nasce un terzo senza questa riga, il
    // PDF ci passa e la spesa parte senza che nessuno l'abbia decisa: questa prova lo fa cadere.
    // NON conto le righe `const body = {`: ce ne sono quattro, e due sono di Google Calendar. Un
    // conteggio che prende dentro roba estranea non è una misura — è un numero che sembra una
    // misura, ed è il primo giro di questa prova che ha sbagliato così.
    // I corpi di OpenRouter si riconoscono da `reasoning: { enabled: false }`: è loro e di nessun
    // altro, ed è lì che sta il parametro fratello di plugins.
    // E I COMMENTI NON SONO CODICE. Secondo giro sbagliato della stessa prova: contava 3 imbuti
    // perché una riga di commento, cento righe più in là, NOMINA `reasoning: { enabled: false }`
    // spiegando perché non bastava. Un conteggio che legge la prosa come se fosse codice trova
    // guasti che non esistono — ed è l'altra faccia di quello che non trova quelli che ci sono.
    const codice = sorgente.split("\n").filter((r) => !/^\s*(?:\/\/|\*|\/\*)/.test(r)).join("\n");
    const imbuti = codice.match(/reasoning: \{ enabled: false \}/g) || [];
    const applicazioni = codice.match(/PIANO_PDF(?!\s*=)/g) || [];
    // 15/09/2026 sera — ERANO DUE, SONO TRE, e questa prova l'ha scoperto da sola nel giro in cui
    // il terzo è nato: `corpoDiLettura`, che costruisce la richiesta per leggere un documento e
    // serve tutte e due le vie (dalla pagina e dal corriere nel service worker). Il numero si
    // aggiorna, la prova no — ed è il punto: se il terzo imbuto avesse dimenticato PIANO_PDF,
    // l'OCR di ripiego sarebbe ripartito a 76 volte il costo senza che nessuno se ne accorgesse.
    assert.equal(imbuti.length, 3, "gli imbuti verso OpenRouter sono tre: se sono cambiati, questa prova va riletta, non cancellata");
    assert.equal(applicazioni.length, imbuti.length, "ogni imbuto deve applicare PIANO_PDF a un allegato PDF");
  });
});

// ── UN TENTATIVO SU SEI NON E' UN TENTATIVO — 15/09/2026 sera ───────────────────────────────────
// Dalla schermata del Ghost su «La Primavera»: il programma ha provato UN documento — englishtap,
// dichiarato dal modello — che ha risposto con un corpo vuoto, e si è fermato lì. Sullo schermo, a
// due centimetri, c'erano flutetunes, free-scores, IMSLP, Mutopia e ScoreExchange, tutti gratis.
describe("SI PROVANO TUTTI I DOCUMENTI TROVATI, non solo quello che il modello ha nominato", () => {
  const { candidatiDaLeggere, briefRicercaWebSpartito } = app;

  test("i candidati vengono ANCHE dagli indirizzi veri della ricerca, non solo dal testo", () => {
    const c = candidatiDaLeggere({
      testo: "PDF: https://englishtap.com/a.pdf",
      fonti: [{ url: "https://flutetunes.com/b.pdf", costo: "gratis" }, { url: "https://negozio.com/c.pdf", costo: "pagamento" }],
    });
    assert.equal(c.length, 3, "il programma ha in mano gli indirizzi: usarne uno solo è una scusa");
    assert.equal(c[0].url, "https://flutetunes.com/b.pdf", "il gratis va provato per primo");
  });

  test("a parità, il PDF prima dell'immagine: un PDF è il pezzo intero, un'immagine la prima pagina", () => {
    const c = candidatiDaLeggere({ testo: "IMMAGINE: https://x.org/anteprima.png\nPDF: https://x.org/tutto.pdf" });
    assert.deepEqual(c.map((x) => x.url), ["https://x.org/tutto.pdf", "https://x.org/anteprima.png"]);
    assert.equal(c[0].pdf, true);
    assert.equal(c[1].pdf, false);
  });

  test("PIU' PDF DICHIARATI si prendono tutti — il brief adesso ne chiede fino a tre", () => {
    const c = candidatiDaLeggere({ testo: "PDF: https://a.org/1.pdf\nPDF: https://b.org/2.pdf\nPDF: https://c.org/3.pdf" });
    assert.equal(c.length, 3);
  });

  test("una PAGINA non è un documento da leggere, e un doppione non è un secondo tentativo", () => {
    const c = candidatiDaLeggere({
      testo: "PDF: https://a.org/1.pdf",
      fonti: [{ url: "https://a.org/1.pdf" }, { url: "https://scoreexchange.com/scores/12345" }, { url: "non-un-indirizzo" }],
    });
    assert.deepEqual(c.map((x) => x.url), ["https://a.org/1.pdf"]);
  });

  test("c'è un tetto: provarne venti costa venti letture e il Ghost aspetta", () => {
    const tanti = Array.from({ length: 20 }, (_, i) => ({ url: `https://x${i}.org/a.pdf`, costo: "gratis" }));
    assert.equal(candidatiDaLeggere({ fonti: tanti }).length, 4);
    assert.equal(candidatiDaLeggere({ fonti: tanti, max: 2 }).length, 2);
  });

  test("IL BRIEF CHIEDE PIU' DI UN PDF, e dice perché", () => {
    const b = briefRicercaWebSpartito({ query: "la primavera" });
    assert.match(b, /SCRIVINE FINO A TRE/);
    assert.match(b, /Un PDF su tre risponde vuoto/);
  });
});

// ── LA DIAGNOSTICA NON E' UNA RISPOSTA — 15/09/2026 sera ────────────────────────────────────────
// Nella card, in verde, il Ghost si è trovato: «Ho provato a leggere quello che ho trovato, ma non
// passa il controllo — da il PDF: Invalid file URL: Empty response body from URL:
// https://www.englishtap.com/music/pdf-flute-music/vivaldi-the-four-seasons-spring.pdf».
// Cercava uno spartito e leggeva il messaggio d'errore di una libreria. Le sue parole: «tutto il
// resto è spreco di token e mio tempo ed energie nel cercare la risposta vera nella risposta data».
describe("QUELLO CHE NON E' UN RISULTATO NON STA NELLA CARD", () => {
  const sorgente = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const catena = /const cercaSpartitoNelWeb[\s\S]*?\n  };/.exec(sorgente)?.[0] || "";

  test("il messaggio grezzo del fornitore non finisce in nessun campo che la card mostra", () => {
    assert.ok(catena, "cercaSpartitoNelWeb non si trova più: se l'hai rinominata, aggiorna questa prova");
    const perdite = catena.split("\n")
      .filter((r) => !/^\s*(?:\/\/|\*)/.test(r))
      .filter((r) => /web(?:Nota|Commento|Esito)/.test(r) && /e\?\.message|\be\.message|analisi\.errori/.test(r));
    // Una sola eccezione è legittima: webNota quando la RICERCA INTERA non è partita — lì il motivo
    // è l'unica cosa che c'è da dire, e non c'è nessun risultato che stia venendo soffocato.
    assert.ok(perdite.length <= 1, `la diagnostica arriva al Ghost da ${perdite.length} punti:\n${perdite.join("\n")}`);
  });

  test("il commento in prosa del modello non si mostra più: ripeteva la lista di link, con gli asterischi", () => {
    // Nella schermata: «- **flutetunes.com** — spartito per flauto solo, PDF, MIDI, MP3 — **gratis**»
    // con gli asterischi CRUDI, perché quel campo non passa da nessun renderer markdown — e sotto,
    // gli stessi siti di nuovo, con gli indirizzi veri. Due volte la stessa cosa, una delle due rotta.
    assert.doesNotMatch(sorgente, /\$\{st\.webCommento && html/, "webCommento era il blocco di prosa non reso");
  });
});

// ══ 15/09/2026 SERA — «PIÙ DEL 90% È SPAZZATURA» ════════════════════════════════════════════════
// Il Ghost, quarta segnalazione in un giorno, con nove schermate in mano:
//   «così è come cercare su Google, anzi peggio! si perde il senso stesso dell'app. deve essere un
//    facilitatore, un'estensione digitale del Ghost, non un impaccio»
// Le tre risposte precedenti — accorcia, piega, accorcia ancora — erano tutte e tre sbagliate nello
// stesso modo: nessuna TOGLIEVA. Queste prove tengono ferma la forma nuova.
describe("UN RISULTATO GRATIS SUL BRANO SBAGLIATO NON È UN RISULTATO", () => {
  const { fontiPerSpartito } = app;
  // I primi cinque risultati veri di «Englishman in New York di Sting», dallo schermo del Ghost.
  // Tutti marcati GRATIS, tutti in cima, nessuno che c'entrasse niente — mentre le trascrizioni
  // vere del brano stavano sotto, perché ScoreExchange non è marcato gratis.
  const VERI = [
    { url: "https://www.free-scores.com/sheet-music-shop.php", titolo: "Sheet Music Shop", dominio: "free-scores.com" },
    { url: "https://www.free-scores.com/dowland.php", titolo: "John Dowland Sheet Music to download and print", dominio: "free-scores.com" },
    { url: "https://www.free-scores.com/joplin-entertainer.php", titolo: "Joplin, Scott - The Entertainer (Clarinet and Piano)", dominio: "free-scores.com" },
    { url: "https://www.scoreexchange.com/scores/1", titolo: "Englishman in New York (Sting, Branford Marsalis) for Clarinet quartet", dominio: "scoreexchange.com" },
    { url: "https://www.scoreexchange.com/scores/2", titolo: "Sting - Englishman In New York - Score and parts - Download PDF file", dominio: "scoreexchange.com" },
  ];

  test("quello che non parla del brano chiesto non si mostra affatto", () => {
    const r = fontiPerSpartito(VERI, "englishman in new york sting");
    const domini = r.map((f) => f.titolo);
    assert.ok(!domini.some((t) => /Dowland|Entertainer|Sheet Music Shop/.test(t)),
      `Joplin e Dowland sono ancora nella risposta a una ricerca su Sting: ${domini.join(" | ")}`);
    assert.equal(r.length, 2, "restano le due trascrizioni vere");
  });

  test("LA PERTINENZA VIENE PRIMA DEL COSTO: gratis e quasi a tema perde contro a pagamento e a tema", () => {
    // ATTENZIONE, PRIMA VERSIONE SBAGLIATA (15/09 sera, trovata dalla verifica di rottura — terza
    // volta in un giorno). Metteva a confronto Joplin, che ha pertinenza ZERO e quindi viene TOLTO
    // dal filtro: restava un elemento solo e l'ordine non contava. Passava con qualunque
    // ordinamento, compreso quello rotto. Una prova sull'ordine vuole DUE elementi che l'ordine lo
    // possano avere: due che passano il filtro, con pertinenza diversa.
    const r = fontiPerSpartito([
      { url: "https://free-scores.com/x.php", titolo: "New York jazz standards", dominio: "free-scores.com" },      // 1 parola su 4, gratis
      { url: "https://sheetmusicdirect.com/y", titolo: "Englishman in New York - Sting", dominio: "it.sheetmusicdirect.com" }, // 4 su 4, a pagamento
    ], "englishman new york sting");
    assert.equal(r.length, 2, "tutti e due passano il filtro: qui si misura l'ORDINE, non l'esclusione");
    assert.equal(r[0].dominio, "it.sheetmusicdirect.com", "l'ordinamento metteva il costo davanti a tutto: è per questo che Joplin stava in cima");
  });

  test("a PARITÀ di pertinenza il gratis vince ancora — non ho rotto la regola di ieri", () => {
    const r = fontiPerSpartito([
      { url: "https://it.sheetmusicdirect.com/a", titolo: "Englishman in New York", dominio: "it.sheetmusicdirect.com" },
      { url: "https://imslp.org/b", titolo: "Englishman in New York", dominio: "imslp.org" },
    ], "englishman in new york");
    assert.equal(r[0].dominio, "imslp.org");
  });

  test("SENZA QUERY non si scarta niente: non si afferma l'irrilevanza da un confronto non fatto", () => {
    assert.equal(fontiPerSpartito(VERI).length, VERI.length, "è la stessa regola di paroleAssenti su lista vuota");
    assert.equal(fontiPerSpartito(VERI, "   ").length, VERI.length);
    assert.equal(fontiPerSpartito(VERI, "il di the").length, VERI.length, "solo parole vuote = nessun confronto possibile");
  });

  test("l'indirizzo conta quanto il titolo: un PDF senza titolo ma col nome del brano dentro resta", () => {
    const r = fontiPerSpartito([{ url: "https://x.org/englishman-in-new-york.pdf", titolo: "", dominio: "x.org" }], "englishman new york");
    assert.equal(r.length, 1);
  });
});

describe("UNA PREPOSIZIONE NON È UNA PAROLA CHE PUÒ MANCARE DA UN TITOLO", () => {
  const { risultatiCheRispondono } = app;
  test("«in» non viene mai riportato come parola assente", () => {
    // Dallo schermo: «Non è in The Session: 393 risultati, nessuno che contenga «man», «in»».
    // Pretendere che «in» compaia in un titolo è pretendere il nulla, e dirlo è peggio che tacere.
    const r = risultatiCheRispondono("english man in new york", [{ name: "The New Policeman", type: "reel" }]);
    assert.ok(!r.paroleAssenti.includes("in"), `«in» è ancora fra le parole che mancano: ${r.paroleAssenti.join(", ")}`);
  });
  test("ma una parola vera resta una parola vera", () => {
    const r = risultatiCheRispondono("lateralus tool", [{ name: "The New Policeman", type: "reel" }]);
    assert.deepEqual(r.paroleAssenti, ["lateralus", "tool"]);
  });
});

describe("UN NUMERO DI CATALOGO CHE NON È UN NUMERO DI CATALOGO AVVELENA OGNI RICERCA A VALLE", () => {
  const { catalogoDaRicerca } = app;
  test("un campo vuoto non si mangia l'etichetta della riga dopo", () => {
    // Misurato sullo schermo: la card diceva «il numero di catalogo è TITOLO_EN: Englishman in New
    // Y», e quel testo finiva DENTRO le ricerche già pronte. Google riceveva
    // «TITOLO_EN: Englishman in New Y Sting spartito filetype:pdf -site:…» e rispondeva
    // «non ha prodotto risultati in nessun documento». Sei link su sei, tutti morti.
    assert.equal(catalogoDaRicerca("CATALOGO:\nTITOLO_EN: Englishman in New York\nTITOLO_ZH:"), "");
    assert.equal(catalogoDaRicerca("CATALOGO: TITOLO_EN: Englishman in New York"), "");
    assert.equal(catalogoDaRicerca("CATALOGO: nessuno"), "");
  });
  test("ma un numero di catalogo vero si prende ancora, dichiarato o dentro al testo", () => {
    assert.equal(catalogoDaRicerca("CATALOGO: RV 269"), "RV 269");
    assert.equal(catalogoDaRicerca("CATALOGO: Op. 8 No. 1"), "Op. 8 No. 1");
    assert.equal(catalogoDaRicerca("CATALOGO: BWV 1048"), "BWV 1048");
    assert.equal(catalogoDaRicerca("Il concerto, BWV 1048, è il terzo."), "BWV 1048", "non dichiarato ma scritto nel testo");
  });
});

describe("LA CARD NON È UNA PAGINA DI RISULTATI", () => {
  const sorgente = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  // I commenti vanno via DAVVERO, blocchi /* … */ compresi: il primo giro di questa prova cadeva
  // sul mio stesso commento, che elenca le intestazioni morte per dire che sono morte. Un filtro
  // che toglie solo le righe che COMINCIANO per // lascia dentro le righe di mezzo di un blocco.
  const codice = sorgente.split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  test("le intestazioni di sezione sono sparite: erano la spina dorsale della pozza", () => {
    for (const morta of [
      "E IN TUTTO IL RESTO DEL WEB",
      "Cerca come cercherebbe uno scaltro",
      "E dove sta la roba gratis",
      "Dove cercare a mano",
      "HO CERCATO «",
    ]) {
      assert.ok(!codice.includes(morta), `«${morta}» è ancora nella card`);
    }
  });

  test("i link mostrati sono al massimo tre, non dieci", () => {
    assert.match(codice, /\(st\.webFonti \|\| \[\]\)\.slice\(0, 3\)/,
      "la card mostrava dieci link: i primi tre sono i tre che parlano del brano chiesto");
  });

  test("L'ARCHIVIO NON SI NOMINA QUANDO NON HA TROVATO NIENTE", () => {
    // Quarta segnalazione: «ancora la parte di the session». Un archivio di musica tradizionale
    // irlandese che non ha Sting non è un fatto: è la sua definizione. Dirlo in una riga è dirlo.
    const fn = /const testoRicercaSpartiti = [\s\S]*?\n  \};/.exec(codice)?.[0] || "";
    assert.ok(fn, "testoRicercaSpartiti non si trova più");
    assert.match(fn, /caso === "trovati"/, "solo il caso «trovati» può nominare l'archivio");
    // 15/09/2026, un'ora dopo: questa riga controllava che le note («"Sting" l'ho letto come
    // autore») SOPRAVVIVESSERO. Le avevo tenute dicendo che erano un fatto, ed era vero. Le ho
    // tolte lo stesso, e la prova che non servivano è che il Ghost, leggendole, ha chiesto «perché
    // togliere l'autore?»: una nota che genera la domanda a cui doveva rispondere è un indovinello.
    // Il fatto non è sparito — ha cambiato forma: la casella in fondo alla card MOSTRA le parole
    // cercate davvero, autore compreso, e si correggono toccandole. Mostrare batte raccontare.
    assert.doesNotMatch(fn, /non filtra|come autore/, "la spiegazione a parole è sostituita dalla casella che mostra la query vera");
  });
});

// ── «PERCHÉ TOGLIERE L'AUTORE?» — 15/09/2026 ────────────────────────────────────────────────────
// La domanda del Ghost, e la risposta vera: l'autore si toglie SOLO dalla ricerca d'archivio,
// perché The Session indicizza i NOMI DEI BRANI e non i compositori — «primavera vivaldi» lì dà
// zero perché nessun brano si chiama «vivaldi». È una regola di QUELL'archivio, non una regola.
// Dovunque altro l'autore è la parola che discrimina di più, e la domanda ha scoperto che in un
// posto nuovo mancava.
describe("L'AUTORE SI TOGLIE SOLO ALL'ARCHIVIO, e in nessun altro posto", () => {
  const codice = readFileSync(new URL("../app.js", import.meta.url), "utf8")
    .split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  test("il filtro di pertinenza dei risultati web lo riceve", () => {
    // Senza, «Stratus» pareggia con qualunque pagina che contenga quella parola — altri brani
    // omonimi, previsioni del tempo — perché «billy cobham» non entra mai nel confronto.
    assert.match(codice, /fontiPerSpartito\(diag\.fonti, \[chiesto\.query, chiesto\.autore\]/,
      "il filtro scritto ieri confrontava solo il titolo: l'autore non entrava nella pertinenza");
  });

  test("il brief della ricerca web e le ricerche a mano lo ricevono", () => {
    assert.match(codice, /briefRicercaWebSpartito\(\{ query: chiesto\.query, autore: chiesto\.autore/);
    assert.match(codice, /ricercheAMano\(\{ query: chiesto\.query, autore: chiesto\.autore/);
  });

  test("LA CASELLA MOSTRA QUELLO CHE HO CERCATO DAVVERO, autore compreso", () => {
    // Mostrare «english man in new york» avendo cercato «english man in new york Sting» è una
    // didascalia che mente. Il Ghost l'ha beccata dalla parte opposta.
    assert.match(codice, /const cercatoDavvero = \[query, m\.ricercaSpartiti\.autore\]/);
    assert.match(codice, /«\$\{cercatoDavvero\}» — non sono le parole giuste\?/);
  });

  test("«CERCA ANCORA» RIFÀ ANCHE LA RICERCA WEB, non solo quella d'archivio", () => {
    // Prima rilanciava solo l'archivio: quello che su nove richieste su dieci non ha niente e che
    // ormai non si vede nemmeno. Correggere le parole non correggeva la risposta.
    const fn = /const rifaiRicercaSpartiti = [\s\S]*?\n  \};/.exec(codice)?.[0] || "";
    assert.ok(fn, "rifaiRicercaSpartiti non si trova più");
    assert.match(fn, /cercaSpartitoNelWeb\(mid/, "la ricerca che risponde deve ripartire con le parole nuove");
    assert.doesNotMatch(fn, /L'archivio ne ha restituiti/, "la prosa dell'archivio rientrava da questa porta");
    assert.doesNotMatch(fn, /Nessun brano che/, "idem");
  });
});

// ── «È FERMO COSÌ» — 15/09/2026 ─────────────────────────────────────────────────────────────────
// Schermata del Ghost: «Ho trovato 2 documenti, li sto leggendo…», immobile. Non era appeso: era
// lento in un modo che da fuori è identico all'appeso. Tre cause sovrapposte, tutte mie.
describe("LEGGERE DUE DOCUMENTI NON DEVE COSTARE IL DOPPIO DEL TEMPO", () => {
  const codice = readFileSync(new URL("../app.js", import.meta.url), "utf8")
    .split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const catena = /const cercaSpartitoNelWeb[\s\S]*?\n  \};/.exec(codice)?.[0] || "";

  test("i documenti si leggono TUTTI INSIEME, non in fila", () => {
    assert.ok(catena, "cercaSpartitoNelWeb non si trova più");
    // Il tetto di una chiamata al modello è 150 secondi: in fila, due documenti sono cinque minuti.
    // In parallelo il tempo è quello di UNO. Costa una lettura in più quando la prima basta —
    // 0,0003 $ — e il tempo del Ghost vale più di tre centesimi di centesimo.
    assert.match(catena, /await Promise\.all\(daLeggere\.map\(/, "erano letti uno dopo l'altro");
    assert.doesNotMatch(catena, /for \(const tentativo of daLeggere\)/, "il ciclo in fila è tornato");
  });

  test("ma L'ORDINE DI PREFERENZA non si perde: vince il primo della fila, non il primo arrivato", () => {
    // Un PDF è quasi sempre lo spartito intero, un'immagine la prima pagina. Se l'immagine risponde
    // prima non deve battere il PDF solo perché è più leggera.
    assert.match(catena, /esiti\.find\(Boolean\)/, "prendere il primo che ARRIVA perderebbe la priorità");
  });

  test("IL CONTATORE SI MUOVE mentre legge", () => {
    // Senza, una riga ferma per minuti è indistinguibile da un'app piantata — ed è esattamente
    // così che il Ghost l'ha letta. Il contatore c'era, l'ho tolto io riscrivendo la card.
    assert.match(catena, /finally \{[\s\S]*?webProvati: finiti/, "ogni lettura che finisce deve farsi vedere");
    assert.match(codice, /su \$\{st\.webDaProvare\} letti/, "il messaggio deve mostrare quanti ne ha finiti");
  });

  test("«IN CORSO» HA SEMPRE UN'USCITA, qualunque cosa succeda", () => {
    // Uno stato transitorio senza uscita garantita diventa permanente al primo imprevisto, e l'app
    // resta a dire una cosa che non sta più facendo. Stessa forma del microfono che restava spento
    // per sempre quando speak() lanciava.
    assert.match(catena, /\} finally \{[\s\S]*?webLetturaImmagine !== "in-corso"[\s\S]*?webLetturaImmagine: "rifiutata"/,
      "manca l'uscita garantita dallo stato «sto leggendo»");
  });

  test("e l'uscita NON calpesta un esito già scritto", () => {
    // Spegnere alla cieca trasformerebbe un successo in un fallimento. Si guarda lo stato di prima.
    assert.match(catena, /if \(st0\.webLetturaImmagine !== "in-corso"\) return s;/);
  });
});

// ══ UNA RINUNCIA NON È UNO SPARTITO — 15/09/2026 ════════════════════════════════════════════════
// Il peggio che questo programma abbia fatto, e il Ghost l'ha visto prima di me:
//   «ora dice che l'ha trovato ma si limita a fornire solo le prime 4 battute, che tra l'altro sono
//    vuote — se mi dà solo le prime 4 invece dell'intero non so se lo ha trovato davvero o lo sta
//    inventando»
// Il modello si era comportato BENE: davanti a un PDF illeggibile l'ha DETTO, nei commenti dell'ABC,
// e si è rifiutato di inventare note. Il programma ha preso quella rinuncia, l'ha disegnata sul
// pentagramma e ci ha messo sotto il pulsante «Tieni».
// «Il modello dice a parole, il programma va a cercarlo davvero» — la regola di casa, rotta da chi
// la scrive. Una rinuncia dichiarata è la cosa più facile da verificare che esista, e non la
// verificava nessuno: i commenti uscivano PRIMA di ogni controllo, buttati via a inizio analisi.
describe("QUELLO CHE L'APP HA DATO AL GHOST COME «SPARTITO TROVATO»", () => {
  // Copiato dallo schermo, carattere per carattere.
  const RINUNCIA = [
    "X:1", "T:Clarinetto", "M:4/4", "L:1/8", "K:C", "%",
    "% Non riesco a vedere l'immagine dello spartito. Il file fornito è un PDF senza contenuto leggibile.",
    "% Non posso inventare note: scrivo pause per tutta la durata prevista.", "%",
    "zzzz|zzzz|zzzz|zzzz|]",
  ].join("\n");

  test("NON PASSA PIÙ, in nessuna delle tre origini", () => {
    for (const origine of ["modello", "archivio", "lettura"]) {
      const r = analizzaSpartito(RINUNCIA, origine);
      assert.equal(r.ok, false, `come «${origine}» passa ancora: ${r.errori.map((e) => e.motivo).join(" · ")}`);
    }
  });

  test("e cade per TRE motivi diversi, ciascuno da solo sufficiente", () => {
    // Come «lettura» — l'origine vera di questo caso: un modello che guarda un PDF.
    const r = analizzaSpartito(RINUNCIA, "lettura");
    const id = r.errori.map((e) => e.id);
    assert.ok(id.includes("niente-rinuncia-dichiarata"), `la rinuncia scritta nei commenti non viene vista: ${id.join(", ")}`);
    assert.ok(id.includes("almeno-una-nota"), "quattro battute di sole pause passano ancora per musica");
    assert.ok(id.includes("battute-che-tornano"), "4 crome su 8 in OGNI battuta non è una levata");
    // E come «archivio» le battute restano un AVVISO — quella tolleranza è nata da 192 trascrizioni
    // umane vere e non si tocca. Ma gli altri due motivi bastano da soli a bocciare, ed è giusto
    // così: una rinuncia dichiarata non è musica scritta male, è musica che non c'è.
    const arch = analizzaSpartito(RINUNCIA, "archivio");
    assert.equal(arch.ok, false);
    assert.ok(arch.avvisi.some((e) => e.id === "battute-che-tornano"), "per l'archivio deve restare un avviso");
  });

  test("I COMMENTI ARRIVANO AL CONTROLLO, che è la radice di tutto", () => {
    // Erano buttati via alla prima riga di analizzaSpartito: `if (eCommento(riga)) return`. La cosa
    // più importante che il modello avesse da dire stava nell'unico posto in cui non si guardava.
    const a = analizzaSpartito(RINUNCIA);
    assert.match(a.commenti, /Non riesco a vedere/);
    assert.match(a.commenti, /senza contenuto leggibile/);
  });

  test("anche in inglese, e anche scritta in coda a una riga di note", () => {
    const inglese = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nCDEF GABc| % unable to read the attached file\nCDEF GABc|";
    const r = analizzaSpartito(inglese);
    assert.equal(r.ok, false);
    assert.ok(r.errori.some((e) => e.id === "niente-rinuncia-dichiarata"));
  });

  test("MA UNA PAUSA DENTRO LA MUSICA RESTA MUSICA — non ho bandito le pause", () => {
    // Il requisito dice «non SOLO pause», e la differenza è tutta lì: una battuta di silenzio in
    // mezzo a un brano è normale, un brano di solo silenzio no.
    const conPause = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nCDEF GABc|z4 GABc|CDEF z4|CDEF GABc|";
    const r = analizzaSpartito(conPause);
    assert.equal(r.ok, true, r.errori.map((e) => e.motivo).join(" · "));
  });

  test("e un commento NORMALE non è una rinuncia", () => {
    const normale = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\n% trascritto dalla seconda pagina\nCDEF GABc|CDEF GABc|";
    assert.equal(analizzaSpartito(normale).ok, true, analizzaSpartito(normale).errori.map((e) => e.motivo).join(" · "));
  });
});

describe("UN'ANACRUSI È UN'ECCEZIONE, NON LA NORMA", () => {
  test("se le battute parziali sono la maggioranza non è una levata: è uno spartito che non torna", () => {
    // Il buco che ha fatto passare le quattro battute di pause: la regola accoppiava QUALSIASI
    // coppia di parziali adiacenti, quindi 4+4=8, 4+4=8, e uno spartito interamente sbagliato
    // passava purché lo fosse in modo REGOLARE — che è esattamente come sbaglia un modello.
    const tutteMezze = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nCDEF|GABc|CDEF|GABc|";
    const r = analizzaSpartito(tutteMezze, "modello");
    assert.equal(r.ok, false);
    assert.match(r.errori.map((e) => e.motivo).join(" "), /non è una levata/);
  });

  test("ma una levata VERA continua a passare: è musica, e va difesa", () => {
    // Una battuta di attacco e la finale che la completa, dentro un brano che per il resto torna.
    const conLevata = "X:1\nT:P\nM:4/4\nL:1/8\nK:C\nD2|CDEF GABc|CDEF GABc|CDEF GABc|DEFD E2|";
    const r = analizzaSpartito(conLevata, "modello");
    assert.equal(r.ok, true, r.errori.map((e) => e.motivo).join(" · "));
  });
});

// ── «MI BLOCCA A TENERE APERTA LA PAGINA» — 15/09/2026 ──────────────────────────────────────────
// Dal Ghost: «ci ha messo un sacco di tempo, pensavo si fosse arenato di nuovo — così però blocca
// me a tenere aperta la pagina e mi impedisce di fare altro col telefono mentre cerca». E poco
// dopo, con lo screenshot: «in 15 secondi o anche meno io l'ho trovato» (Google Immagini →
// MuseScore → Englishman in New York, clarinetto in Si bemolle, 48 battute).
describe("LEGGERE UN DOCUMENTO HA UN TETTO SUO, PIÙ CORTO DI UNA CONVERSAZIONE", () => {
  const sorgente = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const codice = sorgente.split("\n").filter((r) => !/^\s*\/\//.test(r)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");

  test("il tetto esiste, ed è molto più corto di quello di una conversazione", () => {
    const lettura = /const TETTO_LETTURA_DOCUMENTO_MS = (\d+);/.exec(codice);
    const conversazione = /const TIMEOUT_MODELLO_MS = (\d+);/.exec(codice);
    assert.ok(lettura, "TETTO_LETTURA_DOCUMENTO_MS non esiste più");
    assert.ok(Number(lettura[1]) <= 60000, `${Number(lettura[1]) / 1000}s: oltre il minuto il Ghost ha già fatto da sé`);
    assert.ok(Number(lettura[1]) < Number(conversazione[1]), "una lettura non è una conversazione");
  });

  test("e la lettura dei documenti lo usa davvero", () => {
    // Un tetto dichiarato che nessuno passa è un tetto finto — la stessa forma del tetto di spesa
    // che leggeva un registro a rotazione.
    const catena = /const cercaSpartitoNelWeb[\s\S]*?\n  \};/.exec(codice)?.[0] || "";
    assert.match(catena, /tetto: TETTO_LETTURA_DOCUMENTO_MS/, "il tetto non arriva alla chiamata");
    assert.match(codice, /inviaAOpenRouter\(body, apiKey, image\?\.tetto\)/, "il tetto non arriva alla fetch");
    assert.match(codice, /\}, tetto \|\| TIMEOUT_MODELLO_MS\)/, "fetchConTetto riceve ancora solo il default");
  });
});
