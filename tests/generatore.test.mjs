// L'EFFETTORE — l'app si scrive uno strumento da sola (04/09/2026).
//
// Qui non si prova un pezzo: si prova il GIRO INTERO. Modello finto (scritto da me, con risposte
// scelte per essere sbagliate in modi precisi), recinto VERO (tests/lib/finto-recinto.mjs esegue la
// stringa INVOLUCRO_SANDBOX di produzione), accettore vero, magazzino vero.
//
// LA PROVA CHE VALE PIÙ DI TUTTE È LA SECONDA: uno strumento che si accende su TUTTO deve essere
// RIFIUTATO. È il modo in cui questa feature diventa un danno invece che un organo — un criterio
// largo fa buttare risposte buone, in silenzio, per sempre. E il modello non può aggirarlo scrivendo
// sopra il banco, perché i testi sani non glieli fa vedere nessuno.
//
// LA PENULTIMA È L'ALTRA METÀ: il generatore DEVE poter fallire, e il fallimento deve restare
// scritto. Se ogni tentativo passasse, l'accettore sarebbe finto e questo file sarebbe teatro.
import { test, describe, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";
import { installaFintoRecinto } from "./lib/finto-recinto.mjs";

const app = await loadApp();
const disinstalla = installaFintoRecinto();
after(() => disinstalla());

// Due testi guasti veri come forma: scritture miste e parole senza senso — la famiglia che il
// 02/09 è arrivata sullo schermo del Ghost prima che l'app la vedesse.
const GUASTI = [
  "MaxxiSOLE вопрос 語 icaa Rome ### ??? 語語語 нет нет MaxxiSOLE",
  "aaaa bbbb aaaa bbbb aaaa bbbb aaaa bbbb aaaa bbbb aaaa bbbb aaaa bbbb aaaa bbbb aaaa",
];

// Un modello finto: restituisce in ordine le risposte che gli si danno. Se finiscono, restituisce
// null (che è quello che fa askModelJSON quando non riesce a leggere niente).
function modelloChe(...risposte) {
  const viste = [];
  const fn = async (system, user) => { viste.push({ system, user }); return risposte.shift() ?? null; };
  fn.viste = viste;
  return fn;
}

// NOTA SU QUESTA FIXTURE, che vale più della fixture. La prima versione che avevo scritto qui è
// stata BOCCIATA dall'accettore, per due motivi veri: i numeri che avevo messo in `atteso` erano
// sbagliati (contati a mano male) e lo strumento copriva solo il primo dei due guasti. Cioè: la
// prima cosa che il capitolato ha rifiutato non è stata una risposta di un modello, è stata la mia.
// Lo lascio scritto perché è la misura più onesta che ho di quanto stretta sia la porta.
const STRUMENTO_BUONO = {
  nome: "testo che ha perso il filo",
  problema: "Due forme di guasto: alfabeti mescolati, oppure poche parole ripetute all'infinito.",
  codice: `(t) => {
  const s = String(t || "");
  const fuoriAlfabeto = (s.match(/[\\u0400-\\u04FF\\u3000-\\u9FFF]/g) || []).length;
  if (fuoriAlfabeto >= 6) return { criterio: "scritture-miste", fuoriAlfabeto };
  const parole = s.toLowerCase().match(/[a-z\\u00e0-\\u00ff]{3,}/g) || [];
  if (parole.length >= 8) {
    const diverse = new Set(parole).size;
    if (diverse / parole.length < 0.3) return { criterio: "poche-parole-ripetute", diverse, parole: parole.length };
  }
  return null;
}`,
  prove: [
    { ingresso: "какой 語 текст 語 странный 語 очень", atteso: { criterio: "scritture-miste", fuoriAlfabeto: 26 }, perche: "lettere fuori dall'alfabeto latino in quantità: il modello ha perso il filo" },
    { ingresso: "uno uno uno uno uno uno uno uno uno due", atteso: { criterio: "poche-parole-ripetute", diverse: 2, parole: 10 }, perche: "dieci parole, due diverse: è un ciclo, non una frase" },
    { ingresso: "Una risposta normale in italiano.", atteso: null, perche: "deve saper dire di no, altrimenti non serve a niente" },
  ],
};

// Si accende su tutto: passa i guasti, passa le proprie prove, ed è il caso in cui questa feature
// fa DANNO invece che servire. Fallisce su un requisito solo — il banco trattenuto — di proposito:
// così la prova dice esattamente quale proprietà lo ferma.
const STRUMENTO_LARGO = {
  nome: "sempre acceso",
  problema: "Riconosce i guasti.",
  codice: `(t) => ({ criterio: "sospetto", lunghezza: String(t || "").length })`,
  prove: [
    { ingresso: "qualsiasi cosa", atteso: { criterio: "sospetto", lunghezza: 14 }, perche: "si accende" },
    { ingresso: "altro", atteso: { criterio: "sospetto", lunghezza: 5 }, perche: "si accende ancora" },
  ],
};

describe("l'atto: dalla trappola allo strumento", () => {
  beforeEach(() => globalThis.__store.clear());

  test("IL GIRO RIUSCITO — e lo strumento entra SPENTO", async () => {
    const modello = modelloChe(STRUMENTO_BUONO);
    const esito = await app.generaPlasmide({ chiediJSON: modello, guasti: GUASTI });
    assert.equal(esito.esito, "coincidenza", JSON.stringify(esito.giri, null, 1));
    const salvato = app.leggiPlasmidi()[0];
    assert.equal(salvato.attivo, false, "uno strumento scritto dal modello non si accende da solo");
    assert.equal(salvato.generato, true);
    assert.equal(salvato.ultimaProva.passato, true);
    // …e finché è spento NON viene chiamato: l'ultimo passo resta un gesto del Ghost.
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 0);
  });

  test("UNO CHE SI ACCENDE SU TUTTO VIENE RIFIUTATO, e il banco che lo smaschera il modello non l'ha mai visto", async () => {
    const modello = modelloChe(STRUMENTO_LARGO, STRUMENTO_LARGO, STRUMENTO_LARGO);
    const esito = await app.generaPlasmide({ chiediJSON: modello, guasti: GUASTI });
    assert.equal(esito.esito, "rinuncia");
    assert.equal(app.leggiPlasmidi().length, 0, "un criterio che scatta su tutto è entrato nel magazzino");
    assert.ok(esito.giri[0].disaccordi.some((d) => d.id === "banco-sani"), JSON.stringify(esito.giri[0]));
    // La prova che l'held-out è held-out davvero: nessun testo sano è mai comparso nel prompt.
    for (const { user } of modello.viste) {
      for (const sano of app.CONTROLLI_SANI) {
        assert.ok(!user.includes(sano.slice(0, 60)), "un testo sano è finito nel brief: il banco non è più trattenuto");
      }
    }
  });

  test("IL DISACCORDO TORNA AL MODELLO, e al secondo giro ce la fa", async () => {
    const modello = modelloChe(STRUMENTO_LARGO, STRUMENTO_BUONO);
    const esito = await app.generaPlasmide({ chiediJSON: modello, guasti: GUASTI });
    assert.equal(esito.esito, "coincidenza");
    assert.equal(esito.giri.length, 2);
    // Il secondo messaggio non è il brief ripetuto: è il motivo per cui il primo non è entrato.
    const secondo = modello.viste[1].user;
    assert.match(secondo, /banco-sani/);
    assert.match(secondo, /falso positivo/);
    assert.match(secondo, /NON ricominciare da capo/);
  });

  test("codice che non compila: il recinto lo dice, e il disaccordo lo riporta", async () => {
    const esito = await app.generaPlasmide({
      chiediJSON: modelloChe({ ...STRUMENTO_BUONO, codice: "(t) => { questo non è javascript ((" }),
      guasti: GUASTI, tetto: 1,
    });
    assert.equal(esito.esito, "rinuncia");
    assert.ok(esito.giri[0].disaccordi.some((d) => d.id === "forma-funzione"), JSON.stringify(esito.giri[0]));
  });

  test("il modello risponde con niente: si registra, non si esplode", async () => {
    const esito = await app.generaPlasmide({ chiediJSON: modelloChe(null, null, null), guasti: GUASTI });
    assert.equal(esito.esito, "rinuncia");
    assert.equal(esito.giri.length, 3);
  });

  test("la rete cade a metà: il giro si chiude e resta scritto", async () => {
    const rotto = async () => { throw new Error("Failed to fetch"); };
    const esito = await app.generaPlasmide({ chiediJSON: rotto, guasti: GUASTI });
    assert.equal(esito.esito, "rinuncia");
    assert.match(esito.motivo, /Failed to fetch/);
  });

  test("SENZA UN CASO VERO NON SI PARTE — un criterio senza guasto è indovinato, non scritto", async () => {
    const modello = modelloChe(STRUMENTO_BUONO);
    const esito = await app.generaPlasmide({ chiediJSON: modello, guasti: [] });
    assert.equal(esito.esito, "niente-materia");
    assert.equal(modello.viste.length, 0, "non si paga una chiamata per indovinare");
  });

  test("il tetto è rispettato: ogni giro è una chiamata pagata", async () => {
    const modello = modelloChe(STRUMENTO_LARGO, STRUMENTO_LARGO, STRUMENTO_LARGO, STRUMENTO_LARGO, STRUMENTO_LARGO);
    await app.generaPlasmide({ chiediJSON: modello, guasti: GUASTI, tetto: 2 });
    assert.equal(modello.viste.length, 2);
  });

  test("l'id lo decide il programma: un id inventato dal modello non può sovrascrivere niente", async () => {
    app.salvaPlasmide({ id: "gia-mio", nome: "esistente", attacco: "criterio-degenerazione", codice: "(t)=>null", problema: "p", prove: [] });
    await app.generaPlasmide({ chiediJSON: modelloChe({ ...STRUMENTO_BUONO, id: "gia-mio" }), guasti: GUASTI });
    const lista = app.leggiPlasmidi();
    assert.equal(lista.length, 2, "il plasmide esistente è stato sovrascritto — è esattamente ciò che la Legge 14 vieta");
    assert.ok(lista.find((p) => p.id === "gia-mio" && p.nome === "esistente"));
  });
});

