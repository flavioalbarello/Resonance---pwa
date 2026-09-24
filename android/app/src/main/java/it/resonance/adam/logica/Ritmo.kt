package it.resonance.adam.logica

import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime

enum class Battito(val etichetta: String) { MATTINO("Mattino"), SERA("Sera"), SETTIMANA("Settimana") }

object Ritmo {
    fun leggiOrario(t: String?, predefinito: LocalTime): LocalTime =
        runCatching { LocalTime.parse(t!!.trim().padStart(5, '0')) }.getOrDefault(predefinito)

    fun prossimo(ora: LocalDateTime, orario: LocalTime, giorno: DayOfWeek? = null): LocalDateTime {
        var c = ora.toLocalDate().atTime(orario)
        if (!c.isAfter(ora)) c = c.plusDays(1)
        if (giorno != null) while (c.dayOfWeek != giorno) c = c.plusDays(1)
        return c
    }

    fun attesa(ora: LocalDateTime, orario: LocalTime, giorno: DayOfWeek? = null): Duration =
        Duration.between(ora, prossimo(ora, orario, giorno))

    // Il registro del battito: le ultime righe, la più recente in cima. Un battito che non arriva deve lasciare una
    // traccia del perché (visto il 25/09: «il battito non batte», e nessun modo di sapere se era partito).
    const val RIGHE_REGISTRO = 8
    private val QUANDO = java.time.format.DateTimeFormatter.ofPattern("EEE d/M HH:mm", java.util.Locale.ITALIAN)

    fun riga(b: Battito, ora: LocalDateTime, esito: String, prova: Boolean = false) =
        "${ora.format(QUANDO)} · ${b.etichetta}${if (prova) " (prova)" else ""}: $esito"

    fun annota(registro: String, riga: String): String =
        (listOf(riga) + registro.lines().filter { it.isNotBlank() }).take(RIGHE_REGISTRO).joinToString("\n")

    fun quando(t: LocalDateTime): String = t.format(QUANDO)
}
