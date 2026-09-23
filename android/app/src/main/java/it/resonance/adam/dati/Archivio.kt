package it.resonance.adam.dati

import androidx.room.withTransaction
import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Esiti
import it.resonance.adam.logica.Esperimenti
import it.resonance.adam.logica.Giorni
import it.resonance.adam.logica.Importato
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Testi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.LocalDate

data class Esecuzione(val riuscita: Boolean, val ricevuta: String)

data class EsitoImport(val misure: Int, val voci: Int, val percorsi: Int, val documenti: Int, val quaderni: Int, val profilo: Boolean, val scartati: List<String>)

@Serializable
data class Copia(
    val _formato: String = "resonance-apk",
    val _versione: Int = 1,
    val creato: Long,
    val misure: List<Misura>, val voci: List<Voce>, val versioni: List<Versione>,
    val rituali: List<Rituale>, val spunte: List<Spunta>,
    val percorsi: List<Percorso>, val nodi: List<Nodo>, val documenti: List<Documento>,
    val quaderni: List<Quaderno>, val messaggi: List<Messaggio>, val spesa: List<SpesaMese>, val profilo: Profilo?,
    val esperimenti: List<Esperimento> = emptyList(),
)

class Ambiguo(m: String) : Exception(m)

class Archivio(val db: Db) {
    private val ora get() = System.currentTimeMillis()

    // ── Ricerca per nome: esatto normalizzato, poi contenuto; due candidati non si indovinano. ──
    private fun <T> trova(tutti: List<T>, cercato: String, nome: (T) -> String, cosa: String): T {
        val c = Testi.normalizza(cercato)
        tutti.filter { Testi.normalizza(nome(it)) == c }.let { if (it.size == 1) return it.single() }
        val simili = tutti.filter { Testi.normalizza(nome(it)).contains(c) || c.contains(Testi.normalizza(nome(it))) }
        return when (simili.size) {
            1 -> simili.single()
            0 -> throw Ambiguo("nessun $cosa si chiama «$cercato»" + if (tutti.isNotEmpty()) ". Esistono: ${tutti.take(12).joinToString("; ") { nome(it) }}" else "")
            else -> throw Ambiguo("«$cercato» corrisponde a più $cosa: ${simili.joinToString("; ") { nome(it) }}")
        }
    }

    suspend fun percorso(titolo: String) = trova(db.percorsi().elenco().filter { !it.archiviato }, titolo, { it.titolo }, "percorso")
    suspend fun documento(titolo: String) = trova(db.percorsi().elencoDocumenti(), titolo, { it.titolo }, "documento")
    suspend fun rituale(nome: String) = trova(db.rituali().elenco().filter { it.attivo }, nome, { it.nome }, "rituale")

    suspend fun esegui(p: Proposta, oggi: LocalDate = LocalDate.now()): Esecuzione = try {
        db.withTransaction { eseguiDentro(p, oggi) }
    } catch (e: Ambiguo) {
        Esecuzione(false, "Non eseguito: ${e.message}")
    }

