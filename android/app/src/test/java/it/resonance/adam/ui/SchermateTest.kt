package it.resonance.adam.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.StatoNodo
import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.dati.Voce
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Evento
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.LocalDate

// Le schermate si disegnano davvero, con dati verosimili, e restano come immagini da guardare.
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h860dp-xxhdpi")
class SchermateTest {
    @get:Rule val regola = createAndroidComposeRule<ComponentActivity>()

    private val cartella = File("build/schermate").apply { mkdirs() }
    private val sistema = object : Sistema {
        override fun chiediSensori() {}
        override fun chiediNotifiche() {}
        override fun chiediCalendario() {}
        override fun allega() {}
        override fun lavoroInBackground() {}
        override fun scatta() {}
        override fun apriFile() {}
        override fun salvaCopia() {}
    }

    private fun scatta(nome: String) {
        regola.waitForIdle()
        val vista = regola.activity.window.decorView
        val bmp = Bitmap.createBitmap(vista.width, vista.height, Bitmap.Config.ARGB_8888)
        vista.draw(Canvas(bmp))
        File(cartella, "$nome.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun semina(vm: Adam) = runBlocking {
        val db = vm.db
        val oggi = LocalDate.now()
        fun g(fa: Long) = oggi.minusDays(fa).toString()
        db.profilo().salva(Profilo(nome = "Flavio", stile = "Denso, non lungo.", vincoli = "[AIR] Niente nome professionale in uscita"))
        (0L..29L).forEach { fa ->
            db.misure().sostituisci(Misura(tipo = TipoMisura.PESO, valore = 84.2 - (29 - fa) * 0.06 + (fa % 3) * 0.1, giorno = g(fa), istante = fa, fonte = "hc:scale", idEsterno = "p$fa"))
            db.misure().sostituisci(Misura(tipo = TipoMisura.SONNO, valore = 390.0 + (fa % 4) * 25, giorno = g(fa), istante = fa, fonte = "hc", idEsterno = "s$fa"))
            db.misure().sostituisci(Misura(tipo = TipoMisura.PASSI, valore = 5200.0 + (fa % 5) * 900, giorno = g(fa), istante = fa, fonte = "hc", idEsterno = "k$fa"))
        }
        listOf(0L, 1L, 3L, 5L, 8L).forEach { db.misure().sostituisci(Misura(tipo = TipoMisura.PRATICA, valore = 40.0, giorno = g(it), istante = it, fonte = "manuale")) }
        db.misure().sostituisci(Misura(tipo = TipoMisura.ENTRATA, valore = 38.0, giorno = g(4), istante = 0, fonte = "manuale", legataAlTempo = false, nota = "vendita traccia"))
        db.misure().sostituisci(Misura(tipo = TipoMisura.ENTRATA, valore = 600.0, giorno = g(6), istante = 0, fonte = "manuale", legataAlTempo = true))
        val r1 = db.rituali().inserisci(Rituale(nome = "Dormire 7 ore", pilastro = Pilastro.BIO, criterio = "SONNO>=420", creato = 0))
        val r2 = db.rituali().inserisci(Rituale(nome = "Scala al flauto", pilastro = Pilastro.VIDYA, creato = 0))
        listOf(1L, 2L, 3L, 4L).forEach { db.rituali().spunta(Spunta(r2, g(it), "manuale", 0)) }
        assertTrue(r1 > 0)
        val p = db.percorsi().inserisci(Percorso(pilastro = Pilastro.VIDYA, titolo = "Divenire", scopo = "Il concept album finito, non solo iniziato", creato = 0))
        listOf("Atto I: Origine" to StatoNodo.CONSOLIDATO, "Atto II: Complessità" to StatoNodo.PRATICATO, "Atto III: Mitosi" to StatoNodo.INTRODOTTO, "Mixaggio" to StatoNodo.NON_INIZIATO)
            .forEachIndexed { i, (e, s) -> db.percorsi().inserisciNodo(Nodo(percorsoId = p, etichetta = e, stato = s, ordine = i)) }
        val brani = db.percorsi().inserisciNodo(Nodo(percorsoId = p, etichetta = "Brani", ordine = 4))
        listOf("Seme" to StatoNodo.CONSOLIDATO, "Mitosi" to StatoNodo.PRATICATO, "Coda" to StatoNodo.NON_INIZIATO)
            .forEachIndexed { i, (e, s) -> db.percorsi().inserisciNodo(Nodo(percorsoId = p, etichetta = e, stato = s, ordine = i, genitoreId = brani)) }
        db.percorsi().inserisciDocumento(Documento(percorsoId = p, titolo = "ATTO I: Origine", testo = "Il seme. Un'unica cellula che ancora non sa di essere musica.", creato = 0, aggiornato = 0))
        db.esperimenti().inserisci(it.resonance.adam.dati.Esperimento(titolo = "A letto entro le 23", tipo = TipoMisura.SONNO,
            direzione = it.resonance.adam.dati.Direzione.SU, soglia = 15.0, giorni = 14, inizio = g(4), fine = oggi.plusDays(10).toString(),
            base = 400.0, origine = "shell", creato = 2))
        db.esperimenti().inserisci(it.resonance.adam.dati.Esperimento(titolo = "Suonare 10 minuti appena sveglio", tipo = TipoMisura.PRATICA,
            direzione = it.resonance.adam.dati.Direzione.SU, soglia = 30.0, giorni = 14, inizio = g(30), fine = g(16), base = 40.0,
            origine = "perturbazione", creato = 1, stato = it.resonance.adam.dati.StatoEsperimento.CHIUSO, finale = 200.0,
            esito = it.resonance.adam.dati.EsitoEsperimento.MOSSO, chiuso = 1))
        db.quaderni().salva(Quaderno(Pilastro.BIO, "Il giovedì dorme meno: turno lungo.\nCamminata al mattino.", 0))
        db.voci().inserisci(Voce(pilastro = Pilastro.BIO, giorno = g(1), testo = "Schiena rigida al mattino, meglio dopo la camminata.", fonte = "manuale", creato = 0, aggiornato = 0))
        val t = System.currentTimeMillis()
        val foto = File(RuntimeEnvironment.getApplication().cacheDir, "scaletta.jpg").also { f ->
            val b = android.graphics.Bitmap.createBitmap(600, 400, android.graphics.Bitmap.Config.ARGB_8888)
            android.graphics.Canvas(b).apply { drawColor(0xFF4F6BFF.toInt()); drawCircle(300f, 200f, 120f, android.graphics.Paint().apply { color = 0xFFFFB020.toInt() }) }
            f.outputStream().use { b.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, it) }
        }
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = "stamattina 83,1 e ho suonato 40 minuti", istante = t - 10,
            allegati = it.resonance.adam.logica.Allegati.codifica(listOf(it.resonance.adam.logica.Allegato("scaletta.jpg", it.resonance.adam.logica.Allegato.Tipo.IMMAGINE, immagini = listOf(foto.path))))))
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.SHELL, testo = "Due numeri.\nPeso in calo costante: −1,6 in 30 giorni.\nPratica: quinta sessione in nove giorni.", istante = t + 1,
            modello = "moonshotai/kimi-k2.6", costo = 0.0021, motore = "pieno"))
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.PROPOSTA, testo = "Registrare Peso: 83,1 kg, oggi", istante = t + 2, stato = StatoProposta.ESEGUITA))
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.RICEVUTA, testo = "Registrato — Peso 83,1 kg, oggi", istante = t + 3))
        val modifica = it.resonance.adam.logica.Proposta.ModificaDocumento("Scaletta completa",
            "1. E io ci sto\n2. Al compleanno della zia Rosina", "1. E io ci sto\n2. Al compleanno della zia Rosina — da montare per intero", "sostituisci")
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.PROPOSTA, testo = modifica.descrizione(), istante = t + 4, stato = StatoProposta.IN_ATTESA,
            proposta = it.resonance.adam.logica.Azioni.codifica(modifica)))
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, testo = "Nessuna azione è stata eseguita in questo turno: le azioni vere compaiono come proposte da confermare e poi come ricevute.", istante = t + 5))
    }

    @Test fun leSchermateSiDisegnanoConIDatiVeri() {
        val vm = Adam(RuntimeEnvironment.getApplication())
        semina(vm)
        val oggi = LocalDate.now()
        vm.agenda = AgendaLetta.Letta(oggi, 2, listOf(
            Evento("Dentista", oggi.atTime(10, 30), oggi.atTime(11, 15), false, "Via Roma 12"),
            Evento("Prove con la band", oggi.atTime(21, 0), oggi.atTime(23, 0), false),
            Evento("Ferie", oggi.plusDays(1).atStartOfDay(), oggi.plusDays(2).atStartOfDay(), true),
        ))
        regola.setContent { TemaResonance { App(vm, sistema) { it() } } }
        regola.waitUntil(10_000) { vm.istantanea.value.misure.size >= 90 && vm.istantanea.value.rituali.size == 2 && vm.messaggi.value.size == 6 }

        scatta("1-specchio")
        regola.onNodeWithText("Stabilità mantenuta", substring = true, ignoreCase = true).assertExists()
        regola.onNodeWithText("Entrate che non vendono tempo", substring = true).assertExists()
        regola.onNodeWithText("10:30–11:15 Dentista (Via Roma 12)").assertExists()
        regola.onNodeWithText("Suonare 10 minuti appena sveglio", substring = true).performScrollTo()
        scatta("1b-esperimenti")
        regola.onNodeWithText("A letto entro le 23").assertExists()

        regola.onNodeWithTag("ancora").performClick()
        regola.mainClock.advanceTimeBy(600)
        scatta("2-ancora-aperta")
        regola.onNodeWithTag("ancora").performClick()

        vm.vai(Schermata.SHELL)
        vm.inAllegato += it.resonance.adam.logica.Allegato("referto.pdf", it.resonance.adam.logica.Allegato.Tipo.PDF, immagini = listOf("a", "b"), pagineTotali = 2)
        scatta("3-shell")
        regola.onNodeWithText("🖼 scaletta.jpg").assertExists()
        regola.onNodeWithTag("allegato").assertExists()
        vm.inAllegato.clear()
        regola.onNodeWithText("Conferma").assertExists()
        // Prima di confermare si legge tutto, con gli a capo: la scheda accorcia.
        regola.onNodeWithText("Vedi tutto").performScrollTo().performClick()
        regola.onNodeWithText("Esce:", substring = true).assertExists()
        regola.onNodeWithText("Entra:\n1. E io ci sto\n2. Al compleanno", substring = true).assertExists()
        scatta("3b-proposta-vedi-tutto")

        vm.vai(Schermata.VIDYA)
        regola.onNodeWithText("Percorsi").performClick()
        scatta("4-vidya-percorsi")
        regola.onNodeWithText("Divenire").performClick()
        scatta("5-percorso")
        // Il padre non ha stato: mostra i figli contati, si apre al tocco.
        regola.onNodeWithText("3 sotto-nodi: 1 consolidato, 1 praticato, 1 non iniziato").assertExists()
        regola.onNodeWithText("Seme").assertDoesNotExist()
        regola.onNodeWithText("▸ Brani").performScrollTo().performClick()
        regola.onNodeWithText("Seme").assertExists()
        scatta("5b-percorso-sottonodi")

        vm.vai(Schermata.BIO)
        scatta("6-bio-numeri")

        // Il quaderno si rivede per righe: ✕ toglie la riga, Salva la rende vera, lo storico tiene la precedente.
        regola.onNodeWithText("Quaderno").performClick()
        scatta("6b-bio-quaderno")
        regola.onNodeWithTag("togli-0").performClick()
        regola.onNodeWithText("Salva").performClick()
        // Room scrive su un suo thread e torna sul principale: si dà tempo reale, non solo tempo di Compose.
        repeat(40) { if (vm.quaderni.value.single { it.pilastro == Pilastro.BIO }.testo != "Camminata al mattino.") { Thread.sleep(100); regola.waitForIdle() } }
        assertEquals("Camminata al mattino.", vm.quaderni.value.single { it.pilastro == Pilastro.BIO }.testo)
        regola.onNodeWithText("1 versioni precedenti").assertExists()

        vm.vai(Schermata.SETUP)
        scatta("7-setup")
        // Il battito dice come sta: notifiche, sveglia, prossimi, registro.
        regola.onNodeWithText("Prova ora").performScrollTo()
        regola.onNodeWithText("Prossimi:", substring = true).assertExists()
        regola.onNodeWithText("Ultimi battiti", substring = true).assertExists()
        scatta("7b-setup-battito")
    }
}
