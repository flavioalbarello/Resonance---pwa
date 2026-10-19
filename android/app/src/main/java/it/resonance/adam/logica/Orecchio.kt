package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoPratica
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.roundToInt

// L'Orecchio (19/10/2026): mentre il Ghost suona il basso sopra Moises in cuffia, il microfono del telefono sente solo
// lui. Il programma trova gli attacchi delle note e misura quanto sono regolari: se corre, se trascina, di quanti
// millisecondi. Niente modelli, niente rete: elaborazione del segnale sul telefono, provata su segnali sintetici.
//
// Cosa NON può sapere: la traccia di Moises è in cuffia e il microfono non la sente. Quindi misura il tempo del Ghost
// rispetto a sé stesso (la griglia che le sue note disegnano), non rispetto al disco. Se il brano ha una velocità nota
// (bpm × la % di Moises), si confronta anche con quella. L'esito che propone è un suggerimento: lo conferma il Ghost.
object Orecchio {
    const val FREQUENZA = 22050
    private const val PASSO = 220            // 10 ms a 22050 Hz
    private const val MIN_TRA = 0.09         // due attacchi più vicini di 90 ms sono la stessa nota
    const val A_TEMPO_MS = 25.0              // entro ±25 ms: a tempo
    const val PULITO_MS = 20.0               // scarto medio dalla griglia sotto cui il blocco è pulito
    const val DERIVA = 0.03                  // ±3% di tempo dall'inizio alla fine: corre o trascina
    const val MINIMO_NOTE = 16

    /**
     * Il rilevatore a flusso: gli si danno i campioni come arrivano dal microfono, restituisce i tempi (in secondi
     * dall'inizio) degli attacchi trovati. Filtro passa-basso (il basso sta sotto i 300 Hz), energia ogni 10 ms in
     * decibel, salita dell'energia rispetto ai 40 ms prima, soglia adattiva sul rumore di fondo.
     */
    class Rilevatore(private val frequenza: Int = FREQUENZA) {
        private val alfa = 1.0 - exp(-2.0 * Math.PI * 300.0 / frequenza)
        private var filtrato = 0.0
        private var somma = 0.0
        private var nel = 0
        private var campioni = 0L
        private val storia = ArrayDeque<Double>()            // energia in dB delle ultime finestre
        private var fondo = -60.0                             // il rumore di fondo, che si adatta piano
        private var ultimo = -1.0
        private val passo = (frequenza / 100.0).roundToInt()

        fun nutri(buffer: ShortArray, n: Int = buffer.size): List<Double> {
            val trovati = mutableListOf<Double>()
            for (k in 0 until n) {
                val x = buffer[k] / 32768.0
                filtrato += alfa * (x - filtrato)
                somma += filtrato * filtrato; nel++; campioni++
                if (nel == passo) {
                    val db = 10 * log10(somma / nel + 1e-12)
                    somma = 0.0; nel = 0
                    val t = campioni.toDouble() / frequenza
                    val prima = if (storia.size >= 4) storia[storia.size - 4] else storia.firstOrNull() ?: db
                    val salita = db - prima
                    // Il fondo segue l'energia quando è bassa (silenzio fra le note), non quando suona.
                    if (db < fondo + 6) fondo += 0.05 * (db - fondo) else fondo += 0.002 * (db - fondo)
                    if (salita > 9 && db > fondo + 15 && (ultimo < 0 || t - ultimo > MIN_TRA)) {
                        // L'attacco è a inizio salita: si torna indietro di una finestra.
                        val inizio = t - 0.02
                        trovati += inizio; ultimo = t
                    }
                    storia.addLast(db); if (storia.size > 8) storia.removeFirst()
                }
            }
            return trovati
        }
    }

    /** Lo stato di un attacco rispetto alla griglia delle note prima: scarto in ms (negativo = in anticipo, corri). */
    data class Battuta(val tempo: Double, val scartoMs: Double)

