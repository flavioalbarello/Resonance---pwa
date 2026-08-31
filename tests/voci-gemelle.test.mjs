// Le voci gemelle del log, il fascicolo del percorso, e la riapertura di un documento (31/08/2026).
//
// I tre pezzi rispondono a due domande del Ghost fatte con lo schermo davanti:
//   "come pensi di sistemare il discorso log?" — cinque voci nel Log VIDYA nella stessa mezz'ora,
//   tutte sullo stesso concept album;
//   "il percorso e il materiale annesso sarà richiamabile e implementabile dalla chat?" — no, non
//   lo era: il blocco che porta il percorso nel prompt portava solo l'etichetta e l'id.
//
// I CINQUE TESTI QUI SOTTO SONO QUELLI VERI, copiati dal suo Log. Non sono un esempio inventato:
// sono il campione su cui la soglia è stata misurata, e restano qui perché se un giorno qualcuno
// la cambia, deve poter vedere subito cosa succede al caso reale invece di fidarsi di un numero.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const VOCI_VERE = [
  { id: "v1", date: "2026-08-31", title: "Domanda esistenziale sul senso e la ragion d'essere",
    notes: "La domanda 'qual è il tuo senso, la tua ragion d'essere?' rappresenta una svolta riflessiva nel dialogo. Non è richiesta tecnica ma esistenziale, rivolta al sistema Resonance stesso. Questo indica un utente che non si limita a consumare strumenti ma li interroga, cercando relazione oltre la funzionalità. La sequenza è notevole: correzione alimentare → domanda filosofica, con passaggio immediato e senza transizione." },
  { id: "v2", date: "2026-08-31", title: "Canovaccio concept album: 'Anagenesi / Cenogenesi'",
    notes: "Arco narrativo tripartito. ATTO I — 'Mitosi': la prima divisione, la memoria che non c'era, il dolore di separarsi in due per non morire. ATTO II — 'Neotenia': l'evoluzione come ritardo, l'umano che nasce troppo presto. ATTO III — 'Risorgenza': il futuro proiettato, la coscienza che torna a essere unica ma stavolta consapevole." },
  { id: "v3", date: "2026-08-31", title: "Concept album 'Divenire' — canovaccio per Ghost",
    notes: "Percorso creativo generato da Shell su richiesta Ghost: 5 atti, 16 brani, arc narrativo da monocellula a coscienza collettiva. Struttura: I Origine (mitosi, divisione, colonia) → II Complessità (nervo, occhio, tempo, voce) → III Crisi → IV Proiezione → V Ritorno/Trasformazione. Tecnica: ripetizione tematica con variazione." },
  { id: "v4", date: "2026-08-31", title: "Divenire — Concept album: canovaccio architetturale completato, Nodo 1",
    notes: "Ghost ha commissionato e ricevuto un concept album a 5 atti (16 brani) che intreccia evoluzione biologica e coscienza collettiva. La struttura è sofisticata: architettura narrativa circolare (mitosi → complessità → crisi → proiezione → ritorno trasformato), con reprise tematica consapevole. Prossimo output sarà testi poetico-musicali completi per Mitosi, Prima divisione, Colonia." },
  { id: "v5", date: "2026-08-31", title: "Divenire — Sviluppo compositivo in corso",
    notes: "Concept album strutturato su 5 atti, 16 brani. Architettura narrativa completata (origine → complessità → crisi → proiezione → ritorno). Testi completi dell'Atto I (Mitosi, Prima divisione, Colonia) e Atto II in attesa di sviluppo. Nodo attuale: testi Atto II (Nervo, Occhio, Tempo, Voce) pronti per elaborazione." },
];
const testo = (v) => `${v.title} ${v.notes}`;

