package dev.marulabs.noodlemap.mealrecords

import dev.marulabs.noodlemap.db.FindAllMealRecordCovers
import dev.marulabs.noodlemap.db.FindAllMealRecordSummaries
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

/** What a shop derives from its meal records: 食べた and its お気に入り度. */
data class MealRecordSummary(val mealRecordCount: Int, val rate: Double?) {
    /** 食べた: at least one meal record. */
    val eaten: Boolean get() = mealRecordCount > 0

    companion object {
        val NONE = MealRecordSummary(0, null)
    }
}

private val SUMMARY_ORDER = latestFirst<FindAllMealRecordSummaries>({ it.eaten_on }, { it.created_at }, { it.id })

/** The shop's お気に入り度 is the rate of its latest meal record that has one. */
internal fun summarize(mealRecords: List<FindAllMealRecordSummaries>): MealRecordSummary =
    MealRecordSummary(mealRecords.size, mealRecords.filter { it.rate != null }.minWithOrNull(SUMMARY_ORDER)?.rate)

/** Summaries of every shop with a meal record, from one query; shops without one are absent. */
fun mealRecordSummariesByShop(db: NoodleMapDb): Map<UUID, MealRecordSummary> =
    db.mealRecordsQueries.findAllMealRecordSummaries().executeAsList().groupBy { it.shop_id }.mapValues { summarize(it.value) }

private val COVER_ORDER = latestFirst<FindAllMealRecordCovers>({ it.eaten_on }, { it.created_at }, { it.meal_record_id })

/**
 * 代表写真 of every shop that has one, as storage keys from one query: the first image of the latest meal record
 * log that has images (GLOSSARY.md). Shops without one are absent.
 */
fun coverPhotoKeysByShop(db: NoodleMapDb): Map<UUID, String> =
    db.mealRecordImagesQueries.findAllMealRecordCovers().executeAsList().groupBy { it.shop_id }
        .mapValues { (_, covers) -> covers.minWith(COVER_ORDER).storage_key }
