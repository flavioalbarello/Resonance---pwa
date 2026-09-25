package it.resonance.adam.ui

import it.resonance.adam.logica.Ritmo

import it.resonance.adam.logica.Battito

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import it.resonance.adam.Impostazioni
import androidx.work.WorkInfo
import androidx.work.WorkManager
import it.resonance.adam.battito.Battiti
import it.resonance.adam.battito.TurnoWorker
import kotlinx.coroutines.flow.first
import it.resonance.adam.cervello.Shell
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.dati.Voce
import android.net.Uri
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Allegato
import it.resonance.adam.mondo.Allegatore
import java.io.File
import it.resonance.adam.logica.ImportPwa
import it.resonance.adam.logica.Istantanea
import it.resonance.adam.logica.Stabilita
import it.resonance.adam.mondo.MondoAndroid
import it.resonance.adam.sensi.Sensi
import it.resonance.adam.voce.Ascolto
import it.resonance.adam.voce.ComandiVocali
import it.resonance.adam.voce.Parlato
import it.resonance.adam.voce.Segnale
import it.resonance.adam.voce.Raccolta
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

enum class Schermata(val etichetta: String) { SPECCHIO("Specchio"), SHELL("Shell"), ADAM("Adam"), BIO("Bio"), AIR("Air"), VIDYA("Vidya"), SETUP("Setup") }

enum class Ascolta { SPENTO, DETTATURA, AUTO }

class Adam(app: Application) : AndroidViewModel(app) {
    val db = Db.di(app)
    val archivio = Archivio(db)
    val impostazioni = Impostazioni(app)
    val sensi = Sensi(app)
    val mondo = MondoAndroid(app)
    val allegatore = Allegatore(app)
    private val shell = Shell(archivio, impostazioni, mondo = mondo)

    private fun <T> Flow<List<T>>.stato(): StateFlow<List<T>> = stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val misure = db.misure().tutte().stato()
    val voci = db.voci().tutte().stato()
    val rituali = db.rituali().attivi().stato()
    val spunte = db.rituali().spunte().stato()
    val percorsi = db.percorsi().attivi().stato()
    val nodi = db.percorsi().nodi().stato()
    val documenti = db.percorsi().documenti().stato()
    val quaderni = db.quaderni().tutti().stato()
    val esperimenti = db.esperimenti().tutti().stato()
    val messaggi = db.messaggi().tutti().stato()
    val turni = db.turni().osserva(300).stato()
    val note = db.taccuino().tutte().stato()
    val movimenti = db.fondo().tutti().stato()
    val lettere = db.lettere().tutte().stato()
    val risposte = db.lettere().tutteLeRisposte().stato()
    val profilo: StateFlow<Profilo?> = db.profilo().osserva().stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val spesaMese = db.spesa().osserva(YearMonth.now().toString()).stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val istantanea: StateFlow<Istantanea> = combine(
        combine(misure, rituali, spunte, profilo) { m, r, s, p -> Quattro(m, r, s, p) },
        combine(percorsi, nodi, documenti, quaderni) { p, n, d, q -> Quattro(p, n, d, q) },
    ) { a, b -> Istantanea(LocalDate.now(), a.d, a.a, a.b, a.c, b.a, b.b, b.c, b.d) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Istantanea(LocalDate.now(), null, emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList()))

    private data class Quattro<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

    var schermata by mutableStateOf(Schermata.SPECCHIO)
    var percorsoAperto by mutableStateOf<Long?>(null)
    var documentoAperto by mutableStateOf<Long?>(null)
    var input by mutableStateOf("")
    var parziale by mutableStateOf("")
    var ascolta by mutableStateOf(Ascolta.SPENTO)
    var pensa by mutableStateOf(false)
    var avviso by mutableStateOf<String?>(null)
    var statoSensi by mutableStateOf("")
    var agenda by mutableStateOf<AgendaLetta>(AgendaLetta.NonLetta)
    val inAllegato = mutableStateListOf<Allegato>()
    var preparo by mutableIntStateOf(0)

