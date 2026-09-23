package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Voce
import it.resonance.adam.dati.Ruolo
import it.resonance.adam.dati.StatoProposta
import it.resonance.adam.dati.TipoMisura
import it.resonance.adam.logica.Agenda
import it.resonance.adam.logica.AgendaLetta
import it.resonance.adam.logica.Allegati
import it.resonance.adam.logica.Allegato
import it.resonance.adam.logica.Giorni
import it.resonance.adam.logica.Proposta
import it.resonance.adam.logica.Regole
import it.resonance.adam.logica.Risoluzione
import it.resonance.adam.logica.Uscita
import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Istantanea
import it.resonance.adam.logica.Testi
import it.resonance.adam.logica.Validazione
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.YearMonth

suspend fun Archivio.istantanea(oggi: LocalDate = LocalDate.now(), agenda: AgendaLetta = AgendaLetta.NonLetta) = Istantanea(
    oggi = oggi,
    profilo = db.profilo().leggi(),
    misure = db.misure().dal(oggi.minusDays(120).toString()),
    rituali = db.rituali().elenco().filter { it.attivo },
    spunte = db.rituali().elencoSpunte(),
    percorsi = db.percorsi().elenco(),
    nodi = db.percorsi().elencoNodi(),
    documenti = db.percorsi().elencoDocumenti(),
    quaderni = db.quaderni().elenco(),
    agenda = agenda,
)

