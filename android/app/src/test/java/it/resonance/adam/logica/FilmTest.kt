package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoBlocco
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.MisuraFronte
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

// Il film della settimana: una scena per ogni fatto vero, nessuna per ciò che non c'è.
class FilmTest {
    private val oggi = LocalDate.parse("2026-10-18")
    private fun g(fa: Long) = oggi.minusDays(fa).toString()
    private fun ms(fa: Long) = oggi.minusDays(fa).atTime(18, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    @Test fun ogniScenaEUnFatto() {
        val tributo = Percorso(id = 1, pilastro = Pilastro.VIDYA, titolo = "Tributo", creato = 0, misura = MisuraFronte.VELOCITA, prossimoPasso = "la base di Aida")
        val gianna = Nodo(id = 1, percorsoId = 1, etichetta = "Gianna", ordine = 0, velocita = 100, puliteDiFila = 2, ultimaPratica = g(1))
        val misure = listOf(2L, 4L).map { Misura(tipo = TipoMisura.PRATICA, valore = 45.0, giorno = g(it), istante = 0, fonte = "sessione") } +
            Misura(tipo = TipoMisura.PRATICA, valore = 30.0, giorno = g(9), istante = 0, fonte = "sessione")
        val r = Rituale(id = 1, nome = "Stretching", pilastro = Pilastro.BIO, creato = 0)
        val spunte = (0L..5L).map { Spunta(1, g(it), "manuale", 0) }
        val i = Istantanea(oggi, null, misure, listOf(r), spunte, listOf(tributo), listOf(gianna), emptyList(), emptyList())
        val esiti = listOf(EsitoBlocco(sessioneId = 1, nodoId = 1, velocita = 80, esito = EsitoPratica.PULITO, istante = ms(10)),
            EsitoBlocco(sessioneId = 2, nodoId = 1, velocita = 100, esito = EsitoPratica.PULITO, istante = ms(1)))
        val scene = Film.scene(i, emptyList(), esiti, emptyList(), ZoneOffset.UTC)
        val etichette = scene.map { it.etichetta }
        assertEquals(Film.Tipo.APERTURA, scene.first().tipo); assertEquals(Film.Tipo.RITRATTO, scene.last().tipo)
        val studio = scene.single { it.etichetta == "Studio" }
        assertEquals("1h30", studio.grande); assertTrue(studio.sotto, studio.sotto.contains("1h più della settimana prima"))
        assertTrue(etichette.contains("Un pezzo è pronto"))
        assertEquals("80% → 100%", scene.single { it.etichetta == "Gianna" }.grande)
        assertEquals("6 su 7", scene.single { it.etichetta == "Ha retto" }.grande)
        assertTrue(scene.last().sotto.contains("la base di Aida"))
        // Niente sonno né passi né scoperte: niente scene inventate.
        assertTrue(etichette.none { it == "Sonno" || it == "Passi" || it == "Una cosa che non sapevi" })
    }

    @Test fun unaSettimanaVuotaEBreveEOnesta() {
        val i = Istantanea(oggi, null, emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
        assertEquals(listOf(Film.Tipo.APERTURA, Film.Tipo.RITRATTO), Film.scene(i, emptyList(), emptyList(), emptyList()).map { it.tipo })
    }
}
