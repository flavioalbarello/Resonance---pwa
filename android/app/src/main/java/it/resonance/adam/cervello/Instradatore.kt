package it.resonance.adam.cervello

import it.resonance.adam.logica.Allegati
import it.resonance.adam.logica.Allegato
import it.resonance.adam.logica.Testi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class Motore(val etichetta: String) { LEGGERO("leggero"), PIENO("pieno") }

// La microchiamata che sceglie il motore. Decide poco e costa meno di un centesimo di centesimo: legge solo la
// domanda, non il contesto. Nel dubbio, o se non risponde in tempo, vale PIENO: sbagliare verso il modello
// migliore costa qualche centesimo, sbagliare verso quello leggero costa una risposta peggiore.
object Instradatore {
    const val MODELLO = "mistralai/ministral-8b-2512"

    private val ISTRUZIONI = """
        Scegli il motore per rispondere a un messaggio rivolto a un assistente personale.
        LEGGERO: registrare un numero (peso, sonno, soldi, minuti), una domanda breve con risposta diretta, un saluto,
        un sì o un no, leggere l'agenda, spostare o togliere un impegno, trascrivere il testo di una foto.
        PIENO: ragionare su una scelta, scrivere o correggere un testo, pianificare, dare un parere, analizzare un
        documento o un'immagine complessa, parlare di come sta la persona, tutto ciò che è ambiguo.
        Rispondi con una sola parola: LEGGERO o PIENO.
    """.trimIndent()

    // Alcune richieste non vanno nemmeno chieste: il programma le sa già.
    fun ovvio(testo: String, allegati: List<Allegato>): Motore? = when {
        allegati.any { it.tipo == Allegato.Tipo.TESTO } -> Motore.PIENO
        allegati.any { it.tipo == Allegato.Tipo.PDF } -> Motore.PIENO
        testo.length > 600 -> Motore.PIENO
        else -> null
    }

    fun messaggi(testo: String, rispostaPrecedente: String?, allegati: List<Allegato>): JsonArray = JsonArray(listOf(
        buildJsonObject { put("role", "system"); put("content", ISTRUZIONI) },
        buildJsonObject {
            put("role", "user")
            put("content", buildString {
                rispostaPrecedente?.takeIf { it.isNotBlank() }?.let { appendLine("Ultima risposta dell'assistente: «${Testi.corto(it, 300)}»") }
                if (allegati.isNotEmpty()) appendLine("Allegati: ${allegati.joinToString { a -> a.etichetta() }}")
                append("Messaggio: «${Testi.corto(testo, 600)}»")
            })
        },
    ))

    fun leggi(risposta: String?): Motore {
        val r = risposta.orEmpty().uppercase()
        return if ("LEGGERO" in r && "PIENO" !in r) Motore.LEGGERO else Motore.PIENO
    }

    fun etichetta(modello: String) = modello.substringAfter('/')
}
