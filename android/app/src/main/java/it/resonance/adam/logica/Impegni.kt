package it.resonance.adam.logica

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

// Spostare e togliere impegni. Il modello nomina l'impegno a parole (titolo e giorno); il programma lo
// cerca nel calendario, e se non è UNO solo, o se si ripete e non si sa quanto toglierne, CHIEDE.

@Serializable
enum class Portata(val chiave: String, val etichetta: String) {
    @SerialName("solo_questo") UNO("solo_questo", "solo questo"),
    @SerialName("da_questo_in_poi") DA_QUI("da_questo_in_poi", "da questo in poi"),
    @SerialName("tutta_la_serie") SERIE("tutta_la_serie", "tutta la serie");

    companion object { fun da(t: String?) = entries.find { it.chiave == t?.trim()?.lowercase() } }
}

// L'impegno trovato al momento della proposta: la conferma agisce su QUESTO, non rifà la ricerca.
@Serializable
data class Bersaglio(
    val idEvento: Long,
    val idSerie: Long? = null,
    val eccezione: Boolean = false,
    val titolo: String,
    val calendario: String,
    val inizio: String,
    val fine: String,
    val inizioMs: Long,
    val fineMs: Long,
    val origineMs: Long,
    val tuttoIlGiorno: Boolean,
    val regola: String = "",
    val primaDellaSerie: Boolean = false,
    val futuri: Int? = null,
) {
    val daIni get() = LocalDateTime.parse(inizio)
    val daFin get() = LocalDateTime.parse(fine)
    val ricorrente get() = idSerie != null
}

sealed class Risoluzione {
    data class Pronta(val proposta: Proposta) : Risoluzione()
    data class Domanda(val motivo: String) : Risoluzione()
}

object Ripetizione {
    private val GIORNI = mapOf("MO" to "lunedì", "TU" to "martedì", "WE" to "mercoledì", "TH" to "giovedì",
        "FR" to "venerdì", "SA" to "sabato", "SU" to "domenica")
    private val UNTIL_UTC = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")

    fun parti(r: String): Map<String, String> = r.removePrefix("RRULE:").split(';')
        .mapNotNull { v -> v.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0].trim().uppercase() to it[1].trim() } }.toMap()

    fun leggibile(r: String): String {
        if (r.isBlank()) return ""
        val p = parti(r)
        val n = p["INTERVAL"]?.toIntOrNull() ?: 1
        val giorni = p["BYDAY"]?.split(',')?.mapNotNull { GIORNI[it.trim().takeLast(2).uppercase()] }.orEmpty()
        fun elenco(g: List<String>) = if (g.size <= 1) g.joinToString() else g.dropLast(1).joinToString(", ") + " e " + g.last()
        val base = when (p["FREQ"]?.uppercase()) {
            "DAILY" -> if (n == 1) "ogni giorno" else "ogni $n giorni"
            "WEEKLY" -> when {
                giorni.isEmpty() -> if (n == 1) "ogni settimana" else "ogni $n settimane"
                n == 1 -> "ogni ${elenco(giorni)}"
                else -> "ogni $n settimane, ${elenco(giorni)}"
            }
            "MONTHLY" -> if (n == 1) "ogni mese" else "ogni $n mesi"
            "YEARLY" -> "ogni anno"
            else -> "si ripete"
        }
        return base + if (p.containsKey("UNTIL") || p.containsKey("COUNT")) "" else ", senza data di fine"
    }

    // «Da questo in poi»: la serie finisce subito prima dell'occorrenza scelta. UNTIL è in UTC (RFC 5545).
    fun finoA(r: String, occorrenza: LocalDateTime, tuttoIlGiorno: Boolean, zona: ZoneId): String {
        val resto = r.removePrefix("RRULE:").split(';')
            .filter { it.isNotBlank() && it.substringBefore('=').trim().uppercase() !in setOf("UNTIL", "COUNT") }
        val until = if (tuttoIlGiorno) occorrenza.toLocalDate().minusDays(1).format(DateTimeFormatter.BASIC_ISO_DATE)
        else occorrenza.atZone(zona).minusSeconds(1).withZoneSameInstant(ZoneOffset.UTC).format(UNTIL_UTC)
        return (resto + "UNTIL=$until").joinToString(";")
    }
}

