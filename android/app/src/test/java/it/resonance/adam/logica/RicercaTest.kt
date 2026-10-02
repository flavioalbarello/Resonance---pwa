package it.resonance.adam.logica

import it.resonance.adam.dati.Lettura
import it.resonance.adam.dati.Osservazione
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// La ricerca web e Segui (02/10/2026): ciò che il programma controlla, senza Android.
class RicercaTest {
    private val oggi = LocalDate.of(2026, 10, 2)
    private val fonte = Consulente.Fonte("https://www.moex.com/x", "MOEX", "moex.com")
    private fun o(inizio: LocalDate = oggi, giorni: Long = 7) =
        Osservazione(id = 1, cosa = "Gazprom", domanda = "prezzo di chiusura", prima = "ultimo anno", inizio = inizio.toString(), fine = inizio.plusDays(giorni - 1).toString(), creata = 0)

    @Test fun laFormaSiDiceESiControllaConLaStessaCostante() {
        assertTrue(Ricerca.FORMA.contains(Ricerca.DATA))
        // Con fonti e con la data: niente da dire.
        assertTrue(Ricerca.problemi("${Ricerca.DATA} 1 ottobre\nGazprom 128 RUB", listOf(fonte), "gazprom").isEmpty())
        // Anche se il modello mette la riga in grassetto.
        assertTrue(Ricerca.problemi("**${Ricerca.DATA}** 1 ottobre", listOf(fonte), "gazprom").isEmpty())
        val senza = Ricerca.problemi("Gazprom è a 130", emptyList(), "gazprom")
        assertTrue(senza.any { it.contains("non ha restituito fonti") } && senza.any { it.contains("di quando") })
        assertTrue(Ricerca.problemi("${Ricerca.DATA} ${Ricerca.SENZA_DATA}", listOf(fonte), "x").single().contains("le fonti non dicono"))
        assertTrue(!Ricerca.FORMA.contains("chiusura"))
        // Un sito citato che non è fra le fonti si dice.
        assertTrue(Ricerca.problemi("${Ricerca.DATA} oggi\nsecondo borsainventata.com", listOf(fonte), "gazprom").any { it.contains("borsainventata.com") })
    }

    @Test fun laSchedaPortaLeFontiVereEGliAvvisi() {
        val s = Ricerca.scheda("${Ricerca.DATA} oggi", listOf(fonte), listOf("manca qualcosa"))
        assertTrue(s.contains("1. MOEX — https://www.moex.com/x") && s.contains("⚠ manca qualcosa"))
        assertEquals(listOf(fonte), Ricerca.decodificaFonti(Ricerca.codificaFonti(listOf(fonte))))
    }

    @Test fun seguireHaUnaFormaEUnCalendario() {
        assertTrue(Ricerca.difetti("Gazprom", "prezzo", 7, 0).isEmpty())
        assertTrue(Ricerca.difetti("", "prezzo", 7, 0).isNotEmpty())
        assertTrue(Ricerca.difetti("Gazprom", "prezzo", 0, 0).any { it.contains("giorni") })
        assertTrue(Ricerca.difetti("Gazprom", "prezzo", 7, Ricerca.SEGUITE_MAX).any { it.contains("smettine") })
        val g = o()
        assertEquals("giorno 1 di 7", Ricerca.giorno(g, oggi))
        assertEquals("giorno 7 di 7", Ricerca.giorno(g, oggi.plusDays(6)))
        assertTrue(Ricerca.dovuta(g, emptyList(), oggi))
        val letta = Lettura(osservazioneId = 1, giorno = oggi.toString(), testo = "x", istante = 0)
        assertFalse(Ricerca.dovuta(g, listOf(letta), oggi))
        assertTrue(Ricerca.dovuta(g, listOf(letta), oggi.plusDays(1)))
        // Dopo l'ultimo giorno non si legge più: si chiude col resoconto.
        assertFalse(Ricerca.dovuta(g, emptyList(), oggi.plusDays(7)))
        assertFalse(Ricerca.daChiudere(g, oggi.plusDays(6)))
        assertTrue(Ricerca.daChiudere(g, oggi.plusDays(7)))
        assertFalse(Ricerca.daChiudere(g.copy(chiusa = oggi.toString()), oggi.plusDays(9)))
        // Lo sguardo indietro solo alla prima lettura.
        assertTrue(Ricerca.domandaDelGiorno(g, prima = true).contains("ultimo anno"))
        assertEquals("prezzo di chiusura", Ricerca.domandaDelGiorno(g, prima = false))
    }

    // La scheda della ricerca rapida in chat, chiusa (02/10/2026, sera): una riga che dice cosa c'è dentro.
    @Test fun laRicercaChiusaSiRiassumeInUnaRiga() {
        val una = "«trattorie a Bracciano»\n\n" + Ricerca.scheda("${Ricerca.DATA} 2 ottobre 2026\n- Da Peppe [1]", listOf(fonte, fonte.copy(url = "https://b.it/y")), listOf("avviso"))
        assertEquals("2 fonti · Dati al: 2 ottobre 2026 · ⚠ 1", Ricerca.riassunto(una))
        val due = una + "\n\n«trattorie a Tolfa»\n\n${Ricerca.NON_RIUSCITA} HTTP 500"
        assertEquals("2 ricerche · 2 fonti · ⚠ 1 · una non riuscita", Ricerca.riassunto(due))
        // La ricerca a fondo e Segui sono il risultato: restano aperte.
        assertEquals(null, Ricerca.riassunto("Ricerca a fondo · «x»"))
        assertEquals(null, Ricerca.riassunto("Segui · Gazprom · giorno 1 di 3"))
        // Il nome di un locale scritto «a cammello» non è un sospetto.
        assertTrue(Ricerca.problemi("${Ricerca.DATA} oggi\nTrattoria MagnaMagna, Viterbo", listOf(fonte), "trattorie a Viterbo").isEmpty())
    }
}
