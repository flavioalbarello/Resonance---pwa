package it.resonance.adam.logica

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

// Ciò che il Ghost allega a un messaggio. Le immagini (anche le pagine di un PDF) stanno come file sul
// telefono; nel messaggio resta solo il riferimento. Il testo di un documento sta qui, già estratto.
@Serializable
data class Allegato(
    val nome: String,
    val tipo: Tipo,
    val immagini: List<String> = emptyList(),   // percorsi dei file JPEG, una per pagina
    val testo: String = "",                     // per i documenti di testo
    val pagineTotali: Int = 0,                  // per i PDF: quante ne aveva, anche se se ne leggono meno
) {
    @Serializable enum class Tipo { IMMAGINE, PDF, TESTO }

    fun etichetta() = when (tipo) {
        Tipo.IMMAGINE -> "🖼 $nome"
        Tipo.PDF -> "📄 $nome (" + (if (pagineTotali > immagini.size) "${immagini.size} di $pagineTotali pagine" else "${immagini.size} pag.") + ")"
        Tipo.TESTO -> "📄 $nome"
    }
}

object Allegati {
    const val PAGINE_MASSIME = 8
    const val TESTO_MASSIMO = 40_000

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val lista = ListSerializer(Allegato.serializer())

    fun codifica(a: List<Allegato>): String = if (a.isEmpty()) "" else json.encodeToString(lista, a)
    fun decodifica(s: String?): List<Allegato> = s?.takeIf { it.isNotBlank() }?.let { runCatching { json.decodeFromString(lista, it) }.getOrNull() }.orEmpty()

    fun conImmagini(a: List<Allegato>) = a.any { it.immagini.isNotEmpty() }

    // Nei turni successivi le immagini non si rimandano (costano, e il modello le ha già viste): si dice che c'erano.
    fun notaPassata(a: List<Allegato>) = if (a.isEmpty()) "" else
        "\n[Allegati a questo messaggio, visti allora e non più visibili: ${a.joinToString(", ") { it.etichetta() }}]"

    fun tagliaTesto(t: String): String =
        if (t.length <= TESTO_MASSIMO) t else t.take(TESTO_MASSIMO) + "\n[…tagliato: il documento ha ${t.length} caratteri, qui i primi $TESTO_MASSIMO]"
}

// Un .docx è uno zip con dentro word/document.xml: il testo sta nei <w:t>, i paragrafi finiscono in </w:p>.
object Documenti {
    fun testoDocx(xml: String): String = xml
        .replace(Regex("</w:p>"), "\n")
        .replace(Regex("<w:tab/>"), "\t")
        .replace(Regex("<w:br/>"), "\n")
        .replace(Regex("<[^>]+>"), "")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
        .lines().joinToString("\n") { it.trimEnd() }
        .replace(Regex("\n{3,}"), "\n\n").trim()
}
