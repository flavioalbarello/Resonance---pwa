// L'anello: l'accettore d'azione e l'afferentazione inversa (02/09/2026) — carenza 04 del referto,
// strada D.
//
// Da dove viene. Il referto del 31/08 la chiamava "la rottura vera": il sistema propone direzioni e
// non registra mai cosa succede dopo, quindi l'accettore non ha nulla con cui confrontare — è un
// accettore soltanto di nome. Ma il divieto era deliberato e scritto nel prompt di computeResonance,
// e aveva una ragione buona: un sistema che tiene il punteggio delle proprie previsioni sulla vita
// di una persona diventa in fretta un sistema che giudica quella persona.
//
// La strada D nasce da un'obiezione del Ghost che ha smontato la mia prima versione: «se con la C il
// rischio è la piaggeria dello Shell, la reazione analitica di orientamento sarebbe falsata». Aveva
// ragione: avevo fatto scivolare "lettura" in "previsione". L'accettore di Anokhin non confronta una
// profezia con la realtà — confronta i parametri attesi del risultato dell'AZIONE con quelli
// ottenuti. La domanda non è «la lettura era corretta?» ma «l'atto ha prodotto il movimento per cui
// era stato fatto?».
//
// Le due proprietà che queste prove devono difendere, e che sono la ragione per cui la cosa esiste:
//   1. il bersaglio è dichiarato PRIMA e misurato dal PROGRAMMA (zero token, zero interpretazione);
//   2. il gradiente è invertito: una proposta cauta non smuove nulla, quindi punteggia peggio.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const giorniFa = (n) => new Date(Date.now() - n * 86400000);
const vuoto = { voci: { bio: [], air: [], vidya: [] }, percorsi: { bio: [], air: [], vidya: [] } };
const conNodi = (stati) => ({
  ...vuoto,
  percorsi: { bio: [], air: [], vidya: [{ id: "p1", title: "Divenire", topics: stati.map((s, i) => ({ id: "t" + i, label: "n" + i, status: s })), documents: [] }] },
});
const conDocumenti = (quanti) => ({
  ...vuoto,
  percorsi: { bio: [], air: [], vidya: [{ id: "p1", title: "Divenire", topics: [], documents: Array.from({ length: quanti }, (_, i) => ({ id: "d" + i, title: "doc" + i, text: "t" })) }] },
});

describe("il registro degli osservabili — fisso nel codice, non inventato a runtime", () => {
  test("ogni osservabile sa misurarsi da solo, con una soglia e una finestra dichiarate", () => {
    assert.ok(app.OSSERVABILI.length >= 3);
    for (const o of app.OSSERVABILI) {
      assert.equal(typeof o.misura, "function", `${o.id} non sa misurarsi`);
      assert.ok(o.finestraGiorni > 0 && o.soglia > 0, `${o.id} senza finestra o senza soglia`);
      assert.ok(o.attesa && o.attesa.length > 5, `${o.id} non dice cosa si aspetta, in italiano`);
    }
  });
  test("un osservabile inventato non esiste — è il punto: un bersaglio non misurabile non è un accettore", () => {
    assert.equal(app.osservabileDi("qualcosa_di_inventato"), null);
    assert.equal(app.osservabileDi(undefined), null);
  });
  test("le misure contano davvero nei dati, non stimano", () => {
    assert.equal(app.osservabileDi("approccio_diverso").misura("vidya", conNodi(["non iniziato", "non iniziato"])), 0);
    assert.equal(app.osservabileDi("approccio_diverso").misura("vidya", conNodi(["non iniziato", "praticato"])), 1);
    assert.equal(app.osservabileDi("materiale_prodotto").misura("vidya", conDocumenti(3)), 3);
    assert.equal(app.osservabileDi("percorso_aperto").misura("vidya", conDocumenti(0)), 1);
  });
});