object Impegni {
    private val GIORNO_LUNGO = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN)
    private val ORA = DateTimeFormatter.ofPattern("HH:mm")

    fun ora(t: String?): LocalTime? = t?.trim()?.takeIf { it.isNotEmpty() }?.let { runCatching { LocalTime.parse(it.take(5)) }.getOrNull() }

    // Il nuovo inizio può essere una data e ora, una data sola, o solo un'ora (stesso giorno dell'occorrenza).
    fun nuovoIntervallo(p: Proposta.SpostaEvento, b: Bersaglio): Pair<LocalDateTime, LocalDateTime> {
        val durata = p.nuovaDurataMinuti?.toLong() ?: ChronoUnit.MINUTES.between(b.daIni, b.daFin)
        val inizio = p.nuovoInizio?.let { t -> ora(t)?.takeIf { t.trim().length <= 5 }?.let { b.daIni.toLocalDate().atTime(it) } ?: Agenda.interpretaInizio(t)?.first } ?: b.daIni
        return inizio to inizio.plusMinutes(durata)
    }

    fun quando(b: Bersaglio) = Agenda.quando(b.daIni, b.daFin, b.tuttoIlGiorno, LocalDate.now())

    fun descriviTogli(p: Proposta.TogliEvento): String {
        val b = p.bersaglio ?: return "Togliere «${p.titolo}» del ${p.giorno}"
        val quando = quando(b)
        val regola = Ripetizione.leggibile(b.regola)
        return when (p.portata ?: Portata.UNO) {
            Portata.UNO -> "Togliere dal calendario «${b.titolo}», $quando" + if (b.ricorrente) " — solo questo: la serie ($regola) resta" else ""
            Portata.DA_QUI -> "Togliere «${b.titolo}» ($regola) da ${b.daIni.format(GIORNO_LUNGO)} in poi" +
                (b.futuri?.let { " — $it appuntamenti nei prossimi 12 mesi" } ?: "") + "; quelli prima restano"
            Portata.SERIE -> "Togliere TUTTA la serie «${b.titolo}» ($regola, ${b.daIni.format(ORA)}), compresi gli appuntamenti passati" +
                (b.futuri?.let { " — $it nei prossimi 12 mesi" } ?: "")
        } + " (calendario «${b.calendario}»). Una copia resta nel diario di Adam."
    }

    fun descriviSposta(p: Proposta.SpostaEvento): String {
        val b = p.bersaglio ?: return "Spostare «${p.titolo}» del ${p.giorno}"
        val (da, a) = nuovoIntervallo(p, b)
        val cambi = mutableListOf<String>()
        if (da != b.daIni || a != b.daFin) cambi += "da ${quando(b)} a ${Agenda.quando(da, a, b.tuttoIlGiorno, LocalDate.now())}"
        p.nuovoTitolo?.let { cambi += "titolo «$it»" }
        p.nuovoLuogo?.let { cambi += "luogo «$it»" }
        return "Cambiare «${b.titolo}»: ${cambi.joinToString(", ")}" + (if (b.ricorrente) " — solo questo, la serie resta" else "") + " (calendario «${b.calendario}»)"
    }
}

object Risolutore {
    private fun norm(t: String) = Testi.normalizza(t)

    private fun trova(eventi: List<Evento>, titolo: String, ora: LocalTime?): List<Evento> {
        val alOrario = eventi.filter { ora == null || (!it.tuttoIlGiorno && it.inizio.toLocalTime() == ora) }
        val c = norm(titolo)
        alOrario.filter { norm(it.titolo) == c }.let { if (it.isNotEmpty()) return it }
        return alOrario.filter { norm(it.titolo).contains(c) || c.contains(norm(it.titolo)) }
    }

