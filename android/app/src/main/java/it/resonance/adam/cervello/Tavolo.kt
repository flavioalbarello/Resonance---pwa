package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.logica.Consulente
import it.resonance.adam.logica.Testi
import it.resonance.adam.logica.Uscita
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.text.Normalizer
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// La riunione a tre (25/09/2026): Ghost, Shell e architetto progettano insieme senza che il Ghost spieghi tutto due
// volte. Il verbale è una cartella nella cassetta privata, un file per intervento. Il Ghost apre e chiude, e modera:
// lo Shell parla quando scrive lui. Dal 26/09 anche quando l'architetto gli si rivolge con «→ Shell» — deciso dal
// programma sulla riga, non dal modello sul tono — ma al massimo GIRI_SENZA_GHOST volte di fila: due macchine che si
// rispondono girano in tondo, e il Ghost modera. L'architetto legge da una sessione aperta, con un guardiano che lo
// sveglia a ogni file nuovo.
// Solo progettazione: niente allegati, e il nome professionale del Ghost si toglie PRIMA di uscire dal telefono.
class Tavolo(private val archivio: Archivio, private val imp: Impostazioni, private val cassetta: Cassetta = Cassetta()) {
    private val posta get() = Corrispondenza(archivio, imp, cassetta)
    private val ora get() = System.currentTimeMillis()

    fun aperta() = imp.riunione.isNotBlank()
    private fun cartella() = "riunioni/${imp.riunione}"

