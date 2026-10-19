package it.resonance.adam.logica

import it.resonance.adam.dati.Misura
import it.resonance.adam.dati.TipoMisura
import java.time.LocalDate
import java.util.Locale
import kotlin.math.abs
import kotlin.random.Random

// Le scoperte (19/10/2026). Il Ghost: «mi piacerebbe che l'app facesse qualcosa di strabiliante e inaspettato».
// L'app cerca da sola, nei dati che ha già, relazioni che nessuno le ha chiesto: «le sere in cui fai Stretching, la notte
// dopo dormi 34 minuti in più». Il modello non c'entra: è il programma che va a cercarle davvero, e le prova.
//
// Come si evita di spacciare il caso per una scoperta (è il punto, non un dettaglio):
// - la prova è per permutazione: si rimescolano a caso i giorni «con» e «senza» migliaia di volte, e si conta quante
//   volte il caso produce una differenza almeno così grande. Nessuna ipotesi sulla forma dei dati;
// - si provano MOLTE coppie, quindi qualcuna passerebbe per caso: la soglia si corregge per il numero di prove
//   (Benjamini–Hochberg), e serve anche un effetto abbastanza grande da contare nella vita, non solo nei numeri;
// - servono abbastanza giorni da entrambe le parti; i giorni di pausa e oggi (ancora a metà) non contano;
// - deve reggere nel tempo: stesso verso nella prima e nella seconda metà dei giorni;
// - una relazione ovvia non si mostra: un rituale automatico «sonno almeno 7h» e il sonno sono la stessa cosa.
// Una scoperta è una correlazione, non una causa: per questo il gesto che la segue è «mettila alla prova», cioè un
// esperimento con bersaglio dichiarato prima (logica/Esperimenti.kt). L'anello si chiude lì.
object Scoperte {
    const val GIORNI = 90                 // quanto indietro si guarda
    const val PER_PARTE = 6               // giorni minimi «con» e «senza»
    const val PERMUTAZIONI = 3000
    const val Q = 0.05                    // tasso di false scoperte accettato, sull'insieme delle prove
    const val P_MASSIMO = 0.001           // e comunque mai sopra questo (uno su mille)
    // Il banco l'ha mostrato il 19/10: con soglie più larghe, un mondo di puro rumore su venti «scopriva» qualcosa. Per il
    // Ghost una scoperta falsa costa più di cento mancate: in più la relazione deve REGGERE nel tempo, cioè vedersi, nello
    // stesso verso, sia nella prima sia nella seconda metà dei giorni. Il caso raramente si ripete due volte.

    /** Il minimo che conta nella vita, per ogni effetto: sotto, anche se vero, non vale la pena dirlo. */
    fun minimo(t: TipoMisura): Double = when (t) {
        TipoMisura.SONNO -> 20.0
        TipoMisura.PASSI -> 1000.0
        TipoMisura.FC_RIPOSO -> 2.0
        TipoMisura.PRATICA -> 10.0
        else -> Double.MAX_VALUE
    }

    val EFFETTI = listOf(TipoMisura.SONNO, TipoMisura.PASSI, TipoMisura.FC_RIPOSO, TipoMisura.PRATICA)

    /** Una cosa che il Ghost fa (o che gli succede) in un giorno: sì o no. */
    data class Causa(val chiave: String, val frase: String, val giorni: Set<LocalDate>, val dal: LocalDate, val esclude: TipoMisura? = null,
                     val tipo: TipoMisura? = null)

    data class Scoperta(
        val causa: Causa, val effetto: TipoMisura, val ritardo: Int,
        val conMedia: Double, val senzaMedia: Double, val nCon: Int, val nSenza: Int, val p: Double, val regge: Boolean = true,
    ) {
        val chiave get() = "${causa.chiave}>${effetto.name}>$ritardo"
        val differenza get() = conMedia - senzaMedia
        val forza get() = abs(differenza) / minimo(effetto)
        fun testo(): String = "${quando()} in cui ${causa.frase}, ${dopo()} ${effetto()} (${nCon} volte contro ${nSenza}; " +
            "il caso lo farebbe ${volte()})"

        private fun quando() = if (effetto == TipoMisura.SONNO && ritardo == 1) "Le sere" else "I giorni"
        private fun dopo() = when {
            ritardo == 0 -> "lo stesso giorno"
            effetto == TipoMisura.SONNO -> "la notte dopo"
            else -> "il giorno dopo"
        }
        private fun effetto(): String {
            val d = abs(differenza)
            val piu = differenza > 0
            return when (effetto) {
                TipoMisura.SONNO -> "dormi ${Esiti.formatta(effetto, d)} " + if (piu) "in più" else "in meno"
                TipoMisura.PASSI -> "fai ${Esiti.formatta(effetto, d)} passi " + if (piu) "in più" else "in meno"
                TipoMisura.FC_RIPOSO -> "il battito a riposo è " + (if (piu) "più alto" else "più basso") + " di ${Esiti.formatta(effetto, d)}"
                TipoMisura.PRATICA -> "studi ${Esiti.formatta(effetto, d)} " + if (piu) "in più" else "in meno"
                else -> Esiti.formatta(effetto, d)
            }
        }
        private fun volte(): String {
            val su1000 = p * 1000
            return if (su1000 < 1) "meno di una volta su mille" else String.format(Locale.ITALY, "%.0f volte su mille", su1000)
        }
    }

