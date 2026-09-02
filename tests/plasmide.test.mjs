// Il plasmide: la forma, il guardiano, l'impronta, il pacchetto (02/09/2026).
//
// Da dove viene. Il Ghost: «vorrei che l'app fosse in grado di autoprogrammarsi e autoprodurre
// strumenti propri, e che queste competenze acquisite fossero trasferibili come un plasmide tra
// due batteri». E, alla domanda se fosse sostanza o orpello, il conto onesto: delle otto cose fatte
// oggi, tre erano funzioni pure che l'app avrebbe potuto scriversi da sola.
//
// Il vincolo che queste prove difendono più di ogni altro è il SECONDO: un plasmide porta una
// funzione, mai un dato. Non è igiene — è il vincolo assoluto del progetto. Un plasmide che
// portasse un frammento di memoria AIR nell'app di Marta sarebbe insieme una fuga di dati e una
// violazione della compartimentazione dell'identità professionale.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const buono = () => ({
  id: "p1", nome: "Scritture miste", versione: 1,
  problema: "una risposta che collassa in caratteri di alfabeti diversi",
  attacco: "criterio-degenerazione",
  codice: "(t) => (t.match(/\\p{Script=Han}/gu) || []).length >= 8 ? { criterio: 'han' } : null",
  prove: [
    { ingresso: "una risposta italiana normale, senza niente di strano", atteso: null, perche: "l'italiano normale non deve far scattare niente" },
    { ingresso: "我爱你我爱你我爱你我爱你", atteso: { criterio: "han" }, perche: "il caso reale del 02/09" },
  ],
});

describe("validaPlasmide — rifiuta con un motivo, mai con un no secco", () => {
  test("un plasmide completo passa", () => {
    assert.equal(app.validaPlasmide(buono()).valido, true);
  });
  test("ogni campo obbligatorio mancante è detto per nome", () => {
    for (const c of ["nome", "problema", "attacco", "codice"]) {
      const p = buono(); delete p[c];
      const v = app.validaPlasmide(p);
      assert.equal(v.valido, false, c);
      assert.ok(v.errori.some((e) => e.includes(c)), `l'errore deve nominare "${c}": ${v.errori.join(" / ")}`);
    }
  });
  test("UNA SOLA PROVA NON BASTA — la passa anche una funzione che risponde sempre uguale", () => {
    // Per un criterio di guasto la seconda prova serve a dimostrare che sa anche dire di NO, che è
    // il caso in cui i falsi positivi fanno danno. È la lezione del 28/08 sul piano alimentare.
    const p = buono(); p.prove = [p.prove[0]];
    const v = app.validaPlasmide(p);
    assert.equal(v.valido, false);
    assert.ok(v.errori.some((e) => e.includes(String(app.PROVE_MINIME))));
  });
  test("una prova senza PERCHÉ viene rifiutata", () => {
    // Una prova senza motivo non si può giudicare fra un mese, su un altro telefono.
    const p = buono(); delete p.prove[1].perche;
    assert.equal(app.validaPlasmide(p).valido, false);
  });
  test("un attacco che non esiste in questa versione dell'app viene rifiutato", () => {
    // Meglio rifiutarlo che tenerlo in magazzino senza che lo chiami mai nessuno: è così che un
    // magazzino di strumenti diventa cianfrusaglia.
    const p = buono(); p.attacco = "attacco-che-non-esiste";
    const v = app.validaPlasmide(p);
    assert.equal(v.valido, false);
    assert.ok(v.errori.some((e) => e.includes("non esiste")));
  });
  test("gli attacchi dichiarati hanno tutti un contratto leggibile", () => {
    assert.ok(app.ATTACCHI.length >= 1);
    for (const a of app.ATTACCHI) {
      assert.ok(a.id && a.etichetta && a.descrizione, `l'attacco ${a.id} non è descritto`);
      assert.equal(app.attaccoDi(a.id).id, a.id);
    }
    assert.equal(app.attaccoDi("inventato"), null);
  });
  test("un plasmide vuoto o assente non fa esplodere niente", () => {
    for (const p of [null, undefined, {}, []]) assert.equal(app.validaPlasmide(p).valido, false);
  });
});