    suspend fun apri(tema: String): String {
        if (!posta.pronta()) error("Cassetta non configurata: Setup → Cassetta delle lettere")
        val id = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")) + "-" + Tavolo.slug(tema)
        cassetta.scrivi(imp.cassetta, imp.tokenCassetta, "riunioni/$id/${marca()}-apertura.md",
            "# Riunione: ${tema.trim()}\n\nAperta dal Ghost. Solo progettazione: niente dati sensibili, niente allegati.\n" +
                "Modera il Ghost. L'architetto interviene se nominato, se lo Shell gli chiede qualcosa, o se vede un errore di progetto.\n",
            "Riunione aperta: ${tema.trim()}")
        imp.riunione = id
        imp.riunioneTema = tema.trim()
        imp.riunioneViste = emptySet()
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora,
            testo = "Riunione aperta: «${tema.trim()}». Da ora ogni scambio va nel verbale, e l'architetto lo legge."))
        return id
    }

    /** Un intervento nel verbale: `autore` è ghost, shell o verbale. I nomi protetti escono sostituiti. */
    suspend fun registra(autore: String, testo: String) {
        if (!aperta() || testo.isBlank()) return
        cassetta.scrivi(imp.cassetta, imp.tokenCassetta, "${cartella()}/${marca()}-$autore.md", pulisci(testo), "Riunione: $autore")
    }

    // Il guardiano dove il dato esce: la regola dei nomi protetti vale anche per il verbale. Dal 26/09 anche gli indirizzi
    // mail: nella seconda riunione lo Shell vi aveva scritto quello della moglie del Ghost. Il verbale è privato, ma è
    // fuori dal telefono.
    private suspend fun pulisci(t: String): String {
        val nomi = Uscita.nomi(archivio.db.profilo().leggi()?.nomiProtetti.orEmpty())
        return senzaIndirizzi(nomi.fold(t) { acc, n -> acc.replace(n, "[nome protetto]", ignoreCase = true) })
    }

    /** Cosa ha portato un ritiro: i messaggi nuovi dell'architetto, e quello a cui lo Shell deve rispondere (se c'è). */
    data class Ritiro(val nuovi: List<Messaggio>, val allaShell: Long?)

    // ── Il consulente esterno (27/09/2026, logica/Consulente.kt) ──
    // Lo stato sta nelle impostazioni come quello della riunione: se è nella stanza, la cartella, gli invii.

    fun consulentePresente() = aperta() && imp.consulente
    fun domande(): List<Consulente.Domanda> = Consulente.decodifica(imp.consulenteDomande)

    suspend fun convoca(): String {
        if (!aperta()) return "Il consulente si convoca in riunione"
        if (imp.consulente) return "Il consulente è già nella stanza"
        imp.consulente = true
        val storia = Consulente.decodificaStoria(imp.consulenteStoria)
        val t = "Consulente convocato: un modello con la ricerca web. Vede solo le domande, non Adam. Le domande si raccolgono " +
            "nella cartella e partono insieme quando il Ghost tocca Manda." + if (storia.isNotEmpty()) " Riprende il filo dei suoi ${storia.size} scambi di questa riunione." else ""
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = t))
        runCatching { registra("programma", t) }
        return "Consulente nella stanza"
    }

    suspend fun congeda(): String {
        if (!imp.consulente) return "Il consulente non è nella stanza"
        val rimaste = domande()
        imp.consulente = false
        imp.consulenteDomande = ""
        // Le domande non mandate non spariscono in silenzio: restano scritte nella nota (Legge 14).
        val t = "Consulente congedato." + if (rimaste.isNotEmpty()) " Domande non mandate: " + rimaste.joinToString("; ") { "[${it.autore}] ${it.testo}" } + "." else ""
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = t))
        runCatching { registra("programma", t) }
        return "Consulente congedato"
    }

    /** Una domanda in cartella. Null se entra; altrimenti il perché no. */
    fun aggiungiDomanda(autore: String, testo: String): String? {
        val t = testo.trim()
        return when {
            !consulentePresente() -> "il consulente non è nella stanza: lo convoca il Ghost"
            t.isEmpty() -> "domanda vuota"
            t.length > Consulente.LUNGHEZZA_MAX -> "al massimo ${Consulente.LUNGHEZZA_MAX} caratteri: una domanda, non un documento"
            domande().size >= Consulente.DOMANDE_MAX -> "la cartella ha già ${Consulente.DOMANDE_MAX} domande: prima si manda"
            domande().any { Testi.normalizza(it.testo) == Testi.normalizza(t) } -> "questa domanda è già in cartella"
            else -> { imp.consulenteDomande = Consulente.codifica(domande() + Consulente.Domanda(autore, t)); null }
        }
    }

    fun togliDomanda(indice: Int) {
        val c = domande().toMutableList()
        if (indice in c.indices) { c.removeAt(indice); imp.consulenteDomande = Consulente.codifica(c) }
    }

    fun alzaTetto() { imp.consulenteTetto = imp.consulenteTetto + Consulente.ALZA_DI }

    fun statoConsulente() = Consulente.stato(consulentePresente(), domande(), imp.consulenteInvii, imp.consulenteTetto)

    /**
     * Gli interventi nuovi dell'architetto, portati in chat come messaggi suoi. Se uno comincia con «→ Shell» e non si è
     * superato il tetto di giri senza il Ghost, `allaShell` dice a quale deve rispondere lo Shell: il turno lo fa
     * partire chi chiama. Un lucchetto solo per tutto il processo: il giro dei 20 secondi, il ritorno nell'app e il
     * lavoro delle lettere possono arrivare insieme, e lo stesso file non deve entrare due volte.
     */
    suspend fun ritira(): Ritiro = chiave.withLock {
        if (!aperta() || !posta.pronta()) return@withLock Ritiro(emptyList(), null)
        val viste = imp.riunioneViste
        val file = cassetta.elenca(imp.cassetta, imp.tokenCassetta, cartella()).filter { it.endsWith("-architetto.md") && it !in viste }.sorted()
        val nuovi = file.map { f ->
            val t = cassetta.leggi(imp.cassetta, imp.tokenCassetta, "${cartella()}/$f").trim()
            val m = Messaggio(ruolo = Ruolo.ARCHITETTO, istante = ora, testo = t)
            m.copy(id = archivio.db.messaggi().inserisci(m))
        }
        if (file.isNotEmpty()) imp.riunioneViste = viste + file
        // Le domande dell'architetto per il consulente: nella cartella, se è nella stanza; se no lo si scrive nel verbale,
        // dove l'architetto le vede.
        nuovi.filter { Consulente.rivolto(it.testo) }.forEach { m ->
            val esiti = Consulente.domandeDa(m.testo).map { d -> aggiungiDomanda("architetto", d)?.let { "«${Testi.corto(d, 60)}»: $it" } }
            val no = esiti.filterNotNull()
            if (no.isNotEmpty()) {
                val t = "Domande dell'architetto per il consulente non messe in cartella — ${no.joinToString("; ")}."
                archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = t))
                runCatching { registra("programma", t) }
            }
        }
        val rivolti = nuovi.filter { rivolto(it.testo) }
        if (rivolti.isEmpty()) return@withLock Ritiro(nuovi, null)
        val giri = giri(archivio.db.messaggi().ultimi(60))
        if (giri <= GIRI_SENZA_GHOST) return@withLock Ritiro(nuovi, rivolti.last().id)
        // Il tetto si è appena superato: si dice una volta, in chat e nel verbale.
        if (giri - rivolti.size <= GIRI_SENZA_GHOST) {
            archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora,
                testo = "$GIRI_SENZA_GHOST giri di fila fra Shell e architetto senza di te: lo Shell non risponde più all'architetto finché non scrivi tu."))
            runCatching { registra("programma", "$GIRI_SENZA_GHOST giri Shell↔architetto senza il Ghost: lo Shell aspetta il Ghost.") }
        }
        Ritiro(nuovi, null)
    }

    suspend fun chiudi(verbale: String) {
        if (!aperta()) return
        registra("verbale", verbale)
        cassetta.scrivi(imp.cassetta, imp.tokenCassetta, "${cartella()}/${marca()}-chiusura.md", "Riunione chiusa dal Ghost.\n", "Riunione chiusa")
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = "Riunione «${imp.riunioneTema}» chiusa. Il verbale resta nella cassetta."))
        imp.riunione = ""
        imp.riunioneTema = ""
        imp.riunioneViste = emptySet()
        imp.riunioneVerbale = ""
        imp.consulente = false
        imp.consulenteDomande = ""
        imp.consulenteInvii = 0
        imp.consulenteTetto = Consulente.TETTO_INVII
        imp.consulenteStoria = ""
    }

    // Nomi che si ordinano nel tempo e non si scontrano: due autori non scrivono mai lo stesso file.
    private fun marca() = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS"))

    companion object {
        const val GIRI_SENZA_GHOST = 3
        private val INDIRIZZO = Regex("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+")
        fun senzaIndirizzi(t: String) = t.replace(INDIRIZZO, "[indirizzo]")
        private val chiave = Mutex()

        // Il verbale: la forma si dichiara al modello e si controlla sul testo con la stessa lista (detta e verifica).
        val SEZIONI = listOf("Decisioni", "Questioni aperte", "Chi fa cosa")
        fun mancano(verbale: String) = SEZIONI.filterNot { s -> Regex("(?im)^[\\s*#_>-]*" + Regex.escape(s)).containsMatchIn(verbale) }

        /** Un intervento dell'architetto rivolto allo Shell: la PRIMA riga è «→ Shell» (o «-> Shell»). */
        fun rivolto(t: String) = Regex("^\\s*(→|->)\\s*shell\\b", RegexOption.IGNORE_CASE).containsMatchIn(t)

        /** Quanti interventi rivolti allo Shell dall'ultimo messaggio del Ghost. */
        fun giri(messaggi: List<Messaggio>): Int {
            val ultimoGhost = messaggi.indexOfLast { it.ruolo == Ruolo.GHOST }
            return messaggi.drop(ultimoGhost + 1).count { it.ruolo == Ruolo.ARCHITETTO && rivolto(it.testo) }
        }

        /** Per la voce e lo schermo: la freccia si dice a parole. */
        fun leggibile(t: String) = Consulente.leggibile(t.replaceFirst(Regex("^\\s*(→|->)\\s*shell\\b[:,.\\s—-]*", RegexOption.IGNORE_CASE), "Allo Shell: "))

        fun slug(t: String) = Normalizer.normalize(t.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
            .replace(Regex("[^a-z0-9]+"), "-").trim('-').take(40).ifEmpty { "riunione" }
    }
}
