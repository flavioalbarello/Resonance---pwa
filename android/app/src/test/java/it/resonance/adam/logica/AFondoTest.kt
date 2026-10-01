package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// La ricerca a fondo (02/10/2026): ciò che fa il programma — livelli, incrocio, stima — senza Android.
class AFondoTest {
    private fun f(url: String) = Consulente.Fonte(url, "", Consulente.dominio(url))

    @Test fun leSottoDomandeHannoUnTipo() {
        assertEquals(AFondo.Tipo.FORUM, AFondo.sotto("forum: avvistamenti a Crystal River")!!.tipo)
        assertEquals(AFondo.Tipo.UFFICIALE, AFondo.sotto("dati ufficiali: censimento 2025")!!.tipo)
        assertEquals(null, AFondo.sotto("chiacchiere: boh"))
        assertTrue(AFondo.difetti("trichechi", listOf("forum: a", "notizie: b"), 0).isEmpty())
        assertTrue(AFondo.difetti("trichechi", listOf("forum: a"), 0).any { it.contains("sotto-domande") })
        assertTrue(AFondo.difetti("trichechi", listOf("forum: a", "boh"), 0).any { it.contains("«boh»") })
        assertTrue(AFondo.difetti("trichechi", listOf("forum: a", "notizie: b"), 1).any { it.contains("una per volta") })
    }

    @Test fun ilLivelloDelleFontiLoDecideIlProgramma() {
        assertEquals(AFondo.Livello.A, AFondo.livello("https://www.fws.gov/species/manatee"))
        assertEquals(AFondo.Livello.A, AFondo.livello("https://pubmed.ncbi.nlm.nih.gov/123"))
        assertEquals(AFondo.Livello.B, AFondo.livello("https://www.reuters.com/x"))
        assertEquals(AFondo.Livello.C, AFondo.livello("https://www.reddit.com/r/manatees/x"))
        assertEquals(AFondo.Livello.C, AFondo.livello("https://www.mustang6g.com/forum/thread/1"))
        assertEquals(AFondo.Livello.D, AFondo.livello("https://www.autoscout24.it/lst/ford/mustang"))
        assertEquals(AFondo.Livello.N, AFondo.livello("https://www.sitoqualunque.net/pagina"))
    }


    @Test fun lIncrocioContaLeFontiIndipendentiENonCredeAiNumeriInventati() {
        val fonti = AFondo.fonti(listOf(listOf(f("https://www.fws.gov/a"), f("https://www.reddit.com/b")), listOf(f("https://www.reddit.com/c"), f("https://www.fws.gov/a"))))
        assertEquals(3, fonti.size)   // la stessa pagina due volte conta una
        val sintesi = "- La popolazione è di circa 8.000 esemplari [1, 2]\n- Molti avvistamenti a gennaio [2, 3]\n- Un dato inventato [9]\n${AFondo.SINTESI} in crescita."
        val a = AFondo.affermazioni(sintesi, fonti)
        assertEquals(3, a.size)
        assertEquals("La popolazione è di circa 8.000 esemplari", a[0].testo)
        assertEquals("2 fonti indipendenti · migliore A", AFondo.etichetta(a[0]))
        // Due pagine di reddit sono un solo dominio: una testimonianza, non due.
        assertEquals("1 sola fonte · C forum, recensioni, testimonianze", AFondo.etichetta(a[1]))
        assertTrue(AFondo.etichetta(a[2]).contains("nessuna fonte") && AFondo.etichetta(a[2]).contains("9"))
        assertTrue(AFondo.doveNo(mapOf(AFondo.Tipo.ANNUNCI to 0, AFondo.Tipo.FORUM to 3)).contains("annunci e mercato (nessuna fonte trovata)"))
    }

    @Test fun laStimaLaFaIlProgrammaCoiPrezziDelListino() {
        val economico = Listino.Voce("x/economico", ingresso = 0.1, uscita = 0.5)
        val caro = Listino.Voce("x/caro", ingresso = 4.0, uscita = 20.0)
        val e = AFondo.stima(4, economico, economico)
        val c = AFondo.stima(4, caro, caro)
        assertTrue(e.min < e.max && c.min > e.min && c.max > e.max)
        // Quattro ricerche col modello economico: qualche centesimo, non frazioni né euro.
        assertTrue(AFondo.testo(e), e.min in 0.02..0.1 && e.max in 0.05..0.3)
        assertEquals("1–2 centesimi di dollaro", AFondo.testo(AFondo.Forbice(0.012, 0.024)))
    }
}
