// ══════════════════════════════════════════════════════════════════════════════
// IL GIOCO — 16/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Da dove viene. Il Ghost, in direzione Adam: «l'app dovrebbe, su richiesta, poter creare dei
// "giochi" da sottoporre all'utente col fine di progredire in un determinato percorso». Sia
// testuali, sia audio, sia visivi — "un platform per il ritmo o un quiz sonoro dove riconoscere un
// intervallo o il modo di una scala".
//
// LA SCELTA DI PROGETTO CHE CHIUDE TUTTO IL RESTO: un gioco non può essere il modello che narra
// "hai vinto". Due famiglie, mai una terza che le confonda:
//   - TESTUALE: il modello propone il mazzo (domanda/opzioni/risposta) TUTTO PRIMA di giocare —
//     accettore e effettore nella stessa generazione, mai un giudizio a posteriori sulla propria
//     domanda. Il programma verifica la risposta del Ghost confrontandola con quella dichiarata.
//   - AUDIO: ancora più vicino alla disciplina del progetto, perché qui il contenuto è aritmetica,
//     non prosa. Un intervallo o il modo di una scala si calcolano col temperamento equabile
//     (f = 440 * 2^((n-49)/12)): il programma li genera E li verifica, senza bisogno del modello.
//     Zero chiamate pagate per un gioco audio.
// Il ritmo/platform visivo (livello 2, motore di gioco vero) resta un giro successivo — non c'è
// niente qui che lo escluda, ma il rischio (sincronia fra l'orologio audio e i frame) è un ordine
// di grandezza sopra le prime due famiglie.
//
// Questo file è la parte PURA: generazione dei round audio (deterministica data una funzione
// rng iniettabile, per le prove), validazione del mazzo testuale generato dal modello, calcolo
// dell'esito. Non tocca AudioContext né il browser — quello vive in app.js, come il microfono.

export const TIPO_GIOCO = "gioco";
export const eGioco = (doc) => !!doc && doc.tipo === TIPO_GIOCO;

// ── L'ESITO — aritmetica, non un giudizio del modello ───────────────────────────────────────────
// Stessa terna di stati già in uso per i nodi dei percorsi (introdotto/praticato/consolidato),
// cosí un gioco concluso aggiorna il nodo con lo stesso vocabolario del quiz — non un terzo sistema
// di stati che il Ghost deve imparare a leggere.
export const SOGLIA_CONSOLIDATO = 0.8;
export const SOGLIA_PRATICATO = 0.5;
export function calcolaEsitoGioco(risposte) {
  const totali = Array.isArray(risposte) ? risposte.length : 0;
  if (!totali) return { livello: null, corrette: 0, totali: 0, frazione: 0 };
  const corrette = risposte.filter(Boolean).length;
  const frazione = corrette / totali;
  const livello = frazione >= SOGLIA_CONSOLIDATO ? "consolidato" : frazione >= SOGLIA_PRATICATO ? "praticato" : "introdotto";
  return { livello, corrette, totali, frazione };
}

// Un solo confronto, per le due famiglie: ogni round — testuale o audio — dichiara `atteso`, e la
// risposta del Ghost (il testo dell'opzione toccata) ci si confronta lettera per lettera. Nessuna
// interpretazione: le opzioni sono scelte da un elenco chiuso, mai testo libero da capire.
export function valutaRispostaGioco(round, risposta) {
  return String(risposta ?? "").trim() === String(round?.atteso ?? "").trim();
}

// ── FAMILY TESTUALE — il modello propone, il programma verifica la FORMA prima di mostrare ──────
// Un round che non ha tutti i pezzi (domanda, almeno due opzioni, una risposta che è DAVVERO fra
// le opzioni) si scarta e si conta: mai mostrato rotto, mai riempito indovinando cosa intendesse il
// modello. Stessa regola di extractJsonBlock/sanitizeJsonControlChars altrove nel progetto — un
// modello economico può consegnare qualcosa di storto, e il programma non gli crede sulla parola.
export function validaMazzoTestuale(mazzoGrezzo) {
  if (!Array.isArray(mazzoGrezzo) || !mazzoGrezzo.length) {
    return { ok: false, motivo: "il mazzo generato è vuoto o non è un elenco", round: [], scartati: 0 };
  }
  const round = [];
  let scartati = 0;
  for (const r of mazzoGrezzo) {
    const domanda = String(r?.domanda ?? "").trim();
    const opzioni = Array.isArray(r?.opzioni) ? r.opzioni.map((o) => String(o ?? "").trim()).filter(Boolean) : [];
    const atteso = String(r?.corretta ?? "").trim();
    if (!domanda || opzioni.length < 2 || !atteso || !opzioni.includes(atteso)) { scartati++; continue; }
    round.push({ meccanica: "testuale", domanda, opzioni, atteso, spiegazione: String(r?.spiegazione ?? "").trim() });
  }
  if (!round.length) return { ok: false, motivo: "nessun round valido nel mazzo generato dal modello", round: [], scartati };
  return { ok: true, motivo: "", round, scartati };
}

