// Regressione permanente per la parte del sistema più cambiata stanotte (trova_evento_calendario
// e la scorciatoia diretta). Non è la copia esatta del banco di prova sparito con il riavvio del
// contenitore — è una versione condensata dei controlli con più valore, riscritta da zero in
// questa sede permanente. Copre in particolare il difetto reale osservato due volte (Luigino
// confuso con Marzio) perché è quello con il raggio di impatto più ampio: la stessa funzione di
// punteggio serve anche cancella_evento_calendario e sposta_evento_calendario.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("registro azioni", () => {
  // 31/08/2026 — da dodici a quattordici, e l'aggiornamento di questa riga è deliberato.
  // Questa prova esiste perché il registro delle azioni non cresca in silenzio: ogni azione in più
  // è una cosa in più che il programma può fare senza che nessuno l'abbia approvata. Ha funzionato
  // — ha bocciato l'aggiunta finché non è stata scritta qui. Le due nuove (crea_percorso,
  // salva_nel_percorso) sono state chieste dal Ghost il 31/08 dopo aver visto lo Shell dichiarare
  // "Percorso aperto: Divenire" senza che nessun percorso esistesse: l'azione non c'era proprio.
  test("le quattordici azioni approvate esistono, non una di più e non una diversa", () => {
    assert.equal(
      app.AZIONI_CONVERSAZIONALI.map((a) => a.id).join(","),
      "apri_percorso,crea_percorso,salva_nel_percorso,scrivi_su_pilastro,crea_seme,interroga_memoria,avanza_percorso,chiudi_percorso,crea_evento_calendario,sposta_evento_calendario,invia_mail,leggi_calendario,trova_evento_calendario,cancella_evento_calendario"
    );
  });
  test("trova_evento_calendario: lettura pura, nessuna conferma, nasce spenta", () => {
    const az = app.AZIONI_CONVERSAZIONALI.find((a) => a.id === "trova_evento_calendario");
    assert.equal(az.effetto, "lettura");
    assert.equal(app.richiedeConfermaEsplicita("trova_evento_calendario"), false);
    assert.equal(app.eseguibileSubito("trova_evento_calendario"), true);
    assert.equal(az.accesaDiDefault, false);
  });
});

describe("candidataTrovaEventoDiretta — copertura delle forme osservate dal vivo", () => {
  const positivi = [
    "Quando è l'appuntamento con Marzio?",
    "Dimmi quand'è l'appuntamento con Luigino",
    "quand'ho l'appuntamento con Luigino",
    "A che ora è il dentista?",
    "Ok ora vorrei che cercassi invece del prossimo appuntamento con Marialdo",
    "Trovami quando ho la visita con il dottore",
  ];
  for (const f of positivi) {
    test(`«${f}» → scatta`, () => assert.equal(app.candidataTrovaEventoDiretta(f), true));
  }
  const negativi = [
    "quando ho parlato con te ieri mi hai raccontato dell'appuntamento dal dentista",
    "cosa ho in programma domani?",
    "cancella l'appuntamento con Marzio",
    "sposta l'appuntamento con Marzio a giovedì",
    "Cerca i miei impegni di domani",
  ];
  for (const f of negativi) {
    test(`«${f}» → NON scatta`, () => assert.equal(app.candidataTrovaEventoDiretta(f), false));
  }
});

