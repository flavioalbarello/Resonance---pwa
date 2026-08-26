// Varianti comuni di una frase italiana, usate per stanare la classe di bug più ricorrente di
// stasera: un regex di trigger che riconosce UNA forma di una richiesta ma non le sue varianti
// più naturali. Non è generazione "automatica" nel senso di un modello che inventa parafrasi —
// è una lista curata di trasformazioni REALMENTE osservate rompere qualcosa oggi (l'elisione
// "quand'è" ha rotto la scorciatoia diretta del calendario; "vuoi che ne apra uno" invece di "un
// percorso" ha rotto il riconoscimento della proposta di percorso). Aggiungere qui una nuova
// trasformazione quando se ne osserva una nuova dal vivo è il punto: la lista cresce con
// l'esperienza reale, non con un tentativo di indovinare tutto in anticipo.
export function generaVarianti(frase) {
  const varianti = { originale: frase };
  varianti.minuscolo = frase.toLowerCase();
  varianti.maiuscolaIniziale = frase.charAt(0).toUpperCase() + frase.slice(1);
  varianti.conSpaziExtra = frase.replace(/ /g, "  ");
  varianti.senzaPuntoFinale = frase.replace(/[.?!]+$/, "");
  varianti.conPuntoInterrogativo = varianti.senzaPuntoFinale + "?";
  // L'elisione che ha rotto la scorciatoia diretta stanotte: "quando è"/"quando ho" → "quand'è"/"quand'ho".
  varianti.elisione = frase.replace(/\bquando\s+(e'|è|ho)\b/gi, (m, v) => `quand'${v}`);
  // La forma col pronome che ha rotto il riconoscimento della proposta di percorso: "un percorso" → "uno".
  varianti.conPronome = frase.replace(/\bun\s+percorso\b/gi, "uno");
  return varianti;
}

// Applica ogni variante e restituisce solo quelle DIVERSE dall'originale (una variante identica
// non prova niente). Usato dai test per non ripetere lo stesso controllo a vuoto.
export function variantiDiverse(frase) {
  const tutte = generaVarianti(frase);
  return Object.entries(tutte).filter(([nome, v]) => nome !== "originale" && v !== frase);
}
