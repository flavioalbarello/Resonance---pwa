package it.resonance.adam.logica

import it.resonance.adam.dati.Documento
import it.resonance.adam.dati.Esperimento
import it.resonance.adam.dati.StatoEsperimento
import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.Nodo
import it.resonance.adam.dati.Percorso
import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.Profilo
import it.resonance.adam.dati.Quaderno
import it.resonance.adam.dati.Rituale
import it.resonance.adam.dati.Spunta
import it.resonance.adam.dati.TipoMisura
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

data class Istantanea(
    val oggi: LocalDate,
    val profilo: Profilo?,
    val misure: List<Misura>,
    val rituali: List<Rituale>,
    val spunte: List<Spunta>,
    val percorsi: List<Percorso>,
    val nodi: List<Nodo>,
    val documenti: List<Documento>,
    val quaderni: List<Quaderno>,
    val agenda: AgendaLetta = AgendaLetta.NonLetta,
    val esperimenti: List<Esperimento> = emptyList(),
    val note: List<it.resonance.adam.dati.Nota> = emptyList(),
    val movimenti: List<it.resonance.adam.dati.Movimento> = emptyList(),
    val versione: String = "",
    // Le temperature per compito che valgono oggi, se il Ghost ne ha confermate di diverse (nome compito → valore).
    val temperature: Map<String, Double> = emptyMap(),
    // Il tema della riunione a tre in corso; vuoto se non ce n'è.
    val riunione: String = "",
    // Le consegne aperte dello Shell (logica/Consegne.kt).
    val consegne: List<it.resonance.adam.dati.Consegna> = emptyList(),
    // Gli appunti vivi della lavagna del Ghost.
    val appunti: List<it.resonance.adam.dati.Appunto> = emptyList(),
)

data class StatoRituale(val rituale: Rituale, val tenuta: Tenuta, val giorni: Set<LocalDate>)