    // `eventi` sono le occorrenze del giorno indicato, lette dal calendario vero.
    fun risolvi(p: Proposta, eventi: List<Evento>, oggi: LocalDate): Risoluzione {
        val (titolo, giornoTesto, oraTesto) = when (p) {
            is Proposta.TogliEvento -> Triple(p.titolo, p.giorno, p.ora)
            is Proposta.SpostaEvento -> Triple(p.titolo, p.giorno, p.ora)
            else -> return Risoluzione.Pronta(p)
        }
        val giorno = LocalDate.parse(giornoTesto)
        val quel = Giorni.leggibile(giornoTesto, oggi)
        val delGiorno = Agenda.delGiorno(eventi, giorno)
        val c = trova(delGiorno, titolo, Impegni.ora(oraTesto))
        if (c.isEmpty()) return Risoluzione.Domanda("nessun impegno «$titolo» $quel" + (oraTesto?.let { " alle $it" } ?: "") + ". " +
            if (delGiorno.isEmpty()) "Quel giorno il calendario è vuoto." else "Quel giorno ci sono: ${delGiorno.joinToString("; ") { Agenda.riga(it, oggi, false) }}")
        if (c.size > 1) return Risoluzione.Domanda("«$titolo» $quel corrisponde a ${c.size} impegni: ${c.joinToString("; ") { Agenda.riga(it, oggi, false) }}. " +
            "Chiedi al Ghost quale e riproponi con l'ora")
        val e = c.single()
        if (!e.scrivibile) return Risoluzione.Domanda("«${e.titolo}» sta nel calendario «${e.calendario}», che è in sola lettura: non si cambia da qui")
        if (e.organizzatoDaAltri) return Risoluzione.Domanda("«${e.titolo}» l'ha organizzato un altro: cambiarlo qui non cambia il suo. Il Ghost risponde all'invito dall'app del calendario")
        if (e.invitati > 0) return Risoluzione.Domanda("«${e.titolo}» ha ${e.invitati} invitati: cambiarlo li avvisa, è un'uscita verso il mondo. Il Ghost lo fa dall'app del calendario")

        val b = Bersaglio(
            idEvento = e.id, idSerie = e.idSerie, eccezione = e.eccezione, titolo = e.titolo, calendario = e.calendario,
            inizio = e.inizio.toString(), fine = e.fine.toString(), inizioMs = e.inizioMs, fineMs = e.fineMs,
            origineMs = e.origineMs.takeIf { it != 0L } ?: e.inizioMs, tuttoIlGiorno = e.tuttoIlGiorno,
            regola = e.regola, primaDellaSerie = e.primaDellaSerie,
        )
        return when (p) {
            is Proposta.TogliEvento -> {
                if (b.ricorrente && p.portata == null) Risoluzione.Domanda(
                    "«${e.titolo}» si ripete (${Ripetizione.leggibile(e.regola)}). Chiedi al Ghost se togliere solo quello di " +
                        "${Giorni.leggibile(giornoTesto, oggi)}, da quello in poi, o tutta la serie compresi i passati; poi riproponi con «quali»")
                else Risoluzione.Pronta(p.copy(bersaglio = b, portata = if (b.ricorrente) p.portata else Portata.UNO))
            }
            is Proposta.SpostaEvento -> {
                val nuovo = p.nuovoInizio
                if (nuovo != null && nuovo.trim().length == 10 && !b.tuttoIlGiorno)
                    return Risoluzione.Domanda("«${e.titolo}» ha un orario: indica anche l'ora nuova (yyyy-MM-ddTHH:mm o HH:mm)")
                if (nuovo != null && nuovo.trim().length > 10 && b.tuttoIlGiorno)
                    return Risoluzione.Domanda("«${e.titolo}» dura tutto il giorno: indica solo la data nuova (yyyy-MM-dd)")
                val pronta = p.copy(bersaglio = b)
                val (da, _) = Impegni.nuovoIntervallo(pronta, b)
                if (da.toLocalDate().isBefore(oggi)) return Risoluzione.Domanda("il ${da.toLocalDate()} è passato: il calendario è per ciò che viene")
                Risoluzione.Pronta(pronta)
            }
            else -> Risoluzione.Pronta(p)
        }
    }

}
