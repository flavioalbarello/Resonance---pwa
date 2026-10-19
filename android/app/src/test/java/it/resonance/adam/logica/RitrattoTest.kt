package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Sessione
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

// Il Ritratto di Adam: ciò che si pratica cresce, ciò che si ferma diventa un vuoto, e lo stesso giorno dà la stessa immagine.
class RitrattoTest {
    private val oggi = LocalDate.parse("2026-10-19")
    private fun g(fa: Long) = oggi.minusDays(fa).toString()

    private fun istantanea(): Istantanea {
        val misure = (0L..20L).map { Misura(tipo = TipoMisura.SONNO, valore = 420.0, giorno = g(it), istante = 0, fonte = "hc") } +
            Misura(tipo = TipoMisura.ENTRATA, valore = 50.0, giorno = g(40), istante = 0, fonte = "manuale")
        val r = Rituale(id = 1, nome = "Scala", pilastro = Pilastro.VIDYA, creato = 0)
        val spunte = (0L..13L).filter { it % 2 == 0L }.map { Spunta(1, g(it), "manuale", 0) }
        val tributo = Percorso(id = 1, pilastro = Pilastro.VIDYA, titolo = "Tributo", creato = 0)
        val nodi = listOf(Nodo(id = 1, percorsoId = 1, etichetta = "Gianna", ordine = 0, stato = StatoNodo.CONSOLIDATO, ultimaPratica = g(1)),
            Nodo(id = 2, percorsoId = 1, etichetta = "Aida", ordine = 1))
        return Istantanea(oggi, null, misure, listOf(r), spunte, listOf(tributo), nodi, emptyList(), emptyList())
    }

    @Test fun ilRitrattoDiceLaVeritaSuiPilastri() {
        val s = Sessione(id = 1, percorsoId = 1, inizio = oggi.minusDays(2).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(), minuti = 20, piano = "[]", fine = 1)
        val m = Ritratto.da(istantanea(), listOf(s), ZoneOffset.UTC)
        val bio = m.petali.single { it.pilastro == Pilastro.BIO }
        val air = m.petali.single { it.pilastro == Pilastro.AIR }
        val vidya = m.petali.single { it.pilastro == Pilastro.VIDYA }
        assertTrue(bio.vita > 0.9f); assertFalse(bio.carenza)
        // Air: un'entrata 40 giorni fa, niente da allora. È un vuoto.
        assertTrue(air.carenza); assertEquals(0f, air.vita)
        assertFalse(vidya.carenza)
        assertEquals(0.5f, m.anelli.single().tenuta, 0.01f)
        val ramo = m.rami.single()
        assertEquals(1, ramo.pronti); assertEquals(1, ramo.daFare); assertTrue(ramo.vigore > 0f)
        assertTrue(m.legenda().contains("Air: fermo, è un vuoto") || m.legenda().any { it.startsWith("Air: fermo da") })
        assertTrue(m.legenda().any { it == "«Tributo» cresce: 1 pronti su 2" })
        // Deterministico: gli stessi dati, la stessa immagine.
        assertEquals(m, Ritratto.da(istantanea(), listOf(s), ZoneOffset.UTC))
    }

    @Test fun ciòCheNonSiPraticaSbiadisce() {
        val recente = Ritratto.vita(setOf(oggi, oggi.minusDays(1), oggi.minusDays(2)), oggi)
        val vecchio = Ritratto.vita(setOf(oggi.minusDays(10), oggi.minusDays(11), oggi.minusDays(12)), oggi)
        assertTrue(recente > vecchio * 3)
        assertEquals(0f, Ritratto.vita(setOf(oggi.minusDays(40)), oggi))
    }
}
