package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.db.FindAllMealRecordCovers
import dev.marulabs.noodlemap.db.NoodleMapDb
import java.util.UUID

/**
 * The one place the "latest meal record" order lives (GLOSSARY.md 食べた記録): newest meal record date first, a meal record
 * without a date counting as the oldest, then the most recently created (created_at has milliseconds),
 * then the id, so the order never depends on how rows were read.
 */
internal fun <T> latestFirst(eatenOn: (T) -> String?, createdAt: (T) -> String, id: (T) -> UUID): Comparator<T> =
    compareByDescending<T, String?>(nullsFirst(naturalOrder())) { eatenOn(it) }
        .thenByDescending { createdAt(it) }
        .thenByDescending { id(it).toString() }

/** Meal record counts of every shop with one, from one query; shops without one are absent. */
fun mealRecordCountsByShop(db: NoodleMapDb): Map<UUID, Int> =
    db.mealRecordsQueries.countMealRecordsByShop().executeAsList().associate { it.shop_id to it.meal_record_count.toInt() }

private val COVER_ORDER = latestFirst<FindAllMealRecordCovers>({ it.eaten_on }, { it.created_at }, { it.meal_record_id })

/**
 * The selected record's first image, falling back to the latest record with images.
 */
fun coverPhotoKeysByShop(db: NoodleMapDb): Map<UUID, String> {
    val representatives = db.shopRepresentativeMealRecordsQueries.findAllRepresentativeMealRecords()
        .executeAsList().associate { it.shop_id to it.meal_record_id }
    return db.mealRecordImagesQueries.findAllMealRecordCovers().executeAsList().groupBy { it.shop_id }
        .mapValues { (shopId, covers) ->
            (covers.find { it.meal_record_id == representatives[shopId] } ?: covers.minWith(COVER_ORDER)).storage_key
        }
}
