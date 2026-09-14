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
    assert.equal(analizzaSpartito(abc).ok, true);
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
