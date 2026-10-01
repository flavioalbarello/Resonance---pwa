package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// I gesti dalla notifica (01/10/2026): che cosa la notifica della sera offre da spuntare.
class GestiTest {
    private val oggi = LocalDate.of(2026, 10, 1)
    private fun stato(id: Long, nome: String, criterio: String? = null, fattoOggi: Boolean = false) =
        StatoRituale(Rituale(id = id, nome = nome, pilastro = Pilastro.BIO, criterio = criterio, creato = id), Tenuta(0, 0, fattoOggi), emptySet())

    @Test fun soloIRitualiAManoNonAncoraFattiAlMassimoDue() {
        val stati = listOf(stato(1, "Stretching"), stato(2, "Sonno", "SONNO>=420"), stato(3, "Basso", fattoOggi = true), stato(4, "Diario"), stato(5, "Lettura"))
        assertEquals(listOf("Stretching", "Diario"), Gesti.daSpuntare(stati, via = false).map { it.nome })
        // Mentre il Ghost è via i rituali sono in pausa: la notifica non li chiede.
        assertTrue(Gesti.daSpuntare(stati, via = true).isEmpty())
    }

    @Test fun inRiunioneSiRispondeDalTavoloNonDallaNotifica() {
        assertTrue(Gesti.puoRispondere(""))
        assertTrue(!Gesti.puoRispondere("20261001-0836-varie"))
        assertEquals("Mandato allo Shell: «domani rientro tardi»", Gesti.mandato("  domani rientro tardi "))
    }
}