    // `temporaneo`: la foto grande della fotocamera, da buttare dopo averne fatto la copia ridotta.
    fun aggiungiAllegato(uri: Uri, temporaneo: File? = null) = viewModelScope.launch {
        preparo++
        allegatore.prepara(uri)
            .onSuccess { inAllegato += it; if (schermata != Schermata.SHELL) vai(Schermata.SHELL) }
            .onFailure { avviso = "Allegato non letto: ${it.message}" }
        temporaneo?.delete()
        preparo--
    }

    fun togliAllegato(a: Allegato) {
        inAllegato.remove(a)
        a.immagini.forEach { File(it).delete() }
    }

    fun vai(s: Schermata) {
        schermata = s; percorsoAperto = null; documentoAperto = null
        if (s == Schermata.SPECCHIO) leggiAgenda()
    }

    // L'anello si chiude anche aprendo l'app: un esperimento scaduto si confronta subito.
    fun chiudiScaduti() = viewModelScope.launch {
        val chiusi = archivio.chiudiScaduti()
        if (chiusi.isNotEmpty()) avviso = chiusi.joinToString(" · ") { "«${it.titolo}»: ${it.esito?.etichetta}" }
    }

    fun lasciaEsperimento(e: it.resonance.adam.dati.Esperimento) = viewModelScope.launch {
        avviso = archivio.esegui(it.resonance.adam.logica.Proposta.LasciaEsperimento(e.titolo, "lasciato dallo Specchio")).ricevuta
    }

    // Il Ghost può chiedere la perturbazione quando vuole; il ristagno però lo decide il programma, non la richiesta.
    fun perturbaAdesso() = viewModelScope.launch {
        val motivi = it.resonance.adam.logica.Ristagno.trova(istantanea.value, esperimenti.value)
        if (motivi.isEmpty()) { avviso = "Nei numeri non c'è un ristagno: niente da perturbare. Se vuoi provare comunque qualcosa, chiedilo allo Shell."; return@launch }
        if (pensa) return@launch
        pensa = true
        vai(Schermata.SHELL)
        impostazioni.ultimaPerturbazione = LocalDate.now().toString()
        runCatching { shell.perturba(motivi) }.onFailure { avviso = "Perturbazione non riuscita: ${it.message}" }
        pensa = false
    }

    fun leggiAgenda() = viewModelScope.launch { agenda = mondo.agenda(LocalDate.now(), 2) }

    fun indietro(): Boolean = when {
        documentoAperto != null -> { documentoAperto = null; true }
        percorsoAperto != null -> { percorsoAperto = null; true }
        schermata != Schermata.SPECCHIO -> { schermata = Schermata.SPECCHIO; true }
        else -> false
    }

    // ── Shell ──
    // La risposta la prepara un lavoro di sistema (battito/Turno.kt): continua a schermo spento e ad app chiusa.
    // `pensa` segue quel lavoro, anche se l'app è stata riaperta nel frattempo.
    private val lavori = runCatching { WorkManager.getInstance(app) }.getOrNull()

    init {
        lavori?.let { wm ->
            viewModelScope.launch {
                wm.getWorkInfosForUniqueWorkFlow(TurnoWorker.NOME).collect { infos -> pensa = infos.any { !it.state.isFinished } }
            }
        }
    }

    fun invia(testo: String = input) {
        val allegati = inAllegato.toList()
        val t = testo.trim().ifEmpty { if (allegati.isNotEmpty()) "Guarda l'allegato." else "" }
        if (t.isEmpty() || pensa || preparo > 0) return
        input = ""
        inAllegato.clear()
        pensa = true
        // La forzatura vale per questo messaggio e basta: poi la temperatura torna quella del compito.
        val f = forza
        forza = null
        viewModelScope.launch {
            val id = shell.registra(t, allegati)
            val wm = lavori
            if (wm == null) {
                val esito = shell.rispondi(id, f)
                pensa = false
                if (ascolta == Ascolta.AUTO) rispondiAVoce(esito)
                return@launch
            }
            val r = TurnoWorker.accoda(getApplication(), id, f)
            val fine = wm.getWorkInfoByIdFlow(r.id).first { it?.state?.isFinished == true }
            if (ascolta == Ascolta.AUTO && fine?.state == WorkInfo.State.SUCCEEDED) rispondiAVoce(Shell.Esito(
                fine.outputData.getString(TurnoWorker.TESTO).orEmpty(), fine.outputData.getLongArray(TurnoWorker.PROPOSTE)?.toList().orEmpty()))
        }
    }

