package it.resonance.adam.logica

import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.Voce
import kotlin.random.Random

// Il dado della domenica: una finestra di imprevedibilità controllata (richiesta dello Shell, 25/09/2026). Il caso lo
// tira il PROGRAMMA, non il modello, e lascia il suo seme: imprevedibile ma ricostruibile. Il caso entra solo in ciò
// che lo Shell dice o propone, mai in ciò che l'app fa: da qui esce una domanda o una proposta, e il Ghost filtra.
object Dado {
    sealed class Scelta {
        data class Ricordo(val voce: Voce) : Scelta()
        data class Fermo(val nodo: Nodo, val percorso: String) : Scelta()
        data class Trascurato(val pilastro: Pilastro, val tracce: Int) : Scelta()
    }

    fun scegli(i: Istantanea, voci: List<Voce>, seme: Long): Scelta? {
        val r = Random(seme)
        val oggi = i.oggi
        val ricordi = voci.filter { v -> runCatching { java.time.LocalDate.parse(v.giorno).isBefore(oggi.minusDays(30)) }.getOrDefault(false) }
            .sortedBy { it.id }
        val attivi = i.percorsi.filter { !it.archiviato }
        val fermi = attivi.flatMap { p -> Nodi.foglie(i.nodi.filter { it.percorsoId == p.id }).filter { it.stato != StatoNodo.CONSOLIDATO }.map { it to p.titolo } }
            .sortedBy { it.first.id }
        // Il pilastro con meno tracce (voci e numeri) negli ultimi 14 giorni.
        val da = oggi.minusDays(13)
        fun recente(g: String) = runCatching { !java.time.LocalDate.parse(g).isBefore(da) }.getOrDefault(false)
        val tracce = listOf(Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA).associateWith { p ->
            voci.count { it.pilastro == p && recente(it.giorno) } + i.misure.count { it.tipo.pilastro == p && recente(it.giorno) }
        }
        val minimo = tracce.values.minOrNull()
        val trascurati = tracce.filter { it.value == minimo }.keys.sortedBy { it.ordinal }

        val facce = buildList {
            if (ricordi.isNotEmpty()) add(0)
            if (fermi.isNotEmpty()) add(1)
            if (trascurati.isNotEmpty()) add(2)
        }
        if (facce.isEmpty()) return null
        return when (facce[r.nextInt(facce.size)]) {
            0 -> Scelta.Ricordo(ricordi[r.nextInt(ricordi.size)])
            1 -> fermi[r.nextInt(fermi.size)].let { Scelta.Fermo(it.first, it.second) }
            else -> trascurati[r.nextInt(trascurati.size)].let { Scelta.Trascurato(it, tracce.getValue(it)) }
        }
    }

    fun descrizione(s: Scelta): String = when (s) {
        is Scelta.Ricordo -> "una voce del diario ${s.voce.pilastro.etichetta} del ${Giorni.leggibile(s.voce.giorno)}: «${Testi.corto(s.voce.testo, 300)}»"
        is Scelta.Fermo -> "il nodo «${s.nodo.etichetta}» del percorso «${s.percorso}», fermo a «${s.nodo.stato.etichetta}»"
        is Scelta.Trascurato -> "il pilastro ${s.pilastro.etichetta}, con ${s.tracce} tracce negli ultimi 14 giorni"
    }
}
