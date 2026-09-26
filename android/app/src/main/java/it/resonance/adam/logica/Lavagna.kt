package it.resonance.adam.logica

import it.resonance.adam.dati.Appunto
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// La lavagna del Ghost: appunti usa e getta (riunione del 26/09/2026). Tutto ciò che decide se un appunto vive, cosa
// si copia, cosa si manda in PDF e cosa entra nel prompt sta qui, senza Android: si prova sul banco.
object Lavagna {
    const val GIORNI_PREDEFINITI = 7
    const val GIORNI_MIN = 1
    const val GIORNI_MAX = 30
    // Dopo la fine, quanto resta prima di cancellarsi davvero.
    const val GIORNI_DOPO = 30
    const val RIGHE_MAX = 60
    // Nel prompt: pochi appunti, righe corte. Lo Shell li legge a ogni turno.
    private const val NEL_PROMPT = 8

    @Serializable
    data class Riga(val testo: String, val fatta: Boolean = false)

    private val json = Json { ignoreUnknownKeys = true }
    private val giorno = DateTimeFormatter.ofPattern("dd/MM")

    fun righe(a: Appunto): List<Riga> = runCatching { json.decodeFromString(ListSerializer(Riga.serializer()), a.righe) }.getOrDefault(emptyList())
    fun codifica(r: List<Riga>): String = json.encodeToString(ListSerializer(Riga.serializer()), r)

    fun daFare(a: Appunto) = righe(a).filterNot { it.fatta }

    /** Vive se non è tenuto, non è scaduto, e ha ancora qualcosa da fare. */
    fun vivo(a: Appunto, oggi: LocalDate) = !a.tenuto && !oggi.isAfter(LocalDate.parse(a.scade)) && daFare(a).isNotEmpty()

    /** Il giorno in cui ha smesso di vivere: segnato quando è successo, altrimenti la scadenza. */
    fun fine(a: Appunto): LocalDate = a.finito?.let { LocalDate.parse(it) } ?: LocalDate.parse(a.scade)

    /** Si cancella davvero dopo GIORNI_DOPO dalla fine: è la scelta del Ghost, niente spazzatura. */
    fun daCancellare(a: Appunto, oggi: LocalDate) = !vivo(a, oggi) && oggi.isAfter(fine(a).plusDays(GIORNI_DOPO.toLong()))

    /** Spunta (o toglie la spunta a) una riga; se l'appunto finisce così, lo segna finito oggi. */
    fun alterna(a: Appunto, indice: Int, oggi: LocalDate): Appunto {
        val r = righe(a).toMutableList()
        if (indice !in r.indices) return a
        r[indice] = r[indice].copy(fatta = !r[indice].fatta)
        return conFine(a.copy(righe = codifica(r)), oggi)
    }

    // Finito oggi se non vive più; riaperto se torna a vivere (una spunta tolta).
    fun conFine(a: Appunto, oggi: LocalDate): Appunto = when {
        vivo(a, oggi) -> a.copy(finito = null)
        a.finito == null -> a.copy(finito = oggi.toString())
        else -> a
    }

    /** Le righe che una frase nomina: esatte, poi contenute. Una riga ambigua non si indovina. */
    fun trova(a: Appunto, cercate: List<String>): Pair<List<Int>, List<String>> {
        val r = righe(a)
        val trovate = mutableListOf<Int>()
        val dubbie = mutableListOf<String>()
        for (c in cercate) {
            val n = Testi.normalizza(c)
            val esatte = r.indices.filter { Testi.normalizza(r[it].testo) == n }
            val simili = if (esatte.isNotEmpty()) esatte else r.indices.filter {
                val t = Testi.normalizza(r[it].testo); t.contains(n) || n.contains(t)
            }
            if (simili.size == 1) trovate += simili.single() else dubbie += c
        }
        return trovate.distinct() to dubbie
    }

    /** «Copia»: le righe ancora da fare, una per riga, da incollare in una nota condivisa. */
    fun perCopia(a: Appunto) = daFare(a).joinToString("\n") { it.testo }

    /** «Condividi» e PDF: il titolo e le righe, con ciò che è fatto segnato. */
    fun perCondividere(a: Appunto) = a.titolo + "\n\n" + righe(a).joinToString("\n") { (if (it.fatta) "☑ " else "☐ ") + it.testo }

    fun riga(a: Appunto): String {
        val r = righe(a)
        val fatte = r.count { it.fatta }
        return "«${a.titolo}» (scade il ${LocalDate.parse(a.scade).format(giorno)}" + (if (a.fissato) ", fissato nelle notifiche" else "") + "): " +
            Testi.corto(daFare(a).joinToString("; ") { it.testo }, 300) + if (fatte > 0) " [già fatte: $fatte]" else ""
    }

    fun perPrompt(tutti: List<Appunto>, oggi: LocalDate): List<String> = tutti.filter { vivo(it, oggi) }.sortedBy { it.scade }.take(NEL_PROMPT).map(::riga)

    /** Le righe di un testo scritto a mano o dettato: una per riga, senza trattini né caselle. */
    fun daTesto(t: String): List<String> = t.lines().map { it.trim().removePrefix("- ").removePrefix("☐ ").removePrefix("☑ ").trim() }.filter { it.isNotEmpty() }
}
