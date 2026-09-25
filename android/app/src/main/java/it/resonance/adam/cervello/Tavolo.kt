package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.logica.Uscita
import java.text.Normalizer
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// La riunione a tre (25/09/2026): Ghost, Shell e architetto progettano insieme senza che il Ghost spieghi tutto due
// volte. Il verbale è una cartella nella cassetta privata, un file per intervento. Il Ghost apre e chiude, e modera:
// lo Shell parla quando scrive lui, mai in risposta diretta all'architetto (due macchine che si rispondono girano in
// tondo). L'architetto legge da una sessione aperta, con un guardiano che lo sveglia a ogni file nuovo.
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

    // Il guardiano dove il dato esce: la regola dei nomi protetti vale anche per il verbale.
    private suspend fun pulisci(t: String): String {
        val nomi = Uscita.nomi(archivio.db.profilo().leggi()?.nomiProtetti.orEmpty())
        return nomi.fold(t) { acc, n -> acc.replace(n, "[nome protetto]", ignoreCase = true) }
    }

    /** Gli interventi nuovi dell'architetto, portati in chat come nota: lo Shell li legge al turno dopo. */
    suspend fun ritira(): Int {
        if (!aperta() || !posta.pronta()) return 0
        val viste = imp.riunioneViste
        val nuovi = cassetta.elenca(imp.cassetta, imp.tokenCassetta, cartella()).filter { it.endsWith("-architetto.md") && it !in viste }.sorted()
        nuovi.forEach { f ->
            val t = cassetta.leggi(imp.cassetta, imp.tokenCassetta, "${cartella()}/$f").trim()
            archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = "Architetto (riunione «${imp.riunioneTema}»):\n$t"))
        }
        if (nuovi.isNotEmpty()) imp.riunioneViste = viste + nuovi
        return nuovi.size
    }

    suspend fun chiudi(verbale: String) {
        if (!aperta()) return
        registra("verbale", verbale)
        cassetta.scrivi(imp.cassetta, imp.tokenCassetta, "${cartella()}/${marca()}-chiusura.md", "Riunione chiusa dal Ghost.\n", "Riunione chiusa")
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, istante = ora, testo = "Riunione «${imp.riunioneTema}» chiusa. Il verbale resta nella cassetta."))
        imp.riunione = ""
        imp.riunioneTema = ""
        imp.riunioneViste = emptySet()
    }

    // Nomi che si ordinano nel tempo e non si scontrano: due autori non scrivono mai lo stesso file.
    private fun marca() = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS"))

    companion object {
        fun slug(t: String) = Normalizer.normalize(t.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
            .replace(Regex("[^a-z0-9]+"), "-").trim('-').take(40).ifEmpty { "riunione" }
    }
}
