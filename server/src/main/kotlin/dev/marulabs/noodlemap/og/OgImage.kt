package dev.marulabs.noodlemap.og

import dev.marulabs.noodlemap.visits.VISIT_IMAGE_MAX_EDGE
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.LinearGradientPaint
import java.awt.Rectangle
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.geom.Path2D
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import javax.imageio.ImageIO
import kotlin.math.ceil

const val OG_WIDTH = 1200
const val OG_HEIGHT = 630

// Theme colors from web/src/theme.ts (nm.*).
private val BG = Color(0xf4ede0)
private val PAPER = Color(0xfaf6ec)
private val INK = Color(0x1a1614)
private val INK_MUTED = Color(0x6b5e52)
private val INK_FAINT = Color(0xa89a8a)
private val SHU = Color(0xb54a3c)

// Light text on the darkened lower part of a cover photo.
private val ON_PHOTO = PAPER
private val ON_PHOTO_MUTED = Color(0xfa, 0xf6, 0xec, 215)
private val ON_PHOTO_FAINT = Color(0xfa, 0xf6, 0xec, 150)
private val TEXT_SHADOW = Color(0, 0, 0, 150)

private val baseFont: Font by lazy {
    OgCard::class.java.getResourceAsStream("/og/NotoSansJP-Medium.ttf")!!.use { Font.createFont(Font.TRUETYPE_FONT, it) }
}
private val logo: BufferedImage by lazy { ImageIO.read(OgCard::class.java.getResource("/og/logo.png")) }

// The web's heart icon (rating-hearts.tsx HEART_PATH) on its 24x24 grid.
private val HEART = Path2D.Double().apply {
    moveTo(12.0, 21.0)
    curveTo(12.0, 21.0, 5.0, 16.65, 2.5, 12.0)
    curveTo(1.0, 8.5, 3.0, 5.0, 6.5, 5.0)
    curveTo(8.5, 5.0, 10.5, 6.0, 12.0, 8.0)
    curveTo(13.5, 6.0, 15.5, 5.0, 17.5, 5.0)
    curveTo(21.0, 5.0, 23.0, 8.5, 21.5, 12.0)
    curveTo(19.0, 16.65, 12.0, 21.0, 12.0, 21.0)
    closePath()
}

private const val MARGIN = 88
private const val CONTENT_WIDTH = OG_WIDTH - MARGIN * 2

/**
 * Draws the 1200x630 OGP card as PNG bytes: over [cover] (the decoded 代表写真) when given, otherwise the
 * text-only card.
 */
fun renderOgImage(card: OgCard, cover: BufferedImage?): ByteArray {
    val img = BufferedImage(OG_WIDTH, OG_HEIGHT, BufferedImage.TYPE_INT_RGB)
    val g = img.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON)
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        if (cover != null) drawPhotoCard(g, card, cover) else drawTextCard(g, card)
    } finally {
        g.dispose()
    }
    return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
}

/**
 * Decodes a stored 訪問画像 for [renderOgImage]. Only JPEGs no larger than the upload pipeline writes
 * ([VISIT_IMAGE_MAX_EDGE] on the long edge) get a bitmap, so its memory stays bounded; anything else throws.
 */
fun decodeCover(jpeg: ByteArray): BufferedImage {
    val input = ImageIO.createImageInputStream(ByteArrayInputStream(jpeg)) ?: throw IOException("no image input")
    input.use {
        val reader = ImageIO.getImageReadersByFormatName("jpeg").next()
        try {
            reader.setInput(input, true, true)
            val edge = maxOf(reader.getWidth(0), reader.getHeight(0))
            if (edge > VISIT_IMAGE_MAX_EDGE) throw IOException("cover is $edge px, over $VISIT_IMAGE_MAX_EDGE px")
            return reader.read(0)
        } finally {
            reader.dispose()
        }
    }
}

