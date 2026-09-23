package it.resonance.adam.dati

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

// Le forme dei dati: sono la parte che deve sopravvivere a qualunque cambio di supporto.
// Ogni modifica qui = nuova versione di Database + migrazione, mai una forma cambiata in silenzio.

enum class Pilastro(val etichetta: String) { BIO("Bio"), AIR("Air"), VIDYA("Vidya"), ADAM("Adam") }

enum class Aggregazione { ULTIMO, MEDIA, SOMMA }

enum class TipoMisura(
    val pilastro: Pilastro,
    val etichetta: String,
    val unita: String,
    val aggregazione: Aggregazione,
    val minimo: Double,
    val massimo: Double,
) {
    PESO(Pilastro.BIO, "Peso", "kg", Aggregazione.ULTIMO, 25.0, 350.0),
    SONNO(Pilastro.BIO, "Sonno", "min", Aggregazione.MEDIA, 0.0, 1080.0),
    PASSI(Pilastro.BIO, "Passi", "", Aggregazione.MEDIA, 0.0, 100000.0),
    FC_RIPOSO(Pilastro.BIO, "FC a riposo", "bpm", Aggregazione.MEDIA, 25.0, 150.0),
    ALLENAMENTO(Pilastro.BIO, "Allenamento", "min", Aggregazione.SOMMA, 0.0, 720.0),
    ENTRATA(Pilastro.AIR, "Entrate", "€", Aggregazione.SOMMA, 0.01, 1_000_000.0),
    PRATICA(Pilastro.VIDYA, "Pratica", "min", Aggregazione.SOMMA, 1.0, 960.0),
    OPERA(Pilastro.VIDYA, "Opere chiuse", "", Aggregazione.SOMMA, 1.0, 50.0),
}

enum class StatoNodo(val etichetta: String) {
    NON_INIZIATO("non iniziato"), INTRODOTTO("introdotto"), PRATICATO("praticato"), CONSOLIDATO("consolidato")
}

enum class Ruolo { GHOST, SHELL, PROPOSTA, RICEVUTA, NOTA }

enum class StatoProposta { IN_ATTESA, ESEGUITA, RIFIUTATA, FALLITA }

@Serializable
@Entity(
    tableName = "misure",
    indices = [Index(value = ["idEsterno"], unique = true), Index("tipo"), Index("giorno")],
)
data class Misura(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val tipo: TipoMisura,
    val valore: Double,
    val giorno: String,
    val istante: Long,
    val fonte: String,
    val nota: String = "",
    // Solo per ENTRATA: il pilastro AIR misura l'autonomia, cioè il denaro che NON vende tempo.
    val legataAlTempo: Boolean? = null,
    val idEsterno: String? = null,
)

@Serializable
@Entity(tableName = "voci", indices = [Index(value = ["idEsterno"], unique = true), Index("pilastro")])
data class Voce(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val pilastro: Pilastro,
    val giorno: String,
    val testo: String,
    val fonte: String,
    val creato: Long,
    val aggiornato: Long,
    val idEsterno: String? = null,
)

// Legge 14: un testo sostituito non si perde, scende qui.
@Serializable
@Entity(tableName = "versioni", indices = [Index(value = ["entita", "idEntita"])])
data class Versione(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val entita: String,
    val idEntita: Long,
    val testo: String,
    val sostituitoIl: Long,
)

@Serializable
@Entity(tableName = "rituali")
data class Rituale(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val nome: String,
    val pilastro: Pilastro,
    // Es. "SONNO>=420": se c'è, il rituale si spunta da solo quando la misura lo soddisfa.
    val criterio: String? = null,
    val attivo: Boolean = true,
    val creato: Long,
)

@Serializable
@Entity(tableName = "spunte", primaryKeys = ["ritualeId", "giorno"])
data class Spunta(
    val ritualeId: Long,
    val giorno: String,
    val fonte: String,
    val istante: Long,
)

@Serializable
@Entity(tableName = "percorsi", indices = [Index(value = ["idEsterno"], unique = true)])
data class Percorso(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val pilastro: Pilastro,
    val titolo: String,
    val scopo: String = "",
    val creato: Long,
    val archiviato: Boolean = false,
    val idEsterno: String? = null,
)

@Serializable
@Entity(tableName = "nodi", indices = [Index("percorsoId")])
data class Nodo(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val percorsoId: Long,
    val etichetta: String,
    val stato: StatoNodo = StatoNodo.NON_INIZIATO,
    val ordine: Int,
)

@Serializable
@Entity(tableName = "documenti", indices = [Index("percorsoId")])
data class Documento(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val percorsoId: Long,
    val nodoId: Long? = null,
    val titolo: String,
    val testo: String,
    val creato: Long,
    val aggiornato: Long,
)

// La memoria procedurale: letta dallo Shell a ogni turno, leggibile e correggibile dal Ghost.
@Serializable
@Entity(tableName = "quaderni")
data class Quaderno(
    @PrimaryKey val pilastro: Pilastro,
    val testo: String,
    val aggiornato: Long,
)

@Serializable
@Entity(tableName = "messaggi")
data class Messaggio(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val ruolo: Ruolo,
    val testo: String,
    val istante: Long,
    val proposta: String? = null,
    val stato: StatoProposta? = null,
)

// Totalizzatore proprio: il tetto di spesa non può leggere da un registro che ruota.
@Serializable
@Entity(tableName = "spesa")
data class SpesaMese(
    @PrimaryKey val mese: String,
    val dollari: Double,
    val chiamate: Int,
)

@Serializable
@Entity(tableName = "profilo")
data class Profilo(
    @PrimaryKey val id: Int = 1,
    val nome: String = "",
    val stile: String = "",
    val motivazione: String = "",
    // Un vincolo per riga, "[BIO] testo".
    val vincoli: String = "",
    // Nomi che identificano il Ghost e non escono dal telefono senza un suo gesto (es. il marchio professionale).
    @ColumnInfo(defaultValue = "") val nomiProtetti: String = "",
)