// ── FAMILY AUDIO — pura matematica, nessuna chiamata al modello ─────────────────────────────────
// Notazione scientifica (C4 = do centrale). Indice = semitoni da C0, per il temperamento equabile.
const NOTE_INDICE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
// A4 = 440 Hz è 57 semitoni sopra C0 in questa numerazione (4*12 + 9).
const SEMITONI_A4 = 57;
export function frequenzaDiNota(nomeNota) {
  const m = /^([A-G]#?)(-?\d+)$/.exec(String(nomeNota || "").trim());
  if (!m || !(m[1] in NOTE_INDICE)) return null;
  const semitoniDaC0 = NOTE_INDICE[m[1]] + Number(m[2]) * 12;
  return 440 * Math.pow(2, (semitoniDaC0 - SEMITONI_A4) / 12);
}
// Semitoni dalla tonica. I nomi sono quelli che un Ghost che studia armonia usa davvero.
export const INTERVALLI = {
  "seconda minore": 1, "seconda maggiore": 2, "terza minore": 3, "terza maggiore": 4,
  "quarta giusta": 5, "quinta diminuita": 6, "quinta giusta": 7, "sesta minore": 8,
  "sesta maggiore": 9, "settima minore": 10, "settima maggiore": 11, "ottava": 12,
};
// Gradi della scala (in semitoni dalla tonica, ottava inclusa) per i sette modi diatonici.
export const MODI = {
  ionico: [0, 2, 4, 5, 7, 9, 11, 12],
  dorico: [0, 2, 3, 5, 7, 9, 10, 12],
  frigio: [0, 1, 3, 5, 7, 8, 10, 12],
  lidio: [0, 2, 4, 6, 7, 9, 11, 12],
  misolidio: [0, 2, 4, 5, 7, 9, 10, 12],
  eolio: [0, 2, 3, 5, 7, 8, 10, 12],
  locrio: [0, 1, 3, 5, 6, 8, 10, 12],
};
// Ambito comodo da ascoltare su un altoparlante di telefono: né troppo grave né troppo acuto.
const TONICHE_POSSIBILI = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"];

function scegli(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
// Fisher-Yates con rng iniettabile: le prove passano una funzione che non è Math.random, così il
// risultato è riproducibile invece che "probabilmente giusto".
function mescola(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const N_OPZIONI_AUDIO = 4;

export function generaRoundIntervallo(rng = Math.random) {
  const nomi = Object.keys(INTERVALLI);
  const atteso = scegli(rng, nomi);
  const tonica = scegli(rng, TONICHE_POSSIBILI);
  const distrattori = mescola(rng, nomi.filter((n) => n !== atteso)).slice(0, N_OPZIONI_AUDIO - 1);
  const opzioni = mescola(rng, [atteso, ...distrattori]);
  const freqTonica = frequenzaDiNota(tonica);
  return {
    meccanica: "audio", sottotipo: "intervallo", tonica, atteso, opzioni,
    frequenze: [freqTonica, freqTonica * Math.pow(2, INTERVALLI[atteso] / 12)],
  };
}
export function generaRoundModo(rng = Math.random) {
  const nomi = Object.keys(MODI);
  const atteso = scegli(rng, nomi);
  const tonica = scegli(rng, TONICHE_POSSIBILI);
  const distrattori = mescola(rng, nomi.filter((n) => n !== atteso)).slice(0, N_OPZIONI_AUDIO - 1);
  const opzioni = mescola(rng, [atteso, ...distrattori]);
  const freqTonica = frequenzaDiNota(tonica);
  return {
    meccanica: "audio", sottotipo: "modo", tonica, atteso, opzioni,
    frequenze: MODI[atteso].map((semitoni) => freqTonica * Math.pow(2, semitoni / 12)),
  };
}
// Il mazzo audio nasce SENZA chiamare il modello: è la differenza pratica di costo rispetto alla
// famiglia testuale, e vale la pena che si veda anche nel nome della funzione, non solo nel commento.
export function generaMazzoAudioSenzaModello(sottotipo = "intervallo", quante = 6, rng = Math.random) {
  const genera = sottotipo === "modo" ? generaRoundModo : generaRoundIntervallo;
  return Array.from({ length: Math.max(1, quante) }, () => genera(rng));
}

export { NOTE_INDICE };
