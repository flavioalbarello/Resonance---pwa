package it.resonance.adam.logica

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime

class AgendaEPostaTest {
    private val oggi = LocalDate.of(2026, 9, 23)
    private fun args(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject
    private fun rifiuto(v: Validazione) = (v as Validazione.Rifiutata).motivo
    private fun proposta(v: Validazione) = (v as Validazione.Scrittura).proposta
    private fun ev(titolo: String, da: String, a: String, tutto: Boolean = false) =
        Evento(titolo, LocalDateTime.parse(da), LocalDateTime.parse(a), tutto)

    // ── Calendario ──

    @Test fun eventoConOrarioEDurata() {
        val p = proposta(Azioni.valida("crea_evento", args("""{"titolo":"Dentista","inizio":"2026-09-25 10:30","durata_minuti":45,"luogo":"Via Roma"}"""), oggi))
        assertEquals(Proposta.CreaEvento("Dentista", "2026-09-25T10:30", 45, "Via Roma", ""), p)
        assertEquals(LocalDateTime.parse("2026-09-25T11:15"), Agenda.inizioFine(p as Proposta.CreaEvento).second)
    }

    @Test fun eventoDiTuttoIlGiornoFinisceIlGiornoDopo() {
        val p = proposta(Azioni.valida("crea_evento", args("""{"titolo":"Ferie","inizio":"2026-10-01"}"""), oggi)) as Proposta.CreaEvento
        assertEquals("2026-10-01", p.inizio)
        assertEquals(LocalDateTime.parse("2026-10-02T00:00") , Agenda.inizioFine(p).second)
    }

    @Test fun ilCalendarioNonRiscriveIlPassato() {
        assertTrue(rifiuto(Azioni.valida("crea_evento", args("""{"titolo":"X","inizio":"2026-09-22T10:00"}"""), oggi)).contains("passato"))
        assertTrue(rifiuto(Azioni.valida("crea_evento", args("""{"titolo":"X","inizio":"2029-01-01T10:00"}"""), oggi)).contains("anno"))
        assertTrue(rifiuto(Azioni.valida("crea_evento", args("""{"titolo":"X","inizio":"giovedì alle 10"}"""), oggi)).contains("yyyy-MM-dd"))
        assertTrue(rifiuto(Azioni.valida("crea_evento", args("""{"titolo":"X","inizio":"2026-09-24T10:00","durata_minuti":2000}"""), oggi)).contains("durata"))
    }

    @Test fun oggiSiPuoMettereInCalendario() {
        assertTrue(Azioni.valida("crea_evento", args("""{"titolo":"Telefonata","inizio":"2026-09-23T18:00"}"""), oggi) is Validazione.Scrittura)
    }

    @Test fun laLetturaDelCalendarioNonEUnaProposta() {
        assertTrue(Azioni.valida("leggi_calendario", args("{}"), oggi) is Validazione.Lettura)
    }

    @Test fun ilGiornoDiUnEventoDiPiuGiorni() {
        val ferie = ev("Ferie", "2026-09-23T00:00", "2026-09-26T00:00", tutto = true)
        val cena = ev("Cena", "2026-09-24T20:00", "2026-09-24T22:00")
        assertEquals(listOf(ferie, cena), Agenda.delGiorno(listOf(cena, ferie), oggi.plusDays(1)))
        assertEquals(listOf(ferie), Agenda.delGiorno(listOf(cena, ferie), oggi.plusDays(2)))
        assertTrue(Agenda.delGiorno(listOf(cena, ferie), oggi.plusDays(3)).isEmpty())
    }

    @Test fun ilTestoDellAgendaDistingueVuotaDaNonLeggibile() {
        assertEquals("Nessun impegno in calendario dal 2026-09-23 al 2026-09-24.", Agenda.testo(AgendaLetta.Letta(oggi, 2, emptyList()), oggi))
        assertTrue(Agenda.testo(AgendaLetta.Negata("manca il permesso"), oggi).contains("non leggibile: manca il permesso"))
        val t = Agenda.testo(AgendaLetta.Letta(oggi, 2, listOf(ev("Dentista", "2026-09-24T10:30", "2026-09-24T11:15"))), oggi)
        assertTrue(t, t.contains("- domani 10:30–11:15 Dentista"))
    }

    @Test fun inizioIlleggibile() {
        assertNull(Agenda.interpretaInizio("domani"))
        assertEquals(LocalDateTime.parse("2026-09-25T09:00") to false, Agenda.interpretaInizio("2026-09-25T09:00:00"))
    }

    // ── Posta ──

    private val regole = Regole(nomiProtetti = listOf("PhysioAlba"), indirizziNoti = setOf("marta@esempio.it"))

    @Test fun mailAUnIndirizzoCheIlGhostHaScritto() {
        val p = proposta(Azioni.valida("scrivi_mail", args("""{"a":"Marta@esempio.it","oggetto":"Cena","corpo":"Stasera alle 20?"}"""), oggi, regole))
        assertEquals(Proposta.ScriviMail("Marta@esempio.it", "Cena", "Stasera alle 20?"), p)
        assertTrue(p.descrizione().contains("parte solo se premi Invia"))
    }

    @Test fun unIndirizzoInventatoNonPassa() {
        val v = Azioni.valida("scrivi_mail", args("""{"a":"rossi@studio.it","oggetto":"X","corpo":"Y"}"""), oggi, regole)
        assertTrue(rifiuto(v).contains("non indovinarlo"))
        assertTrue(rifiuto(Azioni.valida("scrivi_mail", args("""{"a":"Marta","oggetto":"X","corpo":"Y"}"""), oggi, regole)).contains("non è un indirizzo"))
    }

    @Test fun senzaIndirizzoLoScriveIlGhost() {
        val p = proposta(Azioni.valida("scrivi_mail", args("""{"oggetto":"Preventivo","corpo":"Buongiorno"}"""), oggi, regole))
        assertTrue(p.descrizione().contains("destinatario lo scrivi tu"))
    }

    @Test fun ilNomeProtettoNonEsceSeLoMetteIlModello() {
        val v = Azioni.valida("scrivi_mail", args("""{"oggetto":"Corso","corpo":"Un saluto da physioalba."}"""), oggi, regole)
        assertTrue(rifiuto(v).contains("«PhysioAlba»"))
    }

    @Test fun ilNomeProtettoEsceSeLoHaScrittoIlGhostInQuestoMessaggio() {
        val r = regole.copy(detteDalGhost = "scrivi a marta@esempio.it che la fattura la fa PhysioAlba")
        assertTrue(Azioni.valida("scrivi_mail", args("""{"a":"marta@esempio.it","oggetto":"Fattura","corpo":"La fa PhysioAlba."}"""), oggi, r) is Validazione.Scrittura)
    }

    @Test fun laProfessioneNonENomeEUnaParolaPiuLungaNonColpisce() {
        assertTrue(Uscita.violazioni("Sono fisioterapista.", listOf("PhysioAlba"), "").isEmpty())
        assertTrue(Uscita.violazioni("PhysioAlbanese", listOf("PhysioAlba"), "").isEmpty())
        assertEquals(listOf("PhysioAlba"), Uscita.violazioni("(PhysioAlba)", listOf("PhysioAlba"), ""))
    }

    @Test fun gliIndirizziSiEstraggonoDalTestoDelGhost() {
        assertEquals(setOf("marta@esempio.it", "a.b@c.org"), Uscita.indirizzi("scrivi a Marta@esempio.it e ad a.b@c.org."))
    }

    @Test fun laPropostaSiSerializzaESiRilegge() {
        val p = Proposta.CreaEvento("Dentista", "2026-09-25T10:30", 45)
        assertEquals(p, Azioni.decodifica(Azioni.codifica(p)))
        val m = Proposta.ScriviMail("", "O", "C")
        assertEquals(m, Azioni.decodifica(Azioni.codifica(m)))
        assertFalse(Azioni.codifica(m).isBlank())
    }
}
