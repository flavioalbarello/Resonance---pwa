package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.TipoMisura
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class ImportPwaTest {
    private val zona = ZoneId.of("Europe/Rome")

    private val backup = """
    {"_formato":"resonance-backup","_versione":3,"dati":{},
     "syncState":{
       "bio":[
         {"id":"b1","date":"2026-09-20","weight":"82,4","sleep":"6h30","notes":"schiena rigida"},
         {"id":"b2","date":"2026-09-21","weight":"","sleep":"3 apnee","notes":""},
         {"id":"b3","date":"2026-09-22","weight":"abc","sleep":"7","notes":""}
       ],
       "air":[{"id":"a1","date":"2026-09-10","title":"Corso online","status":"idea","notes":"da validare"}],
       "vidya":[{"id":"v1","date":"2026-09-11","title":"Mixaggio Atto II","notes":""}],
       "pVidya":[{"id":"p1","title":"Divenire","divenire":"musicista che finisce le opere",
                  "topics":[{"id":"t1","label":"Atto I","status":"consolidato"},{"id":"t2","label":"Atto II","status":"introdotto"}],
                  "documents":[{"id":"d1","title":"ATTO I: Origine","text":"Il seme.","date":"2026-09-01T10:00:00Z","nodoId":"t1"},
                               {"id":"d2","title":"Vecchio","text":"","date":"2026-08-01"}]}],
       "memory":{"bio":{"corrente":"Dorme poco il giovedì","sedimento":[]},"air":"legacy stringa","vidya":{"corrente":"","sedimento":[]}},
       "styleMemory":"Risposte brevi.",
       "kernel":{"content":"Stato del sistema","version":2},
       "ghostProfile":{"name":"Flavio","hardConstraints":[{"id":"x","testo":"Niente PhysioAlba in uscita","pilastro":"air"},
                          {"id":"g1","tipo":"identita-professionale","identita":"fisioterapista, PhysioAlba","testo":"Identità separata","pilastro":"air"}],
                       "cognitiveStyle":{"notes":"configurazionale","channel":"uditivo"},"freeform":{"motivation":"accelerare"}}
     }}
    """.trimIndent()

    @Test fun leggeMisureVociPercorsiQuaderniEProfilo() {
        val r = ImportPwa.leggi(backup, 0, zona)
        val peso = r.misure.single { it.tipo == TipoMisura.PESO }
        assertEquals(82.4, peso.valore, 0.0)
        assertEquals("pwa:bio:b1:peso", peso.idEsterno)
        assertEquals(setOf(390.0, 420.0), r.misure.filter { it.tipo == TipoMisura.SONNO }.map { it.valore }.toSet())
        assertTrue(r.voci.any { it.pilastro == Pilastro.BIO && it.testo == "Sonno: 3 apnee" })
        assertTrue(r.voci.any { it.pilastro == Pilastro.AIR && it.testo == "Corso online — idea\nda validare" })
        assertTrue(r.voci.any { it.pilastro == Pilastro.ADAM && it.testo.contains("Stato del sistema") })

        val p = r.percorsi.single()
        assertEquals("Divenire", p.percorso.titolo)
        assertEquals(Pilastro.VIDYA, p.percorso.pilastro)
        assertEquals(listOf(StatoNodo.CONSOLIDATO, StatoNodo.INTRODOTTO), p.nodi.map { it.nodo.stato })
        assertEquals("t1", p.documenti.first().idNodoPwa)

        assertEquals(setOf(Pilastro.BIO, Pilastro.AIR, Pilastro.ADAM), r.quaderni.map { it.pilastro }.toSet())
        assertEquals("[AIR] Niente PhysioAlba in uscita\n[AIR] Identità separata", r.profilo!!.vincoli)
        assertEquals("il marchio sì, la professione no", "PhysioAlba", r.profilo!!.nomiProtetti)
        assertEquals("Flavio", r.profilo!!.nome)
    }

    @Test fun ciòCheNonSiLeggeVieneDichiarato() {
        val r = ImportPwa.leggi(backup, 0, zona)
        assertTrue(r.scartati.any { it.contains("abc") })
        assertTrue(r.scartati.any { it.contains("Vecchio") })
    }

    @Test fun unFileQualsiasiNonEUnBackup() {
        val e = runCatching { ImportPwa.leggi("""{"a":1}""") }.exceptionOrNull()
        assertTrue(e is ImportPwa.NonEUnBackup)
    }

    @Test fun sonnoSoloQuandoEDavveroUnaDurata() {
        assertEquals(450, ImportPwa.minutiDiSonno("7,5"))
        assertEquals(390, ImportPwa.minutiDiSonno("6h30"))
        assertEquals(420, ImportPwa.minutiDiSonno("circa 7 ore, svegliato 2 volte"))
        assertNull(ImportPwa.minutiDiSonno("3 apnee"))
        assertNull(ImportPwa.minutiDiSonno("male"))
    }
}