describe("IL GUARDIANO A MONTE — perché da oggi il codice non lo scrivo più solo io", () => {
  beforeEach(() => globalThis.__store.clear());

  test("un plasmide con dati personali NON VIENE SCRITTO, non solo non viene esportato", () => {
    const sporco = { id: "x", nome: "n", problema: "p", attacco: "criterio-degenerazione", codice: "(t)=>null", prove: [{ ingresso: "scrivi a mario.rossi@example.com", atteso: null, perche: "x" }] };
    const r = app.salvaPlasmide(sporco);
    assert.equal(r.ok, false);
    assert.match(r.trovati.join(" "), /posta/);
    assert.equal(app.leggiPlasmidi().length, 0, "è entrato in memoria: da lì basta una sincronizzazione e è uscito");
  });

  test("il rifiuto lascia una traccia leggibile, non un silenzio", () => {
    app.salvaPlasmide({ id: "x", nome: "il colpevole", attacco: "criterio-degenerazione", codice: "(t)=>null", problema: "p", prove: [{ ingresso: "chiama 0039 333 1234567 subito", atteso: null, perche: "x" }] });
    const note = app.leggiNoteDiRete();
    assert.equal(note[0].type, "plasmide-respinto-alla-scrittura");
    assert.equal(note[0].plasmide, "il colpevole");
  });

  test("un plasmide pulito passa e viene scritto con la sua impronta", () => {
    const r = app.salvaPlasmide({ id: "x", nome: "n", problema: "p", attacco: "criterio-degenerazione", codice: "(t)=>null", prove: [] });
    assert.equal(r.ok, true);
    assert.equal(r.plasmide.impronta, app.improntaPlasmide(r.plasmide));
  });

  test("IL NOME NON ESCE, IL DOMINIO SÌ — il criterio del Ghost del 02/09, applicato alla scrittura", () => {
    const conNome = { id: "a", nome: "n", problema: "p", attacco: "criterio-degenerazione", codice: "(t)=>null", prove: [{ ingresso: "un caso di PhysioAlba", atteso: null, perche: "x" }] };
    const conDominio = { id: "b", nome: "n", problema: "p", attacco: "criterio-degenerazione", codice: "(t)=>null", prove: [{ ingresso: "una valutazione fisioterapica", atteso: null, perche: "x" }] };
    const profilo = { name: "Flavio", professionalIdentity: "fisioterapista, PhysioAlba", hasProfessionalConstraint: true, hardConstraints: [] };
    assert.equal(app.salvaPlasmide(conNome, profilo).ok, false, "un NOME che identifica non deve poter entrare");
    assert.equal(app.salvaPlasmide(conDominio, profilo).ok, true, "una PROFESSIONE non identifica nessuno: se non passa, nessuno strumento clinico è trasferibile");
  });
});

