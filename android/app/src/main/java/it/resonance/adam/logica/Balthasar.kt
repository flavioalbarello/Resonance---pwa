package it.resonance.adam.logica

// Balthasar in riunione (27/09/2026): la spinta stocastica che al tavolo mancava. I ruoli vengono dall'Agorà Magi della
// PWA, senza la sua sequenza fissa: l'architetto fa Melchior, il Ghost e il programma fanno Caspar, lo Shell fa
// Balthasar. Non nel turno normale: lì lo Shell ha gli strumenti, che vogliono date e nomi esatti. È una chiamata a
// parte, SENZA strumenti, a temperatura alta, con un tetto di parole, che nel verbale ha la sua etichetta.
// La dose la sceglie il Ghost con l'intensità. Parte dalla domanda sul tavolo e solo da quella: il sorteggio da tutta
// la memoria è stato scartato dal Ghost («più l'app cresce, più si perde lo scopo della riunione dietro vaneggiamenti»).
object Balthasar {
    // Tetto a 1: alcuni modelli non accettano di più, e un rifiuto qui li segnerebbe «senza temperatura» per sempre.
    enum class Intensita(val etichetta: String, val temperatura: Double, val come: String) {
        LEGGERA("leggera", 0.7, "uno spostamento laterale: la stessa strada vista da un'angolatura che non si è ancora guardata"),
        MEDIA("media", 0.85, "una deviazione vera: un'ipotesi che il tavolo non ha considerato e che cambierebbe la decisione"),
        PROFONDA("profonda", 1.0, "una rottura: rovescia un presupposto che il tavolo dà per scontato"),
    }

    const val TETTO_PAROLE = 90
    // Oltre questo, la forma non è stata rispettata e lo si scrive sotto; non si taglia (Legge 14).
    private const val TOLLERANZA = 1.3

    val FORMA = "FORMA, vincolante: righe brevissime che cominciano con «· », un'idea per riga, al massimo $TETTO_PAROLE parole in tutto. " +
        "Niente premesse, niente saluti, niente riassunto di ciò che è stato detto. Non proporre azioni e non usare strumenti: " +
        "sei una voce che perturba, non chi decide."

    fun richiesta(domanda: String, i: Intensita) = "[Nota del programma, non del Ghost] Il Ghost ha toccato «Perturba» (intensità ${i.etichetta}). " +
        "Per questa sola risposta sei BALTHASAR, il Perturbatore della riunione. La domanda sul tavolo è: «${domanda.trim()}». " +
        "Resta su questa domanda: la deviazione è sul COME, non sul DI COSA. Intensità ${i.etichetta}: ${i.come}. " +
        "Audace ma non gratuita: ogni riga deve poter cambiare una decisione del tavolo. $FORMA"

    fun parole(t: String) = t.split(Regex("\\s+")).count { it.any(Char::isLetterOrDigit) }

    /** Null se la forma regge; altrimenti la riga che resta scritta sotto la risposta. */
    fun fuoriForma(t: String): String? {
        val n = parole(t)
        return if (n > TETTO_PAROLE * TOLLERANZA) "(Balthasar ha scritto $n parole su un tetto di $TETTO_PAROLE: la forma non è stata rispettata.)" else null
    }
}
