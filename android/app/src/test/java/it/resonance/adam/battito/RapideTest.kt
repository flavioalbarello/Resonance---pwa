package it.resonance.adam.battito

import android.app.NotificationManager
import android.content.Intent
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Rituale
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.LocalDate

// Dalla notifica al database, senza aprire l'app: il tocco su «✓ rituale» spunta davvero, e la notifica si ridisegna
// con il rituale che resta. «Rispondi» porta un campo di testo (RemoteInput).
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class RapideTest {
    private val app = RuntimeEnvironment.getApplication()

    @Test fun laSpuntaDallaNotificaArrivaNelDatabaseELaNotificaPerdeQuelRituale() = runBlocking {
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        Battiti.creaCanale(app)
        val db = Db.di(app)
        val a = db.rituali().inserisci(Rituale(nome = "Stretching", pilastro = Pilastro.BIO, creato = 1))
        val b = db.rituali().inserisci(Rituale(nome = "Diario", pilastro = Pilastro.ADAM, creato = 2))
        val c = Rapide.Contenuto(101, "Stasera", "Due rituali da fare.", "", "SHELL", Battiti.CANALE)
        val rituali = db.rituali().elenco()
        val azioni = Rapide.azioni(app, c, rispondi = true, rituali = rituali)
        assertEquals(listOf("Rispondi", "✓ Stretching", "✓ Diario"), azioni.map { it.title.toString() })
        assertNotNull(azioni.first().remoteInputs?.singleOrNull())

        // Il tocco su «✓ Stretching»: lo stesso intent che il sistema consegnerebbe.
        val intent = shadowOf(azioni[1].actionIntent).savedIntent
        Rapide.gesto(app, Intent(intent))
        val oggi = LocalDate.now().toString()
        assertTrue(db.rituali().elencoSpunte().any { it.ritualeId == a && it.giorno == oggi })
        assertTrue(db.rituali().elencoSpunte().none { it.ritualeId == b })
        val n = shadowOf(app.getSystemService(NotificationManager::class.java)).getNotification(101)
        assertNotNull("la notifica va ridisegnata", n)
        assertEquals(listOf("Rispondi", "✓ Diario"), n.actions.map { it.title.toString() })
        db.close()
    }
}
