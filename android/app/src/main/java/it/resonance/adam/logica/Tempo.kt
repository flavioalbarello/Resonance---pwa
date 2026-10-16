package it.resonance.adam.logica

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// La mappa del tempo (V3 fase 5, PROGETTO_V3.md). Il Ghost non scrive i suoi impegni per avere un'agenda: il calendario
// serve all'app come FORMA del tempo libero. I buchi fra un impegno e l'altro sono dove una sessione può stare; durante
// un impegno l'app tace. Gli eventi di tutto il giorno (ferie, compleanni) non occupano ore. I nomi degli eventi non si
// guardano: un blocco di lavoro è un blocco, chiunque ci sia dentro.
object Tempo {
    const val DALLE = 8
    const val ALLE = 22
    const val MINIMO = 20            // un buco più corto non vale una proposta
    val PROPOSTE_DALLE: java.time.LocalTime = java.time.LocalTime.of(18, 30)   // predefinito; il Ghost lo cambia in Setup
    private val ORA = DateTimeFormatter.ofPattern("HH:mm")

    data class Buco(val da: LocalDateTime, val a: LocalDateTime) {
        val minuti get() = Duration.between(da, a).toMinutes().toInt()
    }

    sealed class Adesso {
        data class Impegnato(val evento: Evento) : Adesso()
        data class Libero(val minuti: Int, val prossimo: Evento?) : Adesso()
        data object Fuori : Adesso()
    }

    private fun conOre(eventi: List<Evento>) = eventi.filter { !it.tuttoIlGiorno }.sortedBy { it.inizio }

    /** I buchi di un giorno, da `dalle` (o dalle 8) alle 22, fra gli eventi con orario. */
    fun buchi(eventi: List<Evento>, giorno: LocalDate, dalle: LocalDateTime? = null): List<Buco> {
        val inizio = maxOf(giorno.atTime(DALLE, 0), dalle ?: giorno.atStartOfDay())
        val fine = giorno.atTime(ALLE, 0)
        if (!inizio.isBefore(fine)) return emptyList()
        val buchi = mutableListOf<Buco>()
        var cursore = inizio
        conOre(eventi).filter { it.fine.isAfter(inizio) && it.inizio.isBefore(fine) }.forEach { e ->
            if (e.inizio.isAfter(cursore)) buchi += Buco(cursore, e.inizio)
            if (e.fine.isAfter(cursore)) cursore = e.fine
        }
        if (cursore.isBefore(fine)) buchi += Buco(cursore, fine)
        return buchi.filter { it.minuti > 0 }
    }

    /** Dove cade adesso: dentro un impegno, in un buco (quanto dura e cosa viene dopo), o fuori orario. */
    fun adesso(eventi: List<Evento>, ora: LocalDateTime): Adesso {
        conOre(eventi).firstOrNull { !it.inizio.isAfter(ora) && it.fine.isAfter(ora) }?.let { return Adesso.Impegnato(it) }
        val fine = ora.toLocalDate().atTime(ALLE, 0)
        if (ora.hour < DALLE || !ora.isBefore(fine)) return Adesso.Fuori
        val prossimo = conOre(eventi).firstOrNull { it.inizio.isAfter(ora) && it.inizio.toLocalDate() == ora.toLocalDate() }
        return Adesso.Libero(Duration.between(ora, minOf(prossimo?.inizio ?: fine, fine)).toMinutes().toInt(), prossimo)
    }

    /** Il tempo da proporre per un buco: arrotondato a 5 minuti per difetto, con 5 di margine prima dell'impegno, al massimo 2 ore. */
    fun daStudiare(minuti: Int): Int = ((minuti - 5) / 5 * 5).coerceIn(0, 120)

    /**
     * Il buco in cui proporre lo studio oggi: il primo, dall'ora scelta dal Ghost in poi, abbastanza lungo. Col calendario
     * vuoto è l'ora scelta; con un impegno a quell'ora, la fine dell'impegno.
     */
    fun daProporre(eventi: List<Evento>, oggi: LocalDate, ora: LocalDateTime, dalle: java.time.LocalTime = PROPOSTE_DALLE): Buco? =
        buchi(eventi, oggi, maxOf(ora, oggi.atTime(dalle))).firstOrNull { daStudiare(it.minuti) >= MINIMO }

    /** «45′ liberi, fino alle 19:00»: il tempo detto come lo si vede, senza il nome dell'impegno. */
    fun riga(a: Adesso.Libero): String = "${a.minuti.coerceAtMost(600)}′ liberi" + (a.prossimo?.let { ", fino alle ${it.inizio.format(ORA)}" } ?: ", fino a sera")
}
