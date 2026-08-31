// Il repertorio lo inventa il modello, la griglia la monta il programma (29/08/2026).
//
// Perché questo file conta più degli altri: le proprietà che il modello NON poteva garantire — nessuna
// ripetizione ravvicinata, media calorica rispettata, pranzi portatili nei giorni giusti, aritmetica
// corretta — qui diventano teoremi verificabili. Non si spera che il modello le rispetti: si dimostra
// che il codice le produce. È la stessa disciplina già applicata al calendario ("l'elenco degli
// impegni lo compone il programma"), portata dove mancava.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

// Repertorio con conteggi DIVERSI per categoria (7/8/9/6/10), come li chiede generaRepertorioPasti:
// è ciò che fa sì che non si ripetano nemmeno le combinazioni di giornata.
const piatti = (n, prefisso, kcalBase, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ nome: `${prefisso}${i + 1}`, ingredienti: `ingr ${i + 1}`, kcal: kcalBase + i * 10, ...extra }));
const REPERTORIO = {
  colazioni: piatti(7, "Col", 300),
  spuntini: piatti(8, "Spu", 150),
  pranzi: [...piatti(5, "Pra", 400), ...piatti(4, "PraPort", 380, { portatile: true })],
  merende: piatti(6, "Mer", 160),
  cene: piatti(10, "Cen", 450),
};

describe("richiestaDiPianoAlimentare — riconosce la richiesta reale, non tutto il resto", () => {
  test("la richiesta vera del Ghost, copiata dal registro", () => {
    assert.equal(app.richiestaDiPianoAlimentare("Crea un piano alimentare bisettimanale, 5 pasti al giorno ( colazione, spuntino, pranzo, merenda, cena), appagante nei sapori"), true);
  });
  test("«menu settimanale con i pasti» scatta", () => {
    assert.equal(app.richiestaDiPianoAlimentare("Fammi un menu settimanale, cinque pasti"), true);
  });
  test("un piano di allenamento NON scatta — questa macchina sa montare solo pasti", () => {
    assert.equal(app.richiestaDiPianoAlimentare("Fammi un programma di allenamento settimanale"), false);
  });
  test("la conversazione normale non scatta", () => {
    assert.equal(app.richiestaDiPianoAlimentare("Quando è l'appuntamento con Marzio?"), false);
    assert.equal(app.richiestaDiPianoAlimentare("Ho dormito male"), false);
  });
});

describe("il riquadro «capacità spenta» non deve accusare una capacità a caso", () => {
  // Osservato dal vivo il 29/08: il Ghost chiede un piano alimentare, il modello gli fa una domanda
  // di chiarimento ("Confermi il repertorio piatti?"), e compare un riquadro rosso che dice che la
  // capacità che serve è spenta — nominando «Inviare una mail». Con un piano alimentare la mail non
  // c'entra niente. La causa: si guardava se esistesse ANCHE UNA SOLA azione spenta da qualche
  // parte, non se fosse spenta quella chiesta. Siccome le sei azioni esterne nascono spente, bastava
  // un verbo d'azione nella frase ("Crea un piano...") per far comparire l'avviso.
  // La richiesta REALE, per intero come sta nel registro: abbreviarla perde i verbi della coda
  // ("scrivi", "tieni conto") che sono parte del motivo per cui il vecchio controllo si accendeva.
  const RICHIESTA_PIANO = "Crea un piano alimentare bisettimanale, 5 pasti al giorno ( colazione, spuntino, pranzo, merenda, cena), appagante nei sapori e nelle quantità, non monotono, sulle 1600 kcal di media, non lineare nella settimana per non addormentare il metabolismo e con un buon apporto proteico per il mantenimento della massa muscolare. Nei giorni di lunedì, mercoledì e venerdì per il pranzo prevedi anche un'opzione da asporto che possa mangiare in macchina o a studio. Sono aperto a sostituire la pasta con pasta di farine di legumi e il pane con pane di segale o wasa. Preferisco colazioni salate. E vorrei escludere ceci e il pesce ( molluschi, crostacei e tonno in scatola sono ok) per ogni pasto scrivi le quantità e le calorie. Tieni conto del mio profilo utente";

  test("la richiesta del piano fa scattare la selezione (è il verbo «Crea»): è il motivo per cui il vecchio controllo si accendeva", () => {
    assert.equal(app.meritaTurnoDiSelezione(RICHIESTA_PIANO), true);
  });
  test("…ma NON nomina nessuna capacità: è questo il fatto che il riquadro deve guardare", () => {
    assert.equal(app.capacitaNominata(RICHIESTA_PIANO), null,
      "se questo tornasse non-null, il riquadro tornerebbe ad accusare una capacità che il Ghost non ha chiesto");
  });
  test("una richiesta che nomina DAVVERO una capacità continua a essere riconosciuta", () => {
    assert.equal(app.capacitaNominata("Puoi mandare una mail a Marzio con il riepilogo?"), "invia_mail");
  });
});

