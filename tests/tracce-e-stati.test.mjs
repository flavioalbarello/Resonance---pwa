// LE TRACCE CHE NON SI PERDONO, E GLI STATI CHE NON SI SBAGLIANO (07/09/2026).
//
// Due difetti trovati scrivendo il rapporto di stato del codice, non usando l'app.
//
// 1 · ATTI, TRAPPOLE E GENERAZIONI NON ANDAVANO SU DRIVE. Sono le tracce che il progetto accumula
//     nel tempo: il bersaglio dichiarato prima di un atto, i vicoli ciechi già pagati, i tentativi
//     del generatore e le sue rinunce. Vivevano solo nel browser di un telefono.
//
// 2 · GLI STATI DEL SEME ERANO STRINGHE SPARSE. La prova che serviva un registro è che, scrivendo
//     il rapporto, li ho ricostruiti male DUE VOLTE con il codice davanti: cinque invece di sette,
//     con le etichette italiane al posto degli identificatori, e "cancelled" contato fra loro
//     quando è lo stato di un evento di Google Calendar.
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

describe("le tracce viaggiano, e non si perdono", () => {
  const traccia = (id, quando) => ({ id, quando });

  test("l'unione è ADDITIVA: due dispositivi, nessuna traccia persa", () => {
    const qui = [traccia("a", "2026-09-05T10:00:00Z"), traccia("b", "2026-09-06T10:00:00Z")];
    const la = [traccia("c", "2026-09-07T10:00:00Z")];
    const uniti = app.mergeTracce(qui, la, 40);
    assert.deepEqual(uniti.map((t) => t.id), ["c", "b", "a"], "più recente per prima");
    assert.equal(uniti.length, 3);
  });

  test("IL TETTO SI RIAPPLICA DOPO L'UNIONE — altrimenti il limite non è un limite", () => {
    // È il difetto che mergeById avrebbe portato: due dispositivi con 40 trappole a testa fanno 80,
    // e il registro cresce oltre il proprio tetto a ogni giro di sincronizzazione.
    const qui = Array.from({ length: 40 }, (_, i) => traccia(`q${i}`, `2026-09-0${1 + (i % 5)}T10:00:0${i % 10}Z`));
    const la = Array.from({ length: 40 }, (_, i) => traccia(`l${i}`, `2026-09-0${1 + (i % 5)}T11:00:0${i % 10}Z`));
    assert.equal(app.mergeTracce(qui, la, 40).length, 40);
  });

  test("si ordina su `quando` — mergeById guarda `date`, che le tracce non hanno", () => {
    const t = [traccia("vecchia", "2026-01-01T00:00:00Z"), traccia("nuova", "2026-09-07T00:00:00Z")];
    assert.equal(app.mergeTracce(t, [], 10)[0].id, "nuova");
    // La prova del difetto: la funzione dei log le lascerebbe nell'ordine in cui arrivano.
    assert.equal(app.mergeById(t, [])[0].id, "vecchia");
  });

  test("a parità di id vince il locale, come per i log", () => {
    const qui = [{ id: "a", quando: "2026-09-05T10:00:00Z", nota: "mia" }];
    const la = [{ id: "a", quando: "2026-09-05T10:00:00Z", nota: "loro" }];
    assert.equal(app.mergeTracce(qui, la, 40)[0].nota, "mia");
  });

  test("ingressi assenti, nulli o senza id non fanno saltare niente", () => {
    assert.deepEqual(app.mergeTracce(null, undefined, 5), []);
    assert.deepEqual(app.mergeTracce([{ quando: "x" }, null], [], 5), [], "senza id non è una traccia");
  });

  describe("dentro la sincronizzazione vera", () => {
    test("le tre tracce sono nella forma del file su Drive", () => {
      const d = app.SYNC_DEFAULTS();
      for (const k of ["atti", "trappole", "generazioni"]) {
        assert.ok(Array.isArray(d[k]), `"${k}" non è nel file di sincronizzazione`);
      }
    });

    test("LE TRACCE SI UNISCONO ANCHE QUANDO L'ALTRO DISPOSITIVO VINCE SUI BUNDLE", () => {
      // È la proprietà che conta: il dispositivo con il timestamp più vecchio perde la chat e la
      // memoria (giusto, sono bundle), ma NON deve perdere le proprie tracce.
      const locale = {
        ...app.SYNC_DEFAULTS(), lastModified: 1000,
        atti: [traccia("atto-mio", "2026-09-05T10:00:00Z")],
        trappole: [traccia("trappola-mia", "2026-09-05T10:00:00Z")],
        generazioni: [traccia("gen-mia", "2026-09-05T10:00:00Z")],
      };
      const remoto = {
        ...app.SYNC_DEFAULTS(), lastModified: 9999,
        atti: [traccia("atto-suo", "2026-09-06T10:00:00Z")],
        trappole: [traccia("trappola-sua", "2026-09-06T10:00:00Z")],
        generazioni: [traccia("gen-sua", "2026-09-06T10:00:00Z")],
      };
      const m = app.mergeSyncState(locale, remoto);
      assert.deepEqual(m.atti.map((t) => t.id).sort(), ["atto-mio", "atto-suo"]);
      assert.deepEqual(m.trappole.map((t) => t.id).sort(), ["trappola-mia", "trappola-sua"]);
      assert.deepEqual(m.generazioni.map((t) => t.id).sort(), ["gen-mia", "gen-sua"]);
    });

    test("un file remoto vecchio, senza il campo, non azzera le tracce locali", () => {
      // Il caso reale del primo avvio dopo questo aggiornamento: su Drive c'è un file scritto dalla
      // versione precedente, che quei tre campi non li ha.
      const locale = { ...app.SYNC_DEFAULTS(), lastModified: 1, trappole: [traccia("mia", "2026-09-05T10:00:00Z")] };
      const remotoVecchio = { bio: [], air: [], vidya: [], lastModified: 9999 }; // niente atti/trappole/generazioni
      assert.deepEqual(app.mergeSyncState(locale, remotoVecchio).trappole.map((t) => t.id), ["mia"]);
    });

    test("senza file remoto il tetto vale lo stesso", () => {
      const troppe = Array.from({ length: app.TRAPPOLE_TETTO + 10 }, (_, i) => traccia(`t${i}`, `2026-09-07T10:00:${String(i).padStart(2, "0")}Z`));
      const m = app.mergeSyncState({ ...app.SYNC_DEFAULTS(), trappole: troppe }, null);
      assert.equal(m.trappole.length, app.TRAPPOLE_TETTO);
    });

    test("I PLASMIDI NON SI SINCRONIZZANO, ED È UNA SCELTA", () => {
      // Due ragioni strutturali, entrambe nel commento di SYNC_DEFAULTS: il trasferimento di un
      // plasmide è ORIZZONTALE e passa da un gesto, e `ultimaProva.passato` è una proprietà DI
      // QUESTO dispositivo. Sincronizzarli renderebbe verticale la cosa che esiste per non esserlo,
      // e porterebbe il verdetto di un telefono su un altro.
      assert.equal("plasmidi" in app.SYNC_DEFAULTS(), false);
    });
  });

  test("LE TRACCE SONO ANCHE NEL BACKUP — non erano né lì né su Drive", () => {
    // Avevo scritto che il backup le conteneva già perché "copia tutte le chiavi di localStorage".
    // Falso: BACKUP_KEYS è un elenco esplicito. Questa prova pinta il dato GREZZO, non solo lo
    // specchio, perché è il dato grezzo che un ripristino riscrive.
    globalThis.__store.clear();
    globalThis.__store.set(app.TRAPPOLE_KEY, JSON.stringify([traccia("t1", "2026-09-07T10:00:00Z")]));
    globalThis.__store.set(app.ATTI_KEY, JSON.stringify([traccia("a1", "2026-09-07T10:00:00Z")]));
    globalThis.__store.set(app.GENERAZIONI_KEY, JSON.stringify([traccia("g1", "2026-09-07T10:00:00Z")]));
    const b = app.buildFullBackup();
    for (const k of [app.ATTI_KEY, app.TRAPPOLE_KEY, app.GENERAZIONI_KEY]) {
      assert.ok(b.dati[k], `"${k}" non entra nel backup: un ripristino non la riporterebbe`);
    }
    assert.equal(b.syncState.trappole[0].id, "t1");
    assert.equal(b.syncState.atti[0].id, "a1");
    assert.equal(b.syncState.generazioni[0].id, "g1");
  });

  test("un backup si rilegge: le tracce tornano identiche", () => {
    globalThis.__store.clear();
    const originali = [traccia("t1", "2026-09-07T10:00:00Z"), traccia("t2", "2026-09-06T10:00:00Z")];
    globalThis.__store.set(app.TRAPPOLE_KEY, JSON.stringify(originali));
    const b = app.buildFullBackup();
    globalThis.__store.clear();
    const esito = app.restoreFullBackup(b);
    assert.equal(esito.ok, true);
    assert.deepEqual(app.leggiTrappole(), originali);
  });
});

