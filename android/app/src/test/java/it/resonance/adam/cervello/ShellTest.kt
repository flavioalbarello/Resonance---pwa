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
import it.resonance.adam.dati.StatoConsegna
import it.resonance.adam.dati.Consegna
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Consegne
import it.resonance.adam.logica.Consulente
import it.resonance.adam.logica.Lavagna
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Regole
import it.resonance.adam.logica.Validazione
import it.resonance.adam.logica.Evento
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Risolutore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
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
        val file = sortedMapOf<String, String>()
        var giu = false
        override suspend fun scrivi(repo: String, token: String, percorso: String, testo: String, messaggio: String) {
            if (giu) throw java.io.IOException("Unable to resolve host \"api.github.com\"")
            require(percorso !in file) { "un file del verbale non si riscrive: $percorso" }
            file[percorso] = testo
        }
        override suspend fun elenca(repo: String, token: String, cartella: String) =
            file.keys.filter { it.startsWith("$cartella/") }.map { it.removePrefix("$cartella/") }
        override suspend fun leggi(repo: String, token: String, percorso: String) = file.getValue(percorso)
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
            nomiStrumenti += strumenti?.map { it.jsonObject["function"]!!.jsonObject["name"]!!.jsonPrimitive.content }.orEmpty()
            ricevuti += JsonArray(messaggi.toList())
            modelli += modello
            conStrumenti += strumenti != null
            return coda.removeFirst()
        }
        val conStrumenti = mutableListOf<Boolean>()
        // Gli strumenti offerti a ogni chiamata (i reparti del turno, logica/Reparti.kt).
        val nomiStrumenti = mutableListOf<List<String>>()
        // Il consulente: risposte con le fonti del motore, e se la chiamata portava la ricerca web.
        val ricerche = ArrayDeque<RispostaWeb>()
        val cercati = mutableListOf<Pair<JsonArray, Boolean>>()
        override suspend fun cerca(chiave: String, modello: String, messaggi: JsonArray, maxToken: Int, temperatura: Double?, web: Boolean): RispostaWeb {
            cercati += JsonArray(messaggi.toList()) to web
            return ricerche.removeFirst()
        }
        // La ricerca a fondo dello Shell e di Segui.
        val aFondo = mutableListOf<JsonArray>()
        val modelliRicerca = mutableListOf<String>()
        // Gli strati della ricerca a fondo partono insieme: per non dipendere dall'ordine, la risposta si sceglie dalla domanda.
        var perDomanda: ((String) -> RispostaWeb)? = null
        // La ricerca di indirizzi di trova_dove: le domande, e le fonti che il motore restituirebbe.
        val indirizziChiesti = mutableListOf<List<String>>()
        var indirizzi: (List<String>) -> List<it.resonance.adam.logica.Consulente.Fonte> = { emptyList() }
        override suspend fun cercaIndirizzi(chiave: String, domande: List<String>, perDomanda: Int): RispostaWeb {
            synchronized(this) { indirizziChiesti += domande }
            return RispostaWeb("ok", indirizzi(domande), 0.004, false)
        }
        override suspend fun cercaAFondo(chiave: String, modello: String, messaggi: JsonArray, maxToken: Int, temperatura: Double?): RispostaWeb {
            synchronized(this) { aFondo += JsonArray(messaggi.toList()); modelliRicerca += modello }
            perDomanda?.let { return it(messaggi.toString()) }
            return synchronized(this) { ricerche.removeFirst() }
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
        val modello = FintoModello(chiama("scrivi_taccuino", """{"testo":"Un planner per musicisti di tributi: nicchia scoperta?","tipo":"ipotesi"}"""), testo("Annotato."), testo("Ricordo."))
        val shell = Shell(archivio, imp, modello, FintoMondo())
        val esito = shell.turno("pensaci")
        assertTrue(esito.proposte.isEmpty())
        val nota = db.taccuino().elenco().single()
        assertTrue(modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.startsWith("Nel taccuino: nota #${nota.id}"))
        shell.turno("e allora?")
        assertTrue(contenuto(modello.ricevuti[2], 0).contains("#${nota.id} (evapora tra 21 gg): [ipotesi] Un planner"))
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
        assumeTrue("solo nell'app di sviluppo", it.resonance.adam.logica.Edizione.sviluppatore)
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
        assumeTrue("solo nell'app di sviluppo", it.resonance.adam.logica.Edizione.sviluppatore)
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

    // La riunione a tre: lo scambio va nel verbale da solo (il nome protetto no), gli interventi dell'architetto tornano
    // in chat una volta sola, la chiusura lascia il verbale dello Shell.
    @Test fun laRiunioneScriveIlVerbaleERitiraLArchitetto() = runBlocking {
        assumeTrue("solo nell'app di sviluppo", it.resonance.adam.logica.Edizione.sviluppatore)
        db.profilo().salva(it.resonance.adam.dati.Profilo(nomiProtetti = "PhysioAlba"))
        imp.cassetta = "flavio/adam-lettere"
        imp.tokenCassetta = "t"
        val cassetta = FintaCassetta()
        val tavolo = Tavolo(archivio, imp, cassetta)
        tavolo.apri("Cifratura: fasi")
        val cartella = "riunioni/${imp.riunione}"
        assertTrue(imp.riunione.endsWith("-cifratura-fasi"))

        val modello = FintoModello(testo("Prima fase: solo numeri, niente immagini. Architetto, regge?"),
            testo("**Decisioni**\n- fase uno: solo numeri\n**Questioni aperte**\n- nessuna\n**Chi fa cosa**\n- Ghost: prova sul telefono"))
        val shell = Shell(archivio, imp, modello, FintoMondo(), cassetta)
        shell.turno("ragioniamo sulla cifratura, lo studio PhysioAlba può aspettare")
        assertTrue(contenuto(modello.ricevuti[0], 0).contains("RIUNIONE A TRE IN CORSO: «Cifratura: fasi»"))
        val scritti = cassetta.file.filterKeys { it.startsWith(cartella) }
        val ghost = scritti.entries.single { it.key.endsWith("-ghost.md") }.value
        assertTrue(ghost, ghost.contains("lo studio [nome protetto] può aspettare") && !ghost.contains("PhysioAlba"))
        assertTrue(scritti.keys.any { it.endsWith("-shell.md") })

        cassetta.file["$cartella/20990101-000000-000-architetto.md"] = "Regge, se i numeri restano sul telefono."
        assertEquals(1, tavolo.ritira().nuovi.size)
        assertEquals(0, tavolo.ritira().nuovi.size)
        // Dal 26/09 l'architetto ha un ruolo suo: si distingue dalle note e si ascolta.
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.ARCHITETTO && it.testo == "Regge, se i numeri restano sul telefono." })

        shell.chiudiRiunione()
        val verbale = cassetta.file.entries.single { it.key.startsWith(cartella) && it.key.endsWith("-verbale.md") }.value
        assertTrue(verbale, verbale.contains("Decisioni") && !verbale.startsWith("(Verbale"))
        // Il verbale è anche in chat, e la chiamata del verbale non porta strumenti.
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.SHELL && it.testo.startsWith("Verbale della riunione «Cifratura: fasi»") })
        assertTrue(cassetta.file.keys.any { it.startsWith(cartella) && it.endsWith("-chiusura.md") })
        assertEquals("", imp.riunione)
    }

    private suspend fun riunioneAperta(cassetta: FintaCassetta): String {
        imp.cassetta = "flavio/adam-lettere"
        imp.tokenCassetta = "t"
        Tavolo(archivio, imp, cassetta).apri("Primo contatto")
        return "riunioni/${imp.riunione}"
    }

    @Test fun lArchitettoRivoltoAlloShellLoFaRispondereFinoATreGiri() = runBlocking {
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        val tavolo = Tavolo(archivio, imp, cassetta)
        shell(FintoModello(testo("Ciao.")), cassetta).turno("apriamo")
        // Senza freccia: si legge e basta.
        cassetta.file["$cartella/20990101-000000-000-architetto.md"] = "Presente."
        assertEquals(null, tavolo.ritira().allaShell)
        val ids = (1..3).map { n ->
            cassetta.file["$cartella/20990101-00000$n-000-architetto.md"] = "→ Shell\nDomanda $n?"
            tavolo.ritira().allaShell
        }
        assertTrue(ids.all { it != null })
        // Il quarto giro senza il Ghost non parte: si dice una volta, in chat e nel verbale.
        cassetta.file["$cartella/20990101-000009-000-architetto.md"] = "→ Shell\nDomanda 4?"
        assertEquals(null, tavolo.ritira().allaShell)
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.startsWith("3 giri di fila") })
        assertEquals(1, cassetta.file.keys.count { it.endsWith("-programma.md") })

        // Il turno su un intervento dell'architetto: il modello lo vede come architetto, e nel verbale non c'è un falso «ghost».
        val prima = cassetta.file.keys.count { it.endsWith("-ghost.md") }
        val modello = FintoModello(testo("Risposta all'architetto."))
        shell(modello, cassetta).rispondi(ids.last()!!)
        val ultimo = modello.ricevuti.single().last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(ultimo, ultimo.startsWith("[L'architetto (Claude Code), non il Ghost] → Shell"))
        assertEquals(prima, cassetta.file.keys.count { it.endsWith("-ghost.md") })
        assertTrue(cassetta.file.values.any { it == "Risposta all'architetto." })

        // Scrive il Ghost: i giri ripartono da zero.
        shell(FintoModello(testo("Ok.")), cassetta).turno("continuate pure")
        cassetta.file["$cartella/20990101-000010-000-architetto.md"] = "→ Shell\nUltima?"
        assertTrue(tavolo.ritira().allaShell != null)
    }

    private fun shell(modello: FintoModello, cassetta: FintaCassetta) = Shell(archivio, imp, modello, FintoMondo(), cassetta)

    @Test fun ilVerbaleSenzaLaFormaTornaAlModelloUnaVoltaPoiLaRinunciaResta() = runBlocking {
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        val modello = FintoModello(testo("Tutto proposto. Conferma quello che vuoi."), testo("Decisioni\n- nessuna"))
        shell(modello, cassetta).chiudiRiunione()
        assertTrue(contenuto(modello.ricevuti[1], modello.ricevuti[1].size - 1).contains("«Questioni aperte», «Chi fa cosa»"))
        val verbale = cassetta.file.entries.single { it.key.startsWith(cartella) && it.key.endsWith("-verbale.md") }.value
        assertTrue(verbale, verbale.startsWith("(Verbale senza la forma richiesta: mancano «Questioni aperte», «Chi fa cosa».)"))
        assertEquals("", imp.riunione)
    }

    @Test fun senzaModelloLaRiunioneSiChiudeLoStessoESenzaReteIlVerbaleNonSiRiscrive() = runBlocking {
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        cassetta.giu = true
        val modello = FintoModello()   // nessuna risposta: il modello «cade»
        assertTrue(runCatching { shell(modello, cassetta).chiudiRiunione() }.isFailure)
        // Rete giù verso la cassetta: la riunione resta aperta, il verbale (qui: la sua mancanza) resta da consegnare.
        assertTrue(imp.riunione.isNotBlank())
        assertTrue(imp.riunioneVerbale.startsWith("(Verbale non scritto: il modello non ha risposto"))
        cassetta.giu = false
        val secondo = FintoModello()
        shell(secondo, cassetta).chiudiRiunione()
        assertTrue(secondo.ricevuti.isEmpty())
        assertTrue(cassetta.file.entries.any { it.key.startsWith(cartella) && it.key.endsWith("-verbale.md") && it.value.startsWith("(Verbale non scritto") })
        assertEquals("", imp.riunione)
        assertEquals("", imp.riunioneVerbale)
    }

    @Test fun laFintaNotaDelProgrammaSiTogleESiSegnala() = runBlocking {
        shell(FintoModello(testo("Ho proposto tre cose.\n\n[Nota del programma: la riunione è chiusa.]")), FintaCassetta()).turno("chiudo")
        val m = db.messaggi().elenco()
        assertEquals("Ho proposto tre cose.", m.single { it.ruolo == Ruolo.SHELL }.testo)
        assertTrue(m.any { it.ruolo == Ruolo.NOTA && it.testo.contains("tolta") })
    }

    @Test fun leChiamateScritteComeTestoTornanoAlModelloUnaVolta() = runBlocking {
        val modello = FintoModello(testo("Propongo:\ncrea_evento(titolo='Scheda', inizio='2026-09-29')"),
            chiama("crea_evento", """{"titolo":"Scheda","inizio":"${LocalDate.now().plusDays(3)}","per":"adam"}"""), testo("Proposto l'evento."))
        val e = shell(modello, FintaCassetta()).turno("mettilo in calendario")
        assertTrue(contenuto(modello.ricevuti[1], modello.ricevuti[1].size - 1).contains("crea_evento come testo"))
        assertEquals(1, e.proposte.size)
        assertTrue(db.messaggi().elenco().none { it.ruolo == Ruolo.NOTA && it.testo.contains("come testo") })
    }

    @Test fun unaConsegnaSiPrendeSiLavoraESiChiudeGuardandoIlDocumento() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.ADAM, "Resonance", "", listOf("Fondo")))
        val prendi = FintoModello(chiama("prendi_consegna", """{"cosa":"Scheda del micro-asset","documento":"Scheda micro-asset","percorso":"Resonance","giorni":3}"""), testo("Proposta la consegna."))
        val e = shell(prendi, FintaCassetta()).turno("preparami la scheda nei prossimi giorni")
        shell(FintoModello(), FintaCassetta()).conferma(e.proposte.single())
        val c = db.consegne().aperte().single()
        assertEquals(LocalDate.now().plusDays(3).toString(), c.scadenza)
        assertTrue(Contesto.sistema(archivio.istantanea()).contains("LE TUE CONSEGNE APERTE"))
        // Troppo presto per il turno di lavoro; il giorno prima sì.
        assertTrue(Consegne.daLavorare(listOf(c), LocalDate.now()).isEmpty())
        assertEquals(1, Consegne.daLavorare(listOf(c), LocalDate.now().plusDays(2)).size)

        val lavora = FintoModello(chiama("salva_documento", """{"percorso":"Resonance","titolo":"Scheda micro-asset","testo":"Nicchia: planner per musicisti."}"""), testo("Pronta, da confermare."))
        val l = shell(lavora, FintaCassetta()).lavoraConsegna(c)
        assertTrue(contenuto(lavora.ricevuti[0], lavora.ricevuti[0].size - 1).contains("documento «Scheda micro-asset» nel percorso «Resonance»"))
        // Finché il Ghost non conferma, il documento non c'è e la consegna resta aperta.
        assertTrue(archivio.verificaConsegne().isEmpty())
        shell(FintoModello(), FintaCassetta()).conferma(l.proposte.single())
        assertEquals(StatoConsegna.MANTENUTA, db.consegne().elenco().single().stato)
        assertTrue(db.voci().elenco().any { it.pilastro == Pilastro.ADAM && it.fonte == "consegna" && it.testo.startsWith("Consegna dello Shell mantenuta") })
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.startsWith("Consegna dello Shell mantenuta") })
    }

    @Test fun leConsegneHannoUnTettoENonSiDoppiano() = runBlocking {
        val oggi = LocalDate.now()
        val aperte = (1..3).map { Consegna(cosa = "c$it", documento = "D$it", presa = oggi.toString(), scadenza = oggi.plusDays(2).toString(), creata = 0) }
        fun prova(args: String, r: Regole) = Azioni.valida("prendi_consegna", Json.parseToJsonElement(args).jsonObject, oggi, r)
        assertTrue(prova("""{"cosa":"x","documento":"D9","giorni":3}""", Regole(consegneAperte = aperte)) is Validazione.Rifiutata)
        assertTrue(prova("""{"cosa":"x","documento":"d1","giorni":3}""", Regole(consegneAperte = aperte.take(1))) is Validazione.Rifiutata)
        assertTrue(prova("""{"cosa":"x","documento":"D9","giorni":0}""", Regole()) is Validazione.Rifiutata)
        assertTrue(prova("""{"cosa":"x","documento":"D9","giorni":5}""", Regole()) is Validazione.Scrittura)
    }

    @Test fun unDocumentoSiTogliePerLoShellMaNonSiPerde() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.VIDYA, "Tributo", "", listOf("Gianna")))
        archivio.esegui(Proposta.SalvaDocumento("Tributo", "Scaletta vecchia", "1. Gianna"))
        archivio.esegui(Proposta.SalvaDocumento("Tributo", "Scaletta", "1. Gianna 2. Berta"))
        val m = FintoModello(chiama("togli_documento", """{"titolo":"scaletta vecchia","perche":"doppione"}"""), testo("Proposto."))
        val e = shell(m, FintaCassetta()).turno("togli la scaletta vecchia")
        shell(FintoModello(), FintaCassetta()).conferma(e.proposte.single())
        assertEquals(listOf("Scaletta"), db.percorsi().elencoDocumenti().map { it.titolo })
        assertTrue(!Contesto.sistema(archivio.istantanea()).contains("Scaletta vecchia"))
        assertTrue(db.voci().elenco().any { it.fonte == "documento" && it.testo.contains("«Scaletta vecchia» tolto") && it.testo.contains("doppione") })
        // Nella copia di sicurezza c'è ancora, e si rimette.
        assertTrue(archivio.copia().contains("Scaletta vecchia"))
        val tolto = db.percorsi().tuttiIDocumenti().single { it.tolto != null }
        archivio.rimettiDocumento(tolto)
        assertEquals(2, db.percorsi().elencoDocumenti().size)

        // Eliminare per sempre: solo un documento già tolto; se ne vanno testo e versioni, resta il titolo nel diario.
        val vivo = db.percorsi().elencoDocumenti().single { it.titolo == "Scaletta" }
        archivio.salvaTestoDocumento(vivo, "1. Gianna 2. Berta 3. Ahi Maria")
        assertTrue(archivio.eliminaDocumento(vivo).startsWith("Prima si toglie"))
        archivio.togliDocumento(db.percorsi().elencoDocumenti().single { it.titolo == "Scaletta" })
        val daEliminare = db.percorsi().tuttiIDocumenti().single { it.titolo == "Scaletta" }
        assertEquals("«Scaletta» eliminato per sempre", archivio.eliminaDocumento(daEliminare))
        assertTrue(db.percorsi().tuttiIDocumenti().none { it.titolo == "Scaletta" })
        assertTrue(db.versioni().elenco().none { it.entita == "documento" && it.idEntita == daEliminare.id })
        assertTrue(db.voci().elenco().any { it.testo == "Documento «Scaletta» eliminato per sempre dal Ghost (percorso «Tributo»)." })
        // Nessuno strumento dello Shell elimina: togli_documento toglie soltanto.
        assertTrue(Azioni.strumenti.none { it.nome.contains("elimina") })
    }

    // ── La lavagna del Ghost (seconda riunione del 26/09) ──

    @Test fun laListaSiScriveConConfermaESiSpuntaSenza() = runBlocking {
        val scrivi = FintoModello(chiama("scrivi_appunto", """{"titolo":"Spesa","righe":["latte","uova","fagioli cannellini"]}"""), testo("Proposta la lista."))
        val e = shell(scrivi, FintaCassetta()).turno("fammi la lista della spesa")
        assertTrue(db.lavagna().elenco().isEmpty())
        shell(FintoModello(), FintaCassetta()).conferma(e.proposte.single())
        assertEquals(3, Lavagna.righe(db.lavagna().elenco().single()).size)
        assertTrue(Contesto.sistema(archivio.istantanea()).contains("LAVAGNA DEL GHOST"))

        // Al supermercato: nessuna proposta, la spunta avviene e la ricevuta è in chat.
        val spunta = FintoModello(chiama("spunta_appunto", """{"appunto":"spesa","righe":["latte"]}"""), testo("Spuntato."))
        val s = shell(spunta, FintaCassetta()).turno("preso il latte")
        assertTrue(s.proposte.isEmpty())
        assertEquals(listOf(true, false, false), Lavagna.righe(db.lavagna().elenco().single()).map { it.fatta })
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.RICEVUTA && it.testo.startsWith("Spuntato in «Spesa»: latte. Restano 2") })

        // Togliere una riga che non c'è: il programma lo dice prima di proporre.
        val togli = FintoModello(chiama("modifica_appunto", """{"appunto":"Spesa","togli":["pane"]}"""), testo("Ok."))
        assertTrue(shell(togli, FintaCassetta()).turno("togli il pane").proposte.isEmpty())
        assertTrue(contenuto(togli.ricevuti[1], togli.ricevuti[1].size - 1).contains("non trovo con certezza «pane»"))
    }

    @Test fun lAllegatoSiRisolvePrimaEIlNomeProtettoNonEsce() = runBlocking {
        db.profilo().salva(it.resonance.adam.dati.Profilo(nomiProtetti = "PhysioAlba"))
        archivio.esegui(Proposta.ScriviAppunto("Spesa", listOf("latte", "uova"), LocalDate.now().plusDays(7).toString()))
        val mail = FintoModello(chiama("scrivi_mail", """{"oggetto":"Spesa","corpo":"Ecco la lista","allegato":"spesa"}"""), testo("Proposta."))
        val e = shell(mail, FintaCassetta()).turno("mandala a me in pdf")
        val p = archivio.proposta(db.messaggi().per(e.proposte.single())!!) as Proposta.ScriviMail
        assertEquals("Spesa", p.allegato)
        assertEquals("Spesa\n\n☐ latte\n☐ uova", p.allegatoTesto)
        assertTrue(p.descrizione().contains("con allegato «Spesa».pdf"))

        archivio.esegui(Proposta.CreaPercorso(Pilastro.ADAM, "Lavoro", "", listOf("x")))
        archivio.esegui(Proposta.SalvaDocumento("Lavoro", "Biglietto", "Studio PhysioAlba, via Roma"))
        val protetto = FintoModello(chiama("scrivi_mail", """{"oggetto":"Biglietto","corpo":"In allegato","allegato":"Biglietto"}"""), testo("Ok."))
        assertTrue(shell(protetto, FintaCassetta()).turno("allegalo").proposte.isEmpty())
        assertTrue(contenuto(protetto.ricevuti[1], protetto.ricevuti[1].size - 1).contains("non fa uscire"))
    }

    @Test fun unaPropostaAnnunciataMaNonCreataTornaAlModelloEPoiSiSegnalaColMotivo() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.BIO, "Alimentazione", "", listOf("x")))
        archivio.esegui(Proposta.SalvaDocumento("Alimentazione", "Piano", "Lunedì: 200g petto di pollo.\nVenerdì: 200g petto di pollo."))
        // L'ancora compare due volte: il programma ferma la modifica; il modello dice lo stesso che c'è il pulsante.
        val m = FintoModello(
            chiama("modifica_documento", """{"documento":"Piano","ancora":"200g petto di pollo","testo":"200g coscio"}"""),
            testo("Proposta in attesa: sostituisco il petto. Conferma col pulsante sotto."),
            testo("Proposta in attesa, conferma col pulsante sotto."))
        val e = shell(m, FintaCassetta()).turno("sostituisci il petto con il coscio")
        assertTrue(e.proposte.isEmpty())
        assertTrue(contenuto(m.ricevuti[2], m.ricevuti[2].size - 1).contains("non ne hai creata nessuna"))
        val nota = db.messaggi().elenco().last { it.ruolo == Ruolo.NOTA }.testo
        assertTrue(nota, nota.startsWith("Lo Shell parla di una proposta da confermare, ma non ne ha creata nessuna") && nota.contains("modifica_documento"))
        // Il turno resta registrato con i suoi gesti: si vede in Regolazione perché il pulsante non c'è.
        val t = db.turni().ultimi(1).single().strumenti
        assertTrue(t, t.startsWith("modifica_documento fermato (") && t.contains("proposta annunciata senza crearla"))
        shell(FintoModello(testo("Ciao.")), FintaCassetta()).turno("ciao")
        assertTrue(db.turni().ultimi(1).single().strumenti.startsWith("nessuno strumento; prompt "))
    }

    @Test fun unaConsegnaDettaMaNonPropostaTornaAlModelloEPoiSiSegnala() = runBlocking {
        archivio.esegui(Proposta.CreaPercorso(Pilastro.ADAM, "Resonance", "", listOf("x")))
        // Prima volta: il programma lo rimanda al modello, che questa volta la propone davvero.
        val m = FintoModello(testo("Consegna presa: il documento entro 3 giorni."),
            chiama("prendi_consegna", """{"cosa":"Sintesi","documento":"Occhi e orecchie di Adam","percorso":"Resonance","giorni":3}"""), testo("Proposta."))
        val e = shell(m, FintaCassetta()).turno("prendi la consegna")
        assertTrue(contenuto(m.ricevuti[1], m.ricevuti[1].size - 1).contains("non l'hai proposta"))
        assertEquals(1, e.proposte.size)
        // Se insiste senza proporla, resta una nota per il Ghost.
        shell(FintoModello(testo("Prendo in carico la consegna."), testo("Consegna presa, davvero.")), FintaCassetta()).turno("ok")
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.startsWith("Lo Shell dice di aver preso una consegna") })
    }

    @Test fun lEtichettaDellArchitettoScrittaDalloShellSiToglie() = runBlocking {
        shell(FintoModello(testo("[L'architetto (Claude Code), non il Ghost] Ricevuto.")), FintaCassetta()).turno("effetto")
        assertEquals("Ricevuto.", db.messaggi().elenco().single { it.ruolo == Ruolo.SHELL }.testo)
    }

    @Test fun nelVerbaleGliIndirizziNonEscono() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        shell(FintoModello(testo("La mando a marta.x85@gmail.com, va bene?")), cassetta).turno("mandala a mia moglie")
        val shellMd = cassetta.file.entries.single { it.key.endsWith("-shell.md") }.value
        assertEquals("La mando a [indirizzo], va bene?", shellMd)
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

    // ── Il consulente esterno e Balthasar (riunione del 27/09/2026) ──

    private fun web(t: String, vararg domini: String) =
        RispostaWeb(t, domini.map { d -> it.resonance.adam.logica.Consulente.Fonte("https://$d/p", "", d) }, 0.01, false)

    @Test fun leDomandeDiTuttiETrePartonoInUnaChiamataSolaSenzaAdam() = runBlocking {
        assumeTrue("solo nell'app di sviluppo", it.resonance.adam.logica.Edizione.sviluppatore)
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        db.profilo().salva(it.resonance.adam.dati.Profilo(nome = "Flavio", nomiProtetti = "PhysioAlba"))
        val tavolo = Tavolo(archivio, imp, cassetta)
        // Fuori dalla stanza non si fa niente, né dal Ghost né dallo Shell.
        assertTrue(tavolo.aggiungiDomanda("Ghost", "Quanto costa?")!!.contains("non è nella stanza"))
        tavolo.convoca()
        assertEquals(null, tavolo.aggiungiDomanda("Ghost", "Quanto costa la Fury? Scrivimi a mario.rossi@gmail.com"))
        assertTrue(tavolo.aggiungiDomanda("Ghost", "quanto costa la fury? scrivimi a mario.rossi@gmail.com")!!.contains("già in cartella"))
        // Lo Shell con lo strumento: niente conferma, finisce in cartella.
        val modello = FintoModello(chiama("chiedi_consulente", """{"domanda":"Il kit Meta supporta i Gen 3 per PhysioAlba?"}"""), testo("Messa in cartella."))
        shell(modello, cassetta).turno("chiediglielo tu")
        assertTrue(modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.startsWith("Domanda in cartella"))
        // L'architetto dal verbale: due domande in un intervento.
        cassetta.file["$cartella/20990101-000001-000-architetto.md"] = "→ Consulente\n- Prezzo in Italia?\n- Data degli Android XR?"
        tavolo.ritira()
        assertEquals(listOf("Ghost", "shell", "architetto", "architetto"), tavolo.domande().map { it.autore })

        val m = FintoModello().apply { ricerche += web("1. · 299 dollari\n2. · non nominati\n3. · non trovato\n4. · autunno", "meta.com", "9to5google.com") }
        shell(m, cassetta).consulta()
        assertEquals(1, m.cercati.size)
        val (inviati, conWeb) = m.cercati.single()
        assertTrue(conWeb)
        val tutto = inviati.toString()
        // Vede solo le domande: non il prompt di Adam, non il nome protetto, non l'indirizzo.
        assertEquals(2, inviati.size)
        assertTrue(tutto, !tutto.contains("Sei lo Shell") && !tutto.contains("PhysioAlba") && !tutto.contains("mario.rossi"))
        assertTrue(tutto, tutto.contains("[nome protetto]") && tutto.contains("[indirizzo]") && tutto.contains("4. Data degli Android XR?"))
        val scheda = db.messaggi().elenco().single { it.ruolo == Ruolo.CONSULENTE }.testo
        assertTrue(scheda, scheda.contains("Fonti trovate davvero (2)") && scheda.contains("3. [architetto] Prezzo in Italia?"))
        assertTrue(cassetta.file.entries.single { it.key.endsWith("-consulente.md") }.value == scheda)
        assertEquals(emptyList<Any>(), tavolo.domande())
        assertEquals(1, imp.consulenteInvii)
        // Il turno dopo, lo Shell lo vede con la sua etichetta.
        val dopo = FintoModello(testo("Letto."))
        shell(dopo, cassetta).turno("che ne dici?")
        assertTrue(dopo.ricevuti.single().toString().contains("[Il consulente esterno"))
    }

    @Test fun aiPuntiMancantiSiTornaUnaVoltaSenzaUnAltraRicercaPoiLaRinunciaResta() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val tavolo = Tavolo(archivio, imp, cassetta)
        tavolo.convoca()
        listOf("uno?", "due?", "tre?").forEach { tavolo.aggiungiDomanda("Ghost", it) }
        val m = FintoModello().apply { ricerche += web("1. · a", "a.it"); ricerche += web("2. · b") }
        shell(m, cassetta).consulta()
        assertEquals(listOf(true, false), m.cercati.map { it.second })
        assertTrue(m.cercati[1].first.last().toString().contains("mancano i punti 2, 3"))
        val scheda = db.messaggi().elenco().single { it.ruolo == Ruolo.CONSULENTE }.testo
        assertTrue(scheda, scheda.contains("2. · b") && scheda.contains("(Senza risposta ai punti 3"))
    }

    @Test fun ilTettoFermaGliInviiEIlGhostLoAlza() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val tavolo = Tavolo(archivio, imp, cassetta)
        tavolo.convoca()
        tavolo.aggiungiDomanda("Ghost", "uno?")
        imp.consulenteInvii = imp.consulenteTetto
        val m = FintoModello()
        assertTrue(shell(m, cassetta).consulta().testo.startsWith("Tetto di invii raggiunto"))
        assertEquals(0, m.cercati.size)
        tavolo.alzaTetto()
        m.ricerche += web("1. · sì", "a.it")
        shell(m, cassetta).consulta()
        assertEquals(1, m.cercati.size)
    }

    @Test fun congedatoRiconvocatoRiprendeSoloIlSuoFiloEChiusoSiAzzera() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val tavolo = Tavolo(archivio, imp, cassetta)
        tavolo.convoca()
        tavolo.aggiungiDomanda("Ghost", "primo giro?")
        val m = FintoModello().apply { ricerche += web("1. · risposta uno", "a.it"); ricerche += web("1. · risposta due", "a.it") }
        shell(m, cassetta).consulta()
        tavolo.aggiungiDomanda("Ghost", "mai mandata?")
        tavolo.congeda()
        // Le domande non mandate non spariscono in silenzio.
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.NOTA && it.testo.contains("Domande non mandate: [Ghost] mai mandata?") })
        tavolo.convoca()
        tavolo.aggiungiDomanda("Ghost", "secondo giro?")
        shell(m, cassetta).consulta()
        val secondo = m.cercati[1].first.toString()
        assertTrue(secondo, secondo.contains("primo giro?") && secondo.contains("risposta uno") && !secondo.contains("mai mandata?"))
        // La chiusura della riunione azzera tutto.
        shell(FintoModello(testo("Decisioni\n- a\nQuestioni aperte\n- b\nChi fa cosa\n- c")), cassetta).chiudiRiunione()
        assertTrue(!imp.consulente && imp.consulenteInvii == 0 && imp.consulenteStoria.isEmpty() && imp.consulenteDomande.isEmpty())
    }

    @Test fun balthasarParlaSenzaStrumentiAllaDoseSceltaEConLaSuaEtichetta() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val m = FintoModello(testo("· E se gli occhiali fossero di Marta?\n· Il kit si prova prima di comprare."))
        shell(m, cassetta).balthasar("Quali occhiali compro?", it.resonance.adam.logica.Balthasar.Intensita.PROFONDA)
        assertEquals(listOf<Double?>(1.0), m.temperature)
        assertEquals(listOf(false), m.conStrumenti)
        val ultimo = m.ricevuti.single().last().jsonObject["content"]!!.jsonPrimitive.content
        assertTrue(ultimo, ultimo.contains("BALTHASAR") && ultimo.contains("«Quali occhiali compro?»") && ultimo.contains("profonda"))
        val b = db.messaggi().elenco().single { it.ruolo == Ruolo.BALTHASAR }
        assertEquals("intensità profonda", b.motore)
        assertTrue(cassetta.file.entries.single { it.key.endsWith("-balthasar.md") }.value.startsWith("Perturbazione (profonda) su: «Quali occhiali compro?»"))
        assertTrue(db.turni().ultimi(10).any { it.compito == "BALTHASAR" && it.temperatura == 1.0 })
        // Il turno normale dopo non lo confonde con sé stesso.
        val dopo = FintoModello(testo("Ci penso."))
        shell(dopo, cassetta).turno("e allora?")
        assertTrue(dopo.ricevuti.single().toString().contains("[Balthasar: la perturbazione chiesta dal Ghost"))
    }

    // ── Riunione del 01/10/2026: verbale dai file, punti fermi, chi risponde, Balthasar interrogato ──

    @Test fun ilVerbaleSiScriveDaTuttiIFileNonDagliUltimiMessaggi() = runBlocking {
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        cassetta.file["$cartella/20990101-083000-000-ghost.md"] = "Primo punto della mattina: l'assenza."
        cassetta.file["$cartella/20990101-083100-000-architetto.md"] = "Il tasto Sono via."
        cassetta.file["$cartella/20990101-180000-000-shell.md"] = "Ultimo punto della sera."
        val modello = FintoModello(testo("Decisioni\n- a\nQuestioni aperte\n- b\nChi fa cosa\n- c"))
        shell(modello, cassetta).chiudiRiunione()
        val inviato = modello.ricevuti.single().toString()
        assertTrue(inviato, inviato.contains("Trascrizione completa") && inviato.contains("[08.30 Ghost] Primo punto della mattina") && inviato.contains("[08.31 Architetto] Il tasto Sono via"))
    }

    @Test fun iPuntiFermiSiRegistranoSenzaConfermaERestanoDavanti() = runBlocking {
        assumeTrue("solo nell'app di sviluppo", it.resonance.adam.logica.Edizione.sviluppatore)
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val modello = FintoModello(chiama("punto_fermo", """{"testo":"La cena si decide sulla cottura: decide chi cucina"}"""), testo("Registrato."), testo("Ok."))
        val sh = shell(modello, cassetta)
        assertTrue(sh.turno("deciso").proposte.isEmpty())
        assertEquals(listOf("La cena si decide sulla cottura: decide chi cucina"), Tavolo(archivio, imp, cassetta).puntiFermi())
        assertTrue(cassetta.file.values.any { it == "Punto fermo: La cena si decide sulla cottura: decide chi cucina" })
        sh.turno("e allora?")
        assertTrue(contenuto(modello.ricevuti[2], 0).contains("1. La cena si decide sulla cottura"))
        // Un doppione no; alla chiusura si azzerano.
        assertTrue(Tavolo(archivio, imp, cassetta).aggiungiPunto("la cena si decide sulla cottura: decide chi cucina")!!.contains("già"))
        shell(FintoModello(testo("Decisioni\n- a\nQuestioni aperte\n- b\nChi fa cosa\n- c")), cassetta).chiudiRiunione()
        assertEquals("", imp.riunionePunti)
    }

    @Test fun unMessaggioPerLArchitettoVaNelVerbaleSenzaChiamareLoShell() = runBlocking {
        val cassetta = FintaCassetta()
        riunioneAperta(cassetta)
        val modello = FintoModello()
        val sh = shell(modello, cassetta)
        sh.soloAlVerbale(sh.registra("architetto, spiegami le stanze"))
        assertTrue(modello.ricevuti.isEmpty())
        assertTrue(cassetta.file.entries.any { it.key.endsWith("-ghost.md") && it.value == "architetto, spiegami le stanze" })
        assertTrue(Tavolo.chiamaShell("Ciao a tutti"))
        assertTrue(!Tavolo.chiamaShell("Architetto, cosa ne pensi?"))
        assertTrue(!Tavolo.chiamaShell("code spiegami meglio"))
        assertTrue(Tavolo.chiamaShell("Architetto e Shell, cosa ne pensate?"))
        assertTrue(Tavolo.chiamaShell("architetto, rispondete entrambi"))
        assertTrue(!Tavolo.chiamaShell("mi sta bene", rispostaAllArchitetto = true))
        assertTrue(Tavolo.chiamaShell("mi sta bene, ma sentiamo anche lo Shell", rispostaAllArchitetto = true))
        // «codice» non è «code».
        assertTrue(Tavolo.chiamaShell("codice nuovo per la lavagna?"))
    }

    @Test fun lArchitettoInterrogaBalthasarConLaFrecciaEIGiriContano() = runBlocking {
        val cassetta = FintaCassetta()
        val cartella = riunioneAperta(cassetta)
        val tavolo = Tavolo(archivio, imp, cassetta)
        cassetta.file["$cartella/20990101-000001-000-architetto.md"] = "→ Balthasar: come rendere Adam City reale con due Adam?"
        val r = tavolo.ritira()
        assertEquals("come rendere Adam City reale con due Adam?", r.perBalthasar)
        assertEquals(null, r.allaShell)
        assertEquals("A Balthasar: come rendere Adam City reale con due Adam?", Tavolo.leggibile(r.nuovi.single().testo))
        val m = FintoModello(testo("· Partire dalla cena del martedì."))
        shell(m, cassetta).balthasar(r.perBalthasar!!, it.resonance.adam.logica.Balthasar.Intensita.MEDIA, daArchitetto = true)
        assertTrue(m.ricevuti.single().last().toString().contains("L'architetto ti interroga come Balthasar"))
        assertTrue(cassetta.file.values.any { it.startsWith("Risposta all'architetto (media)") })
        // Tre giri senza il Ghost, contando anche quelli a Balthasar: il quarto non parte.
        (2..4).forEach { n -> cassetta.file["$cartella/20990101-00000$n-000-architetto.md"] = "→ Balthasar\nAncora $n?" ; tavolo.ritira() }
        cassetta.file["$cartella/20990101-000009-000-architetto.md"] = "→ Balthasar\nUltima?"
        assertEquals(null, tavolo.ritira().perBalthasar)
    }

    @Test fun ilTaccuinoVuoleIlTipoEloScriveDavanti() = runBlocking {
        val v = Azioni.valida("scrivi_taccuino", Json.parseToJsonElement("""{"testo":"cifratura DZ 25x"}""").jsonObject, LocalDate.now())
        assertTrue(v is Validazione.Rifiutata)
        val modello = FintoModello(chiama("scrivi_taccuino", """{"testo":"cifratura DZ 25x","tipo":"esempio"}"""), testo("Annotato."))
        Shell(archivio, imp, modello, FintoMondo()).turno("ricordalo come esempio")
        assertEquals("[esempio] cifratura DZ 25x", db.taccuino().elenco().single().testo)
    }

    // La ricerca web (02/10/2026): lo Shell la usa nel turno, il programma pretende fonti e data, il Ghost la vede in chat.
    @Test fun loShellCercaNelWebConLeFontiDelMotoreEIlGhostLeVede() = runBlocking {
        db.profilo().salva(it.resonance.adam.dati.Profilo(nome = "Flavio", nomiProtetti = "PhysioAlba"))
        val m = FintoModello(chiama("cerca_nel_web", """{"domanda":"Quotazione Gazprom oggi, per PhysioAlba"}"""), testo("Gazprom ha chiuso a 128,4 rubli il 1 ottobre."))
        m.ricerche += web("Dati al: 1 ottobre 2026\n- Gazprom | MOEX | 128,4 RUB (−1,2%) alla chiusura del 1 ottobre [1][2]\nLettura: in calo da tre giorni.", "moex.com", "investing.com")
        shell(m, FintaCassetta()).turno("com'è andata oggi Gazprom?")
        // Al motore va la domanda con la forma, non il prompt di Adam né il nome protetto.
        val inviati = m.aFondo.single().toString()
        assertTrue(inviati, inviati.contains(it.resonance.adam.logica.Ricerca.DATA) && !inviati.contains("PhysioAlba") && !inviati.contains("Sei lo Shell di Resonance"))
        // Il Ghost vede la ricerca con le fonti vere, senza avvisi.
        val r = db.messaggi().elenco().single { it.ruolo == Ruolo.RICERCA }.testo
        assertTrue(r, r.contains("Fonti (dal motore di ricerca)") && r.contains("moex.com") && !r.contains("⚠"))
        // Il modello riceve la stessa scheda come risultato dello strumento.
        assertTrue(m.ricevuti[1].last().toString().contains("128,4 RUB"))
    }

    @Test fun unaRicercaSenzaFontiNeDataSiSegnalaNonSiNasconde() = runBlocking {
        val m = FintoModello()
        m.ricerche += web("Gazprom è a circa 130 rubli.")
        val t = shell(m, FintaCassetta()).cercaNelWeb("quotazione Gazprom")
        assertTrue(t.problemi.toString(), t.problemi.any { it.contains("non ha restituito fonti") } && t.problemi.any { it.contains("di quando") })
        assertTrue(db.messaggi().elenco().single { it.ruolo == Ruolo.RICERCA }.testo.contains("⚠"))
    }

    // Segui: la proposta, la prima lettura in chat, una al giorno, il resoconto che si presenta da solo.
    @Test fun seguireUnaCosaPerQualcheGiorno() = runBlocking {
        val oggi = LocalDate.now()
        val m = FintoModello(chiama("segui", """{"cosa":"Gazprom in borsa","domanda":"prezzo di chiusura di Gazprom","giorni":3,"prima":"andamento ultimo anno, mese e settimana"}"""), testo("Proposto."))
        val s = shell(m, FintaCassetta())
        s.turno("seguimi Gazprom per tre giorni")
        val proposta = db.messaggi().elenco().single { it.ruolo == Ruolo.PROPOSTA }
        assertTrue(proposta.testo.contains("Seguire «Gazprom in borsa» per 3 giorni"))
        assertTrue(s.conferma(proposta.id).contains("Segui «Gazprom in borsa»"))
        val o = db.segui().elenco().single()
        assertEquals(oggi.plusDays(2).toString(), o.fine)
        // La prima lettura chiede anche lo sguardo indietro, e compare in chat.
        m.ricerche += web("Dati al: oggi\nGazprom 128 RUB; un anno fa 160.", "moex.com")
        assertEquals(1, s.seguiDovute(oggi, inChat = true).size)
        assertTrue(m.aFondo.last().toString().contains("andamento ultimo anno"))
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.RICERCA && it.testo.startsWith("Segui · Gazprom in borsa · giorno 1 di 3") })
        // Lo stesso giorno non si rilegge; il giorno dopo sì, senza lo sguardo indietro.
        assertTrue(s.seguiDovute(oggi).isEmpty())
        m.ricerche += web("Dati al: domani\nGazprom 127 RUB.", "moex.com")
        assertEquals(1, s.seguiDovute(oggi.plusDays(1)).size)
        assertTrue(!m.aFondo.last().toString().contains("andamento ultimo anno"))
        // Lo Shell lo vede nel prompt.
        assertTrue(Contesto.sistema(archivio.istantanea(oggi.plusDays(1))).contains("Gazprom in borsa (giorno 2 di 3"))
        // Finito il periodo: resoconto dalle sole letture, nel diario, in chat, e da vedere sullo Specchio.
        val r = FintoModello(testo("Dal 128 al 127: in lieve calo."))
        assertEquals(1, shell(r, FintaCassetta()).chiudiSeguite(oggi.plusDays(3)).size)
        assertTrue(r.ricevuti.single().toString().contains("Gazprom 127 RUB"))
        val chiusa = db.segui().elenco().single()
        assertTrue(chiusa.chiusa != null && !chiusa.visto && chiusa.resoconto.contains("lieve calo"))
        assertTrue(db.voci().elenco().any { it.fonte == "segui" && it.testo.contains("lieve calo") })
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.RICERCA && it.testo.startsWith("Resoconto · Gazprom in borsa") })
        // Finché non è visto, lo Shell sa che deve dirlo; dopo no.
        assertTrue(Contesto.sistema(archivio.istantanea(oggi.plusDays(3))).contains("RESOCONTO NON ANCORA VISTO"))
        archivio.resocontoVisto(chiusa.id)
        assertTrue(!Contesto.sistema(archivio.istantanea(oggi.plusDays(3))).contains("RESOCONTO NON ANCORA VISTO"))
    }

    // La ricerca a fondo (02/10/2026): la propone lo Shell con la stima del programma; autorizzata, il programma cerca per
    // tipo di fonte, classifica, incrocia; il modello scrive le affermazioni; in chat il costo reale accanto alla stima.
    @Test fun laRicercaAFondoSiProponeSiAutorizzaESiIncrocia() = runBlocking {
        val m = FintoModello(chiama("ricerca_a_fondo", """{"domanda":"Quanti trichechi a Crystal River quest'anno?","sotto":["ufficiale: censimento dei lamantini a Crystal River 2026","forum: avvistamenti di lamantini a Crystal River nel 2026"]}"""),
            testo("Proposta la ricerca a fondo."))
        val s = shell(m, FintaCassetta())
        s.turno("quanti trichechi ci sono a Crystal River?")
        val proposta = db.messaggi().elenco().single { it.ruolo == Ruolo.PROPOSTA }
        assertTrue(proposta.testo, proposta.testo.contains("Ricerca a fondo") && proposta.testo.contains("Costo stimato dal programma") && proposta.testo.contains("centesimi"))
        // Una per volta: una seconda proposta uguale non passa finché la prima aspetta.
        assertTrue(s.conferma(proposta.id).contains("autorizzata"))
        val sintesi = FintoModello(testo("- Il censimento conta 1.100 lamantini nel 2026 [1, 2]\n- Molti avvistamenti a gennaio [3]\n- Una cosa inventata [8]\nSintesi: dato ufficiale solido, testimonianze coerenti."))
        sintesi.perDomanda = { d -> if ("avvistamenti" in d) web("Dati al: settembre 2026\nSu Reddit molti avvistamenti a gennaio.", "reddit.com")
            else web("Dati al: marzo 2026\nCensimento: 1.100 lamantini a Crystal River.", "fws.gov", "myfwc.com") }
        val scheda = shell(sintesi, FintaCassetta()).ricercaAFondo(archivio.proposta(proposta) as Proposta.RicercaAFondo)
        // Due ricerche mirate, ciascuna col suo tipo di fonte, col modello degli strati (Perplexity Pro, scelto dal programma).
        assertEquals(2, sintesi.aFondo.size)
        assertTrue(sintesi.aFondo.any { it.toString().contains("forum") })
        assertEquals(listOf(Impostazioni.MODELLO_A_FONDO, Impostazioni.MODELLO_A_FONDO), sintesi.modelliRicerca)
        // L'incrocio lo fa il principale, che non cerca di nuovo.
        assertTrue(sintesi.modelli.single() != Impostazioni.MODELLO_A_FONDO)
        assertTrue(scheda, scheda.contains("✓ dati ufficiali: 2 fonti") && scheda.contains("✓ forum e thread: 1 fonti"))
        // Il modello della sintesi riceve le fonti col livello deciso dal programma.
        assertTrue(sintesi.ricevuti.single().toString().contains("[1] A · fws.gov"))
        assertTrue(scheda, scheda.contains("2 fonti indipendenti · migliore A") && scheda.contains("1 sola fonte · C") && scheda.contains("⚠ nessuna fonte"))
        assertTrue(scheda, scheda.contains("Dove non ho potuto guardare") && scheda.contains("Costo: stimato") && scheda.contains("reale"))
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.RICERCA && it.testo.startsWith("Ricerca a fondo") })
    }

    // Il 02/10: cinque strati falliti, la scheda diceva solo «nessuna fonte trovata» e «reale 0,0». Ora ogni strato si
    // ritenta una volta, e il motivo resta scritto.
    @Test fun unaRicercaAFondoCheNonRiesceDiceIlPerche() = runBlocking {
        val m = FintoModello()
        m.perDomanda = { throw ErroreModello("HTTP 400: context length exceeded") }
        val p = Proposta.RicercaAFondo("Ford Mustang disponibili?", listOf("annunci: Mustang usate in Italia", "forum: Mustang opinioni"), "2–5 centesimi di dollaro")
        val scheda = shell(m, FintaCassetta()).ricercaAFondo(p)
        assertEquals(4, m.aFondo.size)
        assertTrue(scheda, scheda.contains("non sono riuscite") && scheda.contains("✗ annunci e mercato: non riuscita") && scheda.contains("context length exceeded"))
        assertTrue(scheda, !scheda.contains("Nessuna fonte trovata") && !scheda.contains("Dove non ho potuto guardare"))
        val t = db.turni().ultimi(20).single { it.strumenti.startsWith("ricerca a fondo:") }
        assertTrue(t.strumenti, t.errore && t.strumenti.contains("non riusciti") && t.strumenti.contains("context length"))
    }

    // Gli avvisi sulla forma non sono guasti: lo Shell li riceve come avvisi, e solo il fallimento si chiama errore.
    @Test fun unAvvisoNonSiPresentaComeErrore() = runBlocking {
        val m = FintoModello()
        m.ricerche += web("Il ristorante Da Mario è aperto a pranzo.", "tripadvisor.it")
        val t = shell(m, FintaCassetta()).cercaNelWeb("ristorante Da Mario orari")
        assertTrue(t.perIlModello, t.perIlModello.startsWith("Ricerca riuscita") && t.perIlModello.contains("NON sono errori tecnici") &&
            t.perIlModello.contains("non dice di quando"))
        assertTrue(Shell.Trovato("", emptyList(), listOf("HTTP 500"), 0.0).perIlModello.startsWith("Ricerca NON riuscita"))
        assertEquals(Impostazioni.MODELLO_RICERCA, m.modelliRicerca.single())
    }

    // Una zona, una domanda per paese (02/10/2026, sera): una domanda sola su cinque città trovava solo la prima.
    @Test fun piuDomandeInsiemeUnaSchedaSola() = runBlocking {
        val m = FintoModello(chiama("cerca_nel_web", """{"domanda":"trattorie a Bracciano","domande":["trattorie a Tolfa","trattorie a Manziana","trattorie a Bracciano"]}"""), testo("- Da Peppe, Bracciano"))
        m.perDomanda = { d -> web("Dati al: 2 ottobre 2026\n- " + (if ("Tolfa" in d) "La Lestra | Tolfa" else if ("Manziana" in d) "Il Pozzo | Manziana" else "Da Peppe | Bracciano") + " | 4,5/5 [1]", "tripadvisor.it") }
        shell(m, FintaCassetta()).turno("trattorie entro mezz'ora da qui")
        // Tre ricerche (il doppione no), una scheda sola in chat, e lo Shell le riceve tutte.
        assertEquals(3, m.aFondo.size)
        val r = db.messaggi().elenco().single { it.ruolo == Ruolo.RICERCA }.testo
        assertEquals("3 ricerche · 3 elementi, 0 confermati da più fonti", it.resonance.adam.logica.Ricerca.riassunto(r))
        val alModello = m.ricevuti[1].last().toString()
        assertTrue(alModello, alModello.contains("La Lestra") && alModello.contains("Il Pozzo") && alModello.contains("Da Peppe"))
    }

    // Lo Shell più leggero (02/10/2026): un turno semplice ha il nucleo; un reparto si apre su richiesta o usandone uno strumento.
    @Test fun iRepartiSiApronoQuandoServono() = runBlocking {
        val m = FintoModello(
            chiama(it.resonance.adam.logica.Reparto.APRI, """{"reparto":"lavagna"}"""),
            chiama("crea_evento", """{"titolo":"Dentista","inizio":"${LocalDate.now().plusDays(1)}T10:00","per":"personale"}"""),
            testo("Proposti."))
        shell(m, FintaCassetta()).turno("oggi peso 82")
        // Al primo giro: il nucleo e l'indice, niente lavagna né calendario.
        assertTrue(m.nomiStrumenti[0].toString(), "registra_misura" in m.nomiStrumenti[0] && "scrivi_appunto" !in m.nomiStrumenti[0] && "crea_evento" !in m.nomiStrumenti[0])
        assertTrue(contenuto(m.ricevuti[0], 0).contains("REPARTI CHIUSI"))
        // Aperta la lavagna: i suoi strumenti e la sua regola.
        assertTrue("scrivi_appunto" in m.nomiStrumenti[1] && contenuto(m.ricevuti[1], 0).contains("Le cose usa e getta del Ghost"))
        // Uno strumento dell'indice chiamato senza aprire: il programma lo accetta e apre il suo reparto.
        assertTrue(db.messaggi().elenco().any { it.ruolo == Ruolo.PROPOSTA && it.testo.contains("Dentista") })
        assertTrue("crea_evento" in m.nomiStrumenti[2])
        val t = db.turni().ultimi(1).single().strumenti
        assertTrue(t, t.contains("aperto il reparto lavagna") && t.contains("prompt ") && t.contains("strumenti (nucleo"))
    }

    // L'incrocio (02/10/2026, notte): le caselle e la mappa, lo stesso posto riconosciuto in fonti diverse, in cima il più confermato.
    private class FintoOsm(val luoghi: List<it.resonance.adam.logica.Mappa.Luogo>, val errore: String? = null) : Osm() {
        val chiesti = mutableListOf<Triple<String, Int, List<it.resonance.adam.logica.Mappa.Filtro>>>()
        override suspend fun cerca(vicinoA: String, km: Int, filtri: List<it.resonance.adam.logica.Mappa.Filtro>): Risposta {
            chiesti += Triple(vicinoA, km, filtri); return Risposta(luoghi, errore)
        }
    }

    @Test fun laRicercaIncrociaLeCaselleELaMappa() = runBlocking {
        val m = FintoModello(chiama("cerca_nel_web", """{"domanda":"recensioni ristoranti eritrei vicino a Canale Monterano","domande":["forum ristoranti eritrei Roma nord"],
            "vicino_a":"Canale Monterano","km":40,"osm":["amenity=restaurant","cuisine=eritrean|ethiopian"]}"""), testo("- Asmara, Bracciano: 3 fonti"))
        m.perDomanda = { d -> if ("forum" in d) web("Dati al: 1 ottobre 2026\n- Ristorante Asmara | Bracciano | «injera come ad Asmara» [1]", "reddit.com")
            else web("Dati al: 2 ottobre 2026\n- Asmara | Bracciano | 4,7/5 su 210 recensioni [1]\n- Sapori d'Africa | Viterbo | 4,1/5 [1]", "tripadvisor.it") }
        val osm = FintoOsm(listOf(it.resonance.adam.logica.Mappa.Luogo("Asmara", "Bracciano", 8.0, "eritrean", "https://www.openstreetmap.org/node/1"),
            it.resonance.adam.logica.Mappa.Luogo("Addis", "Anguillara", 15.0, "ethiopian", "https://www.openstreetmap.org/node/2")))
        Shell(archivio, imp, m, FintoMondo(), FintaCassetta(), osm).turno("ristoranti eritrei entro un'ora da qui")
        // Alla mappa va il paese e i filtri, nient'altro.
        assertEquals("Canale Monterano", osm.chiesti.single().first)
        assertEquals(listOf("amenity", "cuisine"), osm.chiesti.single().third.map { it.chiave })
        val r = db.messaggi().elenco().single { it.ruolo == Ruolo.RICERCA }.testo
        assertEquals("3 ricerche · 2 elementi, 1 confermati da più fonti; 2 sulla mappa", it.resonance.adam.logica.Ricerca.riassunto(r))
        // Lo Shell riceve l'incrocio: Asmara in cima con tre fonti (recensioni, forum, mappa); Addis solo sulla mappa.
        val alModello = m.ricevuti[1].last().toString()
        assertTrue(alModello, alModello.contains("1. Asmara — Bracciano") && alModello.contains("3 fonti indipendenti") && alModello.contains("Sulla mappa, senza nessuna fonte sul web: 1 (Addis, Anguillara)"))
        assertTrue(alModello, alModello.indexOf("Asmara") < alModello.indexOf("Sapori d'Africa"))
    }

    @Test fun unFiltroDellaMappaSbagliatoTornaAlModello() = runBlocking {
        val m = FintoModello(chiama("cerca_nel_web", """{"domanda":"ristoranti","vicino_a":"Tolfa","osm":["ristoranti etnici"]}"""), testo("Riprovo."))
        Shell(archivio, imp, m, FintoMondo(), FintaCassetta(), FintoOsm(emptyList())).turno("ristoranti")
        assertTrue(m.ricevuti[1].last().toString().contains("Ricerca non fatta: osm: filtri nella forma di OpenStreetMap"))
        assertTrue(m.aFondo.isEmpty())
    }

    // «Dove trovo X» (05/10/2026): le pagine vere del Salotto Belvedere. La carta non è collegata da nessuna pagina: il
    // programma la trova dalla sitemap. Il Salotto sulla mappa non ha sito: lo trova la ricerca di indirizzi.
    private class FintoLettore(val pagine: Map<String, String>) : Lettore {
        val letti = mutableListOf<String>()
        override suspend fun leggi(url: String): Lettore.Pagina {
            synchronized(this) { letti += url }
            val nome = pagine[url] ?: return Lettore.Pagina(url, errore = "HTTP 404")
            if (nome.startsWith("testo:")) return Lettore.Pagina(url, "Osteria", nome.removePrefix("testo:"))
            return Lettore.interpreta(javaClass.getResource("/pagine/$nome.json")!!.readText())!!
        }
    }

    private val SALOTTO = mapOf(
        "https://salottobelvedere.it/" to "salotto-casa", "https://salottobelvedere.it/251807-2/" to "salotto-menu",
        "https://salottobelvedere.it/il-menu/" to "salotto-menu", "https://salottobelvedere.it/robots.txt" to "salotto-robots",
        "https://salottobelvedere.it/sitemap_index.xml" to "salotto-sitemap-indice", "https://salottobelvedere.it/post-sitemap.xml" to "salotto-sitemap-post",
        "https://salottobelvedere.it/carta-vini/" to "salotto-carta-vini",
        "https://osteriavicina.it/" to "testo:Osteria Vicina\nCarbonara 12€\nVino della casa 10€")

    @Test fun trovaDoveApreISitiETrovaIlVinoNellaCarta() = runBlocking {
        val m = FintoModello(chiama("trova_dove", """{"cosa":"Mannaja Cane","varianti":["Mannaia Cane"],"vicino_a":"Canale Monterano","km":50,"osm":["amenity=restaurant"]}"""),
            testo("Al Salotto Belvedere, 28 €."))
        m.indirizzi = { d -> if (d.size > 1) emptyList() else listOf(Consulente.Fonte("https://it.restaurantguru.com/Salotto-Belvedere-Bracciano", "", "restaurantguru.com"),
            Consulente.Fonte("https://salottobelvedere.it/dove-siamo/", "Salotto Belvedere", "salottobelvedere.it")) }
        val osm = FintoOsm(listOf(
            it.resonance.adam.logica.Mappa.Luogo("Osteria Vicina", "Canale Monterano", 1.2, "restaurant", "https://osteriavicina.it/"),
            it.resonance.adam.logica.Mappa.Luogo("Salotto Belvedere", "Bracciano", 7.4, "restaurant", "https://www.openstreetmap.org/node/1")))
        val lettore = FintoLettore(SALOTTO)
        Shell(archivio, imp, m, FintoMondo(), FintaCassetta(), osm, lettore).turno("dove trovo il Mannaja Cane entro 50 km?")
        // Prima le pagine che nominano il vino (nel paese e ovunque); poi il sito del Salotto, col suo nome e il paese.
        assertEquals(listOf("\"Mannaja Cane\" Canale Monterano", "\"Mannaja Cane\" carta menu listino dove si trova"), m.indirizziChiesti[0])
        assertEquals(listOf("sito ufficiale Salotto Belvedere Bracciano"), m.indirizziChiesti[1])
        // La carta: dalla pagina iniziale non c'è link, la porta la sitemap.
        assertTrue(lettore.letti.toString(), "https://salottobelvedere.it/carta-vini/" in lettore.letti && "https://salottobelvedere.it/robots.txt" in lettore.letti)
        val scheda = db.messaggi().elenco().single { it.ruolo == Ruolo.RICERCA }
        assertTrue(scheda.testo, scheda.testo.contains("✓ Salotto Belvedere (Bracciano, 7 km in linea d'aria) — «Mannaja Cane 2023") && scheda.testo.contains("https://salottobelvedere.it/carta-vini/"))
        assertTrue(scheda.testo, scheda.testo.contains("· Osteria Vicina") && scheda.testo.contains("non c'è"))
        // Due ricerche di indirizzi (le pagine che lo nominano, il sito del Salotto): il costo è la somma.
        assertEquals(0.008, scheda.costo!!, 1e-9)
        // Lo Shell riceve le prove e come riferirle.
        val alModello = m.ricevuti[1].last().toString()
        assertTrue(alModello, alModello.contains("PROVE DEL PROGRAMMA") && alModello.contains("Regina del Quartuccio") && alModello.contains("non risulta dal sito"))
        assertTrue(db.turni().ultimi(5).any { it.strumenti.contains("trova_dove: 2 siti aperti, 1 trovati") })
    }

    @Test fun trovaDoveSenzaLettoreLoDice() = runBlocking {
        val m = FintoModello(chiama("trova_dove", """{"cosa":"Mannaja Cane","luoghi":["https://salottobelvedere.it/"]}"""), testo("Non posso."))
        shell(m, FintaCassetta()).turno("dove trovo il Mannaja Cane?")
        assertTrue(m.ricevuti[1].last().toString().contains("il lettore di pagine non è disponibile"))
        val m2 = FintoModello(chiama("trova_dove", """{"cosa":"Mannaja Cane"}"""), testo("Correggo."))
        Shell(archivio, imp, m2, FintoMondo(), FintaCassetta(), FintoOsm(emptyList()), FintoLettore(SALOTTO)).turno("dove trovo il Mannaja Cane?")
        assertTrue(m2.ricevuti[1].last().toString().contains("Ricerca non fatta: serve vicino_a"))
    }

    @Test fun seguireDiceQuantoCosta() = runBlocking {
        val m = FintoModello(chiama("segui", """{"cosa":"Mustang usate","domanda":"annunci di Ford Mustang usate in Italia","giorni":7}"""), testo("Proposto."))
        shell(m, FintaCassetta()).turno("seguimi le Mustang per una settimana")
        assertTrue(db.messaggi().elenco().single { it.ruolo == Ruolo.PROPOSTA }.testo.contains("Costo stimato dal programma"))
    }

    // «Non ho accesso a internet» quando la ricerca c'è (02/10/2026): il programma lo rimanda al modello una volta, con la
    // domanda di adesso; e le vecchie risposte che lo dicevano portano l'avviso nella cronologia.
    @Test fun loShellNonPuoDireDiNonAvereInternet() = runBlocking {
        db.messaggi().inserisci(it.resonance.adam.dati.Messaggio(ruolo = Ruolo.SHELL, testo = "Non ho accesso a internet né a dati di borsa.", istante = 1))
        val m = FintoModello(testo("Non posso. Non ho accesso a internet."),
            chiama("cerca_nel_web", """{"domanda":"andamento demografico della lince in Italia"}"""),
            testo("Secondo ISPRA la lince in Italia è rarissima."))
        m.ricerche += web("Dati al: 2025\nLince: poche decine di individui sulle Alpi orientali.", "isprambiente.gov.it")
        val e = shell(m, FintaCassetta()).turno("controlla l'andamento demografico della lince in Italia")
        assertEquals("Secondo ISPRA la lince in Italia è rarissima.", e.testo)
        val nota = m.ricevuti[1].last().toString()
        assertTrue(nota, nota.contains("non è vero") && nota.contains("cerca_nel_web") && nota.contains("SOLO all'ultimo messaggio"))
        // La vecchia risposta, nella cronologia, porta l'avviso.
        assertTrue(m.ricevuti[0].toString().contains("[Risposta superata"))
        assertTrue(it.resonance.adam.logica.Testi.negaInternet("Non ho accesso a internet né a dati di borsa"))
        assertTrue(!it.resonance.adam.logica.Testi.negaInternet("Ho cercato su internet: ecco i dati"))
    }
}
