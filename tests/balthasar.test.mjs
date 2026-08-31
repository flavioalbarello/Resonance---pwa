// Balthasar: la diagnostica delle fonti e la memoria che diceva di vedere (31/08/2026).
//
// Da dove viene. Il brief sui Serbatoi (§13.7) elenca Balthasar fra i componenti mai verificati in
// produzione dopo il fix max_tool_calls, e chiede di dirlo prima di costruirci sopra tre serbatoi
// nuovi. Aprendo il codice per rispondere sono venute fuori due cose più precise di "non verificato":
//
//   1. La diagnostica costruita il 26/07 per QUELL'incidente — le fonti fabbricate "ShopFoundry",
//      "RankHero" — viveva dentro runSeedResearch e solo lì. Il Balthasar della Triade usa anche lui
//      la ricerca web e non aveva né il rilevatore né il divieto nel prompt.
//   2. Il commento della Triade dichiarava "Balthasar vede l'intera memoria procedurale". Falso: il
//      codice passava solo `corrente`, 900 caratteri per pilastro. Il sedimento non l'ha mai visto.
//
// Non posso ritestare Balthasar con una chiamata vera da qui (nessuna chiave). Queste prove coprono
// tutto ciò che si può verificare offline: che il rilevatore riconosca i nomi veri dell'incidente
// reale, che non spari a salve sulla prosa normale, e che la memoria estesa contenga davvero la
// storia senza sfondare i tetti dichiarati.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("leggiDiagnosticaRicerca — cosa la risposta porta già con sé", () => {
  test("le annotazioni con url_citation diventano domini leggibili", () => {
    const raw = { choices: [{ message: { annotations: [
      { url_citation: { url: "https://www.etsy.com/market/qualcosa" } },
      { url_citation: { url: "https://printify.com/blog/x" } },
    ] } }] };
    const d = app.leggiDiagnosticaRicerca(raw, app.diagnosticaVuota());
    assert.equal(d.toolInvoked, true);
    assert.equal(d.citationCount, 2);
    assert.deepEqual(d.citationDomains, ["www.etsy.com", "printify.com"]);
  });
  test("i domini si contano una volta sola anche con più citazioni dallo stesso sito", () => {
    const raw = { choices: [{ message: { annotations: [
      { url: "https://etsy.com/a" }, { url: "https://etsy.com/b" }, { url: "https://etsy.com/c" },
    ] } }] };
    const d = app.leggiDiagnosticaRicerca(raw, app.diagnosticaVuota());
    assert.equal(d.citationCount, 3, "le citazioni sono tre");
    assert.deepEqual(d.citationDomains, ["etsy.com"], "il dominio è uno");
  });
  test("nessuna annotazione: la ricerca NON risulta eseguita, e si dice", () => {
    const d = app.leggiDiagnosticaRicerca({ choices: [{ message: { content: "testo" } }] }, app.diagnosticaVuota());
    assert.equal(d.toolInvoked, false);
    assert.equal(d.citationCount, 0);
  });
  test("le altre due forme note (citations, tool_calls) contano come ricerca eseguita", () => {
    // La forma esatta non è verificabile senza una chiamata vera: si accettano tutte e tre quelle
    // documentate, invece di scommettere su una sola e non accorgersi di niente.
    assert.equal(app.leggiDiagnosticaRicerca({ citations: [{ url: "https://x.it" }] }, app.diagnosticaVuota()).toolInvoked, true);
    assert.equal(app.leggiDiagnosticaRicerca({ choices: [{ message: { tool_calls: [{ id: "1" }] } }] }, app.diagnosticaVuota()).toolInvoked, true);
  });
  test("una risposta malformata non fa esplodere niente", () => {
    for (const raw of [null, {}, { choices: [] }, { choices: [{}] }]) {
      const d = app.leggiDiagnosticaRicerca(raw, app.diagnosticaVuota());
      assert.equal(d.toolInvoked, false);
    }
  });
  test("un URL non parsabile resta com'è invece di far saltare la lettura", () => {
    const d = app.leggiDiagnosticaRicerca({ choices: [{ message: { annotations: [{ url: "non-un-url" }] } }] }, app.diagnosticaVuota());
    assert.deepEqual(d.citationDomains, ["non-un-url"]);
  });
});

