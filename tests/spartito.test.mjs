// GLI SPARTITI — 14/09/2026.
//
// La cosa più importante di questo lavoro è ciò che NON è stato costruito: nessuno storage nuovo,
// nessuna forma nuova. Uno spartito è TESTO in notazione ABC, quindi è un documento come gli altri
// — entra in un percorso, va nel magazzino dei testi, sale nel file di sync, finisce nel backup, si
// cerca con le stesse parole. Queste prove difendono quella scelta prima di ogni altra cosa.
//
// E difendono l'accettore: un oggetto solo, letto due volte. `briefDelloSpartito` dice al modello
// cosa deve fare, `analizzaSpartito` controlla il risultato con le STESSE regole, perché sono la
// stessa riga dello stesso array. Quando ho scritto la prova di fumo nel browser mi ha bocciato lo
// spartito che avevo scritto a mano — «riga 9 ha 15 sillabe su 10 note» — e aveva ragione lui.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const {
  analizzaSpartito, battuteDi, noteDi, briefDelloSpartito, documentoSpartito, eSpartito,
  nuovoPromemoria, ordinaPromemoria, promemoriaOrfani, promemoriaDellaBattuta,
  REQUISITI_SPARTITO, SPARTITO_ESEMPIO, PROMEMORIA_TETTO,
} = app;

const CON_VERSI = [
  "X:1", "T:Atto IV — tema", "M:3/4", "L:1/4", "Q:1/4=72", "K:Am",
  "A B c | d c B | A G A | B2 z |",
  "w: Non e-ro poi fui due al-lo-ra og-gi so-no qui",
].join("\n");

describe("L'ACCETTORE — la stessa riga letta dai due lati", () => {
  test("ogni requisito ha sia cosa si dice al modello sia cosa si controlla", () => {
    // Se uno dei due manca, il requisito è decorativo: o il modello non lo sa, o nessuno lo verifica.
    for (const r of REQUISITI_SPARTITO) {
      assert.ok(r.id, JSON.stringify(r).slice(0, 60));
      assert.ok(r.detta && r.detta.length > 30, `«${r.id}» non dice niente al modello`);
      assert.equal(typeof r.verifica, "function", `«${r.id}» non si controlla`);
    }
  });

  test("quello che si dice al modello contiene TUTTI i requisiti", () => {
    const brief = briefDelloSpartito({ argomento: "il tema dell'Atto IV", conVersi: true });
    for (const r of REQUISITI_SPARTITO) {
      assert.ok(brief.includes(r.detta), `il brief non dice «${r.id}»`);
    }
  });

  test("senza versi, il requisito sui versi non si chiede nemmeno", () => {
    const brief = briefDelloSpartito({ argomento: "x", conVersi: false });
    const versi = REQUISITI_SPARTITO.find((r) => r.id === "versi-allineati");
    assert.ok(!brief.includes(versi.detta), "chiede i versi allineati a chi non ha chiesto i versi");
  });

  test("uno spartito buono passa", () => {
    const a = analizzaSpartito(SPARTITO_ESEMPIO);
    assert.equal(a.ok, true, a.errori.map((e) => e.motivo).join(" · "));
    assert.equal(a.titolo, "Prova");
    assert.equal(a.metro, "4/4");
    assert.equal(a.tonalita, "Cmaj");
    assert.equal(a.battute.length, 4);
  });
});

