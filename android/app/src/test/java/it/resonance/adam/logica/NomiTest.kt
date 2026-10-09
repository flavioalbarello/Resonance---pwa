package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Il nome dello Shell e il significato dei pilastri (01/10/2026).
class NomiTest {
    private fun istantanea(p: Profilo?) = Istantanea(LocalDate.of(2026, 10, 1), p, emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList(), emptyList())

    @Test fun ognunoDaAlSuoShellIlNomeCheVuole() {
        assertEquals("Shell", Nomi.shell(null))
        assertEquals("Shell", Nomi.shell(Profilo(nomeShell = "  ")))
        assertEquals("Lo Shell", Nomi.soggetto(Profilo()))
        val luisa = Profilo(nome = "Marta", nomeShell = "Luisa")
        assertEquals("Luisa", Nomi.soggetto(luisa))
        assertEquals("tu e Luisa, insieme più della somma", Significati.riga(Pilastro.ADAM, Nomi.shellNellaFrase(luisa)))
        assertEquals("tu e lo Shell, insieme più della somma", Significati.riga(Pilastro.ADAM, Nomi.shellNellaFrase(Profilo())))
        assertFalse(Nomi.valido("Un nome lunghissimo che non è un nome"))
        assertFalse(Nomi.valido("Lu\nisa"))
        // Lo Shell sa come si chiama; senza nome non gli si dice niente.
        assertTrue(Contesto.sistema(istantanea(luisa)).contains("Il Ghost ti ha dato un nome: Luisa."))
        assertFalse(Contesto.sistema(istantanea(Profilo())).contains("ti ha dato un nome"))
    }

    @Test fun loShellSaSpiegareIPilastriConLeParoleDelGhost() {
        val s = Contesto.sistema(istantanea(Profilo()))
        Significati.PER_LO_SHELL.forEach { assertTrue(it.take(40), s.contains(it)) }
        assertTrue(s.contains("zoē") && s.contains("Automated Income Revenue") && s.contains("avidyā"))
        Pilastro.entries.forEach { assertTrue(Significati.riga(it).isNotBlank()) }
    }
}
