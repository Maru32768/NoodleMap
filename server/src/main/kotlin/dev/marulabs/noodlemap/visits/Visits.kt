package dev.marulabs.noodlemap.visits

import dev.marulabs.noodlemap.db.FindAllVisitCovers
import dev.marulabs.noodlemap.db.FindAllVisitSummaries
import dev.marulabs.noodlemap.db.NoodleMapDb
import java.util.UUID

/**
 * The one place the "latest visit" order lives (GLOSSARY.md 訪問ログ): newest visit date first, a visit
 * without a date counting as the oldest, then the most recently created (created_at has milliseconds),
 * then the id, so the order never depends on how rows were read.
 */
internal fun <T> latestFirst(visitedOn: (T) -> String?, createdAt: (T) -> String, id: (T) -> UUID): Comparator<T> =
    compareByDescending<T, String?>(nullsFirst(naturalOrder())) { visitedOn(it) }
        .thenByDescending { createdAt(it) }
        .thenByDescending { id(it).toString() }

/** What a shop derives from its visit logs: 食べた and its 評価. */
data class VisitSummary(val visitCount: Int, val rate: Double?) {
    /** 食べた: at least one visit log. */
    val eaten: Boolean get() = visitCount > 0

    companion object {
        val NONE = VisitSummary(0, null)
    }
}

private val SUMMARY_ORDER = latestFirst<FindAllVisitSummaries>({ it.visited_on }, { it.created_at }, { it.id })

/** The shop's 評価 is the rate of its latest visit log that has one. */
internal fun summarize(visits: List<FindAllVisitSummaries>): VisitSummary =
    VisitSummary(visits.size, visits.filter { it.rate != null }.minWithOrNull(SUMMARY_ORDER)?.rate)

/** Summaries of every shop with a visit log, from one query; shops without one are absent. */
fun visitSummariesByShop(db: NoodleMapDb): Map<UUID, VisitSummary> =
    db.visitLogsQueries.findAllVisitSummaries().executeAsList().groupBy { it.shop_id }.mapValues { summarize(it.value) }

private val COVER_ORDER = latestFirst<FindAllVisitCovers>({ it.visited_on }, { it.created_at }, { it.visit_log_id })

/**
 * 代表写真 of every shop that has one, as storage keys from one query: the first image of the latest visit
 * log that has images (GLOSSARY.md). Shops without one are absent.
 */
fun coverPhotoKeysByShop(db: NoodleMapDb): Map<UUID, String> =
    db.visitImagesQueries.findAllVisitCovers().executeAsList().groupBy { it.shop_id }
        .mapValues { (_, covers) -> covers.minWith(COVER_ORDER).storage_key }
