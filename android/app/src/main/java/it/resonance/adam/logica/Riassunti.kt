package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.TipoMisura
import java.time.YearMonth

// Il testo che il programma sa scrivere da solo. Se il modello non risponde, il battito parla lo stesso.
object Riassunti {
    fun mattino(i: Istantanea): String {
        val righe = mutableListOf<String>()
        (i.agenda as? AgendaLetta.Letta)?.let { a ->
            val oggi = Agenda.delGiorno(a.eventi, i.oggi)
            righe += if (oggi.isEmpty()) "Nessun impegno in calendario oggi."
            else "Oggi in calendario: " + oggi.joinToString("; ") { Agenda.riga(it, i.oggi, conGiorno = false) }
        }
        Esiti.serieGiornaliera(i.misure, TipoMisura.SONNO).lastOrNull()?.takeIf { it.giorno == i.oggi }?.let {
            val media = Esiti.sintesi(i.misure, TipoMisura.SONNO, i.oggi).valore
            righe += "Sonno stanotte ${Esiti.ore(it.valore)}" + (media?.let { m -> " (media 7 giorni ${Esiti.ore(m)})" } ?: "")
        }
        Esiti.sintesi(i.misure, TipoMisura.PESO, i.oggi).takeIf { !it.vuota }?.let { righe += Esiti.riga(it, i.oggi) }
        Contesto.statoRituali(i).filter { it.tenuta.serie > 0 }.sortedByDescending { it.tenuta.serie }.take(3)
            .forEach { righe += "${it.rituale.nome}: ${it.tenuta.serie} giorni di fila" }
        if (righe.isEmpty()) righe += "Nessun dato nuovo stanotte."
        return righe.joinToString("\n")
    }

    fun sera(i: Istantanea): String {
        val righe = mutableListOf<String>()
        val mancanti = Contesto.statoRituali(i).filter { !it.tenuta.oggi }.map { it.rituale.nome }
        if (mancanti.isNotEmpty()) righe += "Non ancora tenuti oggi: ${mancanti.joinToString(", ")}"
        Esiti.serieGiornaliera(i.misure, TipoMisura.PASSI).find { it.giorno == i.oggi }?.let { righe += "Passi oggi: ${Esiti.formatta(TipoMisura.PASSI, it.valore)}" }
        val pratica = Esiti.serieGiornaliera(i.misure, TipoMisura.PRATICA).find { it.giorno == i.oggi }?.valore ?: 0.0
        righe += if (pratica > 0) "Pratica oggi: ${Esiti.ore(pratica)}" else "Nessuna pratica registrata oggi."
        return righe.joinToString("\n")
    }

    fun settimana(i: Istantanea): String {
        val righe = mutableListOf<String>()
        for (p in listOf(Pilastro.BIO, Pilastro.VIDYA)) {
            TipoMisura.entries.filter { it.pilastro == p }
                .map { Esiti.sintesi(i.misure, it, i.oggi) }
                .filter { !it.vuota }
                .forEach { righe += Esiti.riga(it, i.oggi) }
        }
        val libere = Esiti.entrateMese(i.misure, YearMonth.from(i.oggi), true)
        if (i.misure.any { it.tipo == TipoMisura.ENTRATA }) righe += "Entrate che non vendono tempo, questo mese: ${Esiti.formatta(TipoMisura.ENTRATA, libere)}"
        Contesto.statoRituali(i).forEach { s ->
            val su7 = (0L..6L).count { i.oggi.minusDays(it) in s.giorni }
            righe += "${s.rituale.nome}: tenuto $su7/7"
        }
        if (righe.isEmpty()) righe += "Nessun dato questa settimana."
        return righe.joinToString("\n")
    }
}