describe("estraiParametriPiano — i numeri li legge il codice, non il modello", () => {
  test("«bisettimanale» sono quattordici giorni", () => {
    assert.equal(app.estraiParametriPiano("piano alimentare bisettimanale").giorni, 14);
  });
  test("«sulle 1600 kcal di media» viene letto", () => {
    assert.equal(app.estraiParametriPiano("sulle 1600 kcal di media").kcalMedia, 1600);
  });
  test("i giorni da asporto si leggono solo se l'asporto è davvero nominato", () => {
    const con = app.estraiParametriPiano("Nei giorni di lunedì, mercoledì e venerdì per il pranzo prevedi un'opzione da asporto");
    assert.deepEqual(con.giorniPortatili, [0, 2, 4]);
    // Senza la parola "asporto", nominare un giorno non deve bastare: potrebbe essere lì per altro.
    const senza = app.estraiParametriPiano("Lunedì ho la visita dal dentista, fammi un piano alimentare");
    assert.deepEqual(senza.giorniPortatili, []);
  });
  test("senza indicazioni resta una settimana e nessun bersaglio inventato", () => {
    const p = app.estraiParametriPiano("fammi un piano alimentare");
    assert.equal(p.giorni, 7);
    assert.equal(p.kcalMedia, null);
  });
});

describe("validaRepertorio — un piatto inutilizzabile si scarta qui, non nella griglia", () => {
  test("un piatto senza calorie viene scartato", () => {
    const r = app.validaRepertorio({ ...REPERTORIO, colazioni: [...REPERTORIO.colazioni, { nome: "Rotto", ingredienti: "x" }] });
    assert.equal(r.colazioni.length, 7, "il piatto senza kcal non deve entrare");
  });
  test("una categoria vuota invalida tutto il repertorio — meglio niente che una colonna di buchi", () => {
    assert.equal(app.validaRepertorio({ ...REPERTORIO, cene: [] }), null);
  });
  test("un JSON non-oggetto non fa esplodere niente", () => {
    for (const v of [null, undefined, "testo", 42]) assert.equal(app.validaRepertorio(v), null);
  });

  // 29/08/2026 — osservato dal vivo, con questi nomi esatti.
  test("un piatto il cui NOME racconta l'esclusione viene scartato", () => {
    const sporchi = [
      { nome: "Pasta di ceci SKIP", ingredienti: "pasta di ceci ESCLUSA, sostituita con: pasta di edamame 80g", kcal: 505 },
      { nome: "Hummus di ceci SKIP", ingredienti: "hummus di ceci ESCLUSO, sostituito con: Philadelphia light 40g", kcal: 190 },
      { nome: "Insalata di tonno (sostituita con pollo)", ingredienti: "pollo 100g", kcal: 300 },
    ];
    const r = app.validaRepertorio({ ...REPERTORIO, pranzi: [...REPERTORIO.pranzi, ...sporchi] });
    assert.equal(r.pranzi.length, REPERTORIO.pranzi.length,
      "nessuno dei piatti che nominano l'esclusione deve entrare nel repertorio");
  });
  test("un piatto con un nome normale non viene toccato", () => {
    const r = app.validaRepertorio({ ...REPERTORIO, pranzi: [...REPERTORIO.pranzi, { nome: "Pasta di edamame al pomodoro", ingredienti: "pasta di edamame 80g", kcal: 505 }] });
    assert.equal(r.pranzi.length, REPERTORIO.pranzi.length + 1);
  });
});

