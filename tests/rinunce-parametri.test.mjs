// «Dovrebbe funzionare a prescindere dal modello utilizzato, non credi?» (02/09/2026)
//
// Da dove viene. Dal registro del telefono di Marta, stanotte: selezione-azione, shell-turn e
// simbiosi-proactive tutte fallite, tre volte di fila in otto minuti, con
//     "Reasoning is mandatory for this endpoint and cannot be disabled."
// su model "google/gemini-3.1-pro-preview". Ha riscritto lo stesso messaggio tre volte senza
// ottenere niente. Non una risposta peggiore: nessuna risposta.
//
// La causa era una riga giusta applicata male. Il 29/08 il registro aveva DIMOSTRATO che su Kimi
// `reasoning.max_tokens` non limita niente e che `enabled:false` porta il ragionamento a zero.
// Corretto — per quel modello. L'errore è stato renderlo INCONDIZIONATO.
//
// La prima correzione chiudeva quel parametro. Il Ghost l'ha smontata in una riga: `reasoning` non
// ha niente di speciale, è uno dei campi FACOLTATIVI che l'app aggiunge perché migliorano qualcosa
// su UN modello, e ogni modello nuovo può rifiutarne un altro. Chiudere il caso osservato lasciava
// in piedi la classe.
//
// Il principio che queste prove difendono: un parametro facoltativo non deve mai poter impedire una
// risposta. Con tre vincoli che valgono quanto il principio — si rinuncia solo al facoltativo, non
// si ripiega alla cieca, ogni rinuncia si paga una volta sola.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();
const corpoPieno = () => ({
  model: "x/y", max_tokens: 900, temperature: 0.7,
  messages: [{ role: "system", content: "s" }],
  reasoning: { enabled: false }, repetition_penalty: 1.05, frequency_penalty: 0.1,
  tools: [{ type: "openrouter:web_search" }], tool_choice: "required", max_tool_calls: 3,
});

describe("riconoscere a QUALE parametro rinunciare", () => {
  test("IL MESSAGGIO ESATTO DAL REGISTRO DI MARTA — l'unico osservato dal vivo", () => {
    const r = app.rinunciaPerErrore("Reasoning is mandatory for this endpoint and cannot be disabled.", corpoPieno());
    assert.equal(r.id, "reasoning");
  });
  test("le altre tre forme note vengono riconosciute ciascuna sul proprio campo", () => {
    const casi = [
      ["temperature is not supported by this model", "temperatura"],
      ["repetition_penalty: unsupported parameter for this provider", "penalita"],
      ["No endpoints found that support tool use", "ricerca_web"],
    ];
    for (const [messaggio, atteso] of casi) {
      assert.equal(app.rinunciaPerErrore(messaggio, corpoPieno())?.id, atteso, messaggio);
    }
  });
  test("LA SECONDA VIA: una formulazione mai vista, purché nomini un campo che stiamo mandando", () => {
    // Serve perché un fornitore può riformulare quando vuole. Senza questa via, la prossima
    // formulazione rimetterebbe l'app di qualcuno a zero e la diagnosi ricomincerebbe da capo.
    assert.equal(app.rinunciaPerErrore("The field 'temperature' is not allowed on this request", corpoPieno())?.id, "temperatura");
    assert.equal(app.rinunciaPerErrore("Unrecognized parameter: frequency_penalty", corpoPieno())?.id, "penalita");
  });

  describe("NON SI RIPIEGA ALLA CIECA — riprovare a caso vuol dire pagare tre chiamate per lo stesso errore", () => {
    test("gli errori che non parlano di parametri non fanno rinunciare a niente", () => {
      for (const m of [
        "Insufficient credits", "Rate limit exceeded", "model not found",
        "Provider returned error", "context length exceeded",
        "This model supports reasoning", // nomina reasoning ma non è un rifiuto
        "", null, undefined,
      ]) assert.equal(app.rinunciaPerErrore(m, corpoPieno()), null, String(m));
    });
    test("non si rinuncia a un campo che NON stiamo mandando", () => {
      const senzaTools = { model: "x/y", messages: [], temperature: 0.7 };
      assert.equal(app.rinunciaPerErrore("No endpoints found that support tool use", senzaTools), null);
      assert.equal(app.rinunciaPerErrore("Reasoning is mandatory for this endpoint", senzaTools), null);
    });
  });

  test("SI RINUNCIA SOLO AL FACOLTATIVO: model, messages e max_tokens non sono in elenco", () => {
    // Senza di loro non c'è una richiesta: ripiegare non avrebbe senso, avrebbe solo l'aria di
    // funzionare mandando una richiesta vuota.
    const essenziali = ["model", "messages", "max_tokens"];
    for (const r of app.RINUNCE_POSSIBILI) {
      for (const c of r.campi) assert.ok(!essenziali.includes(c), `"${c}" non può essere una rinuncia`);
    }
  });
  test("ogni rinuncia dichiara COSA COSTA: degradare in silenzio sarebbe peggio del guasto", () => {
    for (const r of app.RINUNCE_POSSIBILI) {
      assert.ok(r.costo && r.costo.length > 20, `la rinuncia "${r.id}" non dice cosa si perde`);
    }
  });
  test("la rinuncia alla ricerca web dichiara che la risposta arriva senza — è la più pericolosa", () => {
    // Una risposta che sembra aver cercato e non ha cercato è la cosa che questo progetto teme di
    // più. La diagnostica delle fonti legge le citazioni vere, quindi lo dirà da sola.
    const r = app.RINUNCE_POSSIBILI.find((x) => x.id === "ricerca_web");
    assert.match(r.costo, /SENZA ricerca web/);
  });
});

