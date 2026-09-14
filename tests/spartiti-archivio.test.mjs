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
