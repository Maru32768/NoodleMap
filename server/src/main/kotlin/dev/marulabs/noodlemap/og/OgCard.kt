package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.generated.models.CategorySlug
import dev.marulabs.noodlemap.generated.models.Shop
import dev.marulabs.noodlemap.generated.models.WishLevel
import java.security.MessageDigest
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.floor

/** Bump whenever the image layout changes, so every OGP image URL changes with it. */
private const val TEMPLATE_VERSION = 4

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
    /** 0-5 in half steps (the web's favToHearts as drawn); 0 draws nothing. */
    val hearts: Double,
    /** Number of visit logs; 0 for a shop not eaten, and then nothing is drawn. */
    val visitCount: Int,
    val area: String,
) {
    /** 「3回訪問」, or null for a shop not eaten. */
    val visitCountLabel: String? get() = if (visitCount > 0) "${visitCount}回訪問" else null

    fun hash(): String {
        // Length-prefixed fields, so no value can shift into its neighbour.
        val input = buildString {
            fun field(v: Any) = v.toString().let { append(it.length).append(':').append(it) }
            field(TEMPLATE_VERSION)
            field(name)
            field(category)
            for (chips in listOf(statuses, tags)) {
                field(chips.size)
                chips.forEach { field(it.label); field(it.color) }
            }
            field(hearts)
            field(visitCount)
            field(area)
        }
        return MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
            .take(16)
    }

    fun description(): String =
        (listOf(category) + tags.map { it.label } + statuses.map { it.label } + listOfNotNull(visitCountLabel) + area)
            .filter { it.isNotEmpty() }.joinToString("・")

    companion object {
        fun of(shop: Shop, today: LocalDate) = OgCard(
            name = shop.name,
            category = when (shop.category) {
                CategorySlug.RAMEN -> "ラーメン"
                CategorySlug.UDON -> "うどん"
            },
            statuses = listOf(eatenChip(shop)) + lifecycleChips(shop.openedAt, shop.closedAt, today),
            tags = shop.tags.take(3).map { Chip(it.label, it.color) },
            // Down to the half heart the image can show, so rates drawn alike share one hash.
            hearts = if (shop.rate > 0) floor(minOf(5.0, shop.rate / 20) * 2) / 2 else 0.0,
            visitCount = shop.visitCount,
            area = areaOf(shop.address),
        )
    }
}

/** 食べた, or for a shop not eaten its 気になる度 (plain 気になる when not set); the level means nothing once eaten. */
private fun eatenChip(shop: Shop): Chip =
    if (shop.eaten) {
        Chip("食べた", "#b54a3c")
    } else {
        Chip(shop.wishLevel?.let(WishLevel::fromValue)?.let(::wishLevelLabel) ?: "気になる", "#6b5e52")
    }

/** 気になる度 as the web shows it (GLOSSARY.md). */
internal fun wishLevelLabel(level: WishLevel): String = when (level) {
    WishLevel.LOW -> "ちょっと気になる"
    WishLevel.MEDIUM -> "気になる"
    WishLevel.HIGH -> "絶対行きたい"
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

// One place-name character (no digits, spaces, separators or postal marks), optionally minus some suffixes.
private fun nameChar(except: String = "") = """[^\s\d０-９、,，〒\-－‐−$except]"""

// Tried in order after the prefecture:
//  1. 郡 + 町村 (余市郡余市町, 中新川郡上市町, 芳賀郡市貝町); the town may hold 市 only first or last before
//     its 町/村, so a city such as 大和郡山市 is not read as a 郡;
//  2. a city up to its first 市 (東村山市, 十日町市), never across a 区 (新宿区市谷), plus a designated city's ward;
//     cities whose name already contains 市 are listed;
//  3. a ward with no city before it (東京23区);
//  4. a town or village written without its 郡.
// shortcut: a town/village name containing 町 or 村 before its end (大町町) is cut short when the address omits its 郡.
private val AREA = Regex(
    "(東京都|北海道|(?:京都|大阪)府|${nameChar()}{2,3}県)(" +
        "${nameChar("郡区")}+?郡(?:市${nameChar("市郡")}*?|${nameChar("市郡")}+?)市?[町村]" +
        "|(?:四日市|廿日市|野々市|${nameChar("区")}+?)市(?:${nameChar("市")}{1,4}区)?" +
        "|${nameChar()}+?区" +
        "|${nameChar()}+?[町村])",
)

/** 都道府県 + 市区町村 (with the ward of a designated city) from a Japanese address, or "". */
fun areaOf(address: String): String = AREA.find(address)?.let { it.groupValues[1] + it.groupValues[2] }.orEmpty()