describe("registraAtto — L'ACCETTORE: il bersaglio si dichiara PRIMA", () => {
  test("congela la misura di partenza: senza, non ci sarebbe niente da confrontare", () => {
    globalThis.__store.clear();
    const atto = app.registraAtto({ tipo: "perturbazione Magi", pilastro: "vidya", cosa: "Divenire", osservabileId: "approccio_diverso" }, conNodi(["praticato", "non iniziato"]));
    assert.equal(atto.statoIniziale, 1, "il conteggio di partenza è quello del momento dell'atto");
    assert.equal(atto.finestraGiorni, app.osservabileDi("approccio_diverso").finestraGiorni);
    assert.ok(atto.id && atto.quando);
  });
  test("l'atto finisce nel registro, il più recente per primo", () => {
    globalThis.__store.clear();
    app.registraAtto({ tipo: "a", pilastro: "bio", cosa: "primo", osservabileId: "voci_nuove" }, vuoto);
    app.registraAtto({ tipo: "b", pilastro: "air", cosa: "secondo", osservabileId: "voci_nuove" }, vuoto);
    const atti = app.leggiAtti();
    assert.equal(atti.length, 2);
    assert.equal(atti[0].cosa, "secondo");
  });
  test("un atto malformato non entra: niente pilastro finto, niente osservabile inventato", () => {
    globalThis.__store.clear();
    assert.equal(app.registraAtto({ tipo: "x", pilastro: "kernel", cosa: "y", osservabileId: "voci_nuove" }, vuoto), null);
    assert.equal(app.registraAtto({ tipo: "x", pilastro: "bio", cosa: "y", osservabileId: "inventato" }, vuoto), null);
    assert.equal(app.leggiAtti().length, 0);
  });
  test("il registro ha un tetto: non cresce senza fine dentro localStorage", () => {
    globalThis.__store.clear();
    for (let i = 0; i < app.ATTI_TETTO + 10; i++) app.registraAtto({ tipo: "x", pilastro: "bio", cosa: "n" + i, osservabileId: "voci_nuove" }, vuoto);
    assert.equal(app.leggiAtti().length, app.ATTI_TETTO);
  });
});

describe("statoAtto — L'AFFERENTAZIONE INVERSA: il programma va a vedere", () => {
  const atto = (osservabileId, statoIniziale, giorni, finestraGiorni = 21) =>
    ({ id: "a1", quando: giorniFa(giorni).toISOString(), tipo: "perturbazione Magi", pilastro: "vidya", cosa: "X", osservabileId, statoIniziale, finestraGiorni });

  test("IL CASO CHE CONTA: l'atto ha mosso qualcosa, e si vede dalla differenza", () => {
    const s = app.statoAtto(atto("approccio_diverso", 0, 5), conNodi(["praticato", "non iniziato"]));
    assert.equal(s.esito, "compiuto");
    assert.equal(s.delta, 1);
  });
  test("dentro la finestra, senza movimento: 'in corso', non ancora un esito", () => {
    // Dichiarare "senza effetto" prima della scadenza sarebbe un verdetto anticipato, che è
    // esattamente la cosa che il divieto originale vietava a ragione.
    const s = app.statoAtto(atto("approccio_diverso", 0, 5), conNodi(["non iniziato"]));
    assert.equal(s.esito, "in-corso");
    assert.equal(s.giorniRimasti, 16);
  });
  test("finestra scaduta senza movimento: si dichiara, e resta un dato sullo strumento", () => {
    const s = app.statoAtto(atto("approccio_diverso", 0, 30), conNodi(["non iniziato"]));
    assert.equal(s.esito, "senza-effetto");
    assert.equal(s.delta, 0);
  });
  test("conta il MOVIMENTO, non il totale: un pilastro già pieno non fa passare un atto per riuscito", () => {
    // Senza la misura di partenza, cinque nodi già mossi prima dell'atto lo farebbero risultare
    // compiuto sempre — e il registro direbbe che tutto funziona, sempre.
    const s = app.statoAtto(atto("approccio_diverso", 5, 30), conNodi(["praticato", "praticato", "consolidato", "praticato", "consolidato"]));
    assert.equal(s.delta, 0);
    assert.equal(s.esito, "senza-effetto");
  });
  test("un dato cancellato dal Ghost non produce un delta negativo interpretato come esito", () => {
    const s = app.statoAtto(atto("materiale_prodotto", 3, 30), conDocumenti(1));
    assert.equal(s.delta, -2);
    assert.equal(s.esito, "senza-effetto", "meno di prima non è 'ha mosso'");
  });
  test("un atto con un osservabile sparito dal registro non fa esplodere niente", () => {
    assert.equal(app.statoAtto({ ...atto("voci_nuove", 0, 1), osservabileId: "sparito" }, vuoto), null);
    assert.equal(app.statoAtto(null, vuoto), null);
  });
});

