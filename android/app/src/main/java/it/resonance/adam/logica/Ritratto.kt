package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Sessione
import it.resonance.adam.dati.StatoNodo
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.exp

// Il Ritratto di Adam (19/10/2026). Un'immagine viva, disegnata ogni giorno dai dati veri: i pilastri sono petali che
// crescono con l'attività, i rituali anelli che si chiudono quando reggono, i fronti rami che si allungano quando si
// lavorano, i pezzi pronti foglie piene e quelli da fare foglie vuote. Le carenze si vedono: un pilastro fermo da due
// settimane è un petalo vuoto, tratteggiato. Ciò che non si pratica sbiadisce (mezza vita di una settimana).
// È Adam City in piccolo: nessun campo da riempire, quindi millantare è impossibile. Il modello è deterministico —
// gli stessi dati, la stessa immagine — e il disegno (ui/RitrattoUi.kt) lo legge e basta.
object Ritratto {
    const val FINESTRA = 28
    const val MEZZA_VITA = 7.0
    const val CARENZA = 14

    data class Petalo(val pilastro: Pilastro, val vita: Float, val giorniFermo: Int?, val carenza: Boolean)
    data class Anello(val nome: String, val pilastro: Pilastro, val tenuta: Float, val oggi: Boolean)
    data class Ramo(val titolo: String, val pilastro: Pilastro, val avanzamento: Float, val vigore: Float, val pronti: Int, val daFare: Int)
    data class Modello(val giorno: LocalDate, val petali: List<Petalo>, val anelli: List<Anello>, val rami: List<Ramo>, val seme: Int) {
        /** Ciò che l'immagine dice, in parole: sotto il ritratto, e per chi non la vede. */
        fun legenda(): List<String> = petali.map { p ->
            p.pilastro.etichetta + ": " + when {
                p.carenza -> "fermo" + (p.giorniFermo?.let { " da $it giorni" } ?: "") + ", è un vuoto"
                p.vita >= 0.6f -> "vivo"
                p.vita >= 0.25f -> "acceso"
                else -> "debole"
            }
        } + rami.filter { it.vigore > 0f }.sortedByDescending { it.vigore }.take(2).map { "«${it.titolo}» cresce: ${it.pronti} pronti su ${it.pronti + it.daFare}" } +
            anelli.filter { it.tenuta >= 0.7f }.take(2).map { "«${it.nome}» regge" }
    }

    private fun peso(giorni: Long) = exp(-giorni / MEZZA_VITA)

    /** Quanto è vivo un insieme di giorni attivi, da 0 a 1: ogni giorno pesa meno quanto più è lontano. */
    fun vita(attivi: Set<LocalDate>, oggi: LocalDate): Float {
        val tot = (0 until FINESTRA).sumOf { peso(it.toLong()) }
        val v = attivi.map { ChronoUnit.DAYS.between(it, oggi) }.filter { it in 0 until FINESTRA }.distinct().sumOf { peso(it) }
        return (v / tot * 2.2).coerceIn(0.0, 1.0).toFloat()   // ×2.2: un giorno su due vale «vivo»
    }

    fun da(i: Istantanea, sessioni: List<Sessione>, zona: ZoneId = ZoneId.systemDefault()): Modello {
        val oggi = i.oggi
        val giornoSessione = { s: Sessione -> Instant.ofEpochMilli(s.inizio).atZone(zona).toLocalDate() }
        val stati = Contesto.statoRituali(i)
        val petali = listOf(Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA).map { p ->
            val attivi = buildSet {
                i.misure.filter { it.tipo.pilastro == p }.forEach { add(LocalDate.parse(it.giorno)) }
                stati.filter { it.rituale.pilastro == p }.forEach { addAll(it.giorni) }
                val fronti = i.percorsi.filter { it.pilastro == p }.map { it.id }.toSet()
                sessioni.filter { it.percorsoId in fronti }.forEach { add(giornoSessione(it)) }
                i.nodi.filter { it.percorsoId in fronti }.mapNotNull { it.ultimaPratica }.forEach { add(LocalDate.parse(it)) }
            }.filter { !it.isAfter(oggi) }.toSet()
            val ultimo = attivi.maxOrNull()
            val fermo = ultimo?.let { ChronoUnit.DAYS.between(it, oggi).toInt() }
            Petalo(p, vita(attivi, oggi), fermo, fermo == null || fermo >= CARENZA)
        }
        val anelli = stati.map { Anello(it.rituale.nome, it.rituale.pilastro, it.tenuta.tenutiSu14 / 14f, it.tenuta.oggi) }
        val rami = i.percorsi.filter { !it.archiviato }.map { per ->
            val pezzi = Pratica.pezzi(i.nodi.filter { it.percorsoId == per.id })
            val pronti = pezzi.count { it.stato == StatoNodo.CONSOLIDATO }
            val giorni = sessioni.filter { it.percorsoId == per.id }.map(giornoSessione).toSet() +
                pezzi.mapNotNull { it.ultimaPratica }.map { LocalDate.parse(it) }
            Ramo(per.titolo, per.pilastro, Nodi.avanzamento(pezzi), vita(giorni, oggi), pronti, pezzi.size - pronti)
        }
        return Modello(oggi, petali, anelli, rami, oggi.toEpochDay().toInt())
    }

}
