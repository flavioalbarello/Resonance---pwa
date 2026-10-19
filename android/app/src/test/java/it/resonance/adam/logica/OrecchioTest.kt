package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoPratica
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

// L'Orecchio su segnali sintetici: note di basso (un la a 55 Hz con le armoniche, che si spengono) suonate a tempi noti,
// sopra un fondo di rumore. Il rilevatore le deve trovare dove sono, e il giudizio deve distinguere chi tiene il tempo.
class OrecchioTest {
    private val f = Orecchio.FREQUENZA

    private fun suona(tempi: List<Double>, durata: Double, rumore: Double = 0.003, seme: Int = 1): ShortArray {
        val r = Random(seme)
        val x = DoubleArray((durata * f).toInt()) { (r.nextDouble() - 0.5) * 2 * rumore }
        tempi.forEach { t ->
            val i0 = (t * f).toInt()
            for (k in 0 until (0.35 * f).toInt()) {
                val i = i0 + k; if (i >= x.size) break
                val s = k.toDouble() / f
                val inv = exp(-s * 9) * (1 - exp(-s * 900))
                x[i] += 0.5 * inv * (sin(2 * PI * 55 * s) + 0.5 * sin(2 * PI * 110 * s) + 0.25 * sin(2 * PI * 165 * s))
            }
        }
        return ShortArray(x.size) { (x[it].coerceIn(-1.0, 1.0) * 32767).toInt().toShort() }
    }

    private fun ascolta(audio: ShortArray): List<Double> {
        val r = Orecchio.Rilevatore()
        // A pezzi, come arrivano dal microfono.
        return audio.toList().chunked(1024).flatMap { r.nutri(it.toShortArray()) }
    }

    @Test fun trovaLeNoteDoveSono() {
        val tempi = (0 until 24).map { 0.5 + it * 0.25 }       // crome a 120 bpm
        val trovati = ascolta(suona(tempi, 7.0))
        assertEquals(tempi.size, trovati.size)
        tempi.zip(trovati).forEach { (vero, sentito) -> assertTrue("$vero contro $sentito", abs(vero - sentito) < 0.02) }
    }

    @Test fun nelSilenzioNonSenteNiente() {
        assertTrue(ascolta(suona(emptyList(), 4.0, rumore = 0.01)).isEmpty())
    }

    @Test fun chiTieneIlTempoEPulitoChiNoNo() {
        val r = Random(5)
        val fermi = (0 until 32).map { 0.5 + it * 0.25 }
        val g = Orecchio.giudica(ascolta(suona(fermi, 9.5)))
        assertEquals(EsitoPratica.PULITO, g.esito); assertEquals(120.0, g.bpm, 2.0); assertTrue(g.scartoMedioMs < 15)
        // Mano incerta: ±60 ms a caso.
        val incerti = fermi.map { it + (r.nextDouble() - 0.5) * 0.12 }
        val gi = Orecchio.giudica(ascolta(suona(incerti, 9.5))); assertEquals(gi.riga(), EsitoPratica.ERRORI, gi.esito)
        // Corre: ogni nota un po' prima della precedente misura (da 120 a ~132 bpm).
        var t = 0.5; val corre = (0 until 32).map { k -> t.also { t += 0.25 * (1 - 0.003 * k) } }
        val gc = Orecchio.giudica(ascolta(suona(corre, 9.5)))
        assertTrue(gc.riga(), gc.deriva > Orecchio.DERIVA && gc.riga().contains("corri"))
        // Troppe poche note: non giudica.
        assertNull(Orecchio.giudica(ascolta(suona(fermi.take(6), 3.0))).esito)
    }

    @Test fun ilColoreDelloScarto() {
        assertEquals(Orecchio.Senso.A_TEMPO, Orecchio.senso(12.0))
        assertEquals(Orecchio.Senso.CORRI, Orecchio.senso(-40.0))
        assertEquals(Orecchio.Senso.TRASCINI, Orecchio.senso(40.0))
        // Col bpm atteso (100 bpm × 80% di Moises = 80): crome a 80 bpm sono a tempo.
        val crome = (0 until 20).map { it * 0.375 }
        assertTrue(Orecchio.battute(crome, 80.0).all { abs(it.scartoMs) < 1 })
    }
}