private fun drawTextCard(g: Graphics2D, card: OgCard) {
    g.color = BG
    g.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)
    g.color = PAPER
    g.fillRoundRect(32, 32, OG_WIDTH - 64, OG_HEIGHT - 64, 40, 40)
    g.color = SHU
    g.fillRect(MARGIN, OG_HEIGHT - 72, CONTENT_WIDTH, 6)

    // Branding
    g.drawImage(logo, MARGIN, 72, 64, 64, null)
    g.font = baseFont.deriveFont(32f)
    g.color = INK
    g.drawString("NoodleMap", MARGIN + 80, centerBaseline(g, 72, 64))

    // Shop name: shrink to fit, then ellipsize.
    var size = 88f
    while (size > 56f && g.getFontMetrics(baseFont.deriveFont(size)).stringWidth(card.name) > CONTENT_WIDTH) size -= 8f
    g.font = baseFont.deriveFont(size)
    g.drawString(ellipsize(card.name, g.fontMetrics, CONTENT_WIDTH), MARGIN, 270)

    // Category, statuses, then up to 3 tags.
    drawChips(g, listOf(Chip(card.category, "#1a1614")) + card.statuses + card.tags, MARGIN, 318, MARGIN + CONTENT_WIDTH)

    // The row under the chips: hearts and the visit count of an eaten shop.
    var rowX = MARGIN
    if (card.hearts > 0) rowX = drawHearts(g, card.hearts, MARGIN, 410, 52, INK_FAINT) + 28
    card.visitCountLabel?.let {
        g.font = baseFont.deriveFont(36f)
        g.color = INK_MUTED
        g.drawString(it, rowX, centerBaseline(g, 410, 52))
    }

    if (card.area.isNotEmpty()) {
        g.font = baseFont.deriveFont(36f)
        g.color = INK_MUTED
        g.drawString(ellipsize(card.area, g.fontMetrics, CONTENT_WIDTH), MARGIN, 530)
    }
}

private const val PHOTO_MARGIN = 64
private const val PHOTO_CONTENT_WIDTH = OG_WIDTH - PHOTO_MARGIN * 2
private const val SCRIM_TOP = 140

/** The cover photo full-bleed, darkened towards the bottom, with light text over the dark part. */
private fun drawPhotoCard(g: Graphics2D, card: OgCard, cover: BufferedImage) {
    // Cover fit: fill the card and crop the overflow evenly on both sides.
    val scale = maxOf(OG_WIDTH.toDouble() / cover.width, OG_HEIGHT.toDouble() / cover.height)
    val w = ceil(cover.width * scale).toInt()
    val h = ceil(cover.height * scale).toInt()
    g.drawImage(cover, (OG_WIDTH - w) / 2, (OG_HEIGHT - h) / 2, w, h, null)

    // Dark enough under the text for light type on any photo; the top of the photo stays untouched.
    g.paint = LinearGradientPaint(
        0f, SCRIM_TOP.toFloat(), 0f, OG_HEIGHT.toFloat(),
        floatArrayOf(0f, 0.45f, 1f),
        arrayOf(Color(0, 0, 0, 0), Color(0, 0, 0, 180), Color(0, 0, 0, 225)),
    )
    g.fillRect(0, SCRIM_TOP, OG_WIDTH, OG_HEIGHT - SCRIM_TOP)

    // Shop name: shrink to fit, then ellipsize.
    var size = 80f
    while (size > 56f && g.getFontMetrics(baseFont.deriveFont(size)).stringWidth(card.name) > PHOTO_CONTENT_WIDTH) size -= 8f
    g.font = baseFont.deriveFont(size)
    drawShadowed(g, ellipsize(card.name, g.fontMetrics, PHOTO_CONTENT_WIDTH), PHOTO_MARGIN, 372, ON_PHOTO)

    // Category, then up to 3 tags.
    drawChips(g, listOf(Chip(card.category, "#1a1614")) + card.tags, PHOTO_MARGIN, 396, PHOTO_MARGIN + PHOTO_CONTENT_WIDTH)

    // Hearts and the visit count.
    var rowX = PHOTO_MARGIN
    if (card.hearts > 0) rowX = drawHearts(g, card.hearts, PHOTO_MARGIN, 474, 48, ON_PHOTO_FAINT) + 24
    card.visitCountLabel?.let {
        g.font = baseFont.deriveFont(34f)
        drawShadowed(g, it, rowX, centerBaseline(g, 474, 48), ON_PHOTO)
    }

    // Branding at the bottom right, the area to its left.
    val rowTop = 548
    val rowHeight = 44
    g.font = baseFont.deriveFont(28f)
    val brandX = OG_WIDTH - PHOTO_MARGIN - (rowHeight + 12 + g.fontMetrics.stringWidth("NoodleMap"))
    g.drawImage(logo, brandX, rowTop, rowHeight, rowHeight, null)
    drawShadowed(g, "NoodleMap", brandX + rowHeight + 12, centerBaseline(g, rowTop, rowHeight), ON_PHOTO)
    if (card.area.isNotEmpty()) {
        g.font = baseFont.deriveFont(30f)
        val area = ellipsize(card.area, g.fontMetrics, brandX - 32 - PHOTO_MARGIN)
        drawShadowed(g, area, PHOTO_MARGIN, centerBaseline(g, rowTop, rowHeight), ON_PHOTO_MUTED)
    }
}