    /** Le cause possibili: i rituali, lo studio, l'allenamento, e i giorni sopra la mediana di passi e di sonno. */
    fun cause(misure: List<Misura>, rituali: List<Pair<it.resonance.adam.dati.Rituale, Set<LocalDate>>>, oggi: LocalDate): List<Causa> = buildList {
        val da = oggi.minusDays(GIORNI.toLong())
        rituali.forEach { (r, giorni) ->
            val nato = java.time.Instant.ofEpochMilli(r.creato).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
            add(Causa("rituale:${r.id}", "fai «${r.nome}»", giorni, maxOf(nato, da),
                esclude = Stabilita.leggiCriterio(r.criterio)?.tipo))
        }
        fun quantita(t: TipoMisura, chiave: String, frase: String) {
            val serie = Esiti.serieGiornaliera(misure, t).filter { it.valore > 0 }
            if (serie.isEmpty()) return
            add(Causa(chiave, frase, serie.map { it.giorno }.toSet(), maxOf(serie.first().giorno, da), tipo = t))
        }
        quantita(TipoMisura.PRATICA, "studio", "studi")
        quantita(TipoMisura.ALLENAMENTO, "allenamento", "ti alleni")
        fun sopra(t: TipoMisura, frase: (Double) -> String) {
            val serie = Esiti.serieGiornaliera(misure, t).filter { !it.giorno.isBefore(da) && it.giorno.isBefore(oggi) }
            if (serie.size < PER_PARTE * 2) return
            val mediana = serie.map { it.valore }.sorted()[serie.size / 2]
            add(Causa("sopra:${t.name}", frase(mediana), serie.filter { it.valore >= mediana }.map { it.giorno }.toSet(), serie.first().giorno, tipo = t))
        }
        sopra(TipoMisura.PASSI) { "cammini più di ${Esiti.formatta(TipoMisura.PASSI, it)} passi" }
        sopra(TipoMisura.SONNO) { "hai dormito almeno ${Esiti.formatta(TipoMisura.SONNO, it)}" }
    }

    /**
     * Tutte le prove, poi solo ciò che regge: p corretto per il numero di prove e un effetto che conta.
     * `pausa`: i giorni in cui il Ghost era via, che non contano né da una parte né dall'altra.
     */
    fun cerca(misure: List<Misura>, cause: List<Causa>, oggi: LocalDate, pausa: Set<LocalDate> = emptySet(), seme: Long = 42): List<Scoperta> {
        val prove = mutableListOf<Scoperta>()
        for (c in cause) for (e in EFFETTI) for (ritardo in 0..1) {
            if (c.esclude == e || c.tipo == e) continue
            // Lo stesso giorno: il sonno di oggi è la notte prima, non può venire da ciò che si fa oggi.
            if (e == TipoMisura.SONNO && ritardo == 0 && c.tipo != TipoMisura.SONNO) continue
            val y = valori(misure, e, oggi)
            val coppie = mutableListOf<Pair<Boolean, Double>>()
            var g = c.dal
            while (g.isBefore(oggi)) {
                val d = g.plusDays(ritardo.toLong())
                if (g !in pausa && d !in pausa && d.isBefore(oggi)) y[d]?.let { v -> coppie += (g in c.giorni) to v }
                g = g.plusDays(1)
            }
            val con = coppie.filter { it.first }.map { it.second }
            val senza = coppie.filterNot { it.first }.map { it.second }
            if (con.size < PER_PARTE || senza.size < PER_PARTE) continue
            val p = permutazione(con, senza, Random(seme + c.chiave.hashCode() * 31 + e.ordinal * 7 + ritardo))
            val tutta = con.average() - senza.average()
            // Regge nel tempo: in ciascuna metà dei giorni, stesso verso e almeno metà della differenza.
            val regge = coppie.chunked((coppie.size + 1) / 2).all { meta ->
                val a = meta.filter { it.first }.map { it.second }; val b = meta.filterNot { it.first }.map { it.second }
                a.size >= 2 && b.size >= 2 && (a.average() - b.average()).let { it * tutta > 0 && abs(it) >= abs(tutta) / 2 }
            }
            prove += Scoperta(c, e, ritardo, con.average(), senza.average(), con.size, senza.size, p, regge)
        }
        return reggono(prove)
    }

