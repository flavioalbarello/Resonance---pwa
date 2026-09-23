package it.resonance.adam.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import it.resonance.adam.Impostazioni
import it.resonance.adam.battito.Battiti
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
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.ImportPwa
import it.resonance.adam.logica.Istantanea
import it.resonance.adam.logica.Stabilita
import it.resonance.adam.mondo.MondoAndroid
import it.resonance.adam.sensi.Sensi
import it.resonance.adam.voce.Ascolto
import it.resonance.adam.voce.ComandiVocali
import it.resonance.adam.voce.Parlato
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

enum class Schermata(val etichetta: String) { SPECCHIO("Specchio"), SHELL("Shell"), BIO("Bio"), AIR("Air"), VIDYA("Vidya"), SETUP("Setup") }

enum class Ascolta { SPENTO, DETTATURA, AUTO }

class Adam(app: Application) : AndroidViewModel(app) {
    val db = Db.di(app)
    val archivio = Archivio(db)
    val impostazioni = Impostazioni(app)
    val sensi = Sensi(app)
    val mondo = MondoAndroid(app)
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
    val messaggi = db.messaggi().tutti().stato()
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

    fun vai(s: Schermata) {
        schermata = s; percorsoAperto = null; documentoAperto = null
        if (s == Schermata.SPECCHIO) leggiAgenda()
    }

    fun leggiAgenda() = viewModelScope.launch { agenda = mondo.agenda(LocalDate.now(), 2) }

    fun indietro(): Boolean = when {
        documentoAperto != null -> { documentoAperto = null; true }
        percorsoAperto != null -> { percorsoAperto = null; true }
        schermata != Schermata.SPECCHIO -> { schermata = Schermata.SPECCHIO; true }
        else -> false
    }

    // ── Shell ──
    fun invia(testo: String = input) {
        val t = testo.trim()
        if (t.isEmpty() || pensa) return
        input = ""
        pensa = true
        viewModelScope.launch {
            val esito = shell.turno(t)
            pensa = false
            if (ascolta == Ascolta.AUTO) rispondiAVoce(esito)
        }
    }

    fun conferma(m: Messaggio) = viewModelScope.launch { avviso = shell.conferma(m.id); leggiAgenda() }
    fun rifiuta(m: Messaggio) = viewModelScope.launch { shell.rifiuta(m.id) }

    // ── Voce: dettatura (come Gemini: testo nella casella) e auto (mani libere) ──
    private val parlato by lazy { Parlato(getApplication()) }
    private var silenzi = 0
    private val ascolto by lazy {
        Ascolto(getApplication(),
            parziale = { parziale = it },
            finale = { t -> parziale = ""; ricevuto(t) },
            fine = { errore -> finito(errore) },
        )
    }

    fun microfonoDisponibile() = ascolto.disponibile()

    fun avviaDettatura() { ferma(); ascolta = Ascolta.DETTATURA; ascolto.avvia() }

    fun avviaAuto() {
        ferma()
        ascolta = Ascolta.AUTO
        silenzi = 0
        schermata = Schermata.SHELL
        ascolto.avvia()
    }

    fun ferma() {
        ascolto.ferma()
        parlato.zitto()
        ascolta = Ascolta.SPENTO
        parziale = ""
    }

    private fun ricevuto(t: String) {
        when (ascolta) {
            Ascolta.DETTATURA -> {
                input = listOf(input.trim(), t).filter { it.isNotEmpty() }.joinToString(" ")
                if (schermata != Schermata.SHELL) vai(Schermata.SHELL)
            }
            Ascolta.AUTO -> {
                silenzi = 0
                viewModelScope.launch {
                    val inAttesa = db.messaggi().ultimaInAttesa()
                    when {
                        inAttesa != null && ComandiVocali.eSi(t) -> {
                            db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = t, istante = System.currentTimeMillis()))
                            val r = shell.conferma(inAttesa.id)
                            parla(r)
                        }
                        inAttesa != null && ComandiVocali.eNo(t) -> {
                            db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = t, istante = System.currentTimeMillis()))
                            shell.rifiuta(inAttesa.id)
                            parla("Annullato.")
                        }
                        else -> invia(t)
                    }
                }
            }
            Ascolta.SPENTO -> {}
        }
    }

    private fun finito(errore: String?) {
        when (ascolta) {
            Ascolta.DETTATURA -> { ascolta = Ascolta.SPENTO; if (errore != null && errore != "silenzio" && errore != "annullato") avviso = "Voce: $errore" }
            Ascolta.AUTO -> {
                if (errore == null || errore == "annullato" || pensa) return
                if (errore == "silenzio" && ++silenzi < 3) { ascolto.avvia(); return }
                ascolta = Ascolta.SPENTO
                avviso = if (errore == "silenzio") "Modalità auto in pausa dopo tre silenzi." else "Modalità auto ferma: $errore"
            }
            Ascolta.SPENTO -> {}
        }
    }

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
        parlato.parla(testo) { if (ascolta == Ascolta.AUTO) ascolto.avvia() }
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
    fun salvaQuaderno(p: Pilastro, testo: String) = viewModelScope.launch { archivio.aggiornaQuaderno(p, testo); avviso = "Quaderno salvato" }
    fun salvaDocumento(d: Documento, testo: String) = viewModelScope.launch { archivio.salvaTestoDocumento(d, testo); avviso = "Documento salvato" }
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

    fun speso() = spesaMese.value?.dollari ?: 0.0

    fun propostaInAttesa(m: Messaggio) = m.ruolo == Ruolo.PROPOSTA && m.stato == StatoProposta.IN_ATTESA

    override fun onCleared() {
        runCatching { ascolto.chiudi() }
        runCatching { parlato.chiudi() }
    }
}
