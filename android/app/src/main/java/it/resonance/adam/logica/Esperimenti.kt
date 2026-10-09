package it.resonance.adam.logica

import it.resonance.adam.dati.Direzione
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.EsitoEsperimento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.StatoEsperimento
import it.resonance.adam.dati.TipoMisura
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

// L'anello di Anochin sulla vita, non sull'app. Nella PWA «l'anello» contava voci scritte e percorsi aperti:
// misurava l'uso dell'app. Qui il bersaglio è un numero del mondo (sonno, passi, pratica, entrate che non vendono
// tempo…), dichiarato PRIMA; la partenza si congela all'apertura; alla scadenza confronta il programma.
//
// Cosa NON è, e va tenuto fermo: non è un voto al Ghost. Un esperimento che non muove niente dice che la proposta
// era troppo prudente o troppo ovvia. E «è cambiato mentre lo facevi», mai «grazie a»: un numero si muove per molte
// ragioni, e un esperimento solo non le separa.
object Esperimenti {
    const val APERTI_MASSIMI = 3
    const val GIORNI_MINIMI = 7
    const val GIORNI_MASSIMI = 42
    const val GIORNI_PREDEFINITI = 14

    // Livelli: conta la media dei giorni con un dato (servono almeno 3 giorni). Quantità: conta la somma, e un giorno
    // senza dato vale zero (non aver suonato è un dato).
    val LIVELLI = setOf(TipoMisura.PESO, TipoMisura.SONNO, TipoMisura.PASSI, TipoMisura.FC_RIPOSO)
    private const val GIORNI_CON_DATO = 3

    fun sogliaPredefinita(t: TipoMisura): Double = when (t) {
        TipoMisura.PESO -> 0.5
        TipoMisura.SONNO -> 15.0
        TipoMisura.PASSI -> 500.0
        TipoMisura.FC_RIPOSO -> 2.0
        TipoMisura.ALLENAMENTO, TipoMisura.PRATICA -> 30.0
        TipoMisura.OPERA -> 1.0
        TipoMisura.ENTRATA -> 1.0
    }

    // Per le entrate conta solo ciò che non vende tempo: è l'esito del pilastro AIR.
    private fun pertinenti(misure: List<Misura>, tipo: TipoMisura) =
        if (tipo == TipoMisura.ENTRATA) misure.filter { it.tipo == tipo && it.legataAlTempo == false } else misure

    /** Il valore di un numero in una finestra [da, a). Null se per un livello i dati sono troppo pochi. */
    fun misura(misure: List<Misura>, tipo: TipoMisura, da: LocalDate, a: LocalDate): Double? {
        val serie = Esiti.serieGiornaliera(pertinenti(misure, tipo), tipo).filter { !it.giorno.isBefore(da) && it.giorno.isBefore(a) }
        return if (tipo in LIVELLI) serie.takeIf { it.size >= GIORNI_CON_DATO }?.map { it.valore }?.average()
        else serie.sumOf { it.valore }
    }

    /** La partenza: la finestra di pari durata subito prima dell'inizio. */
    fun partenza(misure: List<Misura>, tipo: TipoMisura, inizio: LocalDate, giorni: Int) =
        misura(misure, tipo, inizio.minusDays(giorni.toLong()), inizio)

    fun esito(base: Double, finale: Double?, direzione: Direzione, soglia: Double): EsitoEsperimento {
        if (finale == null) return EsitoEsperimento.SENZA_DATI
        val verso = (finale - base) * if (direzione == Direzione.SU) 1 else -1
        return when {
            verso >= soglia -> EsitoEsperimento.MOSSO
            verso <= -soglia -> EsitoEsperimento.CONTRARIO
            else -> EsitoEsperimento.FERMO
        }
    }

    fun scaduti(tutti: List<Esperimento>, oggi: LocalDate) =
        tutti.filter { it.stato == StatoEsperimento.APERTO && !oggi.isBefore(LocalDate.parse(it.fine)) }

    fun aperti(tutti: List<Esperimento>) = tutti.filter { it.stato == StatoEsperimento.APERTO }

    private val GIORNO = DateTimeFormatter.ofPattern("EEE d/M", Locale.ITALIAN)

    fun valore(tipo: TipoMisura, v: Double) = Esiti.formatta(tipo, v)

    fun bersaglio(e: Esperimento) =
        "${nomeMisura(e.tipo)} ${e.direzione.freccia} di almeno ${valore(e.tipo, e.soglia)}"

    fun nomeMisura(t: TipoMisura) = if (t == TipoMisura.ENTRATA) "Entrate che non vendono tempo" else t.etichetta