    private suspend fun eseguiDentro(p: Proposta, oggi: LocalDate): Esecuzione = when (p) {
        is Proposta.RegistraMisura -> {
            db.misure().sostituisci(Misura(tipo = p.tipo, valore = p.valore, giorno = p.giorno, istante = ora, fonte = "shell", nota = p.nota, legataAlTempo = p.legataAlTempo))
            Esecuzione(true, "Registrato — ${p.tipo.etichetta} ${Esiti.formatta(p.tipo, p.valore)}, ${Giorni.leggibile(p.giorno, oggi)}")
        }
        is Proposta.ScriviVoce -> {
            db.voci().inserisci(Voce(pilastro = p.pilastro, giorno = p.giorno, testo = p.testo, fonte = "shell", creato = ora, aggiornato = ora))
            Esecuzione(true, "Scritto nel diario ${p.pilastro.etichetta}, ${Giorni.leggibile(p.giorno, oggi)}")
        }
        is Proposta.CreaPercorso -> {
            val esistente = db.percorsi().elenco().any { !it.archiviato && Testi.normalizza(it.titolo) == Testi.normalizza(p.titolo) }
            if (esistente) Esecuzione(false, "Non creato: esiste già un percorso «${p.titolo}»")
            else {
                val id = db.percorsi().inserisci(Percorso(pilastro = p.pilastro, titolo = p.titolo, scopo = p.scopo, creato = ora))
                p.nodi.forEachIndexed { i, n -> db.percorsi().inserisciNodo(Nodo(percorsoId = id, etichetta = n, ordine = i)) }
                Esecuzione(true, "Creato il percorso «${p.titolo}» in ${p.pilastro.etichetta}, ${p.nodi.size} nodi")
            }
        }
        is Proposta.SalvaDocumento -> {
            val per = percorso(p.percorso)
            val nodo = p.nodo?.let { n -> trova(db.percorsi().elencoNodi().filter { it.percorsoId == per.id }, n, { it.etichetta }, "nodo") }
            db.percorsi().inserisciDocumento(Documento(percorsoId = per.id, nodoId = nodo?.id, titolo = p.titolo, testo = p.testo, creato = ora, aggiornato = ora))
            Esecuzione(true, "Salvato «${p.titolo}» (${p.testo.length} caratteri) in «${per.titolo}»" + (nodo?.let { " › ${it.etichetta}" } ?: ""))
        }
        is Proposta.ModificaDocumento -> {
            val d = documento(p.documento)
            when (val r = Testi.applicaModifica(d.testo, p.ancora, p.testo, p.modo)) {
                is Testi.Modifica.Impossibile -> Esecuzione(false, "Non modificato: ${r.motivo}")
                is Testi.Modifica.Fatta -> {
                    salvaTestoDocumento(d, r.testo)
                    Esecuzione(true, "Modificato «${d.titolo}»: ${d.testo.length} → ${r.testo.length} caratteri, versione precedente nello storico")
                }
            }
        }
        is Proposta.AggiornaQuaderno -> {
            aggiornaQuaderno(p.pilastro, p.testo)
            Esecuzione(true, "Quaderno ${p.pilastro.etichetta} riscritto (${p.testo.length} caratteri), versione precedente nello storico")
        }
        is Proposta.ModificaQuaderno -> {
            val attuale = db.quaderni().elenco().find { it.pilastro == p.pilastro }?.testo.orEmpty()
            val esito = if (p.modo == "aggiungi") Testi.Modifica.Fatta(attuale.trimEnd() + "\n" + p.testo)
            else Testi.applicaModifica(attuale, p.ancora, p.testo, p.modo)
            when (val r = esito) {
                is Testi.Modifica.Impossibile -> Esecuzione(false, "Quaderno ${p.pilastro.etichetta} non modificato: ${r.motivo}")
                is Testi.Modifica.Fatta -> {
                    // Togliere una frase non deve lasciare righe vuote doppie dove stava.
                    val pulito = r.testo.replace(Regex("\n{3,}"), "\n\n").trim()
                    aggiornaQuaderno(p.pilastro, pulito)
                    Esecuzione(true, "Quaderno ${p.pilastro.etichetta} modificato: ${attuale.length} → ${pulito.length} caratteri, versione precedente nello storico")
                }
            }
        }
        is Proposta.CreaRituale -> {
            db.rituali().inserisci(Rituale(nome = p.nome, pilastro = p.pilastro, criterio = p.criterio, creato = ora))
            Esecuzione(true, "Creato il rituale «${p.nome}»" + (p.criterio?.let { ", si spunta da solo quando $it" } ?: ""))
        }
        is Proposta.SpuntaRituale -> {
            val r = rituale(p.nome)
            db.rituali().spunta(Spunta(r.id, p.giorno, "shell", ora))
            Esecuzione(true, "«${r.nome}» segnato come tenuto, ${Giorni.leggibile(p.giorno, oggi)}")
        }
        is Proposta.StatoDelNodo -> {
            val per = percorso(p.percorso)
            val n = trova(db.percorsi().elencoNodi().filter { it.percorsoId == per.id }, p.nodo, { it.etichetta }, "nodo")
            db.percorsi().aggiornaNodo(n.copy(stato = p.stato))
            Esecuzione(true, "«${per.titolo}» › ${n.etichetta}: ${n.stato.etichetta} → ${p.stato.etichetta}")
        }
        is Proposta.ApriEsperimento -> {
            val tutti = db.esperimenti().elenco()
            val aperti = Esperimenti.aperti(tutti)
            // L'archivio ricontrolla: fra la proposta e la conferma può esserne stato aperto un altro.
            when {
                aperti.size >= Esperimenti.APERTI_MASSIMI -> Esecuzione(false, "Non aperto: ci sono già ${aperti.size} esperimenti aperti")
                aperti.any { it.tipo == p.tipo } -> Esecuzione(false, "Non aperto: c'è già un esperimento aperto su ${Esperimenti.nomeMisura(p.tipo)}")
                else -> {
                    val base = Esperimenti.partenza(db.misure().dal(oggi.minusDays(p.giorni.toLong()).toString()), p.tipo, oggi, p.giorni)
                    if (base == null) Esecuzione(false, "Non aperto: per ${Esperimenti.nomeMisura(p.tipo)} nei ${p.giorni} giorni prima ci sono meno di 3 giorni di dati. " +
                        "Senza un punto di partenza non c'è confronto: collega i sensori o registra qualche giorno, poi riprova")
                    else {
                        val fine = oggi.plusDays(p.giorni.toLong())
                        db.esperimenti().inserisci(Esperimento(titolo = p.titolo, tipo = p.tipo, direzione = p.direzione, soglia = p.soglia,
                            giorni = p.giorni, inizio = oggi.toString(), fine = fine.toString(), base = base, origine = p.origine, creato = ora))
                        Esecuzione(true, "Esperimento aperto: «${p.titolo}», ${p.giorni} giorni, fino a ${Giorni.leggibile(fine.minusDays(1).toString(), oggi)}. " +
                            "Partenza congelata: ${Esperimenti.nomeMisura(p.tipo)} ${Esiti.formatta(p.tipo, base)}")
                    }
                }
            }
        }
        is Proposta.LasciaEsperimento -> {
            val e = trova(Esperimenti.aperti(db.esperimenti().elenco()), p.titolo, { it.titolo }, "esperimento aperto")
            db.esperimenti().aggiorna(e.copy(stato = StatoEsperimento.ABBANDONATO, chiuso = ora, nota = p.motivo))
            db.voci().inserisci(Voce(pilastro = Pilastro.ADAM, giorno = oggi.toString(), fonte = "esperimento", creato = ora, aggiornato = ora,
                testo = "Esperimento lasciato prima della fine: «${e.titolo}»" + (if (p.motivo.isNotBlank()) " — ${p.motivo}" else "") + "."))
            Esecuzione(true, "Esperimento «${e.titolo}» lasciato. Traccia nel diario di Adam")
        }
        // Calendario e posta stanno fuori dall'archivio: li esegue il Mondo (cervello/Mondo.kt).
        is Proposta.CreaEvento, is Proposta.SpostaEvento, is Proposta.TogliEvento, is Proposta.ScriviMail ->
            Esecuzione(false, "Non eseguito: calendario e posta non sono nell'archivio")
    }