    fun conferma(m: Messaggio) = viewModelScope.launch { avviso = shell.conferma(m.id); leggiAgenda() }
    fun rifiuta(m: Messaggio) = viewModelScope.launch { shell.rifiuta(m.id) }

    // ── Voce: dettatura (come Gemini: testo nella casella) e auto (mani libere) ──
    private val parlato by lazy { Parlato(getApplication()) }
    private var silenzi = 0
    private val ascolto by lazy {
        Ascolto(getApplication(),
            parziale = { p -> parziale = p; if (p.isNotBlank()) invioJob?.cancel() },
            finale = { t -> parziale = ""; ricevuto(t) },
            fine = { errore -> finito(errore) },
        )
    }

    // Modalità auto: ciò che il Ghost ha detto finora in questo messaggio. Parte dopo `pausaInvio` secondi di silenzio,
    // o subito con «invia». Prima partiva alla prima pausa del riconoscimento, a metà frase (visto il 25/09).
    var raccolto by mutableStateOf("")
    // Temperatura forzata per il prossimo messaggio soltanto (null = decide il compito).
    var forza by mutableStateOf<it.resonance.adam.cervello.Forzatura?>(null)

    private var invioJob: kotlinx.coroutines.Job? = null
    // Il segmento appena arrivato ha già fatto partire qualcosa (invio, sì/no): chi chiude l'ascolto non lo riaccende.
    private var azione = false

    fun microfonoDisponibile() = ascolto.disponibile()
    fun pausaInvio() = impostazioni.pausaInvio

    fun avviaDettatura() { ferma(); ascolta = Ascolta.DETTATURA; ascolto.avvia() }

    fun avviaAuto() {
        ferma()
        ascolta = Ascolta.AUTO
        silenzi = 0
        schermata = Schermata.SHELL
        ascolto.avvia()
    }

    fun ferma() {
        invioJob?.cancel()
        ascolto.ferma()
        parlato.zitto()
        inLettura = null
        ascolta = Ascolta.SPENTO
        parziale = ""
        // Ciò che era stato detto non si perde: resta nella casella, da inviare o correggere.
        if (raccolto.isNotBlank()) input = listOf(input.trim(), raccolto).filter { it.isNotEmpty() }.joinToString(" ")
        raccolto = ""
    }

