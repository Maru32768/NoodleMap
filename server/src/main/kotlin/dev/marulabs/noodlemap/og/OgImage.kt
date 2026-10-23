package dev.marulabs.noodlemap.og

import java.awt.BasicStroke
import java.awt.Color
import java.awt.Font
import java.awt.FontMetrics
import java.awt.Graphics2D
import java.awt.Rectangle
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.geom.Path2D
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

const val OG_WIDTH = 1200
const val OG_HEIGHT = 630

// Theme colors from web/src/theme.ts (nm.*).
private val BG = Color(0xf4ede0)
private val PAPER = Color(0xfaf6ec)
private val INK = Color(0x1a1614)
private val INK_MUTED = Color(0x6b5e52)
private val INK_FAINT = Color(0xa89a8a)
private val SHU = Color(0xb54a3c)

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

/** Draws the 1200x630 OGP card as PNG bytes. */
fun renderOgImage(card: OgCard): ByteArray {
    val img = BufferedImage(OG_WIDTH, OG_HEIGHT, BufferedImage.TYPE_INT_RGB)
    val g = img.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON)
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)

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

        // Category, statuses, then up to 3 tags; drop whatever overflows the row.
        g.font = baseFont.deriveFont(28f)
        var x = MARGIN
        for (chip in listOf(Chip(card.category, "#1a1614")) + card.statuses + card.tags) {
            val w = g.fontMetrics.stringWidth(chip.label) + 44
            if (x + w > MARGIN + CONTENT_WIDTH) break
            val bg = parseColor(chip.color)
            g.color = bg
            g.fillRoundRect(x, 318, w, 56, 56, 56)
            g.color = textColorOn(bg)
            g.drawString(chip.label, x + 22, centerBaseline(g, 318, 56))
            x += w + 14
        }

        // The row under the chips: hearts and the visit count of an eaten shop.
        var rowX = MARGIN
        if (card.hearts > 0) rowX = drawHearts(g, card.hearts, MARGIN, 410, 52) + 28
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
    } finally {
        g.dispose()
    }
    return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
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

/** Five hearts like the web's MiniHearts: full, half (left-clipped) or faint outline. Returns their right edge. */
private fun drawHearts(g: Graphics2D, hearts: Double, left: Int, top: Int, size: Int): Int {
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
                g.color = INK_FAINT
                g.draw(shape)
            }
        }
    }
    return left + 5 * size + 4 * 10
}