describe("la materia prima: quali trappole valgono", () => {
  test("valgono solo i rifiuti che dicono ROTTO, non quelli che dicono BRUTTO", () => {
    for (const f of ["non si capisce niente", "è illeggibile", "sono caratteri strani", "questo non è italiano", "è spazzatura"]) {
      assert.equal(app.TRAPPOLA_DA_GUASTO_RE.test(f), true, f);
    }
    // Un giudizio di merito non è un guasto: su "troppo prolisso" un criterio automatico non ha
    // niente da dire, e provarci produrrebbe un criterio che censura le risposte lunghe.
    for (const f of ["troppo prolisso", "non mi piace la lettera", "troppo generico", "rifallo"]) {
      assert.equal(app.TRAPPOLA_DA_GUASTO_RE.test(f), false, f);
    }
  });
  test("estrae il testo rifiutato dalle trappole giuste e scarta i frammenti troppo corti", () => {
    const lungo = "Ecco un testo abbastanza lungo da poter essere materia di un criterio automatico.";
    const guasti = app.guastiDaTrappole([
      { cosaNonHaFunzionato: "non si capisce niente", suCosa: lungo },
      { cosaNonHaFunzionato: "troppo prolisso", suCosa: lungo },
      { cosaNonHaFunzionato: "è illeggibile", suCosa: "corto" },
    ]);
    assert.deepEqual(guasti, [lungo]);
  });
});