    // ── L'anello: alla scadenza confronta il programma, e la traccia resta nel diario di Adam ──
    suspend fun chiudiScaduti(oggi: LocalDate = LocalDate.now()): List<Esperimento> = db.withTransaction {
        val scaduti = Esperimenti.scaduti(db.esperimenti().elenco(), oggi)
        if (scaduti.isEmpty()) return@withTransaction emptyList()
        val misure = db.misure().dal(scaduti.minOf { it.inizio })
        scaduti.map { e ->
            val finale = Esperimenti.misura(misure, e.tipo, LocalDate.parse(e.inizio), LocalDate.parse(e.fine))
            val chiuso = e.copy(stato = StatoEsperimento.CHIUSO, finale = finale, esito = Esperimenti.esito(e.base, finale, e.direzione, e.soglia), chiuso = ora)
            db.esperimenti().aggiorna(chiuso)
            db.voci().inserisci(Voce(pilastro = Pilastro.ADAM, giorno = oggi.toString(), testo = Esperimenti.traccia(chiuso), fonte = "esperimento", creato = ora, aggiornato = ora))
            chiuso
        }
    }

    // ── Legge 14: ogni sovrascrittura lascia la versione precedente ──
    suspend fun salvaTestoDocumento(d: Documento, nuovo: String) {
        if (nuovo == d.testo) return
        db.versioni().inserisci(Versione(entita = "documento", idEntita = d.id, testo = d.testo, sostituitoIl = ora))
        db.percorsi().aggiornaDocumento(d.copy(testo = nuovo, aggiornato = ora))
    }