class Shell(
    private val archivio: Archivio,
    private val impostazioni: Impostazioni,
    private val client: OpenRouter = OpenRouter(),
    private val mondo: Mondo? = null,
) {
    data class Esito(val testo: String, val proposte: List<Long>)

    private val ora get() = System.currentTimeMillis()
    private suspend fun nota(t: String) = archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.NOTA, testo = t, istante = ora))

    private suspend fun controllaSpesa(): String? {
        val chiave = impostazioni.chiave
        if (chiave.isBlank()) return "Manca la chiave OpenRouter: si mette in Setup."
        val speso = archivio.db.spesa().di(YearMonth.now().toString())?.dollari ?: 0.0
        val tetto = impostazioni.tettoMensile
        if (tetto > 0 && speso >= tetto) return "Tetto di spesa del mese raggiunto (${"%.2f".format(speso)} $ su ${"%.2f".format(tetto)} $). Si alza in Setup."
        return null
    }

    private suspend fun registraCosto(r: Risposta) {
        r.costo?.let { archivio.registraCosto(YearMonth.now().toString(), it) }
    }

    private fun storia(messaggi: List<Messaggio>): List<JsonObject> = messaggi.mapNotNull { m ->
        val (ruolo, testo) = when (m.ruolo) {
            Ruolo.GHOST -> "user" to m.testo + Allegati.notaPassata(Allegati.decodifica(m.allegati))
            Ruolo.SHELL -> "assistant" to m.testo
            Ruolo.PROPOSTA -> "user" to "[Nota del programma, non del Ghost] Proposta mostrata: ${m.testo} — stato: ${m.stato?.name?.lowercase() ?: "?"}"
            Ruolo.RICEVUTA -> "user" to "[Nota del programma, non del Ghost] Eseguito davvero: ${m.testo}"
            Ruolo.NOTA -> return@mapNotNull null
        }
        buildJsonObject { put("role", ruolo); put("content", testo) }
    }

    suspend fun turno(testoGhost: String, allegati: List<Allegato> = emptyList()): Esito {
        val idGhost = archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = testoGhost, istante = ora, allegati = Allegati.codifica(allegati)))
        controllaSpesa()?.let { nota(it); return Esito(it, emptyList()) }

        val oggi = LocalDate.now()
        val istantanea = archivio.istantanea(oggi, mondo?.agenda(oggi, 2) ?: AgendaLetta.NonLetta)
        val sistema = Contesto.sistema(istantanea)
        val regole = regole(istantanea.profilo?.nomiProtetti.orEmpty(), testoGhost)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", sistema) })
        lavoro += storia(archivio.db.messaggi().ultimi(24).filter { it.id != idGhost })
        // Il messaggio di adesso porta i suoi allegati; i precedenti solo la nota che c'erano.
        lavoro += buildJsonObject {
            put("role", "user")
            if (allegati.isEmpty()) put("content", testoGhost)
            else put("content", Contenuto.parti(testoGhost, allegati) { java.io.File(it).readBytes() })
        }
        var costoTurno = 0.0
        val motore = if (impostazioni.sceltaAutomatica) scegliMotore(testoGhost, allegati) { costoTurno += it } else null
        val base = if (motore == Motore.LEGGERO) impostazioni.modelloLeggero else impostazioni.modello
        // Un modello che non vede, per un turno con immagini, cede il posto a uno che vede.
        val modello = if (Allegati.conImmagini(allegati) && base !in Impostazioni.VEDONO) impostazioni.modelloVista else base
        val proposte = mutableListOf<Long>()
        var testo = ""

        try {
            for (giro in 0 until GIRI_MASSIMI) {
                val r = client.completa(impostazioni.chiave, modello, JsonArray(lavoro), Azioni.definizioni(), MAX_TOKEN)
                registraCosto(r)
                costoTurno += r.costo ?: 0.0
                testo = r.testo
                if (r.chiamate.isEmpty()) {
                    if (r.troncata) nota(if (r.testo.isBlank()) "La risposta si è interrotta prima di arrivare (limite di lunghezza): riprova, o chiedi una cosa per volta."
                        else "La risposta è stata tagliata dal limite di lunghezza.")
                    break
                }
                if (giro == GIRI_MASSIMI - 1) nota("Lo Shell ha usato tutti i giri di strumenti disponibili in questo turno.")
                lavoro += buildJsonObject {
                    put("role", "assistant"); put("content", r.testo)
                    put("tool_calls", buildJsonArray {
                        r.chiamate.forEach { c ->
                            add(buildJsonObject {
                                put("id", c.id); put("type", "function")
                                put("function", buildJsonObject { put("name", c.nome); put("arguments", c.argomenti) })
                            })
                        }
                    })
                }
                for (c in r.chiamate) {
                    val args = runCatching { Json.parseToJsonElement(c.argomenti).jsonObject }.getOrNull()
                    // Una chiamata tagliata a metà non si indovina: si dice al modello perché, e come farla più piccola.
                    val risultato = if (args == null) "Chiamata non eseguita: " + (if (r.troncata) "è stata tagliata dal limite di lunghezza, il testo era troppo lungo. " else "argomenti illeggibili. ") +
                        "Per cambiare una parte usa modifica_quaderno o modifica_documento con un'ancora corta."
                    else when (val v = Azioni.valida(c.nome, args, oggi, regole)) {
                        is Validazione.Lettura -> lettura(v)
                        is Validazione.Rifiutata -> "Rifiutata dal programma: ${v.motivo}. Correggi e riprova, oppure chiedi al Ghost."
                        is Validazione.Scrittura -> when (val r = risolvi(v.proposta)) {
                            is Risoluzione.Domanda -> "Non proposta: ${r.motivo}."
                            is Risoluzione.Pronta -> {
                                val descr = r.proposta.descrizione()
                                proposte += archivio.db.messaggi().inserisci(Messaggio(
                                    ruolo = Ruolo.PROPOSTA, testo = descr, istante = ora,
                                    proposta = Azioni.codifica(r.proposta), stato = StatoProposta.IN_ATTESA,
                                ))
                                "Proposta mostrata al Ghost, in attesa della sua conferma: ${descr.trimEnd('.')}. Non è ancora eseguita."
                            }
                        }
                    }
                    lavoro += buildJsonObject {
                        put("role", "tool"); put("tool_call_id", c.id); put("name", c.nome); put("content", risultato)
                    }
                }
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            val t = "Il modello non ha risposto: ${e.message ?: e.javaClass.simpleName}"
            nota(t)
            return Esito(t, proposte)
        }
        if (testo.isNotBlank()) archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.SHELL, testo = testo, istante = ora,
            modello = modello, costo = costoTurno.takeIf { it > 0 }, motore = motore?.etichetta))
        if (proposte.isEmpty() && Testi.affermaAzione(testo))
            nota("Nessuna azione è stata eseguita in questo turno: le azioni vere compaiono come proposte da confermare e poi come ricevute.")
        return Esito(testo, proposte)
    }

    companion object {
        const val GIRI_MASSIMI = 4
        // 1500 bastava a Llama, non a Kimi K2.6: il suo ragionamento lo esauriva e la risposta arrivava vuota
        // («tagliata dal limite», visto sul telefono il 23/09). Si paga ciò che si usa, non il tetto.
        const val MAX_TOKEN = 12000
        const val MAX_TOKEN_BATTITO = 3000
    }

    // Nel dubbio, o senza risposta in 6 secondi, PIENO. Il costo della microchiamata entra nel turno e nel tetto.
    private suspend fun scegliMotore(testo: String, allegati: List<Allegato>, costo: (Double) -> Unit): Motore {
        Instradatore.ovvio(testo, allegati)?.let { return it }
        val precedente = archivio.db.messaggi().ultimi(6).lastOrNull { it.ruolo == Ruolo.SHELL }?.testo
        return try {
            val r = client.completa(impostazioni.chiave, Instradatore.MODELLO, Instradatore.messaggi(testo, precedente, allegati), null, 5, rapida = true)
            registraCosto(r); r.costo?.let(costo)
            Instradatore.leggi(r.testo)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Motore.PIENO
        }
    }

    private fun versoIlMondo(p: Proposta) =
        p is Proposta.CreaEvento || p is Proposta.SpostaEvento || p is Proposta.TogliEvento || p is Proposta.ScriviMail

    // Spostare o togliere un impegno richiede di trovarlo nel calendario vero PRIMA di proporlo.
    private suspend fun risolvi(p: Proposta): Risoluzione = when (p) {
        is Proposta.SpostaEvento, is Proposta.TogliEvento -> mondo?.risolvi(p) ?: Risoluzione.Domanda("il calendario non è raggiungibile da qui")
        else -> Risoluzione.Pronta(p)
    }

    // Gli indirizzi validi sono quelli che il Ghost ha scritto: in chat, nel profilo, nei quaderni. Il modello non ne inventa.
    private suspend fun regole(nomiProtetti: String, testoGhost: String): Regole {
        val scritti = buildString {
            archivio.db.messaggi().elenco().filter { it.ruolo == Ruolo.GHOST }.forEach { appendLine(it.testo) }
            archivio.db.quaderni().elenco().forEach { appendLine(it.testo) }
            archivio.db.profilo().leggi()?.let { appendLine(it.vincoli); appendLine(it.motivazione) }
        }
        return Regole(Uscita.nomi(nomiProtetti), Uscita.indirizzi(scritti), testoGhost)
    }

    private suspend fun lettura(v: Validazione.Lettura): String = when (v.nome) {
        "leggi_documento" -> archivio.leggiDocumento(Azioni.stringa(v.argomenti, "titolo").orEmpty())
        "cerca" -> archivio.cerca(Azioni.stringa(v.argomenti, "testo").orEmpty())
        "leggi_misure" -> {
            val tipo = Azioni.stringa(v.argomenti, "tipo")?.uppercase()?.let { t -> TipoMisura.entries.find { it.name == t } }
            if (tipo == null) "Tipo di misura sconosciuto." else archivio.leggiMisure(tipo, Azioni.intero(v.argomenti, "giorni", 30))
        }
        "leggi_calendario" -> {
            val oggi = LocalDate.now()
            val da = Giorni.interpreta(Azioni.stringa(v.argomenti, "da"), oggi)
            when {
                mondo == null -> "Il calendario non è raggiungibile da qui."
                da == null -> "Data non leggibile: usa yyyy-MM-dd."
                else -> Agenda.testo(mondo.agenda(da, Azioni.intero(v.argomenti, "giorni", 7).coerceIn(1, 31)), oggi)
            }
        }
        else -> "Lettura non prevista."
    }

    suspend fun conferma(idMessaggio: Long): String {
        val m = archivio.db.messaggi().per(idMessaggio) ?: return "Proposta non trovata."
        if (m.stato != StatoProposta.IN_ATTESA) return "Questa proposta è già stata decisa."
        val p = archivio.proposta(m) ?: return "Proposta illeggibile."
        // Ciò che sta per uscire dal calendario si scrive PRIMA nel diario di Adam: si cerca, si legge, si può rimettere.
        mondo?.copia(p)?.let { archivio.db.voci().inserisci(Voce(pilastro = Pilastro.ADAM, giorno = LocalDate.now().toString(), testo = it, fonte = "calendario", creato = ora, aggiornato = ora)) }
        val e = if (versoIlMondo(p)) mondo?.esegui(p) ?: Esecuzione(false, "Non eseguito: calendario e posta si usano dall'app aperta")
        else archivio.esegui(p)
        archivio.db.messaggi().aggiorna(m.copy(stato = if (e.riuscita) StatoProposta.ESEGUITA else StatoProposta.FALLITA))
        archivio.db.messaggi().inserisci(Messaggio(ruolo = if (e.riuscita) Ruolo.RICEVUTA else Ruolo.NOTA, testo = e.ricevuta, istante = ora))
        return e.ricevuta
    }

    suspend fun rifiuta(idMessaggio: Long) {
        val m = archivio.db.messaggi().per(idMessaggio) ?: return
        if (m.stato == StatoProposta.IN_ATTESA) archivio.db.messaggi().aggiorna(m.copy(stato = StatoProposta.RIFIUTATA))
    }

    // Adam parla per primo: una chiamata corta, senza strumenti. Se non si può, il battito usa il testo del programma.
    suspend fun parlaPerPrimo(momento: String, riassunto: String): String? {
        if (controllaSpesa() != null) return null
        val oggi = LocalDate.now()
        val sistema = Contesto.sistema(archivio.istantanea(oggi, mondo?.agenda(oggi, 1) ?: AgendaLetta.NonLetta))
        val richiesta = "È il momento: $momento. Dati del programma per questo momento:\n$riassunto\n\n" +
            "Scrivi al Ghost UN messaggio di notifica: al massimo due righe, nessun saluto di rito. " +
            "Nomina un solo fatto dai dati e una sola cosa concreta da fare o da notare. Non inventare numeri."
        val messaggi = JsonArray(listOf(
            buildJsonObject { put("role", "system"); put("content", sistema) },
            buildJsonObject { put("role", "user"); put("content", richiesta) },
        ))
        return runCatching {
            val r = client.completa(impostazioni.chiave, impostazioni.modello, messaggi, null, MAX_TOKEN_BATTITO)
            registraCosto(r)
            r.testo.takeIf { it.isNotBlank() }
        }.getOrNull()
    }
}
