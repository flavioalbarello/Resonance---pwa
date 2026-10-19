package it.resonance.adam.battito

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.EsitoPratica
import it.resonance.adam.dati.MisuraFronte
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.logica.Pratica
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.time.LocalDate

// La sessione di studio dalla notifica (V3 fase 2): il Ghost suona sopra Moises e tocca «✓ Pulito» senza aprire l'app.
// L'esito arriva nel database, il pezzo sale di velocità, la notifica passa al blocco dopo; all'ultimo, il resoconto.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class StudioTest {
    private val app = RuntimeEnvironment.getApplication()
    private val nm get() = shadowOf(app.getSystemService(NotificationManager::class.java))

    @Test fun dallaNotificaSiStudiaFinoAlResoconto() = runBlocking {
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        val db = Db.di(app)
        val a = Archivio(db)
        val oggi = LocalDate.now()
        val per = db.percorsi().inserisci(Percorso(pilastro = Pilastro.VIDYA, titolo = "Tributo Rino Gaetano (studio)", creato = 1, misura = MisuraFronte.VELOCITA))
        val gianna = db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Gianna — ponte", ordine = 0, velocita = 75,
            ultimaPratica = oggi.minusDays(4).toString(), fonte = "https://studio.moises.ai/x"))
        db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Berta filava", ordine = 1))

        val s = a.apriSessione(per, 20, oggi)!!
        val piano = Pratica.decodifica(s.piano)
        assertEquals(listOf(gianna), piano.take(1).map { it.nodoId })
        Studio.mostra(app, s.id, per, "VIDYA", piano[0], 0, piano.size, System.currentTimeMillis() + piano[0].minuti * 60_000L)
        val prima = nm.getNotification(Studio.ID)
        assertNotNull(prima)
        assertEquals(listOf("✓ Pulito", "✗ Errori", "→ Avanti"), prima.actions.map { it.title.toString() })
        // Toccarla apre la fonte (Moises), non l'app.
        assertEquals(Intent.ACTION_VIEW, shadowOf(prima.contentIntent).savedIntent.action)
        // A fine blocco suona una sveglia.
        assertTrue(shadowOf(app.getSystemService(AlarmManager::class.java)).scheduledAlarms.isNotEmpty())

        // «✓ Pulito» dalla notifica: la velocità sale a 80, si passa al secondo blocco.
        Studio.gesto(app, Intent(shadowOf(prima.actions[0].actionIntent).savedIntent))
        assertEquals(80, db.percorsi().elencoNodi().first { it.id == gianna }.velocita)
        val seconda = nm.getNotification(Studio.ID)
        assertTrue(seconda.extras.getCharSequence("android.title").toString().startsWith("Studio 2/2"))
        // Un doppio tocco veloce (arriva col blocco vecchio, prima che la notifica si ridisegni) non segna il blocco dopo.
        Studio.gesto(app, Intent(shadowOf(prima.actions[0].actionIntent).savedIntent).putExtra("indice", 0))
        assertEquals(1, db.pratica().esitiDi(s.id).size)

        // «✗ Errori» sull'ultimo: la sessione si chiude, resta il resoconto, i minuti diventano PRATICA, il diario lo sa.
        Studio.gesto(app, Intent(shadowOf(seconda.actions[1].actionIntent).savedIntent))
        assertNull(db.pratica().inCorso())
        val fine = nm.getNotification(Studio.ID)
        assertTrue(fine.extras.getCharSequence("android.title").toString().startsWith("Studio finito"))
        assertTrue((fine.flags and android.app.Notification.FLAG_ONGOING_EVENT) == 0)
        assertTrue(db.voci().elenco().any { it.testo.startsWith("Studio «Tributo Rino Gaetano (studio)»") && "Gianna — ponte: pulito a 80% (era 75%)" in it.testo })
        // Durata zero nel test: nessuna misura da 0 minuti.
        assertTrue(db.misure().elenco().none { it.tipo == TipoMisura.PRATICA && it.idEsterno == "sessione:${s.id}" && it.valore <= 0 })
    }

    @Test fun iMinutiDiUnaSessioneVeraDiventanoPratica() = runBlocking {
        val db = Db.di(app)
        val a = Archivio(db)
        val oggi = LocalDate.now()
        val per = db.percorsi().inserisci(Percorso(pilastro = Pilastro.VIDYA, titolo = "Scale (studio)", creato = 1, misura = MisuraFronte.VELOCITA))
        db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Do maggiore", ordine = 0))
        val inizio = System.currentTimeMillis() - 12 * 60_000L
        val s = a.apriSessione(per, 10, oggi, adesso = inizio)!!
        val passo = a.segnaBlocco(s.id, EsitoPratica.PULITO, 72, oggi)!!
        assertNull(passo.prossimo)
        assertEquals(listOf("Do maggiore: pulito a 72% (prima volta)"), passo.resoconto)
        val m = db.misure().elenco().single { it.idEsterno == "sessione:${s.id}" }
        assertEquals(TipoMisura.PRATICA, m.tipo); assertEquals(12.0, m.valore, 0.0)
        // Una seconda sessione chiude la prima se era rimasta aperta.
        val s2 = a.apriSessione(per, 10, oggi)!!
        val s3 = a.apriSessione(per, 10, oggi)!!
        assertNotNull(db.pratica().sessione(s2.id)!!.fine); assertEquals(s3.id, db.pratica().inCorso()!!.id)
        a.chiudiSessione(s3, oggi)
        Unit
    }

    // La mappa del tempo (V3 fase 5): all'ora del buco arriva la proposta, e un tocco fa partire lo studio.
    @Test fun nelBucoArrivaLaPropostaEUnToccoFaPartireLoStudio() = runBlocking {
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        Battiti.creaCanale(app)
        val db = Db.di(app)
        val a = Archivio(db)
        db.pratica().inCorso()?.let { a.chiudiSessione(it, LocalDate.now()) }
        val per = db.percorsi().inserisci(Percorso(pilastro = Pilastro.VIDYA, titolo = "Tributo nel buco", creato = 1, scadenza = LocalDate.now().plusDays(10).toString()))
        db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Nuntereggae più", ordine = 0, velocita = 85, ultimaPratica = LocalDate.now().minusDays(9).toString()))
        Studio.proponi(app, a, LocalDate.now().atTime(18, 40))
        val n = nm.getNotification(Studio.ID_PROPOSTA)
        assertNotNull("la proposta nel buco", n)
        assertTrue(n.extras.getCharSequence("android.title").toString().startsWith("Hai 200′"))
        assertEquals(listOf("Studia 20′", "Studia 120′", "Non ora"), n.actions.map { it.title.toString() })
        Studio.gesto(app, Intent(shadowOf(n.actions[0].actionIntent).savedIntent))
        val s = db.pratica().inCorso()!!
        assertEquals(20, s.minuti)
        assertNotNull(nm.getNotification(Studio.ID))
        // Con una sessione già in corso, niente proposta.
        app.getSystemService(NotificationManager::class.java).cancel(Studio.ID_PROPOSTA)
        Studio.proponi(app, a, LocalDate.now().atTime(18, 40))
        assertNull(nm.getNotification(Studio.ID_PROPOSTA))
        a.chiudiSessione(s, LocalDate.now())
        Unit
    }

    // L'obliquo (fase 8): un fronte «da fare» (il piano alimentare) usa lo stesso motore, senza velocità.
    @Test fun unFronteDaFareAvanzaPerStatoSenzaVelocita() = runBlocking {
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
        val db = Db.di(app)
        val a = Archivio(db)
        db.pratica().inCorso()?.let { a.chiudiSessione(it, LocalDate.now()) }
        val per = db.percorsi().inserisci(Percorso(pilastro = Pilastro.BIO, titolo = "Piano alimentare (obliquo)", creato = 1))
        val spesa = db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Spesa della settimana", ordine = 0))
        val s = a.apriSessione(per, 15, LocalDate.now())!!
        val piano = Pratica.decodifica(s.piano)
        Studio.mostra(app, s.id, per, "BIO", piano[0], 0, piano.size, System.currentTimeMillis() + 60_000, misura = MisuraFronte.AVANZAMENTO)
        val n = nm.getNotification(Studio.ID)
        assertEquals(listOf("✓ Fatto", "~ In parte", "→ Salta"), n.actions.map { it.title.toString() })
        assertTrue(!n.extras.getCharSequence("android.text").toString().contains("%"))
        Studio.gesto(app, Intent(shadowOf(n.actions[0].actionIntent).savedIntent))
        val nodo = db.percorsi().elencoNodi().single { it.id == spesa }
        assertEquals(it.resonance.adam.dati.StatoNodo.INTRODOTTO, nodo.stato); assertEquals(null, nodo.velocita)
        assertTrue(db.voci().elenco().any { it.testo.contains("Spesa della settimana: fatto") })
        Unit
    }

    // Il Ritratto di Adam diventa una bitmap per il widget e lo sfondo: si disegna davvero, non è vuota.
    @org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
    @Test fun ilRitrattoSiDisegnaInUnaBitmap() = runBlocking {
        val m = Widget.modello(app)
        val b = it.resonance.adam.ui.ritrattoBitmap(m, 300, 500)
        assertEquals(300, b.width); assertEquals(500, b.height)
        val colori = (0 until 300 step 10).flatMap { x -> (100 until 400 step 10).map { y -> b.getPixel(x, y) } }.toSet()
        assertTrue("il disegno ha più di qualche colore: ${colori.size}", colori.size > 5)
        Unit
    }

    // La prova generale: i pezzi non cambiano, il resoconto misura il set e finisce nel diario.
    @Test fun laProvaGeneraleMisuraIlSetSenzaToccareIPezzi() = runBlocking {
        val db = Db.di(app)
        val a = Archivio(db)
        db.pratica().inCorso()?.let { a.chiudiSessione(it, LocalDate.now()) }
        val per = db.percorsi().inserisci(Percorso(pilastro = Pilastro.VIDYA, titolo = "Tributo (prova)", creato = 1, misura = MisuraFronte.VELOCITA))
        val gianna = db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Gianna", ordine = 0, velocita = 90))
        db.percorsi().inserisciNodo(Nodo(percorsoId = per, etichetta = "Aida", ordine = 1))
        val t0 = 1_000_000L
        val s = a.apriProva(per, LocalDate.now(), adesso = t0)!!
        a.segnaBlocco(s.id, EsitoPratica.PULITO, null, LocalDate.now(), adesso = t0 + 240_000)
        val fine = a.segnaBlocco(s.id, EsitoPratica.ERRORI, null, LocalDate.now(), adesso = t0 + 420_000)!!
        assertNull(fine.prossimo)
        assertEquals("Set: 7:00, 2 brani suonati, filo perso 1 volta", fine.resoconto[0])
        assertEquals(90, db.percorsi().elencoNodi().single { it.id == gianna }.velocita)
        assertTrue(db.voci().elenco().any { it.testo.startsWith("Prova generale «Tributo (prova)»: Set: 7:00") })
        Unit
    }
}
