package it.resonance.adam.logica

import it.resonance.adam.dati.Rituale

// I gesti dalla notifica (01/10/2026, la lente dell'esoscheletro): il battito scriveva per primo, ma per rispondere o
// spuntare un rituale bisognava aprire l'app, trovare la chat e scrivere. Qui si decide che cosa la notifica offre.
// Android mostra al massimo tre azioni: una è «Rispondi», le altre due sono rituali.
object Gesti {
    const val RITUALI_MAX = 2

    /**
     * I rituali da spuntare con un tocco: quelli a mano (un rituale automatico lo spunta la misura, non il Ghost),
     * non ancora tenuti oggi, nell'ordine in cui il Ghost li ha creati. In pausa («Sono via») niente.
     */
    fun daSpuntare(stati: List<StatoRituale>, via: Boolean): List<Rituale> =
        if (via) emptyList() else stati.filter { it.rituale.criterio == null && !it.tenuta.oggi }.map { it.rituale }.take(RITUALI_MAX)

    /** Durante una riunione la risposta deve passare dal tavolo (verbale, filtro architetto): dalla notifica no. */
    fun puoRispondere(riunione: String) = riunione.isBlank()

    // Ciò che resta nella notifica dopo una risposta: si vede che è partita, senza riaprire l'app.
    fun mandato(testo: String) = "Mandato allo Shell: «${testo.trim().take(120)}»"
}
