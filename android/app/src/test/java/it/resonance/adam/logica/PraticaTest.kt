package it.resonance.adam.logica

import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.StatoNodo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// La pratica guidata (V3, 14/10/2026): il Ghost studia il basso per il tributo, a volte con 10 minuti, a volte con due ore.
class PraticaTest {
    private val oggi = LocalDate.parse("2026-10-14")
    private fun n(id: Long, nome: String, v: Int? = null, fila: Int = 0, ultima: String? = null, genitore: Long? = null) =
        Nodo(id = id, percorsoId = 1, etichetta = nome, ordine = id.toInt(), genitoreId = genitore, velocita = v, puliteDiFila = fila, ultimaPratica = ultima)

    @Test fun leFasiSeguonoLaVelocitaPulita() {
        assertEquals(Pratica.Fase.DA_IMPARARE, Pratica.fase(n(1, "Gianna")))
        assertEquals(Pratica.Fase.LENTO, Pratica.fase(n(1, "Gianna", 75)))
        assertEquals(Pratica.Fase.A_TEMPO, Pratica.fase(n(1, "Gianna", 100, 1)))
        assertEquals(Pratica.Fase.PRONTO, Pratica.fase(n(1, "Gianna", 100, 2)))
        assertEquals(70, Pratica.obiettivo(n(1, "nuovo")))
        assertEquals(85, Pratica.obiettivo(n(1, "a 80", 80)))
        assertEquals(100, Pratica.obiettivo(n(1, "a 98", 98)))
        // Senza velocità vale lo stato del nodo: un consolidato è pronto, non da imparare.
        assertEquals(Pratica.Fase.PRONTO, Pratica.fase(n(1, "Atto I").copy(stato = StatoNodo.CONSOLIDATO)))
        assertEquals(85, Pratica.obiettivo(n(1, "Atto II").copy(stato = StatoNodo.PRATICATO)))
    }

    @Test fun colTempoCheCeIlPianoCambia() {
        val pezzi = listOf(n(1, "Gianna — ponte", 75, ultima = "2026-10-10"), n(2, "Ma il cielo è sempre più blu", 90, ultima = "2026-10-13"),
            n(3, "Berta filava"), n(4, "Aida", 100, 2, ultima = "2026-09-30"))
        // 10 minuti: un blocco, il più urgente (il ponte di Gianna, lento e trascurato da 4 giorni).
        val dieci = Pratica.piano(pezzi, 10, oggi, null)
        assertEquals(listOf(1L), dieci.map { it.nodoId }); assertEquals(10, dieci.single().minuti); assertEquals(80, dieci.single().velocita)
        // 30 minuti: tre blocchi, l'ultimo il ripasso di un brano pronto trascurato da due settimane.
        val trenta = Pratica.piano(pezzi, 30, oggi, null)
        assertEquals(30, trenta.sumOf { it.minuti })
        assertTrue(trenta.last().ripasso && trenta.last().nodoId == 4L)
        assertEquals(3, trenta.size)
        // Due ore: tutti i pezzi non pronti più il ripasso; il tempo va al lavoro.
        val dueOre = Pratica.piano(pezzi, 120, oggi, null)
        assertEquals(setOf(1L, 2L, 3L, 4L), dueOre.map { it.nodoId }.toSet()); assertEquals(120, dueOre.sumOf { it.minuti })
        // Meno di 5 minuti, o niente da studiare: nessun piano.
        assertTrue(Pratica.piano(pezzi, 4, oggi, null).isEmpty())
        assertTrue(Pratica.piano(listOf(n(4, "Aida", 100, 2, ultima = "2026-10-13")), 20, oggi, null).isEmpty())
    }

    @Test fun laScadenzaVicinaAlzaLaFretta() {
        val a = n(1, "lento", 75, ultima = "2026-10-13")
        assertTrue(Pratica.urgenza(a, oggi, LocalDate.parse("2026-10-17")) > Pratica.urgenza(a, oggi, LocalDate.parse("2027-05-01")))
    }

