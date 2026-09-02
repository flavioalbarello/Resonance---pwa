// ══════════════════════════════════════════════════════════════════════════════
// LA GRIGLIA — 02/09/2026
// ══════════════════════════════════════════════════════════════════════════════
// Da dove viene, e perché esiste come modulo a sé.
//
// Il 28-29/08/2026 il piano alimentare collassava a metà: chiesto al modello come testo continuo,
// una griglia di 14 giorni per 5 pasti degenerava sempre, e comunque nessun prompt poteva garantire
// né la media calorica né l'assenza di ripetizioni. La soluzione — il modello inventa solo il
// repertorio, il PROGRAMMA monta la griglia — è costata tre notti e cinque diagnosi sbagliate.
// Poi è rimasta incastonata dentro un unico uso: i pasti.
//
// Ma il problema che risolve non è alimentare. È: riempire una griglia di righe e colonne, dove
// ogni colonna pesca dal suo repertorio, rispettando una rotazione che non ripete troppo presto, e
// dove una colonna fa da leva per avvicinare il totale di riga a un bersaglio numerico.
// Un piano di allenamento è la stessa griglia. Un calendario editoriale è la stessa griglia. Una
// rotazione di studio su VIDYA è la stessa griglia.
// Costo di non estrarla, scritto nel referto del 31/08: la prossima volta che serve una griglia si
// torna a chiederla al modello in un colpo solo, e degenera di nuovo alla stessa ora.
//
// COSA È STATO ESTRATTO E COSA NO. Qui sta la meccanica: la distanza minima fra ripetizioni, il
// registro condiviso degli ultimi usi, la scelta del meno recente, la colonna-leva sul bersaglio.
// NON sta qui niente che sappia di cibo: le calorie diventano "valore", i pasti "colonne", i giorni
// da asporto "liste alternative per posizione nel ciclo". lib/alimentare.js resta l'adattatore che
// traduce dal vocabolario dei pasti a questo, e le sue prove — scritte prima di questa estrazione —
// restano la dimostrazione che il comportamento non è cambiato.

// Quanti passi devono separare due comparse dello stesso elemento. Sei è il valore misurato sul
// caso reale (14 giorni, repertori da 7-10 piatti): abbastanza da non vedere lo stesso piatto due
// volte in una settimana, non tanto da svuotare la lista degli ammessi.
const DISTANZA_MINIMA_RIPETIZIONE = 6;

// Fra gli elementi ammessi (quelli non usati troppo di recente) prende il MENO RECENTE, così la
// rotazione copre tutto il repertorio invece di girare sui primi. Se nessuno rispetta la distanza —
// lista corta rispetto alle righe — si ripiega sull'intera lista prendendo comunque il meno recente:
// meglio una ripetizione distante che una cella vuota.
function scegliMenoRecente(lista, usati, d, preferenza = null, chiave = (el) => el.nome) {
  const distanza = Math.min(Math.max(0, lista.length - 1), DISTANZA_MINIMA_RIPETIZIONE);
  const ammessi = lista.filter((el) => {
    const ultimo = usati.get(chiave(el));
    return ultimo === undefined || d - ultimo > distanza;
  });
  const candidati = ammessi.length ? ammessi : lista;
  // Con una preferenza (la colonna-leva, che deve avvicinare il totale al bersaglio) si sceglie fra
  // i soli ammessi: la distanza resta un vincolo, il bersaglio è il criterio DENTRO quel vincolo.
  if (preferenza) return candidati.reduce((a, b) => (preferenza(b) < preferenza(a) ? b : a));
  return candidati.reduce((a, b) => ((usati.get(chiave(b)) ?? -1) < (usati.get(chiave(a)) ?? -1) ? b : a));
}