describe("formatAnelloBlock — il ritorno che entra nella prossima sintesi afferente", () => {
  const attoDi = (osservabileId, statoIniziale, giorni, pilastro = "vidya") =>
    ({ id: "a" + giorni, quando: giorniFa(giorni).toISOString(), tipo: "perturbazione Magi", pilastro, cosa: "Divenire", osservabileId, statoIniziale, finestraGiorni: 21 });

  test("LA RIGA CHE PROTEGGE IL GHOST c'è sempre, ed è la ragione per cui questo si poteva fare", () => {
    // Senza questa istruzione un modello guarderebbe una fila di "non ha mosso" e concluderebbe la
    // cosa sbagliata: sulla persona invece che su sé stesso. È il presidio che tiene in piedi la
    // posizione filosofica originale mentre l'anello si chiude.
    const b = app.formatAnelloBlock([attoDi("approccio_diverso", 0, 30)], conNodi(["non iniziato"]));
    assert.match(b, /mai che il Ghost non ha fatto la sua parte/);
    assert.match(b, /qualità di QUESTO STRUMENTO|questo strumento/i);
  });
  test("IL GRADIENTE INVERTITO è dichiarato, non lasciato dedurre", () => {
    // È tutto il punto della strada D: una proposta cauta non smuove nulla e quindi punteggia
    // peggio. Se questa frase sparisce, il meccanismo resta ma l'incentivo torna quello sbagliato.
    const b = app.formatAnelloBlock([attoDi("approccio_diverso", 0, 30)], conNodi(["non iniziato"]));
    assert.match(b, /troppo prudenti o troppo ovvie/);
  });
  test("distingue i tre esiti in chiaro, senza numeri da interpretare", () => {
    // approccio_diverso: finestra scaduta, nessun nodo mosso → non ha mosso.
    // materiale_prodotto: due documenti comparsi dopo l'atto → ha mosso.
    // voci_nuove su BIO: finestra ancora aperta, nessuna voce → in corso.
    const b = app.formatAnelloBlock(
      [attoDi("approccio_diverso", 0, 30), attoDi("materiale_prodotto", 0, 2), attoDi("voci_nuove", 0, 1, "bio")],
      conDocumenti(2),
    );
    assert.match(b, /NON HA MOSSO NIENTE/);
    assert.match(b, /HA MOSSO/);
    assert.match(b, /in corso \(restano/);
  });
  test("il bilancio conta solo gli atti arrivati a scadenza — un atto in corso non è un fallimento", () => {
    const b = app.formatAnelloBlock([attoDi("approccio_diverso", 0, 2)], conNodi(["non iniziato"]));
    assert.match(b, /nessun atto ha ancora un esito/);
  });
  test("registro vuoto: si dichiara, e si dice esplicitamente di non dedurne niente", () => {
    // Un'assenza di dati che venisse letta come "il sistema non funziona" sarebbe un'inferenza su
    // niente — lo stesso difetto già corretto altrove nel prompt di Simbiosi.
    const b = app.formatAnelloBlock([], vuoto);
    assert.match(b, /non dedurre niente da questa assenza/);
  });
  test("un registro lungo non sfonda il digest", () => {
    const molti = Array.from({ length: 40 }, (_, i) => attoDi("voci_nuove", 0, i + 1));
    const b = app.formatAnelloBlock(molti, vuoto);
    assert.ok(b.split("\n").filter((l) => l.startsWith("- ")).length <= 8, "al massimo otto righe di atti");
  });
});

describe("il digest — l'anello arriva davvero al modello, e solo se c'è", () => {
  const base = { bio: [], air: [], vidya: [], kernel: { version: 1, content: "k" }, magi: [], pBio: [], pAir: [], pVidya: [], memory: null };
  test("senza registro il digest è esattamente quello di prima: nessuna regressione", () => {
    assert.doesNotMatch(app.buildResonanceDigest(base), /ANELLO/);
  });
  test("con il registro, il blocco ANELLO c'è", () => {
    const atti = [{ id: "a", quando: giorniFa(30).toISOString(), tipo: "perturbazione Magi", pilastro: "vidya", cosa: "X", osservabileId: "approccio_diverso", statoIniziale: 0, finestraGiorni: 21 }];
    const d = app.buildResonanceDigest({ ...base, atti });
    assert.match(d, /ANELLO — cosa hanno prodotto gli atti/);
    assert.match(d, /NON HA MOSSO NIENTE/);
  });
});
