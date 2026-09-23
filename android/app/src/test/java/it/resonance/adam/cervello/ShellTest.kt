package it.resonance.adam.cervello

import androidx.room.Room
import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Evento
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Risolutore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.time.LocalDate

// Il turno intero con un modello finto: ciò che conta è cosa fa il PROGRAMMA con le sue risposte.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class ShellTest {
    private lateinit var db: Db
    private lateinit var archivio: Archivio
    private val app = RuntimeEnvironment.getApplication()
    private val imp = object : Impostazioni(app) {
        override var chiave: String
            get() = "finta"
            set(_) {}
    }

    // Il finto calendario usa il Risolutore vero: si prova la decisione, non il finto.
    private class FintoMondo : Mondo {
        val eseguite = mutableListOf<Proposta>()
        val domani: LocalDate = LocalDate.now().plusDays(1)
        val eventi = listOf(
            Evento("Dentista", LocalDate.now().atTime(10, 30), LocalDate.now().atTime(11, 15), false),
            Evento("Fisioterapia", domani.atTime(18, 0), domani.atTime(19, 0), false, calendario = "Personale",
                id = 7, idSerie = 7, regola = "FREQ=WEEKLY;BYDAY=TU", origineMs = 1),
        )
        override suspend fun agenda(da: LocalDate, giorni: Int) = AgendaLetta.Letta(da, giorni, eventi)
        override suspend fun risolvi(p: Proposta) = Risolutore.risolvi(p, eventi, LocalDate.now())
        override suspend fun copia(p: Proposta) = (p as? Proposta.TogliEvento)?.let { "Prima di togliere: «${it.bersaglio?.titolo}», ogni martedì" }
        override suspend fun esegui(p: Proposta) = Esecuzione(true, "Fatto nel calendario, riletto").also { eseguite += p }
    }

    private class FintoModello(vararg risposte: Risposta) : OpenRouter() {
        private val coda = ArrayDeque(risposte.toList())
        val ricevuti = mutableListOf<JsonArray>()
        val modelli = mutableListOf<String>()
        var instradatore: (() -> Risposta)? = null
        override suspend fun completa(chiave: String, modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int, rapida: Boolean): Risposta {
            if (rapida) { modelli += "router:$modello"; return instradatore!!() }
            ricevuti += JsonArray(messaggi.toList())
            modelli += modello
            return coda.removeFirst()
        }
    }

    private fun testo(t: String) = Risposta(t, emptyList(), null, JsonObject(emptyMap()), false)
    private fun chiama(nome: String, argomenti: String) =
        Risposta("", listOf(ChiamataStrumento("c${argomenti.hashCode()}", nome, argomenti)), null, JsonObject(emptyMap()), false)
    private fun contenuto(m: JsonArray, i: Int) = m[i].jsonObject["content"]!!.jsonPrimitive.content

    @Before fun apri() {
        db = Room.inMemoryDatabaseBuilder(app, Db::class.java).allowMainThreadQueries().build()
        archivio = Archivio(db)
    }

    @After fun chiudi() = db.close()

    private suspend fun proposta(p: Proposta) = db.messaggi().inserisci(Messaggio(
        ruolo = Ruolo.PROPOSTA, testo = p.descrizione(), istante = 1, proposta = Azioni.codifica(p), stato = StatoProposta.IN_ATTESA))

    @Test fun lEventoConfermatoVaAlCalendarioENonAllArchivio() = runBlocking {
        val mondo = FintoMondo()
        val p = Proposta.CreaEvento("Dentista", LocalDate.now().plusDays(1).atTime(10, 30).toString(), 45)
        val id = proposta(p)
        val ricevuta = Shell(archivio, imp, FintoModello(), mondo).conferma(id)
        assertEquals(listOf<Proposta>(p), mondo.eseguite)
        assertEquals(StatoProposta.ESEGUITA, db.messaggi().per(id)!!.stato)
        assertEquals(ricevuta, db.messaggi().elenco().single { it.ruolo == Ruolo.RICEVUTA }.testo)
    }

    @Test fun senzaMondoLaMailNonSiFingeFatta() = runBlocking {
        val id = proposta(Proposta.ScriviMail("", "Ciao", "Testo"))
        Shell(archivio, imp, FintoModello()).conferma(id)
        assertEquals(StatoProposta.FALLITA, db.messaggi().per(id)!!.stato)
        assertTrue(db.messaggi().elenco().none { it.ruolo == Ruolo.RICEVUTA })
    }

    @Test fun lIndirizzoInventatoTornaAlModelloQuelloScrittoDalGhostPassa() = runBlocking {
        val modello = FintoModello(
            chiama("scrivi_mail", """{"a":"rossi@studio.it","oggetto":"Stasera","corpo":"Arrivo alle 8."}"""),
            chiama("scrivi_mail", """{"a":"marta@esempio.it","oggetto":"Stasera","corpo":"Arrivo alle 8."}"""),
            testo("Ho proposto la mail a Marta."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("scrivi a marta@esempio.it che arrivo alle 8")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.contains("non indovinarlo"))
        val p = db.messaggi().per(esito.proposte.single())!!
        assertEquals(Proposta.ScriviMail("marta@esempio.it", "Stasera", "Arrivo alle 8."), archivio.proposta(p))
    }

    @Test fun ilModelloVedeLAgendaLettaEPuoInterrogarla() = runBlocking {
        val modello = FintoModello(chiama("leggi_calendario", """{"giorni":3}"""), testo("Domani sei libero."))
        Shell(archivio, imp, modello, FintoMondo()).turno("cosa ho domani?")
        assertTrue(contenuto(modello.ricevuti[0], 0).contains("10:30–11:15 Dentista"))
        val lettura = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(lettura, lettura.startsWith("Impegni in calendario"))
    }

    @Test fun unaSerieSenzaSapereQuantoSiChiedePoiSiProponeESiCopiaPrima() = runBlocking {
        val mondo = FintoMondo()
        val g = mondo.domani.toString()
        val modello = FintoModello(
            chiama("togli_evento", """{"titolo":"fisioterapia","giorno":"$g"}"""),
            testo("Solo quello di domani, da domani in poi, o tutta la serie?"),
        )
        val shell = Shell(archivio, imp, modello, mondo)
        val prima = shell.turno("togli la fisioterapia di domani")
        assertTrue(prima.proposte.isEmpty())
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.startsWith("Non proposta:") && rimando.contains("tutta la serie"))

        val modello2 = FintoModello(
            chiama("togli_evento", """{"titolo":"fisioterapia","giorno":"$g","quali":"tutta_la_serie"}"""),
            testo("Propongo di togliere tutta la serie."),
        )
        val dopo = Shell(archivio, imp, modello2, mondo).turno("tutta la serie")
        val id = dopo.proposte.single()
        assertTrue(db.messaggi().per(id)!!.testo.startsWith("Togliere TUTTA la serie «Fisioterapia»"))

        Shell(archivio, imp, modello2, mondo).conferma(id)
        val tolta = mondo.eseguite.single() as Proposta.TogliEvento
        assertEquals(it.resonance.adam.logica.Portata.SERIE, tolta.portata)
        assertEquals(7L, tolta.bersaglio!!.idSerie)
        val copia = db.voci().elenco().single { it.fonte == "calendario" }
        assertEquals(it.resonance.adam.dati.Pilastro.ADAM, copia.pilastro)
        assertTrue(copia.testo.contains("Fisioterapia"))
    }

    // Visto sul telefono il 23/09: una riscrittura del quaderno tagliata a metà spariva nel vuoto.
    @Test fun unaChiamataTagliataTornaAlModelloConIlMotivo() = runBlocking {
        val tagliata = Risposta("", listOf(ChiamataStrumento("t1", "aggiorna_quaderno", """{"pilastro":"BIO","testo":"Dorme po""")), null, JsonObject(emptyMap()), true)
        val modello = FintoModello(tagliata, chiama("modifica_quaderno", """{"pilastro":"BIO","ancora":"refuso","testo":"","modo":"sostituisci"}"""), testo("Propongo di togliere la riga."))
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("togli quella riga")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.contains("tagliata dal limite di lunghezza") && rimando.contains("modifica_quaderno"))
        assertEquals(1, esito.proposte.size)
    }

    @Test fun unaFotoConLlamaVaAlModelloCheVedeEIlTurnoDopoNonLaRimanda() = runBlocking {
        val f = java.io.File(app.cacheDir, "bolletta.jpg").apply { writeBytes(byteArrayOf(9, 9, 9)) }
        val foto = it.resonance.adam.logica.Allegato("bolletta.jpg", it.resonance.adam.logica.Allegato.Tipo.IMMAGINE, immagini = listOf(f.path))
        val modello = FintoModello(testo("È una bolletta della luce: 84,20 €."), testo("Sì, 84,20."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        shell.turno("leggi questa", listOf(foto))
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_VISTA, modello.modelli[0])
        val ultimo = modello.ricevuti[0].last().jsonObject["content"]!!.toString()
        assertTrue(ultimo, ultimo.contains("data:image/jpeg;base64,CQkJ") && ultimo.contains("Immagine allegata «bolletta.jpg»"))

        shell.turno("quanto era?")
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO, modello.modelli[1])
        val storia = modello.ricevuti[1].toString()
        assertTrue(storia, !storia.contains("base64") && storia.contains("visti allora e non più visibili: 🖼 bolletta.jpg"))
    }

    @Test fun conKimiLeImmaginiLeGuardaKimi() = runBlocking {
        imp.modello = "moonshotai/kimi-k2.6"
        val f = java.io.File(app.cacheDir, "x.jpg").apply { writeBytes(byteArrayOf(1)) }
        val modello = FintoModello(testo("Vedo."))
        Shell(archivio, imp, modello, FintoMondo()).turno("guarda", listOf(it.resonance.adam.logica.Allegato("x.jpg", it.resonance.adam.logica.Allegato.Tipo.IMMAGINE, immagini = listOf(f.path))))
        assertEquals("moonshotai/kimi-k2.6", modello.modelli.single())
        imp.modello = it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO
    }

    // Il turno gira come lavoro di sistema: se il sistema lo interrompe e lo rilancia, non si risponde due volte.
    @Test fun unMessaggioGiaRispostoNonSiRispondeDiNuovo() = runBlocking {
        val modello = FintoModello(testo("Prima risposta."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        val id = shell.registra("ciao")
        assertEquals("Prima risposta.", shell.rispondi(id).testo)
        assertEquals("Prima risposta.", shell.rispondi(id).testo)
        assertEquals(1, modello.modelli.size)
        assertEquals(1, db.messaggi().elenco().count { it.ruolo == Ruolo.SHELL })
    }

    // La perturbazione non finge un messaggio del Ghost: una nota del programma, poi una proposta da confermare.
    @Test fun laPerturbazioneProponeUnEsperimentoEDiceDaDoveViene() = runBlocking {
        val modello = FintoModello(
            chiama("proponi_esperimento", """{"titolo":"Suonare 10 minuti appena sveglio","misura":"PRATICA","direzione":"su","perche":"la sera salta"}"""),
            testo("Proviamo al mattino: la sera salta sempre."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).perturba(listOf("Pratica: zero negli ultimi 14 giorni"))
        val msgs = db.messaggi().elenco()
        assertTrue(msgs.none { it.ruolo == Ruolo.GHOST })
        assertTrue(msgs.first().ruolo == Ruolo.NOTA && msgs.first().testo.contains("ristagno"))
        val p = archivio.proposta(db.messaggi().per(esito.proposte.single())!!) as Proposta.ApriEsperimento
        assertEquals("perturbazione", p.origine)
        val richiesta = modello.ricevuti[0].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(richiesta, richiesta.startsWith("[Nota del programma, non del Ghost]"))
    }

    // ── Scelta automatica del motore ──

    private fun conScelta(corpo: suspend () -> Unit) = runBlocking {
        imp.sceltaAutomatica = true
        try { corpo() } finally { imp.sceltaAutomatica = false }
    }

    @Test fun unaCosaSempliceVaAlModelloLeggeroESiVedeChiHaRisposto() = conScelta {
        val modello = FintoModello(Risposta("Propongo 82,4.", emptyList(), 0.0004, JsonObject(emptyMap()), false))
        modello.instradatore = { Risposta("LEGGERO", emptyList(), 0.00001, JsonObject(emptyMap()), false) }
        Shell(archivio, imp, modello, FintoMondo()).turno("peso 82,4")
        assertEquals(listOf("router:${Instradatore.MODELLO}", it.resonance.adam.Impostazioni.MODELLO_LEGGERO), modello.modelli)
        val r = db.messaggi().elenco().single { it.ruolo == Ruolo.SHELL }
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_LEGGERO, r.modello)
        assertEquals("leggero", r.motore)
        assertEquals(0.00041, r.costo!!, 1e-9)
    }

    @Test fun nelDubbioOSenzaRispostaVaAlModelloScelto() = conScelta {
        val a = FintoModello(testo("ok"))
        a.instradatore = { Risposta("Direi forse leggero, ma è PIENO", emptyList(), null, JsonObject(emptyMap()), false) }
        Shell(archivio, imp, a, FintoMondo()).turno("che ne pensi del progetto con la band?")
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO, a.modelli.last())

        val b = FintoModello(testo("ok"))
        b.instradatore = { throw java.io.IOException("timeout") }
        Shell(archivio, imp, b, FintoMondo()).turno("ciao")
        assertEquals(it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO, b.modelli.last())
    }

    @Test fun unDocumentoNonChiedeNemmenoAlRouter() = conScelta {
        val modello = FintoModello(testo("letto"))
        modello.instradatore = { error("non dovrebbe essere chiamato") }
        Shell(archivio, imp, modello, FintoMondo()).turno("leggi", listOf(it.resonance.adam.logica.Allegato("n.docx", it.resonance.adam.logica.Allegato.Tipo.TESTO, testo = "x")))
        assertEquals(listOf(it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO), modello.modelli)
    }

    @Test fun senzaSceltaAutomaticaNessunaMicrochiamata() = runBlocking {
        val modello = FintoModello(testo("ok"))
        Shell(archivio, imp, modello, FintoMondo()).turno("peso 82")
        assertEquals(listOf(it.resonance.adam.Impostazioni.MODELLO_PREDEFINITO), modello.modelli)
        assertEquals(null, db.messaggi().elenco().single { it.ruolo == Ruolo.SHELL }.motore)
    }

    @Test fun ilNomeProtettoDelProfiloBloccaLaMail() = runBlocking {
        db.profilo().salva(it.resonance.adam.dati.Profilo(nome = "Flavio", nomiProtetti = "PhysioAlba"))
        val modello = FintoModello(chiama("scrivi_mail", """{"oggetto":"Corso","corpo":"Firmato PhysioAlba"}"""), testo("Riscrivo."))
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("prepara la mail per il corso")
        assertTrue(esito.proposte.isEmpty())
        assertTrue(modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.contains("«PhysioAlba»"))
    }
}
