package it.resonance.adam.ui

// Il menu della V3: ciò che non sta nei tre luoghi. Ogni voce dice cosa c'è dentro, perché il Ghost non debba ricordare
// dove era finita una cosa (PROGETTO_V3.md, «Nessuna funzione persa»). Fondo e Lettere sono nella scheda Adam, che
// nell'app base li nasconde da sé (logica/Edizione.kt).
object Menu {
    data class Voce(val nome: String, val cosa: String, val schermata: Schermata)

    fun voci(sviluppatore: Boolean): List<Voce> = listOf(
        Voce("Numeri e rituali", "tutti i numeri, i rituali da creare o togliere, gli esperimenti", Schermata.SPECCHIO),
        Voce("Bio", "numeri, percorsi e memoria del corpo", Schermata.BIO),
        Voce("Air", "entrate, percorsi e memoria dell'autonomia", Schermata.AIR),
        Voce("Vidya", "pratica, percorsi e memoria della crescita", Schermata.VIDYA),
        Voce("Adam", "lavagna, memoria, storia" + if (sviluppatore) ", fondo, lettere" else "", Schermata.ADAM),
        Voce("Setup", "chiave, permessi, calendari, copia, come si regola lo Shell", Schermata.SETUP),
    )
}
