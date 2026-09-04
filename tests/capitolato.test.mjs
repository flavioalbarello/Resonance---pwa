// L'ACCETTORE D'AZIONE — 04/09/2026.
//
// Il Ghost, correggendo il piano di ieri: «il guardiano e il generatore vanno creati insieme, devono
// avere una relazione biunivoca, un po' come accettore d'azione ed effettore d'azione in Anochin,
// altrimenti ognuno dei due diventa solo un orpello».
//
// LA PROPRIETÀ CHE QUESTO FILE DIFENDE PIÙ DI OGNI ALTRA, ed è quella: brief e giudizio devono
// venire dallo STESSO oggetto. Se un domani qualcuno scrivesse la prosa del prompt in un posto e i
// controlli in un altro, il primo test qui sotto fallisce. Non è una prova di stile: è la prova che
// l'accettore e l'effettore non possono divergere in silenzio, che è l'unico modo in cui questa
// coppia degenera in due orpelli.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const cap = (extra = {}) => app.montaCapitolato({
  attacco: "criterio-degenerazione",
  problema: "L'app non ha visto dei testi che il Ghost ha rifiutato perché illeggibili.",
  guasti: ["ZZZ вопрос 語 ??? ###", "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll"],
  sani: ["Il peso è sceso di 1,2 kg in undici giorni e la derivata resta negativa."],
  terminiVietati: ["PhysioAlba"],
  ...extra,
});

describe("un oggetto solo, letto due volte", () => {
  test("OGNI requisito porta con sé sia come si dice sia come si controlla", () => {
    // Questa è la relazione biunivoca, resa impossibile da rompere per distrazione.
    assert.ok(app.REQUISITI.length >= 8, `sono ${app.REQUISITI.length}`);
    for (const r of app.REQUISITI) {
      assert.ok(r.id, "un requisito senza id non è citabile nel disaccordo");
      assert.ok(typeof r.detta === "string" && r.detta.length > 40, `"${r.id}" non si sa dire al modello`);
      assert.equal(typeof r.verifica, "function", `"${r.id}" si dice ma non si controlla: è un orpello`);
    }
  });
  test("il brief usa LE STESSE PAROLE del giudizio, non una parafrasi", () => {
    const brief = app.briefDelCapitolato(cap());
    for (const r of app.REQUISITI) {
      assert.ok(brief.includes(r.detta), `la frase del requisito "${r.id}" non arriva al modello`);
    }
  });
  test("il brief dice il contratto dell'attacco e il problema", () => {
    const brief = app.briefDelCapitolato(cap());
    assert.match(brief, /criterio-degenerazione/);
    assert.match(brief, /illeggibili/);
    assert.match(brief, /senza rete/);
  });
});

describe("IL BANCO TRATTENUTO — la parte che l'effettore non può assecondare", () => {
  test("i testi GUASTI si mostrano: non si scrive un criterio per un testo che non si vede", () => {
    const brief = app.briefDelCapitolato(cap());
    assert.ok(brief.includes("ZZZ вопрос 語 ??? ###"), "il caso reale non arriva al modello");
  });
  test("i testi SANI NON si mostrano MAI — il requisito si dichiara, le prove si trattengono", () => {
    const c = cap({ sani: ["Il peso è sceso di 1,2 kg in undici giorni e la derivata resta negativa."] });
    const brief = app.briefDelCapitolato(c);
    assert.ok(!brief.includes("la derivata resta negativa"), "un banco mostrato è un banco su cui si scrive sopra invece di risolvere");
    // …ma il requisito deve essere DETTO, altrimenti il modello viene giudicato su una regola segreta.
    assert.match(brief, /NON deve accendersi su una risposta normale/);
    assert.equal(c.banco.sani.length, 1, "i sani restano nel capitolato, dove serve giudicare");
  });
  test("il banco dei guasti li contiene TUTTI, anche quelli non mostrati", () => {
    const molti = Array.from({ length: 6 }, (_, i) => `guasto numero ${i} con abbastanza testo per contare`);
    const c = cap({ guasti: molti });
    assert.equal(c.mostrati.length, app.CASI_MOSTRATI);
    assert.equal(c.banco.guasti.length, 6, "i guasti non mostrati restano nel giudizio: sono held-out anche loro");
  });
  test("i casi mostrati sono troncati: il contesto costa", () => {
    const c = cap({ guasti: ["x".repeat(5000)] });
    assert.equal(c.mostrati[0].length, app.CASO_MAX_CARATTERI);
  });
});