describe("gli stati del Seme: un registro, non stringhe sparse", () => {
  test("SONO SETTE, e sono questi — l'elenco che avevo ricostruito male due volte", () => {
    assert.deepEqual(app.STATI_SEME.map((s) => s.id), [
      "seed", "researching", "proposing", "awaiting_approval", "executing", "gated", "archived",
    ]);
  });

  test("«cancelled» NON è uno stato del Seme: è di un evento di Google Calendar", () => {
    assert.equal(app.statoSeme("cancelled"), null);
  });

  test("le etichette a schermo derivano dal registro: una sola scrittura", () => {
    assert.deepEqual(Object.keys(app.SEME_STATUS_LABELS), app.STATI_SEME.map((s) => s.id));
    for (const s of app.STATI_SEME) assert.equal(app.SEME_STATUS_LABELS[s.id], s.etichetta);
  });

  test("ogni stato dichiara fase, vivo e avanzabile — nessuna bandiera decorativa", () => {
    for (const s of app.STATI_SEME) {
      assert.equal(typeof s.etichetta, "string");
      assert.equal(typeof s.vivo, "boolean", s.id);
      assert.equal(typeof s.avanzabile, "boolean", s.id);
      assert.ok(s.fase === "ricerca" || s.fase === "esecuzione" || s.fase === null, s.id);
    }
  });

  test("archiviato è l'UNICO stato che non chiede attenzione", () => {
    assert.deepEqual(app.STATI_SEME.filter((s) => !s.vivo).map((s) => s.id), ["archived"]);
    assert.equal(app.semeVivo({ status: "archived" }), false);
    for (const s of app.STATI_SEME.filter((x) => x.vivo)) assert.equal(app.semeVivo({ status: s.id }), true, s.id);
  });

  test("UNO STATO SCONOSCIUTO CONTA COME VIVO: nascondere un Seme sarebbe la perdita peggiore", () => {
    // Può arrivare da un dato vecchio o da un ripristino fatto con un'altra versione dell'app.
    assert.equal(app.semeVivo({ status: "uno-stato-che-non-esiste" }), true);
    assert.equal(app.semeVivo({}), true);
    assert.equal(app.semeVivo(null), true);
    // Ma non è avanzabile: su uno stato che non si conosce non si spendono chiamate al modello.
    assert.equal(app.semeAvanzabile({ status: "uno-stato-che-non-esiste" }), false);
  });

  test("avanzabili solo i tre che l'avanzamento automatico prendeva davvero", () => {
    assert.deepEqual(app.STATI_SEME.filter((s) => s.avanzabile).map((s) => s.id), ["seed", "researching", "executing"]);
  });

  test("gli stati vivi NON avanzabili aspettano un gesto del Ghost", () => {
    assert.deepEqual(
      app.STATI_SEME.filter((s) => s.vivo && !s.avanzabile).map((s) => s.id),
      ["proposing", "awaiting_approval", "gated"],
    );
  });

  test("la fase di esecuzione è executing + gated, e decide quale registro si legge", () => {
    assert.equal(app.semeInEsecuzione({ status: "executing" }), true);
    assert.equal(app.semeInEsecuzione({ status: "gated" }), true);
    for (const id of ["seed", "researching", "proposing", "awaiting_approval", "archived"]) {
      assert.equal(app.semeInEsecuzione({ status: id }), false, id);
    }
  });

  test("l'inventario che va al modello nasconde gli archiviati e mostra tutti gli altri", () => {
    const semi = app.STATI_SEME.map((s, i) => ({ id: `s${i}`, status: s.id, content: `seme ${s.id}` }));
    const inv = app.costruisciInventario({ pBio: [], pAir: [], pVidya: [], semi });
    assert.ok(!inv.includes("seme archived"), "un Seme archiviato non deve occupare il prompt");
    for (const s of app.STATI_SEME.filter((x) => x.vivo)) {
      assert.ok(inv.includes(`seme ${s.id}`), `il Seme in stato "${s.id}" è sparito dall'inventario`);
    }
  });
});
