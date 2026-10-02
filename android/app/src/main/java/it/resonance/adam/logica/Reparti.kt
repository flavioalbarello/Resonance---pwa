package it.resonance.adam.logica

// Lo Shell più leggero (02/10/2026). Dal 23/09 al 02/10 il prompt fisso è passato da 13 a 35 mila caratteri: 107 regole e
// 39 strumenti a ogni turno, qualunque cosa chiedesse il Ghost. Un modello medio con tutto davanti sceglie peggio (la sera
// del 02/10: cinque città in una domanda sola, la ricerca a fondo chiesta a parole). Come la PWA dal 12/09 (−72% su
// CAPACITA): un nucleo sempre, e i reparti che il turno chiama. Li sceglie il programma, dalle parole del Ghost e dei
// messaggi appena prima; lo Shell vede l'indice dei reparti e ne apre uno con apri_reparto, oppure chiama direttamente uno
// strumento dell'indice (il programma lo accetta e apre il suo reparto). Il banco (RepartiTest) verifica che ogni
// strumento stia in un reparto solo e che le chiavi non si accendano su frasi che non c'entrano.
enum class Reparto(val etichetta: String, val cosa: String, val strumenti: List<String>, chiavi: String) {
    NUCLEO("nucleo", "sempre aperto",
        listOf("cerca", "leggi_documento", "cerca_nel_web", "leggi_misure", "registra_misura", "scrivi_voce", "modifica_quaderno",
            "scrivi_taccuino", "riprendi_nota", "prendi_consegna"), ""),
    PERCORSI("percorsi", "percorsi, nodi e tappe, documenti, riscrivere il quaderno",
        listOf("crea_percorso", "aggiungi_nodi", "pilastro_nodo", "sposta_nodi", "togli_nodo", "stato_nodo", "salva_documento",
            "modifica_documento", "togli_documento", "aggiorna_quaderno"),
        "percors|nod[oi]\\b|tapp[ae]|brani?\\b|scalett|capitol|document|progett|piano\\b|programma di|studi|eserciz|salva|consolidat|introdott|praticat"),
    RITUALI("rituali", "rituali ed esperimenti",
        listOf("crea_rituale", "spunta_rituale", "proponi_esperimento", "lascia_esperimento"),
        "ritual|abitudin|esperiment|routine|ogni (giorno|sera|mattina)|tutti i giorni|provare a|proviamo a|spunta"),
    AGENDA("agenda", "calendario e posta",
        listOf("leggi_calendario", "crea_evento", "sposta_evento", "togli_evento", "scrivi_mail"),
        "calendar|agenda|impegn|appuntament|evento|riunion|promemoria|ricordami|sposta|annulla|domani|dopodomani|stasera|lunedì|martedì|" +
            "mercoledì|giovedì|venerdì|sabato|domenica|settimana prossima|alle \\d|\\bmail\\b|e-mail|email|scrivi a|scrivere a|manda a|invia"),
    LAVAGNA("lavagna", "appunti usa e getta, la lista della spesa",
        listOf("scrivi_appunto", "modifica_appunto", "spunta_appunto"),
        "lavagna|spesa|lista|comprar|presi?\\b|preso|appunt|da fare|segna|aggiungi"),
    MONDO("ricerca a fondo e Segui", "la ricerca a strati che autorizza il Ghost, e una cosa del mondo seguita per giorni",
        listOf("ricerca_a_fondo", "segui"),
        "a fondo|ricerc|cerca|cercami|trova|fonti|forum|recension|annunc|ristorant|notizi|prezz|quotazion|borsa|segui|aggiornami|ogni giorno|" +
            "quant[ie] |dove |internet|\\bweb\\b|google"),
    SISTEMA("l'app e Adam", "come funziona l'app, temperatura, fondo, lettere all'architetto",
        listOf("regola_temperatura", "movimento_fondo", "scrivi_all_architetto"),
        "\\bapp\\b|resonance|funzion|pulsant|tasto|schermat|setup|impostazion|notific|temperatura|fondo di adam|\\bfondo\\b|architett|lettera|" +
            "come si fa|dove (trovo|si trova|sta)|si può|modell"),
    RIUNIONE("riunione", "consulente e punti fermi, solo a riunione aperta",
        listOf("chiedi_consulente", "punto_fermo"), "consulent|punto fermo|punti fermi");

    val chiave: Regex? = chiavi.takeIf { it.isNotBlank() }?.let { Regex(it, RegexOption.IGNORE_CASE) }

    companion object {
        const val APRI = "apri_reparto"

        fun di(strumento: String): Reparto? = entries.firstOrNull { strumento in it.strumenti }

        /**
         * I reparti del turno. `adesso` è il messaggio a cui si risponde: pesa da solo. `prima` sono gli ultimi messaggi
         * (del Ghost e dello Shell): servono alla continuità («ok, allarga» dopo una ricerca). La riunione aperta porta il suo.
         */
        fun scegli(adesso: String, prima: List<String> = emptyList(), riunione: Boolean = false, allegati: Boolean = false): Set<Reparto> {
            val testi = listOf(adesso) + prima
            return buildSet {
                add(NUCLEO)
                entries.filter { r -> r.chiave != null && testi.any { t -> r.chiave.containsMatchIn(t) } }.forEach { add(it) }
                if (riunione) { add(RIUNIONE); add(SISTEMA) }
                // Una foto o un documento allegato si conserva spesso come documento.
                if (allegati) add(PERCORSI)
            }
        }

        /** L'indice dei reparti chiusi, per il prompt: lo Shell sa che esistono e come aprirli. */
        fun indice(aperti: Set<Reparto>, offerto: (String) -> Boolean): String = buildString {
            val chiusi = entries.filter { it !in aperti && it != RIUNIONE }.mapNotNull { r ->
                r.strumenti.filter(offerto).takeIf { it.isNotEmpty() }?.let { r to it }
            }
            if (chiusi.isEmpty()) return@buildString
            appendLine("REPARTI CHIUSI IN QUESTO TURNO (il programma li apre quando il Ghost ne parla; se ti serve uno strumento di qui, " +
                "chiamalo pure, o usa $APRI col nome del reparto):")
            chiusi.forEach { (r, s) -> appendLine("- ${r.etichetta}: ${r.cosa} (${s.joinToString(", ")})") }
        }.trimEnd()
    }
}
