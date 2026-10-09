package it.resonance.adam.logica

// Rivedere un quaderno sul telefono: un campo di testo lungo si corregge male col pollice. Diviso in righe,
// ogni riga si toglie con un tocco. Il testo resta com'era: si toglie solo la riga scelta.
object Quaderni {
    fun righe(testo: String): List<String> = testo.lines().map { it.trim() }.filter { it.isNotEmpty() }

    fun senza(testo: String, indice: Int): String {
        var n = -1
        val tenute = testo.lines().filter { riga -> if (riga.isBlank()) true else { n++; n != indice } }
        return tenute.joinToString("\n").replace(Regex("\n{3,}"), "\n\n").trim()
    }
}
