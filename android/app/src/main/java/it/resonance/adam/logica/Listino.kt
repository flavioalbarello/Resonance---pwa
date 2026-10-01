package it.resonance.adam.logica

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate

// Il listino di OpenRouter (02/10/2026). La lista dei modelli in Setup era del 23/09 e due modelli per le immagini
// stavano per sparire (9 e 20 ottobre) senza che nessuno lo vedesse: una lista scritta a mano invecchia in silenzio.
// Ora il programma legge il listino pubblico (senza chiave) una volta al giorno: avvisa delle scadenze e dei modelli
// spariti, e dà i prezzi veri alle stime di costo. Un valore che governa una decisione vuole la sua fonte viva.
object Listino {
    @Serializable
    data class Voce(
        val id: String,
        val nome: String = "",
        // Dollari per milione di token, ingresso e uscita.
        val ingresso: Double = 0.0,
        val uscita: Double = 0.0,
        val vede: Boolean = false,
        val temperatura: Boolean = true,
        val strumenti: Boolean = true,
        val scade: String? = null,
    )

    const val GIORNI_AVVISO = 30
    private val json = Json { ignoreUnknownKeys = true }

    /** Dalla risposta di /api/v1/models alle voci che servono all'app. */
    fun leggi(testo: String): List<Voce> = runCatching {
        json.parseToJsonElement(testo).jsonObject["data"]!!.jsonArray.mapNotNull { e ->
            val m = e.jsonObject
            val id = m["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val prezzi = m["pricing"]?.jsonObject
            fun prezzo(k: String) = prezzi?.get(k)?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()?.times(1_000_000) ?: 0.0
            val parametri = m["supported_parameters"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()
            val ingressi = m["architecture"]?.jsonObject?.get("input_modalities")?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()
            Voce(id, m["name"]?.jsonPrimitive?.contentOrNull.orEmpty(), prezzo("prompt"), prezzo("completion"), "image" in ingressi,
                "temperature" in parametri, "tools" in parametri, m["expiration_date"]?.jsonPrimitive?.contentOrNull?.take(10))
        }
    }.getOrDefault(emptyList())

    fun codifica(v: List<Voce>) = json.encodeToString(ListSerializer(Voce.serializer()), v)
    fun decodifica(s: String): List<Voce> = runCatching { json.decodeFromString(ListSerializer(Voce.serializer()), s) }.getOrDefault(emptyList())

    /**
     * Gli avvisi sui modelli che l'app usa davvero (ruolo → id): spariti dal listino, o in scadenza entro 30 giorni.
     * Con un listino vuoto (mai letto, o senza rete) non si dice niente: un silenzio non è un avviso.
     */
    fun avvisi(usati: Map<String, String>, listino: List<Voce>, oggi: LocalDate): List<String> {
        if (listino.isEmpty()) return emptyList()
        val perId = listino.associateBy { it.id }
        return usati.entries.distinctBy { it.value }.mapNotNull { (ruolo, id) ->
            val v = perId[id]
            when {
                v == null -> "$id ($ruolo) non è più nel listino di OpenRouter: scegline un altro"
                v.scade != null && runCatching { !LocalDate.parse(v.scade).isAfter(oggi.plusDays(GIORNI_AVVISO.toLong())) }.getOrDefault(false) ->
                    "$id ($ruolo) sparisce da OpenRouter il ${v.scade}: scegline un altro prima"
                else -> null
            }
        }
    }

    fun prezzi(listino: List<Voce>, id: String): Voce? = listino.firstOrNull { it.id == id }
}
