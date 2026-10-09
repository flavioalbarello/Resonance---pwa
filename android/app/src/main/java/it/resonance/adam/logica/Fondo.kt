package it.resonance.adam.logica

import it.resonance.adam.dati.Movimento
import it.resonance.adam.dati.TipoMovimento
import java.time.LocalDate
import java.util.Locale

// Il fondo di Adam, contato dal programma. Le soglie le ha scritte lo Shell (lettera del 25/09/2026): sotto metà del
// versato «modalità sopravvivenza» (solo ciò che è già pagato, niente asset nuovi); a zero «fermo» (nessuna azione nel
// mondo, niente nuove richieste al Ghost). L'autosufficienza è sua: entrate sue che coprono i costi del fondo. La spesa
// dei modelli è un'altra cosa (il tetto mensile del Ghost) e qui non si mescola: è in dollari e non è sua.
object Fondo {
    enum class Modo(val etichetta: String) {
        VUOTO("nessun fondo ancora: aspetta il primo versamento del Ghost"),
        PIENO("pieno regime"),
        SOPRAVVIVENZA("modalità sopravvivenza: sotto metà del versato, niente asset nuovi, solo ciò che è già pagato"),
        FERMO("fermo: saldo a zero, nessuna azione nel mondo e nessuna nuova richiesta al Ghost"),
    }

    data class Stato(val versato: Double, val entrate: Double, val uscite: Double, val saldo: Double,
                     val entrate30: Double, val uscite30: Double, val modo: Modo)

    fun stato(m: List<Movimento>, oggi: LocalDate): Stato {
        fun somma(t: TipoMovimento, l: List<Movimento> = m) = l.filter { it.tipo == t }.sumOf { it.importo }
        val recenti = m.filter { runCatching { !LocalDate.parse(it.giorno).isBefore(oggi.minusDays(29)) }.getOrDefault(false) }
        val versato = somma(TipoMovimento.VERSAMENTO)
        val entrate = somma(TipoMovimento.ENTRATA)
        val uscite = somma(TipoMovimento.USCITA)
        val saldo = versato + entrate - uscite
        val modo = when {
            versato <= 0.0 -> Modo.VUOTO
            saldo <= 0.0 -> Modo.FERMO
            saldo < versato / 2 -> Modo.SOPRAVVIVENZA
            else -> Modo.PIENO
        }
        return Stato(versato, entrate, uscite, saldo, somma(TipoMovimento.ENTRATA, recenti), somma(TipoMovimento.USCITA, recenti), modo)
    }

    /** Autosufficiente negli ultimi 30 giorni: le sue entrate coprono le sue uscite, e qualcosa è entrato davvero. */
    fun autosufficiente(s: Stato) = s.entrate30 > 0.0 && s.entrate30 >= s.uscite30

    fun euro(v: Double) = String.format(Locale.ITALIAN, "%.2f €", v)

    fun righe(s: Stato): List<String> =
        if (s.modo == Modo.VUOTO) listOf(Modo.VUOTO.etichetta)
        else listOf(
            "Saldo ${euro(s.saldo)} (versato ${euro(s.versato)}, entrate ${euro(s.entrate)}, uscite ${euro(s.uscite)})",
            "Ultimi 30 giorni: entrate ${euro(s.entrate30)}, uscite ${euro(s.uscite30)} — " +
                if (autosufficiente(s)) "autosufficiente" else "non ancora autosufficiente",
            "Modo: ${s.modo.etichetta}",
        )
}
