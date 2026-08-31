// Creare un percorso parlando, e salvarci dentro quello che è stato prodotto (31/08/2026).
//
// Da dove viene, con lo schermo del Ghost davanti. Lui scrive "Intanto genera un percorso in vidya".
// Lo Shell risponde:
//     "Percorso aperto: **Divenire — Concept album** (VIDYA)"
//     "Nodo 1 completato: canovaccio architettura narrativa e sonora (16 brani, 5 atti)"
// In VIDYA → Percorsi non c'è nessun "Divenire". Non poteva esserci: nel registro delle azioni non
// esisteva nessuna azione per creare un percorso. Il selettore ha preso la cosa più vicina
// disponibile e il resto lo Shell lo ha DETTO, in prosa, come se fosse successo.
//
// E la domanda che il Ghost ha fatto subito dopo — "riuscirebbe a riprendere tutto in mano fra un
// mese, esattamente com'era? verrebbero perse informazioni?" — aveva anche lei risposta negativa:
// i testi vivevano solo in chat, che taglia a sei messaggi verso il modello e compatta sopra i
// quaranta.
//
// Queste prove coprono le tre decisioni che, sbagliate, riproducono esattamente i difetti visti:
// un percorso che nasce col nome sbagliato, un percorso doppio, e il messaggio sbagliato salvato.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("analizzaParametroPercorso — cosa può nascere e cosa no", () => {
  test("la forma buona passa, pilastro e titolo separati", () => {
    const a = app.analizzaParametroPercorso("vidya | Divenire — concept album");
    assert.equal(a.ok, true);
    assert.equal(a.pilastro, "vidya");
    assert.equal(a.titolo, "Divenire — concept album");
  });
  test("il pilastro è normalizzato, non deve essere scritto perfetto", () => {
    assert.equal(app.analizzaParametroPercorso(" VIDYA | Armonia modale ").pilastro, "vidya");
  });
  test("un pilastro inventato non crea niente — la validazione è del codice, mai del modello", () => {
    const a = app.analizzaParametroPercorso("musica | Armonia modale");
    assert.equal(a.ok, false);
    assert.match(a.motivo, /non è uno dei tre pilastri/);
  });
  test("senza titolo non nasce niente", () => {
    assert.equal(app.analizzaParametroPercorso("vidya |").ok, false);
    assert.equal(app.analizzaParametroPercorso("").ok, false);
  });

  test("I TITOLI-SPAZZATURA CHE IL GHOST HA IN LISTA NON DEVONO POTER RINASCERE", () => {
    // In VIDYA → Percorsi ci sono ancora "questo?" e "dedicato su questo? Ti terrei traccia de":
    // nati prima che titoloUsabile esistesse. Un percorso il cui nome è un pezzo di frase non è
    // riagganciabile da nessuna richiesta futura — è peggio di nessun percorso.
    for (const brutto of ["questo?", "dedicato su questo? Ti terrei traccia de", "quello"]) {
      const a = app.analizzaParametroPercorso(`vidya | ${brutto}`);
      assert.equal(a.ok, false, `"${brutto}" non deve diventare un percorso`);
      assert.match(a.motivo, /pezzo di frase/);
    }
  });

  test("un titolo che esiste già non produce un doppione: dice di riprenderlo", () => {
    const a = app.analizzaParametroPercorso("vidya | Armonia modale", ["Sous vide", "Armonia modale"]);
    assert.equal(a.ok, false);
    assert.match(a.motivo, /esiste già/);
    assert.match(a.motivo, /riprendi Armonia modale/);
  });
  test("il confronto col già esistente ignora accenti e maiuscole", () => {
    // "Armonia Modale" e "armonia modale" sono la stessa cosa scritta due volte, e due percorsi
    // gemelli sono il modo più rapido di rendere inutile l'inventario.
    const a = app.analizzaParametroPercorso("vidya | ARMONIA MODALE", ["Armonia modale"]);
    assert.equal(a.ok, false);
    assert.match(a.motivo, /esiste già/);
  });
  test("un titolo lunghissimo viene tagliato a confine di parola, non a metà", () => {
    const lungo = "Divenire concept album sulla fragilità dell'esistenza dalla prima cellula alla coscienza collettiva passando per l'evoluzione";
    const a = app.analizzaParametroPercorso(`vidya | ${lungo}`);
    assert.equal(a.ok, true);
    assert.ok(a.titolo.length < lungo.length);
    assert.doesNotMatch(a.titolo, /\s…$/, "il taglio non deve lasciare uno spazio prima dei puntini");
  });
});

