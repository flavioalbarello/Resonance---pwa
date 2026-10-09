package it.resonance.adam.dati

import androidx.room.Room
import it.resonance.adam.logica.ImportPwa
import it.resonance.adam.logica.Proposta
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ArchivioTest {
    private lateinit var db: Db
    private lateinit var a: Archivio
    private val oggi = LocalDate.of(2026, 9, 23)

    private val backup = """
    {"_formato":"resonance-backup","syncState":{
      "bio":[{"id":"b1","date":"2026-09-20","weight":"82,4","sleep":"7","notes":"ok"}],
      "pVidya":[{"id":"p1","title":"Divenire","topics":[{"id":"t1","label":"Atto I","status":"consolidato"}],
                 "documents":[{"id":"d1","title":"ATTO I: Origine","text":"Il seme.","nodoId":"t1"}]}],
      "memory":{"bio":{"corrente":"Dorme poco","sedimento":[]}},
      "ghostProfile":{"name":"Flavio","hardConstraints":[]}}}
    """.trimIndent()

    @Before fun apri() {
        db = Room.inMemoryDatabaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java).allowMainThreadQueries().build()
        a = Archivio(db)
    }

    @After fun chiudi() = db.close()

    @Test fun importDallaPwaEIdempotenteEMantieneINodi() = runBlocking {
        val primo = a.importa(ImportPwa.leggi(backup))
        assertEquals(2, primo.misure)
        assertEquals(1, primo.percorsi)
        assertEquals(1, primo.documenti)
        assertTrue(primo.profilo)
        val doc = db.percorsi().elencoDocumenti().single()
        assertEquals(db.percorsi().elencoNodi().single().id, doc.nodoId)

        val secondo = a.importa(ImportPwa.leggi(backup))
        assertEquals(0, secondo.misure)
        assertEquals(0, secondo.percorsi)
        assertEquals(2, db.misure().elenco().size)
    }

    @Test fun ilQuadernoGiaScrittoNonVieneSovrascrittoDallImport() = runBlocking {
        a.aggiornaQuaderno(Pilastro.BIO, "scritto a mano")
        a.importa(ImportPwa.leggi(backup))
        assertEquals("scritto a mano", db.quaderni().elenco().single { it.pilastro == Pilastro.BIO }.testo)
    }

    @Test fun modificaDocumentoLasciaLaVersionePrecedente() = runBlocking {
        a.importa(ImportPwa.leggi(backup))
        val e = a.esegui(Proposta.ModificaDocumento("atto i", "Il seme.", "Prologo.", "prima"), oggi)
        assertTrue(e.ricevuta, e.riuscita)
        assertEquals("Prologo. Il seme.", db.percorsi().elencoDocumenti().single().testo)
        assertEquals("Il seme.", db.versioni().elenco().single().testo)
    }

    @Test fun nomeAmbiguoNonSiIndovina() = runBlocking {
        a.esegui(Proposta.CreaRituale("Scala maggiore", Pilastro.VIDYA), oggi)
        a.esegui(Proposta.CreaRituale("Scala minore", Pilastro.VIDYA), oggi)
        val e = a.esegui(Proposta.SpuntaRituale("scala", oggi.toString()), oggi)
        assertFalse(e.riuscita)
        assertTrue(e.ricevuta, e.ricevuta.contains("più rituale"))
        assertTrue(db.rituali().elencoSpunte().isEmpty())
    }

    @Test fun percorsoDoppioRifiutato() = runBlocking {
        a.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Divenire", "", listOf("a")), oggi)
        val e = a.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "divenire", "", listOf("b")), oggi)
        assertFalse(e.riuscita)
        assertEquals(1, db.percorsi().elenco().size)
    }

    @Test fun copiaERipristinoRiportanoTutto() = runBlocking {
        a.importa(ImportPwa.leggi(backup))
        a.esegui(Proposta.RegistraMisura(TipoMisura.ENTRATA, 40.0, oggi.toString(), legataAlTempo = false), oggi)
        val copia = a.copia()
        assertTrue(a.eUnaCopia(copia))
        a.esegui(Proposta.ScriviVoce(Pilastro.AIR, "dopo la copia", oggi.toString()), oggi)
        a.ripristina(copia)
        assertEquals(3, db.misure().elenco().size)
        assertTrue(db.voci().elenco().none { it.testo == "dopo la copia" })
        assertEquals("Il seme.", db.percorsi().elencoDocumenti().single().testo)
    }

    @Test fun reimportDaIANomiProtettiAUnProfiloGiaScritto() = runBlocking {
        db.profilo().salva(Profilo(nome = "Flavio", vincoli = "scritti a mano"))
        val conIdentita = backup.replace(""""hardConstraints":[]""",
            """"hardConstraints":[{"tipo":"identita-professionale","identita":"fisioterapista, PhysioAlba","testo":"x"}]""")
        a.importa(ImportPwa.leggi(conIdentita))
        val p = db.profilo().leggi()!!
        assertEquals("scritti a mano", p.vincoli)
        assertEquals("PhysioAlba", p.nomiProtetti)
    }

    @Test fun togliereUnaRigaDalQuadernoLasciaIlRestoELoStorico() = runBlocking {
        a.aggiornaQuaderno(Pilastro.BIO, "Dorme poco il giovedì.\n\nLavoro manuale sporco sostituisce sedentarietà notturna.\n\nCamminata al mattino.")
        val e = a.esegui(Proposta.ModificaQuaderno(Pilastro.BIO, "Lavoro manuale sporco sostituisce sedentarietà notturna.", "", "sostituisci"), oggi)
        assertTrue(e.ricevuta, e.riuscita)
        assertEquals("Dorme poco il giovedì.\n\nCamminata al mattino.", db.quaderni().elenco().single { it.pilastro == Pilastro.BIO }.testo)
        assertTrue(db.versioni().elenco().single().testo.contains("Lavoro manuale sporco"))
        val due = a.esegui(Proposta.ModificaQuaderno(Pilastro.BIO, "non c'è", "", "sostituisci"), oggi)
        assertFalse(due.riuscita)
    }

    @Test fun aggiungereInFondoFunzionaAncheAQuadernoVuoto() = runBlocking {
        assertTrue(a.esegui(Proposta.ModificaQuaderno(Pilastro.VIDYA, "", "Cover band di Rino Gaetano.", "aggiungi"), oggi).riuscita)
        assertEquals("Cover band di Rino Gaetano.", db.quaderni().elenco().single { it.pilastro == Pilastro.VIDYA }.testo)
        a.esegui(Proposta.ModificaQuaderno(Pilastro.VIDYA, "", "Prove il giovedì.", "aggiungi"), oggi)
        assertEquals("Cover band di Rino Gaetano.\nProve il giovedì.", db.quaderni().elenco().single { it.pilastro == Pilastro.VIDYA }.testo)
    }

    // ── L'anello ──

    private suspend fun sonno(daGiorniFa: LongRange, minuti: Double) = daGiorniFa.forEach {
        db.misure().sostituisci(Misura(tipo = TipoMisura.SONNO, valore = minuti, giorno = oggi.minusDays(it).toString(), istante = it, fonte = "hc", idEsterno = "s$it"))
    }

    @Test fun apertoConLaPartenzaCongelataEChiusoDalProgramma() = runBlocking {
        sonno(1L..14L, 400.0)
        val e = a.esegui(Proposta.ApriEsperimento("A letto entro le 23", TipoMisura.SONNO, Direzione.SU, 14, 15.0), oggi)
        assertTrue(e.ricevuta, e.riuscita && e.ricevuta.contains("Partenza congelata: Sonno 6h40"))
        val aperto = db.esperimenti().elenco().single()
        assertEquals(400.0, aperto.base, 0.0)
        assertEquals(oggi.plusDays(14).toString(), aperto.fine)

        // Durante la prova il sonno sale; la partenza non si muove.
        (0L..13L).forEach { db.misure().sostituisci(Misura(tipo = TipoMisura.SONNO, valore = 430.0, giorno = oggi.plusDays(it).toString(), istante = 100 + it, fonte = "hc", idEsterno = "n$it")) }
        assertTrue(a.chiudiScaduti(oggi.plusDays(13)).isEmpty())
        val chiusi = a.chiudiScaduti(oggi.plusDays(14))
        assertEquals(EsitoEsperimento.MOSSO, chiusi.single().esito)
        assertEquals(430.0, chiusi.single().finale!!, 0.0)
        assertTrue(db.voci().elenco().single { it.fonte == "esperimento" }.testo.contains("6h40 → 7h10: si è mosso"))
        assertTrue("chiudere di nuovo non fa niente", a.chiudiScaduti(oggi.plusDays(20)).isEmpty())
    }

    @Test fun senzaPuntoDiPartenzaNonSiApre() = runBlocking {
        sonno(1L..2L, 400.0)
        val e = a.esegui(Proposta.ApriEsperimento("x", TipoMisura.SONNO, Direzione.SU, 14, 15.0), oggi)
        assertFalse(e.riuscita)
        assertTrue(e.ricevuta, e.ricevuta.contains("meno di 3 giorni di dati"))
        assertTrue(db.esperimenti().elenco().isEmpty())
    }

    @Test fun lasciatoPrimaResta() = runBlocking {
        a.esegui(Proposta.ApriEsperimento("Suonare al mattino", TipoMisura.PRATICA, Direzione.SU, 14, 30.0), oggi)
        assertTrue(a.esegui(Proposta.LasciaEsperimento("suonare", "troppo presto"), oggi).riuscita)
        assertEquals(StatoEsperimento.ABBANDONATO, db.esperimenti().elenco().single().stato)
        assertTrue(db.voci().elenco().any { it.testo.contains("lasciato prima della fine") && it.testo.contains("troppo presto") })
    }

    @Test fun letturaDiUnDocumentoInesistenteDiceCosaEsiste() = runBlocking {
        a.importa(ImportPwa.leggi(backup))
        val r = a.leggiDocumento("Atto IV")
        assertTrue(r, r.contains("ATTO I: Origine"))
    }

    // «Sono via» (01/10/2026): al ritorno le consegne slittano dei giorni di assenza, gli esperimenti si allungano, il
    // diario tiene il periodo, e niente risulta mancato per colpa dell'assenza.
    @Test fun alRitornoConsegneEdEsperimentiSlittanoDeiGiorniDiAssenza() = runBlocking {
        val oggi = java.time.LocalDate.of(2026, 10, 1)
        val via = oggi.minusDays(4)
        a.vaVia(via)
        assertEquals("Sei già via", a.vaVia(via))
        db.consegne().inserisci(Consegna(cosa = "Scheda", documento = "Scheda", presa = via.minusDays(1).toString(), scadenza = via.plusDays(1).toString(), creata = 1))
        db.esperimenti().inserisci(Esperimento(titolo = "A letto alle 23", tipo = TipoMisura.SONNO, direzione = Direzione.SU, soglia = 15.0, giorni = 14,
            inizio = via.minusDays(5).toString(), fine = via.plusDays(9).toString(), base = 400.0, origine = "shell", creato = 1))
        val r = a.torna(oggi)!!
        assertTrue(r, r.contains("via 4 giorni"))
        assertEquals(via.plusDays(5).toString(), db.consegne().aperte().single().scadenza)
        assertEquals(via.plusDays(13).toString(), db.esperimenti().elenco().single().fine)
        assertTrue(db.voci().elenco().single().testo.startsWith("In pausa («Sono via») dal $via al ${oggi.minusDays(1)}: 4 giorni."))
        assertEquals(null, a.torna(oggi))
    }

    @Test fun unSonoViaRitiratoLoStessoGiornoNonSpostaNiente() = runBlocking {
        val oggi = java.time.LocalDate.of(2026, 10, 1)
        a.vaVia(oggi)
        db.consegne().inserisci(Consegna(cosa = "Scheda", documento = "Scheda", presa = oggi.toString(), scadenza = oggi.plusDays(2).toString(), creata = 1))
        assertTrue(a.torna(oggi)!!.contains("ritirato"))
        assertEquals(oggi.plusDays(2).toString(), db.consegne().aperte().single().scadenza)
        assertEquals(null, a.assenzaInCorso())
        val voci = db.voci().elenco()
        assertTrue(it.resonance.adam.logica.Assenza.giorniDiPausa(it.resonance.adam.logica.Assenza.periodi(voci), oggi).isEmpty())
    }

    // Il terreno di Adam City: si entra con un gesto, il rinforzo vuole un fatto che esista davvero, la copia lo porta.
    @Test fun unaTracciaSiRinforzaSoloDaUnFattoDellArchivio() = runBlocking {
        val oggi = java.time.LocalDate.of(2026, 10, 1)
        val casa = a.entraInStanza("casa", oggi)
        assertEquals(casa.id, a.entraInStanza("Casa", oggi).id)
        val t = a.depositaTraccia(casa.id, "Ghost", "cena", "Stasera brace, 20:30", 3, oggi).getOrThrow()
        assertTrue(a.depositaTraccia(casa.id, "Ghost", "cena", "Vieni?", 3, oggi).isFailure)
        assertTrue(a.rinforzaTraccia(t.id, "voce", 999, oggi).exceptionOrNull()!!.message!!.contains("non c'è"))
        val v = db.voci().inserisci(Voce(pilastro = Pilastro.BIO, giorno = oggi.toString(), testo = "Cena alla brace con Marta", fonte = "ghost", creato = 1, aggiornato = 1))
        assertEquals(2.0, a.rinforzaTraccia(t.id, "voce", v, oggi).getOrThrow().forza, 1e-9)
        assertEquals(2.0, db.tracce().per(t.id)!!.forza, 1e-9)
        val copia = a.copia()
        a.esciDaStanza(casa.id, oggi)
        assertTrue(a.depositaTraccia(casa.id, "Ghost", "cena", "x", 3, oggi).isFailure)
        assertEquals(1, a.svanisciTracce(oggi.plusDays(10)))
        a.ripristina(copia)
        assertEquals(null, db.tracce().stanza(casa.id)!!.uscita)
        assertEquals(null, db.tracce().per(t.id)!!.svanita)
    }
}
