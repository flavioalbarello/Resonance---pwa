package it.resonance.adam.logica

import it.resonance.adam.cervello.Compito
import it.resonance.adam.dati.Movimento
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Nota
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMovimento
import it.resonance.adam.dati.Voce
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class PacchettoAdamTest {
    private val oggi = LocalDate.of(2026, 9, 27)
    private val giorno = 86_400_000L

    // Il banco delle capacità: ogni strumento dello Shell ha la sua riga nella mappa, e la mappa non ne inventa.
    // Una funzione nuova senza riga non passa: è così che lo Shell non scopre più le cose dal Ghost.
    @Test fun laMappaDelleCapacitaCopreTuttiGliStrumenti() {
        val strumenti = Azioni.strumenti.map { it.nome }.toSet()
        assertEquals(emptySet<String>(), strumenti - Capacita.strumenti())
        assertEquals(emptySet<String>(), Capacita.strumenti() - strumenti)
        assertTrue(Capacita.testo("2.260925.1200").startsWith("L'APP OGGI (versione 2.260925.1200)"))
        assertEquals(Compito.entries.filter { it != Compito.MOTORE }.map { it.name }, Azioni.COMPITI_REGOLABILI)
    }

    @Test fun unaNotaNonRipresaEvapora() {
        val ora = 100 * giorno
        val fresca = Nota(1, "fresca", creata = ora, ripresa = ora - 2 * giorno)
        val vecchia = Nota(2, "vecchia", creata = 0, ripresa = ora - 21 * giorno)
        val tolta = Nota(3, "tolta", creata = ora, ripresa = ora, tolta = true)
        assertEquals(listOf("fresca"), Taccuino.vive(listOf(fresca, vecchia, tolta), ora).map { it.testo })
        assertEquals(19, Taccuino.giorniRimasti(fresca, ora))
        assertEquals("#1 (evapora tra 19 gg): fresca", Taccuino.riga(fresca, ora))
    }

    // Le soglie le ha scritte lo Shell: sotto metà del versato, sopravvivenza; a zero, fermo.
    @Test fun ilFondoContaSaldoModoEAutosufficienza() {
        fun m(tipo: TipoMovimento, e: Double, g: String = "2026-09-20") = Movimento(giorno = g, tipo = tipo, importo = e, motivo = "x", creato = 0)
        assertEquals(Fondo.Modo.VUOTO, Fondo.stato(emptyList(), oggi).modo)
        val pieno = Fondo.stato(listOf(m(TipoMovimento.VERSAMENTO, 100.0), m(TipoMovimento.USCITA, 30.0)), oggi)
        assertEquals(70.0, pieno.saldo, 1e-9)
        assertEquals(Fondo.Modo.PIENO, pieno.modo)
        assertFalse(Fondo.autosufficiente(pieno))
        assertEquals(Fondo.Modo.SOPRAVVIVENZA, Fondo.stato(listOf(m(TipoMovimento.VERSAMENTO, 100.0), m(TipoMovimento.USCITA, 60.0)), oggi).modo)
        assertEquals(Fondo.Modo.FERMO, Fondo.stato(listOf(m(TipoMovimento.VERSAMENTO, 100.0), m(TipoMovimento.USCITA, 100.0)), oggi).modo)
        val vive = Fondo.stato(listOf(m(TipoMovimento.VERSAMENTO, 100.0), m(TipoMovimento.USCITA, 15.0), m(TipoMovimento.ENTRATA, 18.0),
            m(TipoMovimento.USCITA, 50.0, "2026-07-01")), oggi)
        assertTrue(Fondo.autosufficiente(vive)) // negli ultimi 30 giorni 18 € entrati contro 15 usciti
    }

    // Il dado: lo stesso seme dà la stessa scelta (ricostruibile); senza niente da scegliere, non tira.
    @Test fun ilDadoERiproducibileDalSeme() {
        val i = Istantanea(oggi, null, emptyList(), emptyList(), emptyList(),
            listOf(Percorso(1, Pilastro.VIDYA, "Tributo", creato = 0)),
            listOf(Nodo(1, 1, "Gianna", StatoNodo.INTRODOTTO, 0), Nodo(2, 1, "Berta", StatoNodo.CONSOLIDATO, 1)),
            emptyList(), emptyList())
        val voci = listOf(Voce(1, Pilastro.BIO, "2026-07-01", "Schiena rigida dopo il concerto", "manuale", 0, 0))
        val scelte = (1L..40L).map { Dado.scegli(i, voci, it) }
        assertEquals(scelte, (1L..40L).map { Dado.scegli(i, voci, it) })
        assertTrue(scelte.any { it is Dado.Scelta.Ricordo } && scelte.any { it is Dado.Scelta.Fermo } && scelte.any { it is Dado.Scelta.Trascurato })
        assertTrue(scelte.filterIsInstance<Dado.Scelta.Fermo>().all { it.nodo.etichetta == "Gianna" })
        val vuota = Istantanea(oggi, null, emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())
        assertTrue(Dado.scegli(vuota, emptyList(), 7) is Dado.Scelta.Trascurato)
        assertNull(null)
    }

    @Test fun ilContestoPortaTaccuinoFondoECapacita() {
        val ora = System.currentTimeMillis()
        val i = Istantanea(LocalDate.now(), null, emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(),
            note = listOf(Nota(4, "provare un planner per musicisti", creata = ora, ripresa = ora)), versione = "2.x")
        val s = Contesto.sistema(i)
        assertTrue(s, s.contains("TACCUINO DELLO SHELL (ipotesi tue, non fatti)") && s.contains("#4 (evapora tra 21 gg): provare un planner"))
        assertTrue(s, s.contains("FONDO DI ADAM") && s.contains("nessun fondo ancora"))
        assertTrue(s, s.contains("L'APP OGGI (versione 2.x)") && s.contains("scrivi_all_architetto"))
    }
}
