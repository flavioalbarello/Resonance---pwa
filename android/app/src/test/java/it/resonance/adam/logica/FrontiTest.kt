package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Sessione
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

// Oggi e Fronti (V3): cosa proporre adesso, in che ordine mostrare i fronti, quali numeri si sono mossi.
class FrontiTest {
    private val oggi = LocalDate.parse("2026-10-16")
    private val tributo = Percorso(id = 1, pilastro = Pilastro.VIDYA, titolo = "Tributo", creato = 1, scadenza = "2026-11-15")
    private val album = Percorso(id = 2, pilastro = Pilastro.VIDYA, titolo = "Divenire", creato = 2)
    private val chiuso = Percorso(id = 3, pilastro = Pilastro.BIO, titolo = "Vecchio", creato = 3, archiviato = true)
    private val nodi = listOf(
        Nodo(id = 10, percorsoId = 1, etichetta = "Gianna", ordine = 0, velocita = 80, ultimaPratica = "2026-10-10"),
        Nodo(id = 11, percorsoId = 1, etichetta = "Aida", ordine = 1, velocita = 100, puliteDiFila = 2, ultimaPratica = "2026-10-15"),
        Nodo(id = 20, percorsoId = 2, etichetta = "Atto I", ordine = 0, stato = StatoNodo.CONSOLIDATO),
        Nodo(id = 30, percorsoId = 3, etichetta = "x", ordine = 0),
    )

    @Test fun oggiProponeIlPezzoPiuUrgenteFraTuttiIFronti() {
        val p = Fronti.prossimo(listOf(tributo, album, chiuso), nodi, oggi)!!
        assertEquals("Gianna", p.pezzo.etichetta); assertEquals(1L, p.percorso.id)
        // Un progetto mai studiato, senza scadenza né ritmo, non si propone da sé.
        assertNull(Fronti.prossimo(listOf(album, Percorso(id = 4, pilastro = Pilastro.ADAM, titolo = "Resonance", creato = 4)),
            nodi + Nodo(id = 40, percorsoId = 4, etichetta = "Plasmidi", ordine = 0), oggi))
        assertEquals(false, Fronti.diPratica(album, nodi)); assertEquals(true, Fronti.diPratica(tributo, nodi))
    }

    @Test fun iFrontiUrgentiInCimaGliArchiviatiFuori() {
        assertEquals(listOf(1L, 2L), Fronti.ordina(listOf(album, chiuso, tributo), nodi, oggi).map { it.id })
    }

    @Test fun lUltimaSessioneInUnaRiga() {
        val ms = { g: String, ora: Int -> LocalDate.parse(g).atTime(ora, 0).toInstant(ZoneOffset.UTC).toEpochMilli() }
        val s = listOf(Sessione(id = 1, percorsoId = 1, inizio = ms("2026-10-15", 18), minuti = 30, piano = "[]", fine = ms("2026-10-15", 18) + 25 * 60_000),
            Sessione(id = 2, percorsoId = 1, inizio = ms("2026-10-16", 9), minuti = 10, piano = "[]"))
        val ultima = Fronti.ultima(s, 1)!!
        assertEquals(1L, ultima.id)
        assertEquals("ultima sessione ieri, 25 min", Fronti.rigaUltima(ultima, oggi, ZoneOffset.UTC))
        assertNull(Fronti.rigaUltima(null, oggi))
    }

    @Test fun soloINumeriMossiDaIeri() {
        val m = { t: TipoMisura, g: String -> Misura(tipo = t, valore = 1.0, giorno = g, istante = 0, fonte = "x") }
        assertEquals(listOf(TipoMisura.SONNO, TipoMisura.PRATICA),
            Fronti.cambiati(listOf(m(TipoMisura.PESO, "2026-10-13"), m(TipoMisura.SONNO, "2026-10-16"), m(TipoMisura.PRATICA, "2026-10-15")), oggi))
    }
}
