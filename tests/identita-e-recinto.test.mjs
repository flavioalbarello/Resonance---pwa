// I PUNTI DOVE IL SISTEMA TOCCA IL MONDO — 09/09/2026.
//
// Il report del 09/09 ha misurato che il banco difende la logica pura e NON i vincoli di §1, e che
// tre funzioni erano IRRAGGIUNGIBILI perché assenti da EXPORT_NAMES. Erano esattamente le tre dove
// il sistema tocca il mondo. Questo file le rende difendibili.
//
// La cosa peggiore che il report ha trovato non era una lacuna: erano DUE COPERTURE CHE SEMBRAVANO
// ESSERCI. Una lacuna nota si gestisce; una difesa che sembra esserci fa costruire sopra. La prima
// metà di questo file esiste per quella.
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";
import { installaFintoRecinto, nelRecinto } from "./lib/finto-recinto.mjs";

const app = await loadApp();
const disinstalla = installaFintoRecinto();
after(() => disinstalla());

// ════════════════════════════════════════════════════════════════════════════
// A.1 · IL RECINTO — provare la CHIUSURA, non l'elenco
// ════════════════════════════════════════════════════════════════════════════
// La prova che c'era controllava `NOMI_DA_CHIUDERE.includes(n)` per sei nomi su undici: verificava
// che l'ELENCO li nominasse, non che l'involucro li CHIUDESSE. Rompendo il ciclo di chiusura il
// banco sarebbe rimasto verde.
//
// Perché la prova comportamentale non era scrivibile prima: il finto recinto dava all'involucro un
// `self` che era un oggetto normale, mentre in un Worker vero `self` È il globale. Lo strumento
// viene eseguito con eval indiretto, che risolve nel globale — quindi `fetch` dentro il recinto
// finto era il fetch DI NODE, non quello chiuso dall'involucro. Riscritto su `node:vm`, dove `self`
// punta al globale del contesto: vedi il commento in testa a finto-recinto.mjs.
describe("A.1 · il recinto chiude davvero, uno per uno", () => {
  // Uno strumento che prova a raggiungere il nome. LA PROPRIETÀ È LA RAGGIUNGIBILITÀ, non la
  // chiamabilità, e la distinzione è costata una versione di questa prova: la prima CHIAMAVA il
  // valore trovato, e per i sette nomi che sono CLASSI (XMLHttpRequest, WebSocket, Worker…)
  // chiamare senza `new` lancia un TypeError. Risultato: la prova diceva "chiuso" anche quando il
  // nome era lì, vivo e istanziabile. Verificato togliendo l'intero ciclo di chiusura: solo 4 delle
  // 11 prove diventavano rosse. Era lo stesso identico difetto che questo file esiste per
  // correggere — una prova verde per la ragione sbagliata — e l'avevo appena riscritto io.
  // `typeof` non lancia mai su un nome non dichiarato: è l'unico modo di chiedere "c'è?" senza
  // confondere l'assenza con un errore di chiamata.
  const strumentoCheUsa = (nome) => `(t) => {
    const tipo = typeof ${nome};
    if (tipo === "undefined") return { criterio: "chiuso", come: "non raggiungibile" };
    return { criterio: "RAGGIUNTO", come: "presente come " + tipo };
  }`;

  for (const nome of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
                      "indexedDB", "caches", "Notification", "BroadcastChannel", "SharedWorker", "Worker"]) {
    test(`"${nome}" non è raggiungibile da dentro il recinto`, async () => {
      const esito = await nelRecinto(app.INVOLUCRO_SANDBOX, strumentoCheUsa(nome), ["qualsiasi"]);
      assert.equal(esito.ok, true, `l'involucro non ha nemmeno compilato: ${esito.errore}`);
      const u = esito.esiti[0];
      assert.equal(u.ok, true, `lo strumento è esploso invece di rispondere: ${u.errore}`);
      assert.equal(u.uscita.criterio, "chiuso",
        `"${nome}" È RAGGIUNGIBILE dentro il recinto (${u.uscita.come}): il recinto è bucato`);
    });
  }

  test("TUTTI e undici i nomi dichiarati sono davvero chiusi — nessuno a campione", async () => {
    // Il legame fra l'elenco e il comportamento: se domani si aggiunge un nome a NOMI_DA_CHIUDERE
    // e l'involucro non lo chiude, questa prova diventa rossa senza che nessuno debba ricordarsene.
    const codice = `(t) => {
      const nomi = ${JSON.stringify(app.NOMI_DA_CHIUDERE)};
      const aperti = nomi.filter((n) => { try { return typeof (0, eval)(n) !== "undefined"; } catch (e) { return false; } });
      return aperti.length ? { criterio: "aperti", aperti } : null;
    }`;
    const esito = await nelRecinto(app.INVOLUCRO_SANDBOX, codice, ["x"]);
    assert.equal(esito.ok, true, esito.errore);
    assert.equal(esito.esiti[0].uscita, null,
      `restano aperti: ${JSON.stringify(esito.esiti[0].uscita?.aperti)}`);
    assert.equal(app.NOMI_DA_CHIUDERE.length, 11);
  });

  test("IL DOPPIO PASSAGGIO REGGE: non si riapre riassegnando", async () => {
    // `delete` non basta quando la proprietà vive sul prototipo, e una semplice assegnazione a
    // undefined si può riassegnare. È il motivo per cui l'involucro fa due passaggi per ogni nome.
    const codice = `(t) => {
      try { self.fetch = () => "riaperto"; } catch (e) { /* non-configurabile: giusto così */ }
      try { Object.defineProperty(self, "fetch", { value: () => "riaperto" }); } catch (e) { /* idem */ }
      return typeof fetch === "undefined" ? null : { criterio: "RIAPERTO" };
    }`;
    const esito = await nelRecinto(app.INVOLUCRO_SANDBOX, codice, ["x"]);
    assert.equal(esito.ok, true, esito.errore);
    assert.equal(esito.esiti[0].uscita, null, "uno strumento è riuscito a riaprire fetch");
  });

  test("il recinto NON è vuoto per caso: senza involucro quei nomi ci sarebbero", async () => {
    // Il controllo che rende le prove qui sopra non banali. Se il contesto non avesse mai avuto
    // `fetch`, "non raggiungibile" non direbbe niente sull'involucro. Con un involucro che non
    // chiude niente, lo stesso strumento lo trova.
    const involucroInerte = app.INVOLUCRO_SANDBOX.replace(/for \(const nome of \[[\s\S]*?\n\}\n/, "");
    const esito = await nelRecinto(involucroInerte, strumentoCheUsa("fetch"), ["x"]);
    assert.equal(esito.ok, true, esito.errore);
    assert.equal(esito.esiti[0].uscita.criterio, "RAGGIUNTO",
      "senza il ciclo di chiusura fetch dovrebbe esserci: se non c'è, la prova sopra è verde per la ragione sbagliata");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// A.2 · I LOG SONO ADDITIVI — «nessuna voce si perde mai»
// ════════════════════════════════════════════════════════════════════════════
// La proprietà era dichiarata nel rapporto e indifesa: `mergeById` compariva in un solo assert, e
// lì per contrasto. La distinzione che il banco non conosceva: i BUNDLE seguono vince-il-più-recente,
// i LOG no — si uniscono sempre, e chi ha il timestamp più vecchio non perde le proprie voci.
describe("A.2 · i log si uniscono, i bundle no", () => {
  const voce = (id, date) => ({ id, date, text: "voce " + id });
  const stato = (extra) => ({ ...app.SYNC_DEFAULTS(), ...extra });

  test("VOCI DISGIUNTE SU BIO/AIR/VIDYA: nessuna sparisce", () => {
    const qui = stato({
      lastModified: 1000,
      bio: [voce("b1", "2026-09-01"), voce("b2", "2026-09-02")],
      air: [voce("a1", "2026-09-01")], vidya: [voce("v1", "2026-09-01")],
    });
    const la = stato({
      lastModified: 2000,
      bio: [voce("b3", "2026-09-03")], air: [voce("a2", "2026-09-02")], vidya: [voce("v2", "2026-09-02")],
    });
    const m = app.mergeSyncState(qui, la);
    assert.deepEqual(m.bio.map((v) => v.id).sort(), ["b1", "b2", "b3"]);
    assert.deepEqual(m.air.map((v) => v.id).sort(), ["a1", "a2"]);
    assert.deepEqual(m.vidya.map((v) => v.id).sort(), ["v1", "v2"]);
  });

  test("IL DISPOSITIVO PIÙ VECCHIO NON PERDE LE PROPRIE VOCI — è il caso che conta", () => {
    // Chi ha lastModified più vecchio PERDE i bundle (chat, memoria, kernel): è la regola. Ma le
    // sue voci di log devono restare, perché sono dati che nessun altro ha.
    const vecchio = stato({ lastModified: 1, bio: [voce("solo-mia", "2026-09-01")], shellChat: [{ id: "c1", text: "mia" }] });
    const nuovo = stato({ lastModified: 999999, bio: [voce("sua", "2026-09-05")], shellChat: [{ id: "c2", text: "sua" }] });
    const m = app.mergeSyncState(vecchio, nuovo);
    assert.ok(m.bio.some((v) => v.id === "solo-mia"), "il dispositivo più vecchio ha perso una voce di log");
    assert.equal(m.shellChat[0].id, "c2", "sui bundle deve invece vincere il più recente");
  });

  test("i percorsi e i Semi si uniscono come i log", () => {
    const qui = stato({ lastModified: 1, pBio: [{ id: "p1" }], pAir: [{ id: "p2" }], pVidya: [{ id: "p3" }], semi: [{ id: "s1" }], magi: [{ id: "m1" }] });
    const la = stato({ lastModified: 2, pBio: [{ id: "p4" }], pAir: [{ id: "p5" }], pVidya: [{ id: "p6" }], semi: [{ id: "s2" }], magi: [{ id: "m2" }] });
    const m = app.mergeSyncState(qui, la);
    for (const [k, attesi] of [["pBio", 2], ["pAir", 2], ["pVidya", 2], ["semi", 2], ["magi", 2]]) {
      assert.equal(m[k].length, attesi, `"${k}" ha perso qualcosa`);
    }
  });

  test("a parità di id vince la versione locale, e la voce non si duplica", () => {
    const qui = stato({ lastModified: 1, bio: [{ id: "x", date: "2026-09-01", text: "mia" }] });
    const la = stato({ lastModified: 2, bio: [{ id: "x", date: "2026-09-01", text: "loro" }] });
    const m = app.mergeSyncState(qui, la);
    assert.equal(m.bio.length, 1);
    assert.equal(m.bio[0].text, "mia");
  });

  test("senza file remoto non si perde niente e lastModified resta sensato", () => {
    const qui = stato({ lastModified: 55, bio: [voce("b1", "2026-09-01")] });
    const m = app.mergeSyncState(qui, null);
    assert.equal(m.bio.length, 1);
    assert.equal(m.lastModified, 55);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B.1 · redactProfessionalIdentity — il vincolo G.1
// ════════════════════════════════════════════════════════════════════════════
// Il criterio dichiarato dal Ghost il 02/09: il NOME che identifica non esce; la PROFESSIONE, che
// non identifica nessuno, può uscire. Una prova che censurasse troppo non sarebbe una difesa:
// sarebbe un guasto, perché nessuno strumento clinico resterebbe trasferibile.
describe("B.1 · l'identità professionale: il nome non esce, il dominio sì", () => {
  const prof = {
    name: "Flavio Albarello", professionalIdentity: "fisioterapista, PhysioAlba",
    hasProfessionalConstraint: true, hardConstraints: [],
  };
  const red = (t) => app.redactProfessionalIdentity(t, prof);

  test("IL NOME PROPRIO NON ESCE", () => {
    assert.ok(!red("Il progetto PhysioAlba cresce.").includes("PhysioAlba"));
    assert.ok(!red("Ne ho parlato con Flavio ieri.").includes("Flavio"));
    assert.ok(!red("Albarello ha scritto la scheda.").includes("Albarello"));
  });

  test("LA PROFESSIONE ESCE — censurare qui romperebbe il pilastro AIR", () => {
    const t = "Un fisioterapista imposta il carico in base alla risposta del tessuto.";
    assert.equal(red(t), t, "«fisioterapista» è un dominio, non identifica nessuno: deve poter uscire");
  });

  test("maiuscole e minuscole non aggirano la redazione", () => {
    for (const v of ["physioalba", "PHYSIOALBA", "PhYsIoAlBa"]) {
      assert.ok(!red(`Parliamo di ${v} adesso.`).toLowerCase().includes("physioalba"), v);
    }
  });

  test("il possessivo che espone l'identità viene tolto anche senza il nome", () => {
    for (const v of ["i miei pazienti", "il mio studio", "la mia clinica", "dove lavoro"]) {
      assert.ok(red(`Ne parlo con ${v} spesso.`).includes("[identità professionale omessa]"), v);
    }
  });

  test("senza vincolo dichiarato non si tocca niente", () => {
    const senza = { ...prof, hasProfessionalConstraint: false };
    const t = "PhysioAlba e Flavio.";
    assert.equal(app.redactProfessionalIdentity(t, senza), t);
    assert.equal(app.redactProfessionalIdentity(t, null), t);
  });

  test("testo vuoto o assente non fa saltare niente", () => {
    for (const t of ["", null, undefined]) assert.equal(red(t), t);
  });

  // Avevo scritto questa prova aspettandomi che le forme ATTACCATE passassero: la funzione redige
  // sui confini di parola (\b), e un nome dentro uno slug o un dominio sembrava doverne uscire
  // indenne. Misurato: NON passano — `\b` riconosce come confine anche `-`, `.`, `#` e l'apostrofo.
  // Il codice è migliore di come l'avevo supposto, e la prova rossa era mia, non sua. Resta qui
  // perché sono le forme che un modello produce davvero (nomi file, slug, domini, hashtag).
  test("nemmeno le forme attaccate fanno uscire il nome", () => {
    for (const c of ["scheda-PhysioAlba-2026.pdf", "www.physioalba.it", "#PhysioAlba", "PhysioAlba's", "(PhysioAlba)"]) {
      assert.ok(!red(c).toLowerCase().includes("physioalba"), `passa: ${c}`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B.3 · APP_CAPABILITIES_CONTEXT — il vincolo C.8
// ════════════════════════════════════════════════════════════════════════════
// La proprietà di §14.2: una feature nuova che non compare lì è INVISIBILE allo Shell. Non si prova
// il contenuto: si prova che il blocco resti al passo con ciò che esiste davvero.
describe("B.3 · una capacità non dichiarata è invisibile allo Shell", () => {
  // La prima versione di questa prova cercava gli id delle azioni dentro APP_CAPABILITIES_CONTEXT,
  // ed è diventata rossa su quattordici id su quindici. Non era un difetto: le azioni sono
  // dichiarate al modello da un ALTRO blocco, formatAzioniBlock, costruito dal registro. Il brief
  // proponeva quella prova come possibile; il codice dice che l'invariante vive altrove, e una
  // prova scritta sul posto sbagliato sarebbe stata di nuovo una difesa apparente.
  test("OGNI AZIONE ACCESA È DESCRITTA AL MODELLO — nessuna resta silenziosa", () => {
    // La proprietà vera di §14.2: il modello non può scegliere qualcosa che non gli è stato detto.
    globalThis.__store.clear();
    for (const a of app.AZIONI_CONVERSAZIONALI) app.scriviInterruttore(a.id, true);
    const attive = app.azioniAttive();
    assert.equal(attive.length, app.AZIONI_CONVERSAZIONALI.length, "un'azione non si è accesa");
    const blocco = app.formatAzioniBlock(attive);
    const mute = attive.filter((a) => !blocco.includes(a.perConversazione || a.descrizione));
    assert.deepEqual(mute.map((a) => a.id), [],
      `azioni eseguibili che il modello non sa di avere: ${mute.map((a) => a.id).join(", ")}`);
  });

  test("QUINDICI azioni, non dieci — il numero che il RAPPORTO_STATO sbaglia ancora", () => {
    // Pinta qui perché è la deriva misurata dal report del 09/09 e non ancora corretta nel rapporto.
    assert.equal(app.AZIONI_CONVERSAZIONALI.length, 15);
    for (const id of ["invia_mail", "cancella_evento_calendario", "sposta_evento_calendario",
                      "leggi_calendario", "trova_evento_calendario"]) {
      assert.ok(app.AZIONI_CONVERSAZIONALI.some((a) => a.id === id), `manca "${id}"`);
    }
  });

  test("con tutte spente il modello lo sa, invece di proporre cose che verrebbero rifiutate", () => {
    // Nota misurata scrivendo questa prova: uno store VUOTO non vuol dire "tutte spente" — nove
    // azioni su quindici sono accese per impostazione predefinita. Vanno spente esplicitamente,
    // altrimenti si proverebbe il caso sbagliato credendo di provare questo.
    globalThis.__store.clear();
    for (const a of app.AZIONI_CONVERSAZIONALI) app.scriviInterruttore(a.id, false);
    assert.equal(app.azioniAttive().length, 0);
    assert.match(app.formatAzioniBlock(app.azioniAttive()), /non puo' compiere nessuna azione/);
  });

  test("le feature che hanno un magazzino proprio sono nominate", () => {
    for (const parola of ["Plasmidi", "Trappole", "anello", "capitolato", "recinto"]) {
      assert.ok(app.APP_CAPABILITIES_CONTEXT.toLowerCase().includes(parola.toLowerCase()),
        `"${parola}" non compare: lo Shell non sa che esiste`);
    }
  });

  test("gli attacchi dei plasmidi sono nominati", () => {
    for (const a of app.ATTACCHI) {
      // Confronto senza maiuscole: nel blocco l'etichetta compare in minuscolo dentro una frase.
      // La prima versione era sensibile alle maiuscole ed è diventata rossa per quello, non per un
      // attacco non dichiarato.
      const blocco = app.APP_CAPABILITIES_CONTEXT.toLowerCase();
      assert.ok(blocco.includes(a.id.toLowerCase()) || blocco.includes(a.etichetta.toLowerCase()),
        `l'attacco "${a.id}" non è dichiarato allo Shell`);
    }
  });
});
