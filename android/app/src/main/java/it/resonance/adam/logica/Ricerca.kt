package it.resonance.adam.logica

import it.resonance.adam.dati.Lettura
import it.resonance.adam.dati.Osservazione
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// La ricerca dello Shell e «Segui» (02/10/2026). Il Ghost: «la funzione della ricerca deve essere potente ed accurata
// per qualcosa che si definisce un'estensione cognitiva e digitale del Ghost». Accurata qui vuol dire: il programma
// pretende le fonti dal motore di ricerca (non i link che il modello scrive a memoria), pretende la data dei dati, e
// dice ad alta voce ciò che non torna. Il numero giusto non lo può garantire nessuno; la sua provenienza sì.
// Detta e verifica dalla stessa costante: DATA è ciò che si chiede al modello ed è ciò che il programma cerca.
object Ricerca {
    const val DATA = "Dati al:"
    const val PAROLE_MAX = 220
    const val DOMANDE_MAX = 4
    const val GIORNI_MAX = 30
    const val SEGUITE_MAX = 5

    val SISTEMA = "Sei la ricerca web di uno Shell, l'estensione digitale di una persona. Hai la ricerca web: usala sempre, " +
        "anche se pensi di sapere la risposta. Riporti ciò che le fonti dicono, non ciò che ricordi."

    // Niente esempio con un contenuto: il 02/10 «1 ottobre 2026, chiusura» (borsa) è finito nella risposta su un ristorante.
    const val SENZA_DATA = "non indicata"
    val FORMA = "Rispondi in italiano, al massimo $PAROLE_MAX parole. La prima riga è «$DATA» seguita dalla data più recente dei dati " +
        "che riporti, presa dalle fonti (giorno, mese e anno); se le fonti non la dicono, «$DATA $SENZA_DATA». " +
        "Ogni numero porta la sua data e la sua unità (valuta, percentuale). " +
        "Se un dato non lo trovi, scrivi «non trovato»: non stimarlo mai. Se le fonti non sono d'accordo, dillo con i due numeri. " +
        "Tieni separati i fatti dalla tua lettura, che va in fondo, in una riga che comincia con «Lettura:». " +
        "Se la domanda chiede posti, negozi o prodotti, rispondi con un elenco: uno per riga, nome, dove, il dato che lo distingue " +
        "(voto e numero di recensioni, prezzo), il numero della fonte. Niente premesse."

    fun richiesta(domanda: String) = "$domanda\n\n$FORMA"

    /** Ciò che non torna in una risposta: va mostrato, non nascosto. Vuoto = niente da segnalare. */
    fun problemi(testo: String, fonti: List<Consulente.Fonte>, domanda: String): List<String> = buildList {
        if (fonti.isEmpty()) add("il motore non ha restituito fonti: questi numeri non hanno provenienza, non usarli")
        val data = testo.lineSequence().map { it.trim().trimStart('*', '_', '#', ' ') }.firstOrNull { it.startsWith(DATA, ignoreCase = true) }
        if (data == null) add("la risposta non dice di quando sono i dati")
        else if (data.contains(SENZA_DATA, ignoreCase = true)) add("le fonti non dicono di quando sono i dati")
        Consulente.sospette(testo, fonti, listOf(domanda), nomi = false).takeIf { it.isNotEmpty() }?.let { add("citati senza averli trovati fra le fonti: ${it.joinToString(", ")}") }
    }

    /**
     * Ciò che lo Shell riceve: la scheda, con gli avvisi chiamati per quello che sono. Il 02/10 ha detto al Ghost che
     * «manca la data» era un errore tecnico: un avviso sulla forma dice quanto fidarsi, non che la ricerca è fallita.
     */
    fun perIlModello(testo: String, fonti: List<Consulente.Fonte>, problemi: List<String>): String = buildString {
        append("Ricerca riuscita.\n")
        append(scheda(testo, fonti, emptyList()))
        if (problemi.isNotEmpty()) append("\n\nAvvisi del programma sulla risposta (NON sono errori tecnici: la ricerca ha funzionato; " +
            "dicono quanto ci si può fidare, e così li riferisci): " + problemi.joinToString("; "))
    }

    /** Chi incrocia gli strati della ricerca a fondo: legge ciò che è stato trovato, non cerca di nuovo. */
    val SISTEMA_INCROCIO = "Sei lo Shell che incrocia le ricerche già fatte per il Ghost: qui sotto ci sono i risultati di più ricerche " +
        "mirate e le fonti numerate. Non cerchi altro e non aggiungi ciò che ricordi: lavori solo su questo materiale."

    /** Il testo che si vede in chat e nelle letture: la risposta, le fonti vere, gli avvisi. */
    fun scheda(testo: String, fonti: List<Consulente.Fonte>, problemi: List<String>): String = buildString {
        append(testo.trim())
        if (fonti.isNotEmpty()) {
            append("\n\nFonti (dal motore di ricerca):")
            fonti.take(8).forEachIndexed { i, f -> append("\n${i + 1}. ${f.titolo.ifBlank { f.dominio }} — ${f.url}") }
        }
        problemi.forEach { append("\n⚠ $it") }
    }