    // Come si legge a metà strada: stesso testo sullo Specchio e nel prompt.
    fun riga(e: Esperimento, misure: List<Misura>, oggi: LocalDate): String = when (e.stato) {
        StatoEsperimento.APERTO -> {
            val inizio = LocalDate.parse(e.inizio)
            val giorno = (ChronoUnit.DAYS.between(inizio, oggi) + 1).coerceIn(1, e.giorni.toLong())
            val finora = misura(misure, e.tipo, inizio, oggi.plusDays(1))
            "«${e.titolo}»: ${bersaglio(e)}, giorno $giorno di ${e.giorni}, partenza ${valore(e.tipo, e.base)}" +
                (finora?.let { ", finora ${valore(e.tipo, it)}" } ?: "")
        }
        StatoEsperimento.CHIUSO ->
            "«${e.titolo}» (chiuso ${LocalDate.parse(e.fine).format(GIORNO)}): ${nomeMisura(e.tipo)} ${valore(e.tipo, e.base)} → " +
                (e.finale?.let { valore(e.tipo, it) } ?: "?") + ", ${e.esito?.etichetta ?: "?"} (bersaglio ${e.direzione.freccia})"
        StatoEsperimento.ABBANDONATO -> "«${e.titolo}»: lasciato prima della fine" + (if (e.nota.isNotBlank()) " — ${e.nota}" else "")
    }

    // La traccia che resta nel diario di Adam: vale anche un «non si è mosso», come le carenze.
    fun traccia(e: Esperimento): String =
        "Esperimento chiuso: «${e.titolo}», ${e.giorni} giorni. ${nomeMisura(e.tipo)} ${valore(e.tipo, e.base)} → " +
            (e.finale?.let { valore(e.tipo, it) } ?: "senza dati") + ": ${e.esito?.etichetta}. " +
            "Bersaglio: ${bersaglio(e)}. È un dato sulla proposta, non sul Ghost; è cambiato mentre lo faceva, non per forza per quello."
}

object Perturbazione {
    const val OGNI_GIORNI = 13L
    fun dovuta(ultima: String, oggi: LocalDate) =
        runCatching { LocalDate.parse(ultima) }.getOrNull()?.let { ChronoUnit.DAYS.between(it, oggi) >= OGNI_GIORNI } ?: true
}

// La perturbazione: il programma, non il modello, si accorge che qualcosa si è fermato. Solo allora chiede allo
// Shell UN esperimento. Sui numeri che un esperimento aperto sta già guardando non si perturba.
object Ristagno {
    private val QUANTITA = listOf(TipoMisura.PRATICA, TipoMisura.ALLENAMENTO, TipoMisura.ENTRATA)

    fun trova(i: Istantanea, esperimenti: List<Esperimento>): List<String> {
        val guardati = Esperimenti.aperti(esperimenti).map { it.tipo }.toSet()
        val motivi = mutableListOf<String>()
        for (t in QUANTITA) {
            if (t in guardati) continue
            val ultimi = Esperimenti.misura(i.misure, t, i.oggi.minusDays(13), i.oggi.plusDays(1)) ?: 0.0
            val prima = Esperimenti.misura(i.misure, t, i.oggi.minusDays(59), i.oggi.minusDays(13)) ?: 0.0
            if (ultimi == 0.0 && prima > 0.0)
                motivi += "${Esperimenti.nomeMisura(t)}: zero negli ultimi 14 giorni (nei 46 prima: ${Esiti.formatta(t, prima)})"
        }
        if (TipoMisura.PASSI !in guardati) {
            val ultimi = Esperimenti.misura(i.misure, TipoMisura.PASSI, i.oggi.minusDays(13), i.oggi.plusDays(1))
            val prima = Esperimenti.misura(i.misure, TipoMisura.PASSI, i.oggi.minusDays(59), i.oggi.minusDays(13))
            if (ultimi != null && prima != null && ultimi < prima * 0.8)
                motivi += "Passi: media ${Esiti.formatta(TipoMisura.PASSI, ultimi)} negli ultimi 14 giorni, ${Esiti.formatta(TipoMisura.PASSI, prima)} prima"
        }
        Contesto.statoRituali(i)
            .filter { ChronoUnit.DAYS.between(Instant.ofEpochMilli(it.rituale.creato).atZone(ZoneId.systemDefault()).toLocalDate(), i.oggi) >= 21 }
            .filter { it.tenuta.tenutiSu14 <= 3 }
            .forEach { motivi += "Rituale «${it.rituale.nome}»: tenuto ${it.tenuta.tenutiSu14} volte su 14" }
        return motivi
    }
}
