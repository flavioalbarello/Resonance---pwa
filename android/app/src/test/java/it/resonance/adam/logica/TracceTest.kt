package it.resonance.adam.logica

import it.resonance.adam.dati.Stanza
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Il terreno di Adam City (riunione del 01/10/2026): la forma e i quattro gesti, senza Android.
class TracceTest {
    private val oggi = LocalDate.of(2026, 10, 1)
    private val casa = Stanza(id = 1, nome = "casa", entrata = "2026-09-30")
    private fun traccia(durata: Int = 4) = Tracce.deposita(casa, "Ghost", "cena", "Stasera brace, 20:30", oggi, durata, 0).copy(id = 7)

    @Test fun unaTracciaHaUnaFormaSola() {
        assertTrue(Tracce.difetti(casa, "cena", "Stasera brace, 20:30", 2, oggi).isEmpty())
        // Senza stanza, o da una stanza lasciata, non si deposita.
        assertTrue(Tracce.difetti(null, "cena", "x", 2, oggi).single().contains("gesto"))
        assertTrue(Tracce.difetti(casa.copy(uscita = "2026-09-30"), "cena", "x", 2, oggi).single().contains("uscito"))
        // Un ospite a tempo esce da solo alla scadenza.
        assertTrue(Tracce.aperta(casa.copy(scade = "2026-10-01"), oggi))
        assertTrue(!Tracce.aperta(casa.copy(scade = "2026-09-30"), oggi))
        assertTrue(Tracce.difetti(casa, "Cena di casa", "x", 2, oggi).any { it.contains("ambito") })
        assertTrue(Tracce.difetti(casa, "cena", "x".repeat(Tracce.COSA_MAX + 1), 2, oggi).any { it.contains("riga") })
        assertTrue(Tracce.difetti(casa, "cena", "x", 0, oggi).any { it.contains("giorni") })
        // Chi aspetta una risposta non lascia una traccia: è un impegno a due.
        assertTrue(Tracce.difetti(casa, "cena", "Prenoto il ristorante sabato, vieni?", 2, oggi).any { it.contains("impegno a due") })
    }

    @Test fun senzaFattiLaForzaCalaESvanisce() {
        val t = traccia(durata = 4)
        assertEquals(1.0, Tracce.forza(t, oggi), 1e-9)
        assertEquals(0.5, Tracce.forza(t, oggi.plusDays(2)), 1e-9)
        assertTrue(Tracce.viva(t, oggi.plusDays(3)))
        assertTrue(!Tracce.viva(t, oggi.plusDays(4)))
        val svanite = Tracce.daSvanire(listOf(t), oggi.plusDays(4))
        assertEquals("2026-10-05", svanite.single().svanita)
        // Svanita, la traccia resta nell'archivio ma non si legge più.
        assertTrue(Tracce.daLeggere(svanite, listOf(casa), oggi).isEmpty())
    }

    @Test fun ilRinforzoVieneDaUnFattoNonDaUnaFrase() {
        val t = traccia(durata = 4)
        val fatto = Tracce.Prova("voce", 42, oggi.plusDays(1))
        val r = Tracce.rinforza(t, fatto, oggi.plusDays(1)).getOrThrow()
        // Il giorno dopo la forza è già scesa a 0,75: il rinforzo parte da lì.
        assertEquals(1.75, r.forza, 1e-9)
        assertEquals("2026-10-02", r.rinforzata)
        // Il calo riparte dal rinforzo: quattro giorni da lì.
        assertTrue(Tracce.viva(r, oggi.plusDays(4)))
        // Lo stesso fatto non conta due volte; una dichiarazione non è un fatto; il futuro nemmeno.
        assertTrue(Tracce.rinforza(r, fatto, oggi.plusDays(2)).isFailure)
        assertTrue(Tracce.rinforza(t, Tracce.Prova("chat", 1, oggi), oggi).isFailure)
        assertTrue(Tracce.rinforza(t, Tracce.Prova("voce", 1, oggi.plusDays(3)), oggi).isFailure)
        // Un fatto prima che la traccia valga, o dopo che è svanita, non la riguarda.
        assertTrue(Tracce.rinforza(t, Tracce.Prova("voce", 2, oggi.minusDays(1)), oggi).isFailure)
        assertTrue(Tracce.rinforza(t, Tracce.Prova("voce", 3, oggi.plusDays(4)), oggi.plusDays(5)).isFailure)
    }

    @Test fun laForzaHaUnTettoEUnRinforzoTardivoNonResuscita() {
        var t = traccia(durata = 10)
        (1L..8L).forEach { n -> t = Tracce.rinforza(t, Tracce.Prova("spunta", n, oggi), oggi).getOrThrow() }
        assertEquals(Tracce.FORZA_MAX, t.forza, 1e-9)
        val tardi = Tracce.rinforza(traccia(durata = 10), Tracce.Prova("voce", 9, oggi.plusDays(8)), oggi.plusDays(8)).getOrThrow()
        assertEquals(1.0 * 0.2 + Tracce.RINFORZO, tardi.forza, 1e-9)
    }

    @Test fun loShellLeggeLeTracceDelleStanzeAperte() {
        val banda = Stanza(id = 2, nome = "banda", entrata = "2026-09-01", uscita = "2026-09-20")
        val t1 = traccia()
        val t2 = t1.copy(id = 8, stanzaId = 2, ambito = "musica", cosa = "Porto io l'amplificatore")
        val testo = Tracce.perLoShell(listOf(t1, t2), listOf(casa, banda), oggi)
        assertEquals("- [casa · cena] Ghost: Stasera brace, 20:30 (dal 2026-10-01, forza 1.0)", testo)
    }
}