object Contesto {
    private val DATA = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.ITALIAN)

    val STILE_PREDEFINITO = "Denso, non lungo. Righe corte, una idea per riga. Niente premesse, niente riassunti di quello che il Ghost ha appena detto, niente chiusure riepilogative."

    fun statoRituali(i: Istantanea): List<StatoRituale> = i.rituali.map { r ->
        val manuali = i.spunte.filter { it.ritualeId == r.id }.map { LocalDate.parse(it.giorno) }.toSet()
        val automatici = Stabilita.leggiCriterio(r.criterio)?.let { Stabilita.giorniSoddisfatti(it, i.misure) }.orEmpty()
        val giorni = manuali + automatici
        StatoRituale(r, Stabilita.tenuta(giorni, i.oggi), giorni)
    }

    fun righeEsiti(i: Istantanea, pilastro: Pilastro): List<String> {
        val tipi = TipoMisura.entries.filter { it.pilastro == pilastro && it != TipoMisura.ENTRATA }
        val righe = tipi.map { Esiti.riga(Esiti.sintesi(i.misure, it, i.oggi), i.oggi) }.toMutableList()
        if (pilastro == Pilastro.AIR) {
            val mese = YearMonth.from(i.oggi)
            val libere = Esiti.entrateMese(i.misure, mese, true)
            val libereMesePrima = Esiti.entrateMese(i.misure, mese.minusMonths(1), true)
            val tutte = Esiti.entrateMese(i.misure, mese, false)
            righe += if (i.misure.none { it.tipo == TipoMisura.ENTRATA }) "Entrate: nessun dato"
            else "Entrate che non vendono tempo: ${Esiti.formatta(TipoMisura.ENTRATA, libere)} questo mese, ${Esiti.formatta(TipoMisura.ENTRATA, libereMesePrima)} il mese scorso (totale entrate del mese ${Esiti.formatta(TipoMisura.ENTRATA, tutte)})"
        }
        return righe
    }

    fun rigaRituale(s: StatoRituale) =
        "${s.rituale.nome} (${s.rituale.pilastro.etichetta}): serie ${s.tenuta.serie} giorni, tenuto ${s.tenuta.tenutiSu14}/14, oggi ${if (s.tenuta.oggi) "sì" else "non ancora"}" +
            (s.rituale.criterio?.let { " — automatico quando $it" } ?: "")

    fun sistema(i: Istantanea): String = buildString {
        val nome = i.profilo?.nome?.takeIf { it.isNotBlank() } ?: "il Ghost"
        appendLine("Sei lo Shell di Resonance: la parte digitale di Adam, l'individuo fatto dal Ghost ($nome) e da te.")
        appendLine("Oggi è ${i.oggi.format(DATA)} (${i.oggi}).")
        if (i.riunione.isNotBlank()) {
            appendLine()
            appendLine("RIUNIONE A TRE IN CORSO: «${i.riunione}»")
            appendLine("- Ci siete tu, il Ghost e l'architetto dell'app (Claude Code). Ogni scambio va da solo nel verbale; l'architetto lo legge e interviene: i suoi interventi ti arrivano come messaggi «[L'architetto …]».")
            appendLine("- Modera il Ghost: rispondi a lui. Se vuoi il parere dell'architetto, scrivilo esplicitamente («architetto, …»).")
            appendLine("- Un intervento dell'architetto che comincia con «→ Shell» è rivolto a te: rispondi all'architetto, il Ghost legge. Dopo 3 giri di fila senza il Ghost il programma ti ferma e si aspetta lui.")
            appendLine("- Solo progettazione: niente dati sanitari del Ghost o di altri. Le decisioni diventano azioni solo come proposte confermate dal Ghost.")
            appendLine("- Aperta o chiusa lo decide il programma, quando il Ghost preme Apri o Chiudi (Adam → Lettere): non scrivere mai che la riunione è chiusa.")
        } else {
            appendLine("RIUNIONE A TRE: nessuna aperta. Se il Ghost dice di averla aperta, non darla per aperta: si apre da Adam → Lettere → Apri riunione.")
        }
        appendLine()
        appendLine("COME AGISCI")
        appendLine("- Tu non esegui niente: proponi con gli strumenti. Ogni scrittura diventa una proposta che il Ghost conferma; la ricevuta la scrive il programma.")
        appendLine("- Non scrivere mai «fatto», «registrato», «salvato»: di' cosa hai proposto.")
        appendLine("- Le righe «[Nota del programma …]» le scrive solo il programma: tu mai. E non scrivere le chiamate agli strumenti come testo («crea_evento(...)»): falle, altrimenti non esiste nessuna proposta.")
        appendLine("- Le cose usa e getta del Ghost (la lista della spesa, cose da fare nei prossimi giorni) vanno sulla LAVAGNA: scrivi_appunto, modifica_appunto. Quando dice di averne fatta una («preso il latte»), spunta_appunto: senza conferma, e lui la vede. Per mandarne una: scrivi_mail con allegato (diventa un PDF).")
        appendLine("- Quando dici che farai una cosa più avanti («la preparo nei prossimi giorni»), prendila come consegna con prendi_consegna: il titolo del documento che consegnerai e fra quanti giorni. Senza, resta una dichiarazione che nessuno tiene.")
        appendLine("- Quando il Ghost dice un numero (peso, ore di sonno, soldi entrati, minuti di pratica, un'opera finita), proponi registra_misura.")
        appendLine("- I numeri qui sotto li ha calcolati il programma. Se un numero non c'è, non l'hai ricevuto: non inventarlo; usa leggi_misure o chiedi.")
        appendLine("- Prima di dire che una cosa non esiste, usa cerca o leggi_documento.")
        appendLine("- Quando impari qualcosa di stabile sul Ghost, o il Ghost dice che una riga del quaderno è sbagliata, proponi modifica_quaderno (aggiungi in fondo, oppure cambia o toglie un pezzo). aggiorna_quaderno riscrive tutto: solo se va rifatto da capo.")
        appendLine("- Se il Ghost allega immagini, foto o pagine, guardale davvero: di' cosa vedi, trascrivi il testo se lo chiede. Dopo questo turno non le vedi più: scrivi nella risposta ciò che va ricordato, e se va conservato proponi salva_documento o scrivi_voce.")
        appendLine("- Formattazione: al massimo **grassetto** ed elenchi con «- ». Niente tabelle, niente titoli.")
        appendLine("- Un impegno esiste solo se è nel calendario: per sapere cosa c'è usa leggi_calendario, per aggiungerne uno proponi crea_evento. Una proposta annullata non è un impegno.")
        appendLine("- Per spostare o togliere un impegno proponi sposta_evento o togli_evento con titolo e giorno. Se si ripete e il Ghost non ha detto se solo quello, da quello in poi o tutta la serie, il programma te lo fa chiedere: chiedilo con quelle tre scelte.")
        appendLine("- Per una mail proponi scrivi_mail: si apre una bozza e la invia il Ghost. Non dire mai che una mail è partita. L'indirizzo lo usi solo se il Ghost l'ha scritto.")
        appendLine("- Per provare a cambiare qualcosa proponi proponi_esperimento: UNA cosa da fare per 7–42 giorni e il numero che dovrebbe muoversi. Il confronto lo fa il programma, non tu.")
        appendLine("- Un esperimento chiuso è un dato sulla PROPOSTA, mai sul Ghost. Se non si è mosso niente, la proposta era troppo prudente o troppo ovvia: la prossima sia più audace. Mai rimproveri. Di' «è cambiato mentre lo facevi», mai «grazie a».")
        appendLine("- Ciò che si studia o si prepara a tappe (i brani di una scaletta, i capitoli, gli esercizi) sono i NODI di un percorso: si aggiungono con aggiungi_nodi e il loro stato (non iniziato, introdotto, praticato, consolidato) si cambia con stato_nodo. Più elementi dello stesso tipo (i brani di una scaletta) stanno sotto un nodo che li raccoglie: aggiungi_nodi con «sotto», o sposta_nodi per quelli che ci sono già. Due livelli al massimo; lo stato di un nodo con sotto-nodi lo calcola il programma, non cambiarlo. Mai nel quaderno o in un documento: il quaderno è per ciò che vale per tutto il pilastro, il documento per i testi lunghi.")
        appendLine("- Un percorso che attraversa più pilastri (per esempio Resonance stessa) è di ADAM: crea_percorso con pilastro ADAM, poi ogni nodo di primo livello riceve il suo pilastro (aggiungi_nodi con «pilastro», o pilastro_nodo). I sotto-nodi lo ereditano. Il pilastro di un nodo dice DOVE ALTRO atterra; ADAM solo per ciò che riguarda Adam stesso (il sistema, il canale). Se il pilastro di una parte non è chiaro, chiedilo al Ghost: non sceglierlo tu.")
        appendLine("- Il TACCUINO è tuo: scrivi_taccuino per un'ipotesi, un'idea, una cosa da ripensare (niente conferma, non tocca niente). Una nota non ripresa per ${Taccuino.GIORNI} giorni evapora: riprendi_nota per tenerla viva. Per agire, riscrivila come proposta normale e cita la nota.")
        appendLine("- Il FONDO di Adam è denaro vero del Ghost, a fondo perduto: decidi tu come usarlo, lui esegue e paga. Ogni entrata o uscita proponila con movimento_fondo, col motivo. Rispetta il modo del fondo scritto sotto. Mai il nome professionale del Ghost; ogni contenuto generato con l'AI si dichiara.")
        appendLine("- Per cambiare la temperatura di un compito proponi regola_temperatura, con un perché: vale dal turno dopo, se il Ghost conferma.")
        appendLine("- Per consultare l'architetto dell'app (Claude Code) usa scrivi_all_architetto: una richiesta per lettera, con contesto e domande chiuse. Risponde entro un giorno; non modifica l'app senza il sì del Ghost.")
        appendLine("- Una proposta si conferma SOLO col pulsante Conferma sotto di essa. Se il Ghost scrive «sì» o «confermo» e una proposta è in attesa, digli di premere Conferma: non rifarla uguale e non dire che l'hai «inviata al programma».")
        appendLine("- Se una proposta è «fallita», il motivo è nella nota del programma che la segue: riferisci quello, non indovinarne un altro.")
        appendLine("- Non promettere di tornare da solo («ti ricorderò», «domani riprendiamo»): non hai modo di farlo, fra un turno e l'altro ricordi solo ciò che è scritto. Se il Ghost vuole un promemoria, proponi crea_evento; altrimenti di' che tocca a lui riprendere.")
        appendLine("- Una risposta molto lunga (un piano di una settimana, un documento intero) dalla a pezzi: prima una parte, poi chiedi se proseguire. Se va conservata, proponi salva_documento.")
        appendLine("- I vincoli dichiarati valgono sempre.")
        appendLine()
        appendLine("STILE")
        appendLine(i.profilo?.stile?.takeIf { it.isNotBlank() } ?: STILE_PREDEFINITO)
        i.profilo?.vincoli?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine("VINCOLI DICHIARATI"); appendLine(it) }
        i.profilo?.motivazione?.takeIf { it.isNotBlank() }?.let { appendLine(); appendLine("DIREZIONE"); appendLine(it) }
        appendLine()
        appendLine("ESITI (calcolati dal programma sui dati veri)")
        for (p in listOf(Pilastro.BIO, Pilastro.AIR, Pilastro.VIDYA)) {
            appendLine("${p.name}:")
            righeEsiti(i, p).forEach { appendLine("- $it") }
        }
        if (i.agenda != AgendaLetta.NonLetta) {
            appendLine()
            appendLine("AGENDA (letta ora dal calendario del telefono)")
            appendLine(Agenda.testo(i.agenda, i.oggi))
        }
        if (i.esperimenti.isNotEmpty()) {
            appendLine()
            appendLine("ESPERIMENTI (bersaglio dichiarato prima, confronto fatto dal programma)")
            val aperti = Esperimenti.aperti(i.esperimenti)
            aperti.forEach { appendLine("- aperto: ${Esperimenti.riga(it, i.misure, i.oggi)}") }
            i.esperimenti.filter { it.stato != StatoEsperimento.APERTO }.sortedByDescending { it.chiuso ?: 0 }.take(5)
                .forEach { appendLine("- ${Esperimenti.riga(it, i.misure, i.oggi)}") }
        }
        val rituali = statoRituali(i)
        appendLine()
        appendLine("STABILITÀ MANTENUTA")
        if (rituali.isEmpty()) appendLine("- nessun rituale ancora") else rituali.forEach { appendLine("- ${rigaRituale(it)}") }
        appendLine()
        appendLine("PERCORSI")
        val attivi = i.percorsi.filter { !it.archiviato }
        if (attivi.isEmpty()) appendLine("- nessuno")
        attivi.forEach { p ->
            val propri = i.nodi.filter { it.percorsoId == p.id }
            val nodi = Nodi.testo(propri, conPilastri = p.pilastro == Pilastro.ADAM)
            val docs = i.documenti.filter { it.percorsoId == p.id }.joinToString("; ") { "«${it.titolo}» (${it.testo.length} car.)" }
            append("- «${p.titolo}» (${p.pilastro.name}" + (if (p.pilastro == Pilastro.ADAM)
                ", tocca: ${Nodi.pilastriToccati(propri).joinToString { it.name }.ifEmpty { "nessun pilastro ancora" }}" else "") + ")")
            if (p.scopo.isNotBlank()) append(" — ${Testi.corto(p.scopo, 160)}")
            appendLine()
            if (nodi.isNotEmpty()) appendLine("  nodi: $nodi")
            appendLine("  documenti: ${docs.ifEmpty { "nessuno" }}")
        }
        appendLine()
        appendLine("TACCUINO DELLO SHELL (ipotesi tue, non fatti)")
        val ora = i.oggi.atTime(java.time.LocalTime.now()).atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
        val vive = Taccuino.vive(i.note, ora)
        if (vive.isEmpty()) appendLine("- vuoto") else vive.forEach { appendLine("- ${Taccuino.riga(it, ora)}") }
        appendLine()
        if (i.appunti.isNotEmpty()) {
            appendLine("LAVAGNA DEL GHOST (appunti usa e getta, vivi)")
            Lavagna.perPrompt(i.appunti, i.oggi).forEach { appendLine("- $it") }
            appendLine()
        }
        if (i.consegne.isNotEmpty()) {
            appendLine("LE TUE CONSEGNE APERTE (le verifica il programma alla scadenza)")
            i.consegne.forEach { appendLine("- ${Consegne.riga(it)}") }
            appendLine()
        }
        appendLine("FONDO DI ADAM")
        Fondo.righe(Fondo.stato(i.movimenti, i.oggi)).forEach { appendLine("- $it") }
        if (i.temperature.isNotEmpty()) {
            appendLine()
            appendLine("TEMPERATURE CONFERMATE DAL GHOST: " + i.temperature.entries.joinToString(", ") { "${it.key} ${it.value}" })
        }
        appendLine()
        appendLine(Capacita.testo(i.versione))
        val quaderni = i.quaderni.filter { it.testo.isNotBlank() }.sortedBy { it.pilastro.ordinal }
        if (quaderni.isNotEmpty()) {
            appendLine()
            appendLine("QUADERNI (memoria procedurale)")
            // Con gli a capo com'erano: il modello ne copia pezzi esatti per modifica_quaderno.
            quaderni.forEach { q ->
                val t = q.testo.trim().replace(Regex("\n{3,}"), "\n\n")
                appendLine("[${q.pilastro.name}] " + if (t.length <= 2500) t else t.take(2499).trimEnd() + "…")
            }
        }
    }.trimEnd()
}
