package it.resonance.adam.logica

import it.resonance.adam.cervello.Lettore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// «Dove trovo X» (05/10/2026). Le pagine in resources/pagine sono quelle vere del Salotto Belvedere, lette il 05/10 col
// browser e con lo stesso script di estrazione del telefono (Lettore.ESTRAI): la carta dei vini col Mannaja Cane, la
// pagina iniziale che NON la collega, la sitemap che la contiene, la pagina anti-robot.
class TrovaDoveTest {
    private fun pagina(nome: String) = Lettore.interpreta(javaClass.getResource("/pagine/$nome.json")!!.readText())!!

    @Test fun laCartaVeraNominaIlVino() {
        val carta = pagina("salotto-carta-vini")
        val frase = TrovaDove.trova(carta.testo, listOf("Mannaja Cane"))
        assertNotNull(frase)
        assertTrue(frase!!, frase.contains("Mannaja Cane 2023") && frase.contains("Regina del Quartuccio") && frase.contains("28€"))
    }

    @Test fun ilNomeSiCercaAParoleIntereEConLeVarianti() {
        assertNull(TrovaDove.trova("Barbera d'Alba, Canepa 2022", listOf("Cane")))
        assertNotNull(TrovaDove.trova("MANNAIA CANE — rosso del Lazio", listOf("Mannaja Cane", "Mannaia Cane")))
        assertNotNull(TrovaDove.trova("Pinot Noir «Côte» 2021", listOf("Cote")))
        // Un nome spezzato su due righe (menu a colonne) si trova lo stesso, e lo si dice.
        assertTrue(TrovaDove.trova("Mannaja\nCane", listOf("Mannaja Cane"))!!.contains("più righe"))
        // La pagina iniziale e il menu del cibo non lo nominano.
        assertNull(TrovaDove.trova(pagina("salotto-casa").testo, listOf("Mannaja Cane")))
        assertNull(TrovaDove.trova(pagina("salotto-menu").testo, listOf("Mannaja Cane")))
    }

    @Test fun dallaPaginaInizialeSiSeguonoIlMenuNonISocial() {
        val casa = pagina("salotto-casa")
        val seguiti = TrovaDove.daSeguire(casa.url, casa.link)
        assertTrue(seguiti.toString(), seguiti.any { it.contains("251807-2") || it.contains("il-menu") })
        assertTrue(seguiti.toString(), seguiti.none { it.contains("facebook") || it.contains("instagram") || it.contains("whatsapp") || it.contains("iubenda") })
        // La carta dei vini non è collegata dalla pagina iniziale: per questo serve la sitemap.
        assertTrue(seguiti.none { it.contains("carta-vini") })
    }

    @Test fun laSitemapPortaAllaCarta() {
        val robots = pagina("salotto-robots")
        val sm = TrovaDove.sitemap("https://salottobelvedere.it/", robots.testo)
        assertEquals(listOf("https://salottobelvedere.it/sitemap_index.xml"), sm)
        val indice = pagina("salotto-sitemap-indice")
        val figlie = TrovaDove.figlie(TrovaDove.indirizzi(indice.url, indice.testo, indice.link))
        assertTrue(figlie.toString(), "https://salottobelvedere.it/post-sitemap.xml" in figlie && figlie.none { "author" in it || "tag" in it })
        val post = pagina("salotto-sitemap-post")
        val da = TrovaDove.daSeguire("https://salottobelvedere.it/", TrovaDove.indirizzi(post.url, post.testo, post.link).map { TrovaDove.Link(it, "") })
        assertEquals("https://salottobelvedere.it/carta-vini/", da.first())
        // Senza robots.txt, i posti soliti.
        assertTrue(TrovaDove.sitemap("https://esempio.it/x", null).contains("https://esempio.it/sitemap.xml"))
    }

    @Test fun laPaginaAntiRobotNonEIlSito() {
        val sfida = pagina("salotto-sfida")
        assertTrue(Lettore.sfida(sfida))
        assertFalse(Lettore.sfida(pagina("salotto-carta-vini")))
        assertFalse(Lettore.sfida(pagina("salotto-robots")))
    }