describe("detectPossibleHallucinatedSource — i nomi veri dell'incidente del 26/07", () => {
  test("I QUATTRO NOMI OSSERVATI DAL VIVO vengono riconosciuti quando nessun dominio li conferma", () => {
    const testo = "Puoi guardare come lavorano ShopFoundry e RankHero, oppure InsightAgent e MerchTitans.";
    assert.equal(app.detectPossibleHallucinatedSource(testo, "vendere magliette", ["etsy.com", "printify.com"]), true);
  });
  test("un nome che TROVA riscontro in un dominio reale non è sospetto", () => {
    assert.equal(app.detectPossibleHallucinatedSource("Usa Printify per stampare.", "idea", ["printify.com"]), false);
  });
  test("i nomi già presenti nell'idea del Ghost non sono attribuzioni inventate da Balthasar", () => {
    // Nel test reale "Printify"/"Etsy" erano nel Seme stesso: segnalarli sarebbe stato un falso
    // positivo sistematico su ogni idea che nomina uno strumento.
    assert.equal(app.detectPossibleHallucinatedSource("Continua con ShopFoundry.", "provare ShopFoundry per le magliette", []), false);
  });
  test("la prosa normale non fa scattare niente — è la regressione che conta di più", () => {
    // Una prima versione catturava ogni parola maiuscola e sparava a salve su ogni frase.
    for (const t of [
      "Secondo me la direzione giusta è un'altra. Il punto non è lo strumento.",
      "Prova a spostare il baricentro verso la produzione invece che la distribuzione.",
      "",
    ]) assert.equal(app.detectPossibleHallucinatedSource(t, "idea qualunque", []), false, `"${t.slice(0, 40)}"`);
  });
  test("senza citazioni qualunque nome fabbricato resta senza riscontro, e va segnalato", () => {
    // È il caso in cui la ricerca non è partita: il sospetto deve valere di più, non di meno.
    assert.equal(app.detectPossibleHallucinatedSource("Guarda MerchTitans.", "idea", []), true);
  });
});

describe("memoriaEstesaPerMagi — la storia che Balthasar diceva di vedere e non vedeva", () => {
  const frammento = (i, testo) => ({ id: "f" + i, date: `2026-08-${String(10 + i).padStart(2, "0")}`, text: testo, chiavi: [] });
  const memoria = {
    bio: { corrente: "nota corrente BIO", sedimento: [frammento(1, "prima riorganizzazione BIO"), frammento(2, "seconda riorganizzazione BIO")] },
    air: { corrente: "nota corrente AIR", sedimento: [] },
    vidya: { corrente: "nota corrente VIDYA", sedimento: [frammento(3, "riorganizzazione VIDYA")] },
  };

  test("LA STORIA C'È — era questa la riga che il commento prometteva e il codice non manteneva", () => {
    const b = app.memoriaEstesaPerMagi(memoria);
    assert.match(b, /prima riorganizzazione BIO/);
    assert.match(b, /seconda riorganizzazione BIO/);
    assert.match(b, /riorganizzazione VIDYA/);
  });
  test("le note correnti ci sono ancora: non è una sostituzione, è un'aggiunta", () => {
    const b = app.memoriaEstesaPerMagi(memoria);
    for (const n of ["nota corrente BIO", "nota corrente AIR", "nota corrente VIDYA"]) assert.match(b, new RegExp(n));
  });
  test("ogni frammento è datato: senza data una storia non è una storia", () => {
    assert.match(app.memoriaEstesaPerMagi(memoria), /\[\d{2} \w{3} 2026\]/);
  });
  test("un pilastro senza sedimento non produce una riga di storia vuota", () => {
    const b = app.memoriaEstesaPerMagi(memoria);
    const rigaAir = b.split("\n").find((l) => l.startsWith("AIR:"));
    assert.equal(rigaAir, "AIR: nota corrente AIR");
    assert.doesNotMatch(b, /AIR — come si e' riorganizzato/);
  });

  test("I TETTI DICHIARATI SONO RISPETTATI — è C.16 del brief: nessun parametro implicito", () => {
    // Prendere tutto il sedimento (30 frammenti da 900 caratteri per pilastro) sarebbero ~20.000
    // token per una risposta di settanta parole: il costo mangerebbe la feature.
    const tanti = { bio: { corrente: "c", sedimento: Array.from({ length: 30 }, (_, i) => frammento(i, "X".repeat(900))) }, air: { corrente: "c", sedimento: [] }, vidya: { corrente: "c", sedimento: [] } };
    const b = app.memoriaEstesaPerMagi(tanti);
    const pezzi = b.match(/X+/g) || [];
    assert.equal(pezzi.length, app.MAGI_FRAMMENTI_PER_PILASTRO, "solo gli ultimi quattro frammenti");
    for (const p of pezzi) assert.ok(p.length <= app.MAGI_TETTO_FRAMMENTO, `frammento di ${p.length} caratteri, tetto ${app.MAGI_TETTO_FRAMMENTO}`);
    assert.ok(b.length < 4000, `il blocco intero deve restare piccolo, misurato ${b.length}`);
  });
  test("un frammento tagliato lo dichiara con i puntini, non finisce a metà in silenzio", () => {
    const lungo = { bio: { corrente: "c", sedimento: [frammento(1, "Y".repeat(500))] }, air: { corrente: "c", sedimento: [] }, vidya: { corrente: "c", sedimento: [] } };
    assert.match(app.memoriaEstesaPerMagi(lungo), /Y…/);
  });
  test("dice a Balthasar cosa farsene, non gliela mette lì e basta", () => {
    // Senza istruzione, la storia diventa contesto da rimescolare — l'esatto contrario del suo
    // mestiere, che è spingere DOVE non si è ancora andati.
    assert.match(app.memoriaEstesaPerMagi(memoria), /spingere di nuovo li' e' l'unica cosa che non serve a niente/);
  });
  test("senza memoria non si inventa un blocco", () => {
    assert.equal(app.memoriaEstesaPerMagi(null), "");
    assert.equal(app.memoriaEstesaPerMagi(undefined), "");
  });
});
