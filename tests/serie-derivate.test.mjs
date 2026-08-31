// Le serie misurate e le loro derivate (31/08/2026).
//
// Da dove viene: il referto retrospettivo del 31/08 elencava fra le carenze "il corpo non manda dati
// al pilastro del corpo". Aprendo il codice per ripararla si e' scoperto che i dati c'erano gia' —
// ogni voce BIO porta weight e sleep da sempre — e che la carenza vera era un'altra, la 03: nessuno
// calcolava niente su quei numeri. L'unica cosa numerica che Simbiosi riceveva su BIO era
// "ultima voce N giorni fa".
//
// Queste prove esistono perche' un numero sbagliato qui non produce un errore visibile: produce una
// frase sicura di se' dentro un prompt ("sei in calo di 2 kg") che il Ghost non ha modo di smentire.
// E' esattamente il tipo di bugia che questo progetto passa il tempo a togliere di mezzo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

const GIORNO = 86400000;
// Un log BIO come lo produce davvero l'app: date "YYYY-MM-DD", weight/sleep stringhe (vengono da
// campi di testo), il piu' recente per primo — l'ordine in cui App tiene bio-data.
const vociBio = (righe) => righe.map(([date, weight, sleep], i) => ({ id: `v${i}`, date, weight, sleep, notes: "" }));

describe("numeroItaliano — la virgola non e' un errore di battitura, e' come si scrive qui", () => {
  test("virgola e punto valgono lo stesso", () => {
    assert.equal(app.numeroItaliano("78,4"), 78.4);
    assert.equal(app.numeroItaliano("78.4"), 78.4);
  });
  test("l'unita' attaccata non disturba", () => {
    assert.equal(app.numeroItaliano("78,4 kg"), 78.4);
  });
  test("un numero vero passa invariato", () => {
    assert.equal(app.numeroItaliano(78.4), 78.4);
  });
  test("cio' che non contiene un numero non ne inventa uno", () => {
    for (const v of ["", null, undefined, "poco", {}, NaN]) assert.equal(app.numeroItaliano(v), null);
  });
});

describe("oreDaTesto — il sonno il Ghost lo scrive come gli viene", () => {
  test("le forme ore+minuti non perdono la mezz'ora", () => {
    assert.equal(app.oreDaTesto("6h30"), 6.5);
    assert.equal(app.oreDaTesto("7:30"), 7.5);
    assert.equal(app.oreDaTesto("7 ore e 30"), 7.5);
  });
  test("le forme semplici restano semplici", () => {
    assert.equal(app.oreDaTesto("7"), 7);
    assert.equal(app.oreDaTesto("7,5"), 7.5);
  });
  test("un testo che non e' una durata non produce una durata", () => {
    assert.equal(app.oreDaTesto("male, apnee"), null);
    assert.equal(app.oreDaTesto(""), null);
  });
});

describe("fattiDaLogBio — cosa entra e cosa viene rifiutato", () => {
  test("peso e sonno diventano due fatti distinti", () => {
    const f = app.fattiDaLogBio(vociBio([["2026-08-30", "78,4", "7"]]));
    assert.equal(f.length, 2);
    assert.deepEqual(f.map((x) => x.soggetto).sort(), ["peso", "sonno"]);
    assert.equal(f.find((x) => x.soggetto === "peso").valore, 78.4);
    assert.equal(f.find((x) => x.soggetto === "peso").unita, "kg");
  });
  test("una voce di sole note non produce fatti — e non e' un errore", () => {
    assert.deepEqual(app.fattiDaLogBio([{ id: "a", date: "2026-08-30", notes: "giornata storta" }]), []);
  });
  test("IL DITO SCIVOLATO: «784» invece di «78,4» non entra nella serie", () => {
    // Senza questo limite un peso digitato male resterebbe li' per sempre, e la derivata che ne esce
    // finisce dentro un prompt come se fosse un fatto misurato.
    assert.deepEqual(app.fattiDaLogBio(vociBio([["2026-08-30", "784", ""]])), []);
    assert.deepEqual(app.fattiDaLogBio(vociBio([["2026-08-30", "7", ""]])), []);
  });
  test("un sonno di 30 ore non esiste", () => {
    assert.deepEqual(app.fattiDaLogBio(vociBio([["2026-08-30", "", "30"]])), []);
  });
  test("una voce senza data viene saltata: senza data non c'e' serie", () => {
    assert.deepEqual(app.fattiDaLogBio([{ id: "a", date: "", weight: "78" }]), []);
  });
});

