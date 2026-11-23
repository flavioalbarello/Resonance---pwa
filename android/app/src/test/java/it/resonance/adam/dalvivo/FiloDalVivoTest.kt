package it.resonance.adam.dalvivo

import androidx.room.Room
import it.resonance.adam.Impostazioni
import it.resonance.adam.cervello.OpenRouter
import it.resonance.adam.cervello.Shell
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Db
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoProposta
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.File
import java.text.Normalizer

// La prova del filo (23/11/2026). Il Ghost ha disinstallato l'app: «cercavo un copilota intelligente e ho trovato solo
// macchinosità»; e i progetti di Claude «alla lunga perdevano contesto». La domanda: lo Shell, che a ogni turno
// ricostruisce il contesto dalla memoria ordinata (quaderni, percorsi, diario) più gli ultimi 24 messaggi, tiene il filo
// meglio di una chat? Un mese finto (resources/filo/mese.json), poi domande con la risposta attesa tenuta da parte
// (domande.json): il voto lo dà il programma. Quattro modi, stesso modello:
//   A  lo Shell di Resonance, con le sue proposte confermate tutte (e contate: è lì l'attrito)
//   B  una chat nuova ogni settimana, senza memoria (la chat nuova del Ghost)
//   C  una chat nuova ogni settimana, con un riassunto passato da una all'altra (la memoria dei progetti)
//   D  una chat unica che non finisce (il tetto: dice se il limite è del modello o del metodo)
// Gira solo con la chiave:  OPENROUTER_PROVA=proxy-injected MODELLO_DAL_VIVO=… ./gradlew testDevDebugUnitTest --tests '*FiloDalVivo*'
// Il rapporto va in build/dalvivo/filo.md.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class FiloDalVivoTest {
    private val app = RuntimeEnvironment.getApplication()
    private val chiave = System.getenv("OPENROUTER_PROVA").orEmpty()
    private val modello = System.getenv("MODELLO_DAL_VIVO") ?: "moonshotai/kimi-k2.6"
    private val modi = (System.getenv("MODI_FILO") ?: "ABCD").uppercase()
    private val json = Json { ignoreUnknownKeys = true }

    data class Messaggio(val giorno: Int, val testo: String)
    data class Domanda(val id: String, val domanda: String, val attese: List<List<String>>, val tipo: String, val vecchie: List<String>, val massimoRighe: Int?)
    data class Voto(val id: String, val tipo: String, val risposta: String, val giusta: Boolean, val nota: String)
    data class Esito(val modo: String, val voti: List<Voto>, val costo: Double, val conferme: Int, val note: String)

    private fun risorsa(nome: String) = javaClass.classLoader!!.getResource("filo/$nome")!!.readText()

    private fun mese() = json.parseToJsonElement(risorsa("mese.json")).jsonArray.map {
        Messaggio(it.jsonObject["giorno"]!!.jsonPrimitive.int, it.jsonObject["testo"]!!.jsonPrimitive.content)
    }

    private fun domande() = json.parseToJsonElement(risorsa("domande.json")).jsonArray.map { e ->
        val o = e.jsonObject
        Domanda(o["id"]!!.jsonPrimitive.content, o["domanda"]!!.jsonPrimitive.content,
            o["attese"]!!.jsonArray.map { g -> g.jsonArray.map { it.jsonPrimitive.content } }, o["tipo"]!!.jsonPrimitive.content,
            o["vecchie"]!!.jsonArray.map { it.jsonPrimitive.content }, o["massimo_righe"]?.jsonPrimitive?.intOrNull)
    }

    companion object {
        fun normale(t: String) = Normalizer.normalize(t.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}"), "")

        private fun parola(r: String, p: String) = Regex("(?<![a-z0-9])" + Regex.escape(normale(p)) + "(?![a-z0-9])").containsMatchIn(r)
        private val RINUNCE = listOf("non lo so", "non me l", "non mi hai", "mai detto", "non ho informazion", "non risulta", "non so ")

        /** Il voto: ogni gruppo di parole attese deve comparire (una qualunque del gruppo). Non c'è un giudice modello. */
        fun vota(d: Domanda, risposta: String): Voto {
            if (d.massimoRighe != null) {
                val righe = risposta.lines().count { it.isNotBlank() }
                return Voto(d.id, d.tipo, risposta, righe <= d.massimoRighe, "$righe righe")
            }
            val r = normale(risposta.substringAfter("RISPOSTA:", risposta))
            val presenti = d.attese.all { gruppo -> gruppo.any { parola(r, it) } }
            val dice = RINUNCE.any { r.contains(it) }
            return when {
                d.tipo == "ignoto" -> Voto(d.id, d.tipo, risposta, dice, if (dice) "" else "INVENTATA")
                presenti -> Voto(d.id, d.tipo, risposta, true, "")
                dice -> Voto(d.id, d.tipo, risposta, false, "non lo sa")
                d.vecchie.any { parola(r, it) } -> Voto(d.id, d.tipo, risposta, false, "VECCHIA decisione")
                else -> Voto(d.id, d.tipo, risposta, false, "sbagliata")
            }
        }
    }

    private val persona = "Sei l'assistente personale di Flavio, che chiami Ghost. Suona il basso e il susafono in una tribute band di Rino " +
        "Gaetano, lavora come fisioterapista, vive con Marta. Rispondi in italiano, breve e denso, senza premesse."

    private fun msg(ruolo: String, testo: String): JsonObject = buildJsonObject { put("role", ruolo); put("content", testo) }

    @Test fun ilFilo() = runBlocking {
        assumeTrue("senza OPENROUTER_PROVA la prova del filo si salta", chiave.isNotBlank())
        val mese = mese(); val domande = domande()
        val esiti = mutableListOf<Esito>()
        val client = OpenRouter()
        var costoChat = 0.0
        suspend fun chiedi(messaggi: List<JsonObject>): String {
            val r = client.completa(chiave, modello, JsonArray(messaggi), null, 2000, false, 0.4)
            costoChat += r.costo ?: 0.0
            return r.testo.trim()
        }

        // ── A: lo Shell di Resonance ──
        if ('A' in modi) {
            val db = Room.inMemoryDatabaseBuilder(app, Db::class.java).allowMainThreadQueries().build()
            val imp = object : Impostazioni(app) {
                override var chiave: String
                    get() = this@FiloDalVivoTest.chiave
                    set(_) {}
            }
            imp.modello = modello; imp.sceltaAutomatica = false; imp.tettoMensile = 10.0
            db.profilo().salva(Profilo(nome = "Flavio"))
            val shell = Shell(Archivio(db), imp)
            var conferme = 0
            var errori = 0
            for (m in mese) {
                runCatching { shell.turno(m.testo) }.onFailure { errori++ }
                // Il Ghost che dice sempre sì: ogni proposta in attesa si conferma, e si conta.
                db.messaggi().elenco().filter { it.ruolo == Ruolo.PROPOSTA && it.stato == StatoProposta.IN_ATTESA }.forEach {
                    conferme++; runCatching { shell.conferma(it.id) }
                }
            }
            val memoria = buildString {
                db.quaderni().elenco().forEach { appendLine("QUADERNO ${it.pilastro}: ${it.testo}") }
                db.percorsi().elenco().forEach { p -> appendLine("PERCORSO ${p.titolo}: " + db.percorsi().elencoNodi().filter { it.percorsoId == p.id }.joinToString("; ") { it.etichetta }) }
                db.voci().elenco().forEach { appendLine("DIARIO ${it.pilastro} ${it.giorno}: ${it.testo}") }
                db.taccuino().elenco().forEach { appendLine("TACCUINO: ${it.testo}") }
            }
            val voti = domande.map { d ->
                val prima = db.messaggi().elenco().size
                runCatching { shell.turno(d.domanda) }
                val risposta = db.messaggi().elenco().drop(prima).lastOrNull { it.ruolo == Ruolo.SHELL }?.testo.orEmpty()
                vota(d, risposta)
            }
            val costo = db.turni().ultimi(10_000).sumOf { it.costo ?: 0.0 }
            esiti += Esito("A · Resonance", voti, costo, conferme, "turni falliti: $errori\n\nMEMORIA SCRITTA DALLO SHELL NEL MESE:\n$memoria")
            db.close()
        }

        // ── B, C, D: le chat ──
        val settimane = mese.groupBy { (it.giorno - 1) / 7 }.toSortedMap()
        suspend fun chat(modo: String, nuovaOgniSettimana: Boolean, riassunto: Boolean): Esito {
            costoChat = 0.0
            var memoria = ""
            var storia = mutableListOf<JsonObject>()
            fun sistema() = msg("system", persona + if (memoria.isNotBlank()) "\n\nCiò che ricordi dalle chat precedenti:\n$memoria" else "")
            for ((s, messaggi) in settimane) {
                if (nuovaOgniSettimana && s > 0) {
                    if (riassunto) memoria = chiedi(listOf(sistema()) + storia +
                        msg("user", "Prima di chiudere questa chat: scrivi in punti brevi ciò che devi ricordare di me per le prossime chat. Tieni anche ciò che ricordavi già, aggiornandolo se è cambiato."))
                    storia = mutableListOf()
                }
                for (m in messaggi) {
                    storia += msg("user", m.testo)
                    storia += msg("assistant", chiedi(listOf(sistema()) + storia))
                }
            }
            // Le domande nella chat in cui il Ghost si trova a fine mese; ognuna da sola, senza le altre.
            val voti = domande.map { d -> vota(d, chiedi(listOf(sistema()) + storia + msg("user", d.domanda))) }
            return Esito(modo, voti, costoChat, 0, if (riassunto) "MEMORIA PASSATA FRA LE CHAT:\n$memoria" else "")
        }
        if ('B' in modi) esiti += chat("B · chat nuova ogni settimana", nuovaOgniSettimana = true, riassunto = false)
        if ('C' in modi) esiti += chat("C · chat nuova ogni settimana con riassunto", nuovaOgniSettimana = true, riassunto = true)
        if ('D' in modi) esiti += chat("D · chat unica", nuovaOgniSettimana = false, riassunto = false)

        val uscita = File(System.getProperty("user.dir"), "build/dalvivo").apply { mkdirs() }
        File(uscita, "filo.md").writeText(buildString {
            appendLine("# La prova del filo — modello $modello"); appendLine()
            appendLine("| modo | fatti | cambiati | «non lo so» giusti | preferenza | totale | inventate | conferme chieste | costo $ |")
            appendLine("|---|---|---|---|---|---|---|---|---|")
            esiti.forEach { e ->
                fun conta(t: String) = e.voti.filter { it.tipo == t }.let { v -> "${v.count { it.giusta }}/${v.size}" }
                appendLine("| ${e.modo} | ${conta("fatto")} | ${conta("cambiato")} | ${conta("ignoto")} | ${conta("preferenza")} | " +
                    "${e.voti.count { it.giusta }}/${e.voti.size} | ${e.voti.count { it.nota == "INVENTATA" }} | ${e.conferme} | ${"%.3f".format(e.costo)} |")
            }
            esiti.forEach { e ->
                appendLine(); appendLine("## ${e.modo}")
                e.voti.forEach { v -> appendLine("- ${if (v.giusta) "✓" else "✗"} **${v.id}** ${v.nota} — ${v.risposta.replace("\n", " ⏎ ").take(300)}") }
                if (e.note.isNotBlank()) { appendLine(); appendLine("```"); appendLine(e.note.take(6000)); appendLine("```") }
            }
        })
        println(File(uscita, "filo.md").readText().lines().take(8).joinToString("\n"))
    }
}
