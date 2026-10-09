package it.resonance.adam.logica

import it.resonance.adam.dati.Consegna
import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.StatoConsegna
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// Le consegne dello Shell: accettore prima dell'effettore. La forma (un documento con un titolo, in un percorso) si
// dichiara quando la consegna si prende; alla scadenza la guarda il programma, non il modello. Il programma verifica
// che il documento ci sia, scritto dopo la presa e non vuoto — NON che sia buono: quello resta al Ghost.
object Consegne {
    const val MASSIMO = 3
    const val GIORNI_MIN = 1
    const val GIORNI_MAX = 30

    private val giorno = DateTimeFormatter.ofPattern("dd/MM")

    fun forma(c: Consegna) = "documento «${c.documento}»" + (c.percorso?.let { " nel percorso «$it»" } ?: "")

    /** Il documento che mantiene la consegna, se c'è: stesso titolo, nel percorso dichiarato, scritto dopo la presa. */
    fun mantenutaDa(c: Consegna, documenti: List<Documento>, percorsi: List<Percorso>): Documento? {
        val dove = c.percorso?.let { p -> percorsi.filter { Testi.normalizza(it.titolo) == Testi.normalizza(p) }.map { it.id }.toSet() }
        return documenti.filter { d ->
            Testi.normalizza(d.titolo) == Testi.normalizza(c.documento) &&
                (dove == null || d.percorsoId in dove) &&
                d.aggiornato >= c.creata && d.testo.isNotBlank()
        }.maxByOrNull { it.aggiornato }
    }

    /** Le consegne aperte che il programma chiude oggi: mantenute (il documento c'è) o mancate (scadenza passata). */
    fun verifica(aperte: List<Consegna>, documenti: List<Documento>, percorsi: List<Percorso>, oggi: LocalDate): List<Consegna> =
        aperte.filter { it.stato == StatoConsegna.APERTA }.mapNotNull { c ->
            val d = mantenutaDa(c, documenti, percorsi)
            when {
                d != null -> c.copy(stato = StatoConsegna.MANTENUTA, chiusa = oggi.toString(),
                    esito = "il ${forma(c)} c'è, scritto il ${Instant.ofEpochMilli(d.aggiornato).atZone(ZoneId.systemDefault()).toLocalDate().format(giorno)}")
                oggi.isAfter(LocalDate.parse(c.scadenza)) -> c.copy(stato = StatoConsegna.MANCATA, chiusa = oggi.toString(),
                    esito = "alla scadenza del ${LocalDate.parse(c.scadenza).format(giorno)} il ${forma(c)} non c'era")
                else -> null
            }
        }

    /** Il turno di lavoro parte una volta sola, dal giorno prima della scadenza. */
    fun daLavorare(aperte: List<Consegna>, oggi: LocalDate): List<Consegna> = aperte.filter {
        it.stato == StatoConsegna.APERTA && !it.lavorata && ChronoUnit.DAYS.between(oggi, LocalDate.parse(it.scadenza)) <= 1
    }

    data class DopoIlLavoro(val consegna: Consegna, val titolo: String, val testo: String)

    /**
     * Ciò che il battito fa dopo il turno di lavoro (08/10). Prima la notifica diceva «guarda cosa ha scritto» anche quando
     * il turno era fallito: non c'era niente da guardare, la consegna era già segnata come lavorata e alla scadenza
     * risultava mancata. Il fallimento muto della lista in CLAUDE.md. Ora: un turno fallito si dice col motivo e torna da
     * lavorare (riprova al battito dopo, fino alla scadenza); una proposta si conferma entro la scadenza, e lo si dice;
     * un turno senza proposta si dice per quello che è, con la risposta.
     */
    fun dopoIlLavoro(c: Consegna, errore: Boolean, proposte: Int, risposta: String, chi: String): DopoIlLavoro {
        val entro = LocalDate.parse(c.scadenza).format(giorno)
        return when {
            errore -> DopoIlLavoro(c.copy(lavorata = false), "$chi non è riuscito a lavorare a una consegna",
                "«${c.cosa}»: ${Testi.corto(risposta.ifBlank { "nessuna risposta" }, 160)}. Riprova al prossimo battito, fino al $entro.")
            proposte > 0 -> DopoIlLavoro(c, "$chi ha lavorato a una consegna",
                "«${c.cosa}»: c'è una proposta da confermare entro il $entro. Senza la tua conferma il documento non c'è, e la consegna risulta mancata.")
            else -> DopoIlLavoro(c, "$chi non ha preparato il documento",
                "«${c.cosa}»: nessuna proposta. ${Testi.corto(risposta.ifBlank { "Non ha scritto niente." }, 160)}")
        }
    }

    fun riga(c: Consegna) = "«${c.cosa}» — ${forma(c)}, entro il ${LocalDate.parse(c.scadenza).format(giorno)}" +
        (if (c.lavorata) " (turno di lavoro già fatto)" else "")

    /** La traccia nel diario di Adam: anche quando è mancata. */
    fun traccia(c: Consegna): String {
        val stato = when (c.stato) {
            StatoConsegna.MANTENUTA -> "mantenuta"
            StatoConsegna.MANCATA -> "mancata"
            StatoConsegna.LASCIATA -> "lasciata dal Ghost"
            StatoConsegna.APERTA -> "aperta"
        }
        val base = "Consegna dello Shell $stato: «${c.cosa}» (presa il ${LocalDate.parse(c.presa).format(giorno)})."
        return if (c.esito.isBlank()) base else "$base ${c.esito.replaceFirstChar { it.uppercase() }.trimEnd('.')}."
    }
}