describe("serieDi — una misura al giorno, in ordine", () => {
  const f = app.fattiDaLogBio(vociBio([
    ["2026-08-30", "78,4", ""], ["2026-08-20", "79,6", ""], ["2026-08-10", "81,2", ""],
  ]));
  test("il log e' dal piu' recente, la serie va dal piu' vecchio", () => {
    const s = app.serieDi(f, "peso");
    assert.deepEqual(s.map((x) => x.valore), [81.2, 79.6, 78.4]);
  });
  test("un soggetto senza dati da' una serie vuota, non un errore", () => {
    assert.deepEqual(app.serieDi(f, "sonno"), []);
  });
  test("DUE PESATE LO STESSO GIORNO NON SONO UNA TENDENZA: ne resta una", () => {
    // Tenerle entrambe farebbe comparire una variazione in zero giorni, cioe' una velocita' infinita.
    const doppia = app.fattiDaLogBio(vociBio([["2026-08-30", "78,4", ""], ["2026-08-30", "78,9", ""]]));
    assert.equal(app.serieDi(doppia, "peso").length, 1);
  });
});

describe("derivata — il calcolo che prima nessuno faceva", () => {
  const serie = app.serieDi(app.fattiDaLogBio(vociBio([
    ["2026-08-31", "78,2", ""], ["2026-08-17", "80,0", ""], ["2026-08-03", "81,0", ""],
  ])), "peso");

  test("delta e giorni sono quelli veri, presi dagli estremi", () => {
    const d = app.derivata(serie);
    assert.equal(d.giorni, 28);
    assert.equal(Number(d.delta.toFixed(2)), -2.8);
    assert.equal(d.n, 3);
    assert.equal(d.direzione, "in discesa");
  });
  test("la velocita' per settimana e' delta/giorni per sette, non un'impressione", () => {
    const d = app.derivata(serie);
    assert.equal(Number(d.perSettimana.toFixed(3)), Number((-2.8 / 28 * 7).toFixed(3)));
  });
  test("con una misura sola non c'e' derivata — e si dice null, non zero", () => {
    // Zero direbbe "stabile", che e' un'affermazione. null dice "non lo so", che e' la verita'.
    const una = app.serieDi(app.fattiDaLogBio(vociBio([["2026-08-31", "78,2", ""]])), "peso");
    assert.equal(app.derivata(una), null);
  });
  test("SU UN SOLO GIORNO DI DISTANZA non si estrapola una velocita' settimanale", () => {
    const stretta = app.serieDi(app.fattiDaLogBio(vociBio([["2026-08-31", "78,2", ""], ["2026-08-30", "78,9", ""]])), "peso");
    const d = app.derivata(stretta);
    assert.equal(d.giorni, 1);
    assert.equal(d.perSettimana, null, "moltiplicare per sette il rumore di un giorno darebbe -4,9 kg/settimana");
  });
  test("una serie piatta e' «stabile», non una direzione inventata", () => {
    const piatta = app.serieDi(app.fattiDaLogBio(vociBio([["2026-08-31", "78", ""], ["2026-08-24", "78", ""]])), "peso");
    assert.equal(app.derivata(piatta).direzione, "stabile");
  });
});

describe("freschezza — un dato di marzo non parla con la voce di ieri", () => {
  const ora = new Date("2026-08-31T12:00:00Z").getTime();
  test("le tre soglie", () => {
    assert.equal(app.freschezza("2026-08-30", ora).stato, "fresco");
    assert.equal(app.freschezza("2026-08-10", ora).stato, "stantio");
    assert.equal(app.freschezza("2026-03-10", ora).stato, "vecchio");
  });
  test("i giorni contati sono quelli veri", () => {
    assert.equal(app.freschezza("2026-08-21", ora).giorni, 10);
  });
  test("una data illeggibile non produce una freschezza finta", () => {
    assert.equal(app.freschezza("boh"), null);
  });
});