describe("testoDaSalvare — quale messaggio finisce nel percorso", () => {
  const lungo = (s) => s.padEnd(app.LUNGHEZZA_MINIMA_SALVABILE + 10, " .");
  const conversazione = [
    { id: "u1", role: "user", content: "procedi col testo completo del primo atto" },
    { id: "a1", role: "assistant", content: lungo("ATTO I: Origine — 1. Mitosi [strumentale] Pulsazione. Battito.") },
    { id: "u2", role: "user", content: "salva nel percorso già attivo" },
    { id: "a2", role: "assistant", content: "Va bene, te lo metto nel percorso." },
  ];

  test("IL PUNTO CHE, SBAGLIATO, SALVEREBBE SEMPRE LA COSA SBAGLIATA", () => {
    // Il messaggio che porta la card non è il materiale: è la RISPOSTA alla richiesta di salvarlo.
    // Il materiale è l'ultimo messaggio dello Shell PRIMA di quello.
    const m = app.testoDaSalvare(conversazione, "a2");
    assert.equal(m.id, "a1");
    assert.match(m.testo, /ATTO I: Origine/);
  });
  test("senza indicare la card prende comunque l'ultimo messaggio abbastanza lungo", () => {
    assert.equal(app.testoDaSalvare(conversazione).id, "a1", "«Va bene, te lo metto» è troppo corto per essere materiale");
  });
  test("i messaggi del Ghost non si salvano: si salva ciò che lo Shell ha prodotto", () => {
    const soloGhost = [{ id: "u1", role: "user", content: lungo("un testo lunghissimo scritto da me") }];
    assert.equal(app.testoDaSalvare(soloGhost), null);
  });
  test("una conversazione senza niente di lungo non produce un documento vuoto", () => {
    assert.equal(app.testoDaSalvare([{ id: "a1", role: "assistant", content: "ok" }]), null);
    assert.equal(app.testoDaSalvare([]), null);
    assert.equal(app.testoDaSalvare(null), null);
  });
  test("il testo salvato è quello INTERO, non un riassunto né un troncamento", () => {
    const intero = lungo("A".repeat(4000));
    const m = app.testoDaSalvare([{ id: "a1", role: "assistant", content: intero }]);
    assert.equal(m.testo.length, intero.trim().length);
  });
});

