package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class StabilitaTest {
    private val oggi = LocalDate.of(2026, 9, 23)

    @Test fun criterioSiLeggeEConfronta() {
        val c = Stabilita.leggiCriterio("SONNO >= 420")!!
        assertEquals(TipoMisura.SONNO, c.tipo)
        assertTrue(c.soddisfatto(420.0))
        assertFalse(c.soddisfatto(419.0))
        assertEquals("SONNO>=420", c.toString())
    }

    @Test fun criterioStortoNonSiIndovina() {
        assertNull(Stabilita.leggiCriterio("dormire bene"))
        assertNull(Stabilita.leggiCriterio("RESPIRO>=3"))
    }

    @Test fun oggiNonAncoraSpuntatoNonRompeLaSerie() {
        val giorni = setOf(oggi.minusDays(1), oggi.minusDays(2), oggi.minusDays(3))
        val t = Stabilita.tenuta(giorni, oggi)
        assertEquals(3, t.serie)
        assertFalse(t.oggi)
    }

    @Test fun unBucoInterrompeLaSerieMaNonITenutiSu14() {
        val giorni = setOf(oggi, oggi.minusDays(2), oggi.minusDays(3), oggi.minusDays(20))
        val t = Stabilita.tenuta(giorni, oggi)
        assertEquals(1, t.serie)
        assertEquals(3, t.tenutiSu14)
    }

    @Test fun spunteAutomaticheDaMisura() {
        val misure = listOf(
            Misura(tipo = TipoMisura.PASSI, valore = 8000.0, giorno = oggi.toString(), istante = 0, fonte = "hc"),
            Misura(tipo = TipoMisura.PASSI, valore = 3000.0, giorno = oggi.minusDays(1).toString(), istante = 0, fonte = "hc"),
        )
        val giorni = Stabilita.giorniSoddisfatti(Stabilita.leggiCriterio("PASSI>=7000")!!, misure)
        assertEquals(setOf(oggi), giorni)
    }
}
