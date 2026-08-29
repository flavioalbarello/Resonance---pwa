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
});

describe("montaPianoAlimentare — le proprietà che il modello non poteva garantire", () => {
  const piano = app.montaPianoAlimentare(REPERTORIO, { giorni: 14, kcalMedia: 1600, giorniPortatili: [0, 2, 4] });

  test("quattordici giorni, tutti montati", () => {
    assert.equal(piano.righe.length, 14);
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
