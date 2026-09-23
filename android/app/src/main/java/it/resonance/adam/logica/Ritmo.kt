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
}