describe("il bersaglio di ricerca non contiene le parole del trigger (bug Luigino/Marzio)", () => {
  test("estraiBersaglioPerRicercaDiretta ripulisce 'appuntamento'/'con'", () => {
    const pulito = app.estraiBersaglioPerRicercaDiretta("Quando è l'appuntamento con Luigino?");
    assert.match(pulito, /luigino/i);
    assert.doesNotMatch(pulito, /appuntament/i);
  });

  test("punteggioBersaglio: una descrizione 'sporca' (come la userebbe il modello) trova comunque il bersaglio giusto", async (t) => {
    // Riproduzione ESATTA del caso reale: Marzio titolato "appuntamento con Marzio" (le stesse
    // parole del trigger), Luigino titolato solo "Luigino". Prima della correzione del 25/08,
    // "l'appuntamento con Luigino" (senza pulizia) trovava Marzio per errore.
    let letture = 0;
    const agendaGhost = [
      { id: "ev-marzio", summary: "appuntamento con Marzio", status: "confirmed", start: { dateTime: "2026-08-27T16:00:00+02:00" } },
      { id: "ev-luigino", summary: "Luigino", status: "confirmed", start: { dateTime: "2026-08-29T04:30:00+02:00" } },
    ];
    const fetchOriginale = globalThis.fetch;
    globalThis.fetch = async (u) => {
      const url = String(u);
      if (!url.includes("googleapis.com")) throw new Error("chiamata non prevista: " + url);
      letture++;
      return new Response(JSON.stringify({ items: agendaGhost }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    t.after(() => { globalThis.fetch = fetchOriginale; });
    // driveFetch (app.js) chiede un token OAuth vero solo se non ne ha già uno: qui si finge un
    // login già completato, fornendo un client GIS finto che risponde subito con un token finto —
    // niente popup, niente rete, e app.js non viene toccato per un bisogno solo del test.
    const windowOriginale = globalThis.window;
    globalThis.window = {
      google: { accounts: { oauth2: { initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: "token-finto" }) }) } } },
    };
    t.after(() => { globalThis.window = windowOriginale; });

    const risultato = await app.trovaEventoBersaglio("l'appuntamento con Luigino", new Date("2026-08-25T20:30:00+02:00"));
    assert.equal(risultato.esito, "trovato");
    assert.equal(risultato.bersaglio.id, "ev-luigino", `atteso Luigino, trovato: ${JSON.stringify(risultato.bersaglio)}`);
  });
});

describe("detectPercorsoProposalHeuristic", () => {
  test("'vuoi che ne apra uno su X' propone un percorso con titolo estratto", () => {
    const r = app.detectPercorsoProposalHeuristic("Non creo percorsi nuovi: vuoi che ne apra uno su sous vide?");
    assert.equal(r.proposed, true);
    assert.match(r.title, /sous vide/i);
  });
  test("una frase che nomina 'percorso' senza proporne uno non scatta", () => {
    const r = app.detectPercorsoProposalHeuristic("Hai già tre percorsi aperti, vuoi continuare su uno di quelli?");
    assert.equal(r.proposed, false);
  });
});

describe("extractUsageForLog — token di ragionamento", () => {
  test("il campo tokensRagionamento viene letto quando presente", () => {
    const u = app.extractUsageForLog({ usage: { prompt_tokens: 100, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 150 } } });
    assert.equal(u.tokensRagionamento, 150);
  });
  test("è null (non 0) quando il fornitore non lo manda", () => {
    const u = app.extractUsageForLog({ usage: { prompt_tokens: 10, completion_tokens: 5 } });
    assert.equal(u.tokensRagionamento, null);
  });
});

describe("formatAzioniBlock — perConversazione con fallback", () => {
  test("ogni azione ha perConversazione, e il blocco lo usa invece della descrizione intera", () => {
    for (const a of app.AZIONI_CONVERSAZIONALI) assert.ok(a.perConversazione, `manca perConversazione su ${a.id}`);
    const blocco = app.formatAzioniBlock(app.AZIONI_CONVERSAZIONALI);
    assert.doesNotMatch(blocco, /NON usarla per/, "il blocco conversazionale non deve più portare le clausole tecniche del selettore");
  });
  test("fallback a descrizione se perConversazione manca su un'azione futura", () => {
    const finta = [{ ...app.AZIONI_CONVERSAZIONALI[0], perConversazione: undefined }];
    assert.ok(app.formatAzioniBlock(finta).includes(finta[0].descrizione));
  });
});
