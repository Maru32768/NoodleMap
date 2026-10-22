package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import java.security.MessageDigest
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Bump whenever the image layout changes, so every OGP image URL changes with it. */
private const val TEMPLATE_VERSION = 1

/** A pill label with its background color (`#rrggbb`). */
data class Chip(val label: String, val color: String)

/**
 * Everything the share page and OGP image show for a shop. [hash] names the image, so any
 * visible change (including date-derived statuses) yields a new image URL.
 */
data class OgCard(
    val name: String,
    val category: String,
    val statuses: List<Chip>,
    val tags: List<Chip>,
    /** 0-5 like the web's favToHearts; 0 draws nothing. */
    val hearts: Double,
    val area: String,
) {
    fun hash(): String = MessageDigest.getInstance("SHA-256")
        .digest("$TEMPLATE_VERSION|$this".toByteArray())
        .joinToString("") { "%02x".format(it) }
        .take(16)

    fun description(): String =
        (listOf(category) + tags.map { it.label } + statuses.map { it.label } + area).filter { it.isNotEmpty() }.joinToString("・")

    companion object {
        fun of(shop: Shop, today: LocalDate) = OgCard(
            name = shop.name,
            category = if (shop.category == CategorySlug.UDON) "うどん" else "ラーメン",
            statuses = listOf(if (shop.eaten) Chip("食べた", "#b54a3c") else Chip("気になる", "#6b5e52")) +
                lifecycleChips(shop.openedAt, shop.closedAt, today),
            tags = shop.tags.take(3).map { Chip(it.label, it.color) },
            hearts = if (shop.rate > 0) minOf(5.0, shop.rate / 20) else 0.0,
            area = areaOf(shop.address),
        )
    }
}

private const val NEW_SHOP_WINDOW_DAYS = 365

/** The status chips the web shows on a shop; mirrors `web/src/features/shops/status.ts` (SYSTEM_TAGS). */
internal fun lifecycleChips(openedAt: String?, closedAt: String?, today: LocalDate): List<Chip> {
    val opened = openedAt?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val closed = closedAt?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    val isClosed = closed != null && !closed.isAfter(today)
    val upcoming = !isClosed && opened != null && opened.isAfter(today)
    val closingSoon = !isClosed && !upcoming && closed != null
    val isNew = !isClosed && opened != null && !opened.isAfter(today) &&
        ChronoUnit.DAYS.between(opened, today) <= NEW_SHOP_WINDOW_DAYS
    return listOfNotNull(
        Chip("新店", "#8c2e21").takeIf { isNew },
        Chip("開店予定", "#8c7341").takeIf { upcoming },
        Chip("閉店予定", "#6e2117").takeIf { closingSoon },
        Chip("閉店", "#1a1614").takeIf { isClosed },
    )
}

// A place-name character: stops at digits, spaces, separators and postal marks.
private const val N = """[^\s\d０-９、,，〒\-－‐−]"""

// shortcut: city names that themselves contain 市 (四日市市, 廿日市市) come out one 市 short; list them if that matters.
private val AREA = Regex("""(東京都|北海道|(?:京都|大阪)府|$N{2,3}県)($N+?郡$N+?[町村]|$N+?市$N+?区|$N+?[市区町村])""")

/** 都道府県 + 市区町村 (with the ward of a designated city) from a Japanese address, or "". */
fun areaOf(address: String): String = AREA.find(address)?.let { it.groupValues[1] + it.groupValues[2] }.orEmpty()