describe("contieneDatiPersonali — IL VINCOLO CHE CONTA PIÙ DI TUTTI", () => {
  test("un plasmide pulito passa", () => {
    assert.deepEqual(app.contieneDatiPersonali(buono(), ["fisioterapista", "PhysioAlba"]), []);
  });
  test("un indirizzo di posta nel codice viene visto", () => {
    const p = buono(); p.codice = "(t) => t.includes('flavio@esempio.it') ? {criterio:'x'} : null";
    assert.ok(app.contieneDatiPersonali(p, []).length > 0);
  });
  test("SI GUARDA ANCHE DENTRO LE PROVE — è lì che i dati personali finiscono davvero", () => {
    // Un modello che scrive le prove prende volentieri un caso REALE dal log invece di inventarne
    // uno. Controllare solo il codice lascerebbe passare esattamente il caso più probabile.
    const p = buono();
    p.prove[0].ingresso = "chiamare il 3391234567 per l'appuntamento";
    assert.ok(app.contieneDatiPersonali(p, []).length > 0, "il numero nella prova deve essere visto");
  });
  test("L'IDENTITÀ PROFESSIONALE DICHIARATA non esce, in nessun campo", () => {
    // È l'hard-stop del progetto. Il termine arriva dal profilo del Ghost, non da un elenco che ho
    // indovinato io.
    for (const campo of ["problema", "nome", "codice"]) {
      const p = buono();
      p[campo] = campo === "codice" ? "(t) => t.includes('PhysioAlba')" : `qualcosa su PhysioAlba`;
      const trovati = app.contieneDatiPersonali(p, ["PhysioAlba"]);
      assert.ok(trovati.length > 0, `non visto in "${campo}"`);
      assert.ok(trovati.some((x) => x.includes("PhysioAlba")));
    }
  });
  test("una sequenza lunga di cifre è sospetta: può essere un identificativo o una data di nascita", () => {
    const p = buono(); p.prove[1].ingresso = "tessera 19850412";
    assert.ok(app.contieneDatiPersonali(p, []).length > 0);
  });
  test("un termine vietato troppo corto non fa scattare la guardia su mezza lingua italiana", () => {
    assert.deepEqual(app.contieneDatiPersonali(buono(), ["a", "il", ""]), []);
  });
});

describe("impronta e versioni — Legge 14 anche qui", () => {
  test("la stessa materia dà la stessa impronta, su qualunque dispositivo", () => {
    assert.equal(app.improntaPlasmide(buono()), app.improntaPlasmide(buono()));
  });
  test("cambiare il codice cambia l'impronta; cambiare il nome no", () => {
    const p = buono(), q = { ...buono(), codice: "(t) => null" }, r = { ...buono(), nome: "Altro nome" };
    assert.notEqual(app.improntaPlasmide(p), app.improntaPlasmide(q), "il codice è materia");
    assert.equal(app.improntaPlasmide(p), app.improntaPlasmide(r), "il nome non lo è");
  });
  test("una versione nuova NON sovrascrive: sale di uno e dice da dove viene", () => {
    const v1 = buono();
    const v2 = app.nuovaVersioneDi(v1, { codice: "(t) => null" });
    assert.equal(v2.versione, 2);
    assert.equal(v2.derivaDa, app.improntaPlasmide(v1), "la storia dello strumento resta leggibile");
  });
});