    private fun ricevuto(t: String) {
        when (ascolta) {
            Ascolta.DETTATURA -> {
                input = listOf(input.trim(), t).filter { it.isNotEmpty() }.joinToString(" ")
                if (schermata != Schermata.SHELL) vai(Schermata.SHELL)
            }
            Ascolta.AUTO -> {
                silenzi = 0
                invioJob?.cancel()
                // «sì» / «no» da soli, a messaggio vuoto, rispondono alla proposta in attesa.
                if (raccolto.isBlank() && (ComandiVocali.eSi(t) || ComandiVocali.eNo(t))) {
                    azione = true
                    viewModelScope.launch {
                        val inAttesa = db.messaggi().ultimaInAttesa()
                        when {
                            // Nessuna proposta: era una parola del messaggio. Chi ha chiuso l'ascolto è già passato, quindi si riaccende qui.
                            inAttesa == null -> { segmento(t); azione = false; if (ascolta == Ascolta.AUTO && !pensa) ascolto.avvia() }
                            ComandiVocali.eSi(t) -> {
                                db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = t, istante = System.currentTimeMillis()))
                                parla(shell.conferma(inAttesa.id))
                            }
                            else -> {
                                db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = t, istante = System.currentTimeMillis()))
                                shell.rifiuta(inAttesa.id)
                                parla("Annullato.")
                            }
                        }
                    }
                    return
                }
                segmento(t)
            }
            Ascolta.SPENTO -> {}
        }
    }

    private fun segmento(t: String) {
        when (val e = Raccolta.aggiungi(raccolto, t)) {
            is Raccolta.Esito.Invia -> { azione = true; spedisci(e.testo) }
            Raccolta.Esito.Azzera -> { raccolto = ""; Segnale.dai(false) }
            is Raccolta.Esito.Continua -> {
                raccolto = e.testo
                invioJob = viewModelScope.launch {
                    kotlinx.coroutines.delay(impostazioni.pausaInvio * 1000L)
                    if (ascolta == Ascolta.AUTO && !pensa && raccolto.isNotBlank()) spedisci(raccolto)
                }
            }
        }
    }

    private fun spedisci(t: String) {
        invioJob?.cancel()
        raccolto = ""
        parziale = ""
        Segnale.dai(true)
        ascolto.ferma()
        invia(t)
    }

    private fun finito(errore: String?) {
        when (ascolta) {
            // La dettatura continua di frase in frase; si ferma al silenzio lungo del riconoscimento o col tocco.
            Ascolta.DETTATURA -> if (errore == null) ascolto.avvia() else {
                ascolta = Ascolta.SPENTO
                parziale = ""
                if (errore != "silenzio" && errore != "annullato") avviso = "Voce: $errore"
            }
            Ascolta.AUTO -> {
                if (azione) { azione = false; return }
                if (pensa || errore == "annullato") return
                when {
                    errore == null -> ascolto.avvia()
                    raccolto.isNotBlank() -> spedisci(raccolto)
                    errore == "silenzio" && ++silenzi < 3 -> ascolto.avvia()
                    else -> {
                        ascolta = Ascolta.SPENTO
                        avviso = if (errore == "silenzio") "Modalità auto in pausa dopo tre silenzi." else "Modalità auto ferma: $errore"
                    }
                }
            }
            Ascolta.SPENTO -> {}
        }
    }

    // ── Lettura ad alta voce di un messaggio, a richiesta ──
    var inLettura by mutableStateOf<Long?>(null)

    fun leggi(m: Messaggio) {
        if (inLettura == m.id) { parlato.zitto(); inLettura = null; riprendiAuto(); return }
        invioJob?.cancel()
        ascolto.ferma()
        inLettura = m.id
        parlato.parla(m.testo) { inLettura = null; riprendiAuto() }
    }

    private fun riprendiAuto() { if (ascolta == Ascolta.AUTO && !pensa) ascolto.avvia() }

    private suspend fun rispondiAVoce(esito: Shell.Esito) {
        val proposte = esito.proposte.mapNotNull { db.messaggi().per(it)?.testo }
        val testo = buildString {
            if (impostazioni.leggiRisposteInAuto) append(esito.testo)
            if (proposte.isNotEmpty()) append("\nPropongo: ${proposte.joinToString(". ") { it.trimEnd('.') }}. Confermi?")
        }
        parla(testo)
    }

    private fun parla(testo: String) {
        if (ascolta != Ascolta.AUTO) return
        ascolto.ferma()
        parlato.parla(testo) { riprendiAuto() }
    }

    // ── Gesti diretti, senza modello ──
    fun aggiungiMisura(tipo: TipoMisura, valore: Double, giorno: String = LocalDate.now().toString(), legata: Boolean? = null) = viewModelScope.launch {
        if (valore < tipo.minimo || valore > tipo.massimo) { avviso = "${tipo.etichetta}: $valore fuori dall'intervallo plausibile"; return@launch }
        archivio.aggiungiMisura(tipo, valore, giorno, legataAlTempo = legata)
    }
    fun eliminaMisura(id: Long) = viewModelScope.launch { db.misure().elimina(id) }
    fun scriviVoce(p: Pilastro, testo: String) = viewModelScope.launch { archivio.scriviVoce(p, testo, LocalDate.now().toString()) }
    fun modificaVoce(v: Voce, testo: String) = viewModelScope.launch { archivio.modificaVoce(v, testo) }
    fun alternaSpunta(r: Rituale, tenutoOggi: Boolean) = viewModelScope.launch { archivio.alternaSpunta(r, LocalDate.now().toString(), tenutoOggi) }
    fun creaRituale(nome: String, p: Pilastro, criterio: String?) = viewModelScope.launch {
        val c = criterio?.takeIf { it.isNotBlank() }
        if (c != null && Stabilita.leggiCriterio(c) == null) { avviso = "Criterio non leggibile: forma TIPO>=numero (es. PASSI>=7000)"; return@launch }
        db.rituali().inserisci(Rituale(nome = nome.trim(), pilastro = p, criterio = c?.let { Stabilita.leggiCriterio(it).toString() }, creato = System.currentTimeMillis()))
    }
    fun disattivaRituale(r: Rituale) = viewModelScope.launch { db.rituali().aggiorna(r.copy(attivo = false)) }
    fun salvaQuaderno(p: Pilastro, testo: String) = viewModelScope.launch {
        archivio.aggiornaQuaderno(p, testo.trim())
        avviso = if (testo.isBlank()) "Quaderno ${p.etichetta} svuotato: la versione precedente resta nello storico" else "Quaderno ${p.etichetta} salvato"
    }
    fun salvaDocumento(d: Documento, testo: String) = viewModelScope.launch { archivio.salvaTestoDocumento(d, testo); avviso = "Documento salvato" }
    fun togliNodo(n: Nodo) = viewModelScope.launch { avviso = archivio.togliNodo(n) }
    fun pilastroNodo(n: Nodo, p: Pilastro?) = viewModelScope.launch { avviso = archivio.pilastroNodo(n, p) }
    fun senzaTemperatura() = impostazioni.senzaTemperatura
    fun temperatureConfermate() = impostazioni.temperature
    fun ripristinaTemperatura(c: it.resonance.adam.cervello.Compito) = viewModelScope.launch {
        impostazioni.temperature = impostazioni.temperature - c.name
        archivio.scriviVoce(Pilastro.ADAM, "Temperatura per «${c.etichetta}» riportata alla tabella (${c.temperatura}) dal Ghost.", LocalDate.now().toString())
        avviso = "«${c.etichetta}» torna a ${c.temperatura}"
    }
    // Il Ghost toglie una nota dal taccuino: non si cancella, smette di essere letta (Legge 14).
    fun togliNota(n: it.resonance.adam.dati.Nota) = viewModelScope.launch { db.taccuino().aggiorna(n.copy(tolta = true)) }
    fun aggiungiMovimento(tipo: it.resonance.adam.dati.TipoMovimento, importo: Double, motivo: String) = viewModelScope.launch {
        if (importo <= 0.0 || motivo.isBlank()) { avviso = "Serve un importo positivo e un motivo"; return@launch }
        db.fondo().inserisci(it.resonance.adam.dati.Movimento(giorno = LocalDate.now().toString(), tipo = tipo, importo = importo, motivo = motivo.trim(), creato = System.currentTimeMillis()))
    }
    fun cassettaPronta() = it.resonance.adam.cervello.Corrispondenza(archivio, impostazioni).pronta()
    fun controllaLettere() = viewModelScope.launch {
        val posta = it.resonance.adam.cervello.Corrispondenza(archivio, impostazioni)
        if (!posta.pronta()) { avviso = "Cassetta non configurata: Setup → Cassetta delle lettere"; return@launch }
        val spedite = posta.spedisciInSospeso()
        val nuove = posta.ritira()
        nuove.forEach { (l, r) -> db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, testo = "Risposta dell'architetto alla lettera «${l.oggetto}»:\n${r.testo}", istante = System.currentTimeMillis())) }
        avviso = "Spedite $spedite, risposte nuove ${nuove.size}"
    }
    fun salvaCassetta(repo: String, token: String) {
        if (!it.resonance.adam.cervello.Cassetta.valido(repo)) { avviso = "Serve «proprietario/nome» di un repository privato, non quello pubblico dell'app"; return }
        impostazioni.cassetta = repo
        if (token.isNotBlank()) impostazioni.tokenCassetta = token
        avviso = "Cassetta salvata"
    }
    fun cassetta() = impostazioni.cassetta
    // Il modello si riprova con la temperatura: se la rifiuta ancora, torna in elenco da solo.
    fun dimenticaRinunce() { impostazioni.senzaTemperatura = emptySet(); avviso = "Al prossimo turno la temperatura si riprova con tutti i modelli." }
    fun spostaNodo(n: Nodo, genitoreId: Long?) = viewModelScope.launch { avviso = archivio.spostaNodo(n, genitoreId) }
    fun aggiungiNodo(p: Percorso, etichetta: String) = viewModelScope.launch {
        if (etichetta.isNotBlank()) avviso = archivio.esegui(it.resonance.adam.logica.Proposta.AggiungiNodi(p.titolo, listOf(etichetta.trim()))).ricevuta
    }
    fun cambiaStatoNodo(n: Nodo) = viewModelScope.launch {
        val prossimo = StatoNodo.entries[(n.stato.ordinal + 1) % StatoNodo.entries.size]
        db.percorsi().aggiornaNodo(n.copy(stato = prossimo))
    }
    fun creaPercorso(p: Pilastro, titolo: String, nodi: List<String>) = viewModelScope.launch {
        val e = archivio.esegui(it.resonance.adam.logica.Proposta.CreaPercorso(p, titolo.trim(), "", nodi))
        avviso = e.ricevuta
    }
    fun archiviaPercorso(p: Percorso) = viewModelScope.launch { db.percorsi().aggiorna(p.copy(archiviato = true)); percorsoAperto = null }
    fun nuovoDocumento(p: Percorso, titolo: String) = viewModelScope.launch {
        val ora = System.currentTimeMillis()
        documentoAperto = db.percorsi().inserisciDocumento(Documento(percorsoId = p.id, titolo = titolo.trim(), testo = "", creato = ora, aggiornato = ora))
    }
    fun salvaProfilo(p: Profilo) = viewModelScope.launch { db.profilo().salva(p); avviso = "Profilo salvato" }
    fun versioni(entita: String, id: Long) = db.versioni().di(entita, id)

    // ── Sensi ──
    fun leggiSensi() = viewModelScope.launch {
        statoSensi = "Lettura in corso…"
        statoSensi = runCatching {
            val r = sensi.sincronizza(archivio)
            buildString {
                append("${r.nuoveOAggiornate} valori letti")
                if (r.fonti.isNotEmpty()) append(" da ${r.fonti.size} fonti")
                if (r.mancanti.isNotEmpty()) append(". Senza permesso: ${r.mancanti.joinToString(", ")}")
            }
        }.getOrElse { "Health Connect: ${it.message}" }
    }

    // ── Import, copia, ripristino ──
    fun importaPwa(testo: String) = viewModelScope.launch {
        avviso = runCatching {
            val r = archivio.importa(ImportPwa.leggi(testo))
            "Importati: ${r.misure} misure, ${r.voci} voci, ${r.percorsi} percorsi (${r.documenti} documenti), ${r.quaderni} quaderni" +
                (if (r.profilo) ", profilo" else "") +
                (if (r.scartati.isNotEmpty()) ". Non importati ${r.scartati.size}: ${r.scartati.take(4).joinToString("; ")}" else "")
        }.getOrElse { "Import non riuscito: ${it.message}" }
    }

    suspend fun copia(): String = archivio.copia()

    fun ripristina(testo: String) = viewModelScope.launch {
        avviso = runCatching { "Ripristinati ${archivio.ripristina(testo)} elementi." }.getOrElse { "Ripristino non riuscito: ${it.message}" }
    }

    fun apriFile(testo: String) {
        if (archivio.eUnaCopia(testo)) ripristina(testo) else importaPwa(testo)
    }

    fun riprogrammaBattito() = Battiti.programma(getApplication())

    // Cosa sa l'app del proprio battito: se le notifiche si vedono, se la sveglia è esatta, quando suona, com'è andata.
    fun muto() = Battiti.muto(getApplication())
    fun sveglieEsatte() = Battiti.esatte(getApplication())
    fun prossimiBattiti(): String {
        val imp = Impostazioni(getApplication())
        if (!imp.battitoAttivo) return "Battito spento."
        return Battito.entries.joinToString(" · ") { b -> "${b.etichetta} ${Ritmo.quando(Battiti.quando(imp, b))}" }
    }
    fun registroBattito() = Impostazioni(getApplication()).registroBattito
    fun provaBattito() {
        Battiti.avvia(getApplication(), Battito.MATTINO, prova = true)
        avviso = "Battito di prova in arrivo: tra qualche secondo una notifica, e una riga nel registro qui sotto."
    }

    fun liberoDallaBatteria() = runCatching {
        getApplication<Application>().getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(getApplication<Application>().packageName)
    }.getOrDefault(false)

    fun speso() = spesaMese.value?.dollari ?: 0.0

    fun propostaInAttesa(m: Messaggio) = m.ruolo == Ruolo.PROPOSTA && m.stato == StatoProposta.IN_ATTESA

    override fun onCleared() {
        runCatching { ascolto.chiudi() }
        runCatching { parlato.chiudi() }
    }
}
