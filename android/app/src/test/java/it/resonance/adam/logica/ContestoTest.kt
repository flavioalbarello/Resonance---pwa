package it.resonance.adam.logica

import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ContestoTest {
    private val oggi = LocalDate.of(2026, 9, 23)

    private fun istantanea(misure: List<Misura> = emptyList(), rituali: List<Rituale> = emptyList(), spunte: List<Spunta> = emptyList()) = Istantanea(
        oggi = oggi,
        profilo = Profilo(nome = "Flavio", stile = "Brevissimo.", vincoli = "[AIR] Niente nome professionale in uscita"),
        misure = misure, rituali = rituali, spunte = spunte,
        percorsi = listOf(Percorso(id = 1, pilastro = Pilastro.VIDYA, titolo = "Divenire", scopo = "finire l'album", creato = 0)),
        nodi = listOf(Nodo(id = 1, percorsoId = 1, etichetta = "Atto I", stato = StatoNodo.CONSOLIDATO, ordine = 0)),
        documenti = listOf(Documento(id = 1, percorsoId = 1, titolo = "ATTO I: Origine", testo = "Il seme.", creato = 0, aggiornato = 0)),
        quaderni = listOf(Quaderno(Pilastro.BIO, "Il giovedì dorme poco", 0)),
    )

    @Test fun ilModelloRiceveLeStesseRigheCheVedeIlGhost() {
        val misure = listOf(Misura(tipo = TipoMisura.PESO, valore = 82.0, giorno = oggi.toString(), istante = 0, fonte = "hc"))
        val i = istantanea(misure)
        val riga = Esiti.riga(Esiti.sintesi(misure, TipoMisura.PESO, oggi), oggi)
        val s = Contesto.sistema(i)
        assertTrue(s.contains(riga))
        assertTrue(s.contains("Sonno: nessun dato"))
        assertTrue(s.contains("Entrate: nessun dato"))
    }

    @Test fun profiloVincoliPercorsiEQuaderniEntrano() {
        val s = Contesto.sistema(istantanea())
        assertTrue(s.contains("Brevissimo."))
        assertTrue(s.contains("[AIR] Niente nome professionale in uscita"))
        assertTrue(s.contains("«Divenire» (VIDYA)"))
        assertTrue(s.contains("Atto I [consolidato]"))
        assertTrue(s.contains("«ATTO I: Origine» (8 car.)"))
        assertTrue(s.contains("[BIO] Il giovedì dorme poco"))
        assertFalse("il testo dei documenti non entra nel prompt fisso", s.contains("Il seme."))
    }

    @Test fun ritualeAutomaticoSiContaDallaMisura() {
        val r = Rituale(id = 7, nome = "Dormire 7 ore", pilastro = Pilastro.BIO, criterio = "SONNO>=420", creato = 0)
        // Un buco al quarto giorno: serie e giorni tenuti devono valere numeri diversi, o il test non li distingue.
        val misure = listOf(0L, 1L, 2L, 5L).map { Misura(tipo = TipoMisura.SONNO, valore = 450.0, giorno = oggi.minusDays(it).toString(), istante = 0, fonte = "hc") } +
            Misura(tipo = TipoMisura.SONNO, valore = 300.0, giorno = oggi.minusDays(3).toString(), istante = 0, fonte = "hc")
        val s = Contesto.sistema(istantanea(misure, listOf(r)))
        assertTrue(s, s.contains("Dormire 7 ore (Bio): serie 3 giorni, tenuto 4/14, oggi sì"))
    }

    @Test fun lAgendaEntraSoloSeLetta() {
        assertFalse(Contesto.sistema(istantanea()).contains("AGENDA"))
        val e = Evento("Dentista", oggi.atTime(10, 30), oggi.atTime(11, 15), false)
        val s = Contesto.sistema(istantanea().copy(agenda = AgendaLetta.Letta(oggi, 2, listOf(e))))
        assertTrue(s, s.contains("AGENDA (letta ora dal calendario del telefono)"))
        assertTrue(s.contains(Agenda.riga(e, oggi)))
        val n = Contesto.sistema(istantanea().copy(agenda = AgendaLetta.Negata("manca il permesso")))
        assertTrue(n.contains("Calendario non leggibile: manca il permesso."))
    }

    @Test fun senzaProfiloVaLoStilePredefinito() {
        val s = Contesto.sistema(istantanea().copy(profilo = null))
        assertTrue(s.contains(Contesto.STILE_PREDEFINITO))
    }
}
