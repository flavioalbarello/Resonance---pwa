package it.resonance.adam.ui

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight

// Il modello scrive in markdown anche quando gli si chiede di non farlo: lo si mostra, invece di lasciare gli asterischi.
// Solo ciò che serve a leggere: grassetto, corsivo, elenchi, citazioni, titoli. Il resto resta testo.
object Formato {
    private val GRASSETTO = Regex("""\*\*(.+?)\*\*|__(.+?)__""")
    private val CORSIVO = Regex("""(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])""")
    private val CODICE = Regex("""`([^`]+)`""")

    fun annota(testo: String): AnnotatedString = buildAnnotatedString {
        testo.lines().forEachIndexed { i, grezza ->
            if (i > 0) append("\n")
            val riga = grezza.trimEnd()
            when {
                Regex("""^#{1,6}\s+""").containsMatchIn(riga) -> {
                    val inizio = length
                    linea(riga.replace(Regex("""^#{1,6}\s+"""), ""))
                    addStyle(SpanStyle(fontWeight = FontWeight.Bold), inizio, length)
                }
                riga.startsWith(">") -> {
                    val inizio = length
                    append("│ ")
                    linea(riga.removePrefix(">").trimStart())
                    addStyle(SpanStyle(fontStyle = FontStyle.Italic), inizio, length)
                }
                Regex("""^\s*[-*+]\s+""").containsMatchIn(riga) -> {
                    val rientro = riga.takeWhile { it == ' ' }.length / 2
                    append("  ".repeat(rientro) + "• ")
                    linea(riga.replace(Regex("""^\s*[-*+]\s+"""), ""))
                }
                riga.trim() == "---" || riga.trim() == "***" -> append("—")
                else -> linea(riga)
            }
        }
    }

    // Dentro una riga: prima il grassetto (** ), poi il corsivo (* ), poi il codice (`), nell'ordine in cui compaiono.
    private fun AnnotatedString.Builder.linea(t: String) {
        var i = 0
        while (i < t.length) {
            val g = GRASSETTO.find(t, i)
            val c = CORSIVO.find(t, i)
            val k = CODICE.find(t, i)
            val primo = listOfNotNull(g, c, k).minByOrNull { it.range.first }
            if (primo == null) { append(t.substring(i)); return }
            append(t.substring(i, primo.range.first))
            val dentro = primo.groupValues.drop(1).first { it.isNotEmpty() }
            val stile = when (primo) {
                g -> SpanStyle(fontWeight = FontWeight.Bold)
                c -> SpanStyle(fontStyle = FontStyle.Italic)
                else -> SpanStyle(background = Colori.fondo2)
            }
            val inizio = length
            append(dentro)
            addStyle(stile, inizio, length)
            i = primo.range.last + 1
        }
    }
}
