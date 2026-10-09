package it.resonance.adam.logica

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// La mappa (02/10/2026, notte): le forme vere di Nominatim e Overpass, copiate dalle risposte del 02/10.
class MappaTest {
    private val nominatim = """[{"place_id":80074198,"osm_type":"relation","osm_id":41812,"lat":"42.1360430","lon":"12.1030665","category":"boundary",
        "type":"administrative","addresstype":"village","name":"Canale Monterano","display_name":"Canale Monterano, Roma Capitale, Lazio, Italia"}]"""
    private val overpass = """{"elements": [{"type": "node", "id": 1409366995, "lat": 42.0995634, "lon": 12.1695228, "tags": {"addr:city": "Bracciano",
        "amenity": "restaurant", "cuisine": "chinese", "name": "Shen Long"}}, {"type": "node", "id": 1739477423, "lat": 42.4108757, "lon": 12.1149122,
        "tags": {"amenity": "restaurant", "cuisine": "japanese", "name": "Shizen"}}, {"type": "node", "id": 5313604827, "lat": 42.42651, "lon": 12.0917299,
        "tags": {"amenity": "restaurant", "cuisine": "japanese", "name": "Shizen", "website": "shizenviterbo.it"}},
        {"type": "way", "id": 7, "center": {"lat": 42.137, "lon": 12.104}, "tags": {"amenity": "restaurant", "cuisine": "regional;italian", "name": "La Riserva"}}]}"""

    @Test fun ilCentroEILuoghiComeLiScriveOpenStreetMap() {
        val (la, lo) = Mappa.centro(nominatim)!!
        assertEquals(42.136, la, 0.001)
        val l = Mappa.luoghi(overpass, la, lo)
        // I più vicini prima; la via («way») ha il centro; due Shizen diversi restano due.
        assertEquals(listOf("La Riserva", "Shen Long", "Shizen", "Shizen"), l.map { it.nome })
        assertEquals("regional,italian", l[0].categoria)
        assertEquals("https://www.openstreetmap.org/way/7", l[0].url)
        assertTrue(l[1].km in 6.0..8.0)
        assertNull(Mappa.centro("[]"))
        assertTrue(Mappa.luoghi("<html>server occupato</html>", la, lo).isEmpty())
    }

    @Test fun iFiltriSoloNellaFormaDiOpenStreetMap() {
        val f = Mappa.filtri(listOf("amenity=restaurant", "cuisine=ethiopian|eritrean"))!!
        val q = Mappa.query(f, 42.136, 12.103, 30)
        assertEquals("[out:json][timeout:25];nwr[\"amenity\"=\"restaurant\"][\"cuisine\"~\"ethiopian|eritrean\",i][\"name\"](around:30000,42.136,12.103);out center tags ${Mappa.MASSIMO};", q)
        // Niente che possa diventare un pezzo di query.
        assertNull(Mappa.filtri(listOf("amenity=restaurant\"];out;")))
        assertNull(Mappa.filtri(listOf("ristoranti etnici")))
        assertNull(Mappa.filtri(emptyList()))
        assertTrue(Mappa.query(f, 0.0, 0.0, 500).contains("around:${Mappa.KM_MAX * 1000},"))
    }
}