describe("montaPianoAlimentare — le proprietà che il modello non poteva garantire", () => {
  const piano = app.montaPianoAlimentare(REPERTORIO, { giorni: 14, kcalMedia: 1600, giorniPortatili: [0, 2, 4] });

  test("quattordici giorni, tutti montati", () => {
    assert.equal(piano.righe.length, 14);
  });

  // 29/08/2026 — IL BUCO CHE HA LASCIATO PASSARE IL DIFETTO. Il teorema qui sotto escludeva i
  // pranzi, cioè l'unica categoria servita da DUE liste (portatili e non) — proprio quella dove la
  // ripetizione poteva nascere. Il Ghost si è ritrovato lo stesso pranzo martedì e mercoledì, e i
  // test erano verdi. Questi due controlli chiudono il buco: sono le prove che mancavano.
  test("TEOREMA 1-bis — i PRANZI non si ripetono a giorni ravvicinati, attraverso ENTRAMBE le liste", () => {
    const pranzi = piano.righe.map((r) => r.pranzo.nome);
    for (let i = 0; i < pranzi.length; i++) {
      for (let j = i + 1; j < Math.min(i + 4, pranzi.length); j++) {
        assert.notEqual(pranzi[i], pranzi[j],
          `"${pranzi[i]}" al giorno ${i} e ${j} (distanza ${j - i}): è il difetto del 29/08, il pranzo da asporto e quello normale pescavano da liste con contatori separati`);
      }
    }
  });

  test("TEOREMA 1-ter — le CENE non si ripetono nella stessa settimana", () => {
    const cene = piano.righe.map((r) => r.cena.nome);
    for (let i = 0; i < cene.length; i++) {
      for (let j = i + 1; j < Math.min(i + 7, cene.length); j++) {
        assert.notEqual(cene[i], cene[j],
          `"${cene[i]}" al giorno ${i} e ${j}: con dieci cene in repertorio non c'è motivo di ripeterne una entro sei giorni`);
      }
    }
  });

  test("TEOREMA 1 — nessun piatto si ripete prima di L giorni, con L = quanti piatti ha la sua categoria", () => {
    for (const [categoria, chiave] of [["colazioni", "colazione"], ["spuntini", "spuntino"], ["merende", "merenda"]]) {
      const L = REPERTORIO[categoria].length;
      const usati = piano.righe.map((r) => r[chiave].nome);
      for (let i = 0; i < usati.length; i++) {
        for (let j = i + 1; j < Math.min(i + L, usati.length); j++) {
          assert.notEqual(usati[i], usati[j], `${chiave}: "${usati[i]}" ricompare dopo ${j - i} giorni, ma la categoria ne ha ${L}`);
        }
      }
    }
  });

  test("TEOREMA 2 — nei giorni dichiarati il pranzo è davvero portatile", () => {
    for (const r of piano.righe) {
      const gs = r.indice % 7;
      if ([0, 2, 4].includes(gs)) {
        assert.equal(r.pranzo.portatile, true, `${r.giorno} (giorno ${r.indice}) doveva avere un pranzo da asporto`);
        assert.equal(r.portatile, true);
      }
    }
  });

  test("TEOREMA 3 — la media reale è vicina a quella chiesta (la cena viene scelta per avvicinarla)", () => {
    assert.ok(Math.abs(piano.mediaReale - 1600) <= 60, `media reale ${piano.mediaReale}, chiesta 1600`);
  });

  test("TEOREMA 4 — i giorni NON sono tutti uguali: la non linearità è voluta e misurabile", () => {
    assert.ok(piano.massimo - piano.minimo >= 100, `variazione troppo piatta: da ${piano.minimo} a ${piano.massimo}`);
  });

  test("TEOREMA 5 — l'aritmetica è giusta: il totale è la somma dei cinque pasti", () => {
    for (const r of piano.righe) {
      assert.equal(r.totale, r.colazione.kcal + r.spuntino.kcal + r.pranzo.kcal + r.merenda.kcal + r.cena.kcal);
    }
  });

  test("le cene non si ripetono a giorni ravvicinati", () => {
    const cene = piano.righe.map((r) => r.cena.nome);
    for (let i = 1; i < cene.length; i++) assert.notEqual(cene[i], cene[i - 1], "due cene identiche di seguito");
  });

  test("senza bersaglio calorico monta lo stesso, senza inventare numeri", () => {
    const p = app.montaPianoAlimentare(REPERTORIO, { giorni: 7 });
    assert.equal(p.righe.length, 7);
    assert.equal(p.kcalMedia, null);
  });

  test("se si chiedono giorni da asporto ma nessun pranzo è portatile, lo dichiara invece di fingere", () => {
    const senzaPortatili = { ...REPERTORIO, pranzi: piatti(5, "Pra", 400) };
    const p = app.montaPianoAlimentare(senzaPortatili, { giorni: 7, giorniPortatili: [0, 2, 4] });
    assert.equal(p.giorniPortatiliSenzaPiatti, true);
  });

  test("un repertorio invalido non produce una griglia rotta, produce null", () => {
    assert.equal(app.montaPianoAlimentare({ colazioni: [] }), null);
    assert.equal(app.montaPianoAlimentare(null), null);
  });
});

