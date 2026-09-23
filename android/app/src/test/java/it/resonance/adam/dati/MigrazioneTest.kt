package it.resonance.adam.dati

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
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
}