// Il montaggio. Ogni colonna dichiara da dove pesca e con che regola:
//
//   { id, lista }                        → rotazione semplice: lista[d % lista.length]
//   { id, lista, modo: "meno-recente" }  → distanza minima + il meno recente fra gli ammessi
//   { id, listaPerRiga: (d, posizione) => lista, modo: "meno-recente" }
//        → liste ALTERNATIVE scelte in base alla posizione nel ciclo (i giorni da asporto).
//          Il registro degli ultimi usi è UNO SOLO per colonna, condiviso fra tutte le liste che
//          quella colonna può usare: è il difetto del 29/08 — due liste con contatori indipendenti
//          facevano uscire lo stesso elemento da entrambe a un giorno di distanza — e il modo in cui
//          è stato chiuso. Chi userà questa primitiva per altro non deve ritrovarlo.
//   { id, lista, leva: true }            → scelta PER ULTIMA, minimizzando lo scarto fra il totale
//                                          della riga e il bersaglio. È il punto in cui il programma
//                                          fa quello che il modello non poteva garantire.
//
// Una sola colonna può essere la leva: con due, la seconda ottimizzerebbe contro una somma che la
// prima ha già fissato, e il risultato dipenderebbe dall'ordine invece che dal bersaglio.
function montaGriglia(spec = {}) {
  const righeChieste = Math.max(1, Math.min(365, Number(spec.righe) || 1));
  const ciclo = Math.max(1, Number(spec.ciclo) || 1);
  const colonne = (spec.colonne || []).filter((c) => c && c.id);
  if (!colonne.length) return null;
  const chiave = spec.chiave || ((el) => el?.nome);
  const valore = spec.valore || (() => 0);
  const bersaglioDiRiga = spec.bersaglioDiRiga || null; // (d) => number | null
  const leve = colonne.filter((c) => c.leva);
  if (leve.length > 1) return null; // vedi sopra: due leve non hanno un significato definito
  const normali = colonne.filter((c) => !c.leva);
  // Un registro per colonna, condiviso fra tutte le liste alternative di quella colonna.
  const registri = new Map(colonne.map((c) => [c.id, new Map()]));

  const listaDi = (col, d, posizione) => {
    const l = col.listaPerRiga ? col.listaPerRiga(d, posizione) : col.lista;
    return Array.isArray(l) && l.length ? l : null;
  };
  const righe = [];
  for (let d = 0; d < righeChieste; d++) {
    const posizione = d % ciclo;
    const celle = {};
    let parziale = 0;
    for (const col of normali) {
      const lista = listaDi(col, d, posizione);
      if (!lista) return null; // una colonna senza elementi non produce una griglia a metà: si dichiara
      const scelto = col.modo === "meno-recente"
        ? scegliMenoRecente(lista, registri.get(col.id), d, null, chiave)
        : lista[d % lista.length];
      if (col.modo === "meno-recente") registri.get(col.id).set(chiave(scelto), d);
      celle[col.id] = scelto;
      parziale += valore(scelto);
    }
    for (const col of leve) {
      const lista = listaDi(col, d, posizione);
      if (!lista) return null;
      const bersaglio = bersaglioDiRiga ? bersaglioDiRiga(d) : null;
      const scelto = scegliMenoRecente(lista, registri.get(col.id), d,
        bersaglio === null || bersaglio === undefined ? null : (el) => Math.abs(parziale + valore(el) - bersaglio), chiave);
      registri.get(col.id).set(chiave(scelto), d);
      celle[col.id] = scelto;
      parziale += valore(scelto);
    }
    righe.push({ indice: d, posizione, blocco: Math.floor(d / ciclo) + 1, celle, totale: parziale });
  }
  const totali = righe.map((r) => r.totale);
  return {
    righe,
    media: Math.round(totali.reduce((a, b) => a + b, 0) / totali.length),
    minimo: Math.min(...totali),
    massimo: Math.max(...totali),
  };
}

export { montaGriglia, scegliMenoRecente, DISTANZA_MINIMA_RIPETIZIONE };