describe("togliere i campi, e ricordarsene", () => {
  beforeEach(() => globalThis.__store.clear());

  test("senzaRinuncia toglie TUTTI i campi del gruppo, e nient'altro", () => {
    const fuori = app.senzaRinuncia(corpoPieno(), app.RINUNCE_POSSIBILI.find((r) => r.id === "ricerca_web"));
    for (const c of ["tools", "tool_choice", "max_tool_calls"]) assert.equal(fuori[c], undefined, c);
    for (const c of ["model", "messages", "max_tokens", "temperature", "reasoning"]) assert.notEqual(fuori[c], undefined, c);
  });
  test("una rinuncia imparata vale dal turno dopo: il campo non parte nemmeno", () => {
    assert.notEqual(corpoPieno().reasoning, undefined);
    app.segnaRinuncia("x/y", "reasoning");
    assert.equal(app.corpoPerIlModello(corpoPieno()).reasoning, undefined, "il giro doppio si paga una volta sola");
  });
  test("più rinunce sullo stesso modello si sommano invece di sostituirsi", () => {
    app.segnaRinuncia("x/y", "reasoning");
    app.segnaRinuncia("x/y", "temperatura");
    const c = app.corpoPerIlModello(corpoPieno());
    assert.equal(c.reasoning, undefined);
    assert.equal(c.temperature, undefined);
    assert.notEqual(c.tools, undefined, "quello che non è stato rifiutato resta");
  });
  test("le rinunce sono PER MODELLO: quello di Flavio non eredita quelle di Marta", () => {
    // È tutto il difetto di stamattina, al contrario: una scelta valida per un modello applicata a
    // tutti. Qui non deve poter succedere nemmeno nell'altro verso.
    app.segnaRinuncia("google/gemini-3.1-pro-preview", "reasoning");
    const kimi = { ...corpoPieno(), model: "moonshotai/kimi-k2.6" };
    assert.notEqual(app.corpoPerIlModello(kimi).reasoning, undefined, "il risparmio misurato il 29/08 resta intatto");
  });
  test("LO SCHEMA VECCHIO NON VIENE BUTTATO — Legge 14, e chi ha già aggiornato non ripaga la scoperta", () => {
    // Stamattina era stato pubblicato un elenco di modelli che pretendono il ragionamento. Chi ha
    // quell'elenco sul telefono deve continuare a valere.
    globalThis.__store.set("modelli-ragionamento-obbligatorio", JSON.stringify(["vecchio/modello"]));
    assert.deepEqual(app.rinunceDelModello("vecchio/modello"), ["reasoning"]);
    assert.equal(app.corpoPerIlModello({ ...corpoPieno(), model: "vecchio/modello" }).reasoning, undefined);
  });
  test("il modello di Marta è già noto: il suo primo turno non spende un giro a riscoprirlo", () => {
    assert.deepEqual(app.rinunceDelModello("google/gemini-3.1-pro-preview"), ["reasoning"]);
  });
  test("memoria vuota o corrotta non fa saltare la lettura", () => {
    for (const v of ['"non-un-oggetto"', "[1,2,3]", "null", "{}"]) {
      globalThis.__store.set("modelli-rinunce", v);
      assert.ok(Array.isArray(app.rinunceDelModello("qualunque/modello")));
    }
  });
  test("segnare due volte la stessa rinuncia non la duplica", () => {
    app.segnaRinuncia("x/y", "reasoning");
    app.segnaRinuncia("x/y", "reasoning");
    assert.deepEqual(app.rinunceDelModello("x/y"), ["reasoning"]);
  });
  test("il tetto ai ripieghi esiste: ogni giro è una chiamata pagata", () => {
    // Senza tetto, un errore mal interpretato diventa una cascata — il guasto costato caro il 27/07
    // con le trenta ricerche web.
    assert.ok(app.TETTO_RIPIEGHI >= 1 && app.TETTO_RIPIEGHI <= 4);
  });
});
