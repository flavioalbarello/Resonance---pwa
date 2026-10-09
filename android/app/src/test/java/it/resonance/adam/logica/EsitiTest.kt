package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class EsitiTest {
    private val oggi = LocalDate.of(2026, 9, 23)
    private fun m(tipo: TipoMisura, v: Double, giorniFa: Long, ist: Long = 0, legata: Boolean? = null) =
        Misura(tipo = tipo, valore = v, giorno = oggi.minusDays(giorniFa).toString(), istante = ist, fonte = "t", legataAlTempo = legata)

    @Test fun pesoPrendeLUltimaMisuraDelGiornoNonLaMedia() {
        val serie = Esiti.serieGiornaliera(listOf(m(TipoMisura.PESO, 82.0, 0, 1), m(TipoMisura.PESO, 81.0, 0, 2)), TipoMisura.PESO)
        assertEquals(81.0, serie.single().valore, 0.0)
    }

    @Test fun pesoConfrontaConIlPrimoDatoDeiTrentaGiorni() {
        val s = Esiti.sintesi(listOf(m(TipoMisura.PESO, 85.0, 20), m(TipoMisura.PESO, 83.5, 0)), TipoMisura.PESO, oggi)
        assertEquals(83.5, s.valore!!, 0.0)
        assertEquals(-1.5, s.delta!!, 1e-9)
    }

    @Test fun unaMisuraSolaNonFaTendenza() {
        val s = Esiti.sintesi(listOf(m(TipoMisura.PESO, 85.0, 3)), TipoMisura.PESO, oggi)
        assertNull(s.delta)
    }

    @Test fun sonnoMediaSetteGiorniControSettimanaPrima() {
        val misure = (0L..6L).map { m(TipoMisura.SONNO, 420.0, it) } + (7L..13L).map { m(TipoMisura.SONNO, 360.0, it) }
        val s = Esiti.sintesi(misure, TipoMisura.SONNO, oggi)
        assertEquals(420.0, s.valore!!, 0.0)
        assertEquals(360.0, s.confronto!!, 0.0)
    }

    @Test fun praticaSommaISetteGiorni() {
        val s = Esiti.sintesi(listOf(m(TipoMisura.PRATICA, 30.0, 0), m(TipoMisura.PRATICA, 45.0, 6), m(TipoMisura.PRATICA, 90.0, 7)), TipoMisura.PRATICA, oggi)
        assertEquals(75.0, s.valore!!, 0.0)
        assertEquals(90.0, s.confronto!!, 0.0)
    }

    @Test fun senzaDatiLaSintesiEVuotaELaRigaLoDice() {
        val s = Esiti.sintesi(emptyList(), TipoMisura.SONNO, oggi)
        assertTrue(s.vuota)
        assertEquals("Sonno: nessun dato", Esiti.riga(s, oggi))
    }

    @Test fun laRigaDichiaraUnDatoStantio() {
        val s = Esiti.sintesi(listOf(m(TipoMisura.PESO, 80.0, 12)), TipoMisura.PESO, oggi)
        assertTrue(Esiti.riga(s, oggi).contains("12 giorni fa"))
    }

    @Test fun entrateNonLegateAlTempoSeparate() {
        val mese = YearMonth.from(oggi)
        val misure = listOf(m(TipoMisura.ENTRATA, 100.0, 1, legata = false), m(TipoMisura.ENTRATA, 900.0, 2, legata = true))
        assertEquals(100.0, Esiti.entrateMese(misure, mese, true), 0.0)
        assertEquals(1000.0, Esiti.entrateMese(misure, mese, false), 0.0)
    }

    @Test fun oreLeggibili() {
        assertEquals("7h30", Esiti.ore(450.0))
        assertEquals("8h", Esiti.ore(480.0))
        assertEquals("45 min", Esiti.ore(45.0))
    }
}