    suspend fun aggiornaQuaderno(pilastro: Pilastro, testo: String) {
        val vecchio = db.quaderni().elenco().find { it.pilastro == pilastro }
        if (vecchio != null) {
            if (vecchio.testo == testo) return
            db.versioni().inserisci(Versione(entita = "quaderno", idEntita = pilastro.ordinal.toLong(), testo = vecchio.testo, sostituitoIl = ora))
        }
        db.quaderni().salva(Quaderno(pilastro, testo, ora))
    }

    suspend fun modificaVoce(v: Voce, nuovo: String) {
        if (nuovo == v.testo) return
        db.withTransaction {
            db.versioni().inserisci(Versione(entita = "voce", idEntita = v.id, testo = v.testo, sostituitoIl = ora))
            db.voci().aggiorna(v.copy(testo = nuovo, aggiornato = ora))
        }
    }

    suspend fun aggiungiMisura(tipo: TipoMisura, valore: Double, giorno: String, nota: String = "", legataAlTempo: Boolean? = null) {
        db.misure().sostituisci(Misura(tipo = tipo, valore = valore, giorno = giorno, istante = ora, fonte = "manuale", nota = nota, legataAlTempo = legataAlTempo))
    }

    suspend fun scriviVoce(pilastro: Pilastro, testo: String, giorno: String) {
        db.voci().inserisci(Voce(pilastro = pilastro, giorno = giorno, testo = testo, fonte = "manuale", creato = ora, aggiornato = ora))
    }

    suspend fun alternaSpunta(r: Rituale, giorno: String, tenuto: Boolean) {
        if (tenuto) db.rituali().togli(r.id, giorno) else db.rituali().spunta(Spunta(r.id, giorno, "manuale", ora))
    }

    // ── Strumenti di lettura dello Shell: restituiscono testo, mai inventato ──
    suspend fun leggiDocumento(titolo: String): String = try {
        val d = documento(titolo)
        val per = db.percorsi().elenco().find { it.id == d.percorsoId }?.titolo ?: "?"
        val tetto = 12000
        val corpo = if (d.testo.length > tetto) d.testo.take(tetto) + "\n[…tagliato: il documento ha ${d.testo.length} caratteri, qui i primi $tetto]" else d.testo
        "Documento «${d.titolo}» (percorso «$per», ${d.testo.length} caratteri):\n$corpo"
    } catch (e: Ambiguo) { e.message ?: "non trovato" }

    suspend fun cerca(testo: String): String {
        val parole = Testi.normalizza(testo).split(" ").filter { it.length > 2 }
        if (parole.isEmpty()) return "Ricerca vuota."
        fun colpisce(t: String) = Testi.normalizza(t).let { n -> parole.all { it in n } }
        val righe = mutableListOf<String>()
        db.voci().elenco().filter { colpisce(it.testo) }.sortedByDescending { it.giorno }.take(8)
            .forEach { righe += "[diario ${it.pilastro.etichetta} ${it.giorno}] ${Testi.corto(it.testo, 300)}" }
        db.percorsi().elencoDocumenti().filter { colpisce(it.titolo + " " + it.testo) }.take(6)
            .forEach { righe += "[documento «${it.titolo}»] ${Testi.corto(it.testo, 300)}" }
        db.quaderni().elenco().filter { colpisce(it.testo) }
            .forEach { righe += "[quaderno ${it.pilastro.etichetta}] ${Testi.corto(it.testo, 300)}" }
        return if (righe.isEmpty()) "Nessun risultato per «$testo» nel diario, nei documenti e nei quaderni."
        else righe.joinToString("\n")
    }

    suspend fun leggiMisure(tipo: TipoMisura, giorni: Int, oggi: LocalDate = LocalDate.now()): String {
        val da = oggi.minusDays(giorni.coerceIn(1, 180).toLong() - 1)
        val serie = Esiti.serieGiornaliera(db.misure().dal(da.toString()), tipo)
        if (serie.isEmpty()) return "${tipo.etichetta}: nessun dato negli ultimi $giorni giorni."
        return "${tipo.etichetta}, un valore per giorno:\n" + serie.joinToString("\n") { "${it.giorno}: ${Esiti.formatta(tipo, it.valore)}" }
    }

    // ── Spesa ──
    suspend fun registraCosto(mese: String, dollari: Double) {
        val s = db.spesa().di(mese) ?: SpesaMese(mese, 0.0, 0)
        db.spesa().salva(s.copy(dollari = s.dollari + dollari, chiamate = s.chiamate + 1))
    }

