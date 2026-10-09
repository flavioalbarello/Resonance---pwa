package it.resonance.adam.logica

import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.StatoNodo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NodiTest {
    private val nodi = listOf(
        Nodo(1, 1, "Scaletta", ordine = 0),
        Nodo(2, 1, "Gianna", StatoNodo.CONSOLIDATO, 0, genitoreId = 1),
        Nodo(3, 1, "Berta filava", StatoNodo.PRATICATO, 1, genitoreId = 1),
        Nodo(4, 1, "Mio fratello è figlio unico", StatoNodo.NON_INIZIATO, 2, genitoreId = 1),
        Nodo(5, 1, "Concerto", StatoNodo.NON_INIZIATO, 1),
        Nodo(6, 1, "Orfano", StatoNodo.INTRODOTTO, 2, genitoreId = 99),
    )

    @Test fun dueLivelliEGliOrfaniTornanoSu() {
        assertEquals(listOf("Scaletta", "Concerto", "Orfano"), Nodi.radici(nodi).map { it.etichetta })
        assertEquals(listOf("Gianna", "Berta filava", "Mio fratello è figlio unico"), Nodi.figli(nodi, 1).map { it.etichetta })
        // Il padre non conta come nodo in più: contano quelli con uno stato loro.
        assertEquals(5, Nodi.foglie(nodi).size)
    }

    @Test fun iPilastriDiUnPercorsoDiAdamSiLegonoDalleParti() {
        val adam = listOf(
            Nodo(1, 1, "APK V2", ordine = 0, pilastro = it.resonance.adam.dati.Pilastro.VIDYA),
            Nodo(2, 1, "Battito", StatoNodo.CONSOLIDATO, 0, genitoreId = 1),
            Nodo(3, 1, "Voce", StatoNodo.NON_INIZIATO, 1, genitoreId = 1),
            Nodo(4, 1, "Plasmidi", ordine = 1, pilastro = it.resonance.adam.dati.Pilastro.AIR),
            Nodo(5, 1, "Uso con Marta", ordine = 2, pilastro = it.resonance.adam.dati.Pilastro.ADAM),
            Nodo(6, 1, "Da decidere", ordine = 3),
        )
        assertEquals(listOf(it.resonance.adam.dati.Pilastro.AIR, it.resonance.adam.dati.Pilastro.VIDYA).sortedBy { it.ordinal }, Nodi.pilastriToccati(adam))
        assertEquals(it.resonance.adam.dati.Pilastro.VIDYA, Nodi.pilastroDi(adam[1], adam))
        val gruppi = Nodi.perPilastro(adam)
        assertEquals(listOf("Battito", "Voce"), gruppi[it.resonance.adam.dati.Pilastro.VIDYA]!!.map { it.etichetta })
        assertEquals(listOf("Da decidere"), gruppi[null]!!.map { it.etichetta })
        assertTrue(Nodi.testo(adam, conPilastri = true).startsWith("APK V2 {VIDYA} (2 sotto-nodi"))
    }

    @Test fun loStatoDelPadreSiCalcolaDaiFigli() {
        val f = Nodi.figli(nodi, 1)
        assertEquals("3 sotto-nodi: 1 consolidato, 1 praticato, 1 non iniziato", Nodi.sintesi(f))
        assertEquals(5f / 9f, Nodi.avanzamento(f), 1e-6f)
        assertEquals("Scaletta (3 sotto-nodi: 1 consolidato, 1 praticato, 1 non iniziato) → Gianna [consolidato], Berta filava [praticato], " +
            "Mio fratello è figlio unico [non iniziato]; Concerto [non iniziato]; Orfano [introdotto]", Nodi.testo(nodi))
    }
}
