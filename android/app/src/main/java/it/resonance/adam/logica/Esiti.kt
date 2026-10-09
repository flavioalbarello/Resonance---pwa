package it.resonance.adam.logica

import it.resonance.adam.dati.Aggregazione
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

data class Punto(val giorno: LocalDate, val valore: Double)

data class Sintesi(
    val tipo: TipoMisura,
    val valore: Double?,
    val confronto: Double?,
    val periodo: String,
    val ultimoGiorno: LocalDate?,
    val punti: List<Punto>,
) {
    val vuota get() = valore == null
    val delta get() = if (valore != null && confronto != null) valore - confronto else null
}

object Esiti {
    const val GIORNI_STANTIO = 7

    fun serieGiornaliera(misure: List<Misura>, tipo: TipoMisura): List<Punto> =
        misure.asSequence()
            .filter { it.tipo == tipo }
            .groupBy { LocalDate.parse(it.giorno) }
            .map { (g, m) ->
                val v = when (tipo.aggregazione) {
                    Aggregazione.ULTIMO -> m.maxBy { it.istante }.valore
                    Aggregazione.MEDIA -> m.map { it.valore }.average()
                    Aggregazione.SOMMA -> m.sumOf { it.valore }
                }
                Punto(g, v)
            }
            .sortedBy { it.giorno }

    private fun tra(punti: List<Punto>, da: LocalDate, a: LocalDate) =
        punti.filter { !it.giorno.isBefore(da) && !it.giorno.isAfter(a) }

    fun sintesi(misure: List<Misura>, tipo: TipoMisura, oggi: LocalDate): Sintesi {
        val serie = serieGiornaliera(misure, tipo)
        val ultimo = serie.lastOrNull()?.giorno
        val trenta = tra(serie, oggi.minusDays(29), oggi)
        return when (tipo.aggregazione) {
            Aggregazione.ULTIMO -> {
                val valore = serie.lastOrNull()?.valore
                val primo = trenta.firstOrNull()?.takeIf { trenta.size > 1 }?.valore
                Sintesi(tipo, valore, primo, "30 giorni", ultimo, trenta)
            }
            Aggregazione.MEDIA -> {
                val ora = tra(serie, oggi.minusDays(6), oggi)
                val prima = tra(serie, oggi.minusDays(13), oggi.minusDays(7))
                Sintesi(
                    tipo,
                    ora.takeIf { it.isNotEmpty() }?.map { it.valore }?.average(),
                    prima.takeIf { it.isNotEmpty() }?.map { it.valore }?.average(),
                    "media 7 giorni", ultimo, trenta,
                )
            }
            Aggregazione.SOMMA -> {
                val ora = tra(serie, oggi.minusDays(6), oggi)
                val prima = tra(serie, oggi.minusDays(13), oggi.minusDays(7))
                Sintesi(
                    tipo,
                    ora.sumOf { it.valore }.takeIf { serie.isNotEmpty() },
                    prima.sumOf { it.valore }.takeIf { serie.any { it.giorno.isBefore(oggi.minusDays(6)) } },
                    "ultimi 7 giorni", ultimo, trenta,
                )
            }
        }
    }

    fun entrateMese(misure: List<Misura>, mese: YearMonth, soloNonLegateAlTempo: Boolean): Double =
        misure.filter {
            it.tipo == TipoMisura.ENTRATA &&
                YearMonth.from(LocalDate.parse(it.giorno)) == mese &&
                (!soloNonLegateAlTempo || it.legataAlTempo == false)
        }.sumOf { it.valore }

    fun formatta(tipo: TipoMisura, v: Double): String = when (tipo) {
        TipoMisura.PESO -> String.format(Locale.ITALY, "%.1f kg", v)
        TipoMisura.SONNO -> ore(v)
        TipoMisura.PASSI -> String.format(Locale.ITALY, "%,d", v.roundToInt())
        TipoMisura.FC_RIPOSO -> "${v.roundToInt()} bpm"
        TipoMisura.ALLENAMENTO, TipoMisura.PRATICA -> ore(v)
        TipoMisura.ENTRATA -> String.format(Locale.ITALY, "%,.2f €", v)
        TipoMisura.OPERA -> v.roundToInt().toString()
    }

    fun ore(minuti: Double): String {
        val m = minuti.roundToInt()
        return if (m < 60) "${m} min" else "${m / 60}h${if (m % 60 == 0) "" else String.format("%02d", m % 60)}"
    }

    // La stessa riga va sullo schermo e nel prompt: se il Ghost non la vede, il modello non l'ha ricevuta.
    fun riga(s: Sintesi, oggi: LocalDate): String {
        if (s.valore == null) return "${s.tipo.etichetta}: nessun dato"
        val base = "${s.tipo.etichetta}: ${formatta(s.tipo, s.valore)} (${s.periodo})"
        val d = s.delta
        val confronto = when {
            d == null -> ""
            s.tipo.aggregazione == Aggregazione.ULTIMO ->
                ", ${segno(d)}${formatta(s.tipo, abs(d))} in 30 giorni"
            else -> ", settimana prima ${formatta(s.tipo, s.confronto!!)}"
        }
        val eta = s.ultimoGiorno?.let { java.time.temporal.ChronoUnit.DAYS.between(it, oggi) } ?: 0
        val stantio = if (eta > GIORNI_STANTIO) " — ultimo dato ${eta} giorni fa" else ""
        return base + confronto + stantio
    }

    private fun segno(d: Double) = if (d >= 0) "+" else "−"
}
