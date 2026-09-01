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

describe("contenutoDelPercorso — cosa dice la conferma prima di eliminare", () => {
  // Il Ghost ha chiesto "banalmente una x di fianco come nei log". Nei log la ✕ cancella subito;
  // qui chiede una volta, perché da quando esiste salva_nel_percorso dentro un percorso ci sono i
  // documenti col testo intero. Questa funzione è ciò che rende la conferma non generica: dice
  // cosa sparisce, contato. Se mentisse, la conferma varrebbe meno di nessuna conferma.
  test("conta nodi, sessioni e documenti, e li lega in italiano", () => {
    const t = app.contenutoDelPercorso({
      topics: [{}, {}, {}], sessions: [{}],
      documents: [{ text: "x" }, { text: "y" }],
    });
    assert.equal(t, "3 nodi, 1 sessione e 2 documenti con il loro testo");
  });
  test("il singolare è singolare — «1 nodi» sarebbe la prima cosa che nota chi legge", () => {
    assert.equal(app.contenutoDelPercorso({ topics: [{}], sessions: [], documents: [{}] }),
      "1 nodo e 1 documento con il suo testo");
  });
  test("ciò che non c'è non viene nominato: niente «0 documenti»", () => {
    const t = app.contenutoDelPercorso({ topics: [{}, {}], sessions: [], documents: [] });
    assert.equal(t, "2 nodi");
    assert.doesNotMatch(t, /0 /);
  });
  test("competenze e memoria del percorso vengono nominate solo se ci sono", () => {
    const con = app.contenutoDelPercorso({ topics: [{}], competenze: "sa fare X", localMemory: "niente rime" });
    assert.match(con, /le competenze accumulate/);
    assert.match(con, /la memoria del percorso/);
    assert.doesNotMatch(app.contenutoDelPercorso({ topics: [{}] }), /competenze|memoria/);
  });
  test("un percorso davvero vuoto lo dichiara, invece di non dire niente", () => {
    assert.equal(app.contenutoDelPercorso({}), "un percorso ancora vuoto");
    assert.equal(app.contenutoDelPercorso(null), "un percorso ancora vuoto");
  });
});

describe("la guardia del compiuto: la nominalizzazione (01/09/2026)", () => {
  // Terza forma portata dal Ghost, e la più insidiosa. Lo Shell, con la guardia dei participi già
  // in vigore, ha scritto: "Il percorso Divenire esiste già in VIDYA (...). Non ne creo uno nuovo —
  // riprendo quello aperto. Salvataggio dei testi elaborati nel percorso attivo."
  // Nessun percorso esisteva, il fuoco non era su di lui, e niente è stato salvato.
  const tolto = (t) => app.ripulisciAffermazioniDiEsito(t, false);

  test("LA RIGA ESATTA CHE È PASSATA: «Salvataggio dei testi elaborati nel percorso attivo»", () => {
    const r = tolto("Salvataggio dei testi elaborati nel percorso attivo.");
    assert.doesNotMatch(r.testo, /Salvataggio dei testi/);
    assert.match(r.testo, /non ancora/);
  });
  test("le sorelle della stessa famiglia", () => {
    for (const t of [
      "Creazione del percorso in corso.",
      "Registrazione della voce nel pilastro VIDYA.",
      "Invio della mail al destinatario.",
      "Apertura del documento salvato.",
    ]) assert.doesNotMatch(tolto(t).testo, /^(Creazione|Registrazione|Invio|Apertura)/, `"${t}"`);
  });
  test("IL FRENO: un sostantivo che non nomina un oggetto dell'app è prosa legittima", () => {
    // "Creazione del profilo — passo 3" dentro un documento generato non dichiara niente sul
    // sistema. Un riquadro rosso che compare qui insegnerebbe a ignorare il riquadro rosso.
    const t = "Creazione del profilo — passo 3\nAggiunta di sale a fine cottura.";
    assert.equal(tolto(t).testo, t);
  });
  test("una domanda resta una domanda", () => {
    const t = "Creazione del percorso: vuoi che proceda?";
    assert.equal(tolto(t).testo, t);
  });
  test("in mezzo alla prosa non scatta: la forma pericolosa è quella a inizio riga", () => {
    const t = "Ti spiego come funziona la creazione del percorso quando la chiedi a voce.";
    assert.equal(tolto(t).testo, t);
  });
  test("le due forme già coperte non regrediscono", () => {
    assert.doesNotMatch(tolto("Percorso aperto: **Divenire**").testo, /Percorso aperto:/);
    assert.doesNotMatch(tolto("Ho salvato la nota.").testo, /Ho salvato/);
  });
});

