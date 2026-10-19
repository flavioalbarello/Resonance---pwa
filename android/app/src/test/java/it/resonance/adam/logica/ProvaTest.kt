package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoBlocco
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Nodo
import org.junit.Assert.assertEquals
import org.junit.Test

// La prova generale: la scaletta nell'ordine, la durata vera di ogni brano, il filo perso.
class ProvaTest {
    @Test fun laScalettaSegueLOrdineEIRaccoglitori() {
        val nodi = listOf(Nodo(id = 1, percorsoId = 1, etichetta = "Apertura", ordine = 0),
            Nodo(id = 2, percorsoId = 1, etichetta = "Set 1", ordine = 1),
            Nodo(id = 4, percorsoId = 1, etichetta = "Aida", ordine = 1, genitoreId = 2),
            Nodo(id = 3, percorsoId = 1, etichetta = "Gianna", ordine = 0, genitoreId = 2),
            Nodo(id = 5, percorsoId = 1, etichetta = "Bis", ordine = 2))
        assertEquals(listOf("Apertura", "Gianna", "Aida", "Bis"), Prova.scaletta(nodi).map { it.etichetta })
    }

    @Test fun ilResocontoMisuraIlSetVero() {
        val piano = listOf("Gianna", "Aida", "Berta").mapIndexed { i, n -> Pratica.Blocco(i.toLong(), n, 0, 100, false, null) }
        val e = { n: Long, es: EsitoPratica, ms: Long -> EsitoBlocco(sessioneId = 1, nodoId = n, velocita = 100, esito = es, istante = ms) }
        val r = Prova.resoconto(piano, listOf(e(0, EsitoPratica.PULITO, 245_000), e(1, EsitoPratica.ERRORI, 245_000 + 190_000)), 0, 500_000)
        assertEquals("Set: 8:20, 2 brani suonati, filo perso 1 volta, fermata a 1 dalla fine", r[0])
        assertEquals("Gianna: 4:05", r[1]); assertEquals("Aida: 3:10, perso il filo", r[2])
    }
}
