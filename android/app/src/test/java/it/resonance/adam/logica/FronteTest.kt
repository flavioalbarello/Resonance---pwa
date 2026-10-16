package it.resonance.adam.logica

import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Il fronte motorizzato (V3 fase 3): quando tocca allo Shell, cosa deve fare, e i link che può proporre.
class FronteTest {
    private val oggi = LocalDate.parse("2026-10-16")
    private val p = Percorso(id = 1, pilastro = Pilastro.VIDYA, titolo = "Tributo", creato = 1)

    @Test fun ilMotoreGiraAlSuoRitmo() {
        assertFalse(Fronte.dovuto(p, oggi))
        assertTrue(Fronte.dovuto(p.copy(ritmoGiorni = 3), oggi))
        assertFalse(Fronte.dovuto(p.copy(ritmoGiorni = 3, ultimoLavoro = "2026-10-14"), oggi))
        assertTrue(Fronte.dovuto(p.copy(ritmoGiorni = 3, ultimoLavoro = "2026-10-13"), oggi))
        assertFalse(Fronte.dovuto(p.copy(ritmoGiorni = 3, archiviato = true), oggi))
    }

    @Test fun laFormaDettaPrima() {
        val nodi = listOf(Nodo(id = 1, percorsoId = 1, etichetta = "Gianna", ordine = 0),
            Nodo(id = 2, percorsoId = 1, etichetta = "Aida", ordine = 1, fonte = "https://youtu.be/x"),
            Nodo(id = 3, percorsoId = 1, etichetta = "Berta", ordine = 2, velocita = 100, puliteDiFila = 2))
        val f = Fronte.forma(p, nodi)
        assertEquals(listOf("Gianna"), f.senzaFonte)
        assertTrue(f.senzaPasso); assertFalse(f.senzaPezzi)
        assertTrue(f.detta().contains("«Gianna»") && f.detta().contains("regola_fronte"))
        assertTrue(Fronte.forma(p.copy(prossimoPasso = "x"), nodi.drop(1)).vuota)
        assertTrue(Fronte.forma(p, emptyList()).detta().contains("aggiungi_nodi"))
    }

    @Test fun soloILinkVistiSiPropongono() {
        val noti = Fronte.linkIn("Fonti: https://www.youtube.com/watch?v=abc. e http://moises.ai/x/")
        assertTrue(Fronte.noto("https://youtube.com/watch?v=abc", noti))
        assertTrue(Fronte.noto("https://moises.ai/x", noti))
        assertFalse(Fronte.noto("https://youtube.com/watch?v=zzz", noti))
        val a = { j: String -> Json.parseToJsonElement(j).jsonObject }
        val r = Regole(linkNoti = noti)
        assertTrue(Azioni.valida("fonte_nodo", a("""{"percorso":"Tributo","nodo":"Gianna","fonte":"https://youtube.com/watch?v=zzz"}"""), oggi, r) is Validazione.Rifiutata)
        assertTrue(Azioni.valida("fonte_nodo", a("""{"percorso":"Tributo","nodo":"Gianna","fonte":"https://youtube.com/watch?v=abc"}"""), oggi, r) is Validazione.Scrittura)
        // Un testo non è un link: passa.
        assertTrue(Azioni.valida("fonte_nodo", a("""{"percorso":"Tributo","nodo":"Gianna","fonte":"quaderno rosso, pag. 12"}"""), oggi, r) is Validazione.Scrittura)
    }

    @Test fun regolaFronteControllaDateERitmo() {
        val a = { j: String -> Json.parseToJsonElement(j).jsonObject }
        assertTrue(Azioni.valida("regola_fronte", a("""{"percorso":"Tributo"}"""), oggi) is Validazione.Rifiutata)
        assertTrue(Azioni.valida("regola_fronte", a("""{"percorso":"Tributo","scadenza":"2026-10-01"}"""), oggi) is Validazione.Rifiutata)
        assertTrue(Azioni.valida("regola_fronte", a("""{"percorso":"Tributo","ritmo_giorni":90}"""), oggi) is Validazione.Rifiutata)
        val ok = Azioni.valida("regola_fronte", a("""{"percorso":"Tributo","scadenza":"20/12/2026","ritmo_giorni":3}"""), oggi) as Validazione.Scrittura
        assertEquals(Proposta.RegolaFronte("Tributo", "2026-12-20", 3, null), ok.proposta)
        assertTrue(ok.proposta.descrizione().contains("ogni 3 giorni"))
    }
}
