package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Lettera
import it.resonance.adam.dati.RispostaLettera
import it.resonance.adam.dati.StatoLettera
import it.resonance.adam.logica.Fondo
import it.resonance.adam.logica.Taccuino
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.LocalDate
import java.util.concurrent.TimeUnit

// La cassetta delle lettere fra lo Shell e l'architetto (Claude Code): le issue di un repository GitHub PRIVATO.
// Il Ghost non fa più da passacarte (25/09/2026), ma vede tutto e ogni lettera parte da un suo tocco. Le risposte
// dell'architetto portano il segno MARCA: il resto dei commenti (anche del Ghost) non si scambia per una risposta.
open class Cassetta(
    private val http: OkHttpClient = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build(),
) {
    data class Commento(val id: Long, val testo: String)

    private val json = Json { ignoreUnknownKeys = true }

    private fun richiesta(url: String, token: String) = Request.Builder().url(url)
        .header("Authorization", "Bearer $token")
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")

    /** Apre la lettera come issue; restituisce il suo numero. */
    open suspend fun apri(repo: String, token: String, titolo: String, corpo: String): Int = withContext(Dispatchers.IO) {
        val c = buildJsonObject { put("title", titolo); put("body", corpo) }
        val req = richiesta("https://api.github.com/repos/$repo/issues", token)
            .post(c.toString().toRequestBody("application/json".toMediaType())).build()
        http.newCall(req).execute().use { r ->
            val t = r.body.string()
            if (!r.isSuccessful) throw IllegalStateException("GitHub ${r.code}: ${t.take(200)}")
            json.parseToJsonElement(t).jsonObject["number"]!!.jsonPrimitive.int
        }
    }

    open suspend fun commenti(repo: String, token: String, numero: Int): List<Commento> = withContext(Dispatchers.IO) {
        val req = richiesta("https://api.github.com/repos/$repo/issues/$numero/comments?per_page=100", token).get().build()
        http.newCall(req).execute().use { r ->
            val t = r.body.string()
            if (!r.isSuccessful) throw IllegalStateException("GitHub ${r.code}: ${t.take(200)}")
            json.parseToJsonElement(t).jsonArray.map { e ->
                val o = e.jsonObject
                Commento(o["id"]!!.jsonPrimitive.long, o["body"]?.jsonPrimitive?.contentOrNull.orEmpty())
            }
        }
    }

    companion object {
        const val MARCA = "<!-- architetto -->"
        const val MARCA_SHELL = "<!-- shell -->"
        // Il repository dell'app è pubblico: le lettere lì sarebbero leggibili da chiunque.
        const val PUBBLICO = "flavioalbarello/resonance---pwa"
        fun valido(repo: String) = Regex("""^[\w.-]+/[\w.-]+$""").matches(repo.trim()) && repo.trim().lowercase() != PUBBLICO
    }
}

// Spedire e ritirare. Senza cassetta configurata le lettere restano in attesa nell'app e partono appena c'è.
class Corrispondenza(private val archivio: Archivio, private val imp: Impostazioni, private val cassetta: Cassetta = Cassetta()) {
    private val ora get() = System.currentTimeMillis()

    fun pronta() = Cassetta.valido(imp.cassetta) && imp.tokenCassetta.isNotBlank()

    // Lo stato dell'app che parte con ogni lettera (lo Shell l'ha voluto, 25/09): versione, fondo, taccuino, regolazione.
    // Non partono diario, misure, quaderni: se serve una cosa personale, la scrive lo Shell nella lettera, e il Ghost la vede.
    suspend fun corpo(l: Lettera): String = buildString {
        appendLine(l.testo.trim())
        appendLine()
        appendLine("---")
        appendLine("**Stato dell'app (automatico)** — versione ${it.resonance.adam.BuildConfig.VERSION_NAME}, ${LocalDate.now()}")
        appendLine()
        appendLine("Fondo di Adam:")
        Fondo.righe(Fondo.stato(archivio.db.fondo().elenco(), LocalDate.now())).forEach { appendLine("- $it") }
        appendLine()
        appendLine("Taccuino (note vive):")
        val vive = Taccuino.vive(archivio.db.taccuino().elenco(), ora)
        if (vive.isEmpty()) appendLine("- vuoto") else vive.forEach { appendLine("- ${Taccuino.riga(it, ora)}") }
        appendLine()
        appendLine("Regolazione (ultimi 100 turni):")
        val stati = archivio.db.messaggi().elenco().associate { it.id to it.stato }
        val s = Regolazione.sintesi(archivio.db.turni().ultimi(100)) { stati[it] }
        if (s.isEmpty()) appendLine("- nessun turno") else s.forEach { appendLine("- ${it.modello} · ${it.compito?.etichetta ?: "?"}: ${Regolazione.riga(it)}") }
        appendLine()
        append(Cassetta.MARCA_SHELL)
    }

    suspend fun spedisci(l: Lettera): Lettera {
        if (!pronta()) return l
        val aggiornata = try {
            l.copy(stato = StatoLettera.INVIATA, numero = cassetta.apri(imp.cassetta, imp.tokenCassetta, l.oggetto, corpo(l)), errore = "")
        } catch (e: Exception) {
            l.copy(stato = StatoLettera.ERRORE, errore = e.message ?: e.javaClass.simpleName)
        }
        archivio.db.lettere().aggiorna(aggiornata)
        return aggiornata
    }

    suspend fun spedisciInSospeso(): Int =
        archivio.db.lettere().elenco().filter { it.stato == StatoLettera.DA_INVIARE || it.stato == StatoLettera.ERRORE }
            .count { spedisci(it).stato == StatoLettera.INVIATA }

    /** Le risposte nuove dell'architetto, già salvate. */
    suspend fun ritira(): List<Pair<Lettera, RispostaLettera>> {
        if (!pronta()) return emptyList()
        val viste = archivio.db.lettere().risposte().map { it.idCommento }.toSet()
        val nuove = mutableListOf<Pair<Lettera, RispostaLettera>>()
        for (l in archivio.db.lettere().elenco().filter { it.numero != null && (it.stato == StatoLettera.INVIATA || it.stato == StatoLettera.RISPOSTA) }) {
            val commenti = runCatching { cassetta.commenti(imp.cassetta, imp.tokenCassetta, l.numero!!) }.getOrNull() ?: continue
            for (c in commenti.filter { it.testo.contains(Cassetta.MARCA) && it.id !in viste }) {
                val r = RispostaLettera(letteraId = l.id, idCommento = c.id, testo = c.testo.replace(Cassetta.MARCA, "").trim(), istante = ora)
                archivio.db.lettere().inserisciRisposta(r)
                archivio.db.lettere().aggiorna(l.copy(stato = StatoLettera.RISPOSTA))
                nuove += l to r
            }
        }
        return nuove
    }
}
