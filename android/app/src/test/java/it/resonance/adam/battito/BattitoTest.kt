package it.resonance.adam.battito

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import androidx.work.Configuration
import androidx.work.WorkManager
import it.resonance.adam.Impostazioni
import it.resonance.adam.logica.Battito
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.ZoneId

// Visto il 25/09: «il battito non batte». Prima era un'attesa di WorkManager, che a schermo spento Android rinvia;
// ora una sveglia di sistema per battito, rimessa a ogni suono, e un registro di com'è andata.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class BattitoTest {
    private val app = RuntimeEnvironment.getApplication()
    private val am get() = app.getSystemService(AlarmManager::class.java)
    private val imp get() = Impostazioni(app)

    @Before fun prepara() {
        runCatching { WorkManager.initialize(app, Configuration.Builder().build()) }
        imp.battitoAttivo = true
    }

    @Test fun treSveglieAllOraGiusta() {
        Battiti.programma(app)
        val sveglie = shadowOf(am).scheduledAlarms
        assertEquals(3, sveglie.size)
        val attese = Battito.entries.map { Battiti.quando(imp, it).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli() }.toSet()
        assertEquals(attese, sveglie.map { it.triggerAtTime }.toSet())
        assertTrue(sveglie.all { it.type == AlarmManager.RTC_WAKEUP })
    }

    @Test fun spentoNessunaSveglia() {
        Battiti.programma(app)
        imp.battitoAttivo = false
        Battiti.programma(app)
        assertTrue(shadowOf(am).scheduledAlarms.isEmpty())
    }

    @Test fun laSvegliaSiRimetteEAvviaIlLavoro() {
        SvegliaBattito().onReceive(app, Intent().putExtra("battito", "SERA"))
        assertEquals(1, shadowOf(am).scheduledAlarms.size)
        assertFalse(WorkManager.getInstance(app).getWorkInfosForUniqueWork("battito-SERA").get().isEmpty())
    }

    @Test fun unaNotificaSpentaSiDice() {
        Battiti.creaCanale(app)
        assertTrue(Battiti.muto(app)!!.contains("non permesse"))
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        assertNull(Battiti.muto(app))
        shadowOf(app.getSystemService(NotificationManager::class.java)).setNotificationsEnabled(false)
        assertTrue(Battiti.muto(app)!!.contains("spente"))
        assertFalse(Battiti.notifica(app, 1, "Oggi", "x", "", "SPECCHIO"))
    }
}
