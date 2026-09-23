package it.resonance.adam.logica

import it.resonance.adam.cervello.Instradatore
import it.resonance.adam.cervello.Motore
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InstradatoreTest {
    @Test fun siLeggeSoloUnLeggeroPulito() {
        assertEquals(Motore.LEGGERO, Instradatore.leggi("LEGGERO"))
        assertEquals(Motore.LEGGERO, Instradatore.leggi(" leggero.\n"))
        assertEquals(Motore.PIENO, Instradatore.leggi("PIENO"))
        assertEquals(Motore.PIENO, Instradatore.leggi("leggero o pieno?"))
        assertEquals(Motore.PIENO, Instradatore.leggi(""))
        assertEquals(Motore.PIENO, Instradatore.leggi(null))
    }

    @Test fun documentiETestiLunghiNonSiChiedono() {
        assertEquals(Motore.PIENO, Instradatore.ovvio("x", listOf(Allegato("a.pdf", Allegato.Tipo.PDF, immagini = listOf("p")))))
        assertEquals(Motore.PIENO, Instradatore.ovvio("x".repeat(700), emptyList()))
        assertNull(Instradatore.ovvio("peso 82", emptyList()))
    }

    @Test fun laDomandaAlRouterPortaIlContestoMinimo() {
        val m = Instradatore.messaggi("sì", "Vuoi che tolga tutta la serie?", emptyList())
        val u = m[1].jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(u, u.contains("Vuoi che tolga tutta la serie?") && u.endsWith("Messaggio: «sì»"))
        assertEquals("kimi-k2.6", Instradatore.etichetta("moonshotai/kimi-k2.6"))
    }
}
