package it.resonance.adam.logica

import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.StatoNodo

// I nodi di un percorso su due livelli al massimo: un nodo può avere sotto-nodi (i brani sotto «Scaletta»), un
// sotto-nodo no. Lo stato di un nodo con sotto-nodi non si dichiara: lo calcola il programma dai figli. Uno stato
// scritto a mano sul padre sarebbe una seconda fonte, e divergerebbe dalla prima.
object Nodi {
    /** Primo livello; un nodo il cui padre non c'è più torna al primo livello. */
    fun radici(nodi: List<Nodo>): List<Nodo> =
        nodi.filter { n -> n.genitoreId == null || nodi.none { it.id == n.genitoreId } }.sortedBy { it.ordine }

    fun figli(nodi: List<Nodo>, id: Long): List<Nodo> = nodi.filter { it.genitoreId == id }.sortedBy { it.ordine }

    fun haFigli(nodi: List<Nodo>, id: Long) = nodi.any { it.genitoreId == id }

    /** I nodi che hanno uno stato loro: quelli senza sotto-nodi. Sono loro che contano nell'avanzamento. */
    fun foglie(nodi: List<Nodo>): List<Nodo> = nodi.filter { n -> nodi.none { it.genitoreId == n.id } }

    /** «21 sotto-nodi: 2 consolidati, 3 praticati, 16 non iniziati», dal più avanzato. */
    fun sintesi(figli: List<Nodo>): String {
        val conti = StatoNodo.entries.reversed().mapNotNull { s -> figli.count { it.stato == s }.takeIf { it > 0 }?.let { "$it ${plurale(s, it)}" } }
        return "${figli.size} " + (if (figli.size == 1) "sotto-nodo" else "sotto-nodi") + (if (conti.isEmpty()) "" else ": " + conti.joinToString(", "))
    }

    /** Da 0 (tutti non iniziati) a 1 (tutti consolidati). */
    fun avanzamento(figli: List<Nodo>): Float =
        if (figli.isEmpty()) 0f else figli.sumOf { it.stato.ordinal }.toFloat() / (figli.size * StatoNodo.CONSOLIDATO.ordinal)

    private fun plurale(s: StatoNodo, n: Int) = if (n == 1) s.etichetta else when (s) {
        StatoNodo.NON_INIZIATO -> "non iniziati"
        StatoNodo.INTRODOTTO -> "introdotti"
        StatoNodo.PRATICATO -> "praticati"
        StatoNodo.CONSOLIDATO -> "consolidati"
    }

    fun dove(sotto: String?, nuovo: Boolean, prep: String) =
        if (sotto == null) "" else " $prep «$sotto»" + (if (nuovo) " (nodo nuovo)" else "")

    /** Come lo Shell vede i nodi di un percorso: il padre con la sintesi, i figli dopo la freccia. */
    fun testo(nodi: List<Nodo>): String = radici(nodi).joinToString("; ") { r ->
        val f = figli(nodi, r.id)
        if (f.isEmpty()) "${r.etichetta} [${r.stato.etichetta}]"
        else "${r.etichetta} (${sintesi(f)}) → " + f.joinToString(", ") { "${it.etichetta} [${it.stato.etichetta}]" }
    }
}
