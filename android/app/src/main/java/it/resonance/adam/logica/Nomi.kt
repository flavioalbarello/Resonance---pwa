package it.resonance.adam.logica

import it.resonance.adam.dati.Profilo

// Il nome dello Shell (il Ghost, 01/10/2026): ognuno dà al suo il nome che preferisce; il ruolo resta Shell (DNA),
// cambia come si chiama sullo schermo e come si presenta. Il Ghost tiene «Shell», da Ghost in the Shell.
// Nell'app base l'utente non è «il Ghost»: è «tu».
object Nomi {
    const val SHELL = "Shell"
    const val NOME_MAX = 24

    fun shell(p: Profilo?): String = p?.nomeShell?.trim()?.takeIf { it.isNotEmpty() } ?: SHELL

    fun haNome(p: Profilo?) = shell(p) != SHELL

    /** Dentro una frase: «lo Shell» se non ha un nome suo, altrimenti il nome («tu e Luisa»). */
    fun shellNellaFrase(p: Profilo?) = if (haNome(p)) shell(p) else "lo Shell"

    /** All'inizio di una frase: «Lo Shell ha risposto», «Luisa ha risposto». */
    fun soggetto(p: Profilo?) = if (haNome(p)) shell(p) else "Lo Shell"

    /** Un nome si accetta se è un nome: una riga, corto, non vuoto. */
    fun valido(nome: String) = nome.trim().let { it.isNotEmpty() && it.length <= NOME_MAX && '\n' !in it }

    fun ghost(sviluppatore: Boolean = Edizione.sviluppatore) = if (sviluppatore) "Il Ghost" else "Tu"
}
