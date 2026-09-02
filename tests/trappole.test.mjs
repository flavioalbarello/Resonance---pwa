// Le trappole: i vicoli ciechi già pagati (02/09/2026).
//
// Da dove viene. Discutendo se un PROCESSO lungo — il posizionamento lavorativo di Marta: CV,
// lettera di presentazione, parole chiave per LinkedIn — valga la pena di essere estratto e
// trasferito a un altro utente, il conto sui suoi numeri VERI ha detto una cosa scomoda:
// il plasmide non risparmia token. Marta-2 deve comunque rispondere alle domande sulla propria
// vita, e quei turni costano uguale (misurato sul suo registro del 24/08: 6 turni, $0,216,
// ~8.000 token in ingresso ciascuno).
// Quello che si risparmia sono i VICOLI CIECHI. Nel suo registro ce n'è uno, esplicito:
//     «Il CV è aggiornato, ma non mi piace la lettera di presentazione che hai fatto»
// La lettera era stata scritta PRIMA dell'inventario delle competenze, e si è dovuta rifare.
//
// Il rilevatore è deliberatamente STRETTO, ed è la proprietà che queste prove difendono più di
// ogni altra: una trappola mancata non costa niente, una trappola falsa sporca l'unica materia
// prima che abbiamo. Metà di questo file è sui falsi positivi.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
// Un testo abbastanza lungo da essere "qualcosa che è stato prodotto".
const PRODOTTO = "Gentile responsabile, mi chiamo … e scrivo per candidarmi alla posizione. ".repeat(6);

describe("eRifacimento — riconoscere che si sta rifacendo qualcosa", () => {
  test("IL CASO REALE DAL REGISTRO DI MARTA, 24/08", () => {
    assert.equal(app.eRifacimento("Il CV è aggiornato, ma non mi piace la lettera di presentazione che hai fatto. Non mi sembra sia valorizzante", PRODOTTO), true);
  });
  test("IL CASO REALE DEL GHOST, 02/09 — un giudizio che può valere solo su un testo", () => {
    assert.equal(app.eRifacimento("meglio, ma non ti sembra Troppo prolisso?", PRODOTTO), true);
  });
  test("i verbi di rifacimento espliciti bastano da soli", () => {
    // Possono riferirsi solo a ciò che è appena stato prodotto: non serve altro contesto.
    for (const f of ["rifallo", "riscrivilo più corto", "rifai la seconda parte", "ricomincia", "rifacciamo da capo"]) {
      assert.equal(app.eRifacimento(f, PRODOTTO), true, f);
    }
  });
  test("i giudizi che valgono solo su un testo bastano da soli", () => {
    for (const f of ["troppo lungo", "è troppo generico", "troppo verboso", "non si capisce"]) {
      assert.equal(app.eRifacimento(f, PRODOTTO), true, f);
    }
  });
  test("un giudizio generico serve il riferimento a ciò che è stato prodotto", () => {
    assert.equal(app.eRifacimento("non mi piace quello che hai scritto", PRODOTTO), true);
    assert.equal(app.eRifacimento("non va bene il documento", PRODOTTO), true);
  });

  describe("I FALSI POSITIVI — la parte che conta di più", () => {
    test("«non mi piace il pesce» NON è una trappola: è un vincolo alimentare", () => {
      // Senza la condizione sul riferimento all'output, ogni vincolo dichiarato parlando
      // diventerebbe un vicolo cieco, e il conto delle trappole non varrebbe niente.
      for (const f of [
        "non mi piace il pesce",
        "non mi piace il pesce che non sia crostacei",
        "non mi piace alzarmi presto",
        "il lunedì non va bene per la palestra",
        "non mi convince questa strada, ma proviamo",
      ]) assert.equal(app.eRifacimento(f, PRODOTTO), false, f);
    });
    test("una richiesta nuova non è un rifacimento", () => {
      for (const f of [
        "adesso genera un percorso in vidya",
        "ricapitola le parole chiave per LinkedIn",
        "salvalo nel percorso",
        "va bene così, andiamo avanti",
      ]) assert.equal(app.eRifacimento(f, PRODOTTO), false, f);
    });
    test("SENZA NIENTE DA RIFARE non c'è trappola, nemmeno con la frase giusta", () => {
      // Un giudizio negativo su uno scambio di servizio ("ok", "fatto") non è un vicolo cieco:
      // non c'era niente che sia costato qualcosa da produrre.
      for (const precedente of ["", null, undefined, "Fatto.", "Ok, procedo."]) {
        assert.equal(app.eRifacimento("rifallo, non mi piace", precedente), false, JSON.stringify(precedente));
      }
    });
    test("la soglia sotto cui non si guarda è dichiarata, non nascosta in una formula", () => {
      assert.ok(app.LUNGHEZZA_MINIMA_RIFATTA >= 100);
      assert.equal(app.eRifacimento("rifallo", "x".repeat(app.LUNGHEZZA_MINIMA_RIFATTA - 1)), false);
      assert.equal(app.eRifacimento("rifallo", "x".repeat(app.LUNGHEZZA_MINIMA_RIFATTA + 1)), true);
    });
    test("frase vuota o assente: niente", () => {
      for (const f of ["", null, undefined, "   "]) assert.equal(app.eRifacimento(f, PRODOTTO), false);
    });
  });
});

