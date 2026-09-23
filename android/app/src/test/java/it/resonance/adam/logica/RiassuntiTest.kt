package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class RiassuntiTest {
    private val oggi = LocalDate.of(2026, 9, 23)
    private fun i(misure: List<Misura> = emptyList(), rituali: List<Rituale> = emptyList(), spunte: List<Spunta> = emptyList()) =
        Istantanea(oggi, null, misure, rituali, spunte, emptyList(), emptyList(), emptyList(), emptyList())
    private fun m(t: TipoMisura, v: Double, fa: Long) = Misura(tipo = t, valore = v, giorno = oggi.minusDays(fa).toString(), istante = 0, fonte = "t")

    @Test fun mattinoSenzaDatiLoDice() {
        assertEquals("Nessun dato nuovo stanotte.", Riassunti.mattino(i()))
    }

    @Test fun mattinoNominaIlSonnoDiStanotteSoloSeCe() {
        assertTrue(Riassunti.mattino(i(listOf(m(TipoMisura.SONNO, 400.0, 0)))).startsWith("Sonno stanotte 6h40"))
        assertEquals("Nessun dato nuovo stanotte.", Riassunti.mattino(i(listOf(m(TipoMisura.SONNO, 400.0, 1)))))
    }

    @Test fun mattinoApreConLAgendaDiOggi() {
        val domani = Evento("Treno", oggi.plusDays(1).atTime(7, 0), oggi.plusDays(1).atTime(9, 0), false)
        val e = Evento("Dentista", oggi.atTime(10, 30), oggi.atTime(11, 15), false)
        val m = Riassunti.mattino(i().copy(agenda = AgendaLetta.Letta(oggi, 2, listOf(domani, e))))
        assertEquals("Oggi in calendario: 10:30–11:15 Dentista", m.lines().first())
        assertTrue(Riassunti.mattino(i().copy(agenda = AgendaLetta.Letta(oggi, 1, emptyList()))).startsWith("Nessun impegno in calendario oggi."))
    }

    @Test fun seraElencaIRitualiNonTenuti() {
        val r = listOf(Rituale(id = 1, nome = "Stretching", pilastro = Pilastro.BIO, creato = 0), Rituale(id = 2, nome = "Scala", pilastro = Pilastro.VIDYA, creato = 0))
        val s = Riassunti.sera(i(rituali = r, spunte = listOf(Spunta(1, oggi.toString(), "m", 0))))
        assertTrue(s, s.contains("Non ancora tenuti oggi: Scala"))
        assertTrue(s.contains("Nessuna pratica registrata oggi."))
    }

    @Test fun settimanaContaIRitualiSuSette() {
        val r = listOf(Rituale(id = 1, nome = "Stretching", pilastro = Pilastro.BIO, creato = 0))
        val spunte = listOf(0L, 1L, 9L).map { Spunta(1, oggi.minusDays(it).toString(), "m", 0) }
        assertTrue(Riassunti.settimana(i(rituali = r, spunte = spunte)).contains("Stretching: tenuto 2/7"))
    }
}
