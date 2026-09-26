package it.resonance.adam.dati

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

// Chi ha già la 2.0.144 installata ha un database alla versione 1: l'aggiornamento non deve perdere niente.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class MigrazioneTest {
    private val nome = "migrazione.db"

    @get:Rule val aiuto = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), Db::class.java)

    @Test fun dallaUnoAllaDueIlProfiloResta() {
        aiuto.createDatabase(nome, 1).apply {
            execSQL("INSERT INTO profilo (id, nome, stile, motivazione, vincoli) VALUES (1, 'Flavio', 'Denso', '', '[AIR] x')")
            execSQL("INSERT INTO misure (tipo, valore, giorno, istante, fonte, nota) VALUES ('PESO', 82.4, '2026-09-20', 0, 'hc', '')")
            close()
        }
        aiuto.runMigrationsAndValidate(nome, 2, true).close()

        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, nome).allowMainThreadQueries().build()
        runBlocking {
            val p = db.profilo().leggi()!!
            assertEquals("Flavio", p.nome)
            assertEquals("[AIR] x", p.vincoli)
            assertEquals("", p.nomiProtetti)
            assertEquals(82.4, db.misure().elenco().single().valore, 0.0)
        }
        db.close()
    }

    @Test fun dallaDieciAllUndiciIDocumentiRestanoVisibili() {
        aiuto.createDatabase("undici.db", 10).apply {
            execSQL("INSERT INTO percorsi (id, pilastro, titolo, scopo, creato, archiviato) VALUES (1, 'VIDYA', 'Tributo', '', 0, 0)")
            execSQL("INSERT INTO documenti (percorsoId, titolo, testo, creato, aggiornato) VALUES (1, 'Scaletta', 'x', 0, 0)")
            close()
        }
        aiuto.runMigrationsAndValidate("undici.db", 11, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "undici.db").allowMainThreadQueries().build()
        runBlocking { assertEquals(null, db.percorsi().elencoDocumenti().single().tolto) }
        db.close()
    }

    @Test fun dallaNoveAllaDieciNasceLaLavagna() {
        aiuto.createDatabase("dieci.db", 9).close()
        aiuto.runMigrationsAndValidate("dieci.db", 10, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "dieci.db").allowMainThreadQueries().build()
        runBlocking { assertTrue(db.lavagna().elenco().isEmpty()) }
        db.close()
    }

    @Test fun dallaOttoAllaNoveNasconoLeConsegneEIMessaggiRestano() {
        aiuto.createDatabase("nove.db", 8).apply {
            execSQL("INSERT INTO messaggi (ruolo, testo, istante, allegati, forzata) VALUES ('NOTA', 'Architetto (riunione): vecchia nota', 1, '', 0)")
            close()
        }
        aiuto.runMigrationsAndValidate("nove.db", 9, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "nove.db").allowMainThreadQueries().build()
        runBlocking {
            assertTrue(db.consegne().elenco().isEmpty())
            // Le note vecchie dell'architetto restano note: nessuna riscrittura (Legge 14).
            assertEquals(Ruolo.NOTA, db.messaggi().elenco().single().ruolo)
        }
        db.close()
    }

    @Test fun dallaSetteAllaOttoNasconoTaccuinoFondoELettere() {
        aiuto.createDatabase("otto.db", 7).close()
        aiuto.runMigrationsAndValidate("otto.db", 8, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "otto.db").allowMainThreadQueries().build()
        runBlocking {
            assertTrue(db.taccuino().elenco().isEmpty())
            assertTrue(db.fondo().elenco().isEmpty())
            assertTrue(db.lettere().elenco().isEmpty())
        }
        db.close()
    }

    @Test fun dallaSeiAllaSetteNodiEMessaggiRestanoComeErano() {
        aiuto.createDatabase("sette.db", 6).apply {
            execSQL("INSERT INTO percorsi (id, pilastro, titolo, scopo, creato, archiviato) VALUES (1, 'VIDYA', 'Tributo', '', 0, 0)")
            execSQL("INSERT INTO nodi (percorsoId, etichetta, stato, ordine) VALUES (1, 'Gianna', 'INTRODOTTO', 0)")
            execSQL("INSERT INTO messaggi (ruolo, testo, istante, allegati) VALUES ('SHELL', 'risposta', 1, '')")
            close()
        }
        aiuto.runMigrationsAndValidate("sette.db", 7, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "sette.db").allowMainThreadQueries().build()
        runBlocking {
            assertEquals(null, db.percorsi().elencoNodi().single().pilastro)
            val m = db.messaggi().elenco().single()
            assertEquals(null, m.temperatura)
            assertEquals(false, m.forzata)
            assertTrue(db.turni().ultimi(5).isEmpty())
        }
        db.close()
    }

    @Test fun dallaCinqueAllaSeiINodiRestanoAlPrimoLivello() {
        aiuto.createDatabase("sei.db", 5).apply {
            execSQL("INSERT INTO percorsi (id, pilastro, titolo, scopo, creato, archiviato) VALUES (1, 'VIDYA', 'Tributo', '', 0, 0)")
            execSQL("INSERT INTO nodi (percorsoId, etichetta, stato, ordine) VALUES (1, 'E io ci sto', 'INTRODOTTO', 0)")
            close()
        }
        aiuto.runMigrationsAndValidate("sei.db", 6, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "sei.db").allowMainThreadQueries().build()
        runBlocking {
            val n = db.percorsi().elencoNodi().single()
            assertEquals("E io ci sto", n.etichetta)
            assertEquals(null, n.genitoreId)
        }
        db.close()
    }

    @Test fun dallaQuattroAllaCinqueNasconoGliEsperimenti() {
        aiuto.createDatabase("cinque.db", 4).close()
        aiuto.runMigrationsAndValidate("cinque.db", 5, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "cinque.db").allowMainThreadQueries().build()
        runBlocking { assertTrue(db.esperimenti().elenco().isEmpty()) }
        db.close()
    }

    @Test fun dallaTreAllaQuattroIMessaggiRestanoSenzaModello() {
        aiuto.createDatabase("quattro.db", 3).apply {
            execSQL("INSERT INTO messaggi (ruolo, testo, istante, allegati) VALUES ('SHELL', 'risposta', 1, '')")
            close()
        }
        aiuto.runMigrationsAndValidate("quattro.db", 4, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "quattro.db").allowMainThreadQueries().build()
        runBlocking { assertEquals(null, db.messaggi().elenco().single().modello) }
        db.close()
    }

    @Test fun dallaDueAllaTreIMessaggiRestanoSenzaAllegati() {
        aiuto.createDatabase("tre.db", 2).apply {
            execSQL("INSERT INTO messaggi (ruolo, testo, istante) VALUES ('GHOST', 'ciao', 1)")
            close()
        }
        aiuto.runMigrationsAndValidate("tre.db", 3, true).close()
        val db = Room.databaseBuilder(RuntimeEnvironment.getApplication(), Db::class.java, "tre.db").allowMainThreadQueries().build()
        runBlocking {
            val m = db.messaggi().elenco().single()
            assertEquals("ciao", m.testo)
            assertEquals("", m.allegati)
        }
        db.close()
    }
}
