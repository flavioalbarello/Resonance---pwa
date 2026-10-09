package it.resonance.adam.cervello

import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.dati.Turno
import java.util.Locale

// Come si regola lo Shell, contato dal programma turno per turno: per ogni coppia modello × compito, quante proposte,
// quante fermate dal programma, quante annullate dal Ghost, quante risposte tagliate, quante forzature. È il materiale
// con cui la temperatura potrà spostarsi da sola; finché i turni sono pochi, lo si guarda e basta.
object Regolazione {
    data class Sintesi(
        val modello: String, val compito: Compito?, val turni: Int, val temperatura: Double?,
        val proposte: Int, val annullate: Int, val fermate: Int, val tagliate: Int, val esauriti: Int,
        val errori: Int, val forzate: Int, val costo: Double,
    )

    fun sintesi(turni: List<Turno>, stato: (Long) -> StatoProposta?): List<Sintesi> =
        turni.groupBy { it.modello to it.compito }.map { (chiave, t) ->
            val ids = t.flatMap { it.proposte.split(",").mapNotNull(String::toLongOrNull) }
            val usate = t.filter { !it.forzata }.mapNotNull { it.temperatura }
            Sintesi(
                modello = chiave.first,
                compito = Compito.entries.find { it.name == chiave.second },
                turni = t.size,
                temperatura = usate.takeIf { it.isNotEmpty() }?.average(),
                proposte = ids.size,
                annullate = ids.count { stato(it) == StatoProposta.RIFIUTATA },
                fermate = t.sumOf { it.rifiutate },
                tagliate = t.count { it.troncata },
                esauriti = t.count { it.esauriti },
                errori = t.count { it.errore },
                forzate = t.count { it.forzata },
                costo = t.sumOf { it.costo ?: 0.0 },
            )
        }.sortedWith(compareByDescending<Sintesi> { it.turni }.thenBy { it.modello })

    fun riga(s: Sintesi): String = buildList {
        add("${s.turni} " + if (s.turni == 1) "turno" else "turni")
        add(Temperatura.etichetta(s.temperatura, false) ?: "t del modello")
        if (s.proposte > 0) add("${s.proposte} proposte" + if (s.annullate > 0) " (${s.annullate} annullate da te)" else "")
        if (s.fermate > 0) add("${s.fermate} fermate dal programma")
        if (s.tagliate > 0) add("${s.tagliate} tagliate")
        if (s.esauriti > 0) add("${s.esauriti} a giri finiti")
        if (s.errori > 0) add("${s.errori} senza risposta")
        if (s.forzate > 0) add("${s.forzate} forzate da te")
        if (s.costo > 0) add(String.format(Locale.ITALIAN, "%.2f ¢", s.costo * 100))
    }.joinToString(" · ")
}
