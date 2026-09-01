// La forma delle risposte dell'Agorà, e il ragionamento che ci finiva dentro (01/09/2026).
//
// Da dove viene. Il Ghost, sulla terza Agorà: "non ti sembra troppo prolisso? quanti token
// sprechiamo così?". Guardando le schermate quello sotto MELCHIOR non era una risposta lunga: era
// la deliberazione del modello stampata parola per parola — «Devo: 1. Rispondere come MELCHIOR…
// Contiamo: Operazione(1) eseguibile:(2)… 56 parole. Perfetto. Ultimo controllo… Versione pulita:»
// — e solo in fondo la risposta vera, di 56 parole.
//
// Il testo usato qui sotto per il caso principale è ricalcato su QUELLA schermata, non inventato:
// è l'unico caso reale osservato, ed è quello su cui il rimedio deve funzionare.
//
// Cosa NON provano questi test: che Kimi smetta di scrivere la deliberazione. Non smette, e non
// serve che smetta — il punto del rimedio è che quello che scrive prima del JSON non arriva sullo
// schermo. Provare la chiamata vera richiede una chiave che qui non c'è.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./lib/build-testable.mjs";

const app = await loadApp();

// Ricalcato sulla schermata del 01/09/2026.
const RISPOSTA_VERA = "· Operazione eseguibile in Atto III: registrare le tre scene su telefono, una per sera.\n· Vincolo: 20 minuti a sera, non di più.\n· Verifica: se al terzo giorno non ci sono tre file audio, il passo è troppo grande.";
const DELIBERAZIONE = `Devo: 1. Rispondere come MELCHIOR, il Traduttore. 2. Restare sotto le 70 parole.
Contiamo: Operazione(1) eseguibile:(2) in(3) Atto(4) III(5)...
Circa 50 parole. Bene. Ma devo essere più MELCHIOR.
Contiamo parole di nuovo: 56 parole. Perfetto.
Ultimo controllo: "produce—non" il trattino potrebbe contare come parola?`;

describe("testoDelMagio — il contenitore in cui la deliberazione non entra", () => {
  test("IL CASO REALE: deliberazione prima, JSON dopo → sullo schermo va solo il JSON", () => {
    const grezzo = `${DELIBERAZIONE}\n\n{"testo": ${JSON.stringify(RISPOSTA_VERA)}}`;
    const letto = app.testoDelMagio(grezzo);
    assert.equal(letto.viaJson, true);
    assert.equal(letto.testo, RISPOSTA_VERA);
    assert.doesNotMatch(letto.testo, /Contiamo|Devo:|Perfetto/, "nessun pezzo di deliberazione passa");
  });

  test("LA MISURA CHE IL GHOST HA CHIESTO: caratteri generati contro caratteri usati", () => {
    // "quanti token sprechiamo così" non è una domanda retorica: da qui il numero si legge nel
    // registro invece di stimarlo. Su questo caso lo scarto è la maggior parte della chiamata.
    const grezzo = `${DELIBERAZIONE}\n\n{"testo": ${JSON.stringify(RISPOSTA_VERA)}}`;
    const letto = app.testoDelMagio(grezzo);
    assert.ok(letto.caratteriGrezzi > letto.caratteriUsati, "lo scarto esiste ed è misurato");
    assert.ok(letto.caratteriGrezzi - letto.caratteriUsati > 200, `scarto misurato ${letto.caratteriGrezzi - letto.caratteriUsati} caratteri`);
  });

  test("JSON pulito e basta: nessuna potatura, nessun danno", () => {
    const letto = app.testoDelMagio(`{"testo": "· una riga sola"}`);
    assert.equal(letto.testo, "· una riga sola");
    assert.equal(letto.viaJson, true);
  });

  test("blocco markdown attorno al JSON — la forma che Llama/Kimi producono da sempre", () => {
    const letto = app.testoDelMagio('```json\n{"testo": "· riga dentro un blocco markdown, abbastanza lunga"}\n```');
    assert.equal(letto.viaJson, true);
    assert.match(letto.testo, /riga dentro un blocco markdown/);
  });

  test("newline letterali dentro la stringa (il difetto noto dei modelli economici) non rompono niente", () => {
    // sanitizeJsonControlChars esiste per questo dal 15/07: qui si verifica che sia ancora in uso
    // sul percorso nuovo, che è esattamente il tipo di regressione che il file di progetto teme.
    const letto = app.testoDelMagio('{"testo": "· prima riga\n· seconda riga\n· terza riga"}');
    assert.equal(letto.viaJson, true);
    assert.match(letto.testo, /prima riga/);
    assert.match(letto.testo, /terza riga/);
  });

  test("virgola finale prima della graffa: tollerata", () => {
    assert.equal(app.testoDelMagio('{"testo": "· una riga abbastanza lunga da contare",}').viaJson, true);
  });

  test("nomi di campo alternativi (risposta, output) invece di testo", () => {
    assert.match(app.testoDelMagio('{"risposta": "· il modello ha scelto un altro nome di campo"}').testo, /altro nome di campo/);
    assert.match(app.testoDelMagio('{"output": "· e qui un terzo nome ancora, diverso"}').testo, /terzo nome/);
  });

  test("NIENTE JSON: si ripiega sulla potatura invece di consegnare una schermata vuota", () => {
    // È la scelta presa il 29/08 dentro askWithDegenerateGuard e ribadita qui: una chiamata
    // già pagata non si butta sulla parola di un'euristica.
    const letto = app.testoDelMagio(`${DELIBERAZIONE}\n\nVersione pulita:\n${RISPOSTA_VERA}`);
    assert.equal(letto.viaJson, false, "dichiara di essere passato dal ripiego, non lo nasconde");
    assert.equal(letto.testo, RISPOSTA_VERA);
  });

  test("un JSON senza campo utile non fa perdere il testo che c'è intorno", () => {
    const letto = app.testoDelMagio(`{"altro": 1}\n\n${RISPOSTA_VERA}`);
    assert.match(letto.testo, /Operazione eseguibile/);
  });

  test("risposta vuota: niente esplode, e non si inventa un testo", () => {
    for (const raw of [null, undefined, "", "   "]) assert.equal(app.testoDelMagio(raw).testo, "");
  });
});

