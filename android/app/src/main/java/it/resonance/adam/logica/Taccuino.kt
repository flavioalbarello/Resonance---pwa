package it.resonance.adam.logica

import it.resonance.adam.dati.Nota

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

    fun viva(n: Nota, ora: Long) =!n.tolta && ora - n.ripresa < GIORNI * GIORNO_MS

    fun vive(note: List<Nota>, ora: Long): List<Nota> = note.filter { viva(it, ora) }.sortedByDescending { it.ripresa }.take(NEL_PROMPT)

    fun giorniRimasti(n: Nota, ora: Long): Int = (GIORNI - ((ora - n.ripresa) / GIORNO_MS).toInt()).coerceAtLeast(0)

    fun riga(n: Nota, ora: Long) = "#${n.id} (evapora tra ${giorniRimasti(n, ora)} gg): ${n.testo}"
}
