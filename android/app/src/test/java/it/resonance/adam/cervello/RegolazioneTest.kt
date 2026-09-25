package it.resonance.adam.cervello

import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.dati.Turno
import org.junit.Assert.assertEquals
import org.junit.Test

class RegolazioneTest {
    @Test fun gliEsitiSiContanoPerModelloECompito() {
        val turni = listOf(
            Turno(istante = 1, compito = "TURNO", modello = "kimi", temperatura = 0.4, proposte = "1,2", rifiutate = 1, costo = 0.002),
            Turno(istante = 2, compito = "TURNO", modello = "kimi", temperatura = 0.8, forzata = true, proposte = "3", troncata = true),
            Turno(istante = 3, compito = "BATTITO", modello = "kimi", temperatura = 0.7),
        )
        val stati = mapOf(1L to StatoProposta.ESEGUITA, 2L to StatoProposta.RIFIUTATA, 3L to StatoProposta.IN_ATTESA)
        val s = Regolazione.sintesi(turni) { stati[it] }
        val conv = s.first()
        assertEquals(Compito.TURNO, conv.compito)
        assertEquals(2, conv.turni)
        assertEquals(0.4, conv.temperatura!!, 1e-9) // la forzata non entra nella media
        assertEquals(3, conv.proposte)
        assertEquals(1, conv.annullate)
        assertEquals("2 turni · t 0,4 · 3 proposte (1 annullate da te) · 1 fermate dal programma · 1 tagliate · 1 forzate da te · 0,20 ¢", Regolazione.riga(conv))
    }
}
