package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// L'incrocio (02/10/2026, notte): un motore solo, provato su ambiti diversi fin dal primo giorno, perché non diventi la
// soluzione di un caso solo (com'era successo con la borsa). Ristoranti, Mustang usate, trichechi, pediatri.
class IncrocioTest {
    private fun f(dominio: String, n: Int = 1) = Consulente.Fonte("https://www.$dominio/p$n", "", dominio)

    @Test fun laFormaSiDiceESiLeggeConGliStessiSeparatori() {
        assertTrue(Ricerca.FORMA.contains(Incrocio.FORMA) && Incrocio.FORMA.contains(Incrocio.SEP))
        val testo = "Dati al: 2 ottobre 2026\n- **La Riserva** | Canale Monterano | 4,6/5 su 300 recensioni [1][2]\n- Manturna | Canale Monterano | 9,2/10 [2]\nLettura: bene."
        val e = Incrocio.elementi(testo, listOf(f("tripadvisor.it"), f("thefork.it")), "recensioni")
        assertEquals(listOf("La Riserva", "Manturna"), e.map { it.nome })
        assertEquals(listOf("tripadvisor.it", "thefork.it"), e[0].fonti.map { it.dominio })
        assertEquals("4,6/5 su 300 recensioni", e[0].dato)
        // Una risposta in prosa non si incrocia, e il programma lo dice.
        assertTrue(Ricerca.problemi("Dati al: oggi\nCi sono buoni ristoranti a Bracciano.", listOf(f("a.it")), "x").any { it.contains("forma a righe") })
    }

    @Test fun ristorantiLaMappaLeRecensioniEIForum() {
        val recensioni = Incrocio.elementi("- Ristorante La Riserva | Canale Monterano | 4,6/5 [1]\n- Il Canaletto | Canale Monterano | 4,1/5 [1]",
            listOf(f("tripadvisor.it")), "recensioni")
        val forum = Incrocio.elementi("- La Riserva | Canale Monterano | «il miglior abbacchio della zona» [1]", listOf(f("reddit.com")), "forum")
        val mappa = listOf(Mappa.Luogo("La Riserva", "Canale Monterano", 0.4, "regional", "https://www.ristorantelariserva.it"),
            Mappa.Luogo("Shen Long", "Bracciano", 7.2, "chinese", "https://www.openstreetmap.org/node/1"))
        val i = Incrocio.incrocia(recensioni + forum, mappa)
        // In cima quello che tre fonti indipendenti confermano; poi la fonte sola; i posti solo sulla mappa in fondo.
        assertEquals(listOf("Ristorante La Riserva", "Il Canaletto", "Shen Long"), i.map { it.nome })
        assertEquals(3, i[0].domini.size)
        assertTrue(Incrocio.etichetta(i[0]), Incrocio.etichetta(i[0]).startsWith("3 fonti indipendenti (recensioni, forum, mappa)"))
        assertTrue(Incrocio.etichetta(i[1]).startsWith("una sola fonte"))
        val s = Incrocio.scheda(i)
        assertTrue(s, s.contains("mappa: regional, Canale Monterano, 0 km") && s.contains("Sulla mappa, senza nessuna fonte sul web: 1 (Shen Long, Bracciano)"))
    }

    @Test fun mustangLoStessoModelloSuPiuSitiEIPrezziDiversiSiDicono() {
        val subito = Incrocio.elementi("- Ford Mustang GT 5.0 2018 | Milano | 32.500 € [1]", listOf(f("subito.it")), "annunci")
        val autoscout = Incrocio.elementi("- Mustang GT 5.0 2018 | Milano | 41.900 € [1]\n- Ford Mustang EcoBoost 2016 | Torino | 24.000 € [1]",
            listOf(f("autoscout24.it")), "annunci")
        val i = Incrocio.incrocia(subito + autoscout)
        assertEquals(2, i[0].voci.size)
        assertTrue(Incrocio.etichetta(i[0]), Incrocio.etichetta(i[0]).contains("⚠ numeri diversi fra le fonti"))
        assertEquals(listOf(32500.0, 41900.0), Incrocio.numeri(i[0].voci.map { it.dato }))
        // Un modello diverso non si fonde.
        assertEquals("Ford Mustang EcoBoost 2016", i[1].nome)
    }

    @Test fun trichechiLoStessoAnnoDaFontiDiverse() {
        val ufficiale = Incrocio.elementi("- 2024 | Crystal River | censimento aereo 2024: 1.100 lamantini [1]", listOf(f("myfwc.com")), "dati ufficiali")
        val notizie = Incrocio.elementi("- 2024 | Crystal River | 1.150 lamantini contati a gennaio [1]\n- 2023 | Crystal River | 950 [1]",
            listOf(f("tampabay.com")), "notizie")
        val i = Incrocio.incrocia(ufficiale + notizie)
        assertEquals("2024", i[0].nome)
        assertEquals(2, i[0].domini.size)
        // L'anno nel testo non è il numero da confrontare; 1.100 e 1.150 sono vicini: nessun avviso.
        assertEquals(listOf(1100.0, 1150.0), Incrocio.numeri(i[0].voci.map { it.dato }))
        assertFalse(Incrocio.etichetta(i[0]).contains("⚠"))
        assertTrue(Incrocio.etichetta(i[0]).contains("migliore A"))
    }

    @Test fun pediatriIlTitoloNonDistingue() {
        val a = Incrocio.elementi("- Dott.ssa Maria Rossi | Bracciano | pediatra di libera scelta, accetta nuovi pazienti [1]", listOf(f("asl.it")), "ufficiale")
        val b = Incrocio.elementi("- Maria Rossi | Bracciano | «gentilissima con i bambini» [1]\n- Dr. Luca Bianchi | Anguillara | pediatra [1]",
            listOf(f("miodottore.it")), "recensioni")
        val i = Incrocio.incrocia(a + b)
        assertEquals(2, i[0].voci.size)
        assertTrue(Incrocio.stesso("Dott.ssa Maria Rossi", "Maria Rossi") && !Incrocio.stesso("Maria Rossi", "Mario Rossi"))
        // Nomi simili in posti diversi restano due; lo stesso nome esatto si fonde anche con un «dove» scritto diversamente.
        val mario = Incrocio.incrocia(Incrocio.elementi("- Da Mario | Tolfa | 4,2/5 [1]\n- Bar Mario | Bracciano | 3,9/5 [1]\n- Da Mario | Tolfa (RM) | ok [1]",
            listOf(f("tripadvisor.it")), "recensioni"))
        assertEquals(listOf(2, 1), mario.map { it.voci.size })
        assertNull(Ricerca.riassunto("Ricerca a fondo · «x»"))
    }

    @Test fun unaFonteCheLoDiceChiusoSiDice() {
        val i = Incrocio.incrocia(Incrocio.elementi("- Trattoria Da Peppe | Tolfa | 4,5/5 [1]", listOf(f("tripadvisor.it")), "recensioni") +
            Incrocio.elementi("- Da Peppe | Tolfa | chiuso definitivamente nel 2025 [1]", listOf(f("google.com")), "mappe"))
        assertTrue(Incrocio.etichetta(i[0]).contains("una fonte lo dice chiuso"))
    }
}
