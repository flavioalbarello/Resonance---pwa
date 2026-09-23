package it.resonance.adam.cervello

import it.resonance.adam.logica.Allegati
import it.resonance.adam.logica.Allegato
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import java.util.Base64

// Il messaggio del Ghost con i suoi allegati, nella forma che OpenRouter accetta: testo e immagini come parti.
object Contenuto {
    fun parti(testo: String, allegati: List<Allegato>, leggi: (String) -> ByteArray): JsonArray = buildJsonArray {
        add(buildJsonObject { put("type", "text"); put("text", testo) })
        for (a in allegati) {
            when (a.tipo) {
                Allegato.Tipo.TESTO -> add(buildJsonObject {
                    put("type", "text"); put("text", "Documento allegato «${a.nome}»:\n${Allegati.tagliaTesto(a.testo)}")
                })
                Allegato.Tipo.IMMAGINE, Allegato.Tipo.PDF -> {
                    val intestazione = if (a.tipo == Allegato.Tipo.PDF)
                        "PDF allegato «${a.nome}»: ${a.immagini.size} pagine come immagini" + (if (a.pagineTotali > a.immagini.size) " (su ${a.pagineTotali}: le altre non le vedi, dillo se servono)" else "") + "."
                    else "Immagine allegata «${a.nome}»."
                    add(buildJsonObject { put("type", "text"); put("text", intestazione) })
                    a.immagini.forEach { percorso ->
                        val dati = runCatching { leggi(percorso) }.getOrNull() ?: return@forEach
                        add(buildJsonObject {
                            put("type", "image_url")
                            putJsonObject("image_url") { put("url", "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(dati)) }
                        })
                    }
                }
            }
        }
    }
}
