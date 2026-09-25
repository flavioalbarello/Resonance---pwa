package it.resonance.adam.dati

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Database
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface MisureDao {
    @Query("SELECT * FROM misure ORDER BY giorno DESC, istante DESC") fun tutte(): Flow<List<Misura>>
    @Query("SELECT * FROM misure") suspend fun elenco(): List<Misura>
    @Query("SELECT * FROM misure WHERE giorno >= :da") suspend fun dal(da: String): List<Misura>
    // REPLACE sul vincolo unico di idEsterno: un aggregato di Health Connect riletto sostituisce il vecchio.
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun sostituisci(m: Misura): Long
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun inserisciSeNuova(m: Misura): Long
    @Query("DELETE FROM misure WHERE id = :id") suspend fun elimina(id: Long)
}

@Dao
interface EsperimentiDao {
    @Query("SELECT * FROM esperimenti ORDER BY creato DESC") fun tutti(): Flow<List<Esperimento>>
    @Query("SELECT * FROM esperimenti") suspend fun elenco(): List<Esperimento>
    @Insert suspend fun inserisci(e: Esperimento): Long
    @Update suspend fun aggiorna(e: Esperimento)
}

@Dao
interface VociDao {
    @Query("SELECT * FROM voci ORDER BY giorno DESC, creato DESC") fun tutte(): Flow<List<Voce>>
    @Query("SELECT * FROM voci") suspend fun elenco(): List<Voce>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun inserisci(v: Voce): Long
    @Update suspend fun aggiorna(v: Voce)
    @Query("SELECT * FROM voci WHERE id = :id") suspend fun per(id: Long): Voce?
}

@Dao
interface VersioniDao {
    @Insert suspend fun inserisci(v: Versione): Long
    @Query("SELECT * FROM versioni WHERE entita = :entita AND idEntita = :id ORDER BY sostituitoIl DESC") fun di(entita: String, id: Long): Flow<List<Versione>>
    @Query("SELECT * FROM versioni") suspend fun elenco(): List<Versione>
}

@Dao
interface RitualiDao {
    @Query("SELECT * FROM rituali WHERE attivo = 1 ORDER BY creato") fun attivi(): Flow<List<Rituale>>
    @Query("SELECT * FROM rituali") suspend fun elenco(): List<Rituale>
    @Insert suspend fun inserisci(r: Rituale): Long
    @Update suspend fun aggiorna(r: Rituale)
    @Query("SELECT * FROM spunte") fun spunte(): Flow<List<Spunta>>
    @Query("SELECT * FROM spunte") suspend fun elencoSpunte(): List<Spunta>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun spunta(s: Spunta): Long
    @Query("DELETE FROM spunte WHERE ritualeId = :id AND giorno = :giorno") suspend fun togli(id: Long, giorno: String)
}

@Dao
interface TaccuinoDao {
    @Insert suspend fun inserisci(n: Nota): Long
    @Update suspend fun aggiorna(n: Nota)
    @Query("SELECT * FROM taccuino ORDER BY ripresa DESC") suspend fun elenco(): List<Nota>
    @Query("SELECT * FROM taccuino ORDER BY ripresa DESC") fun tutte(): Flow<List<Nota>>
    @Query("SELECT * FROM taccuino WHERE id = :id") suspend fun per(id: Long): Nota?
}

@Dao
interface FondoDao {
    @Insert suspend fun inserisci(m: Movimento): Long
    @Query("SELECT * FROM movimenti ORDER BY giorno, creato") suspend fun elenco(): List<Movimento>
    @Query("SELECT * FROM movimenti ORDER BY giorno DESC, creato DESC") fun tutti(): Flow<List<Movimento>>
}

@Dao
interface LettereDao {
    @Insert suspend fun inserisci(l: Lettera): Long
    @Update suspend fun aggiorna(l: Lettera)
    @Query("SELECT * FROM lettere WHERE id = :id") suspend fun per(id: Long): Lettera?
    @Query("SELECT * FROM lettere ORDER BY creata") suspend fun elenco(): List<Lettera>
    @Query("SELECT * FROM lettere ORDER BY creata DESC") fun tutte(): Flow<List<Lettera>>
    @Insert suspend fun inserisciRisposta(r: RispostaLettera): Long
    @Query("SELECT * FROM risposte ORDER BY istante") suspend fun risposte(): List<RispostaLettera>
    @Query("SELECT * FROM risposte ORDER BY istante") fun tutteLeRisposte(): Flow<List<RispostaLettera>>
}

@Dao
interface TurniDao {
    @Insert suspend fun inserisci(t: Turno): Long
    @Query("SELECT * FROM (SELECT * FROM turni ORDER BY istante DESC LIMIT :n) ORDER BY istante") suspend fun ultimi(n: Int): List<Turno>
    @Query("SELECT * FROM turni ORDER BY istante DESC LIMIT :n") fun osserva(n: Int): Flow<List<Turno>>
}

