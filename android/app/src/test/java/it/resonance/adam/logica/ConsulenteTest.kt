package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Il consulente esterno e Balthasar (riunione del 27/09/2026): ciò che decide il programma, senza modello.
class ConsulenteTest {
    @Test fun lArchitettoSiRivolgeAlConsulenteConLaFreccia() {
        assertTrue(Consulente.rivolto("→ Consulente\nQuanto costa?"))
        assertTrue(Consulente.rivolto("-> consulente: quanto costa?"))
        assertFalse(Consulente.rivolto("Il consulente dice → Consulente"))
        assertFalse(Consulente.rivolto("→ Shell\nConsulente?"))
        assertEquals("Al consulente: quanto costa?", Consulente.leggibile("→ Consulente: quanto costa?"))
    }

    @Test fun leDomandeSonoUnaPerVoceOTuttoIlTesto() {
        assertEquals(listOf("Prezzo della Fury in Italia?", "Data degli Android XR?"),
            Consulente.domandeDa("→ Consulente\n- Prezzo della Fury in Italia?\n- Data degli Android XR?"))
        assertEquals(listOf("uno?", "due?"), Consulente.domandeDa("→ Consulente\n1. uno?\n2) due?"))
        assertEquals(listOf("Il kit Meta supporta i Gen 3? Cerca sulla pagina ufficiale."),
            Consulente.domandeDa("→ Consulente\nIl kit Meta supporta i Gen 3?\nCerca sulla pagina ufficiale."))
        assertEquals(emptyList<String>(), Consulente.domandeDa("→ Consulente"))
    }

    // Il guardiano dove il dato esce: né il nome professionale né un indirizzo partono verso il consulente.
    @Test fun nomiProtettiEIndirizziNonEscono() {
        val t = Consulente.pulisci("Il logo di physioalba va bene? Scrivi a mario.rossi@gmail.com", listOf("PhysioAlba"))
        assertEquals("Il logo di [nome protetto] va bene? Scrivi a [indirizzo]", t)
    }

    // Detta e verifica dalla stessa costante: la forma chiede «1.», il controllo cerca «1.».
    @Test fun iPuntiMancantiSiContanoSullaFormaDetta() {
        assertTrue(Consulente.FORMA.contains("«1.»"))
        assertEquals(emptyList<Int>(), Consulente.mancano("1. · sì\n2. · no", 2))
        assertEquals(listOf(2, 3), Consulente.mancano("1. · sì\n· e poi 2. no", 3))
        assertEquals(emptyList<Int>(), Consulente.mancano("**1.** · sì\n## 2) no", 2))
        assertTrue(Consulente.sollecito(listOf(2)).contains("punti 2"))
    }

    @Test fun iNomiNonTrovatiDallaRicercaSonoSospetti() {
        val fonti = listOf(Consulente.Fonte("https://www.rokid.com/x", "Rokid", "rokid.com"))
        val s = Consulente.sospette("· Rokid su rokid.com; vedi anche GlassForge e smartspecs.io; YouTube ne parla; RayNeo anche",
            fonti, listOf("Confronta Rokid e RayNeo"))
        assertEquals(listOf("smartspecs.io", "GlassForge"), s)
    }

    @Test fun laSchedaDiceSeLaRicercaNonCeStata() {
        val d = listOf(Consulente.Domanda("Ghost", "Quanto costa?"))
        val senza = Consulente.scheda(d, "1. · 300 euro", emptyList(), emptyList(), emptyList())
        assertTrue(senza, senza.contains("Fonti trovate davvero: nessuna"))
        val con = Consulente.scheda(d, "1. · 300 euro", listOf(Consulente.Fonte("https://a.it/p", "Pagina", "a.it")), listOf("GlassForge"), listOf(2))
        assertTrue(con, con.contains("1. [Ghost] Quanto costa?") && con.contains("- a.it — Pagina · https://a.it/p"))
        assertTrue(con, con.contains("⚠ Nomina senza averli trovati: GlassForge") && con.contains("(Senza risposta ai punti 2"))
        // Alla voce: la risposta e il sospetto, non gli indirizzi.
        val voce = Consulente.perLaVoce(con)
        assertTrue(voce, voce.startsWith("1. · 300 euro") && voce.contains("Attenzione: Nomina") && !voce.contains("https://"))
    }

    @Test fun loStatoPerLoShellDiceCartellaEInvii() {
        assertTrue(Consulente.stato(false, emptyList(), 0, 10).startsWith("assente"))
        val s = Consulente.stato(true, listOf(Consulente.Domanda("shell", "Il kit supporta i Gen 3?")), 2, 10)
        assertTrue(s, s.contains("1 domande in cartella") && s.contains("[shell]") && s.contains("invii 2 su 10"))
    }

    @Test fun laCartellaSiRileggeUgualeEUnTestoRottoNonRompe() {
        val d = listOf(Consulente.Domanda("Ghost", "a"), Consulente.Domanda("architetto", "b"))
        assertEquals(d, Consulente.decodifica(Consulente.codifica(d)))
        assertEquals(emptyList<Consulente.Domanda>(), Consulente.decodifica("non json"))
        val st = listOf(Consulente.Scambio(listOf("a"), "1. · x"))
        assertEquals(st, Consulente.decodificaStoria(Consulente.codificaStoria(st)))
    }

    // Balthasar: parte dalla domanda sul tavolo e dall'intensità; il tetto a 1 perché un rifiuto segnerebbe il modello.
    @Test fun balthasarPorteLaDomandaELaDoseSceltaDalGhost() {
        val r = Balthasar.richiesta("Quali occhiali?", Balthasar.Intensita.PROFONDA)
        assertTrue(r, r.contains("«Quali occhiali?»") && r.contains("profonda") && r.contains(Balthasar.Intensita.PROFONDA.come) && r.contains(Balthasar.FORMA))
        assertTrue(Balthasar.Intensita.entries.all { it.temperatura <= 1.0 })
        assertTrue(Balthasar.Intensita.entries.zipWithNext().all { (a, b) -> a.temperatura < b.temperatura })
    }

    @Test fun balthasarFuoriFormaSiScriveMaNonSiTaglia() {
        assertNull(Balthasar.fuoriForma("· " + "parola ".repeat(Balthasar.TETTO_PAROLE)))
        val lungo = "· " + "parola ".repeat(Balthasar.TETTO_PAROLE * 2)
        assertTrue(Balthasar.fuoriForma(lungo)!!.contains("${Balthasar.TETTO_PAROLE * 2} parole"))
    }
}
