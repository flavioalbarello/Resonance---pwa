package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Due app da un codice solo (01/10/2026): nella base lo Shell non sa nemmeno che l'architetto esiste.
class EdizioneTest {
    @Test fun nellaBaseNienteArchitettoNeRiunione() {
        val base = Capacita.testo("2.x", sviluppatore = false)
        listOf("scrivi_all_architetto", "chiedi_consulente", "punto_fermo", "Riunione a tre", "architetto", "Balthasar", "consulente").forEach {
            assertFalse("«$it» non deve esserci nella base:\n$base", base.contains(it, ignoreCase = true))
        }
        // Il resto c'è tutto: stesso DNA, stessi strumenti di vita.
        assertTrue(base.contains("crea_rituale") && base.contains("scrivi_appunto") && base.contains("prendi_consegna") && base.contains("Sono via"))
    }

    @Test fun nelloSviluppoTuttoComePrima() {
        val dev = Capacita.testo("2.x", sviluppatore = true)
        assertTrue(dev.contains("scrivi_all_architetto") && dev.contains("Riunione a tre") && dev.contains("le lettere all'architetto"))
        assertEquals(Capacita.strumenti(), Capacita.aree(sviluppatore = true).flatMap { it.strumenti }.toSet())
    }
}
