package it.resonance.adam.logica

// Cosa sa fare l'app oggi, per area: entra nel prompt con la versione (richiesta dello Shell, 25/09/2026). Lo Shell
// scopriva funzioni già costruite solo quando il Ghost gliele diceva, e chiedeva all'architetto cose che c'erano.
// È l'erede dell'array CAPACITA della PWA. Il banco (CapacitaTest) verifica che ogni strumento compaia qui e che qui
// non ci siano strumenti inesistenti: una funzione nuova senza la sua riga non passa i test.
object Capacita {
    data class Area(val nome: String, val cosa: String, val strumenti: List<String>)

    val AREE = listOf(
        Area("Tutti i pilastri (BIO, AIR, VIDYA, ADAM)",
            "diario, quaderno (memoria che leggi a ogni turno), percorsi con nodi su due livelli e documenti, rituali, esperimenti",
            listOf("scrivi_voce", "modifica_quaderno", "aggiorna_quaderno", "crea_percorso", "aggiungi_nodi", "sposta_nodi", "stato_nodo",
                "togli_nodo", "salva_documento", "modifica_documento", "togli_documento", "leggi_documento", "cerca", "crea_rituale", "spunta_rituale",
                "proponi_esperimento", "lascia_esperimento")),
        Area("BIO", "peso, sonno, passi, FC a riposo, allenamenti; anche da Health Connect, letti da soli ogni 6 ore",
            listOf("registra_misura", "leggi_misure")),
        Area("AIR", "entrate, divise fra legate al tempo e non (l'esito del pilastro sono le seconde)", listOf("registra_misura", "leggi_misure")),
        Area("VIDYA", "minuti di pratica, opere finite", listOf("registra_misura", "leggi_misure")),
        Area("ADAM", "percorsi che attraversano i pilastri (il pilastro sta sui nodi di primo livello); il TUO taccuino; FONDO; la tua voce sulla temperatura; LETTERE; le TUE consegne (una promessa con una forma che il programma verifica, e un turno di lavoro tuo il giorno prima)",
            listOf("pilastro_nodo", "scrivi_taccuino", "riprendi_nota", "movimento_fondo", "regola_temperatura", "scrivi_all_architetto", "prendi_consegna")),
        Area("Lavagna del Ghost", "appunti usa e getta con righe spuntabili (la lista della spesa); finiti o scaduti escono dal tuo prompt; si allegano in PDF alle mail (scrivi_mail con allegato)",
            listOf("scrivi_appunto", "modifica_appunto", "spunta_appunto")),
        Area("Mondo (con la conferma del Ghost)", "calendario del telefono; mail come bozza che invia il Ghost; la ricerca web con le fonti vere (subito, senza conferma); Segui: una cosa del mondo letta ogni giorno per N giorni, con notifica, riga sullo Specchio e il tuo resoconto alla fine",
            listOf("cerca_nel_web", "segui", "leggi_calendario", "crea_evento", "sposta_evento", "togli_evento", "scrivi_mail")),
        Area("Riunione a tre", "il consulente esterno (ricerca web), convocato dal Ghost: le domande di tutti in una cartella, partono insieme al suo Manda",
            listOf("chiedi_consulente", "punto_fermo")),
    )