describe("il confronto", () => {
  const contestoBuono = () => ({
    plasmide: { nome: "n", problema: "p", attacco: "criterio-degenerazione", codice: "(t) => null", prove: [{ ingresso: "a", atteso: null, perche: "x" }, { ingresso: "b", atteso: null, perche: "y" }] },
    validazione: { valido: true, errori: [] },
    esitoProve: { passato: true, motivo: "" },
    compilata: true, erroreCompilazione: "",
    esitiBancoGuasti: [{ acceso: true, fuoriContratto: false, inizio: "g" }],
    esitiBancoSani: [{ acceso: false, fuoriContratto: false, inizio: "s" }],
    datiPersonali: [], casiReali: ["un testo reale lunghissimo che non compare in nessuna prova qui"],
  });

  test("tutto a posto: coincidenza", () => {
    assert.equal(app.confrontaColCapitolato(cap(), contestoBuono()).coincide, true);
  });
  test("UN CRITERIO CHE SI ACCENDE SU TUTTO NON PASSA — è il falso positivo, ed è peggio del guasto", () => {
    const c = { ...contestoBuono(), esitiBancoSani: [{ acceso: true, fuoriContratto: false, forma: "una tabella, 180 caratteri" }] };
    const { coincide, disaccordi } = app.confrontaColCapitolato(cap(), c);
    assert.equal(coincide, false);
    const d = disaccordi.find((x) => x.id === "banco-sani");
    assert.ok(d, "un criterio che scatta su una risposta sana è entrato");
    assert.match(d.mancato, /falso positivo/);
    // Il disaccordo deve dire CHE COSA ha scambiato per un guasto — altrimenti non insegna niente —
    // ma senza consegnare il testo: sennò il banco si svuota un giro per volta.
    assert.match(d.mancato, /una tabella, 180 caratteri/);
  });
  test("LA FORMA SI DESCRIVE, IL TESTO NON SI CITA — il banco non si consegna a rate", () => {
    const tabella = "| voce | ieri |\n| --- | --- |\n| peso | 124,8 |";
    const forma = app.descriviForma(tabella);
    assert.match(forma, /una tabella/);
    assert.ok(!forma.includes("124,8"), "la descrizione ricopia il testo che doveva nascondere");
    assert.match(app.descriviForma("Fatto."), /è corto/);
    assert.match(app.descriviForma("Serie: 130,0 128,4 127,9 126,0 125,4 124,8 giù."), /molti numeri/);
    assert.match(app.descriviForma("Una risposta normale in italiano, senza niente di strano dentro."), /solo alfabeto latino/);
    assert.ok(!/solo alfabeto latino/.test(app.descriviForma("вопрос 語 misto e strano abbastanza lungo")));
  });
  test("uno che non si accende sui guasti veri non passa", () => {
    const c = { ...contestoBuono(), esitiBancoGuasti: [{ acceso: false, fuoriContratto: false, inizio: "ZZZ вопрос" }] };
    const d = app.confrontaColCapitolato(cap(), c).disaccordi.find((x) => x.id === "banco-guasti");
    assert.match(d.mancato, /ZZZ вопрос/);
  });
  test("il contratto: mai true/false, mai una stringa, mai un array", () => {
    for (const uscita of [true, false, "guasto", ["a"], {}, { criterio: "" }, { criterio: 3 }]) {
      assert.equal(app.rispettaIlContratto(uscita), false, JSON.stringify(uscita));
    }
    for (const uscita of [null, undefined, { criterio: "scritture-miste", quota: 0.4 }]) {
      assert.equal(app.rispettaIlContratto(uscita), true, JSON.stringify(uscita));
    }
  });
  test("codice che non compila: il disaccordo lo dice in chiaro", () => {
    const c = { ...contestoBuono(), compilata: false, erroreCompilazione: "Unexpected token" };
    const d = app.confrontaColCapitolato(cap(), c).disaccordi.find((x) => x.id === "forma-funzione");
    assert.match(d.mancato, /Unexpected token/);
  });
  test("un requisito che esplode non fa saltare il confronto: diventa un disaccordo", () => {
    const capRotto = { ...cap(), requisiti: [{ id: "rotto", detta: "x", verifica: () => { throw new Error("bum"); } }] };
    const { coincide, disaccordi } = app.confrontaColCapitolato(capRotto, {});
    assert.equal(coincide, false);
    assert.match(disaccordi[0].mancato, /bum/);
  });
});

