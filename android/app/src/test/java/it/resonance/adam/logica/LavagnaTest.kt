package it.resonance.adam.logica

import it.resonance.adam.dati.Appunto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class LavagnaTest {
    private val oggi = LocalDate.of(2026, 9, 26)
    private fun appunto(vararg righe: Pair<String, Boolean>, scade: LocalDate = oggi.plusDays(7)) = Appunto(id = 1, titolo = "Spesa",
        righe = Lavagna.codifica(righe.map { Lavagna.Riga(it.first, it.second) }), creato = 0, scade = scade.toString())

    @Test fun viveFinchéCèDaFareENonÈScaduto() {
        assertTrue(Lavagna.vivo(appunto("latte" to false, "uova" to true), oggi))
        assertFalse(Lavagna.vivo(appunto("latte" to true), oggi))
        assertTrue(Lavagna.vivo(appunto("latte" to false, scade = oggi), oggi))
        assertFalse(Lavagna.vivo(appunto("latte" to false, scade = oggi.minusDays(1)), oggi))
        assertFalse(Lavagna.vivo(appunto("latte" to false).copy(tenuto = true), oggi))
    }

    @Test fun lUltimaSpuntaLoChiudeEToglierlaLoRiapre() {
        val a = appunto("latte" to false, "uova" to true)
        val chiuso = Lavagna.alterna(a, 0, oggi)
        assertEquals(oggi.toString(), chiuso.finito)
        assertEquals(null, Lavagna.alterna(chiuso, 1, oggi.plusDays(1)).finito)
    }

    @Test fun siCancellaSoloTrentaGiorniDopoLaFine() {
        val finito = appunto("latte" to true).copy(finito = oggi.toString())
        assertFalse(Lavagna.daCancellare(finito, oggi.plusDays(30)))
        assertTrue(Lavagna.daCancellare(finito, oggi.plusDays(31)))
        // Scaduto senza essere finito: i 30 giorni partono dalla scadenza.
        assertTrue(Lavagna.daCancellare(appunto("latte" to false, scade = oggi), oggi.plusDays(31)))
        assertFalse(Lavagna.daCancellare(appunto("latte" to false), oggi.plusDays(3)))
    }

    @Test fun leRigheSiTrovanoSenzaIndovinare() {
        val a = appunto("latte intero" to false, "uova" to false, "fagioli cannellini" to false, "fagioli neri" to false)
        assertEquals(listOf(0) to emptyList<String>(), Lavagna.trova(a, listOf("latte")))
        assertEquals(listOf(1) to emptyList<String>(), Lavagna.trova(a, listOf("Uova")))
        // «fagioli» ne tocca due: non si sceglie.
        assertEquals(emptyList<Int>() to listOf("fagioli"), Lavagna.trova(a, listOf("fagioli")))
    }

    @Test fun copiaSoloIlDaFareCondividiTutto() {
        val a = appunto("latte" to false, "uova" to true, "pane" to false)
        assertEquals("latte\npane", Lavagna.perCopia(a))
        assertEquals("Spesa\n\n☐ latte\n☑ uova\n☐ pane", Lavagna.perCondividere(a))
        assertEquals(listOf("latte", "uova"), Lavagna.daTesto("- latte\n\n☐ uova  "))
    }

    @Test fun siAggiungonoSiCorreggonoESiTolgonoVoci() {
        val a = appunto("latte" to true, "uova" to false)
        val piu = Lavagna.aggiungi(a, "pane\n- ceci", oggi)
        assertEquals(listOf("latte", "uova", "pane", "ceci"), Lavagna.righe(piu).map { it.testo })
        // Correggere lascia la spunta com'era; vuoto toglie.
        val corretto = Lavagna.cambia(piu, 0, "latte intero", oggi)
        assertEquals(Lavagna.Riga("latte intero", true), Lavagna.righe(corretto)[0])
        assertEquals(listOf("latte intero", "pane", "ceci"), Lavagna.righe(Lavagna.cambia(corretto, 1, " ", oggi)).map { it.testo })
        // Una lista finita a cui si aggiunge una voce torna a vivere.
        val finita = Lavagna.alterna(appunto("latte" to false), 0, oggi)
        assertFalse(Lavagna.vivo(finita, oggi))
        val riaperta = Lavagna.aggiungi(finita, "uova", oggi)
        assertTrue(Lavagna.vivo(riaperta, oggi))
        assertEquals(null, riaperta.finito)
    }

    @Test fun nelPromptSoloIVivi() {
        val vivo = appunto("latte" to false, "uova" to true)
        val finito = appunto("pane" to true).copy(id = 2, titolo = "Vecchia")
        val p = Lavagna.perPrompt(listOf(vivo, finito), oggi)
        assertEquals(1, p.size)
        assertTrue(p.single(), p.single().startsWith("«Spesa» (scade il 03/10): latte [già fatte: 1]"))
    }
}