    // Ciò che il Ghost fa dall'app senza di te: saperlo evita di proporgli cose che ha già a portata di dito.
    val SOLO_GHOST = listOf(
        "voce: dettatura e modalità auto a più frasi (il messaggio parte dopo una pausa o con «invia»; in auto lo schermo resta acceso); «🔊 Ascolta» sotto ogni tua risposta",
        "allegati: foto, immagini, PDF, docx, testo",
        "temperatura forzata per UN messaggio (＋ → più preciso / più libero); di norma la decide il compito",
        "Setup → Come si regola lo Shell (in fondo): temperature per compito, modelli che la rifiutano, esiti dei turni, spesa del mese",
        "Memoria, in ogni pilastro: il quaderno, che il Ghost rilegge e corregge; in Adam, sotto, le tue ipotesi del taccuino. Storia, in Adam: il diario per pilastro, con le tue consegne in cima",
        "battito mattino, sera e domenica, con registro e «Prova ora» in Setup",
        "nodi: tocco per avanzare lo stato, pressione lunga per spostare, dare il pilastro, togliere",
        "riunione a tre (Adam → Lettere → Apri riunione): ogni scambio col Ghost va nel verbale, l'architetto legge e interviene; un suo intervento che comincia con «→ Shell» ti fa rispondere da solo, al massimo 3 giri senza il Ghost; «Ritira ora» nella fascia; alla chiusura scrivi tu il verbale (senza strumenti)",
        "gli interventi dell'architetto (riunione e lettere) si ascoltano con «🔊 Ascolta», e in auto si leggono da soli",
        "Adam → Storia: le tue consegne aperte e chiuse; il Ghost può lasciarne una",
        "in riunione, sotto la fascia: «Convoca consulente» (poi la cartella delle domande, Manda, Congeda; tetto di ${Consulente.TETTO_INVII} invii che il Ghost alza; l'architetto gli scrive con «→ Consulente») e «Perturba» (Balthasar: domanda sul tavolo e intensità leggera, media o profonda, poi una tua risposta senza strumenti a temperatura alta)",
        "documenti: il Ghost li toglie con la pressione lunga (o Togli dentro il documento); i tolti stanno in fondo al percorso e si rimettono; da lì solo il Ghost può eliminarli per sempre (tu no)",
        "Adam → Lavagna: spunta col tocco, pressione lunga per correggere o togliere una voce, campo «Aggiungi una voce» in fondo a ogni appunto, Copia (righe da fare, per una nota condivisa come Keep), Condividi, Fissa nelle notifiche, Tieni (diventa documento), + Appunto a mano",
        "dalle notifiche, senza aprire l'app: «Rispondi» (scritto o dettato) sul battito e sulle tue risposte, e la sera «✓» sui rituali a mano non ancora fatti; ciò che scrive da lì ti arriva come un suo messaggio normale",
        "il tour del primo avvio (Setup → Rivedi il tour): nome, chiave, permessi, il tuo nome (tre proposte tue, sceglie lui), i quattro nomi dei pilastri, una prima domanda",
        "Specchio → Segui: le cose che stai seguendo, col giorno e l'ultima lettura (Tutte le letture, Smetti); finito il periodo, il tuo resoconto resta lì in cima finché non tocca Visto",
        "Specchio → «Sono via» / «Sono tornato»: mentre il Ghost è via il battito tace, i rituali sono in pausa (non contano come saltati), consegne ed esperimenti slittano al ritorno dei giorni di assenza; al ritorno un riepilogo in chat",
        "in riunione: «↩ Rispondi» sotto un intervento dell'architetto (e i messaggi che cominciano con «architetto» senza nominarti) vanno nel verbale senza chiamarti; l'architetto può interrogare Balthasar con «→ Balthasar»",
        "chat: si vedono gli ultimi ${it.resonance.adam.ui.FINESTRA} messaggi; «Mostra i messaggi precedenti» in cima",
        "Setup → Calendario e posta: il Ghost sceglie due calendari, uno per le cose di Adam e uno per i suoi impegni (crea_evento con per = adam o personale); senza scelta lì non si scrive. Il mittente delle mail non si può imporre: lo indica per controllarlo nella bozza",
    )

    fun strumenti(): Set<String> = AREE.flatMap { it.strumenti }.toSet()

    // Le righe del Ghost che esistono solo con l'architetto (logica/Edizione.kt): si riconoscono dal contenuto.
    private val DELLO_SVILUPPO = Regex("riunione|architetto|consulente|Balthasar|Adam → Fondo", RegexOption.IGNORE_CASE)

    /** Le aree che lo Shell ha davvero in questa edizione: nell'app base mancano architetto e riunione. */
    fun aree(sviluppatore: Boolean = Edizione.sviluppatore): List<Area> = AREE.map { a ->
        a.copy(cosa = a.cosa.replace("LETTERE; ", if (sviluppatore) "le lettere all'architetto; " else "")
                .replace("FONDO; ", if (sviluppatore) "il fondo di Adam; " else ""),
            strumenti = a.strumenti.filter { Edizione.offerto(it, sviluppatore) })
    }.filter { it.strumenti.isNotEmpty() }

    fun soloGhost(sviluppatore: Boolean = Edizione.sviluppatore) = if (sviluppatore) SOLO_GHOST else SOLO_GHOST.filterNot { DELLO_SVILUPPO.containsMatchIn(it) }

    fun testo(versione: String, sviluppatore: Boolean = Edizione.sviluppatore): String = buildString {
        appendLine("L'APP OGGI (versione ${versione.ifBlank { "?" }}): cosa puoi fare, per area")
        aree(sviluppatore).forEach { appendLine("- ${it.nome}: ${it.cosa}. Strumenti: ${it.strumenti.joinToString(", ")}") }
        appendLine("Il Ghost, da solo:")
        soloGhost(sviluppatore).forEach { appendLine("- $it") }
    }.trimEnd()
}