    @Test fun lAttesaSuperaLaSfidaODiceDiNonEsserci() = runBlocking {
        val sfida = pagina("salotto-sfida")
        val carta = pagina("salotto-carta-vini")
        val giri = ArrayDeque(listOf(sfida, sfida, carta.copy(testo = carta.testo.take(100)), carta, carta))
        val p = Lettore.attendi(carta.url, tempoMs = 10_000) { giri.removeFirstOrNull() ?: carta }
        assertTrue(p.riuscita && p.testo == carta.testo)
        val ferma = Lettore.attendi(carta.url, tempoMs = 2_000) { sfida }
        assertTrue(ferma.errore!!, ferma.errore!!.contains("anti-robot"))
        val vuota = Lettore.attendi(carta.url, tempoMs = 2_000, errore = { "HTTP 404" }) { null }
        assertEquals("HTTP 404", vuota.errore)
    }

    @Test fun ilSitoDiUnPostoPortaIlSuoNome() {
        assertTrue(TrovaDove.diQuesto("https://salottobelvedere.it/dove-siamo/", "Salotto Belvedere"))
        assertFalse(TrovaDove.diQuesto("https://it.restaurantguru.com/Salotto-Belvedere-Bracciano", "Salotto Belvedere"))
        assertFalse(TrovaDove.diQuesto("https://www.tripadvisor.it/Restaurant_Review-Salotto", "Salotto Belvedere"))
        // «Ristorante» non è una parola del nome: non basta per dire che un sito è quello.
        assertFalse(TrovaDove.diQuesto("https://ristorantemanicaretto.it/", "Ristorante Da Mario"))
        val c = TrovaDove.Candidato("Salotto Belvedere", null, "Bracciano", 7.0, TrovaDove.Origine.MAPPA)
        val fonti = listOf(Consulente.Fonte("https://aziende.virgilio.it/salotto", "", "virgilio.it"), Consulente.Fonte("https://salottobelvedere.it/dove-siamo/", "", "salottobelvedere.it"))
        assertEquals("https://salottobelvedere.it/", TrovaDove.sitoDi(c, fonti))
    }

    @Test fun iCandidatiInOrdine() {
        val mappa = TrovaDove.dallaMappa(listOf(
            Mappa.Luogo("Lontano", "Tolfa", 30.0, "restaurant", "https://lontano.it"),
            Mappa.Luogo("Vicino", "Manziana", 5.0, "restaurant", "vicino.it"),
            Mappa.Luogo("Senza sito", "Bracciano", 7.0, "restaurant", "https://www.openstreetmap.org/node/1")))
        val tutti = TrovaDove.ordina(mappa + TrovaDove.nominati(listOf("https://salottobelvedere.it/"), "Canale Monterano") +
            TrovaDove.dalWeb(listOf(Consulente.Fonte("https://www.tripadvisor.it/x", "", ""), Consulente.Fonte("https://enoteca.it/", "Enoteca", "enoteca.it"))))
        assertEquals(listOf("salottobelvedere.it", "Enoteca", "Vicino", "Lontano", "Senza sito"), tutti.map { it.nome })
        assertEquals("https://vicino.it", tutti[2].url)
        assertNull(tutti.last().url)
        // Lo stesso sito dal web e dalla mappa: uno solo, con la pagina del web e la distanza della mappa.
        val uno = TrovaDove.ordina(TrovaDove.dalWeb(listOf(Consulente.Fonte("https://vicino.it/carta/", "Carta", "vicino.it"))) + mappa)
        assertEquals(1, uno.count { it.url?.contains("vicino.it") == true })
        assertEquals("https://vicino.it/carta/" to 5.0, uno.first().url to uno.first().km)
    }

