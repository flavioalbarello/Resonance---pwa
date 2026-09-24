package it.resonance.adam.logica

import it.resonance.adam.dati.Pilastro
import it.resonance.adam.dati.TipoMisura
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class AzioniTest {
    private val oggi = LocalDate.of(2026, 9, 23)
    private fun args(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject
    private fun rifiuto(v: Validazione) = (v as Validazione.Rifiutata).motivo

    @Test fun ogniStrumentoHaUnoSchemaConRequired() {
        Azioni.strumenti.forEach { assertTrue(it.nome, it.parametri.containsKey("required")) }
        assertEquals(Azioni.strumenti.size, Azioni.definizioni().size)
    }

    @Test fun letturaNonDiventaProposta() {
        assertTrue(Azioni.valida("cerca", args("""{"testo":"sonno"}"""), oggi) is Validazione.Lettura)
    }

    @Test fun misuraValidaDiventaPropostaConGiornoDiOggi() {
        val p = (Azioni.valida("registra_misura", args("""{"tipo":"peso","valore":"82,4"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals(Proposta.RegistraMisura(TipoMisura.PESO, 82.4, "2026-09-23"), p)
    }

    @Test fun sonnoInOreInveceCheMinutiVieneRifiutatoConLaRagione() {
        val v = Azioni.valida("registra_misura", args("""{"tipo":"SONNO","valore":1500}"""), oggi)
        assertTrue(rifiuto(v).contains("unità"))
    }

    @Test fun entrataSenzaSapereSeLegataAlTempoSiChiede() {
        val v = Azioni.valida("registra_misura", args("""{"tipo":"ENTRATA","valore":50}"""), oggi)
        assertTrue(rifiuto(v).contains("legata_al_tempo"))
    }

    @Test fun ilFuturoNonSiRegistra() {
        val v = Azioni.valida("scrivi_voce", args("""{"pilastro":"BIO","testo":"x","giorno":"2026-09-30"}"""), oggi)
        assertTrue(rifiuto(v).contains("futuro"))
    }

    @Test fun ieriSiCapisce() {
        val p = (Azioni.valida("spunta_rituale", args("""{"nome":"Camminata","giorno":"ieri"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals("2026-09-22", (p as Proposta.SpuntaRituale).giorno)
    }

    @Test fun unTitoloCheEUnaFraseNonDiventaUnPercorso() {
        val v = Azioni.valida("crea_percorso", args("""{"pilastro":"VIDYA","titolo":"voglio imparare a suonare meglio il flauto traverso","nodi":["a"]}"""), oggi)
        assertTrue(rifiuto(v).contains("frase"))
    }

    @Test fun percorsoInAdamRifiutato() {
        assertTrue(Azioni.valida("crea_percorso", args("""{"pilastro":"ADAM","titolo":"X","nodi":["a"]}"""), oggi) is Validazione.Rifiutata)
    }

    @Test fun criterioRitualeNormalizzato() {
        val p = (Azioni.valida("crea_rituale", args("""{"nome":"Dormire","pilastro":"BIO","criterio":"SONNO >= 420"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals("SONNO>=420", (p as Proposta.CreaRituale).criterio)
    }

    @Test fun propostaSopravviveAllaCodifica() {
        val p = Proposta.CreaPercorso(Pilastro.VIDYA, "Divenire", "musicista", listOf("Atto I", "Atto II"))
        assertEquals(p, Azioni.decodifica(Azioni.codifica(p)))
    }

    @Test fun strumentoSconosciutoRifiutato() {
        assertTrue(Azioni.valida("manda_mail", args("{}"), oggi) is Validazione.Rifiutata)
    }

    @Test fun modificaConAncoraUnica() {
        val r = Testi.applicaModifica("Atto I. Il seme.", "Il seme.", "Prologo:", "prima")
        assertEquals("Atto I. Prologo: Il seme.", (r as Testi.Modifica.Fatta).testo)
        val d = Testi.applicaModifica("Atto I.", "Atto I.", "Fine.", "dopo")
        assertEquals("Atto I. Fine.", (d as Testi.Modifica.Fatta).testo)
    }

    @Test fun ancoraAssenteODoppiaNonIndovina() {
        assertTrue(Testi.applicaModifica("a b a", "a", "x", "sostituisci") is Testi.Modifica.Impossibile)
        assertTrue(Testi.applicaModifica("a b", "c", "x", "sostituisci") is Testi.Modifica.Impossibile)
    }

    @Test fun affermazioneDiAzioneRiconosciuta() {
        assertTrue(Testi.affermaAzione("Ho registrato il tuo peso."))
        assertTrue(Testi.affermaAzione("Fatto: abbiamo appena salvata la nota"))
        assertFalse(Testi.affermaAzione("Vuoi che registri il peso?"))
        assertFalse(Testi.affermaAzione("Ho visto che dormi poco."))
    }

    // Visto il 24/09: «Domani… riprendiamo» da un modello che domani non torna da solo.
    @Test fun unaPromessaSulFuturoRiconosciuta() {
        assertTrue(Testi.promette("Perfetto, domani riprendiamo da qui."))
        assertTrue(Testi.promette("Ti ricorderò di pesarti."))
        assertTrue(Testi.promette("Ne riparliamo stasera"))
        assertFalse(Testi.promette("Domani ti conviene fare colazione presto."))
        assertFalse(Testi.promette("Vuoi che lo metta in calendario per ricordartelo?"))
        assertFalse(Testi.promette("Riprendiamo il piano: lunedì avena."))
    }

    @Test fun perTogliereUnaRigaDalQuadernoNonSiRiscriveTutto() {
        val p = (Azioni.valida("modifica_quaderno", args("""{"pilastro":"bio","ancora":"Lavoro manuale sporco","testo":"","modo":"sostituisci"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals(Proposta.ModificaQuaderno(Pilastro.BIO, "Lavoro manuale sporco", "", "sostituisci"), p)
        assertTrue(p.descrizione(), p.descrizione().startsWith("Dal quaderno Bio, togliere «Lavoro manuale sporco»"))
        assertTrue(rifiuto(Azioni.valida("modifica_quaderno", args("""{"pilastro":"bio","ancora":"x","testo":"","modo":"dopo"}"""), oggi)).contains("sostituisci"))
    }

    @Test fun aggiungereAlQuadernoNonChiedeUnAncora() {
        val p = (Azioni.valida("modifica_quaderno", args("""{"pilastro":"VIDYA","testo":"Cover band di Rino Gaetano con alcuni musicisti.","modo":"aggiungi"}"""), oggi) as Validazione.Scrittura).proposta
        assertEquals(Proposta.ModificaQuaderno(Pilastro.VIDYA, "", "Cover band di Rino Gaetano con alcuni musicisti.", "aggiungi"), p)
        assertTrue(p.descrizione(), p.descrizione().startsWith("Nel quaderno Vidya, aggiungere in fondo"))
        assertTrue(rifiuto(Azioni.valida("modifica_quaderno", args("""{"pilastro":"VIDYA","testo":"x","modo":"dopo"}"""), oggi)).contains("modo aggiungi"))
    }
}
