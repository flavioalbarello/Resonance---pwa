package it.resonance.adam.cervello

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Un modello per compito (02/10/2026): lo sceglie il programma, il Ghost può cambiarlo, mai un modello ritirato.
class ModelloPerCompitoTest {
    private fun scegli(c: Compito, scelti: Map<String, String> = emptyMap()) = ModelloPerCompito.scegli(c, scelti, "principale/p", "leggero/l", "vista/v")

    @Test fun ilProgrammaSceglieInBaseAlCompito() {
        assertEquals("leggero/l", scegli(Compito.BATTITO))
        assertEquals("vista/v", scegli(Compito.ALLEGATI))
        assertEquals("principale/p", scegli(Compito.TURNO))
        // Le ricerche: Perplexity, che cerca da sé; gli strati della ricerca a fondo col Pro, l'incrocio col principale.
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_RICERCA, scegli(Compito.RICERCA))
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_A_FONDO, scegli(Compito.A_FONDO))
        assertEquals("principale/p", ModelloPerCompito.sintesi(scegli(Compito.A_FONDO), "principale/p"))
        assertEquals("moonshotai/kimi-k3", ModelloPerCompito.sintesi("moonshotai/kimi-k3", "principale/p"))
        assertTrue(Compito.MOTORE !in ModelloPerCompito.REGOLABILI)
    }

    @Test fun ilGhostCambiaUnCompitoAllaVoltaEUnRitiratoNonPassa() {
        val scelti = mapOf("RICERCA" to "moonshotai/kimi-k3", "ALLEGATI" to "qwen/qwen3-vl-32b-instruct")
        assertEquals("moonshotai/kimi-k3", scegli(Compito.RICERCA, scelti))
        assertEquals("principale/p", scegli(Compito.TURNO, scelti))
        assertEquals("deepseek/deepseek-v4.1-flash", scegli(Compito.ALLEGATI, scelti))
        assertEquals(scelti, ModelloPerCompito.decodifica(ModelloPerCompito.codifica(scelti)))
    }
}