    @Test fun laRichiestaSbagliataTornaConCosaCorreggere() {
        assertTrue(TrovaDove.difetti(TrovaDove.Richiesta("Mannaja Cane")).any { it.contains("serve vicino_a") })
        assertTrue(TrovaDove.difetti(TrovaDove.Richiesta("Mannaja Cane", vicinoA = "Bracciano")).isEmpty())
        assertEquals(listOf("\"Mannaja Cane\" Bracciano", "\"Mannaja Cane\" carta menu listino dove si trova", "enoteca Bracciano"),
            TrovaDove.ricerche(TrovaDove.Richiesta("Mannaja Cane", vicinoA = "Bracciano", indizi = listOf("enoteca Bracciano"))))
        assertTrue(TrovaDove.difetti(TrovaDove.Richiesta("Mannaja Cane", osm = listOf("amenity=restaurant"))).any { it.contains("vicino_a") })
        assertTrue(TrovaDove.difetti(TrovaDove.Richiesta("Mannaja Cane", varianti = listOf("MC"), luoghi = listOf("https://x.it"))).any { it.contains("varianti") })
        assertTrue(TrovaDove.difetti(TrovaDove.Richiesta("Mannaja Cane", vicinoA = "Canale Monterano", km = 50, osm = listOf("amenity=restaurant|bar"))).isEmpty())
    }

    @Test fun laSchedaDiceLeProve() {
        val r = TrovaDove.Richiesta("Mannaja Cane", vicinoA = "Canale Monterano", km = 50, osm = listOf("amenity=restaurant"))
        val salotto = TrovaDove.Candidato("Salotto Belvedere", "https://salottobelvedere.it/", "Bracciano", 7.4, TrovaDove.Origine.MAPPA)
        val esiti = listOf(
            TrovaDove.Esito.NonTrovato(TrovaDove.Candidato("Osteria", "https://osteria.it/", "Manziana", 4.0, TrovaDove.Origine.MAPPA), 3),
            TrovaDove.Esito.Trovato(salotto, "https://salottobelvedere.it/carta-vini/", "Mannaja Cane 2023 (Sangiovese) Regina del Quartuccio 28€"),
            TrovaDove.Esito.NonAperto(TrovaDove.Candidato("Bar", "https://bar.it/", origine = TrovaDove.Origine.WEB), "pagina anti-robot non superata in 25 secondi"),
            TrovaDove.Esito.SenzaSito(TrovaDove.Candidato("Trattoria", null, "Tolfa", 20.0, TrovaDove.Origine.MAPPA)))
        val s = TrovaDove.scheda(r, esiti, emptyList())
        assertTrue(s, s.lines()[1] == "1 posto lo ha su 3 siti aperti · 1 non aperti · 1 senza sito")
        assertTrue(s, s.lines()[2].startsWith("✓ Salotto Belvedere (Bracciano, 7 km in linea d'aria) — «Mannaja Cane 2023"))
        val m = TrovaDove.perIlModello(r, esiti, emptyList())
        assertTrue(m.contains("non risulta dal sito") && !m.contains("Nessun sito lo nomina"))
        assertTrue(TrovaDove.perIlModello(r, esiti.filter { it !is TrovaDove.Esito.Trovato }, emptyList()).contains("Nessun sito lo nomina"))
    }

    @Test fun laMappaDiRiservaLeggeNominatim() {
        val t = javaClass.getResource("/pagine/nominatim-ristoranti.json")!!.readText()
        val tutti = Mappa.luoghiNominatim(t, 42.136, 12.103, 15, listOf(Mappa.Filtro("amenity", "restaurant")))
        assertTrue(tutti.size in 10..50)
        assertTrue(tutti.zipWithNext().all { it.first.km <= 15.0 })
        assertTrue(tutti.any { !it.url.contains("openstreetmap.org") })
        // Le altre regole si controllano sui tag: una cucina che nessuno ha resta vuota.
        assertTrue(Mappa.luoghiNominatim(t, 42.136, 12.103, 15, listOf(Mappa.Filtro("amenity", "restaurant"), Mappa.Filtro("cuisine", "nessuna_cucina"))).isEmpty())
        assertEquals(listOf("[amenity=restaurant]", "[amenity=bar]"), Mappa.categorie(listOf(Mappa.Filtro("amenity", "restaurant|bar"))))
        assertEquals("12.03000,42.20000,12.17000,42.06000".length, Mappa.riquadro(42.13, 12.10, 8).length)
    }
}
