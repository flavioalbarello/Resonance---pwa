package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni

// Un modello per compito (02/10/2026), come c'è la temperatura per compito. Lo sceglie il programma in base al compito,
// non il modello; si giudica coi numeri della Regolazione (costo, errori, proposte fermate per compito e modello); il
// Ghost può cambiarlo compito per compito. Le decisioni quotidiane non chiedono approvazione: lo scarto di costo è di
// frazioni di centesimo. Quelle costose (la ricerca a fondo) sì, con la stima davanti.
enum class Fascia(val etichetta: String) { PRINCIPALE("il principale"), LEGGERO("il leggero"), VISTA("quello per immagini") }

object ModelloPerCompito {
    // Il predefinito: due righe di notifica non chiedono il modello migliore; un'immagine vuole uno che veda.
    fun fascia(c: Compito): Fascia = when (c) {
        Compito.BATTITO -> Fascia.LEGGERO
        Compito.ALLEGATI -> Fascia.VISTA
        else -> Fascia.PRINCIPALE
    }

    // La scelta del motore (Instradatore) ha il suo modello fisso: non si regola qui.
    val REGOLABILI = Compito.entries.filter { it != Compito.MOTORE }

    /** Il modello per un compito: quello scelto dal Ghost, altrimenti quello della sua fascia. Mai un modello ritirato. */
    fun scegli(c: Compito, scelti: Map<String, String>, principale: String, leggero: String, vista: String): String =
        Impostazioni.vivo(scelti[c.name]?.takeIf { it.isNotBlank() } ?: when (fascia(c)) {
            Fascia.PRINCIPALE -> principale
            Fascia.LEGGERO -> leggero
            Fascia.VISTA -> vista
        })

    fun codifica(m: Map<String, String>) = m.filterValues { it.isNotBlank() }.entries.joinToString("\n") { "${it.key}=${it.value}" }
    fun decodifica(s: String): Map<String, String> = s.lines().mapNotNull { r -> r.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }.toMap()
}
