package it.resonance.adam.logica

import it.resonance.adam.dati.Direzione
import it.resonance.adam.dati.EsitoEsperimento
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.StatoEsperimento
import it.resonance.adam.dati.TipoMisura
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class EsperimentiTest {
    private val oggi = LocalDate.of(2026, 9, 24)
    private fun m(t: TipoMisura, v: Double, fa: Long, legata: Boolean? = null) =
        Misura(tipo = t, valore = v, giorno = oggi.minusDays(fa).toString(), istante = fa, fonte = "t", legataAlTempo = legata)
    private fun args(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject
    private fun esp(tipo: TipoMisura = TipoMisura.SONNO, stato: StatoEsperimento = StatoEsperimento.APERTO) = Esperimento(
        titolo = "A letto entro le 23", tipo = tipo, direzione = Direzione.SU, soglia = 15.0, giorni = 14,
        inizio = oggi.minusDays(4).toString(), fine = oggi.plusDays(10).toString(), base = 400.0, origine = "shell", creato = 0, stato = stato)

    // ── Misura e confronto ──

    @Test fun unLivelloVuoleAlmenoTreGiorniDiDati() {
        assertNull(Esperimenti.misura(listOf(m(TipoMisura.SONNO, 400.0, 1), m(TipoMisura.SONNO, 420.0, 2)), TipoMisura.SONNO, oggi.minusDays(7), oggi))
        assertEquals(410.0, Esperimenti.misura((1L..4L).map { m(TipoMisura.SONNO, if (it % 2 == 0L) 400.0 else 420.0, it) }, TipoMisura.SONNO, oggi.minusDays(7), oggi)!!, 0.001)
    }

    @Test fun unaQuantitaSenzaDatiValeZero() {
        assertEquals(0.0, Esperimenti.misura(emptyList(), TipoMisura.PRATICA, oggi.minusDays(14), oggi)!!, 0.0)
        assertEquals(70.0, Esperimenti.misura(listOf(m(TipoMisura.PRATICA, 40.0, 3), m(TipoMisura.PRATICA, 30.0, 10), m(TipoMisura.PRATICA, 99.0, 20)), TipoMisura.PRATICA, oggi.minusDays(14), oggi)!!, 0.0)
    }

    @Test fun leEntrateContanoSoloSeNonVendonoTempo() {
        val e = listOf(m(TipoMisura.ENTRATA, 600.0, 2, legata = true), m(TipoMisura.ENTRATA, 38.0, 3, legata = false))
        assertEquals(38.0, Esperimenti.misura(e, TipoMisura.ENTRATA, oggi.minusDays(14), oggi)!!, 0.0)
    }

    @Test fun ilConfrontoGuardaIlVersoELaSoglia() {
        assertEquals(EsitoEsperimento.MOSSO, Esperimenti.esito(400.0, 420.0, Direzione.SU, 15.0))
        assertEquals(EsitoEsperimento.FERMO, Esperimenti.esito(400.0, 410.0, Direzione.SU, 15.0))
        assertEquals(EsitoEsperimento.CONTRARIO, Esperimenti.esito(400.0, 380.0, Direzione.SU, 15.0))
        assertEquals(EsitoEsperimento.MOSSO, Esperimenti.esito(84.0, 83.2, Direzione.GIU, 0.5))
        assertEquals(EsitoEsperimento.SENZA_DATI, Esperimenti.esito(84.0, null, Direzione.GIU, 0.5))
    }

    @Test fun laRigaDiceAChePuntoSiamo() {
        val misure = (0L..3L).map { m(TipoMisura.SONNO, 430.0, it) }
        assertEquals("«A letto entro le 23»: Sonno ↑ di almeno 15 min, giorno 5 di 14, partenza 6h40, finora 7h10", Esperimenti.riga(esp(), misure, oggi))
        val chiuso = esp().copy(stato = StatoEsperimento.CHIUSO, finale = 430.0, esito = EsitoEsperimento.MOSSO)
        assertTrue(Esperimenti.traccia(chiuso), Esperimenti.traccia(chiuso).contains("6h40 → 7h10: si è mosso") && Esperimenti.traccia(chiuso).contains("non sul Ghost"))
    }

    @Test fun scadutoIlGiornoDellaFine() {
        val e = esp().copy(fine = oggi.toString())
        assertEquals(listOf(e), Esperimenti.scaduti(listOf(e, esp()), oggi))
    }

    // ── Il ristagno lo vede il programma ──

    private fun ist(misure: List<Misura>, rituali: List<Rituale> = emptyList()) =
        Istantanea(oggi, null, misure, rituali, emptyList(), emptyList(), emptyList(), emptyList(), emptyList())

    @Test fun praticaFermaDopoAverSuonatoEUnRistagno() {
        val misure = listOf(m(TipoMisura.PRATICA, 40.0, 20), m(TipoMisura.PRATICA, 30.0, 30))
        val motivi = Ristagno.trova(ist(misure), emptyList())
        assertEquals(listOf("Pratica: zero negli ultimi 14 giorni (nei 46 prima: 1h10)"), motivi)
        assertTrue("sul numero che un esperimento guarda già non si perturba",
            Ristagno.trova(ist(misure), listOf(esp(TipoMisura.PRATICA))).isEmpty())
        assertTrue("chi non ha mai suonato non ha un ristagno, ha un dato mancante", Ristagno.trova(ist(emptyList()), emptyList()).isEmpty())
    }

    @Test fun unRitualeCheSaltaDaSettimaneEUnRistagno() {
        val creato = oggi.minusDays(30).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val r = Rituale(id = 1, nome = "Scala al flauto", pilastro = Pilastro.VIDYA, creato = creato)
        assertEquals(listOf("Rituale «Scala al flauto»: tenuto 0 volte su 14"), Ristagno.trova(ist(emptyList(), listOf(r)), emptyList()))
        val nuovo = r.copy(creato = oggi.minusDays(5).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli())
        assertTrue("un rituale appena nato non ristagna", Ristagno.trova(ist(emptyList(), listOf(nuovo)), emptyList()).isEmpty())
    }

    @Test fun unaPerturbazioneOgniDueSettimane() {
        assertTrue(Perturbazione.dovuta("", oggi))
        assertFalse(Perturbazione.dovuta(oggi.minusDays(5).toString(), oggi))
        assertTrue(Perturbazione.dovuta(oggi.minusDays(14).toString(), oggi))
    }

    // ── Cosa il modello può proporre ──

    @Test fun laPropostaHaDurataESogliaPredefinite() {
        val p = (Azioni.valida("proponi_esperimento", args("""{"titolo":"A letto entro le 23","misura":"SONNO","direzione":"su"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals(Proposta.ApriEsperimento("A letto entro le 23", TipoMisura.SONNO, Direzione.SU, 14, 15.0), p)
        assertTrue(p.descrizione(), p.descrizione().contains("Sonno ↑ di almeno 15 min") && p.descrizione().contains("congelata alla conferma"))
    }

    @Test fun limitiDelleProposte() {
        fun rifiuto(json: String, r: Regole = Regole()) = (Azioni.valida("proponi_esperimento", args(json), oggi, r) as Validazione.Rifiutata).motivo
        assertTrue(rifiuto("""{"titolo":"x","misura":"SONNO","direzione":"su","giorni":3}""").contains("più corto non si distingue dal caso"))
        assertTrue(rifiuto("""{"titolo":"x","misura":"SONNO","direzione":"avanti"}""").contains("su o giu"))
        val tre = listOf(esp(TipoMisura.PASSI), esp(TipoMisura.PESO), esp(TipoMisura.PRATICA))
        assertTrue(rifiuto("""{"titolo":"x","misura":"SONNO","direzione":"su"}""", Regole(esperimentiAperti = tre)).contains("già 3 esperimenti aperti"))
        assertTrue(rifiuto("""{"titolo":"x","misura":"SONNO","direzione":"su"}""", Regole(esperimentiAperti = listOf(esp()))).contains("non si distinguono"))
    }

    @Test fun ilContestoPortaLAnelloELaRegola() {
        val s = Contesto.sistema(ist((0L..3L).map { m(TipoMisura.SONNO, 430.0, it) }).copy(esperimenti = listOf(esp())))
        assertTrue(s, s.contains("ESPERIMENTI (bersaglio dichiarato prima") && s.contains("- aperto: «A letto entro le 23»"))
        assertTrue(s.contains("mai sul Ghost") && s.contains("mai «grazie a»"))
    }
}
