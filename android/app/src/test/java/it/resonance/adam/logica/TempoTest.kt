package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

// La mappa del tempo (V3 fase 5): i buchi fra gli impegni, dove cade adesso, quando proporre lo studio.
class TempoTest {
    private val oggi = LocalDate.parse("2026-10-16")
    private fun e(da: String, a: String, tutto: Boolean = false) = Evento("blocco", oggi.atTime(LocalTime.parse(da)), oggi.atTime(LocalTime.parse(a)), tutto)
    private val giornata = listOf(e("09:00", "13:00"), e("14:30", "19:00"), e("00:00", "23:59", tutto = true), e("21:00", "23:00"))

    @Test fun iBuchiStannoFraGliImpegniEGliEventiDiTuttoIlGiornoNonOccupano() {
        val b = Tempo.buchi(giornata, oggi)
        assertEquals(listOf("08:00-09:00", "13:00-14:30", "19:00-21:00"), b.map { "${it.da.toLocalTime()}-${it.a.toLocalTime()}" })
        assertEquals(listOf("08:00-22:00"), Tempo.buchi(emptyList(), oggi).map { "${it.da.toLocalTime()}-${it.a.toLocalTime()}" })
    }

    @Test fun adessoSiSaSeCeTempoEQuanto() {
        assertTrue(Tempo.adesso(giornata, oggi.atTime(10, 0)) is Tempo.Adesso.Impegnato)
        val l = Tempo.adesso(giornata, oggi.atTime(19, 15)) as Tempo.Adesso.Libero
        assertEquals(105, l.minuti); assertEquals("105′ liberi, fino alle 21:00", Tempo.riga(l))
        assertEquals(Tempo.Adesso.Fuori, Tempo.adesso(giornata, oggi.atTime(23, 30)))
        assertEquals(100, Tempo.daStudiare(105)); assertEquals(120, Tempo.daStudiare(400)); assertEquals(0, Tempo.daStudiare(4))
    }

    @Test fun laPropostaCadeNelPrimoBucoDopoLOraScelta() {
        // Alle 18:30 c'è un impegno fino alle 19: la proposta va alle 19.
        assertEquals(oggi.atTime(19, 0), Tempo.daProporre(giornata, oggi, oggi.atTime(7, 30))!!.da)
        // Calendario vuoto: all'ora scelta.
        assertEquals(oggi.atTime(18, 30), Tempo.daProporre(emptyList(), oggi, oggi.atTime(7, 30))!!.da)
        assertEquals(oggi.atTime(17, 0), Tempo.daProporre(emptyList(), oggi, oggi.atTime(7, 30), LocalTime.of(17, 0))!!.da)
        // Già passata la sera: niente.
        assertNull(Tempo.daProporre(emptyList(), oggi, oggi.atTime(21, 50)))
    }
}
