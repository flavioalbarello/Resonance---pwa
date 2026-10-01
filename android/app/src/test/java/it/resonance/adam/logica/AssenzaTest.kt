package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Voce
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// «Sono via» (riunione del 01/10/2026): ciò che decide il programma, senza Android.
class AssenzaTest {
    private val oggi = LocalDate.of(2026, 10, 1)
    private fun g(fa: Long) = oggi.minusDays(fa)
    private fun voce(t: String, fonte: String = Assenza.FONTE) = Voce(pilastro = Pilastro.ADAM, giorno = "x", testo = t, fonte = fonte, creato = 0, aggiornato = 0)

    // Quattro giorni di febbre non rompono la serie e non abbassano il 14: si saltano.
    @Test fun iGiorniDiPausaNonRompononLaSerieENonContanoNeiQuattordici() {
        val tenuti = setOf(g(0), g(5), g(6), g(7))
        val pausa = setOf(g(1), g(2), g(3), g(4))
        assertEquals(1, Stabilita.tenuta(tenuti, oggi).serie)
        assertEquals(4, Stabilita.tenuta(tenuti, oggi, pausa).serie)
        // Gli ultimi 14 giorni in cui il Ghost c'era: oggi e 13 prima della pausa e dopo.
        assertEquals(4, Stabilita.tenuta(tenuti, oggi, pausa).tenutiSu14)
        // Oggi in pausa e non spuntato: non è una rottura.
        assertEquals(3, Stabilita.tenuta(setOf(g(1), g(2), g(3)), oggi, setOf(g(0))).serie)
    }

    @Test fun ilPeriodoSiLeggeDallaVoceDelDiario() {
        val aperta = voce(Assenza.testoApertura(g(3)))
        assertEquals(Assenza.Periodo(g(3), null), Assenza.periodo(aperta))
        val chiusa = voce(Assenza.testoChiusura(g(10), g(8), "Consegne spostate: 1."))
        assertEquals(Assenza.Periodo(g(10), g(8)), Assenza.periodo(chiusa))
        assertTrue(Assenza.testoChiusura(g(10), g(8), "").contains("3 giorni"))
        assertNull(Assenza.periodo(voce(Assenza.testoApertura(g(3)), fonte = "manuale")))
        assertEquals(g(3), Assenza.inCorso(listOf(chiusa, aperta))!!.second.da)
        assertNull(Assenza.inCorso(listOf(chiusa)))
    }

    @Test fun iGiorniDiPausaArrivanoFinoAOggiPerQuellaInCorso() {
        val giorni = Assenza.giorniDiPausa(listOf(Assenza.Periodo(g(10), g(9)), Assenza.Periodo(g(2), null)), oggi)
        assertEquals(setOf(g(10), g(9), g(2), g(1), g(0)), giorni)
    }

    @Test fun ilRiepilogoDiceCosaESpostatoECosaAspetta() {
        val r = Assenza.riepilogo(4, emptyList(), emptyList(), 2)
        assertTrue(r, r.contains("via 4 giorni") && r.contains("non contano come saltati") && r.contains("2 proposte"))
    }

    // L'orologio del taccuino si ferma quando il Ghost è via (01/10/2026): tre settimane di malattia non devono far
    // evaporare tutte le ipotesi dello Shell, che non ha potuto riprenderle.
    @Test fun iGiorniDiPausaNonFannoEvaporareLeIpotesiDelloShell() {
        val utc = java.time.ZoneOffset.UTC
        val ms = { d: LocalDate -> d.atTime(12, 0).toInstant(utc).toEpochMilli() }
        val nota = it.resonance.adam.dati.Nota(id = 1, testo = "[ipotesi] x", creata = ms(g(25)), ripresa = ms(g(25)))
        val ora = ms(oggi)
        // Senza pausa: 25 giorni, evaporata.
        assertTrue(!Taccuino.viva(nota, ora))
        // Dieci giorni di malattia in mezzo: ne contano 15, restano 6.
        val pausa = (5L..14L).map { g(it) }.toSet()
        assertEquals(15L * 86_400_000L, Taccuino.trascorso(nota, ora, pausa, utc))
        assertTrue(Taccuino.viva(nota, ora, pausa))
        // Un giorno di pausa prima della ripresa non conta: l'orologio partiva dopo.
        assertEquals(25L * 86_400_000L, Taccuino.trascorso(nota, ora, setOf(g(30)), utc))
    }
}