describe("righeSerie / formatSerieBlock — quello che leggono il modello e il Ghost", () => {
  const ora = new Date("2026-08-31T12:00:00Z").getTime();
  const fatti = app.fattiDaLogBio(vociBio([
    ["2026-08-31", "78,2", "7"], ["2026-08-17", "80,0", "6h30"], ["2026-08-03", "81,0", "8"],
  ]));

  test("una riga per soggetto misurato", () => {
    const r = app.righeSerie(fatti, ora);
    assert.deepEqual(r.map((x) => x.soggetto), ["peso", "sonno"]);
  });
  test("la riga del peso porta i numeri veri, scritti all'italiana", () => {
    const peso = app.righeSerie(fatti, ora).find((x) => x.soggetto === "peso").testo;
    assert.match(peso, /78,2 kg/);
    assert.match(peso, /oggi/);
    assert.match(peso, /in discesa di 2,8 kg in 28 giorni/);
    assert.match(peso, /su 3 misure/);
  });
  test("SE NON C'E' NIENTE, IL BLOCCO E' VUOTO — e non una frase che sembra un dato", () => {
    // E' la meta' che conta della regola: se il blocco non c'e', il modello non ha ricevuto nessuna
    // tendenza, quindi qualunque andamento raccontasse se lo sarebbe inventato.
    assert.equal(app.formatSerieBlock([], ora), "");
    assert.equal(app.formatSerieBlock(app.fattiDaLogBio([{ id: "a", date: "2026-08-30", notes: "niente numeri" }]), ora), "");
  });
  test("il blocco dichiara al modello che i numeri sono calcolati, non da stimare", () => {
    const b = app.formatSerieBlock(fatti, ora);
    assert.match(b, /CALCOLATI dal programma/);
    assert.match(b, /non va inventata/);
  });
  test("una misura sola dichiara di essere una misura sola", () => {
    const una = app.fattiDaLogBio(vociBio([["2026-08-31", "78,2", ""]]));
    assert.match(app.righeSerie(una, ora)[0].testo, /una sola misura, nessuna tendenza calcolabile/);
  });
  test("UNA SERIE VECCHIA LO DICHIARA: e' la carenza 06 del referto, resa concreta", () => {
    const vecchia = app.fattiDaLogBio(vociBio([["2026-05-01", "80", ""], ["2026-04-01", "82", ""]]));
    const riga = app.righeSerie(vecchia, ora)[0];
    assert.equal(riga.stato, "vecchio");
    assert.match(riga.testo, /dato vecchio: l'ultima misura ha \d+ giorni/);
  });
  test("una serie fresca non porta nessun avviso addosso", () => {
    const riga = app.righeSerie(fatti, ora).find((x) => x.soggetto === "peso");
    assert.equal(riga.stato, "fresco");
    assert.doesNotMatch(riga.testo, /dato (stantio|vecchio)/);
  });
});

describe("le derivate arrivano davvero dove servono", () => {
  test("il blocco che va nel prompt e le righe che vede il Ghost dicono la stessa cosa", () => {
    // Se divergessero, l'app e il modello racconterebbero due tendenze diverse sullo stesso peso —
    // peggio che non dirla affatto, perche' il Ghost non avrebbe modo di accorgersene.
    const ora = new Date("2026-08-31T12:00:00Z").getTime();
    const fatti = app.fattiDaLogBio(vociBio([["2026-08-31", "78,2", ""], ["2026-08-03", "81,0", ""]]));
    const blocco = app.formatSerieBlock(fatti, ora);
    for (const r of app.righeSerie(fatti, ora)) assert.ok(blocco.includes(r.testo), `il blocco deve contenere: ${r.testo}`);
  });
  test("un log lungo non fa esplodere niente e resta una riga per soggetto", () => {
    const ora = Date.now();
    const righe = [];
    for (let i = 0; i < 200; i++) {
      const d = new Date(ora - i * GIORNO).toISOString().slice(0, 10);
      righe.push([d, String(80 - i * 0.01).replace(".", ","), "7"]);
    }
    const r = app.righeSerie(app.fattiDaLogBio(vociBio(righe)), ora);
    assert.equal(r.length, 2);
    assert.match(r[0].testo, /su 200 misure/);
  });
});
