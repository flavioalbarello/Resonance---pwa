package it.resonance.adam.logica

import it.resonance.adam.cervello.Tavolo
import it.resonance.adam.dati.Consegna
import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoConsegna
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ConsegneTest {
    private val oggi = LocalDate.of(2026, 9, 26)
    private val percorsi = listOf(Percorso(1, Pilastro.ADAM, "Resonance", creato = 0), Percorso(2, Pilastro.VIDYA, "Tributo", creato = 0))
    private fun consegna(scadenza: LocalDate = oggi.plusDays(3), percorso: String? = "Resonance") =
        Consegna(id = 1, cosa = "Scheda", documento = "Scheda micro-asset", percorso = percorso, presa = oggi.toString(), scadenza = scadenza.toString(), creata = 1000)
    private fun doc(titolo: String, percorso: Long = 1, aggiornato: Long = 2000, testo: String = "Nicchia: planner") =
        Documento(percorsoId = percorso, titolo = titolo, testo = testo, creato = aggiornato, aggiornato = aggiornato)

    @Test fun laFormaSiVerificaSulDocumentoVeroNonSulleParole() {
        val c = consegna()
        assertEquals(StatoConsegna.MANTENUTA, Consegne.verifica(listOf(c), listOf(doc("scheda MICRO-asset")), percorsi, oggi).single().stato)
        // Vuoto, nel percorso sbagliato, o scritto prima della presa: non mantiene.
        assertTrue(Consegne.verifica(listOf(c), listOf(doc("Scheda micro-asset", testo = " ")), percorsi, oggi).isEmpty())
        assertTrue(Consegne.verifica(listOf(c), listOf(doc("Scheda micro-asset", percorso = 2)), percorsi, oggi).isEmpty())
        assertTrue(Consegne.verifica(listOf(c), listOf(doc("Scheda micro-asset", aggiornato = 500)), percorsi, oggi).isEmpty())
        // Senza percorso dichiarato vale ovunque.
        assertEquals(1, Consegne.verifica(listOf(consegna(percorso = null)), listOf(doc("Scheda micro-asset", percorso = 2)), percorsi, oggi).size)
    }

    @Test fun allaScadenzaNonSiChiudeDopoSiEResta() {
        val c = consegna(scadenza = oggi)
        assertTrue(Consegne.verifica(listOf(c), emptyList(), percorsi, oggi).isEmpty())
        val mancata = Consegne.verifica(listOf(c), emptyList(), percorsi, oggi.plusDays(1)).single()
        assertEquals(StatoConsegna.MANCATA, mancata.stato)
        assertEquals("Consegna dello Shell mancata: «Scheda» (presa il 26/09). Alla scadenza del 26/09 il documento «Scheda micro-asset» nel percorso «Resonance» non c'era.",
            Consegne.traccia(mancata))
    }

    @Test fun ilTurnoDiLavoroParteUnaVoltaDalGiornoPrima() {
        val c = consegna(scadenza = oggi.plusDays(2))
        assertTrue(Consegne.daLavorare(listOf(c), oggi).isEmpty())
        assertEquals(1, Consegne.daLavorare(listOf(c), oggi.plusDays(1)).size)
        assertTrue(Consegne.daLavorare(listOf(c.copy(lavorata = true)), oggi.plusDays(1)).isEmpty())
    }

    @Test fun ilVerbaleHaLaSuaFormaEAccettaIlMarkdown() {
        assertEquals(Tavolo.SEZIONI, Tavolo.mancano("Tutto proposto. Conferma quello che vuoi."))
        assertTrue(Tavolo.mancano("**Decisioni**\n- a\n## Questioni aperte\n- b\nChi fa cosa:\n- c").isEmpty())
    }

    @Test fun laFrecciaLaDecideLaPrimaRigaEIGiriSiContanoDalGhost() {
        assertTrue(Tavolo.rivolto("→ Shell\nDomanda?"))
        assertTrue(Tavolo.rivolto("  -> shell: domanda"))
        assertFalse(Tavolo.rivolto("Presente. Shell, se vuoi → Shell"))
        assertEquals("Allo Shell: Domanda?", Tavolo.leggibile("→ Shell\nDomanda?"))
        fun m(r: Ruolo, t: String) = Messaggio(ruolo = r, testo = t, istante = 0)
        val storia = listOf(m(Ruolo.ARCHITETTO, "→ Shell a"), m(Ruolo.GHOST, "vai"), m(Ruolo.ARCHITETTO, "→ Shell b"),
            m(Ruolo.SHELL, "ok"), m(Ruolo.ARCHITETTO, "nota"), m(Ruolo.ARCHITETTO, "→ Shell c"))
        assertEquals(2, Tavolo.giri(storia))
    }

    @Test fun laPropostaDiCalendarioDiceDoveScrivePrimaDiConfermare() {
        val p = Proposta.CreaEvento("Scheda", "2026-09-29", 0)
        assertTrue(p.descrizione(), p.descrizione().startsWith("Mettere in calendario «Scheda»"))
        val scelta = p.copy(calendarioId = 7, calendario = "progettoresonance@gmail.com")
        assertTrue(scelta.descrizione(), scelta.descrizione().startsWith("Mettere in calendario «progettoresonance@gmail.com» «Scheda»"))
        // Una proposta scritta prima del 26/09 (senza calendario) si legge ancora.
        val vecchia = Azioni.decodifica("""{"azione":"crea_evento","titolo":"X","inizio":"2026-09-29","durataMinuti":0}""") as Proposta.CreaEvento
        assertEquals(null, vecchia.calendarioId)
    }

    @Test fun leFinteNoteELeChiamateScritteSiRiconoscono() {
        assertTrue(Testi.fintaNota("x\n[Nota del programma: chiusa.]"))
        assertEquals("x", Testi.senzaFinteNote("x\n\n[nota del programma: chiusa]"))
        assertEquals(listOf("crea_evento"), Testi.chiamateScritte("proposto crea_evento(titolo='a')", listOf("crea_evento", "cerca")))
        assertTrue(Testi.chiamateScritte("ho usato crea_evento per metterlo", listOf("crea_evento")).isEmpty())
    }
}
