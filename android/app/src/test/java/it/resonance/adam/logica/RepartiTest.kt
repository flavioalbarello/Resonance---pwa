package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Lo Shell più leggero (02/10/2026): un nucleo sempre, i reparti che il turno chiama (logica/Reparti.kt).
class RepartiTest {
    @Test fun ogniStrumentoStaInUnRepartoSolo() {
        val tutti = Azioni.strumenti.map { it.nome }
        tutti.forEach { n -> assertEquals(n, 1, Reparto.entries.count { n in it.strumenti }) }
        assertEquals(emptySet<String>(), Reparto.entries.flatMap { it.strumenti }.toSet() - tutti.toSet())
    }

    @Test fun leChiaviSiAccendonoSuCiòCheServe() {
        fun r(t: String, vararg prima: String) = Reparto.scegli(t, prima.toList())
        assertTrue(Reparto.AGENDA in r("spostami il dentista a domani"))
        assertTrue(Reparto.LAVAGNA in r("metti il latte nella lista della spesa"))
        assertTrue(Reparto.MONDO in r("trovami dei ristoranti entro mezz'ora"))
        assertTrue(Reparto.PERCORSI in r("aggiungi i tre brani alla scaletta"))
        assertTrue(Reparto.SISTEMA in r("come funziona il tasto Perturba nell'app?"))
        assertTrue(Reparto.RITUALI in r("voglio provare a leggere ogni sera"))
        // La continuità: «ok, allarga» dopo una ricerca.
        assertTrue(Reparto.MONDO in r("ok, allarga", "trovami ristoranti etnici a Viterbo"))
        // La riunione porta il suo reparto; un allegato i documenti.
        assertTrue(Reparto.RIUNIONE in Reparto.scegli("ciao", riunione = true))
        assertTrue(Reparto.PERCORSI in Reparto.scegli("guarda", allegati = true))
    }

    @Test fun leFrasiDiVitaNonAccendonoNiente() {
        listOf("oggi peso 82,4", "ho dormito male stanotte", "come stai?", "sono stanco, Marta è uscita con le bambine",
            "ho fatto 40 minuti di chitarra").forEach { t ->
            assertEquals(t, setOf(Reparto.NUCLEO), Reparto.scegli(t))
        }
    }

    // La misura che ha deciso il lavoro: quanto pesa ciò che lo Shell ha davanti in un turno semplice.
    @Test fun unTurnoSempliceCostaMenoDellaMetà() {
        val i = Istantanea(oggi = LocalDate.of(2026, 10, 2), profilo = Profilo(nome = "Flavio"), misure = emptyList(), rituali = emptyList(),
            spunte = emptyList(), percorsi = emptyList(), nodi = emptyList(), documenti = emptyList(), quaderni = listOf(Quaderno(Pilastro.BIO, "Il giovedì dorme poco", 0)))
        val pieno = Contesto.sistema(i).length + Azioni.definizioni().toString().length
        val nucleo = setOf(Reparto.NUCLEO)
        val snello = Contesto.sistema(i, nucleo).length + Azioni.definizioni(reparti = nucleo).toString().length
        assertTrue("$snello su $pieno", snello < pieno * 0.55)
        // Le misure stampate, per PROGETTO.md: tutto, un turno semplice, uno di ricerca, uno di agenda.
        listOf("oggi peso 82", "trovami ristoranti a Bracciano", "spostami il dentista a domani").forEach { t ->
            val r = Reparto.scegli(t)
            println("MISURA «$t»: ${Contesto.sistema(i, r).length + Azioni.definizioni(reparti = r).toString().length} su $pieno, ${Azioni.definizioni(reparti = r).size} strumenti su ${Azioni.definizioni().size}")
        }
        // Ciò che resta chiuso si vede nell'indice, con i nomi degli strumenti; il nucleo ha sempre la sua regola.
        val s = Contesto.sistema(i, nucleo)
        assertTrue(s.contains("REPARTI CHIUSI") && s.contains("crea_evento") && s.contains(Reparto.APRI) && s.contains("registra_misura"))
        assertTrue(!s.contains("LAVAGNA: scrivi_appunto, modifica_appunto") && !s.contains("I NOMI DEI PILASTRI"))
        val nomi = Azioni.definizioni(reparti = nucleo).map { it.toString() }
        assertTrue(nomi.any { "\"registra_misura\"" in it } && nomi.any { "\"${Reparto.APRI}\"" in it } && nomi.none { "\"crea_evento\"" in it })
        // Tutto aperto = come prima, senza apri_reparto.
        assertEquals(Azioni.definizioni().size, Azioni.definizioni(reparti = Reparto.entries.toSet()).size)
    }
}