describe("le esclusioni le fa rispettare il programma, non la buona volontà del modello", () => {
  // 30/08/2026 — il Ghost: "ci sono ancora le zucchine". Il prompt le vietava, il modello le ha
  // messe lo stesso. Chiedere non è garantire: ora il piatto che le contiene non entra proprio.
  const CON_ZUCCHINE = {
    ...REPERTORIO,
    pranzi: [...REPERTORIO.pranzi, { nome: "Cous cous estivo", ingredienti: "cous cous 60g, zucchine grigliate 100g", kcal: 470 }],
    cene: [...REPERTORIO.cene, { nome: "Prosciutto e verdure", ingredienti: "prosciutto 120g, zucchine grigliate 300g", kcal: 360 }],
  };

  test("un piatto che contiene un alimento escluso viene tolto dal repertorio", () => {
    const { repertorio, scartati } = app.filtraRepertorioPerVincoli(CON_ZUCCHINE, ["escludi le zucchine"]);
    assert.equal(scartati.length, 2);
    assert.ok(scartati.every((s) => s.per === "zucchine"));
    assert.ok(!repertorio.pranzi.some((p) => /zucchine/i.test(p.ingredienti)));
    assert.ok(!repertorio.cene.some((p) => /zucchine/i.test(p.ingredienti)));
  });

  test("e quindi il piano montato non può contenerlo, comunque vada", () => {
    const { repertorio } = app.filtraRepertorioPerVincoli(CON_ZUCCHINE, ["escludi le zucchine"]);
    const testo = app.formatPianoAlimentare(app.montaPianoAlimentare(repertorio, { giorni: 14, kcalMedia: 1600, giorniPortatili: [0, 2, 4] }));
    assert.doesNotMatch(testo, /zucchine/i);
  });

  test("la tassonomia vale anche qui: chi esclude «il pesce» perde il salmone, non solo la parola «pesce»", () => {
    const conSalmone = { ...REPERTORIO, cene: [...REPERTORIO.cene, { nome: "Salmone al forno", ingredienti: "salmone 150g, finocchi 200g", kcal: 450 }] };
    const { scartati } = app.filtraRepertorioPerVincoli(conSalmone, ["escludi il pesce"]);
    assert.ok(scartati.some((s) => s.piatto === "Salmone al forno"));
  });

  test("le eccezioni dichiarate vengono risparmiate: «il pesce, ma crostacei e tonno in scatola sono ok»", () => {
    const conGamberi = { ...REPERTORIO, cene: [...REPERTORIO.cene, { nome: "Gamberi alla piastra", ingredienti: "gamberi 200g, rucola", kcal: 300 }] };
    const { scartati } = app.filtraRepertorioPerVincoli(conGamberi, ["escludi il pesce che non sia crostacei o tonno in scatola"]);
    assert.ok(!scartati.some((s) => s.piatto === "Gamberi alla piastra"), "i crostacei erano dichiarati ammessi");
  });

  test("senza vincoli il repertorio passa intero", () => {
    const { repertorio, scartati } = app.filtraRepertorioPerVincoli(REPERTORIO, []);
    assert.equal(scartati.length, 0);
    assert.equal(repertorio.cene.length, REPERTORIO.cene.length);
  });

  test("se un'intera categoria resta vuota il repertorio non è montabile: meglio nessun piano che uno che viola un vincolo", () => {
    const soloZucchine = { ...REPERTORIO, cene: [{ nome: "Zucchine ripiene", ingredienti: "zucchine 300g", kcal: 300 }] };
    const { repertorio } = app.filtraRepertorioPerVincoli(soloZucchine, ["niente zucchine"]);
    assert.equal(repertorio, null);
  });
});

