package it.resonance.adam.cervello

import java.util.Locale

// La temperatura la decide il compito, non il modello e non il Ghost a ogni messaggio (25/09/2026). Nella PWA c'era,
// per compito; nell'APK si era persa e ogni modello usava la sua. Il Ghost può forzarla per UN messaggio, quando vede
// un blocco: la forzatura resta scritta, ed è un dato su dove la scelta automatica sbaglia.
enum class Compito(val etichetta: String, val temperatura: Double, val perche: String) {
    MOTORE("scelta del motore", 0.0, "è una classificazione: stessa domanda, stessa risposta"),
    ALLEGATI("immagini e documenti", 0.2, "trascrivere, non inventare"),
    TURNO("conversazione e proposte", 0.4, "le proposte vogliono date, numeri e nomi esatti"),
    BATTITO("messaggio del battito", 0.7, "due righe che non siano sempre le stesse"),
    ESPERIMENTO("perturbazione ed esperimenti", 0.9, "deve proporre l'audace, non l'ovvio"),
    DADO("dado della domenica", 0.9, "il caso l'ha tirato il programma: lo Shell ci lavora sopra libero"),
}

enum class Forzatura(val etichetta: String, val temperatura: Double) {
    PRECISO("più preciso", 0.2),
    LIBERO("più libero", 0.8),
}

object Temperatura {
    // Il rifiuto del parametro si riconosce dal testo dell'errore, come nella PWA: si toglie SOLO la temperatura, e
    // solo se l'errore ne parla. Un credito finito o un modello inesistente non si curano togliendo campi.
    private val RIFIUTO = Regex(
        """temperature.{0,60}(not supported|unsupported|is not allowed|not allowed|must be|only.{0,20}default|invalid|cannot)|(unsupported|invalid).{0,30}temperature""",
        RegexOption.IGNORE_CASE,
    )

    fun rifiutata(errore: String?) = errore != null && RIFIUTO.containsMatchIn(errore)

    fun etichetta(t: Double?, forzata: Boolean): String? =
        t?.let { "t " + String.format(Locale.ITALIAN, "%.1f", it) + if (forzata) " forzata" else "" }
}