describe("il registro delle trappole", () => {
  beforeEach(() => globalThis.__store.clear());

  test("registra COSA non ha funzionato, SU COSA, e DOPO QUANTO", () => {
    const t = app.registraTrappola({
      frase: "non mi piace la lettera di presentazione che hai fatto",
      testoRifatto: PRODOTTO,
      fuoco: { tipo: "percorso", id: "p1", etichetta: "Posizionamento lavorativo" },
      turniSpesi: 7,
    });
    assert.match(t.cosaNonHaFunzionato, /lettera di presentazione/);
    assert.equal(t.percorso, "Posizionamento lavorativo");
    assert.equal(t.turniSpesi, 7);
    assert.equal(t.lunghezzaRifatta, PRODOTTO.length);
    assert.ok(t.suCosa.length <= 221, `l'inizio del testo va troncato, misurato ${t.suCosa.length}`);
  });
  test("TURNI SPESI È IL CAMPO CHE VALE DI PIÙ: misura quanto è costato il vicolo cieco", () => {
    // Un rifacimento al secondo scambio è un aggiustamento; al quindicesimo è una direzione
    // sbagliata presa presto e pagata a lungo — ed è quella che un processo trasferibile evita.
    const presto = app.registraTrappola({ frase: "rifallo", testoRifatto: PRODOTTO, turniSpesi: 2 });
    const tardi = app.registraTrappola({ frase: "rifallo", testoRifatto: PRODOTTO, turniSpesi: 15 });
    assert.ok(tardi.turniSpesi > presto.turniSpesi);
  });
  test("senza percorso aperto la trappola resta valida, senza percorso", () => {
    const t = app.registraTrappola({ frase: "rifallo", testoRifatto: PRODOTTO, fuoco: { tipo: "nessuno" }, turniSpesi: 3 });
    assert.equal(t.percorso, null);
  });
  test("la più recente per prima, e c'è un tetto", () => {
    for (let i = 0; i < app.TRAPPOLE_TETTO + 5; i++) app.registraTrappola({ frase: "n" + i, testoRifatto: PRODOTTO, turniSpesi: i });
    const l = app.leggiTrappole();
    assert.equal(l.length, app.TRAPPOLE_TETTO);
    assert.equal(l[0].cosaNonHaFunzionato, "n" + (app.TRAPPOLE_TETTO + 4));
  });
  test("una trappola sbagliata si toglie: un rilevamento errato non deve sporcare il conto", () => {
    const t = app.registraTrappola({ frase: "rifallo", testoRifatto: PRODOTTO, turniSpesi: 1 });
    app.dimenticaTrappola(t.id);
    assert.equal(app.leggiTrappole().length, 0);
  });
  test("memoria corrotta non fa saltare la lettura", () => {
    globalThis.__store.set("trappole", '"non-un-array"');
    assert.deepEqual(app.leggiTrappole(), []);
  });
});