describe("le forme in cui il Ghost scrive davvero un vincolo", () => {
  // 31/08/2026 — il Ghost ha aggiunto l'esclusione delle zucchine nei vincoli, e la domanda è
  // diventata: il programma la CAPISCE? Misurate dodici formulazioni plausibili: cinque non
  // producevano niente. Le due postposte qui sotto sono state aggiunte; le tre che restano fuori
  // ci restano di proposito, e per quelle l'interfaccia dice apertamente di non aver capito.
  const capisce = (frase) => app.alimentiEsclusiDaiVincoli([frase]);

  for (const frase of ["niente zucchine", "no zucchine", "escludi le zucchine", "evito le zucchine",
                       "senza zucchine", "non mangio zucchine", "zucchine escluse", "non mi piacciono le zucchine"]) {
    test(`«${frase}» → riconosciuta`, () => {
      assert.deepEqual(capisce(frase), ["zucchine"]);
    });
  }

  test("più alimenti in una frase sola", () => {
    assert.deepEqual(capisce("niente zucchine e melanzane").sort(), ["melanzane", "zucchine"]);
  });

  test("la tassonomia si applica: «escludi il pesce» tira dentro il salmone", () => {
    const a = capisce("escludi il pesce");
    assert.ok(a.includes("salmone") && a.includes("merluzzo"), "deve espandere la categoria, non fermarsi alla parola");
  });

  test("le eccezioni restano fuori dall'esclusione", () => {
    const a = capisce("escludi il pesce che non sia crostacei o tonno in scatola");
    assert.ok(!a.includes("gamberi"), "i crostacei erano dichiarati ammessi");
  });

  test("una parola nuda NON viene interpretata come esclusione — e deve restare così", () => {
    // In un campo vincoli "zucchine" da solo è ambiguo quanto "colazioni salate" o "1600 kcal":
    // indovinare qui produrrebbe esclusioni mai chieste. L'interfaccia lo dichiara invece di fingere.
    assert.deepEqual(capisce("zucchine"), []);
    assert.deepEqual(capisce("colazioni salate"), []);
    assert.deepEqual(capisce("1600 kcal"), []);
  });
});

describe("il controllo del piano deve saper LEGGERE il piano montato dal programma", () => {
  // 30/08/2026 — difetto scoperto guardando: avevo collegato controllaPianoAlimentare al piano
  // montato, ma giorniDelPiano riconosceva ZERO giorni nel formato a tabella (i giorni stanno
  // dentro la riga, non a inizio riga per esteso). Il controllo usciva subito con null: la rete
  // era appesa a un formato che non sapeva leggere, e nessun avviso poteva comparire. Mai.
  const piano = app.montaPianoAlimentare(REPERTORIO, { giorni: 14, kcalMedia: 1600, giorniPortatili: [0, 2, 4] });
  const testo = app.formatPianoAlimentare(piano);

  test("riconosce tutti i quattordici giorni nel formato a tabella", () => {
    assert.equal(app.giorniDelPiano(testo).length, 14);
  });
  test("il corpo della giornata non è vuoto: è dentro la riga, e va incluso", () => {
    for (const g of app.giorniDelPiano(testo)) {
      assert.ok(g.corpo.length > 20, `giorno "${g.etichetta}" con corpo vuoto: non ci sarebbe niente da controllare`);
    }
  });
  test("e quindi un'esclusione violata verrebbe vista davvero", () => {
    const conZucchine = { ...REPERTORIO, cene: [...REPERTORIO.cene, { nome: "Cena test", ingredienti: "zucchine grigliate 300g", kcal: 300 }] };
    const t = app.formatPianoAlimentare(app.montaPianoAlimentare(conZucchine, { giorni: 14, kcalMedia: 1600 }));
    const scarti = app.controllaPianoAlimentare(t, ["escludi le zucchine"], "piano");
    assert.ok(scarti && scarti.scarti.some((s) => s.tipo === "esclusione"), "la rete deve accorgersene");
  });
});

describe("formatPianoAlimentare — markdown che diventa una tabella vera nel .docx", () => {
  const piano = app.montaPianoAlimentare(REPERTORIO, { giorni: 14, kcalMedia: 1600, giorniPortatili: [0, 2, 4] });
  const testo = app.formatPianoAlimentare(piano);

  test("produce righe di tabella che il generatore .docx sa riconoscere", () => {
    const righe = testo.split("\n").filter((r) => app.eRigaDiTabella(r));
    assert.ok(righe.length >= 14, "una riga per giorno, più intestazioni e separatrici");
    // Il ponte con il lavoro sul .docx: queste righe devono essere parsabili come tabella vera.
    const parsed = app.parseTabellaMarkdown(righe.slice(0, 10));
    assert.ok(parsed && parsed.colonne === 7);
  });

  test("le due settimane hanno la loro intestazione", () => {
    assert.match(testo, /## Settimana 1/);
    assert.match(testo, /## Settimana 2/);
  });

  test("la media dichiarata è quella CALCOLATA, con lo scarto dichiarato apertamente", () => {
    assert.match(testo, new RegExp(`Media reale: \\*\\*${piano.mediaReale} kcal\\*\\*`));
    assert.match(testo, /chiesta 1600, scarto/);
  });

  test("non contiene meta-narrazione: è composto dal codice, non scritto dal modello", () => {
    assert.deepEqual(app.trovaMetaNarrazione(testo), []);
  });

  test("non è degenerato secondo la guardia — una tabella non è ripetizione", () => {
    assert.equal(app.diagnosiDegenerazione(testo), null);
  });
});
