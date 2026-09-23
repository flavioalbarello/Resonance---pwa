package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import java.time.LocalDate

// La famiglia che mancava: una routine che regge conta quanto una cosa prodotta.
data class Criterio(val tipo: TipoMisura, val operatore: String, val soglia: Double) {
    fun soddisfatto(v: Double) = when (operatore) {
        ">=" -> v >= soglia
        "<=" -> v <= soglia
        ">" -> v > soglia
        "<" -> v < soglia
        else -> false
    }

    override fun toString() = "${tipo.name}$operatore${soglia.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }}"
}

data class Tenuta(val serie: Int, val tenutiSu14: Int, val oggi: Boolean)

object Stabilita {
    private val FORMA = Regex("""^\s*([A-Z_]+)\s*(>=|<=|>|<)\s*([0-9]+(?:[.,][0-9]+)?)\s*$""")

    fun leggiCriterio(testo: String?): Criterio? {
        val m = FORMA.find(testo ?: return null) ?: return null
        val tipo = runCatching { TipoMisura.valueOf(m.groupValues[1]) }.getOrNull() ?: return null
        return Criterio(tipo, m.groupValues[2], m.groupValues[3].replace(',', '.').toDouble())
    }

    fun giorniSoddisfatti(criterio: Criterio, misure: List<Misura>): Set<LocalDate> =
        Esiti.serieGiornaliera(misure, criterio.tipo)
            .filter { criterio.soddisfatto(it.valore) }
            .map { it.giorno }
            .toSet()

    // La serie in corso si conta da oggi, o da ieri se oggi non è ancora spuntato:
    // la giornata non è finita, non è ancora una rottura.
    fun tenuta(giorni: Set<LocalDate>, oggi: LocalDate): Tenuta {
        var g = if (oggi in giorni) oggi else oggi.minusDays(1)
        var serie = 0
        while (g in giorni) { serie++; g = g.minusDays(1) }
        val su14 = (0L..13L).count { oggi.minusDays(it) in giorni }
        return Tenuta(serie, su14, oggi in giorni)
    }
}
