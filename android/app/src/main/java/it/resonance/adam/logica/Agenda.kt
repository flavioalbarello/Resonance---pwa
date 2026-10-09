package it.resonance.adam.logica

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Un impegno esiste solo se è nel calendario. Nella PWA il modello ha spacciato per impegno reale
// una proposta abbandonata trenta messaggi prima: qui l'agenda la legge il programma, non la memoria.
data class Evento(
    val titolo: String,
    val inizio: LocalDateTime,
    val fine: LocalDateTime,
    val tuttoIlGiorno: Boolean,
    val luogo: String = "",
    val calendario: String = "",
    // Ciò che serve per cambiarlo: lo riempie chi legge il calendario, il resto del programma lo usa e basta.
    val id: Long = 0,
    val idSerie: Long? = null,        // l'evento madre, se questo è un'occorrenza di una serie
    val eccezione: Boolean = false,   // un'occorrenza già spostata o modificata: è un evento a sé, figlio della serie
    val regola: String = "",          // RRULE della serie
    val inizioMs: Long = 0,
    val fineMs: Long = 0,
    val origineMs: Long = 0,          // dove cadeva l'occorrenza nella serie (per un'eccezione, prima di essere spostata)
    val primaDellaSerie: Boolean = false,
    val scrivibile: Boolean = true,
    val organizzatoDaAltri: Boolean = false,
    val invitati: Int = 0,
)

sealed class AgendaLetta {
    data object NonLetta : AgendaLetta()
    data class Negata(val motivo: String) : AgendaLetta()
    data class Letta(val da: LocalDate, val giorni: Int, val eventi: List<Evento>) : AgendaLetta()
}

object Agenda {
    private val GIORNO = DateTimeFormatter.ofPattern("EEE d/M", Locale.ITALIAN)
    private val GIORNO_LUNGO = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)
    private val ORA = DateTimeFormatter.ofPattern("HH:mm")

    // "2026-09-25T10:00", "2026-09-25 10:00" → con orario; "2026-09-25" → tutto il giorno.
    fun interpretaInizio(t: String?): Pair<LocalDateTime, Boolean>? {
        val s = t?.trim()?.replace(' ', 'T') ?: return null
        if (s.length == 10) return runCatching { LocalDate.parse(s).atStartOfDay() to true }.getOrNull()
        return runCatching { LocalDateTime.parse(s.take(16)) to false }.getOrNull()
    }

    fun quando(inizio: LocalDateTime, fine: LocalDateTime, tuttoIlGiorno: Boolean, oggi: LocalDate): String {
        val g = when (inizio.toLocalDate()) {
            oggi -> "oggi"
            oggi.plusDays(1) -> "domani"
            else -> inizio.format(GIORNO_LUNGO)
        }
        return if (tuttoIlGiorno) "$g, tutto il giorno" else "$g ${inizio.format(ORA)}–${fine.format(ORA)}"
    }

    fun riga(e: Evento, oggi: LocalDate, conGiorno: Boolean = true): String {
        val g = if (!conGiorno) "" else when (e.inizio.toLocalDate()) {
            oggi -> "oggi "
            oggi.plusDays(1) -> "domani "
            else -> e.inizio.format(GIORNO) + " "
        }
        val ore = if (e.tuttoIlGiorno) "tutto il giorno" else "${e.inizio.format(ORA)}–${e.fine.format(ORA)}"
        val dove = if (e.luogo.isNotBlank()) " (${Testi.corto(e.luogo, 60)})" else ""
        val ripete = if (e.regola.isNotBlank()) " [${Ripetizione.leggibile(e.regola)}]" else ""
        return "$g$ore ${Testi.corto(e.titolo, 80)}$dove$ripete"
    }

    fun delGiorno(eventi: List<Evento>, giorno: LocalDate) = eventi.filter {
        val da = it.inizio.toLocalDate()
        val a = if (it.tuttoIlGiorno) it.fine.toLocalDate().minusDays(1) else it.fine.toLocalDate()
        !giorno.isBefore(da) && !giorno.isAfter(maxOf(da, a))
    }.sortedWith(compareBy({ !it.tuttoIlGiorno }, { it.inizio }))

    // Il testo che vede il modello: stesso formato per il contesto e per lo strumento di lettura.
    fun testo(a: AgendaLetta, oggi: LocalDate): String = when (a) {
        AgendaLetta.NonLetta -> "Calendario non letto."
        is AgendaLetta.Negata -> "Calendario non leggibile: ${a.motivo}."
        is AgendaLetta.Letta -> {
            val fino = a.da.plusDays(a.giorni.toLong() - 1)
            val intervallo = if (a.giorni == 1) Giorni.leggibile(a.da.toString(), oggi) else "dal ${a.da} al $fino"
            if (a.eventi.isEmpty()) "Nessun impegno in calendario $intervallo."
            else "Impegni in calendario $intervallo:\n" + a.eventi.sortedBy { it.inizio }.joinToString("\n") { "- ${riga(it, oggi)}" }
        }
    }

    fun inizioFine(p: Proposta.CreaEvento): Pair<LocalDateTime, LocalDateTime> {
        val (inizio, tutto) = requireNotNull(interpretaInizio(p.inizio)) { "inizio illeggibile: ${p.inizio}" }
        val fine = if (tutto) inizio.plusDays(1) else inizio.plusMinutes(p.durataMinuti.toLong())
        return inizio to fine
    }
}