describe("senzaDeliberazione — il ripiego, che deve potare senza mangiare la risposta", () => {
  test("il marcatore dichiarato dal modello vince: si tiene ciò che viene dopo l'ultimo", () => {
    const testo = app.senzaDeliberazione(`Devo contare le parole.\nVersione pulita:\n${RISPOSTA_VERA}`);
    assert.equal(testo, RISPOSTA_VERA);
  });

  test("più marcatori: conta l'ULTIMO, che è la versione che il modello ha licenziato", () => {
    const testo = app.senzaDeliberazione(`Versione pulita:\nprima stesura, poi ci ripensa e la rifa da capo qui sotto\nVersione finale:\n${RISPOSTA_VERA}`);
    assert.equal(testo, RISPOSTA_VERA);
  });

  test("senza marcatore si potano SOLO le righe di testa, e ci si ferma alla prima buona", () => {
    const testo = app.senzaDeliberazione(`Devo rispondere come MELCHIOR.\nContiamo: 56 parole. Perfetto.\n${RISPOSTA_VERA}`);
    assert.equal(testo, RISPOSTA_VERA);
  });

  test("UNA RIGA DI DELIBERAZIONE IN MEZZO AL TESTO NON SI TOCCA — tagliare lì sarebbe indovinare", () => {
    // È il confine deliberato del rimedio: in mezzo non si sa dove finirebbe il taglio, e un
    // ripiego che mangia il contenuto è peggio del difetto che cura.
    const conMezzo = `· prima riga della risposta vera, lunga a sufficienza\nContiamo: 12 parole.\n· terza riga della risposta vera`;
    const testo = app.senzaDeliberazione(conMezzo);
    assert.match(testo, /prima riga della risposta vera/);
    assert.match(testo, /terza riga della risposta vera/);
  });

  test("REGRESSIONE PRINCIPALE: una risposta senza nessuna deliberazione esce identica", () => {
    assert.equal(app.senzaDeliberazione(RISPOSTA_VERA), RISPOSTA_VERA);
    const prosa = "Il punto non è lo strumento. Sposta il baricentro verso la produzione, non la distribuzione.";
    assert.equal(app.senzaDeliberazione(prosa), prosa);
  });

  test("se potare lascerebbe meno di una risposta, si tiene quello che c'era", () => {
    // Una risposta CORTA che comincia per caso con una parola di deliberazione non va cancellata:
    // meglio consegnarla con una riga di troppo che consegnare il vuoto.
    const corta = "Devo dire di no.";
    assert.equal(app.senzaDeliberazione(corta), corta);
    assert.ok(corta.length < app.LUNGHEZZA_MINIMA_MAGI, "il caso è davvero sotto la soglia dichiarata");
  });

  test("il tetto di parole è dichiarato per ruolo, non uno solo per tutti", () => {
    // Era 70 per tutti, scritto nel contesto comune — quindi la Sintesi, che deve contenere gli
    // altri tre, aveva lo stesso spazio di uno solo di loro.
    for (const k of ["balthasar", "melchior", "caspar", "magi_synthesis"]) {
      assert.equal(typeof app.MAGI_TETTO_PAROLE[k], "number", `manca il tetto per ${k}`);
    }
    assert.ok(app.MAGI_TETTO_PAROLE.magi_synthesis >= app.MAGI_TETTO_PAROLE.caspar);
  });
});
