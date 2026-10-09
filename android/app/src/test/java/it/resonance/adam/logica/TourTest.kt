package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Il tour del primo avvio (01/10/2026): quando parte, e che cosa il programma tiene delle proposte dello Shell.
class TourTest {
    @Test fun parteSoloSuUnAppNuova() {
        assertTrue(Tour.daMostrare(visto = false, chiave = "", nome = ""))
        // L'app del Ghost ha la chiave: non parte da sola. Visto o saltato una volta, nemmeno.
        assertFalse(Tour.daMostrare(visto = false, chiave = "sk-or-x", nome = ""))
        assertFalse(Tour.daMostrare(visto = true, chiave = "", nome = ""))
        assertFalse(Tour.daMostrare(visto = false, chiave = "", nome = "Marta"))
        assertEquals(Tour.Passo.CHIAVE, Tour.dopo(Tour.Passo.NOME))
        assertEquals(null, Tour.dopo(Tour.Passo.DOMANDA))
        assertEquals(null, Tour.prima(Tour.Passo.NOME))
    }

    @Test fun delleProposteDelloShellRestanoSoloINomi() {
        val risposta = "Ecco tre nomi:\n1. Luisa\n2) **Orfeo**\n- «Lumen»\n- Shell\n4. Un nome che è in realtà una frase lunga\nluisa"
        assertEquals(listOf("Luisa", "Orfeo", "Lumen"), Tour.nomiDa(risposta))
        assertTrue(Tour.nomiDa("").isEmpty())
        // La richiesta dice la forma che il programma controlla: tre, uno per riga, corti.
        assertTrue(Tour.RICHIESTA_NOMI.contains("${Tour.QUANTI} nomi") && Tour.RICHIESTA_NOMI.contains("${Nomi.NOME_MAX} caratteri"))
    }

    @Test fun ilPassoDelNomeDiceCheCosEDavvero() {
        val t = Tour.cheCosE("Luisa")
        assertTrue(t.startsWith("Luisa è il tuo Shell: la parte digitale di te."))
        assertTrue(t.contains("non decide al posto tuo") && t.contains("Tu confermi") && t.contains("esoscheletro"))
        // Senza un nome scelto non diventa «Shell è il tuo Shell».
        assertTrue(Tour.cheCosE(Nomi.SHELL).startsWith("Lo Shell è la parte digitale di te."))
    }
}
