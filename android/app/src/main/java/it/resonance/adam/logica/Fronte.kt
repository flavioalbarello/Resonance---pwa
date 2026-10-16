package it.resonance.adam.logica

import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import java.time.LocalDate
import java.time.temporal.ChronoUnit

// Il fronte motorizzato (V3 fase 3, PROGETTO_V3.md). Un percorso con ritmoGiorni > 0 ha il motore acceso: ogni tanti
// giorni il programma apre un turno di lavoro dello Shell su quel fronte, anche ad app chiusa. La forma del lavoro si
// dichiara PRIMA (accettore): fonti per i pezzi che non ne hanno, il prossimo passo, nodi che mancano. Dopo, il programma
// conta cosa è arrivato davvero; ciò che lo Shell prepara resta proposta, e il Ghost la decide da Oggi.
object Fronte {
    const val RITMO_MAX = 30
    private val LINK = Regex("""https?://[^\s<>"'\)\]]+""")

    fun link(testo: String): String? = testo.trim().takeIf { it.startsWith("http://") || it.startsWith("https://") }?.let { LINK.find(it)?.value?.trimEnd('.', ',', ';') }

    /** I link in un testo (risultati di ricerca, messaggi del Ghost), già nella forma con cui si confrontano. */
    fun linkIn(testo: String): Set<String> = LINK.findAll(testo).map { forma(it.value.trimEnd('.', ',', ';')) }.toSet()

    private fun forma(l: String) = l.lowercase().removePrefix("https://").removePrefix("http://").removePrefix("www.").trimEnd('/')

    fun noto(link: String, noti: Set<String>): Boolean = forma(link) in noti

    /** Il turno di lavoro è dovuto: motore acceso, mai lavorato o lavorato da almeno ritmoGiorni. */
    fun dovuto(p: Percorso, oggi: LocalDate): Boolean = !p.archiviato && p.ritmoGiorni > 0 &&
        (p.ultimoLavoro == null || ChronoUnit.DAYS.between(LocalDate.parse(p.ultimoLavoro), oggi) >= p.ritmoGiorni)

    /** Cosa deve fare il turno: la forma dichiarata prima, letta due volte (nel prompt e nel controllo dopo). */
    data class Forma(val senzaFonte: List<String>, val senzaPasso: Boolean, val senzaPezzi: Boolean) {
        val vuota get() = senzaFonte.isEmpty() && !senzaPasso && !senzaPezzi
        fun detta(): String = buildList {
            if (senzaPezzi) add("il fronte non ha pezzi: proponi i nodi con aggiungi_nodi (i brani, i capitoli, gli esercizi)")
            if (senzaFonte.isNotEmpty()) add("cerca con cerca_nel_web e proponi con fonte_nodo una fonte per: ${senzaFonte.take(5).joinToString("; ") { "«$it»" }}" +
                " (un video o una traccia per studiarlo; il link copiato dalle fonti della ricerca)")
            if (senzaPasso) add("proponi con regola_fronte il prossimo passo, una riga concreta")
        }.joinToString("; ")
    }

    fun forma(p: Percorso, nodi: List<Nodo>): Forma {
        val pezzi = Pratica.pezzi(nodi.filter { it.percorsoId == p.id })
        return Forma(pezzi.filter { it.fonte == null && Pratica.fase(it) != Pratica.Fase.PRONTO }.map { it.etichetta }, p.prossimoPasso.isBlank(), pezzi.isEmpty())
    }

    /** Dopo il turno: quante proposte di quale tipo. È il conto del programma, non ciò che lo Shell dice di aver fatto. */
    fun conto(proposte: List<Proposta>): String {
        val fonti = proposte.count { it is Proposta.FonteNodo }
        val regole = proposte.count { it is Proposta.RegolaFronte }
        val nodi = proposte.count { it is Proposta.AggiungiNodi }
        return listOfNotNull(fonti.takeIf { it > 0 }?.let { "$it " + if (it == 1) "fonte" else "fonti" },
            regole.takeIf { it > 0 }?.let { "il prossimo passo" }, nodi.takeIf { it > 0 }?.let { "nodi nuovi" },
            (proposte.size - fonti - regole - nodi).takeIf { it > 0 }?.let { "$it altre" }).joinToString(", ").ifEmpty { "nessuna proposta" }
    }
}