describe("salvare qualcosa detto PRIMA dell'ultimo messaggio (01/09/2026)", () => {
  // Il Ghost: "Genera un percorso in vidya per questo concept, comprensivo dei file di testo
  // elaborati a riguardo fin'ora". I testi dell'Atto I erano di due ore prima, non nel messaggio
  // appena sopra. Prendere sempre il precedente vuol dire non poter mai salvare niente che non sia
  // stato appena scritto — e ciò che vale la pena conservare quasi mai lo è.
  const lungo = (s) => s.padEnd(app.LUNGHEZZA_MINIMA_SALVABILE + 10, " .");
  const conversazione = [
    { id: "a1", role: "assistant", content: lungo("ATTO I: Origine — Mitosi, Prima divisione, Colonia. Pulsazione, battito.") },
    { id: "u1", role: "user", content: "bene, procedi" },
    { id: "a2", role: "assistant", content: lungo("ATTO II: Complessità — Nervo, Occhio, Tempo, Voce. La rappresentazione.") },
    { id: "u2", role: "user", content: "salva i testi dell'Atto I nel percorso" },
    { id: "a3", role: "assistant", content: lungo("Va bene: ecco cosa metto dentro, dimmi se confermi il salvataggio.") },
  ];

  test("IL RIFERIMENTO VINCE SULLA POSIZIONE: «Atto I» pesca l'Atto I, non l'ultimo", () => {
    const m = app.testoDaSalvare(conversazione, "a3", "Atto I — testi completi");
    assert.equal(m.id, "a1");
    assert.equal(m.perRiferimento, true);
  });
  test("«Atto II» pesca l'Atto II — lo spareggio funziona in entrambi i versi", () => {
    assert.equal(app.testoDaSalvare(conversazione, "a3", "Atto II — testi completi").id, "a2");
  });
  test("senza riferimento utile vale il più recente, come prima: nessuna regressione", () => {
    const m = app.testoDaSalvare(conversazione, "a3", "");
    assert.equal(m.id, "a2");
    assert.equal(m.perRiferimento, false);
  });
  test("un riferimento che non corrisponde a niente non impedisce il salvataggio", () => {
    // Meglio salvare il più recente dichiarando che non è stato trovato per riferimento, che
    // rifiutarsi e perdere il materiale.
    const m = app.testoDaSalvare(conversazione, "a3", "la ricetta del pane");
    assert.equal(m.id, "a2");
    assert.equal(m.perRiferimento, false);
  });
});

describe("nodoPerDocumento — sotto quale nodo finisce il materiale", () => {
  const topics = [
    { id: "t1", label: "Atto I: Origine — testi completi" },
    { id: "t2", label: "Atto II: Complessità — testi completi" },
    { id: "t3", label: "Struttura narrativa: tracce come capitoli di una metamorfosi" },
  ];
  test("«Atto I — testi» va sotto l'Atto I, non sotto l'Atto II", () => {
    assert.equal(app.nodoPerDocumento(topics, "Atto I — testi completi"), "t1");
  });
  test("«Atto II» va sotto l'Atto II", () => {
    assert.equal(app.nodoPerDocumento(topics, "Atto II — testi"), "t2");
  });
  test("un titolo che non corrisponde a nessun nodo NON viene messo sotto uno a caso", () => {
    // Un documento senza nodo resta del percorso: meglio senza che sotto quello sbagliato.
    assert.equal(app.nodoPerDocumento(topics, "Mappa sonora dell'album"), null);
    assert.equal(app.nodoPerDocumento(topics, ""), null);
    assert.equal(app.nodoPerDocumento([], "Atto I"), null);
  });
  test("se due nodi corrispondono allo stesso modo non si sceglie a caso", () => {
    // Prima aspettativa scritta male e corretta dalla prova: avevo dato per scontato che il nodo
    // "più specifico" vincesse. Non è così e non deve esserlo — le parole cercate ("testi",
    // "completi") stanno in entrambe le etichette, quindi il punteggio è pari e il documento resta
    // del percorso invece di finire sotto un nodo scelto a caso. È la stessa regola che vale per i
    // percorsi e per gli eventi: a parità non si sceglie.
    const ambigui = [{ id: "a", label: "Testi completi" }, { id: "b", label: "Testi completi rivisti" }];
    assert.equal(app.nodoPerDocumento(ambigui, "testi completi"), null);
    // Il numero invece separa: è l'unico spareggio ammesso.
    const atti = [{ id: "a", label: "Atto I — testi completi" }, { id: "b", label: "Atto II — testi completi" }];
    assert.equal(app.nodoPerDocumento(atti, "Atto II — testi completi"), "b");
  });
});