describe("il pacchetto che viaggia fra due app", () => {
  test("andata e ritorno senza perdere niente", () => {
    const { ok, plasmidi } = app.spacchetta(app.impacchetta([buono()], { app: "test" }));
    assert.equal(ok, true);
    assert.equal(plasmidi.length, 1);
    assert.equal(plasmidi[0].codice, buono().codice);
  });
  test("un file che non è un pacchetto di plasmidi viene rifiutato con un motivo", () => {
    for (const x of [null, {}, { tipo: "altro" }, { plasmidi: [] }]) {
      const r = app.spacchetta(x);
      assert.equal(r.ok, false);
      assert.ok(r.motivo.length > 10, "il motivo deve essere leggibile");
    }
  });
  test("UN FORMATO PIÙ NUOVO NON SI LEGGE A METÀ — si dichiara e si dice di aggiornare", () => {
    // Fra le due app una può essere indietro di un deploy: leggere a metà sarebbe peggio che non
    // leggere, perché il plasmide sembrerebbe entrato.
    const r = app.spacchetta({ tipo: "resonance-plasmidi", formato: 99, plasmidi: [buono()] });
    assert.equal(r.ok, false);
    assert.match(r.motivo, /aggiorna l'app/);
  });
  test("il pacchetto dichiara sempre il proprio formato", () => {
    assert.equal(app.impacchetta([buono()]).formato, app.PLASMIDE_VERSIONE_FORMATO);
  });
});

describe("il magazzino — separato dal cromosoma", () => {
  test("salva, rilegge, dimentica", () => {
    globalThis.__store.clear();
    app.salvaPlasmide(buono());
    assert.equal(app.leggiPlasmidi().length, 1);
    assert.equal(app.leggiPlasmidi()[0].impronta, app.improntaPlasmide(buono()), "l'impronta viene calcolata al salvataggio");
    app.dimenticaPlasmide("p1");
    assert.equal(app.leggiPlasmidi().length, 0);
  });
  test("salvare due volte lo stesso id aggiorna, non duplica", () => {
    globalThis.__store.clear();
    app.salvaPlasmide(buono());
    app.salvaPlasmide({ ...buono(), nome: "rinominato" });
    assert.equal(app.leggiPlasmidi().length, 1);
    assert.equal(app.leggiPlasmidi()[0].nome, "rinominato");
  });
  const provato = (extra = {}) => ({ ...buono(), attivo: true, ultimaProva: { quando: "2026-09-02", passato: true, motivo: "" }, ...extra });
  test("UNO SPENTO NON VIENE CHIAMATO — è il default di ciò che arriva da un'altra app", () => {
    globalThis.__store.clear();
    app.salvaPlasmide(provato({ attivo: false }));
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 0);
    app.salvaPlasmide(provato());
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 1);
  });
  test("UNO MAI PROVATO SU QUESTO DISPOSITIVO NON VIENE CHIAMATO, anche se acceso", () => {
    // Trovato dalla verifica nel browser, non dal ragionamento: nel banco di prova avevo scritto un
    // plasmide dritto in memoria saltando l'ammissione, e ha girato lo stesso dentro un'Agorà vera.
    // Se si può entrare senza passare dalla porta, la porta non serve — e in memoria ci si finisce
    // in tanti modi: un ripristino, una sincronizzazione, un file modificato a mano.
    globalThis.__store.clear();
    app.salvaPlasmide({ ...buono(), attivo: true });                       // nessuna ultimaProva
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 0);
    app.salvaPlasmide(provato({ ultimaProva: { quando: "x", passato: false, motivo: "non passa" } }));
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 0, "prove fallite = non si chiama");
    app.salvaPlasmide(provato());
    assert.equal(app.plasmidiPerAttacco("criterio-degenerazione").length, 1);
  });
  test("L'ANELLO ANCHE QUI: si conta quante volte è stato chiamato e quante ha trovato qualcosa", () => {
    // È l'unica cosa che distingue un magazzino vivo da un magazzino di cianfrusaglia.
    globalThis.__store.clear();
    app.salvaPlasmide(buono());
    app.segnaPlasmideUsato("p1", false);
    app.segnaPlasmideUsato("p1", true);
    const p = app.leggiPlasmidi()[0];
    assert.equal(p.chiamate, 2);
    assert.equal(p.trovati, 1);
    assert.ok(p.ultimoUso);
  });
  test("memoria corrotta non fa saltare la lettura", () => {
    globalThis.__store.set("plasmidi", '"non-un-array"');
    assert.deepEqual(app.leggiPlasmidi(), []);
  });
});

describe("il recinto — le porte che devono restare chiuse", () => {
  test("l'elenco dei nomi da chiudere copre rete, archivi e worker annidati", () => {
    // fetch è l'unico che il Worker espone davvero (misurato): gli altri sono chiusi lo stesso,
    // perché la piattaforma può cambiare e questo elenco è la sola difesa dichiarata.
    for (const n of ["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "indexedDB", "Worker"]) {
      assert.ok(app.NOMI_DA_CHIUDERE.includes(n), `manca "${n}"`);
    }
  });
  test("il tetto di tempo esiste ed è breve", () => {
    assert.ok(app.SANDBOX_TETTO_MS > 0 && app.SANDBOX_TETTO_MS <= 5000);
  });
});
