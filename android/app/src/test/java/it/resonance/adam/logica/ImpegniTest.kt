package it.resonance.adam.logica

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

class ImpegniTest {
    private val oggi = LocalDate.of(2026, 9, 23)
    private val martedi = LocalDate.of(2026, 9, 29)
    private fun args(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject
    private fun rifiuto(v: Validazione) = (v as Validazione.Rifiutata).motivo
    private fun domanda(r: Risoluzione) = (r as Risoluzione.Domanda).motivo
    private fun pronta(r: Risoluzione) = (r as Risoluzione.Pronta).proposta

    private val fisio = Evento("Fisioterapia", martedi.atTime(18, 0), martedi.atTime(19, 0), false, calendario = "Personale",
        id = 7, idSerie = 7, regola = "FREQ=WEEKLY;BYDAY=TU", inizioMs = 1000, fineMs = 2000, origineMs = 1000)
    private val dentista = Evento("Dentista", martedi.atTime(10, 30), martedi.atTime(11, 15), false, calendario = "Personale", id = 9, inizioMs = 500)

    // ── Ripetizioni ──

    @Test fun laRegolaSiLeggeInItaliano() {
        assertEquals("ogni martedì, senza data di fine", Ripetizione.leggibile("FREQ=WEEKLY;BYDAY=TU"))
        assertEquals("ogni lunedì e mercoledì", Ripetizione.leggibile("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z"))
        assertEquals("ogni 2 settimane, martedì, senza data di fine", Ripetizione.leggibile("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"))
        assertEquals("ogni giorno", Ripetizione.leggibile("FREQ=DAILY;COUNT=5"))
        assertEquals("", Ripetizione.leggibile(""))
    }

    @Test fun daQuestoInPoiChiudeLaSerieUnSecondoPrima() {
        val roma = ZoneId.of("Europe/Rome")
        assertEquals("FREQ=WEEKLY;BYDAY=TU;UNTIL=20260929T155959Z",
            Ripetizione.finoA("FREQ=WEEKLY;BYDAY=TU;COUNT=10", martedi.atTime(18, 0), false, roma))
        assertEquals("FREQ=WEEKLY;BYDAY=TU;UNTIL=20260928",
            Ripetizione.finoA("FREQ=WEEKLY;UNTIL=20270101T000000Z;BYDAY=TU", martedi.atStartOfDay(), true, roma))
    }

    // ── Quale impegno, e quanto ──

    @Test fun unaSerieSenzaDireQuantoToglierneSiChiede() {
        val d = domanda(Risolutore.risolvi(Proposta.TogliEvento("fisioterapia", martedi.toString()), listOf(fisio, dentista), oggi))
        assertTrue(d, d.contains("si ripete (ogni martedì"))
        assertTrue(d, d.contains("solo quello di") && d.contains("da quello in poi") && d.contains("tutta la serie"))
    }

    @Test fun tuttaLaSerieDettaDalGhostDiventaProposta() {
        val p = pronta(Risolutore.risolvi(Proposta.TogliEvento("Fisioterapia", martedi.toString(), portata = Portata.SERIE), listOf(fisio, dentista), oggi)) as Proposta.TogliEvento
        assertEquals(7L, p.bersaglio!!.idSerie)
        assertEquals(Portata.SERIE, p.portata)
        val testo = p.copy(bersaglio = p.bersaglio!!.copy(futuri = 52)).descrizione()
        assertTrue(testo, testo.startsWith("Togliere TUTTA la serie «Fisioterapia» (ogni martedì, senza data di fine, 18:00), compresi gli appuntamenti passati — 52 nei prossimi 12 mesi"))
    }

    @Test fun soloQuestoLasciaLaSerieEdEDetto() {
        val p = pronta(Risolutore.risolvi(Proposta.TogliEvento("Fisioterapia", martedi.toString(), portata = Portata.UNO), listOf(fisio), oggi))
        assertTrue(p.descrizione(), p.descrizione().contains("solo questo: la serie (ogni martedì, senza data di fine) resta"))
    }

    @Test fun unImpegnoSingoloNonHaSerie() {
        val p = pronta(Risolutore.risolvi(Proposta.TogliEvento("dentista", martedi.toString(), portata = Portata.SERIE), listOf(fisio, dentista), oggi)) as Proposta.TogliEvento
        assertEquals(Portata.UNO, p.portata)
        assertEquals(9L, p.bersaglio!!.idEvento)
    }

    @Test fun dueOmonimiNonSiIndovinaMaLOraLiDistingue() {
        val secondo = dentista.copy(id = 10, inizio = martedi.atTime(15, 0), fine = martedi.atTime(15, 45))
        val d = domanda(Risolutore.risolvi(Proposta.TogliEvento("Dentista", martedi.toString()), listOf(dentista, secondo), oggi))
        assertTrue(d, d.contains("corrisponde a 2 impegni") && d.contains("10:30") && d.contains("15:00"))
        val p = pronta(Risolutore.risolvi(Proposta.TogliEvento("Dentista", martedi.toString(), ora = "15:00"), listOf(dentista, secondo), oggi)) as Proposta.TogliEvento
        assertEquals(10L, p.bersaglio!!.idEvento)
    }

    @Test fun seNonCeDiceCosaCeQuelGiorno() {
        val d = domanda(Risolutore.risolvi(Proposta.TogliEvento("Palestra", martedi.toString()), listOf(dentista), oggi))
        assertTrue(d, d.contains("nessun impegno «Palestra»") && d.contains("10:30–11:15 Dentista"))
    }

    @Test fun inviatiAltriEdElencoInSolaLetturaNonSiToccano() {
        assertTrue(domanda(Risolutore.risolvi(Proposta.TogliEvento("Dentista", martedi.toString()), listOf(dentista.copy(invitati = 2)), oggi)).contains("2 invitati"))
        assertTrue(domanda(Risolutore.risolvi(Proposta.TogliEvento("Dentista", martedi.toString()), listOf(dentista.copy(organizzatoDaAltri = true)), oggi)).contains("organizzato un altro"))
        assertTrue(domanda(Risolutore.risolvi(Proposta.TogliEvento("Dentista", martedi.toString()), listOf(dentista.copy(scrivibile = false)), oggi)).contains("sola lettura"))
    }

    // ── Spostare ──

    @Test fun spostareSoloLOraTieneGiornoEDurata() {
        val p = pronta(Risolutore.risolvi(Proposta.SpostaEvento("Dentista", martedi.toString(), nuovoInizio = "16:00"), listOf(dentista), oggi)) as Proposta.SpostaEvento
        assertEquals(martedi.atTime(16, 0) to martedi.atTime(16, 45), Impegni.nuovoIntervallo(p, p.bersaglio!!))
    }

    @Test fun spostareUnaSerieToccaSoloQuellaVolta() {
        val p = pronta(Risolutore.risolvi(Proposta.SpostaEvento("Fisioterapia", martedi.toString(), nuovoInizio = "2026-09-30T18:00"), listOf(fisio), oggi))
        assertTrue(p.descrizione(), p.descrizione().contains("solo questo, la serie resta"))
    }

    @Test fun unOrarioSenzaOraONelPassatoSiChiede() {
        assertTrue(domanda(Risolutore.risolvi(Proposta.SpostaEvento("Dentista", martedi.toString(), nuovoInizio = "2026-09-30"), listOf(dentista), oggi)).contains("indica anche l'ora"))
        val passato = Risolutore.risolvi(Proposta.SpostaEvento("Dentista", martedi.toString(), nuovoInizio = "2026-09-20T10:00"), listOf(dentista), oggi)
        assertTrue(domanda(passato).contains("è passato"))
    }

    // ── Ciò che il modello può chiedere ──

    @Test fun validazioneDiSpostaETogli() {
        assertTrue(rifiuto(Azioni.valida("sposta_evento", args("""{"titolo":"Dentista","giorno":"2026-09-29"}"""), oggi)).contains("niente da cambiare"))
        assertTrue(rifiuto(Azioni.valida("togli_evento", args("""{"titolo":"Dentista","giorno":"2026-09-20"}"""), oggi)).contains("passato"))
        assertTrue(rifiuto(Azioni.valida("togli_evento", args("""{"titolo":"X","giorno":"2026-09-29","quali":"tutti"}"""), oggi)).contains("tutta_la_serie"))
        val p = (Azioni.valida("togli_evento", args("""{"titolo":"Fisioterapia","giorno":"domani","quali":"da_questo_in_poi"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals(Proposta.TogliEvento("Fisioterapia", "2026-09-24", null, Portata.DA_QUI), p)
    }

    @Test fun laPropostaConIlBersaglioSiRilegge() {
        val p = pronta(Risolutore.risolvi(Proposta.TogliEvento("Fisioterapia", martedi.toString(), portata = Portata.DA_QUI), listOf(fisio), oggi))
        assertEquals(p, Azioni.decodifica(Azioni.codifica(p)))
        assertTrue(Azioni.codifica(p).contains("\"portata\":\"da_questo_in_poi\""))
        assertEquals(LocalDateTime.of(2026, 9, 29, 18, 0), (p as Proposta.TogliEvento).bersaglio!!.daIni)
    }
}
