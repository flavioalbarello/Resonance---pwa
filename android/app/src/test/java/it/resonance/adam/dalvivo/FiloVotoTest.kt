package it.resonance.adam.dalvivo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Il voto della prova del filo è del programma: va provato anche lui, prima di fidarsi dei numeri.
class FiloVotoTest {
    private fun d(attese: List<List<String>>, tipo: String = "fatto", vecchie: List<String> = emptyList()) =
        FiloDalVivoTest.Domanda("x", "?", attese, tipo, vecchie, null)

    @Test fun ilVotoNonSiLasciaIngannare() {
        val tonalita = d(listOf(listOf("do")), "cambiato", listOf("re"))
        assertTrue(FiloDalVivoTest.vota(tonalita, "RISPOSTA: in Do, dal 19").giusta)
        // «do» dentro «domenica» non vale; «re» dentro «sempre» non è la vecchia decisione.
        assertFalse(FiloDalVivoTest.vota(tonalita, "RISPOSTA: ne parliamo domenica, come sempre").giusta)
        assertEquals("VECCHIA decisione", FiloDalVivoTest.vota(tonalita, "RISPOSTA: in Re").nota)
        assertFalse(FiloDalVivoTest.vota(d(listOf(listOf("2 dicembre"))), "RISPOSTA: il 12 dicembre").giusta)
        assertTrue(FiloDalVivoTest.vota(d(listOf(listOf("12 dicembre", "12/12"), listOf("salotto"))), "RISPOSTA: 12/12 al Salotto Belvedere").giusta)
        val ignoto = d(listOf(listOf("non lo so")), "ignoto")
        assertTrue(FiloDalVivoTest.vota(ignoto, "RISPOSTA: NON LO SO").giusta)
        assertTrue(FiloDalVivoTest.vota(ignoto, "Non me l'hai mai detto.").giusta)
        assertEquals("INVENTATA", FiloDalVivoTest.vota(ignoto, "RISPOSTA: un Ampeg da 300 watt").nota)
        val tre = FiloDalVivoTest.Domanda("p", "?", emptyList(), "preferenza", emptyList(), 3)
        assertTrue(FiloDalVivoTest.vota(tre, "5′ scale\n10′ Gianna in Do\n5′ ponte").giusta)
        assertFalse(FiloDalVivoTest.vota(tre, "Piano:\n- a\n- b\n- c").giusta)
    }
}
