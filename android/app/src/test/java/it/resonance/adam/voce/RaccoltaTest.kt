package it.resonance.adam.voce

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// Visto il 25/09: in modalità auto partiva solo l'inizio della frase. Il riconoscimento chiude alla prima pausa:
// il messaggio lo chiude l'app, con la pausa lunga o con «invia».
class RaccoltaTest {
    @Test fun lePauseNonChiudonoIlMessaggio() {
        val a = Raccolta.aggiungi("", "sto studiando i pezzi per la scaletta")
        assertEquals(Raccolta.Esito.Continua("sto studiando i pezzi per la scaletta"), a)
        val b = Raccolta.aggiungi((a as Raccolta.Esito.Continua).testo, "sfiorivano le viole è assimilato")
        assertEquals(Raccolta.Esito.Continua("sto studiando i pezzi per la scaletta sfiorivano le viole è assimilato"), b)
    }

    @Test fun invialoChiudeSubitoESparisce() {
        assertEquals(Raccolta.Esito.Invia("prima frase seconda frase"), Raccolta.aggiungi("prima frase", "seconda frase, invia"))
        assertEquals(Raccolta.Esito.Invia("prima frase"), Raccolta.aggiungi("prima frase", "Invia messaggio."))
        assertEquals(Raccolta.Esito.Invia("prima frase"), Raccolta.aggiungi("prima frase", "fine messaggio"))
        // «invia» dentro la frase non chiude; da solo a messaggio vuoto non manda niente.
        assertEquals(Raccolta.Esito.Continua("chiedi se la invia domani mattina"), Raccolta.aggiungi("", "chiedi se la invia domani mattina"))
        assertEquals(Raccolta.Esito.Continua(""), Raccolta.aggiungi("", "invia"))
    }

    @Test fun annullaMessaggioCancella() {
        assertEquals(Raccolta.Esito.Azzera, Raccolta.aggiungi("detto male", "Annulla messaggio."))
    }

    // Un piano di sette giorni superava il massimo della sintesi vocale in una volta, e non si sentiva niente.
    @Test fun unTestoLungoSiDivideDovelaVoceFaPausa() {
        val testo = (1..40).joinToString(" ") { "Giorno $it: avena, uova e verdura a pranzo." }
        val pezzi = Parlato.pezzi(testo, 300)
        assertTrue(pezzi.all { it.length <= 300 })
        assertEquals(testo, pezzi.joinToString(" "))
        assertTrue(pezzi.all { it.endsWith(".") })
        assertEquals(listOf("breve"), Parlato.pezzi("breve", 300))
        assertTrue(Parlato.pezzi("   ", 300).isEmpty())
    }
}