describe("COSA VIENE RIFIUTATO, e con che motivo", () => {
  const rifiuta = (abc, id) => {
    const a = analizzaSpartito(abc);
    assert.equal(a.ok, false, "è passato e non doveva");
    assert.ok(a.errori.some((e) => e.id === id), `motivi: ${a.errori.map((e) => e.id).join(", ")} — atteso ${id}`);
  };

  test("senza tonalità, senza titolo, senza indice", () => {
    rifiuta("X:1\nT:P\nM:4/4\nC D E F | G A B c |", "intestazione-minima");
    rifiuta("X:1\nM:4/4\nK:C\nC D E F | G A B c |", "intestazione-minima");
  });

  test("un'intestazione DOPO K: — le note non comincerebbero dove dovrebbero", () => {
    rifiuta("X:1\nT:P\nM:4/4\nK:C\nC D E F |\nQ:1/4=90\nG A B c |", "k-per-ultima");
  });

  test("una battuta sola non è uno spartito", () => {
    rifiuta("X:1\nT:P\nM:4/4\nK:C\nC D E F |", "abbastanza-musica");
  });

  test("PROSA IN MEZZO ALLE NOTE — l'errore tipico di un modello che si spiega", () => {
    rifiuta("X:1\nT:P\nM:4/4\nK:C\nC D E F | Ecco la melodia principale | G A B c |", "solo-caratteri-di-musica");
  });

  test("senza metro dichiarato", () => {
    rifiuta("X:1\nT:P\nK:C\nC D E F | G A B c |", "metro-dichiarato");
  });

  test("I VERSI CHE NON TORNANO CON LE NOTE — quello che ha bocciato me", () => {
    rifiuta("X:1\nT:A\nM:4/4\nL:1/4\nK:Am\nA B c d | e d c B |\nw: una parola sola qui e anche qui e ancora poi domani sera tardi oggi |", "versi-allineati");
    // E quelli che tornano passano: la prova serve a poco se boccia tutto.
    assert.equal(analizzaSpartito(CON_VERSI).ok, true, analizzaSpartito(CON_VERSI).errori.map((e) => e.motivo).join(" · "));
  });

  test("una piccola differenza di sillabe è tollerata: un verso non è un foglio di calcolo", () => {
    // Le legature e le sinalefi fanno sballare il conto di una sillaba o due anche a un musicista.
    // Il requisito serve a prendere i versi SCOLLATI, non a fare le pulci.
    // Scrivendo questa prova ho contato le sillabe a mano e ho sbagliato DUE volte di seguito —
    // «Non e-ro poi fui due og-gi qui an-co» sono undici sillabe, non dieci. Il banco mi ha
    // bocciato tutte e due le volte e aveva ragione. Quindi il verso non lo scrivo più a mano:
    // lo genera il conto, che è lo stesso motivo per cui esiste il requisito.
    const dueInPiu = `X:1\nT:A\nM:4/4\nL:1/4\nK:Am\nA B c d | e d c B |\nw: ${Array.from({ length: 10 }, (_, i) => "la" + i).join(" ")}`;
    const a = analizzaSpartito(dueInPiu);
    assert.equal(a.versi[0].sillabe - a.versi[0].note, 2, "la prova non sta misurando quello che dice");
    assert.equal(a.ok, true, a.errori.map((e) => e.motivo).join(" · "));
  });

  test("la tolleranza cresce con la lunghezza del verso, ma non diventa «qualunque cosa»", () => {
    const note = 8;
    const conSillabe = (n) => `X:1\nT:A\nM:4/4\nL:1/4\nK:Am\nA B c d | e d c B |\nw: ${Array.from({ length: n }, (_, i) => "la" + i).join(" ")}`;
    assert.equal(analizzaSpartito(conSillabe(note + 2)).ok, true, "due in più devono passare");
    assert.equal(analizzaSpartito(conSillabe(note + 3)).ok, false, "tre in più su otto note non è una sfumatura");
    assert.equal(analizzaSpartito(conSillabe(note - 3)).ok, false, "vale anche nell'altro verso");
  });
});

describe("LE BATTUTE — l'ancora di un promemoria", () => {
  test("si contano sulle stanghette, e una ripresa non ne inventa una vuota", () => {
    assert.equal(battuteDi("C D E F | G A B c |").length, 2);
    assert.equal(battuteDi("|: C D E F :| G A B c |").length, 2, "la ripresa ha creato battute fantasma");
    assert.equal(battuteDi("C D E F || G A B c |]").length, 2);
  });

  test("le battute sono numerate di fila anche su più righe", () => {
    const b = battuteDi("C D | E F |\nG A | B c |");
    assert.deepEqual(b.map((x) => x.numero), [1, 2, 3, 4]);
    assert.equal(b[2].testo, "G A");
  });

  test("le intestazioni e i commenti non sono musica", () => {
    assert.equal(battuteDi("X:1\nT:P\n% un commento\nK:C\nC D | E F |").length, 2);
  });

  test("le note di una battuta: un accordo vale UNA nota, perché sotto ci va UNA sillaba", () => {
    assert.equal(noteDi("C D E F").length, 4);
    assert.equal(noteDi("[CEG] D").length, 2);
    assert.equal(noteDi('"Am" A B').length, 2, "il nome dell\'accordo scritto sopra non è una nota");
    assert.equal(noteDi("^C _D =E z").length, 4, "le alterazioni e la pausa contano");
  });
});