    // ── Import dalla PWA: idempotente grazie a idEsterno ──
    suspend fun importa(i: Importato): EsitoImport = db.withTransaction {
        var misure = 0; var voci = 0; var percorsi = 0; var documenti = 0; var quaderni = 0
        i.misure.forEach { if (db.misure().inserisciSeNuova(it) > 0) misure++ }
        i.voci.forEach { if (db.voci().inserisci(it) > 0) voci++ }
        for (pi in i.percorsi) {
            val id = db.percorsi().inserisci(pi.percorso)
            if (id <= 0) continue
            percorsi++
            val mappa = pi.nodi.associate { it.idPwa to db.percorsi().inserisciNodo(it.nodo.copy(percorsoId = id)) }
            pi.documenti.forEach { d ->
                db.percorsi().inserisciDocumento(d.documento.copy(percorsoId = id, nodoId = d.idNodoPwa?.let { mappa[it] }))
                documenti++
            }
        }
        val esistenti = db.quaderni().elenco().associateBy { it.pilastro }
        i.quaderni.forEach { q ->
            if (esistenti[q.pilastro]?.testo.isNullOrBlank()) { db.quaderni().salva(q); quaderni++ }
        }
        val profiloImportato = i.profilo != null && (db.profilo().leggi()?.let { it.nome.isBlank() && it.vincoli.isBlank() } ?: true)
        if (profiloImportato) db.profilo().salva(i.profilo!!)
        // Un profilo già scritto non si tocca, tranne i nomi protetti se mancano: chi ha importato prima della V2.1 li riceve.
        else db.profilo().leggi()?.let { attuale ->
            val nomi = i.profilo?.nomiProtetti.orEmpty()
            if (attuale.nomiProtetti.isBlank() && nomi.isNotBlank()) db.profilo().salva(attuale.copy(nomiProtetti = nomi))
        }
        EsitoImport(misure, voci, percorsi, documenti, quaderni, profiloImportato, i.scartati)
    }

    // ── Copia completa e ripristino ──
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    suspend fun copia(): String = json.encodeToString(Copia.serializer(), Copia(
        creato = ora,
        misure = db.misure().elenco(), voci = db.voci().elenco(), versioni = db.versioni().elenco(),
        rituali = db.rituali().elenco(), spunte = db.rituali().elencoSpunte(),
        percorsi = db.percorsi().elenco(), nodi = db.percorsi().elencoNodi(), documenti = db.percorsi().elencoDocumenti(),
        quaderni = db.quaderni().elenco(), messaggi = db.messaggi().elenco(), spesa = db.spesa().elenco(), profilo = db.profilo().leggi(),
        esperimenti = db.esperimenti().elenco(),
    ))

    fun eUnaCopia(testo: String) = testo.contains("\"_formato\":\"resonance-apk\"") || testo.contains("\"_formato\": \"resonance-apk\"")

    // Ripristino: riporta lo stato della copia, non fonde. Chiamarlo su un'app già usata la sostituisce.
    suspend fun ripristina(testo: String): Int {
        val c = json.decodeFromString(Copia.serializer(), testo)
        db.withTransaction {
            listOf("misure", "voci", "versioni", "rituali", "spunte", "percorsi", "nodi", "documenti", "quaderni", "messaggi", "spesa", "profilo", "esperimenti")
                .forEach { db.openHelper.writableDatabase.execSQL("DELETE FROM $it") }
            c.misure.forEach { db.misure().sostituisci(it) }
            c.voci.forEach { db.voci().inserisci(it) }
            c.versioni.forEach { db.versioni().inserisci(it) }
            c.rituali.forEach { db.rituali().inserisci(it) }
            c.spunte.forEach { db.rituali().spunta(it) }
            c.percorsi.forEach { db.percorsi().inserisci(it) }
            c.nodi.forEach { db.percorsi().inserisciNodo(it) }
            c.documenti.forEach { db.percorsi().inserisciDocumento(it) }
            c.quaderni.forEach { db.quaderni().salva(it) }
            c.messaggi.forEach { db.messaggi().inserisci(it) }
            c.spesa.forEach { db.spesa().salva(it) }
            c.profilo?.let { db.profilo().salva(it) }
            c.esperimenti.forEach { db.esperimenti().inserisci(it) }
        }
        return c.misure.size + c.voci.size + c.documenti.size
    }

    fun proposta(m: Messaggio): Proposta? = m.proposta?.let { runCatching { Azioni.decodifica(it) }.getOrNull() }
}