describe("similaritaTesti — la misura su cui poggia tutto", () => {
  test("IL SEGNALE E IL RUMORE SONO SEPARATI, ed è l'unica ragione per cui questa soglia esiste", () => {
    // Voci sullo stesso album fra loro: 0,21 – 0,28. La voce estranea contro le altre: 0,01 – 0,05.
    // Se un giorno queste due fasce si toccassero, la soglia andrebbe ripensata, non spostata.
    const fraAlbum = [[2, 3], [2, 4], [3, 4]].map(([i, j]) => app.similaritaTesti(testo(VOCI_VERE[i]), testo(VOCI_VERE[j])));
    const controEstranea = [1, 2, 3, 4].map((i) => app.similaritaTesti(testo(VOCI_VERE[0]), testo(VOCI_VERE[i])));
    assert.ok(Math.min(...fraAlbum) > 0.2, `le voci sull'album devono somigliarsi: ${fraAlbum.map((x) => x.toFixed(3))}`);
    assert.ok(Math.max(...controEstranea) < 0.06, `la voce estranea non deve somigliare a niente: ${controEstranea.map((x) => x.toFixed(3))}`);
    assert.ok(Math.min(...fraAlbum) > Math.max(...controEstranea) * 4, "il margine fra segnale e rumore deve restare almeno quadruplo");
  });
  test("la soglia sta in mezzo, con margine da entrambe le parti", () => {
    assert.ok(app.SOGLIA_VOCE_GEMELLA > 0.094 && app.SOGLIA_VOCE_GEMELLA < 0.214);
  });
  test("un testo con se stesso è 1, due testi senza niente in comune sono 0", () => {
    assert.equal(app.similaritaTesti("mitosi divisione colonia", "mitosi divisione colonia"), 1);
    assert.equal(app.similaritaTesti("mitosi divisione colonia", "pesce merluzzo verdure"), 0);
    assert.equal(app.similaritaTesti("", "qualcosa"), 0);
  });
});

describe("il caso reale del Ghost, dall'inizio alla fine", () => {
  const applicaTutte = () => VOCI_VERE.reduce((lista, v) => app.fondiOAggiungiVoce(lista, v).lista, []);

  test("cinque voci diventano tre — e dico tre, non una: è quello che fa davvero", () => {
    const finale = applicaTutte();
    assert.equal(finale.length, 3);
  });
  test("la voce estranea resta separata: è la cosa che non deve mai succedere", () => {
    const finale = applicaTutte();
    assert.ok(finale.some((v) => v.title.startsWith("Domanda esistenziale")), "la domanda sul senso non c'entra con l'album");
  });
  test("IL LIMITE DICHIARATO: la voce che chiamava l'album «Anagenesi/Cenogenesi» resta fuori", () => {
    // Era stato previsto prima di misurare, e la misura l'ha confermato: usa un altro nome di
    // lavorazione, quindi la sovrapposizione di parole è 0,09 — sotto la soglia. Abbassarla per
    // prenderla ridurrebbe il margine sul rumore a meno del doppio.
    const finale = applicaTutte();
    assert.ok(finale.some((v) => v.title.includes("Anagenesi")));
  });
  test("niente è perso: le versioni assorbite sono dentro la voce che resta", () => {
    const finale = applicaTutte();
    const album = finale.find((v) => v.versioni?.length);
    assert.ok(album, "una voce deve aver assorbito le sue gemelle");
    assert.equal(album.versioni.length, 2);
    // I testi vecchi devono essere ancora leggibili parola per parola, non riassunti.
    const storico = album.versioni.map((x) => x.notes).join(" ");
    assert.match(storico, /monocellula a coscienza collettiva/);
    assert.match(storico, /commissionato e ricevuto/);
  });
  test("la voce che resta porta il testo PIÙ RECENTE, non il primo", () => {
    const finale = applicaTutte();
    const album = finale.find((v) => v.versioni?.length);
    assert.match(album.title, /Sviluppo compositivo in corso/);
  });
  test("la voce fusa tiene il suo id e la sua data d'origine", () => {
    const finale = applicaTutte();
    const album = finale.find((v) => v.versioni?.length);
    assert.equal(album.id, "v3", "l'id non cambia: è la stessa voce, non una nuova");
    assert.equal(album.date, "2026-08-31");
    assert.ok(album.ultimoAggiornamento, "ma dichiara quando è stata aggiornata");
  });
});

describe("quando NON si fonde — i casi in cui fondere sarebbe una perdita", () => {
  test("giorni diversi restano voci diverse", () => {
    const ieri = { ...VOCI_VERE[4], id: "vx", date: "2026-08-30" };
    const { lista, esito } = app.fondiOAggiungiVoce([VOCI_VERE[3]], ieri);
    assert.equal(esito.tipo, "aggiunta");
    assert.equal(lista.length, 2);
  });
  test("DUE PESATE NELLO STESSO GIORNO SONO DUE DATI, non un doppione", () => {
    // Fondere qui cancellerebbe una misura: è il caso in cui la deduplica farebbe danno vero.
    const a = { id: "b1", date: "2026-08-31", weight: "78,2", sleep: "7", notes: "pesata del mattino" };
    const b = { id: "b2", date: "2026-08-31", weight: "78,9", sleep: "7", notes: "pesata della sera" };
    const { lista, esito } = app.fondiOAggiungiVoce([a], b);
    assert.equal(esito.tipo, "aggiunta");
    assert.equal(lista.length, 2);
  });
  test("una voce troppo corta non si giudica: due frasi brevi si somigliano sempre", () => {
    const a = { id: "c1", date: "2026-08-31", title: "ok", notes: "" };
    const b = { id: "c2", date: "2026-08-31", title: "ok", notes: "" };
    assert.equal(app.fondiOAggiungiVoce([a], b).esito.tipo, "aggiunta");
  });
  test("lo storico non cresce all'infinito", () => {
    let lista = [VOCI_VERE[4]];
    for (let i = 0; i < 40; i++) lista = app.fondiOAggiungiVoce(lista, { ...VOCI_VERE[3], id: "n" + i }).lista;
    assert.equal(lista.length, 1);
    assert.ok(lista[0].versioni.length <= 12, `tetto rispettato, trovate ${lista[0].versioni.length}`);
  });
});

