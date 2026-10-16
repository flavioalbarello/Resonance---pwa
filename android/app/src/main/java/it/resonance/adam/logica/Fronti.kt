package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Sessione
import it.resonance.adam.dati.TipoMisura
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// I fronti nella V3 (PROGETTO_V3.md): ogni percorso è un fronte; il programma dice quale chiede di essere lavorato
// adesso e cosa è cambiato. Oggi e Fronti leggono da qui, non decidono da soli: così le prove li tengono fermi.
object Fronti {
    data class Proposta(val percorso: Percorso, val pezzo: Nodo, val urgenza: Double)

    private fun scadenza(p: Percorso) = p.scadenza?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

    /** L'urgenza di un fronte: quella del suo pezzo più urgente. Zero se non c'è niente da studiare. */
    fun urgenza(p: Percorso, nodi: List<Nodo>, oggi: LocalDate): Double =
        Pratica.pezzi(nodi.filter { it.percorsoId == p.id }).maxOfOrNull { Pratica.urgenza(it, oggi, scadenza(p)) } ?: 0.0

    /**
     * Un fronte di pratica: ha una scadenza o un ritmo, o i suoi pezzi sono già stati studiati o hanno una fonte. Solo
     * questi Oggi li propone da sé: «studia 10 minuti i Plasmidi» di un progetto non ha senso. Gli altri si studiano dalla
     * loro scheda, e dalla prima sessione diventano di pratica.
     */
    fun diPratica(p: Percorso, nodi: List<Nodo>): Boolean = p.scadenza != null || p.ritmoGiorni > 0 ||
        nodi.any { it.percorsoId == p.id && (it.velocita != null || it.fonte != null || it.ultimaPratica != null) }

    /** La prossima cosa da studiare, fra tutti i fronti di pratica: ciò che Oggi propone con un tocco. */
    fun prossimo(percorsi: List<Percorso>, nodi: List<Nodo>, oggi: LocalDate): Proposta? = percorsi.filter { !it.archiviato && diPratica(it, nodi) }
        .flatMap { p -> Pratica.pezzi(nodi.filter { it.percorsoId == p.id }).map { Proposta(p, it, Pratica.urgenza(it, oggi, scadenza(p))) } }
        .filter { it.urgenza > 0.0 }
        .maxByOrNull { it.urgenza }

    /** L'ordine dell'elenco: prima chi ha una scadenza vicina o un pezzo urgente, poi gli altri per data di creazione. */
    fun ordina(percorsi: List<Percorso>, nodi: List<Nodo>, oggi: LocalDate): List<Percorso> = percorsi.filter { !it.archiviato }
        .sortedWith(compareByDescending<Percorso> { urgenza(it, nodi, oggi) }.thenByDescending { it.creato })

    fun ultima(sessioni: List<Sessione>, percorsoId: Long): Sessione? = sessioni.filter { it.percorsoId == percorsoId && it.fine != null }.maxByOrNull { it.inizio }

    /** «ultima sessione ieri, 25 min»: cosa è successo l'ultima volta, in una riga. */
    fun rigaUltima(s: Sessione?, oggi: LocalDate, zona: ZoneId = ZoneId.systemDefault()): String? {
        s ?: return null
        val giorno = Instant.ofEpochMilli(s.inizio).atZone(zona).toLocalDate()
        val quando = when (val g = ChronoUnit.DAYS.between(giorno, oggi)) { 0L -> "oggi"; 1L -> "ieri"; else -> "$g giorni fa" }
        return "ultima sessione $quando, ${Pratica.minutiFatti(s.inizio, s.fine ?: s.inizio)} min"
    }

    /** I numeri che si sono mossi: un tipo entra solo se ha una misura negli ultimi due giorni. Gli altri stanno nel menu. */
    fun cambiati(misure: List<Misura>, oggi: LocalDate): List<TipoMisura> {
        val da = oggi.minusDays(1).toString()
        return TipoMisura.entries.filter { t -> misure.any { it.tipo == t && it.giorno >= da } }
    }
}