describe("il registro dei tentativi — Legge 14 anche sulle rinunce", () => {
  beforeEach(() => globalThis.__store.clear());

  test("una rinuncia resta scritta: «non so ancora fare X» è una traccia legittima", async () => {
    await app.generaPlasmide({ chiediJSON: modelloChe(STRUMENTO_LARGO), guasti: GUASTI, tetto: 1 });
    const g = app.leggiGenerazioni();
    assert.equal(g.length, 1);
    assert.equal(g[0].esito, "rinuncia");
    assert.ok(g[0].motivo.length > 0, "una rinuncia senza motivo non dice dove il generatore è cieco");
    assert.equal(g[0].giri[0].disaccordi.length > 0, true);
  });
  test("il più recente per primo, e c'è un tetto", () => {
    for (let i = 0; i < app.GENERAZIONI_TETTO + 3; i++) app.registraGenerazione({ esito: "rinuncia", motivo: "m" + i, giri: [] });
    const g = app.leggiGenerazioni();
    assert.equal(g.length, app.GENERAZIONI_TETTO);
    assert.equal(g[0].motivo, "m" + (app.GENERAZIONI_TETTO + 2));
  });
  test("si può togliere un tentativo, e la memoria corrotta non fa saltare la lettura", () => {
    const v = app.registraGenerazione({ esito: "rinuncia", giri: [] });
    app.dimenticaGenerazione(v.id);
    assert.equal(app.leggiGenerazioni().length, 0);
    globalThis.__store.set("generazioni", '"non-un-array"');
    assert.deepEqual(app.leggiGenerazioni(), []);
  });
});
