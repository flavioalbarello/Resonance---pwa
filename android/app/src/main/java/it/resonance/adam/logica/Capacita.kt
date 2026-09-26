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
                "togli_nodo", "salva_documento", "modifica_documento", "leggi_documento", "cerca", "crea_rituale", "spunta_rituale",
                "proponi_esperimento", "lascia_esperimento")),
        Area("BIO", "peso, sonno, passi, FC a riposo, allenamenti; anche da Health Connect, letti da soli ogni 6 ore",
            listOf("registra_misura", "leggi_misure")),
        Area("AIR", "entrate, divise fra legate al tempo e non (l'esito del pilastro sono le seconde)", listOf("registra_misura", "leggi_misure")),
        Area("VIDYA", "minuti di pratica, opere finite", listOf("registra_misura", "leggi_misure")),
        Area("ADAM", "percorsi che attraversano i pilastri (il pilastro sta sui nodi di primo livello); il TUO taccuino; il fondo di Adam; la tua voce sulla temperatura; le lettere all'architetto; le TUE consegne (una promessa con una forma che il programma verifica, e un turno di lavoro tuo il giorno prima)",
            listOf("pilastro_nodo", "scrivi_taccuino", "riprendi_nota", "movimento_fondo", "regola_temperatura", "scrivi_all_architetto", "prendi_consegna")),
        Area("Mondo (con la conferma del Ghost)", "calendario del telefono; mail come bozza che invia il Ghost",
            listOf("leggi_calendario", "crea_evento", "sposta_evento", "togli_evento", "scrivi_mail")),
    )

    // Ciò che il Ghost fa dall'app senza di te: saperlo evita di proporgli cose che ha già a portata di dito.
    val SOLO_GHOST = listOf(
        "voce: dettatura e modalità auto a più frasi (il messaggio parte dopo una pausa o con «invia»; in auto lo schermo resta acceso); «🔊 Ascolta» sotto ogni tua risposta",
        "allegati: foto, immagini, PDF, docx, testo",
        "temperatura forzata per UN messaggio (＋ → più preciso / più libero); di norma la decide il compito",
        "Adam → Regolazione: temperature per compito, modelli che la rifiutano, esiti dei turni, spesa del mese",
        "battito mattino, sera e domenica, con registro e «Prova ora» in Setup",
        "nodi: tocco per avanzare lo stato, pressione lunga per spostare, dare il pilastro, togliere",
        "riunione a tre (Adam → Lettere → Apri riunione): ogni scambio col Ghost va nel verbale, l'architetto legge e interviene; un suo intervento che comincia con «→ Shell» ti fa rispondere da solo, al massimo 3 giri senza il Ghost; «Ritira ora» nella fascia; alla chiusura scrivi tu il verbale (senza strumenti)",
        "gli interventi dell'architetto (riunione e lettere) si ascoltano con «🔊 Ascolta», e in auto si leggono da soli",
        "Adam → Consegne: le tue consegne aperte e chiuse; il Ghost può lasciarne una",
    )

    fun strumenti(): Set<String> = AREE.flatMap { it.strumenti }.toSet()

    fun testo(versione: String): String = buildString {
        appendLine("L'APP OGGI (versione ${versione.ifBlank { "?" }}): cosa puoi fare, per area")
        AREE.forEach { appendLine("- ${it.nome}: ${it.cosa}. Strumenti: ${it.strumenti.joinToString(", ")}") }
        appendLine("Il Ghost, da solo:")
        SOLO_GHOST.forEach { appendLine("- $it") }
    }.trimEnd()
}