describe("materialeDelNodo — cosa compare toccando un nodo", () => {
  const percorso = {
    topics: [{ id: "t1", label: "Atto I" }, { id: "t2", label: "Atto II" }],
    documents: [
      { id: "d1", title: "Atto I — testi", text: "Pulsazione.", nodoId: "t1", date: "2026-09-01T00:00:00Z" },
      { id: "d2", title: "Mappa sonora", text: "…", nodoId: null, date: "2026-09-01T00:00:00Z" },
    ],
    sessions: [{ id: "s1", topicIds: ["t1"], summary: "provato i frammenti vocali", date: "2026-09-01T00:00:00Z" }],
  };
  test("il nodo mostra i suoi documenti e le sue sessioni", () => {
    const m = app.materialeDelNodo(percorso, { id: "t1" });
    assert.equal(m.documenti.length, 1);
    assert.equal(m.documenti[0].id, "d1");
    assert.equal(m.sessioni.length, 1);
  });
  test("un nodo senza niente non eredita il materiale degli altri", () => {
    const m = app.materialeDelNodo(percorso, { id: "t2" });
    assert.equal(m.documenti.length, 0);
    assert.equal(m.sessioni.length, 0);
  });
  test("un documento senza nodo non compare sotto nessun nodo", () => {
    for (const t of percorso.topics) {
      assert.ok(!app.materialeDelNodo(percorso, t).documenti.some((d) => d.id === "d2"));
    }
  });
  test("un percorso vuoto non fa esplodere niente", () => {
    assert.deepEqual(app.materialeDelNodo({}, { id: "x" }), { documenti: [], sessioni: [] });
    assert.deepEqual(app.materialeDelNodo(null, null), { documenti: [], sessioni: [] });
  });
});

describe("l'inventario dice cosa contiene un percorso, non solo che esiste (01/09/2026)", () => {
  // Osservato dal Ghost: alla richiesta "genera un percorso per questo concept, comprensivo dei file
  // di testo elaborati fin'ora", lo Shell ha risposto "esiste già in VIDYA, con i testi degli Atti I
  // e II già salvati". Il percorso non esisteva e i testi non erano salvati da nessuna parte.
  // Non è fantasia gratuita: è un buco riempito. L'inventario diceva il nome e taceva il contenuto,
  // e la cosa più plausibile da dire su un percorso chiamato "Divenire", in una conversazione dove
  // si sono appena scritti due atti, è che li contenga.
  const percorso = (over = {}) => ({ id: "p1", title: "Divenire — concept album", topics: [], documents: [], ...over });

  test("UN PERCORSO VUOTO LO DICHIARA A LETTERE MAIUSCOLE — è la riga che toglie il buco", () => {
    const c = app.contaPercorso(percorso({ topics: [{ status: "non iniziato" }, { status: "non iniziato" }] }));
    assert.match(c, /NESSUN documento salvato/);
  });
  test("un percorso pieno dice quanto è pieno", () => {
    const c = app.contaPercorso(percorso({
      topics: [{ status: "consolidato" }, { status: "non iniziato" }, { status: "praticato" }],
      documents: [{ id: "d1" }, { id: "d2" }],
    }));
    assert.match(c, /3 nodi/);
    assert.match(c, /1 consolidato/);
    assert.match(c, /2 documenti salvati/);
  });
  test("i singolari sono singolari: «1 nodi» è la prima cosa che nota chi legge", () => {
    const c = app.contaPercorso(percorso({ topics: [{ status: "consolidato" }], documents: [{ id: "d" }] }));
    assert.match(c, /1 nodo, 1 consolidato, 1 documento salvato/);
  });
  test("un percorso appena creato non fa esplodere niente", () => {
    assert.match(app.contaPercorso({}), /0 nodi/);
    assert.match(app.contaPercorso(null), /NESSUN documento salvato/);
  });

  test("IL CONTEGGIO ARRIVA DAVVERO NELL'INVENTARIO CHE VA NEL PROMPT", () => {
    const inv = app.costruisciInventario({
      pBio: [], pAir: [],
      pVidya: [percorso({ topics: [{ status: "non iniziato" }] })],
      semi: [],
    });
    assert.match(inv, /Divenire — concept album/);
    assert.match(inv, /NESSUN documento salvato/);
  });
  test("la regola è scritta esplicita, non lasciata da dedurre", () => {
    const inv = app.costruisciInventario({ pBio: [], pAir: [], pVidya: [percorso()], semi: [] });
    assert.match(inv, /NON contiene niente di cio' che avete prodotto parlando/);
    assert.match(inv, /puo' avere il nome giusto ed essere vuoto/);
  });
  test("senza percorsi l'inventario resta quello di prima", () => {
    const inv = app.costruisciInventario({ pBio: [], pAir: [], pVidya: [], semi: [] });
    assert.match(inv, /BIO: nessun percorso aperto/);
  });
});
