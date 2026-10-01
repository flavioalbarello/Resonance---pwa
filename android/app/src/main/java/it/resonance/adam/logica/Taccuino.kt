package it.resonance.adam.logica

import it.resonance.adam.dati.Nota
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// Le note dello Shell evaporano: una traccia non praticata svanisce (Adam City). Non si cancella niente (Legge 14):
// esce dal prompt e basta. Lo Shell la tiene viva riprendendola; il Ghost la vede sempre, anche evaporata.
object Taccuino {
    const val GIORNI = 21
    const val LUNGHEZZA = 280
    // Oltre questo numero, anche note vive restano fuori dal prompt: la memoria dello Shell non deve divorare il contesto.
    const val NEL_PROMPT = 30
    private const val GIORNO_MS = 86_400_000L

    // Il tipo di una nota (01/10/2026): un esempio inventato dal Ghost per spiegare era tornato, settimane dopo, come
    // «cifratura del paziente» vera. Ciò che si ricorda porta con sé che cosa è, e non lo cambia strada facendo. Sta
    // davanti al testo, fra parentesi quadre: nessuna colonna nuova, e le note di prima restano leggibili.
    val TIPI = listOf("ipotesi", "fatto", "decisione", "esempio")
    fun conTipo(tipo: String, testo: String) = "[${tipo.lowercase().takeIf { it in TIPI } ?: "ipotesi"}] ${testo.trim()}"

    // I giorni di pausa («Sono via», logica/Assenza.kt) non contano (01/10/2026): tre settimane di malattia
    // facevano evaporare tutte le ipotesi dello Shell senza che lui avesse potuto riprenderne una. Come per i rituali,
    // l'orologio si ferma quando il Ghost è via. Si tolgono i giorni di pausa dopo quello in cui la nota è stata ripresa.
    fun trascorso(n: Nota, ora: Long, pausa: Set<LocalDate> = emptySet(), zona: ZoneId = ZoneId.systemDefault()): Long {
        if (pausa.isEmpty()) return ora - n.ripresa
        val da = Instant.ofEpochMilli(n.ripresa).atZone(zona).toLocalDate()
        val oggi = Instant.ofEpochMilli(ora).atZone(zona).toLocalDate()
        val fermi = pausa.count { it.isAfter(da) && !it.isAfter(oggi) }
        return (ora - n.ripresa - fermi * GIORNO_MS).coerceAtLeast(0)
    }

    fun viva(n: Nota, ora: Long, pausa: Set<LocalDate> = emptySet()) = !n.tolta && trascorso(n, ora, pausa) < GIORNI * GIORNO_MS

    fun vive(note: List<Nota>, ora: Long, pausa: Set<LocalDate> = emptySet()): List<Nota> =
        note.filter { viva(it, ora, pausa) }.sortedByDescending { it.ripresa }.take(NEL_PROMPT)

    fun giorniRimasti(n: Nota, ora: Long, pausa: Set<LocalDate> = emptySet()): Int =
        (GIORNI - (trascorso(n, ora, pausa) / GIORNO_MS).toInt()).coerceAtLeast(0)

    fun riga(n: Nota, ora: Long, pausa: Set<LocalDate> = emptySet()) = "#${n.id} (evapora tra ${giorniRimasti(n, ora, pausa)} gg): ${n.testo}"
}
