package it.resonance.adam.logica

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

// Il consulente esterno (riunione del 27/09/2026): un modello con la ricerca web che il Ghost convoca in riunione,
// che tutti e tre interrogano, e che poi esce. «Un consulente che entra, lo interroghiamo, esce, e poi decidiamo noi.»
// Le domande si raccolgono in una cartella visibile e partono in UNA chiamata al tocco del Ghost: una risposta sola,
// numerata, con le fonti vere sotto. Il consulente vede solo le domande: niente memoria di Adam, niente verbale.
// Qui sta tutto ciò che si decide senza Android: la forma detta al modello e quella controllata sulla risposta (una
// lista sola, letta due volte), le domande che l'architetto manda dal verbale, le fonti che il testo nomina senza averle.
object Consulente {
    // Una protezione, non un limite al Ghost: serve se qualcosa si inceppa e rimanda da solo. Il Ghost lo alza.
    const val TETTO_INVII = 10
    const val ALZA_DI = 5
    const val DOMANDE_MAX = 8
    const val LUNGHEZZA_MAX = 400
    const val PAROLE_PER_PUNTO = 120
    // Riconvocato nella stessa riunione riceve gli ultimi scambi suoi, non tutti: il filo, non un archivio.
    const val SCAMBI_RICORDATI = 3

    @Serializable
    data class Domanda(val autore: String, val testo: String)

    @Serializable
    data class Scambio(val domande: List<String>, val risposta: String)

    data class Fonte(val url: String, val titolo: String, val dominio: String)

    private val json = Json { ignoreUnknownKeys = true }
    fun codifica(d: List<Domanda>): String = json.encodeToString(ListSerializer(Domanda.serializer()), d)
    fun decodifica(s: String): List<Domanda> = runCatching { json.decodeFromString(ListSerializer(Domanda.serializer()), s) }.getOrDefault(emptyList())
    fun codificaStoria(s: List<Scambio>): String = json.encodeToString(ListSerializer(Scambio.serializer()), s)
    fun decodificaStoria(s: String): List<Scambio> = runCatching { json.decodeFromString(ListSerializer(Scambio.serializer()), s) }.getOrDefault(emptyList())

    /** Un intervento dell'architetto per il consulente: la PRIMA riga è «→ Consulente» (o «-> Consulente»). */
    fun rivolto(t: String) = PER_LUI.containsMatchIn(t)
    private val PER_LUI = Regex("^\\s*(→|->)\\s*consulente\\b", RegexOption.IGNORE_CASE)

    /** Per la voce e lo schermo: la freccia si dice a parole. */
    fun leggibile(t: String) = t.replaceFirst(FRECCIA, "Al consulente: ")
    // La freccia e la sua punteggiatura, sulla stessa riga: un «a capo» e il «- » della prima domanda restano.
    private val FRECCIA = Regex("^\\s*(→|->)[ \\t]*consulente\\b[ \\t]*[:,.—-]?[ \\t]*", RegexOption.IGNORE_CASE)

    /**
     * Le domande di un intervento «→ Consulente»: le righe che cominciano con «- », «· » o un numero sono una domanda
     * ciascuna; senza elenco, tutto il testo è una domanda sola.
     */
    fun domandeDa(t: String): List<String> {
        val corpo = t.replaceFirst(FRECCIA, "").trim()
        val righe = corpo.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val punti = righe.filter { VOCE.containsMatchIn(it) }
        return if (punti.isNotEmpty()) punti.map { it.replaceFirst(VOCE, "").trim() }.filter { it.isNotEmpty() }
        else listOf(righe.joinToString(" ")).filter { it.isNotBlank() }
    }
    private val VOCE = Regex("^(-|·|•|\\d{1,2}[.)])\\s+")

    /** Il guardiano dove il dato esce: nomi protetti e indirizzi non partono verso il consulente. */
    fun pulisci(t: String, nomiProtetti: List<String>): String {
        val senzaNomi = nomiProtetti.fold(t) { acc, n -> acc.replace(n, "[nome protetto]", ignoreCase = true) }
        return senzaNomi.replace(INDIRIZZO, "[indirizzo]")
    }
    private val INDIRIZZO = Regex("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+")

    // ── La forma: detta al modello e controllata sulla risposta, dalla stessa costante ──

    val FORMA = "Rispondi in italiano, a OGNI domanda, nello stesso ordine. Ogni risposta comincia su una riga sua col numero " +
        "della domanda seguito dal punto («1.», «2.»…), poi righe brevi che cominciano con «· », al massimo $PAROLE_PER_PUNTO " +
        "parole per punto. Asciutto: niente premesse, niente riassunti finali. Cita SOLO siti e servizi che la ricerca ti ha " +
        "restituito davvero; se una cosa non l'hai trovata, scrivi «non trovato» invece di supporla. Se un dato è una tua stima, dillo."

    val SISTEMA = "Sei un consulente esterno chiamato in una riunione di progettazione. Hai la ricerca web: usala. " +
        "Non conosci le persone al tavolo e non ti serve: rispondi alle domande, con fatti verificabili. $FORMA"

    fun richiesta(domande: List<String>) = "Domande del tavolo:\n" + domande.mapIndexed { i, d -> "${i + 1}. $d" }.joinToString("\n")

    /** I numeri a cui la risposta non ha dato un punto suo. */
    fun mancano(risposta: String, quante: Int): List<Int> = (1..quante).filterNot { n -> Regex("(?m)^[\\s*#_>]*$n[.)]").containsMatchIn(risposta) }

