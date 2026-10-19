package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import kotlin.random.Random

// Le scoperte: ciò che c'è si trova, il caso non si spaccia per scoperta, l'ovvio non si dice.
class ScoperteTest {
    private val oggi = LocalDate.parse("2026-10-19")
    private val inizio = oggi.minusDays(60)
    private val giorni = generateSequence(inizio) { it.plusDays(1) }.takeWhile { it.isBefore(oggi) }.toList()
    private fun sonno(r: Random, effetto: (LocalDate) -> Double) = giorni.map { g ->
        Misura(tipo = TipoMisura.SONNO, valore = 400 + r.nextDouble(-35.0, 35.0) + effetto(g), giorno = g.toString(), istante = 0, fonte = "hc", idEsterno = "s$g")
    }
    private val stretching = Rituale(id = 1, nome = "Stretching", pilastro = Pilastro.BIO, creato = 0)

    @Test fun unEffettoVeroSiTrovaESiDiceInItaliano() {
        val r = Random(7)
        val fatti = giorni.filter { r.nextBoolean() }.toSet()
        // La notte dopo lo stretching si dorme 45 minuti in più.
        val misure = sonno(Random(1)) { g -> if (g.minusDays(1) in fatti) 45.0 else 0.0 }
        val trovate = Scoperte.cerca(misure, Scoperte.cause(misure, listOf(stretching to fatti), oggi), oggi)
        val s = trovate.first { it.causa.chiave == "rituale:1" }
        assertEquals(TipoMisura.SONNO, s.effetto); assertEquals(1, s.ritardo)
        assertTrue(s.differenza in 30.0..60.0)
        assertTrue(s.testo(), s.testo().startsWith("Le sere in cui fai «Stretching», la notte dopo dormi") && s.testo().contains("in più"))
        val e = Scoperte.esperimento(s)
        assertEquals(TipoMisura.SONNO, e.tipo); assertEquals(it.resonance.adam.dati.Direzione.SU, e.direzione); assertEquals(14, e.giorni)
    }

    @Test fun ilCasoNonEUnaScoperta() {
        // Cinquanta mondi di puro rumore: in nessuno si deve «scoprire» qualcosa.
        repeat(50) { k ->
            val r = Random(100 + k)
            val fatti = giorni.filter { r.nextBoolean() }.toSet()
            val misure = sonno(Random(200 + k)) { 0.0 } + giorni.map { g ->
                Misura(tipo = TipoMisura.PASSI, valore = 6000 + r.nextDouble(-2500.0, 2500.0), giorno = g.toString(), istante = 0, fonte = "hc", idEsterno = "p$g")
            }
            val trovate = Scoperte.cerca(misure, Scoperte.cause(misure, listOf(stretching to fatti), oggi), oggi)
            assertTrue("mondo $k: ${trovate.map { it.testo() }}", trovate.isEmpty())
        }
    }

    @Test fun lOvvioNonSiDiceEPocheVolteNonBastano() {
        // Un rituale automatico «sonno almeno 7h» e il sonno sono la stessa cosa.
        val auto = Rituale(id = 2, nome = "Dormire 7 ore", pilastro = Pilastro.BIO, creato = 0, criterio = "SONNO>=420")
        val misure = sonno(Random(3)) { 0.0 }
        val alti = misure.filter { it.valore >= 420 }.map { LocalDate.parse(it.giorno).minusDays(1) }.toSet()
        assertTrue(Scoperte.cerca(misure, Scoperte.cause(misure, listOf(auto to alti), oggi), oggi).none { it.causa.chiave == "rituale:2" })
        // Tre volte sole: non si prova nemmeno.
        val tre = giorni.take(3).toSet()
        val forte = sonno(Random(4)) { g -> if (g.minusDays(1) in tre) 120.0 else 0.0 }
        assertTrue(Scoperte.cerca(forte, Scoperte.cause(forte, listOf(stretching to tre), oggi), oggi).none { it.causa.chiave == "rituale:1" })
    }

    @Test fun laPermutazioneDiceQuantoEFacileIlCaso() {
        val r = Random(9)
        assertTrue(Scoperte.permutazione(List(20) { 10.0 + it % 3 }, List(20) { 30.0 + it % 3 }, r) < 0.001)
        assertTrue(Scoperte.permutazione(List(20) { (it % 5).toDouble() }, List(20) { (it % 5).toDouble() }, r) > 0.5)
    }
}