/** Text with a drop shadow, so it holds up where the scrim leaves a bright spot light. */
private fun drawShadowed(g: Graphics2D, text: String, x: Int, y: Int, color: Color) {
    g.color = TEXT_SHADOW
    g.drawString(text, x + 2, y + 2)
    g.color = color
    g.drawString(text, x, y)
}

/** Pills from [left] rightwards; whatever would pass [right] is dropped. */
private fun drawChips(g: Graphics2D, chips: List<Chip>, left: Int, top: Int, right: Int) {
    g.font = baseFont.deriveFont(28f)
    var x = left
    for (chip in chips) {
        val w = g.fontMetrics.stringWidth(chip.label) + 44
        if (x + w > right) break
        val bg = parseColor(chip.color)
        g.color = bg
        g.fillRoundRect(x, top, w, 56, 56, 56)
        g.color = textColorOn(bg)
        g.drawString(chip.label, x + 22, centerBaseline(g, top, 56))
        x += w + 14
    }
}

/** Baseline that visually centers CJK text of the current font in a box. */
private fun centerBaseline(g: Graphics2D, top: Int, height: Int): Int {
    val bounds = g.font.createGlyphVector(g.fontRenderContext, "麺").visualBounds
    return (top + height / 2.0 - bounds.centerY).toInt()
}

private fun ellipsize(text: String, fm: FontMetrics, maxWidth: Int): String {
    if (fm.stringWidth(text) <= maxWidth) return text
    var end = text.length
    while (end > 0 && fm.stringWidth(text.substring(0, end) + "…") > maxWidth) end = text.offsetByCodePoints(end, -1)
    return text.substring(0, end) + "…"
}

private fun parseColor(hex: String): Color = runCatching { Color.decode(hex) }.getOrDefault(INK_MUTED)

// Mirrors getTagTextColor in web/src/features/shops/tag-chips.tsx.
private fun textColorOn(bg: Color): Color =
    if ((0.299 * bg.red + 0.587 * bg.green + 0.114 * bg.blue) / 255 > 0.62) INK else Color.WHITE

/** Five hearts like the web's MiniHearts: full, half (left-clipped) or an [empty] outline. Returns their right edge. */
private fun drawHearts(g: Graphics2D, hearts: Double, left: Int, top: Int, size: Int, empty: Color): Int {
    val scale = size / 24.0
    g.stroke = BasicStroke((1.8 * scale).toFloat())
    for (i in 1..5) {
        val x = left + (i - 1) * (size + 10)
        val shape = AffineTransform(scale, 0.0, 0.0, scale, x.toDouble(), top.toDouble()).createTransformedShape(HEART)
        when {
            i <= hearts -> {
                g.color = SHU
                g.fill(shape)
                g.draw(shape)
            }
            i - 0.5 <= hearts -> {
                g.color = SHU
                g.draw(shape)
                g.clip = Rectangle(x, top, size / 2, size)
                g.fill(shape)
                g.clip = null
            }
            else -> {
                g.color = empty
                g.draw(shape)
            }
        }
    }
    return left + 5 * size + 4 * 10
}
