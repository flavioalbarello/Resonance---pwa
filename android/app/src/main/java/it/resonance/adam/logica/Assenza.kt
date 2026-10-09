package it.resonance.adam.logica

import it.resonance.adam.dati.Consegna
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Voce
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// «Sono via» (riunione del 01/10/2026). Quattro giorni di febbre, e l'app ha continuato a chiedere il rituale del basso;
// una consegna dello Shell sarebbe risultata mancata perché il documento aspettava un tocco che non poteva arrivare.
// L'assenza la dichiara il Ghost, mai il programma dal silenzio (un silenzio può essere anche una giornata piena).
// Mentre è via: il battito tace, i rituali sono in pausa (quei giorni non contano né come tenuti né come saltati),
// consegne ed esperimenti si congelano e al ritorno slittano dei giorni di assenza. Il periodo resta nel diario di
// Adam come pausa, non come buco: è anche una traccia di «stabilità mantenuta». Il periodo vive come voce del diario
// (fonte «assenza»): così entra nella copia di sicurezza e non serve una tabella nuova.
object Assenza {
    const val FONTE = "assenza"

    data class Periodo(val da: LocalDate, val a: LocalDate?)

    private val FORMA = Regex("dal (\\d{4}-\\d{2}-\\d{2})(?: al (\\d{4}-\\d{2}-\\d{2}))?")

    fun testoApertura(da: LocalDate) = "In pausa («Sono via») dal $da."
    fun testoChiusura(da: LocalDate, a: LocalDate, dettagli: String) =
        "In pausa («Sono via») dal $da al $a: ${giorni(da, a)} giorni.${if (dettagli.isNotBlank()) " $dettagli" else ""}"

    // Non contiene «dal …»: non è un periodo, quindi non mette in pausa nessun giorno.
    fun testoRitirato(da: LocalDate) = "«Sono via» del $da ritirato lo stesso giorno: nessuna pausa."

    fun periodo(v: Voce): Periodo? = if (v.fonte != FONTE) null else FORMA.find(v.testo)?.let { m ->
        Periodo(LocalDate.parse(m.groupValues[1]), m.groupValues[2].takeIf { it.isNotEmpty() }?.let(LocalDate::parse))
    }

    fun periodi(voci: List<Voce>): List<Periodo> = voci.mapNotNull(::periodo)

    /** L'assenza in corso, se c'è: la voce aperta più recente. */
    fun inCorso(voci: List<Voce>): Pair<Voce, Periodo>? =
        voci.filter { it.fonte == FONTE }.mapNotNull { v -> periodo(v)?.takeIf { it.a == null }?.let { v to it } }.maxByOrNull { it.second.da }

    /** I giorni di pausa fino a oggi compreso: quelli chiusi, e quello in corso fino a oggi. */
    fun giorniDiPausa(periodi: List<Periodo>, oggi: LocalDate): Set<LocalDate> = periodi.flatMap { p ->
        val fine = minOf(p.a ?: oggi, oggi)
        generateSequence(p.da) { it.plusDays(1) }.takeWhile { !it.isAfter(fine) }.toList()
    }.toSet()

    /** Quanti giorni di calendario, estremi compresi. */
    fun giorni(da: LocalDate, a: LocalDate) = ChronoUnit.DAYS.between(da, a).toInt() + 1

    fun slitta(c: Consegna, giorni: Int): Consegna = c.copy(scadenza = LocalDate.parse(c.scadenza).plusDays(giorni.toLong()).toString())
    fun allunga(e: Esperimento, giorni: Int): Esperimento = e.copy(fine = LocalDate.parse(e.fine).plusDays(giorni.toLong()).toString())

    fun voceApertura(da: LocalDate, ora: Long) = Voce(pilastro = Pilastro.ADAM, giorno = da.toString(), testo = testoApertura(da), fonte = FONTE, creato = ora, aggiornato = ora)

    /** Il riepilogo del ritorno: ciò che è stato fermato e ciò che aspetta il Ghost, in poche righe. */
    fun riepilogo(giorni: Int, consegne: List<Consegna>, esperimenti: List<Esperimento>, proposteInAttesa: Int): String = buildString {
        append("Bentornato. Sei stato via $giorni giorni")
        append(if (giorni == 1) "." else ": niente era in ritardo per colpa tua.")
        if (consegne.isNotEmpty()) append("\nConsegne dello Shell spostate di $giorni giorni: " + consegne.joinToString("; ") { "«${it.cosa}» ora al ${it.scadenza}" } + ".")
        if (esperimenti.isNotEmpty()) append("\nEsperimenti allungati di $giorni giorni: " + esperimenti.joinToString("; ") { "«${it.titolo}» fino al ${it.fine}" } + ".")
        append("\nI rituali di quei giorni non contano come saltati.")
        if (proposteInAttesa > 0) append("\nTi aspettano $proposteInAttesa proposte da decidere, in chat.")
    }
}