    /**
     * La riga che si vede in chat a scheda chiusa (02/10/2026, sera): la ricerca è materiale, la risposta è dello Shell.
     * Null = non è una ricerca rapida (una ricerca a fondo, una lettura di Segui, un resoconto restano aperti).
     */
    fun riassunto(scheda: String): String? {
        if (!scheda.startsWith("«")) return null
        val ricerche = scheda.lines().count { it.startsWith("«") }
        val fonti = Regex("(?m)^\\d+\\. .* — https?://").findAll(scheda).count()
        val avvisi = scheda.lines().count { it.startsWith("⚠") }
        val data = scheda.lines().map { it.trim().trimStart('*', '_', '#', ' ') }.firstOrNull { it.startsWith(DATA, ignoreCase = true) }
        return listOfNotNull(if (ricerche > 1) "$ricerche ricerche" else null, "$fonti fonti",
            data?.takeIf { ricerche == 1 }?.trimEnd(':', ' '), if (avvisi > 0) "⚠ $avvisi" else null,
            if (scheda.contains(NON_RIUSCITA)) "una non riuscita" else null).joinToString(" · ")
    }

    const val NON_RIUSCITA = "Ricerca non riuscita:"

    fun codificaFonti(fonti: List<Consulente.Fonte>) = fonti.joinToString("\n") { "${it.url}\t${it.titolo.replace('\t', ' ').replace('\n', ' ')}" }
    fun decodificaFonti(s: String): List<Consulente.Fonte> = s.lines().filter { it.isNotBlank() }.map { r ->
        val (u, t) = r.split('\t', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
        Consulente.Fonte(u, t, Consulente.dominio(u))
    }

    // ── Segui: una cosa del mondo, letta ogni giorno per N giorni, con un resoconto alla fine ──

    fun difetti(cosa: String, domanda: String, giorni: Int, attive: Int): List<String> = buildList {
        if (cosa.isBlank() || cosa.length > 60) add("cosa si segue: un nome corto (al massimo 60 caratteri)")
        if (domanda.isBlank()) add("manca la domanda da fare ogni giorno")
        if (giorni !in 1..GIORNI_MAX) add("per quanti giorni: da 1 a $GIORNI_MAX")
        if (attive >= SEGUITE_MAX) add("si seguono già $SEGUITE_MAX cose: prima smettine una")
    }

    fun inCorso(o: Osservazione, oggi: LocalDate) = o.chiusa == null && !oggi.isBefore(LocalDate.parse(o.inizio)) && !oggi.isAfter(LocalDate.parse(o.fine))

    /** La lettura di oggi è dovuta se la cosa è in corso e oggi non c'è ancora. La prima volta si legge subito. */
    fun dovuta(o: Osservazione, letture: List<Lettura>, oggi: LocalDate) =
        inCorso(o, oggi) && letture.none { it.osservazioneId == o.id && it.giorno == oggi.toString() }

    fun daChiudere(o: Osservazione, oggi: LocalDate) = o.chiusa == null && oggi.isAfter(LocalDate.parse(o.fine))

    fun giorno(o: Osservazione, oggi: LocalDate): String {
        val totale = ChronoUnit.DAYS.between(LocalDate.parse(o.inizio), LocalDate.parse(o.fine)).toInt() + 1
        val n = (ChronoUnit.DAYS.between(LocalDate.parse(o.inizio), oggi).toInt() + 1).coerceIn(1, totale)
        return "giorno $n di $totale"
    }

    /** La domanda del giorno: la prima volta anche lo sguardo indietro, se è stato chiesto. */
    fun domandaDelGiorno(o: Osservazione, prima: Boolean) =
        if (prima && o.prima.isNotBlank()) "${o.domanda}\nIn più, solo questa volta: ${o.prima}" else o.domanda

    /** Come lo Shell le vede nel prompt: in corso, con l'ultima lettura; e i resoconti che il Ghost non ha ancora visto. */
    fun perLoShell(osservazioni: List<Osservazione>, letture: List<Lettura>, oggi: LocalDate): String = buildString {
        osservazioni.filter { it.chiusa == null }.forEach { o ->
            val ultima = letture.filter { it.osservazioneId == o.id }.maxByOrNull { it.istante }
            appendLine("- ${o.cosa} (${giorno(o, oggi)}, fino al ${o.fine}): " + (ultima?.let { "ultima lettura ${it.giorno}: ${it.testo.lines().filter { r -> r.isNotBlank() }.take(3).joinToString(" / ")}" } ?: "nessuna lettura ancora"))
        }
        osservazioni.filter { it.chiusa != null && !it.visto && it.resoconto.isNotBlank() }.forEach { o ->
            appendLine("- RESOCONTO NON ANCORA VISTO dal Ghost: ${o.cosa}. Alla prima occasione diglielo in una riga e indica lo Specchio, dove lo trova intero: ${o.resoconto.lines().firstOrNull().orEmpty()}")
        }
    }.trimEnd()

    val SISTEMA_RESOCONTO = "Sei lo Shell. Hai seguito una cosa per qualche giorno, una lettura al giorno con le fonti. Scrivi il " +
        "resoconto per la persona: come è andata dall'inizio alla fine, i numeri con la loro data, cosa è cambiato, cosa resta incerto. " +
        "Usa solo le letture qui sotto, niente di tuo. Al massimo 180 parole, in italiano, righe corte."

    fun richiestaResoconto(o: Osservazione, letture: List<Lettura>) =
        "Seguito: ${o.cosa} (dal ${o.inizio} al ${o.fine}). Domanda di ogni giorno: ${o.domanda}\n\nLetture:\n" +
            letture.sortedBy { it.istante }.joinToString("\n\n") { "— ${it.giorno}:\n${it.testo}" }
}