describe("indiceDocumentiBlock — cosa sa lo Shell quando riapri il percorso fra un mese", () => {
  const doc = (title, text) => ({ id: title, title, text, date: "2026-08-31T10:00:00Z", name: title + ".md" });

  test("nomina il materiale e dice come comincia, senza spedirlo tutto", () => {
    const b = app.indiceDocumentiBlock([doc("Atto I — testi completi", "Pulsazione. Battito. Due note alternate, distanza di quinta. ".repeat(60))]);
    assert.match(b, /Atto I — testi completi/);
    assert.match(b, /caratteri/);
    assert.match(b, /comincia con: "Pulsazione\. Battito\./);
    assert.ok(b.length < 700, "è un indice, non i testi: mandarli tutti costerebbe migliaia di token a ogni riapertura");
  });
  test("dice esplicitamente di non rifare da capo ciò che c'è già", () => {
    const b = app.indiceDocumentiBlock([doc("Atto I", "x".repeat(500))]);
    assert.match(b, /NON va rifatto da capo/);
  });
  test("nessun documento, nessun blocco — non una frase che dice «nessun documento»", () => {
    assert.equal(app.indiceDocumentiBlock([]), "");
    assert.equal(app.indiceDocumentiBlock(null), "");
    assert.equal(app.indiceDocumentiBlock(undefined), "");
  });
  test("un documento vecchio senza testo viene elencato lo stesso, dichiarando cosa manca", () => {
    const b = app.indiceDocumentiBlock([{ id: "d", title: "Vecchio", date: "2026-07-01T10:00:00Z" }]);
    assert.match(b, /Vecchio/);
    assert.match(b, /testo non conservato/);
  });
  test("con molti documenti l'indice non cresce all'infinito, e lo dichiara", () => {
    const molti = Array.from({ length: 20 }, (_, i) => doc(`Doc ${i}`, "y".repeat(300)));
    const b = app.indiceDocumentiBlock(molti);
    assert.match(b, /e altri 8 documenti più vecchi/);
  });
});

describe("la guardia del compiuto: i participi in forma di intestazione", () => {
  // La riga che il Ghost ha visto sullo schermo, e che è passata intatta mentre "Ho salvato" —
  // scritto due turni dopo, molto meno grave — veniva fermato.
  const tolto = (t) => app.ripulisciAffermazioniDiEsito(t, false);

  test("«Percorso aperto:» non passa più — era l'affermazione più grave delle due", () => {
    const r = tolto("Percorso aperto: **Divenire — Concept album** (VIDYA)");
    assert.doesNotMatch(r.testo, /Percorso aperto:/);
    assert.match(r.testo, /non ancora/);
  });
  test("«Nodo 1 completato:» — il numero in mezzo non lo salva", () => {
    const r = tolto("Nodo 1 completato: canovaccio architettura narrativa e sonora.");
    assert.doesNotMatch(r.testo, /Nodo 1 completato:/);
  });
  test("anche in grassetto, che è come il modello le scrive davvero", () => {
    const r = tolto("**Documento salvato:** eccolo qui");
    assert.doesNotMatch(r.testo, /Documento salvato:/);
  });
  test("le forme già coperte continuano a essere coperte — nessuna regressione", () => {
    assert.doesNotMatch(tolto("Ho salvato la nota.").testo, /Ho salvato/);
    assert.doesNotMatch(tolto("È stato aggiunto al calendario.").testo, /stato aggiunto/);
  });
  test("UNA DOMANDA NON È UN'AFFERMAZIONE: non deve essere toccata", () => {
    // È la direzione in cui questo filtro deve sbagliare: meglio lasciar passare qualcosa che
    // rompere una frase buona. Un riquadro rosso che compare quando non serve insegna a ignorarlo.
    const t = "Vuoi che il percorso venga creato adesso?";
    assert.equal(tolto(t).testo, t);
  });
  test("una prosa normale che nomina un percorso resta intatta", () => {
    const t = "Il percorso su cui stiamo lavorando ha cinque nodi, e il primo è ancora da aprire.";
    assert.equal(tolto(t).testo, t);
  });
});

describe("il registro delle azioni conosce le due azioni nuove", () => {
  test("crea_percorso e salva_nel_percorso esistono e chiedono conferma", () => {
    for (const id of ["crea_percorso", "salva_nel_percorso"]) {
      const a = app.AZIONI_CONVERSAZIONALI.find((x) => x.id === id);
      assert.ok(a, `${id} deve essere nel registro — è ciò che mancava`);
      assert.equal(a.classe, "A");
      assert.equal(app.richiedeConfermaEsplicita(id), true, "scrivono qualcosa: non si eseguono mai da sole");
      assert.equal(app.eseguibileSubito(id), false);
    }
  });
  test("nascono accese: sono interne, non toccano il mondo fuori", () => {
    const stato = app.leggiInterruttori();
    assert.equal(stato.crea_percorso, true);
    assert.equal(stato.salva_nel_percorso, true);
  });
  test("LA PORTA A MONTE: le frasi esatte del Ghost fanno partire la selezione", () => {
    // Questa è la causa radice vera, e la terza volta che si ripresenta (dopo "fissa" il 17/08 e
    // "cancella" il 25/08): né "genera" né "salva" erano in VERBI_AZIONE, quindi nessun turno di
    // selezione partiva. Il modello si ritrovava senza nessuna azione davanti e improvvisava.
    for (const frase of [
      "Intanto genera un percorso in vidya",
      "Salva nel percorso già attivo, poi procedi con il testo completo del secondo atto",
      "creiamo un percorso su armonia modale",
      "tienilo nel percorso",
    ]) assert.equal(app.meritaTurnoDiSelezione(frase), true, `"${frase}" deve far partire la selezione`);
  });
  test("«in generale» NON è una richiesta di azione — il veto su general* funziona", () => {
    // Senza il veto, ogni frase che contiene "in generale" pagherebbe un turno di selezione inutile.
    assert.equal(app.meritaTurnoDiSelezione("in generale preferisco le colazioni salate"), false);
    assert.equal(app.meritaTurnoDiSelezione("è un discorso generale, niente di preciso"), false);
  });
});