describe("dossierPercorso — cosa lo Shell sa del percorso aperto, in chat", () => {
  const percorso = {
    id: "p1", title: "Divenire — Concept album",
    topics: [{ label: "Atto I — Origine", status: "consolidato" }, { label: "Atto II — Complessità", status: "non iniziato" }],
    competenze: "Sa costruire un arco narrativo circolare con reprise tematica.",
    localMemory: "Niente rime baciate. Registri vocali multipli.",
    documents: [{ id: "d1", title: "Atto I — testi completi", text: "Pulsazione. Battito. Due note alternate. ".repeat(30), date: "2026-08-31T10:00:00Z" }],
  };

  test("porta nodi, competenze, memoria del percorso e indice dei documenti", () => {
    const d = app.dossierPercorso(percorso);
    assert.match(d, /Atto I — Origine: consolidato/);
    assert.match(d, /arco narrativo circolare/);
    assert.match(d, /Niente rime baciate/);
    assert.match(d, /Atto I — testi completi/);
  });
  test("dichiara che è materiale vero, non un ricordo del modello", () => {
    assert.match(app.dossierPercorso(percorso), /materiale vero, conservato nell'app, non un ricordo tuo/);
  });
  test("un percorso vuoto non produce un fascicolo che finge di avere qualcosa", () => {
    assert.equal(app.dossierPercorso({ id: "x", title: "Nuovo", topics: [], documents: [] }), "");
    assert.equal(app.dossierPercorso(null), "");
  });
  test("IL FASCICOLO ARRIVA DAVVERO NEL BLOCCO CHE VA NEL PROMPT", () => {
    // Era esattamente qui che la risposta alla domanda del Ghost diventava "no": questo blocco
    // portava solo etichetta e id, quindi il materiale non raggiungeva mai la conversazione.
    const senza = app.formatFuocoBlock({ tipo: "percorso", id: "p1", etichetta: "Divenire", apertoIl: null });
    assert.doesNotMatch(senza, /Atto I/);
    const con = app.formatFuocoBlock({ tipo: "percorso", id: "p1", etichetta: "Divenire", apertoIl: null, dossier: app.dossierPercorso(percorso) });
    assert.match(con, /Atto I — testi completi/);
  });
  test("senza niente di aperto il blocco resta quello di sempre", () => {
    assert.match(app.formatFuocoBlock({ tipo: "nessuno" }), /Non state lavorando su niente/);
  });
});

describe("trovaDocumentoNelPercorso — riaprire il testo giusto", () => {
  const doc = (id, title) => ({ id, title, name: title + ".md", text: "contenuto di " + title, date: "2026-08-31T10:00:00Z" });
  const percorso = { id: "p1", documents: [doc("d1", "Atto I — testi completi"), doc("d2", "Atto II — testi completi"), doc("d3", "Mappa sonora")] };

  test("«l'Atto I» trova l'Atto I, non l'Atto II", () => {
    const r = app.trovaDocumentoNelPercorso(percorso, "rileggimi l'Atto I");
    assert.equal(r.esito, "trovato");
    assert.equal(r.doc.id, "d1");
  });
  test("«la mappa sonora» trova la mappa", () => {
    assert.equal(app.trovaDocumentoNelPercorso(percorso, "la mappa sonora").doc.id, "d3");
  });
  test("«l'Atto II» trova l'Atto II — lo spareggio sui numeri funziona in entrambi i versi", () => {
    assert.equal(app.trovaDocumentoNelPercorso(percorso, "riprendi l'Atto II").doc.id, "d2");
  });
  test("QUANDO SONO A PARI NON SCEGLIE: chiede, come per i percorsi e per gli eventi", () => {
    // Senza numero non c'è modo di distinguerli, e inventare una preferenza sarebbe peggio.
    const r = app.trovaDocumentoNelPercorso(percorso, "riprendi l'atto");
    assert.equal(r.esito, "ambiguo");
    assert.equal(r.candidati.length, 2);
  });
  test("il numero da solo NON fa vincere un documento che non c'entra", () => {
    // Lo spareggio vale solo a parità di parole piene: se "mappa" non compare nella richiesta,
    // nessun numero può tirare dentro un documento estraneo.
    const conNumero = { id: "p", documents: [doc("d1", "Atto I — testi completi"), doc("d9", "Bozza 1 — scaletta")] };
    assert.equal(app.trovaDocumentoNelPercorso(conNumero, "la scaletta").doc.id, "d9");
  });
  test("con un solo documento e nessuna parola utile non c'è ambiguità da risolvere", () => {
    const uno = { id: "p", documents: [doc("d1", "Atto I")] };
    assert.equal(app.trovaDocumentoNelPercorso(uno, "rileggimelo").esito, "trovato");
  });
  test("se non corrisponde niente lo dichiara, e dice cosa c'è", () => {
    const r = app.trovaDocumentoNelPercorso(percorso, "la ricetta del pane");
    assert.equal(r.esito, "nessuno");
    assert.equal(r.candidati.length, 3);
  });
  test("senza percorso aperto, e senza documenti, non si inventa niente", () => {
    assert.equal(app.trovaDocumentoNelPercorso(null, "l'Atto I").esito, "nessuno");
    assert.equal(app.trovaDocumentoNelPercorso({ id: "p", documents: [] }, "x").esito, "nessuno");
  });
  test("un documento senza testo non è riapribile: verrebbe aperto vuoto", () => {
    const senzaTesto = { id: "p", documents: [{ id: "d", title: "Vecchio", date: "2026-07-01T00:00:00Z" }] };
    assert.equal(app.trovaDocumentoNelPercorso(senzaTesto, "vecchio").esito, "nessuno");
  });
});

describe("formatDocumentoAperto — cosa riceve il modello", () => {
  const trovato = (testo) => ({ esito: "trovato", doc: { title: "Atto I", text: testo, date: "2026-08-31T10:00:00Z" } });

  test("il testo arriva per intero, dentro delimitatori espliciti", () => {
    const b = app.formatDocumentoAperto(trovato("Pulsazione. Battito. Due note alternate."));
    assert.match(b, /RIAPERTO DAVVERO ADESSO/);
    assert.match(b, /Pulsazione\. Battito\. Due note alternate\./);
    assert.match(b, /fine del documento/);
  });
  test("UN DOCUMENTO LUNGHISSIMO VIENE TAGLIATO E LO DICHIARA — il modello deve sapere di avere una parte", () => {
    const enorme = "x".repeat(app.TETTO_DOCUMENTO_NEL_TURNO + 5000);
    const b = app.formatDocumentoAperto(trovato(enorme));
    assert.match(b, /tagliato ai primi/);
    assert.ok(b.length < enorme.length, "il turno non deve portarsi dietro tutto");
  });
  test("ambiguo: chiede quale e vieta di sceglierne uno", () => {
    const b = app.formatDocumentoAperto({ esito: "ambiguo", candidati: [{ title: "Atto I" }, { title: "Atto II" }], motivo: "più di uno" });
    assert.match(b, /Chiedi quale/);
    assert.match(b, /non rispondere come se l'avessi letto/);
  });
  test("fallito: dichiara il motivo e vieta di rispondere a memoria", () => {
    const b = app.formatDocumentoAperto({ esito: "nessuno", motivo: "non c'è nessun percorso aperto", candidati: [] });
    assert.match(b, /NON è stato riaperto/);
    assert.match(b, /non rispondere con quello che ricordi/);
  });
  test("nessuna apertura, nessun blocco", () => {
    assert.equal(app.formatDocumentoAperto(null), "");
  });
});

describe("apri_documento nel registro", () => {
  test("è una lettura: non chiede conferma, si esegue subito, nasce accesa", () => {
    const a = app.AZIONI_CONVERSAZIONALI.find((x) => x.id === "apri_documento");
    assert.ok(a);
    assert.equal(a.effetto, "lettura");
    assert.equal(app.richiedeConfermaEsplicita("apri_documento"), false);
    assert.equal(app.eseguibileSubito("apri_documento"), true);
    assert.equal(app.leggiInterruttori().apri_documento, true);
  });
  test("le frasi con cui si chiede di rileggere fanno partire la selezione", () => {
    for (const f of ["rileggimi l'Atto I", "mostrami i testi salvati", "leggilo di nuovo e correggi la metrica"]) {
      assert.equal(app.meritaTurnoDiSelezione(f), true, `"${f}"`);
    }
  });
});