    /**
     * La griglia: la suddivisione di base è l'intervallo mediano fra le note (crome, semiminime: quello che il Ghost
     * suona di più), o il bpm atteso se c'è (bpm del brano × % di Moises). Ogni nota cade su un passo intero della
     * griglia; la griglia si adatta alle note coi minimi quadrati (dove comincia, quanto è larga), e lo scarto di una
     * nota è la sua distanza dalla griglia. Così si misura la posizione, come la sente chi ascolta: confrontare solo
     * una nota con la precedente lasciava passare una mano incerta (il banco, 19/10).
     */
    fun battute(attacchi: List<Double>, bpmAtteso: Double? = null): List<Battuta> {
        if (attacchi.size < 3) return emptyList()
        val ioi = attacchi.zipWithNext { a, b -> b - a }
        val base = bpmAtteso?.let { suddivisione(60.0 / it, ioi) } ?: mediana(ioi)
        val passi = ioi.map { (it / base).roundToInt().coerceAtLeast(1) }.runningFold(0) { a, b -> a + b }.map { it.toDouble() }
        val mn = passi.average(); val mt = attacchi.average()
        val cov = passi.indices.sumOf { (passi[it] - mn) * (attacchi[it] - mt) }
        val varn = passi.sumOf { (it - mn) * (it - mn) }
        val larghezza = if (bpmAtteso != null || varn == 0.0) base else cov / varn
        val inizio = mt - larghezza * mn
        return attacchi.mapIndexed { i, t -> Battuta(t, (t - (inizio + larghezza * passi[i])) * 1000) }
    }

    /** Il battito atteso diviso fino alla suddivisione più vicina a ciò che il Ghost suona (1, 1/2, 1/3, 1/4). */
    private fun suddivisione(battito: Double, ioi: List<Double>): Double {
        val m = mediana(ioi)
        return listOf(1.0, 2.0, 3.0, 4.0).map { battito / it }.minBy { abs(ln(it / m)) }
    }

    fun mediana(x: List<Double>): Double = x.sorted().let { if (it.isEmpty()) 0.0 else if (it.size % 2 == 1) it[it.size / 2] else (it[it.size / 2 - 1] + it[it.size / 2]) / 2 }

    /** Com'è andata: tempo, regolarità, deriva, e l'esito che il programma suggerisce. */
    data class Giudizio(val note: Int, val bpm: Double, val scartoMedioMs: Double, val deriva: Double, val esito: EsitoPratica?) {
        fun riga(): String = if (esito == null) "Non ti ho sentito abbastanza ($note note)" else
            "${bpm.roundToInt()} bpm · ±${scartoMedioMs.roundToInt()} ms" + when {
                deriva > DERIVA -> " · corri (+${(deriva * 100).roundToInt()}%)"
                deriva < -DERIVA -> " · trascini (${(deriva * 100).roundToInt()}%)"
                else -> " · tempo fermo"
            } + " → " + (if (esito == EsitoPratica.PULITO) "pulito" else "con errori")
    }

    fun giudica(attacchi: List<Double>, bpmAtteso: Double? = null): Giudizio {
        val b = battute(attacchi, bpmAtteso)
        if (attacchi.size < MINIMO_NOTE || b.isEmpty()) return Giudizio(attacchi.size, 0.0, 0.0, 0.0, null)
        val ioi = attacchi.zipWithNext { a, c -> c - a }
        val base = mediana(ioi)
        val scarto = b.map { abs(it.scartoMs) }.average()
        // La deriva: ogni intervallo riportato alla base (diviso per quante basi contiene), la prima metà contro la seconda.
        // Intervalli che si accorciano = si corre (deriva positiva).
        val unita = ioi.map { it / (it / base).roundToInt().coerceAtLeast(1) }
        val meta = unita.size / 2
        val primo = mediana(unita.take(meta)); val secondo = mediana(unita.drop(meta))
        val deriva = if (secondo > 0) primo / secondo - 1 else 0.0
        // Il bpm detto come lo dice un musicista: la base portata nella fascia 60–180.
        var bpm = 60.0 / base
        while (bpm < 60) bpm *= 2
        while (bpm > 180) bpm /= 2
        val esito = if (scarto <= PULITO_MS && abs(deriva) <= DERIVA) EsitoPratica.PULITO else EsitoPratica.ERRORI
        return Giudizio(attacchi.size, bpm, scarto, deriva, esito)
    }

    /** Il colore dell'anello per uno scarto: a tempo, corri, trascini. */
    enum class Senso { A_TEMPO, CORRI, TRASCINI }
    fun senso(scartoMs: Double): Senso = when {
        abs(scartoMs) <= A_TEMPO_MS -> Senso.A_TEMPO
        scartoMs < 0 -> Senso.CORRI
        else -> Senso.TRASCINI
    }

}