@Dao
interface PercorsiDao {
    @Query("SELECT * FROM percorsi WHERE archiviato = 0 ORDER BY creato DESC") fun attivi(): Flow<List<Percorso>>
    @Query("SELECT * FROM percorsi") suspend fun elenco(): List<Percorso>
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun inserisci(p: Percorso): Long
    @Update suspend fun aggiorna(p: Percorso)
    @Query("SELECT * FROM nodi ORDER BY ordine") fun nodi(): Flow<List<Nodo>>
    @Query("SELECT * FROM nodi") suspend fun elencoNodi(): List<Nodo>
    @Insert suspend fun inserisciNodo(n: Nodo): Long
    @Update suspend fun aggiornaNodo(n: Nodo)
    @Delete suspend fun togliNodo(n: Nodo)
    @Query("UPDATE documenti SET nodoId = NULL WHERE nodoId = :id") suspend fun sganciaDocumenti(id: Long)
    @Query("SELECT * FROM documenti ORDER BY creato") fun documenti(): Flow<List<Documento>>
    @Query("SELECT * FROM documenti") suspend fun elencoDocumenti(): List<Documento>
    @Insert suspend fun inserisciDocumento(d: Documento): Long
    @Update suspend fun aggiornaDocumento(d: Documento)
}

@Dao
interface QuaderniDao {
    @Query("SELECT * FROM quaderni") fun tutti(): Flow<List<Quaderno>>
    @Query("SELECT * FROM quaderni") suspend fun elenco(): List<Quaderno>
    @Upsert suspend fun salva(q: Quaderno)
}

@Dao
interface MessaggiDao {
    @Query("SELECT * FROM messaggi ORDER BY istante, id") fun tutti(): Flow<List<Messaggio>>
    @Query("SELECT * FROM (SELECT * FROM messaggi ORDER BY istante DESC, id DESC LIMIT :n) ORDER BY istante, id") suspend fun ultimi(n: Int): List<Messaggio>
    @Query("SELECT * FROM messaggi WHERE id = :id") suspend fun per(id: Long): Messaggio?
    @Query("SELECT * FROM messaggi WHERE stato = 'IN_ATTESA' ORDER BY istante DESC LIMIT 1") suspend fun ultimaInAttesa(): Messaggio?
    @Insert suspend fun inserisci(m: Messaggio): Long
    @Update suspend fun aggiorna(m: Messaggio)
    @Query("SELECT * FROM messaggi") suspend fun elenco(): List<Messaggio>
    @Query("SELECT * FROM messaggi WHERE id > :id ORDER BY id") suspend fun dopo(id: Long): List<Messaggio>
}

@Dao
interface SpesaDao {
    @Query("SELECT * FROM spesa WHERE mese = :mese") suspend fun di(mese: String): SpesaMese?
    @Query("SELECT * FROM spesa WHERE mese = :mese") fun osserva(mese: String): Flow<SpesaMese?>
    @Upsert suspend fun salva(s: SpesaMese)
    @Query("SELECT * FROM spesa") suspend fun elenco(): List<SpesaMese>
}

@Dao
interface ProfiloDao {
    @Query("SELECT * FROM profilo WHERE id = 1") fun osserva(): Flow<Profilo?>
    @Query("SELECT * FROM profilo WHERE id = 1") suspend fun leggi(): Profilo?
    @Upsert suspend fun salva(p: Profilo)
}

@Database(
    entities = [Misura::class, Voce::class, Versione::class, Rituale::class, Spunta::class, Percorso::class,
        Nodo::class, Documento::class, Quaderno::class, Messaggio::class, SpesaMese::class, Profilo::class, Esperimento::class, Turno::class, Nota::class, Movimento::class, Lettera::class, RispostaLettera::class],
    version = 8,
    exportSchema = true,
    // 2: Profilo.nomiProtetti (calendario e posta, 23/09/2026).
    // 3: Messaggio.allegati (immagini e documenti nella chat, 23/09/2026).
    // 4: Messaggio.modello, costo, motore (scelta automatica del motore).
    // 5: esperimenti (l'anello di Anochin sulla vita).
    autoMigrations = [AutoMigration(from = 1, to = 2), AutoMigration(from = 2, to = 3), AutoMigration(from = 3, to = 4), AutoMigration(from = 4, to = 5), AutoMigration(from = 5, to = 6), AutoMigration(from = 6, to = 7), AutoMigration(from = 7, to = 8)],
)
abstract class Db : RoomDatabase() {
    abstract fun misure(): MisureDao
    abstract fun voci(): VociDao
    abstract fun versioni(): VersioniDao
    abstract fun rituali(): RitualiDao
    abstract fun percorsi(): PercorsiDao
    abstract fun quaderni(): QuaderniDao
    abstract fun messaggi(): MessaggiDao
    abstract fun turni(): TurniDao
    abstract fun taccuino(): TaccuinoDao
    abstract fun fondo(): FondoDao
    abstract fun lettere(): LettereDao
    abstract fun spesa(): SpesaDao
    abstract fun profilo(): ProfiloDao
    abstract fun esperimenti(): EsperimentiDao

    companion object {
        @Volatile private var istanza: Db? = null
        fun di(context: Context): Db = istanza ?: synchronized(this) {
            istanza ?: Room.databaseBuilder(context.applicationContext, Db::class.java, "resonance.db").build().also { istanza = it }
        }
    }
}