describe("I PROMEMORIA — ancorati alla battuta, non al carattere", () => {
  test("un promemoria valido, e due che non lo sono", () => {
    assert.equal(nuovoPromemoria({ battuta: 9, testo: "qui entra la voce" }).ok, true);
    assert.equal(nuovoPromemoria({ battuta: 0, testo: "x" }).ok, false);
    assert.equal(nuovoPromemoria({ battuta: 3, testo: "   " }).ok, false);
    assert.equal(nuovoPromemoria({ battuta: "nove", testo: "x" }).ok, false);
  });

  test("L'ANCORA SOPRAVVIVE ALLA RISCRITTURA DELLO SPARTITO — è il motivo della scelta", () => {
    // Un promemoria attaccato al carattere 412 muore appena si aggiunge una parola al titolo.
    // Qui si riscrive l'intestazione, si traspone, si aggiungono i versi: la battuta 3 resta la 3.
    const prima = "X:1\nT:P\nM:3/4\nL:1/4\nK:Am\nA B c | d c B | A G A | B2 z |";
    const dopo = "X:1\nT:Atto IV — tema, seconda stesura\nC:Ghost\nM:3/4\nL:1/4\nQ:1/4=72\nK:Am\nA B c | d c B | A G A | B2 z |\nw: Non e-ro poi fui due al-lo-ra og-gi so-no qui";
    const p = nuovoPromemoria({ battuta: 3, testo: "qui entra la voce" }).promemoria;
    assert.equal(battuteDi(prima)[p.battuta - 1].testo, "A G A");
    assert.equal(battuteDi(dopo)[p.battuta - 1].testo, "A G A", "l'ancora si è spostata");
  });

  test("ordinati per battuta, con un tetto", () => {
    const lista = [
      nuovoPromemoria({ battuta: 9, testo: "tardi" }).promemoria,
      nuovoPromemoria({ battuta: 2, testo: "presto" }).promemoria,
      { battuta: 5, testo: "mezzo" },
      { battuta: 1, testo: "" },      // senza testo: fuori
      { testo: "senza battuta" },      // senza ancora: fuori
    ];
    assert.deepEqual(ordinaPromemoria(lista).map((p) => p.battuta), [2, 5, 9]);
    const tanti = Array.from({ length: PROMEMORIA_TETTO + 20 }, (_, i) => ({ battuta: i + 1, testo: "x" }));
    assert.equal(ordinaPromemoria(tanti).length, PROMEMORIA_TETTO);
  });

  test("un promemoria oltre l'ultima battuta si SEGNALA, non si butta (Legge 14)", () => {
    // Uno spartito si accorcia mentre lo si lavora. Buttare una nota del Ghost perché ha tagliato
    // due battute sarebbe la sovrascrittura distruttiva che la Legge 14 vieta.
    const lista = [{ battuta: 2, testo: "dentro" }, { battuta: 99, testo: "fuori" }];
    assert.deepEqual(promemoriaOrfani(lista, 4).map((p) => p.testo), ["fuori"]);
    assert.equal(ordinaPromemoria(lista).length, 2, "l'orfano è stato buttato invece che segnalato");
  });

  test("quelli di una battuta si trovano tutti", () => {
    const lista = [{ battuta: 3, testo: "uno" }, { battuta: 3, testo: "due" }, { battuta: 4, testo: "altro" }];
    assert.deepEqual(promemoriaDellaBattuta(lista, 3).map((p) => p.testo), ["uno", "due"]);
    assert.deepEqual(promemoriaDellaBattuta(lista, 7), []);
  });
});

describe("UNO SPARTITO E' UN DOCUMENTO COME GLI ALTRI — la scelta che evita tutto il resto", () => {
  const doc = documentoSpartito({ id: "sp1", titolo: "Atto IV — tema", abc: CON_VERSI, promemoria: [{ battuta: 3, testo: "voce" }] });

  test("il contenuto vive in `text`, come ogni altro documento", () => {
    // È ciò che fa funzionare senza sapere niente di musica: magazzino dei testi, file di sync,
    // backup, ricerca fra i documenti. Se il contenuto stesse in un campo suo, tutte e quattro le
    // cose andrebbero rifatte.
    assert.equal(doc.text, CON_VERSI);
    assert.ok(doc.id && doc.name && doc.title && doc.date);
    assert.equal(doc.driveId, null);
  });

  test("si riconosce come spartito, e un documento normale no", () => {
    assert.equal(eSpartito(doc), true);
    assert.equal(eSpartito({ name: "atto-i.md", text: "prosa" }), false);
    assert.equal(eSpartito(null), false);
    // Anche uno spartito vecchio senza il campo `tipo` si riconosce dal nome.
    assert.equal(eSpartito({ name: "vecchio.abc" }), true);
  });

  test("passa per il magazzino dei testi come qualunque altro documento", () => {
    // La prova che la scelta ha funzionato davvero: nessun codice del magazzino sa cosa sia uno
    // spartito, eppure lo tratta bene.
    const percorsi = [{ id: "p1", documents: [doc] }];
    const snelli = app.percorsiSnelli(percorsi);
    assert.ok(snelli.length === 1);
    assert.deepEqual(app.coppieDiTesto(percorsi), [["sp1", CON_VERSI]]);
  });

  test("i promemoria viaggiano col documento, ordinati", () => {
    assert.equal(doc.promemoria.length, 1);
    assert.equal(doc.promemoria[0].battuta, 3);
    assert.equal(doc.tipo, "spartito");
  });

  test("il nome del file finisce in .abc, senza caratteri che rompono un filesystem", () => {
    const strano = documentoSpartito({ id: "x", titolo: 'Atto IV: "tema" / bozza?', abc: SPARTITO_ESEMPIO });
    assert.match(strano.name, /\.abc$/);
    assert.ok(!/[:"/?]/.test(strano.name), strano.name);
  });
});