    @Test fun dopoUnBloccoIlPezzoAvanza() {
        val base = n(1, "Gianna — ponte", 80)
        val pulito = Pratica.dopo(base, EsitoPratica.PULITO, 85, oggi)
        assertEquals(85, pulito.velocita); assertEquals("2026-10-14", pulito.ultimaPratica); assertEquals(StatoNodo.PRATICATO, pulito.stato)
        // Errori: il record resta, la fila si azzera, la prossima volta si riprova la stessa velocità.
        val errori = Pratica.dopo(n(1, "x", 100, 1), EsitoPratica.ERRORI, 100, oggi)
        assertEquals(100, errori.velocita); assertEquals(0, errori.puliteDiFila)
        // Due pulite di fila al 100%: pronto.
        val pronto = Pratica.dopo(Pratica.dopo(n(1, "x", 95), EsitoPratica.PULITO, 100, oggi), EsitoPratica.PULITO, 100, oggi)
        assertEquals(Pratica.Fase.PRONTO, Pratica.fase(pronto)); assertEquals(StatoNodo.CONSOLIDATO, pronto.stato)
        // Saltato: niente cambia, nemmeno il giorno.
        assertEquals(base, Pratica.dopo(base, EsitoPratica.SALTATO, 85, oggi).copy(stato = base.stato))
    }

    @Test fun siStudianoLeFoglieELaRigaDiceAChePuntoSiamo() {
        val nodi = listOf(n(1, "Scaletta"), n(2, "Gianna", genitore = 1), n(3, "Aida", 100, 2, genitore = 1))
        assertEquals(listOf(2L, 3L), Pratica.pezzi(nodi).map { it.id })
        assertEquals("1 pronti su 2 · mancano 30 giorni", Pratica.riga(Pratica.pezzi(nodi), oggi, oggi.plusDays(30)))
    }

    @Test fun ilPianoSiTieneComEraELaSessioneDiceAChePuntoSiamo() {
        val piano = Pratica.piano(listOf(n(1, "Gianna", 75, ultima = "2026-10-10"), n(2, "Aida", 100, 2, ultima = "2026-09-30"),
            n(3, "Berta")), 30, oggi, null)
        val testo = Pratica.codifica(piano)
        assertEquals(piano, Pratica.decodifica(testo))
        assertTrue(Pratica.decodifica("non è json").isEmpty())
        val e = { nodo: Long, es: EsitoPratica, v: Int -> it.resonance.adam.dati.EsitoBlocco(sessioneId = 1, nodoId = nodo, velocita = v, esito = es, istante = 0) }
        assertEquals(piano[1], Pratica.corrente(piano, listOf(e(1, EsitoPratica.PULITO, 80))))
        assertEquals(null, Pratica.corrente(piano, piano.map { e(it.nodoId, EsitoPratica.SALTATO, 0) }))
        assertEquals(listOf("Gianna: pulito a 80% (era 75%)", "Berta: errori a 70%", "Aida: saltato"),
            Pratica.resoconto(piano, listOf(e(1, EsitoPratica.PULITO, 80), e(3, EsitoPratica.ERRORI, 70), e(2, EsitoPratica.SALTATO, 100))))
        assertEquals(25, Pratica.minutiFatti(0, 25 * 60_000L + 30_000))
    }

    @Test fun laScadenzaSiScriveComeViene() {
        assertEquals(LocalDate.parse("2026-12-20"), Pratica.leggiData("20/12/2026", oggi))
        assertEquals(LocalDate.parse("2026-12-20"), Pratica.leggiData("2026-12-20", oggi))
        assertEquals(LocalDate.parse("2026-12-20"), Pratica.leggiData("20.12.26", oggi))
        assertEquals(LocalDate.parse("2026-12-20"), Pratica.leggiData("20/12", oggi))
        assertEquals(LocalDate.parse("2027-03-01"), Pratica.leggiData("1/3", oggi))
        assertEquals(null, Pratica.leggiData("31/02/2027", oggi))
        assertEquals(null, Pratica.leggiData("a natale", oggi))
    }
}
