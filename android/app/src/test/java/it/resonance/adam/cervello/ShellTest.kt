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

    private class FintoMondo : Mondo {
        val eseguite = mutableListOf<Proposta>()
        var letta: AgendaLetta = AgendaLetta.Letta(LocalDate.now(), 2,
            listOf(Evento("Dentista", LocalDate.now().atTime(10, 30), LocalDate.now().atTime(11, 15), false)))
        override suspend fun agenda(da: LocalDate, giorni: Int) = letta
        override suspend fun esegui(p: Proposta) = Esecuzione(true, "In calendario «Personale», riletto").also { eseguite += p }
    }

    private class FintoModello(vararg risposte: Risposta) : OpenRouter() {
        private val coda = ArrayDeque(risposte.toList())
        val ricevuti = mutableListOf<JsonArray>()
        override suspend fun completa(chiave: String, modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int): Risposta {
            ricevuti += JsonArray(messaggi.toList())
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

    @Test fun ilNomeProtettoDelProfiloBloccaLaMail() = runBlocking {
        db.profilo().salva(it.resonance.adam.dati.Profilo(nome = "Flavio", nomiProtetti = "PhysioAlba"))
        val modello = FintoModello(chiama("scrivi_mail", """{"oggetto":"Corso","corpo":"Firmato PhysioAlba"}"""), testo("Riscrivo."))
        val esito = Shell(archivio, imp, modello, FintoMondo()).turno("prepara la mail per il corso")
        assertTrue(esito.proposte.isEmpty())
        assertTrue(modello.ricevuti[1].last().jsonObject["content"]!!.jsonPrimitive.content.contains("«PhysioAlba»"))
    }
}
