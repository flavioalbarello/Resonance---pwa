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

    @Test fun letturaDiUnDocumentoInesistenteDiceCosaEsiste() = runBlocking {
        a.importa(ImportPwa.leggi(backup))
        val r = a.leggiDocumento("Atto IV")
        assertTrue(r, r.contains("ATTO I: Origine"))
    }
}