describe("I DATI PERSONALI — il requisito che esiste perché il plasmide è fatto per uscire dal telefono", () => {
  test("dati personali trovati: non coincide", () => {
    const c = app.confrontaColCapitolato(cap(), { datiPersonali: ["un indirizzo di posta"] });
    assert.ok(c.disaccordi.find((x) => x.id === "niente-dati-personali"));
  });
  test("UNA PROVA CHE RICOPIA UN TESTO REALE NON PASSA — è così che un dato esce senza che nessuno decida", () => {
    const reale = "Marta ha scritto che il colloquio di giovedì è andato male e che non vuole riprovarci";
    const c = {
      plasmide: { prove: [{ ingresso: reale, atteso: null, perche: "x" }] },
      casiReali: [reale],
    };
    const d = app.confrontaColCapitolato(cap(), c).disaccordi.find((x) => x.id === "prove-non-copiate");
    assert.ok(d, "un caso reale ricopiato dentro una prova esce insieme allo strumento");
  });
  test("una prova inventata e corta passa", () => {
    const c = {
      plasmide: { prove: [{ ingresso: "aaa bbb ccc", atteso: null, perche: "x" }] },
      casiReali: ["Marta ha scritto che il colloquio di giovedì è andato male e che non vuole riprovarci"],
    };
    assert.equal(app.confrontaColCapitolato(cap(), c).disaccordi.find((x) => x.id === "prove-non-copiate"), undefined);
  });
  test("la soglia della copiatura è dichiarata, e sotto non si guarda", () => {
    const fonte = "x".repeat(200);
    assert.equal(app.frammentoCopiato("x".repeat(app.COPIATURA_MINIMA - 1), [fonte]), "");
    assert.equal(app.frammentoCopiato("x".repeat(app.COPIATURA_MINIMA), [fonte]).length, app.COPIATURA_MINIMA);
  });
  test("frammentoCopiato regge ingressi vuoti, nulli e non stringa", () => {
    assert.equal(app.frammentoCopiato(null, ["abc"]), "");
    assert.equal(app.frammentoCopiato("abc", null), "");
    assert.equal(app.frammentoCopiato("abc", [null, undefined, ""]), "");
  });
});

describe("l'afferentazione inversa", () => {
  test("il disaccordo torna indietro DICENDO COSA È MANCATO, non 'riprova'", () => {
    const testo = app.briefDelDisaccordo([{ id: "banco-sani", mancato: "si accende su 2 testi sani" }], 1);
    assert.match(testo, /banco-sani/);
    assert.match(testo, /si accende su 2 testi sani/);
    assert.match(testo, /NON ricominciare da capo/, "ricominciare da capo butta via il giro pagato");
  });
});
