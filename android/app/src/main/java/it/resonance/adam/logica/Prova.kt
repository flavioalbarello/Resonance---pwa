package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoBlocco
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Nodo

// La prova generale (19/10/2026): la scaletta intera, nell'ordine, come sul palco. Un tocco porta al brano dopo, una
// pressione lunga segna «perso il filo», Salta lo salta. Si tiene come una sessione (nota PROVA) coi suoi esiti: il
// programma misura la durata vera di ogni brano e del set, e dove il filo si è perso. I pezzi NON cambiano stato:
// una prova generale dice com'è il set, non insegna un passaggio.
object Prova {
    const val NOTA = "prova generale"

    /** La scaletta: i nodi di primo livello nell'ordine, e dentro un nodo che raccoglie (Scaletta, Set 1) i suoi brani. */
    fun scaletta(nodi: List<Nodo>): List<Nodo> = Nodi.radici(nodi).flatMap { r -> Nodi.figli(nodi, r.id).ifEmpty { listOf(r) } }

    fun piano(nodi: List<Nodo>): List<Pratica.Blocco> = scaletta(nodi).map { Pratica.Blocco(it.id, it.etichetta, 0, 100, false, it.fonte) }

    fun mmss(ms: Long): String { val s = (ms / 1000).coerceAtLeast(0); return "%d:%02d".format(s / 60, s % 60) }

    /** Il resoconto: la durata di ogni brano (dall'esito prima al suo), il set intero, i fili persi, i salti. */
    fun resoconto(piano: List<Pratica.Blocco>, esiti: List<EsitoBlocco>, inizio: Long, fine: Long): List<String> {
        var prima = inizio
        val righe = esiti.mapIndexed { i, e ->
            val nome = piano.getOrNull(i)?.etichetta ?: "?"
            val durata = e.istante - prima
            prima = e.istante
            when (e.esito) {
                EsitoPratica.SALTATO -> "$nome: saltato"
                EsitoPratica.ERRORI -> "$nome: ${mmss(durata)}, perso il filo"
                EsitoPratica.PULITO -> "$nome: ${mmss(durata)}"
            }
        }
        val persi = esiti.count { it.esito == EsitoPratica.ERRORI }
        val saltati = esiti.count { it.esito == EsitoPratica.SALTATO }
        val mancano = (piano.size - esiti.size).coerceAtLeast(0)
        val suonati = esiti.size - saltati
        val testa = "Set: ${mmss(fine - inizio)}, $suonati " + (if (suonati == 1) "brano suonato" else "brani suonati") +
            (if (persi > 0) ", filo perso $persi " + (if (persi == 1) "volta" else "volte") else ", mai perso il filo") +
            (if (saltati > 0) ", $saltati saltati" else "") + (if (mancano > 0) ", fermata a $mancano dalla fine" else "")
        return listOf(testa) + righe
    }
}