    fun sollecito(mancano: List<Int>) = "Nella risposta mancano i punti ${mancano.joinToString(", ")}. Rispondi SOLO a quelli, " +
        "con la stessa forma, usando ciò che hai già trovato; se non l'hai trovato scrivi «non trovato»."

    // ── Le fonti: il programma mostra quelle restituite dal motore, non la prosa che le racconta ──

    fun dominio(url: String): String = runCatching { java.net.URI(url).host?.removePrefix("www.") }.getOrNull()?.takeIf { it.isNotBlank() } ?: url

    // Nomi noti a chiunque: nessuna ricerca li deve confermare (lo stesso elenco della PWA, 02/09/2026: senza, l'allarme
    // suonava su WhatsApp e YouTube, e un allarme che suona sempre smette di essere letto).
    private val MARCHI_NOTI = setOf(
        "whatsapp", "youtube", "github", "gitlab", "linkedin", "tiktok", "instagram", "facebook", "paypal", "wordpress", "shopify",
        "substack", "patreon", "kickstarter", "indiegogo", "spotify", "soundcloud", "bandcamp", "netflix", "airbnb", "dropbox",
        "onedrive", "icloud", "openai", "chatgpt", "deepseek", "huggingface", "openrouter", "printify", "printful", "notion",
        "airtable", "figma", "canva", "mailchimp", "wetransfer", "stackoverflow", "javascript", "typescript", "nodejs",
        "postgresql", "mysql", "mongodb", "sqlite", "powerpoint", "onenote", "outlook", "sharepoint", "iphone", "ipad", "macbook",
        "playstation", "xbox", "bluetooth", "wifi", "android", "chromebook", "raybans", "rayban", "deepmind", "googleplay",
    )
    private val CAMMELLO = Regex("\\b[A-Za-z]*[a-z][A-Z][a-zA-Z0-9]*\\b")
    private val SITO = Regex("\\b(?:https?://)?(?:www\\.)?([a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|it|org|net|io|ai|eu|co|dev|app|info|uk|de|fr))\\b", RegexOption.IGNORE_CASE)

    /**
     * I nomi che la risposta cita senza che la ricerca li abbia restituiti: siti scritti nel testo che non sono fra le
     * fonti, e marchi con una maiuscola interna (la forma dei nomi inventati visti il 26/07) che nessun dominio contiene.
     * Non blocca niente: è un sospetto da verificare, scritto sotto la risposta. Esclusi i nomi già nelle domande.
     */
    fun sospette(risposta: String, fonti: List<Fonte>, domande: List<String>): List<String> {
        val domini = fonti.map { it.dominio.lowercase() }
        val chiesto = domande.joinToString(" ").lowercase()
        val siti = SITO.findAll(risposta).map { it.groupValues[1].lowercase().removePrefix("www.") }
            .filter { s -> domini.none { d -> d == s || d.endsWith(".$s") || s.endsWith(".$d") } && s !in chiesto }
        val nomi = CAMMELLO.findAll(risposta).map { it.value }
            .filter { n -> n.lowercase() !in MARCHI_NOTI && n.lowercase() !in chiesto && domini.none { d -> d.replace(".", "").replace("-", "").contains(n.lowercase()) } }
        return (siti + nomi).distinct().take(8).toList()
    }

    /** La scheda che entra in chat e nel verbale: domande, risposta, fonti vere, sospetti, rinuncia. */
    fun scheda(domande: List<Domanda>, risposta: String, fonti: List<Fonte>, sospette: List<String>, mancano: List<Int>): String = buildString {
        appendLine("Domande:")
        domande.forEachIndexed { i, d -> appendLine("${i + 1}. [${d.autore}] ${d.testo}") }
        appendLine()
        appendLine("Risposta:")
        appendLine(risposta.trim().ifBlank { "(vuota)" })
        appendLine()
        if (fonti.isEmpty()) appendLine("Fonti trovate davvero: nessuna. La ricerca non risulta fatta: prendi la risposta come un parere, non come un dato.")
        else {
            appendLine("Fonti trovate davvero (${fonti.size}):")
            fonti.take(10).forEach { f -> appendLine("- ${f.dominio}" + (if (f.titolo.isNotBlank()) " — ${Testi.corto(f.titolo, 80)}" else "") + " · ${f.url}") }
        }
        if (sospette.isNotEmpty()) appendLine("⚠ Nomina senza averli trovati: ${sospette.joinToString(", ")}. Da verificare prima di usarli.")
        if (mancano.isNotEmpty()) appendLine("(Senza risposta ai punti ${mancano.joinToString(", ")}: il consulente non li ha trattati neanche al secondo invito.)")
    }.trimEnd()

    /** Per la voce: la risposta e l'eventuale sospetto, senza gli indirizzi delle fonti (si leggono sullo schermo). */
    fun perLaVoce(scheda: String): String {
        val risposta = scheda.substringAfter("Risposta:\n", scheda).substringBefore("\n\nFonti trovate davvero").trim()
        val avviso = scheda.lines().firstOrNull { it.startsWith("⚠") }?.removePrefix("⚠")?.trim()
        return listOfNotNull(risposta, avviso?.let { "Attenzione: $it" }).joinToString("\n")
    }

    /** Una riga di stato per il prompt dello Shell. */
    fun stato(presente: Boolean, domande: List<Domanda>, invii: Int, tetto: Int): String =
        if (!presente) "assente (lo convoca il Ghost con «Convoca consulente»)"
        else "nella stanza: ${domande.size} domande in cartella" + (if (domande.isNotEmpty()) " (" + domande.joinToString("; ") { "[${it.autore}] ${Testi.corto(it.testo, 60)}" } + ")" else "") +
            ", invii $invii su $tetto"
}
