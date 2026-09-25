package it.resonance.adam.cervello

import androidx.room.Room
import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Pilastro
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
        var tokenFinto = ""
        override var tokenCassetta: String
            get() = tokenFinto
            set(v) { tokenFinto = v }
    }

    // La cassetta finta: tiene le lettere aperte e restituisce i commenti che le si danno.
    private class FintaCassetta : Cassetta() {
        val aperte = mutableListOf<Pair<String, String>>()
        val commenti = mutableMapOf<Int, List<Commento>>()
        override suspend fun apri(repo: String, token: String, titolo: String, corpo: String): Int { aperte += titolo to corpo; return aperte.size }
        override suspend fun commenti(repo: String, token: String, numero: Int) = commenti[numero].orEmpty()
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
        val temperature = mutableListOf<Double?>()
        var rifiutaTemperatura = false
        override suspend fun completa(chiave: String, modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int, rapida: Boolean,
                                      temperatura: Double?): Risposta {
            if (rapida) { modelli += "router:$modello"; return instradatore!!() }
            if (rifiutaTemperatura && temperatura != null) throw ErroreModello("HTTP 400: {\"error\":{\"message\":\"temperature is not supported for this model\"}}")
            temperature += temperatura
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
        archivio.aggiornaQuaderno(Pilastro.BIO, "Dorme poco il giovedì. refuso")
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

    // Visto sul telefono il 24/09: quattro giri di strumenti e nessuna risposta, restava solo la nota.
    @Test fun finitiIGiriLoShellRispondeComunque() = runBlocking {
        val giri = (1..Shell.GIRI_MASSIMI).map { chiama("cerca", """{"testo":"Rino Gaetano $it"}""") }.toTypedArray()
        val modello = FintoModello(*giri, testo("Non trovo niente sulla band nei tuoi appunti: raccontami chi sono i musicisti."))
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("sono stato contattato per un tributo a Rino Gaetano")
        assertEquals("Non trovo niente sulla band nei tuoi appunti: raccontami chi sono i musicisti.", esito.testo)
        assertEquals(Shell.GIRI_MASSIMI + 1, modello.modelli.size)
        val ultima = modello.ricevuti.last().last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(ultima, ultima.contains("Hai finito i giri di strumenti"))
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.contains("cerca letto") })
        assertEquals(1, db.messaggi().elenco().count { it.ruolo == Ruolo.SHELL })
    }

    // Visto il 24/09: quaderno Vidya vuoto, tre proposte di «sostituire» una riga che non c'era; il Ghost confermava
    // e riceveva «non modificato». Ora la proposta non arriva al Ghost: torna al modello, che aggiunge in fondo.
    @Test fun unaModificaCheFallirebbeNonSiMostraAlGhost() = runBlocking {
        val modello = FintoModello(
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"sostituisci","ancora":"- E io ci sto: primo pezzo [introdotto]","testo":"- Sfiorivano le viole: assimilato"}"""),
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"aggiungi","testo":"- Sfiorivano le viole: assimilato"}"""),
            testo("Ho proposto di annotarlo nel quaderno Vidya."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("Sfiorivano le viole è assimilato")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.startsWith("Non proposta") && rimando.contains("è vuoto") && rimando.contains("aggiungi"))
        val p = archivio.proposta(db.messaggi().per(esito.proposte.single())!!) as Proposta.ModificaQuaderno
        assertEquals("aggiungi", p.modo)
    }

    @Test fun lAncoraAssenteTornaConLeRigheVere() = runBlocking {
        archivio.aggiornaQuaderno(Pilastro.VIDYA, "- E io ci sto: primo pezzo\n- Chitarra: barré in quinta")
        val modello = FintoModello(
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"sostituisci","ancora":"Mio fratello è figlio unico","testo":"x"}"""),
            // Copiata da un testo visto su una riga sola: gli a capo non contano.
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"dopo","ancora":"primo pezzo - Chitarra","testo":"(ripasso)"}"""),
            testo("Proposto."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("aggiorna")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.contains("«- Chitarra: barré in quinta»"))
        Shell(archivio, imp, FintoModello(), FintoMondo()).conferma(esito.proposte.single())
        assertEquals(StatoProposta.ESEGUITA, db.messaggi().per(esito.proposte.single())!!.stato)
    }

    @Test fun laStessaPropostaNonSiRipete() = runBlocking {
        val args = """{"pilastro":"VIDYA","modo":"aggiungi","testo":"- Sfiorivano le viole: assimilato"}"""
        Shell(archivio, imp, FintoModello(chiama("modifica_quaderno", args), testo("Proposto.")), FintoMondo()).turno("annotalo")
        val modello = FintoModello(chiama("modifica_quaderno", args), testo("Premi Conferma sulla proposta."))
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("sì")
        assertTrue(esito.proposte.isEmpty())
        assertTrue(contenuto(modello.ricevuti[1], modello.ricevuti[1].size - 1).contains("già in attesa"))
    }

    // Il motivo di un fallimento sta in una nota: il modello deve vederla, o se ne inventa uno.
    @Test fun leNoteDelProgrammaArrivanoAlModello() = runBlocking {
        db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, testo = "Quaderno Vidya non modificato: il frammento «x» non c'è", istante = 1))
        val modello = FintoModello(testo("Il frammento non c'era."))
        Shell(archivio, imp, modello, FintoMondo()).turno("perché non è stato salvato?")
        assertTrue(modello.ricevuti[0].any { it.jsonObject["content"]?.jsonPrimitive?.content?.contains("non c'è") == true })
    }

    // I brani di una scaletta sono nodi del percorso, non righe di un testo: si aggiungono a un percorso che c'è già,
    // senza doppioni, e lo stato si cambia solo su un nodo che esiste.
    @Test fun iNodiSiAggiungonoAUnPercorsoCheEsisteSenzaDoppioni() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Tributo Gaetano", "", listOf("E io ci sto")))
        val modello = FintoModello(
            chiama("stato_nodo", """{"percorso":"Tributo Gaetano","nodo":"Sfiorivano le viole","stato":"CONSOLIDATO"}"""),
            chiama("aggiungi_nodi", """{"percorso":"tributo gaetano","nodi":["E io ci sto","Sfiorivano le viole","Al compleanno della zia Rosina","Sfiorivano le viole"]}"""),
            testo("Proposti i due brani nuovi."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("metti i brani come nodi")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.startsWith("Non proposta") && rimando.contains("aggiungi_nodi"))
        val p = archivio.proposta(db.messaggi().per(esito.proposte.single())!!) as Proposta.AggiungiNodi
        assertEquals(listOf("Sfiorivano le viole", "Al compleanno della zia Rosina"), p.nodi)
        Shell(archivio, imp, FintoModello(), FintoMondo()).conferma(esito.proposte.single())
        assertEquals(listOf("E io ci sto", "Sfiorivano le viole", "Al compleanno della zia Rosina"),
            db.percorsi().elencoNodi().sortedBy { it.ordine }.map { it.etichetta })

        val dopo = FintoModello(chiama("stato_nodo", """{"percorso":"Tributo Gaetano","nodo":"Sfiorivano le viole","stato":"CONSOLIDATO"}"""), testo("Proposto."))
        assertEquals(1, Shell(archivio, imp, dopo, FintoMondo()).turno("sfiorivano è assimilato").proposte.size)
    }

    // Un nodo doppione si toglie, e lascia una traccia nel diario: la storia di una tappa non si cancella.
    @Test fun unNodoSiToglieELasciaTraccia() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Tribute Rino Gaetano", "", listOf("E io ci sto: primo pezzo e blocchi tecnici", "E io ci sto")))
        val modello = FintoModello(
            chiama("togli_nodo", """{"percorso":"Tribute Rino Gaetano","nodo":"io ci"}"""),
            chiama("togli_nodo", """{"percorso":"Tribute Rino Gaetano","nodo":"e io ci sto: primo pezzo e blocchi tecnici"}"""),
            testo("Proposto di togliere il doppione."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("togli il primo E io ci sto")
        val rimando = modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.contains("più nodi"))
        Shell(archivio, imp, FintoModello(), FintoMondo()).conferma(esito.proposte.single())
        assertEquals(listOf("E io ci sto"), db.percorsi().elencoNodi().map { it.etichetta })
        assertTrue(db.voci().elenco().any { it.pilastro == Pilastro.VIDYA && it.testo.contains("«E io ci sto: primo pezzo e blocchi tecnici», era non iniziato") })
    }

    // I brani vanno sotto «Scaletta», che non c'è ancora: si crea, e non cade su «Assimilazione scaletta…» per somiglianza.
    // Lo stato del padre non si dichiara; togliere il padre riporta su i figli.
    @Test fun iBraniSiRaccolgonoSottoUnPadreCheNonHaStatoSuo() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Tribute Rino Gaetano", "",
            listOf("Assimilazione scaletta e architettura del repertorio", "E io ci sto", "Sfiorivano le viole", "Concerto")))
        val modello = FintoModello(
            chiama("sposta_nodi", """{"percorso":"Tribute Rino Gaetano","nodi":["E io ci sto","Sfiorivano le viole"],"sotto":"Scaletta"}"""),
            chiama("aggiungi_nodi", """{"percorso":"Tribute Rino Gaetano","nodi":["Gianna","E io ci sto"],"sotto":"Scaletta"}"""),
            testo("Proposti."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("metti i brani sotto la scaletta")
        val sposta = archivio.proposta(db.messaggi().per(esito.proposte[0])!!) as Proposta.SpostaNodi
        assertEquals(Proposta.SpostaNodi("Tribute Rino Gaetano", listOf("E io ci sto", "Sfiorivano le viole"), "Scaletta", sottoNuovo = true), sposta)
        assertTrue(sposta.descrizione(), sposta.descrizione().contains("sotto «Scaletta» (nodo nuovo)"))
        val aggiungi = archivio.proposta(db.messaggi().per(esito.proposte[1])!!) as Proposta.AggiungiNodi
        assertEquals(listOf("Gianna"), aggiungi.nodi)
        assertEquals(listOf("E io ci sto"), aggiungi.saltati)

        val conferme = Shell(archivio, imp, FintoModello(), FintoMondo())
        esito.proposte.forEach { conferme.conferma(it) }
        val tutti = db.percorsi().elencoNodi()
        val scaletta = tutti.single { it.etichetta == "Scaletta" }
        assertEquals(null, scaletta.genitoreId)
        assertEquals(listOf("E io ci sto", "Sfiorivano le viole", "Gianna"), it.resonance.adam.logica.Nodi.figli(tutti, scaletta.id).map { it.etichetta })

        val stato = FintoModello(chiama("stato_nodo", """{"percorso":"Tribute Rino Gaetano","nodo":"Scaletta","stato":"CONSOLIDATO"}"""), testo("Ok."))
        Shell(archivio, imp, stato, FintoMondo()).turno("la scaletta è consolidata")
        assertTrue(stato.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.contains("lo calcola il programma"))

        archivio.togliNodo(scaletta)
        assertEquals(setOf("Assimilazione scaletta e architettura del repertorio", "E io ci sto", "Sfiorivano le viole", "Concerto", "Gianna"),
            it.resonance.adam.logica.Nodi.radici(db.percorsi().elencoNodi()).map { it.etichetta }.toSet())
        assertTrue(db.voci().elenco().any { it.testo.contains("«Scaletta», raccoglieva 3 sotto-nodi") })
    }

    // ── Temperatura (25/09/2026): la decide il compito; il Ghost la forza per un messaggio; un rifiuto non blocca ──

    @Test fun laTemperaturaLaDecideIlCompitoELaForzaturaValeUnaVolta() = runBlocking {
        val modello = FintoModello(chiama("cerca", """{"testo":"x"}"""), testo("Ecco."), testo("Di nuovo."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        shell.turno("cerca x")
        assertEquals(listOf<Double?>(Compito.TURNO.temperatura, Compito.TURNO.temperatura), modello.temperature)
        val id = shell.registra("scrivi più libero")
        shell.rispondi(id, Forzatura.LIBERO)
        assertEquals(Forzatura.LIBERO.temperatura, modello.temperature.last())
        val risposte = db.messaggi().elenco().filter { it.ruolo == Ruolo.SHELL }
        assertEquals(listOf(false, true), risposte.map { it.forzata })
        assertEquals(listOf<Double?>(0.4, 0.8), risposte.map { it.temperatura })
        val turni = db.turni().ultimi(10)
        assertEquals(listOf("TURNO", "TURNO"), turni.map { it.compito })
        assertEquals(listOf(false, true), turni.map { it.forzata })
    }

    // Nella PWA un parametro rifiutato poteva impedire la risposta: qui si rinuncia al parametro, mai alla risposta.
    @Test fun unModelloCheRifiutaLaTemperaturaRispondeComunqueESeLoRicorda() = runBlocking {
        val modello = FintoModello(testo("Rispondo lo stesso."), testo("E anche ora."))
        modello.rifiutaTemperatura = true
        val shell = Shell(archivio, imp, modello, FintoMondo())
        assertEquals("Rispondo lo stesso.", shell.turno("ciao").testo)
        assertTrue(imp.modello in imp.senzaTemperatura)
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.contains("non accetta una temperatura") })
        shell.turno("ancora")
        assertEquals(listOf<Double?>(null, null), modello.temperature)
        assertEquals(1, db.messaggi().elenco().count { it.ruolo == Ruolo.NOTA && it.testo.contains("non accetta") })
        assertEquals(null, db.messaggi().elenco().last { it.ruolo == Ruolo.SHELL }.temperatura)
    }

    @Test fun ilTurnoContaLeProposteFermateDalProgramma() = runBlocking {
        val modello = FintoModello(
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"sostituisci","ancora":"non c'è","testo":"x"}"""),
            chiama("modifica_quaderno", """{"pilastro":"VIDYA","modo":"aggiungi","testo":"- nota"}"""),
            testo("Proposto."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("annota")
        val t = db.turni().ultimi(1).single()
        assertEquals(1, t.rifiutate)
        assertEquals(esito.proposte.joinToString(","), t.proposte)
    }

    // ── Pilastro Adam: un percorso che attraversa più pilastri, con il pilastro sulle parti ──

    @Test fun unPercorsoDiAdamPrendeIPilastriDalleSueParti() = runBlocking {
        val crea = FintoModello(chiama("crea_percorso", """{"pilastro":"ADAM","titolo":"Resonance","nodi":["APK V2"]}"""), testo("Proposto."))
        Shell(archivio, imp, crea, FintoMondo()).turno("crea il percorso Resonance").proposte.forEach { Shell(archivio, imp, FintoModello(), FintoMondo()).conferma(it) }
        val modello = FintoModello(
            chiama("pilastro_nodo", """{"percorso":"Resonance","nodo":"APK V2","pilastro":"VIDYA"}"""),
            chiama("aggiungi_nodi", """{"percorso":"Resonance","nodi":["Plasmidi"],"pilastro":"AIR"}"""),
            chiama("aggiungi_nodi", """{"percorso":"Resonance","nodi":["Battito"],"sotto":"APK V2","pilastro":"BIO"}"""),
            testo("Proposti."),
        )
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("dai i pilastri")
        val rimando = modello.ricevuti[3].last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(rimando, rimando.contains("prendono il pilastro del padre"))
        esito.proposte.forEach { Shell(archivio, imp, FintoModello(), FintoMondo()).conferma(it) }
        val nodi = db.percorsi().elencoNodi()
        assertEquals(listOf(Pilastro.AIR, Pilastro.VIDYA), it.resonance.adam.logica.Nodi.pilastriToccati(nodi))
        assertTrue(it.resonance.adam.logica.Nodi.trasversale(nodi))

        // Su un percorso di un solo pilastro il pilastro dei nodi non si dà.
        archivio.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Tributo", "", listOf("Gianna")))
        val altro = FintoModello(chiama("pilastro_nodo", """{"percorso":"Tributo","nodo":"Gianna","pilastro":"AIR"}"""), testo("Ok."))
        Shell(archivio, imp, altro, FintoMondo()).turno("gianna in air")
        assertTrue(altro.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.contains("solo nei percorsi di Adam"))
    }

    // ── Pacchetto Adam (25/09/2026) ──

    @Test fun ilTaccuinoSiScriveSenzaPropostaEDalTurnoDopoESottoGliOcchi() = runBlocking {
        val modello = FintoModello(chiama("scrivi_taccuino", """{"testo":"Un planner per musicisti di tributi: nicchia scoperta?"}"""), testo("Annotato."), testo("Ricordo."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        val esito = shell.turno("pensaci")
        assertTrue(esito.proposte.isEmpty())
        val nota = db.taccuino().elenco().single()
        assertTrue(modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.startsWith("Nel taccuino: nota #${nota.id}"))
        shell.turno("e allora?")
        assertTrue(contenuto(modello.ricevuti[2], 0).contains("#${nota.id} (evapora tra 21 gg): Un planner"))
    }

    // La voce dello Shell sulla propria regolazione: proposta, conferma del Ghost, traccia nel diario, effetto dal turno dopo.
    @Test fun unaTemperaturaPropostaEConfermataValeDalTurnoDopo() = runBlocking {
        val modello = FintoModello(chiama("regola_temperatura", """{"compito":"TURNO","valore":0.62,"perche":"le proposte sono troppo caute"}"""), testo("Proposto."), testo("Ecco."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        val id = shell.turno("regolati").proposte.single()
        shell.conferma(id)
        assertEquals(0.6, imp.temperature["TURNO"]!!, 1e-9)
        assertTrue(db.voci().elenco().any { it.pilastro == Pilastro.ADAM && it.testo.contains("t 0,4 → t 0,6") && it.testo.contains("troppo caute") })
        shell.turno("prova")
        assertEquals(0.6, modello.temperature.last()!!, 1e-9)
    }

    @Test fun ilFondoNonSpendePiuDelSaldo() = runBlocking {
        db.fondo().inserisci(it.resonance.adam.dati.Movimento(giorno = LocalDate.now().toString(), tipo = it.resonance.adam.dati.TipoMovimento.VERSAMENTO, importo = 100.0, motivo = "primo", creato = 1))
        val modello = FintoModello(
            chiama("movimento_fondo", """{"tipo":"uscita","importo":120,"motivo":"hosting"}"""),
            chiama("movimento_fondo", """{"tipo":"uscita","importo":12,"motivo":"dominio neutro"}"""),
            testo("Proposti."),
        )
        val shell = Shell(archivio, imp, modello, FintoMondo())
        val (troppo, giusto) = shell.turno("paga").proposte
        assertTrue(shell.conferma(troppo).contains("supera il saldo"))
        assertTrue(shell.conferma(giusto).contains("Saldo 88,00 €"))
    }

    // La cassetta: la lettera parte al tocco del Ghost con lo stato dell'app; torna solo ciò che porta il segno dell'architetto.
    @Test fun unaLetteraParteConLoStatoEUnaRispostaTorna() = runBlocking {
        val cassetta = FintaCassetta()
        val modello = FintoModello(chiama("scrivi_all_architetto", """{"oggetto":"Fondo: primo mese","testo":"Contesto: 25/09. Domanda: A o B?"}"""), testo("Proposta."))
        val shell = Shell(archivio, imp, modello, FintoMondo(), cassetta)
        val id = shell.turno("scrivi all'architetto").proposte.single()
        assertTrue(shell.conferma(id).contains("parte appena in Setup c'è la cassetta"))
        assertEquals(it.resonance.adam.dati.StatoLettera.DA_INVIARE, db.lettere().elenco().single().stato)

        imp.cassetta = "flavio/adam-lettere"
        imp.tokenCassetta = "t"
        val posta = Corrispondenza(archivio, imp, cassetta)
        assertEquals(1, posta.spedisciInSospeso())
        val (titolo, corpo) = cassetta.aperte.single()
        assertEquals("Fondo: primo mese", titolo)
        assertTrue(corpo, corpo.contains("Domanda: A o B?") && corpo.contains("Stato dell'app (automatico)") && corpo.contains(Cassetta.MARCA_SHELL))
        cassetta.commenti[1] = listOf(Cassetta.Commento(10, "un commento del Ghost"), Cassetta.Commento(11, "${Cassetta.MARCA}\nB, per questo motivo."))
        val nuove = posta.ritira()
        assertEquals(listOf("B, per questo motivo."), nuove.map { it.second.testo })
        assertTrue(posta.ritira().isEmpty())
        assertEquals(it.resonance.adam.dati.StatoLettera.RISPOSTA, db.lettere().elenco().single().stato)
    }

    @Test fun laCassettaNonPuoEssereIlRepositoryPubblico() {
        assertTrue(!Cassetta.valido("flavioalbarello/Resonance---pwa"))
        assertTrue(Cassetta.valido("flavioalbarello/adam-lettere"))
        assertTrue(!Cassetta.valido("non un repo"))
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
