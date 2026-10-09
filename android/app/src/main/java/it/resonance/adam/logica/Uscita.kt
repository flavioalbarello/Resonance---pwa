package it.resonance.adam.logica

// Ciò che esce dal telefono. Il danno reputazionale accade fuori (CLAUDE.md, 02/09/2026): un NOME che
// identifica il Ghost non esce senza un suo gesto su quella cosa precisa. La professione sì.
object Uscita {
    private val EMAIL = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")

    fun indirizzoValido(a: String) = EMAIL.matches(a.trim())

    fun indirizzi(testo: String): Set<String> = EMAIL.findAll(testo).map { it.value.lowercase() }.toSet()

    fun nomi(campo: String): List<String> = campo.split(',', ';', '\n').map { it.trim() }.filter { it.length >= 3 }.distinct()

    private fun presente(nome: String, testo: String) =
        Regex("(?<![\\p{L}\\p{N}])${Regex.escape(nome)}(?![\\p{L}\\p{N}])", RegexOption.IGNORE_CASE).containsMatchIn(testo)

    // Un nome protetto passa solo se il Ghost l'ha scritto lui in questo turno: è il suo gesto esplicito.
    fun violazioni(testo: String, protetti: List<String>, detteDalGhost: String): List<String> =
        protetti.filter { presente(it, testo) && !presente(it, detteDalGhost) }
}