    /** I valori giornalieri di un effetto. Per lo studio un giorno senza è zero, ma solo da quando si studia. */
    private fun valori(misure: List<Misura>, t: TipoMisura, oggi: LocalDate): Map<LocalDate, Double> {
        val serie = Esiti.serieGiornaliera(misure, t).associate { it.giorno to it.valore }
        if (t != TipoMisura.PRATICA || serie.isEmpty()) return serie
        val primo = serie.keys.min()
        return generateSequence(primo) { it.plusDays(1) }.takeWhile { it.isBefore(oggi) }.associateWith { serie[it] ?: 0.0 }
    }

    /** Quante volte, rimescolando, il caso dà una differenza almeno così grande. Il +1 non lascia mai p = 0. */
    fun permutazione(a: List<Double>, b: List<Double>, r: Random, volte: Int = PERMUTAZIONI): Double {
        val vera = abs(a.average() - b.average())
        val tutti = (a + b).toDoubleArray()
        var oltre = 0
        repeat(volte) {
            for (i in tutti.indices.reversed()) { val j = r.nextInt(i + 1); val t = tutti[i]; tutti[i] = tutti[j]; tutti[j] = t }
            var sa = 0.0
            for (i in a.indices) sa += tutti[i]
            var sb = 0.0
            for (i in a.size until tutti.size) sb += tutti[i]
            if (abs(sa / a.size - sb / b.size) >= vera - 1e-9) oltre++
        }
        return (oltre + 1.0) / (volte + 1.0)
    }

    /** Benjamini–Hochberg sulle prove fatte, più l'effetto minimo: ciò che resta, dal più forte. Una per coppia causa–effetto. */
    fun reggono(prove: List<Scoperta>): List<Scoperta> {
        if (prove.isEmpty()) return emptyList()
        val ordinate = prove.sortedBy { it.p }
        val m = ordinate.size
        val k = ordinate.indices.lastOrNull { i -> ordinate[i].p <= Q * (i + 1) / m } ?: return emptyList()
        return ordinate.take(k + 1)
            .filter { it.p <= P_MASSIMO && it.regge && abs(it.differenza) >= minimo(it.effetto) }
            .sortedByDescending { it.forza }
            .distinctBy { it.causa.chiave to it.effetto }
    }

    /** Dall'istantanea: i rituali coi loro giorni (anche quelli automatici), le misure, i giorni di pausa. */
    fun da(i: Istantanea): List<Scoperta> =
        cerca(i.misure, cause(i.misure, Contesto.statoRituali(i).map { it.rituale to it.giorni }, i.oggi), i.oggi, i.pausa)

    /** Per lo Shell: ciò che il programma ha trovato, detto come correlazione, non come causa. */
    fun perLoShell(trovate: List<Scoperta>): String = trovate.take(3).joinToString("\n") { "- ${it.testo()}" }

    /** La prima da mostrare: la più forte che il Ghost non ha già chiuso. */
    fun daMostrare(trovate: List<Scoperta>, chiuse: Set<String>): Scoperta? = trovate.firstOrNull { it.chiave !in chiuse }

    /** L'esperimento che la mette alla prova: fare la causa più spesso per 14 giorni, e vedere se l'effetto si muove. */
    fun esperimento(s: Scoperta): Proposta.ApriEsperimento = Proposta.ApriEsperimento(
        titolo = "Più spesso: ${s.causa.frase}".replaceFirstChar { it.uppercase() }.take(90),
        tipo = s.effetto,
        direzione = if (s.differenza > 0) it.resonance.adam.dati.Direzione.SU else it.resonance.adam.dati.Direzione.GIU,
        giorni = 14,
        soglia = maxOf(Esperimenti.sogliaPredefinita(s.effetto), abs(s.differenza) / 2),
        perche = "Una scoperta del programma: ${s.testo()}. Se è vera, farlo più spesso dovrebbe muovere il numero.",
        origine = "scoperta",
    )
}
