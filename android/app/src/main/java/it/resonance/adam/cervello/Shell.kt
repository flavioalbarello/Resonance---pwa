package it.resonance.adam.cervello

import it.resonance.adam.Impostazioni
import it.resonance.adam.dati.Archivio
import it.resonance.adam.dati.Esecuzione
import it.resonance.adam.dati.Messaggio
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Nota
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
import it.resonance.adam.logica.Quaderni
import it.resonance.adam.logica.Azioni
import it.resonance.adam.logica.Contesto
import it.resonance.adam.logica.Istantanea
import it.resonance.adam.logica.Nodi
import it.resonance.adam.logica.Testi
import it.resonance.adam.logica.Lavagna
import it.resonance.adam.dati.Ambiguo
import it.resonance.adam.logica.Taccuino
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
    esperimenti = db.esperimenti().elenco(),
    note = db.taccuino().elenco(),
    movimenti = db.fondo().elenco(),
    consegne = db.consegne().aperte(),
    appunti = db.lavagna().elenco().filter { Lavagna.vivo(it, oggi) },
    versione = it.resonance.adam.BuildConfig.VERSION_NAME,
)

class Shell(
    private val archivio: Archivio,
    private val impostazioni: Impostazioni,
    private val client: OpenRouter = OpenRouter(),
    private val mondo: Mondo? = null,
    private val cassetta: Cassetta = Cassetta(),
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

    // Ogni chiamata passa di qui: la temperatura del compito, tranne ai modelli che l'hanno rifiutata. Se un modello la
    // rifiuta ora, si rinuncia al parametro e non alla risposta, lo si ricorda per quel modello e lo si dice una volta.
    // Restituisce anche la temperatura davvero mandata (null = quella del modello).
    private suspend fun chiama(modello: String, messaggi: JsonArray, strumenti: JsonArray?, maxToken: Int, temperatura: Double?,
                               rapida: Boolean = false): Pair<Risposta, Double?> {
        val manda = temperatura?.takeIf { modello !in impostazioni.senzaTemperatura }
        return try {
            client.completa(impostazioni.chiave, modello, messaggi, strumenti, maxToken, rapida, manda) to manda
        } catch (e: ErroreModello) {
            if (manda == null || !Temperatura.rifiutata(e.message)) throw e
            impostazioni.senzaTemperatura = impostazioni.senzaTemperatura + modello
            nota("${Instradatore.etichetta(modello)} non accetta una temperatura scelta: da ora usa la sua. Le risposte possono essere meno precise o meno varie di quanto il compito chiede.")
            client.completa(impostazioni.chiave, modello, messaggi, strumenti, maxToken, rapida, null) to null
        }
    }

    private suspend fun registraTurno(compito: Compito, modello: String, t: Double?, forzata: Boolean, proposte: List<Long>, rifiutate: Int,
                                      troncata: Boolean, esauriti: Boolean, errore: Boolean, costo: Double) {
        runCatching {
            archivio.db.turni().inserisci(it.resonance.adam.dati.Turno(istante = ora, compito = compito.name, modello = modello, temperatura = t,
                forzata = forzata, proposte = proposte.joinToString(","), rifiutate = rifiutate, troncata = troncata, esauriti = esauriti,
                errore = errore, costo = costo.takeIf { it > 0 }))
        }
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
            // Le note dicono perché una proposta è fallita: senza, il modello si inventava il motivo (visto il 24/09).
            Ruolo.NOTA -> "user" to "[Nota del programma, non del Ghost] ${m.testo}"
            Ruolo.ARCHITETTO -> "user" to dallArchitetto(m.testo)
        }
        buildJsonObject { put("role", ruolo); put("content", testo) }
    }

    // L'architetto non è il Ghost e non si finge tale: il modello lo vede con la sua etichetta.
    private fun dallArchitetto(t: String) = "[L'architetto (Claude Code), non il Ghost] $t"

    suspend fun turno(testoGhost: String, allegati: List<Allegato> = emptyList()): Esito = rispondi(registra(testoGhost, allegati))

    // Il messaggio del Ghost si salva subito; la risposta può arrivare dopo, anche ad app chiusa (battito/Turno.kt).
    suspend fun registra(testoGhost: String, allegati: List<Allegato> = emptyList()): Long =
        archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.GHOST, testo = testoGhost, istante = ora, allegati = Allegati.codifica(allegati)))

    suspend fun rispondi(idGhost: Long, forza: Forzatura? = null): Esito {
        val m = archivio.db.messaggi().per(idGhost) ?: return Esito("", emptyList())
        archivio.chiudiScaduti()
        // Se il sistema interrompe il lavoro e lo rilancia, un messaggio già risposto non si risponde due volte.
        archivio.db.messaggi().dopo(idGhost).firstOrNull { it.ruolo == Ruolo.SHELL }?.let { return Esito(it.testo, emptyList()) }
        val testoGhost = m.testo
        // Un turno può partire anche da un intervento dell'architetto rivolto allo Shell («→ Shell», in riunione).
        val architetto = m.ruolo == Ruolo.ARCHITETTO
        val allegati = Allegati.decodifica(m.allegati)
        controllaSpesa()?.let { nota(it); return Esito(it, emptyList()) }

        val oggi = LocalDate.now()
        val istantanea = fotografia(oggi, 2)
        val sistema = Contesto.sistema(istantanea)
        // I nomi che il Ghost ha detto possono uscire; quelli scritti dall'architetto no.
        val regole = regole(istantanea, if (architetto) "" else testoGhost)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", sistema) })
        lavoro += storia(archivio.db.messaggi().ultimi(24).filter { it.id != idGhost })
        // Il messaggio di adesso porta i suoi allegati; i precedenti solo la nota che c'erano.
        lavoro += buildJsonObject {
            put("role", "user")
            if (allegati.isEmpty()) put("content", if (architetto) dallArchitetto(testoGhost) else testoGhost)
            else put("content", Contenuto.parti(testoGhost, allegati) { java.io.File(it).readBytes() })
        }
        var costoTurno = 0.0
        val motore = if (impostazioni.sceltaAutomatica) scegliMotore(testoGhost, allegati) { costoTurno += it } else null
        val base = if (motore == Motore.LEGGERO) impostazioni.modelloLeggero else impostazioni.modello
        // Un modello che non vede, per un turno con immagini, cede il posto a uno che vede.
        val modello = if (Allegati.conImmagini(allegati) && base !in Impostazioni.VEDONO) impostazioni.modelloVista else base
        val compito = if (allegati.isEmpty()) Compito.TURNO else Compito.ALLEGATI
        val esito = ciclo(lavoro, oggi, regole, modello, motore?.etichetta, costoTurno, compito = compito, forza = forza)
        // In riunione lo scambio va nel verbale da solo: il Ghost non spiega due volte. Gli allegati non escono.
        val tavolo = Tavolo(archivio, impostazioni, cassetta)
        if (tavolo.aperta()) try {
            // L'intervento dell'architetto è già nel verbale: è lì che è nato.
            if (!architetto) tavolo.registra("ghost", testoGhost + if (allegati.isNotEmpty()) "\n[${allegati.size} allegati: non copiati nel verbale]" else "")
            val proposte = esito.proposte.mapNotNull { archivio.db.messaggi().per(it)?.testo }
            tavolo.registra("shell", esito.testo + if (proposte.isNotEmpty()) "\n\nProposte (da confermare dal Ghost):\n" + proposte.joinToString("\n") { "- $it" } else "")
        } catch (e: Exception) {
            nota("Scambio non copiato nel verbale della riunione: ${e.message ?: e.javaClass.simpleName}")
        }
        return esito
    }

    // La riunione si chiude con il verbale dello Shell: decisioni, questioni aperte, chi fa cosa. Il 26/09 il verbale
    // poteva proporre azioni, e ne è uscito «Tutto proposto. Conferma quello che vuoi…» al posto del verbale: ora è
    // una chiamata SENZA strumenti, con la forma dichiarata prima e controllata dopo (Tavolo.SEZIONI, detta e
    // verifica). La chiusura non dipende dal modello: senza risposta si chiude lo stesso, e la mancanza resta scritta.
    // Se cade la rete verso la cassetta, la riunione resta aperta e il verbale già scritto si riprova, non si riscrive.
    suspend fun chiudiRiunione(): Esito {
        val tavolo = Tavolo(archivio, impostazioni, cassetta)
        if (!tavolo.aperta()) return Esito("", emptyList())
        val tema = impostazioni.riunioneTema
        val verbale = impostazioni.riunioneVerbale.ifBlank {
            scriviVerbale(tema).also { v ->
                impostazioni.riunioneVerbale = v
                archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.SHELL, testo = "Verbale della riunione «$tema»\n\n$v", istante = ora, modello = impostazioni.modello))
            }
        }
        tavolo.chiudi(verbale)
        return Esito(verbale, emptyList())
    }

    private suspend fun scriviVerbale(tema: String): String {
        controllaSpesa()?.let { return "(Verbale non scritto: $it)" }
        val istantanea = fotografia(LocalDate.now(), 0)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", Contesto.sistema(istantanea)) })
        lavoro += storia(archivio.db.messaggi().ultimi(60))
        lavoro += buildJsonObject {
            put("role", "user")
            put("content", "[Nota del programma, non del Ghost] Il Ghost chiude la riunione «$tema». Scrivi il verbale, denso, con queste " +
                "sezioni, ognuna su una riga sua seguita da elenchi «- »: ${Tavolo.SEZIONI.joinToString(", ") { "«$it»" }}. Solo ciò che è stato " +
                "detto in riunione. Non proporre azioni adesso: ciò che va fatto sta sotto «Chi fa cosa», e il Ghost lo chiederà in chat.")
        }
        for (giro in 0..1) {
            val r = try {
                chiama(impostazioni.modello, JsonArray(lavoro), null, MAX_TOKEN, temperaturaDi(Compito.TURNO)).first
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                return "(Verbale non scritto: il modello non ha risposto — ${e.message ?: e.javaClass.simpleName}.)"
            }
            registraCosto(r)
            val t = Testi.senzaFinteNote(r.testo)
            val mancano = Tavolo.mancano(t)
            if (mancano.isEmpty()) return t
            // Il disaccordo torna al modello una volta; poi la rinuncia resta scritta nel verbale stesso.
            if (giro == 1) return "(Verbale senza la forma richiesta: mancano ${mancano.joinToString(", ") { "«$it»" }}.)\n\n$t"
            lavoro += buildJsonObject { put("role", "assistant"); put("content", t) }
            lavoro += buildJsonObject {
                put("role", "user")
                put("content", "[Nota del programma, non del Ghost] Nel verbale mancano le sezioni ${mancano.joinToString(", ") { "«$it»" }}. Riscrivilo intero, con tutte e tre.")
            }
        }
        return ""
    }

    // Il turno di lavoro su una consegna: lo apre il programma, il giorno prima della scadenza, anche ad app chiusa.
    // Ciò che lo Shell prepara resta proposta: niente si salva senza il tocco del Ghost.
    suspend fun lavoraConsegna(c: it.resonance.adam.dati.Consegna): Esito {
        controllaSpesa()?.let { return Esito(it, emptyList()) }
        nota("Turno di lavoro dello Shell sulla consegna ${it.resonance.adam.logica.Consegne.riga(c)}.")
        val oggi = LocalDate.now()
        val istantanea = fotografia(oggi, 2)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", Contesto.sistema(istantanea)) })
        lavoro += storia(archivio.db.messaggi().ultimi(16))
        lavoro += buildJsonObject {
            put("role", "user")
            put("content", "[Nota del programma, non del Ghost] È il turno di lavoro sulla tua consegna presa il ${c.presa}: «${c.cosa}». " +
                "Il programma verificherà: ${it.resonance.adam.logica.Consegne.forma(c)}, scritto da quando l'hai presa e non vuoto. Scadenza: ${c.scadenza}. " +
                "Lavoraci adesso: leggi ciò che ti serve, poi proponi salva_documento con quel titolo esatto (o modifica_documento se esiste già) e il " +
                "contenuto completo. Poi scrivi al Ghost in tre righe cosa hai preparato e cosa deve confermare. Se non ci riesci, dillo e perché: " +
                "una consegna mancata è una traccia legittima.")
        }
        return ciclo(lavoro, oggi, regole(istantanea, ""), impostazioni.modello, null, 0.0, origine = "consegna")
    }

    // La perturbazione: il programma ha visto un ristagno nei numeri e chiede allo Shell UN esperimento. Non è un
    // messaggio del Ghost e non si finge tale: in chat compare come nota del programma, la proposta si conferma a mano.
    suspend fun perturba(motivi: List<String>): Esito {
        if (motivi.isEmpty()) return Esito("", emptyList())
        controllaSpesa()?.let { return Esito(it, emptyList()) }
        nota("Il programma ha visto un ristagno: ${motivi.joinToString("; ")}.")
        val oggi = LocalDate.now()
        val istantanea = fotografia(oggi, 2)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", Contesto.sistema(istantanea)) })
        lavoro += storia(archivio.db.messaggi().ultimi(16))
        lavoro += buildJsonObject {
            put("role", "user")
            put("content", "[Nota del programma, non del Ghost] Ristagno visto nei dati: ${motivi.joinToString("; ")}. " +
                "Proponi UN esperimento con proponi_esperimento: una cosa concreta e diversa da ciò che è già stato provato (guarda gli esperimenti chiusi), " +
                "audace ma sostenibile, legata a uno di questi numeri. Poi spiega al Ghost in tre righe perché proprio questa. Niente rimproveri, niente elenchi di consigli.")
        }
        return ciclo(lavoro, oggi, regole(istantanea, ""), impostazioni.modello, null, 0.0, origine = "perturbazione", compito = Compito.ESPERIMENTO)
    }

    private suspend fun ciclo(lavoro: MutableList<JsonObject>, oggi: LocalDate, regole: Regole, modello: String, motore: String?,
                              costoIniziale: Double, origine: String = "shell", compito: Compito = Compito.TURNO, forza: Forzatura? = null): Esito {
        var costoTurno = costoIniziale
        val temperatura = forza?.temperatura ?: temperaturaDi(compito)
        var usata: Double? = null
        var rifiutate = 0
        var troncata = false
        val proposte = mutableListOf<Long>()
        var testo = ""
        // Cosa ha fatto lo Shell con gli strumenti, in breve: se finisce i giri, il Ghost vede dove si è impigliato.
        val traccia = mutableListOf<String>()
        var esauriti = false
        // Chiamate scritte come testo: si rimandano al modello una volta sola.
        var corretto = false

        try {
            for (giro in 0 until GIRI_MASSIMI) {
                val (r, t) = chiama(modello, JsonArray(lavoro), Azioni.definizioni(), MAX_TOKEN, temperatura)
                usata = t
                registraCosto(r)
                costoTurno += r.costo ?: 0.0
                testo = r.testo
                if (r.troncata) troncata = true
                if (r.chiamate.isEmpty()) {
                    val scritte = Testi.chiamateScritte(r.testo, Azioni.strumenti.map { it.nome })
                    if (scritte.isNotEmpty() && !corretto && giro < GIRI_MASSIMI - 1) {
                        corretto = true
                        traccia += "chiamate scritte come testo (${scritte.joinToString()})"
                        lavoro += buildJsonObject { put("role", "assistant"); put("content", r.testo) }
                        lavoro += buildJsonObject {
                            put("role", "user")
                            put("content", "[Nota del programma, non del Ghost] Hai scritto ${scritte.joinToString()} come testo: così non esiste nessuna " +
                                "proposta. Falle con gli strumenti, poi rispondi al Ghost senza riscriverle.")
                        }
                        continue
                    }
                    if (r.troncata) nota(if (r.testo.isBlank()) "La risposta si è interrotta prima di arrivare (limite di lunghezza): riprova, o chiedi una cosa per volta."
                        else "La risposta è stata tagliata dal limite di lunghezza.")
                    break
                }
                if (giro == GIRI_MASSIMI - 1) esauriti = true
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
                        is Validazione.Interna -> interna(v)
                        is Validazione.Rifiutata -> "Rifiutata dal programma: ${v.motivo}. Correggi e riprova, oppure chiedi al Ghost."
                        is Validazione.Scrittura -> when (val r = risolvi((v.proposta as? Proposta.ApriEsperimento)?.copy(origine = origine) ?: v.proposta)) {
                            is Risoluzione.Domanda -> "Non proposta: ${r.motivo}."
                            is Risoluzione.Pronta -> if (inAttesa(Azioni.codifica(r.proposta))) "Non proposta: una proposta uguale è già in attesa. Di' al Ghost di premere Conferma su quella." else {
                                val descr = r.proposta.descrizione()
                                proposte += archivio.db.messaggi().inserisci(Messaggio(
                                    ruolo = Ruolo.PROPOSTA, testo = descr, istante = ora,
                                    proposta = Azioni.codifica(r.proposta), stato = StatoProposta.IN_ATTESA,
                                ))
                                "Proposta mostrata al Ghost, in attesa della sua conferma: ${descr.trimEnd('.')}. Non è ancora eseguita."
                            }
                        }
                    }
                    if (risultato.startsWith("Rifiutata") || risultato.startsWith("Chiamata non eseguita") || risultato.startsWith("Non proposta")) rifiutate++
                    traccia += c.nome + when {
                        risultato.startsWith("Rifiutata") || risultato.startsWith("Chiamata non eseguita") -> " rifiutato (${Testi.corto(risultato.substringAfter(": "), 70)})"
                        risultato.startsWith("Non proposta") -> " fermato (${Testi.corto(risultato.substringAfter(": "), 70)})"
                        risultato.startsWith("Proposta mostrata") -> " proposto"
                        risultato.startsWith("Nel taccuino") -> " scritto nel taccuino"
                        else -> " letto"
                    }
                    lavoro += buildJsonObject {
                        put("role", "tool"); put("tool_call_id", c.id); put("name", c.nome); put("content", risultato)
                    }
                }
            }
            // Finiti i giri con uno strumento ancora in mano, il Ghost restava senza risposta (visto il 24/09):
            // un'ultima chiamata SENZA strumenti lo obbliga a rispondere con ciò che ha.
            if (esauriti) {
                lavoro += buildJsonObject {
                    put("role", "user")
                    put("content", "[Nota del programma, non del Ghost] Hai finito i giri di strumenti. Rispondi ora al Ghost, in testo, con ciò che hai. Se qualcosa è stato rifiutato, di' cosa e perché, e cosa ti serve da lui.")
                }
                val (r, t) = chiama(modello, JsonArray(lavoro), null, MAX_TOKEN, temperatura)
                usata = t
                registraCosto(r)
                costoTurno += r.costo ?: 0.0
                testo = r.testo
                nota("Lo Shell ha finito i giri di strumenti (${traccia.joinToString("; ")}): gli è stato chiesto di rispondere con ciò che aveva.")
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            val t = "Il modello non ha risposto: ${e.message ?: e.javaClass.simpleName}"
            nota(t)
            registraTurno(compito, modello, usata ?: temperatura, forza != null, proposte, rifiutate, troncata, esauriti, errore = true, costoTurno)
            return Esito(t, proposte)
        }
        val finta = Testi.fintaNota(testo)
        if (finta) testo = Testi.senzaFinteNote(testo)
        if (testo.isNotBlank()) archivio.db.messaggi().inserisci(Messaggio(ruolo = Ruolo.SHELL, testo = testo, istante = ora,
            modello = modello, costo = costoTurno.takeIf { it > 0 }, motore = motore, temperatura = usata, forzata = forza != null))
        registraTurno(compito, modello, usata, forza != null, proposte, rifiutate, troncata, esauriti, errore = false, costoTurno)
        if (proposte.isEmpty() && Testi.affermaAzione(testo))
            nota("Nessuna azione è stata eseguita in questo turno: le azioni vere compaiono come proposte da confermare e poi come ricevute.")
        if (finta) nota("Lo Shell aveva scritto un'etichetta che non è sua («[Nota del programma …]» o «[L'architetto …]»): tolta. Le etichette le mette solo il programma.")
        Testi.chiamateScritte(testo, Azioni.strumenti.map { it.nome }).takeIf { it.isNotEmpty() && proposte.isEmpty() }?.let {
            nota("Lo Shell ha scritto ${it.joinToString()} come testo invece di proporlo: non c'è niente da confermare. Chiedigli di proporlo davvero.")
        }
        if (proposte.isEmpty() && Testi.promette(testo))
            nota("Lo Shell non torna da solo su questo, a meno di una consegna (prendi_consegna) o di un evento in calendario: chiedigli l'una o l'altro.")
        return Esito(testo, proposte)
    }

    companion object {
        // Erano 4: tre letture e una ricerca bastavano a finirli (visto il 24/09, «dove hai registrato…»).
        const val GIRI_MASSIMI = 6
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
            val (r, _) = chiama(Instradatore.MODELLO, Instradatore.messaggi(testo, precedente, allegati), null, 5, Compito.MOTORE.temperatura, rapida = true)
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
    // L'accettore prima dell'effettore: una modifica che alla conferma fallirebbe non si mostra al Ghost. Visto il 24/09:
    // tre proposte sul quaderno Vidya, vuoto, con un'ancora che non c'era; il Ghost confermava e riceveva «non modificato».
    private suspend fun risolvi(p: Proposta): Risoluzione = when (p) {
        is Proposta.CreaEvento, is Proposta.SpostaEvento, is Proposta.TogliEvento -> mondo?.risolvi(p) ?: Risoluzione.Domanda("il calendario non è raggiungibile da qui")
        is Proposta.ScriviMail -> when (val r = risolviAllegato(p)) {
            is Risoluzione.Pronta -> mondo?.risolvi(r.proposta) ?: r
            is Risoluzione.Domanda -> r
        }
        is Proposta.TogliDocumento -> try {
            Risoluzione.Pronta(p.copy(titolo = archivio.documento(p.titolo).titolo))
        } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "documento non trovato") }
        is Proposta.ModificaAppunto -> try {
            val a = archivio.appuntoVivo(p.appunto)
            val (_, dubbie) = Lavagna.trova(a, p.togli)
            if (dubbie.isEmpty()) Risoluzione.Pronta(p.copy(appunto = a.titolo))
            else Risoluzione.Domanda("in «${a.titolo}» non trovo con certezza ${dubbie.joinToString { "«$it»" }}; le righe sono: ${Lavagna.righe(a).joinToString("; ") { it.testo }}")
        } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "appunto non trovato") }
        is Proposta.ModificaQuaderno -> if (p.modo == "aggiungi") Risoluzione.Pronta(p) else {
            val attuale = archivio.db.quaderni().elenco().find { it.pilastro == p.pilastro }?.testo.orEmpty()
            provaAncora(p, "il quaderno ${p.pilastro.etichetta}", attuale, p.ancora)
        }
        is Proposta.ModificaDocumento -> try {
            val d = archivio.documento(p.documento)
            provaAncora(p, "il documento «${d.titolo}»", d.testo, p.ancora)
        } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "documento non trovato") }
        is Proposta.AggiungiNodi -> risolviAggiungi(p)
        is Proposta.SpostaNodi -> try {
            val per = archivio.percorso(p.percorso)
            val tutti = archivio.db.percorsi().elencoNodi().filter { it.percorsoId == per.id }
            val nodi = p.nodi.map { e ->
                when (val n = nodo(p.percorso, e)) { is Nodo -> n; is Risoluzione.Domanda -> return n; else -> return Risoluzione.Domanda("nodo «$e» non trovato") }
            }.distinctBy { it.id }
            val (sotto, nuovo) = p.sotto?.let { raccoglitore(tutti, it) ?: return Risoluzione.Domanda("«$it» è un sotto-nodo: due livelli al massimo, scegli un nodo di primo livello") } ?: (null to false)
            val g = sotto?.let { s -> tutti.find { it.genitoreId == null && it.etichetta == s } }
            when {
                g != null && nodi.any { it.id == g.id } -> Risoluzione.Domanda("«${g.etichetta}» non può andare sotto sé stesso")
                sotto != null && nodi.any { Nodi.haFigli(tutti, it.id) } ->
                    Risoluzione.Domanda("«${nodi.first { Nodi.haFigli(tutti, it.id) }.etichetta}» ha dei sotto-nodi: non può andare sotto un altro (due livelli al massimo)")
                !nuovo && nodi.all { it.genitoreId == g?.id } -> Risoluzione.Domanda("sono già " + (sotto?.let { "sotto «$it»" } ?: "al primo livello"))
                else -> Risoluzione.Pronta(Proposta.SpostaNodi(per.titolo, nodi.map { it.etichetta }, sotto, nuovo))
            }
        } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "percorso non trovato") }
        // Anche il nodo si cerca prima: una proposta che alla conferma non trova il nodo non si mostra.
        is Proposta.StatoDelNodo -> when (val n = nodo(p.percorso, p.nodo)) {
            is Risoluzione.Domanda -> n
            is Nodo -> {
                val figli = archivio.db.percorsi().elencoNodi().count { it.genitoreId == n.id }
                when {
                    figli > 0 -> Risoluzione.Domanda("lo stato di «${n.etichetta}» lo calcola il programma dai suoi $figli sotto-nodi: cambia quello di un sotto-nodo")
                    n.stato == p.stato -> Risoluzione.Domanda("«${n.etichetta}» è già ${p.stato.etichetta}")
                    else -> Risoluzione.Pronta(p)
                }
            }
            else -> Risoluzione.Pronta(p)
        }
        is Proposta.PilastroNodo -> when (val n = nodo(p.percorso, p.nodo)) {
            is Risoluzione.Domanda -> n
            is Nodo -> {
                val per = archivio.percorso(p.percorso)
                when {
                    per.pilastro != Pilastro.ADAM -> Risoluzione.Domanda("«${per.titolo}» è di ${per.pilastro.etichetta}: il pilastro sui nodi c'è solo nei percorsi di Adam")
                    n.genitoreId != null -> Risoluzione.Domanda("«${n.etichetta}» è un sotto-nodo: prende il pilastro del padre, dallo a quello")
                    n.pilastro == p.pilastro -> Risoluzione.Domanda("«${n.etichetta}» è già in ${p.pilastro.etichetta}")
                    else -> Risoluzione.Pronta(p.copy(percorso = per.titolo, nodo = n.etichetta))
                }
            }
            else -> Risoluzione.Pronta(p)
        }
        is Proposta.TogliNodo -> when (val n = nodo(p.percorso, p.nodo)) {
            is Risoluzione.Domanda -> n
            is Nodo -> Risoluzione.Pronta(p.copy(nodo = n.etichetta))
            else -> Risoluzione.Pronta(p)
        }
        else -> Risoluzione.Pronta(p)
    }

    // Il nodo che raccoglie: esatto fra quelli di primo livello (nuovo = false), o da creare (nuovo = true).
    // Null se quel nome è già un sotto-nodo. Esatto, non «contiene»: «Scaletta» non deve cadere su «Assimilazione scaletta…».
    private fun raccoglitore(tutti: List<Nodo>, sotto: String): Pair<String, Boolean>? {
        val c = Testi.normalizza(sotto)
        Nodi.radici(tutti).find { Testi.normalizza(it.etichetta) == c }?.let { return it.etichetta to false }
        return if (tutti.any { Testi.normalizza(it.etichetta) == c }) null else sotto.trim() to true
    }

    // Il nodo esatto, o la domanda da rimandare al modello con i nodi veri.
    private suspend fun nodo(percorso: String, nodo: String): Any = try {
        val per = archivio.percorso(percorso)
        val nodi = archivio.db.percorsi().elencoNodi().filter { it.percorsoId == per.id }
        val c = Testi.normalizza(nodo)
        val trovati = nodi.filter { Testi.normalizza(it.etichetta) == c }.ifEmpty {
            nodi.filter { Testi.normalizza(it.etichetta).contains(c) || c.contains(Testi.normalizza(it.etichetta)) }
        }
        when {
            trovati.size == 1 -> trovati.single()
            trovati.isEmpty() -> Risoluzione.Domanda("in «${per.titolo}» non c'è un nodo «$nodo». " +
                (if (nodi.isEmpty()) "Il percorso non ha nodi: aggiungili con aggiungi_nodi" else "Nodi: ${nodi.sortedBy { it.ordine }.joinToString("; ") { it.etichetta }}. Se manca, aggiungilo con aggiungi_nodi"))
            else -> Risoluzione.Domanda("«$nodo» corrisponde a più nodi: ${trovati.joinToString("; ") { it.etichetta }}. Usa l'etichetta intera")
        }
    } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "percorso non trovato") }

    // L'allegato si risolve PRIMA di proporre: un appunto della lavagna o un documento, col testo che partirà. Il PDF esce
    // dal telefono: il guardiano dei nomi protetti lo controlla qui, come le lettere.
    private suspend fun risolviAllegato(p: Proposta.ScriviMail): Risoluzione {
        val nome = p.allegato ?: return Risoluzione.Pronta(p)
        val (titolo, testo) = try {
            archivio.appuntoVivo(nome).let { it.titolo to Lavagna.perCondividere(it) }
        } catch (e: Ambiguo) {
            val docs = archivio.db.percorsi().elencoDocumenti()
            val n = Testi.normalizza(nome)
            val d = docs.filter { Testi.normalizza(it.titolo) == n }.ifEmpty { docs.filter { Testi.normalizza(it.titolo).contains(n) } }
            if (d.size != 1) return Risoluzione.Domanda("non trovo con certezza «$nome» da allegare, né sulla lavagna né fra i documenti" +
                if (d.size > 1) ": più documenti corrispondono (${d.joinToString { "«${it.titolo}»" }})" else "")
            d.single().titolo to (d.single().titolo + "\n\n" + d.single().testo)
        }
        val v = Uscita.violazioni(testo, Uscita.nomi(archivio.db.profilo().leggi()?.nomiProtetti.orEmpty()), "")
        if (v.isNotEmpty()) return Risoluzione.Domanda("l'allegato «$titolo» contiene ${v.joinToString { "«$it»" }}, un nome che il Ghost non fa uscire: non si allega")
        return Risoluzione.Pronta(p.copy(allegato = titolo, allegatoTesto = testo))
    }

    private suspend fun risolviAggiungi(p: Proposta.AggiungiNodi): Risoluzione = try {
        risolviAggiungiDentro(p)
    } catch (e: Ambiguo) { Risoluzione.Domanda(e.message ?: "percorso non trovato") }

    private suspend fun risolviAggiungiDentro(p: Proposta.AggiungiNodi): Risoluzione {
        val per = archivio.percorso(p.percorso)
        val tutti = archivio.db.percorsi().elencoNodi().filter { it.percorsoId == per.id }
        if (p.pilastro != null && per.pilastro != Pilastro.ADAM)
            return Risoluzione.Domanda("il pilastro si dà ai nodi solo nei percorsi di Adam: «${per.titolo}» è di ${per.pilastro.etichetta}, togli «pilastro»")
        if (p.pilastro != null && p.sotto != null)
            return Risoluzione.Domanda("i sotto-nodi prendono il pilastro del padre: togli «pilastro», o dallo al padre con pilastro_nodo")
        val (sotto, nuovo) = p.sotto?.let { raccoglitore(tutti, it) ?: return Risoluzione.Domanda("«$it» è un sotto-nodo: due livelli al massimo, scegli un nodo di primo livello") } ?: (null to false)
        val esistenti = tutti.map { Testi.normalizza(it.etichetta) }.toSet() + listOfNotNull(sotto?.let(Testi::normalizza))
        val nuovi = p.nodi.filter { Testi.normalizza(it) !in esistenti }
        val saltati = p.nodi.filter { Testi.normalizza(it) in esistenti }
        return if (nuovi.isEmpty()) Risoluzione.Domanda("in «${per.titolo}» ci sono già tutti: " +
            (if (sotto != null) "per metterli sotto «$sotto» usa sposta_nodi" else "per lo stato usa stato_nodo"))
        else Risoluzione.Pronta(Proposta.AggiungiNodi(per.titolo, nuovi, sotto, nuovo, saltati, p.pilastro))
    }

    // ── Pacchetto Adam (25/09/2026) ──

    private suspend fun fotografia(oggi: LocalDate, giorniAgenda: Int) =
        archivio.istantanea(oggi, mondo?.agenda(oggi, giorniAgenda) ?: AgendaLetta.NonLetta)
            .copy(temperature = impostazioni.temperature, riunione = impostazioni.riunioneTema.takeIf { impostazioni.riunione.isNotBlank() }.orEmpty())

    // La temperatura di un compito: quella confermata dal Ghost su proposta dello Shell, altrimenti la tabella.
    private fun temperaturaDi(c: Compito) = impostazioni.temperature[c.name] ?: c.temperatura

    // Il taccuino: lo Shell scrive e riprende senza conferma, perché non tocca niente. Il risultato torna al modello.
    private suspend fun interna(v: Validazione.Interna): String = when (v.nome) {
        "scrivi_taccuino" -> {
            val id = archivio.db.taccuino().inserisci(Nota(testo = Azioni.stringa(v.argomenti, "testo").orEmpty().trim(), creata = ora, ripresa = ora))
            "Nel taccuino: nota #$id. Evapora tra ${Taccuino.GIORNI} giorni se non la riprendi."
        }
        "riprendi_nota" -> {
            val id = Azioni.intero(v.argomenti, "id", -1).toLong()
            val n = archivio.db.taccuino().per(id)
            when {
                n == null -> "Nel taccuino non c'è la nota #$id."
                n.tolta -> "Nel taccuino la nota #$id l'ha tolta il Ghost: non si riprende. Se l'idea vale ancora, scrivila di nuovo."
                else -> { archivio.db.taccuino().aggiorna(n.copy(ripresa = ora)); "Nel taccuino: nota #$id ripresa, vive altri ${Taccuino.GIORNI} giorni." }
            }
        }
        // Le spunte della lavagna: senza conferma (sono del Ghost, piccole, si annullano con un tocco), ma la ricevuta
        // va in chat come ogni azione vera — il Ghost al supermercato deve vedere cosa è stato spuntato.
        "spunta_appunto" -> {
            val fatta = Azioni.stringa(v.argomenti, "fatta")?.lowercase() != "false"
            val e = archivio.spunta(Azioni.stringa(v.argomenti, "appunto").orEmpty(), Azioni.elenco(v.argomenti, "righe"), fatta)
            archivio.db.messaggi().inserisci(Messaggio(ruolo = if (e.riuscita) Ruolo.RICEVUTA else Ruolo.NOTA, testo = e.ricevuta, istante = ora))
            if (e.riuscita) "Fatto davvero, senza conferma: ${e.ricevuta}." else "Non spuntato: ${e.ricevuta}."
        }
        else -> "Strumento interno non previsto."
    }

    // La voce dello Shell sulla propria regolazione: vale dal turno dopo, resta scritta nel diario di Adam col perché.
    private suspend fun regolaTemperatura(p: Proposta.RegolaTemperatura): Esecuzione {
        val c = Compito.entries.find { it.name == p.compito } ?: return Esecuzione(false, "Compito sconosciuto: ${p.compito}")
        val prima = temperaturaDi(c)
        impostazioni.temperature = impostazioni.temperature + (c.name to p.valore)
        val t = "Temperatura per «${c.etichetta}»: ${Temperatura.etichetta(prima, false)} → ${Temperatura.etichetta(p.valore, false)}, dal prossimo turno. Perché: ${p.perche}"
        archivio.db.voci().inserisci(Voce(pilastro = Pilastro.ADAM, giorno = LocalDate.now().toString(), testo = t, fonte = "regolazione", creato = ora, aggiornato = ora))
        return Esecuzione(true, t)
    }

    private suspend fun spedisciLettera(p: Proposta.LetteraArchitetto): Esecuzione {
        val id = archivio.db.lettere().inserisci(it.resonance.adam.dati.Lettera(oggetto = p.oggetto, testo = p.testo, creata = ora))
        val posta = Corrispondenza(archivio, impostazioni, cassetta)
        if (!posta.pronta()) return Esecuzione(true, "Lettera «${p.oggetto}» pronta: parte appena in Setup c'è la cassetta delle lettere")
        val l = posta.spedisci(archivio.db.lettere().per(id)!!)
        return if (l.stato == it.resonance.adam.dati.StatoLettera.INVIATA) Esecuzione(true, "Lettera «${p.oggetto}» spedita all'architetto (n. ${l.numero}): risponde entro un giorno")
        else Esecuzione(true, "Lettera «${p.oggetto}» salvata, ma non è partita (${l.errore}): si riprova da sola")
    }

    // Il dado della domenica: il caso lo tira il programma (seme scritto), lo Shell ci lavora sopra. Da qui esce una
    // domanda o una proposta da confermare, mai un'azione.
    suspend fun dado(scelta: it.resonance.adam.logica.Dado.Scelta, seme: Long): Esito {
        controllaSpesa()?.let { return Esito(it, emptyList()) }
        val cosa = it.resonance.adam.logica.Dado.descrizione(scelta)
        nota("Il dado della domenica (seme $seme) ha scelto $cosa.")
        val oggi = LocalDate.now()
        val istantanea = fotografia(oggi, 2)
        val lavoro = mutableListOf<JsonObject>(buildJsonObject { put("role", "system"); put("content", Contesto.sistema(istantanea)) })
        lavoro += storia(archivio.db.messaggi().ultimi(16))
        lavoro += buildJsonObject {
            put("role", "user")
            put("content", "[Nota del programma, non del Ghost] Il dado della domenica ti porta $cosa. Non l'hai scelto tu. " +
                "Scrivi al Ghost poche righe: cosa ti fa pensare, e una domanda o una proposta (anche con gli strumenti). Non spiegare il dado.")
        }
        return ciclo(lavoro, oggi, regole(istantanea, ""), impostazioni.modello, null, 0.0, origine = "dado", compito = Compito.DADO)
    }

    // Il Ghost scrive «sì» e il modello rifà la stessa proposta: una sola in attesa basta.
    private suspend fun inAttesa(codifica: String) = archivio.db.messaggi().ultimi(40)
        .any { it.ruolo == Ruolo.PROPOSTA && it.stato == StatoProposta.IN_ATTESA && it.proposta == codifica }

    private fun provaAncora(p: Proposta, dove: String, testo: String, ancora: String): Risoluzione = when {
        testo.isBlank() -> Risoluzione.Domanda("$dove è vuoto: non c'è niente da sostituire. Per scriverci usa modo aggiungi")
        else -> when (Testi.ancora(testo, ancora)) {
            is Testi.Ancora.Trovata -> Risoluzione.Pronta(p)
            is Testi.Ancora.Doppia -> Risoluzione.Domanda("l'ancora «${Testi.corto(ancora, 60)}» compare più volte in $dove: allungala finché è unica")
            is Testi.Ancora.Assente -> Risoluzione.Domanda("l'ancora «${Testi.corto(ancora, 60)}» non c'è in $dove. Copiala esatta da una di queste righe, " +
                "o usa modo aggiungi: " + Quaderni.righe(testo).take(15).joinToString(" | ") { "«${Testi.corto(it, 90)}»" })
        }
    }

    // Gli indirizzi validi sono quelli che il Ghost ha scritto: in chat, nel profilo, nei quaderni. Il modello non ne inventa.
    private suspend fun regole(i: it.resonance.adam.logica.Istantanea, testoGhost: String): Regole {
        val nomiProtetti = i.profilo?.nomiProtetti.orEmpty()
        val scritti = buildString {
            archivio.db.messaggi().elenco().filter { it.ruolo == Ruolo.GHOST }.forEach { appendLine(it.testo) }
            archivio.db.quaderni().elenco().forEach { appendLine(it.testo) }
            archivio.db.profilo().leggi()?.let { appendLine(it.vincoli); appendLine(it.motivazione) }
        }
        return Regole(Uscita.nomi(nomiProtetti), Uscita.indirizzi(scritti), testoGhost, it.resonance.adam.logica.Esperimenti.aperti(i.esperimenti), i.consegne, i.appunti)
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
        val e = when {
            p is Proposta.RegolaTemperatura -> regolaTemperatura(p)
            p is Proposta.LetteraArchitetto -> spedisciLettera(p)
            versoIlMondo(p) -> mondo?.esegui(p) ?: Esecuzione(false, "Non eseguito: calendario e posta si usano dall'app aperta")
            else -> archivio.esegui(p)
        }
        archivio.db.messaggi().aggiorna(m.copy(stato = if (e.riuscita) StatoProposta.ESEGUITA else StatoProposta.FALLITA))
        archivio.db.messaggi().inserisci(Messaggio(ruolo = if (e.riuscita) Ruolo.RICEVUTA else Ruolo.NOTA, testo = e.ricevuta, istante = ora))
        // Un documento appena salvato può mantenere una consegna: si guarda subito, non alla scadenza.
        if (e.riuscita) runCatching { archivio.verificaConsegne() }.getOrDefault(emptyList()).forEach { c -> nota(it.resonance.adam.logica.Consegne.traccia(c)) }
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
        val sistema = Contesto.sistema(fotografia(oggi, 1))
        val richiesta = "È il momento: $momento. Dati del programma per questo momento:\n$riassunto\n\n" +
            "Scrivi al Ghost UN messaggio di notifica: al massimo due righe, nessun saluto di rito. " +
            "Nomina un solo fatto dai dati e una sola cosa concreta da fare o da notare. Non inventare numeri."
        val messaggi = JsonArray(listOf(
            buildJsonObject { put("role", "system"); put("content", sistema) },
            buildJsonObject { put("role", "user"); put("content", richiesta) },
        ))
        return runCatching {
            val (r, _) = chiama(impostazioni.modello, messaggi, null, MAX_TOKEN_BATTITO, temperaturaDi(Compito.BATTITO))
            registraCosto(r)
            r.testo.takeIf { it.isNotBlank() }
        }.getOrNull()
    }
}
