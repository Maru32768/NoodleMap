package dev.marulabs.noodlemap.visits

import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import dev.marulabs.noodlemap.errors.FieldErrorType
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageReader
import javax.imageio.ImageWriteParam
import javax.imageio.stream.MemoryCacheImageOutputStream
import kotlin.math.max
import org.w3c.dom.Node
import kotlin.math.roundToInt

/** Long edge of a stored 訪問画像, in pixels. */
const val VISIT_IMAGE_MAX_EDGE = 2048

/** Larger sources are refused before decoding; well above any phone camera (48-50 MP). */
private const val MAX_SOURCE_PIXELS = 60_000_000L

/** ImageIO decodes a progressive JPEG from whole-image coefficient buffers, whatever the subsampling. */
private const val MAX_PROGRESSIVE_JPEG_PIXELS = 30_000_000L
private const val JPEG_QUALITY = 0.85f
private val ACCEPTED_FORMATS = setOf("jpeg", "png")

/** A stored-ready 訪問画像: an upright JPEG without metadata. */
class ProcessedImage(val jpeg: ByteArray, val width: Int, val height: Int)

/** The upload is not an image this server stores; [type] says why (for the `file` field error). */
class UnacceptableImage(val type: FieldErrorType) : Exception()

/**
 * Turns an uploaded JPEG or PNG into a [ProcessedImage]: refuses other formats and absurd dimensions before
 * decoding, decodes with source subsampling so the bitmap stays under twice [VISIT_IMAGE_MAX_EDGE] on the long
 * edge, scales down to that edge, applies the EXIF orientation and encodes JPEG at quality 85.
 * CPU and memory heavy: callers bound how many run at once.
 */
fun processVisitImage(bytes: ByteArray): ProcessedImage {
    val upright = try {
        val decoded = decodeSubsampled(bytes)
        orient(scaleToFit(decoded, VISIT_IMAGE_MAX_EDGE), exifOrientation(bytes))
    } catch (e: RuntimeException) {
        // Hostile or odd files make ImageIO and Java2D throw all sorts (CMMException, index and size errors).
        throw UnacceptableImage(FieldErrorType.INVALID_FORMAT).apply { initCause(e) }
    }
    return ProcessedImage(encodeJpeg(upright), upright.width, upright.height)
}

private fun decodeSubsampled(bytes: ByteArray): BufferedImage {
    val input = ImageIO.createImageInputStream(ByteArrayInputStream(bytes)) ?: throw UnacceptableImage(FieldErrorType.INVALID_FORMAT)
    input.use {
        // Readers are picked by content, not by the declared type or file name.
        val reader = ImageIO.getImageReaders(input).asSequence().firstOrNull()
            ?: throw UnacceptableImage(FieldErrorType.INVALID_FORMAT)
        try {
            val jpeg = reader.formatName.lowercase() == "jpeg"
            if (!jpeg && reader.formatName.lowercase() !in ACCEPTED_FORMATS) throw UnacceptableImage(FieldErrorType.INVALID_FORMAT)
            // JPEG metadata (header markers only) tells progressive from baseline.
            reader.setInput(input, true, !jpeg)
            // The header alone gives the size, so oversized sources never get a bitmap.
            val width = reader.getWidth(0)
            val height = reader.getHeight(0)
            val pixels = width.toLong() * height
            if (pixels > MAX_SOURCE_PIXELS) throw UnacceptableImage(FieldErrorType.OUT_OF_RANGE)
            if (jpeg && pixels > MAX_PROGRESSIVE_JPEG_PIXELS && isProgressive(reader)) throw UnacceptableImage(FieldErrorType.OUT_OF_RANGE)
            // Rounded down, for quality: the decoded long edge is at least 2048 px (for larger sources) and
            // below 4096 px, so at most 4096 x 4096 x 4 B = 64 MB, one at a time behind the BitmapWorkGate;
            // scaleToFit then brings it to exactly 2048 px.
            val step = max(1, max(width, height) / VISIT_IMAGE_MAX_EDGE)
            val param = reader.defaultReadParam.apply { if (step > 1) setSourceSubsampling(step, step, 0, 0) }
            return reader.read(0, param)
        } catch (e: IOException) {
            // Truncated or corrupt data, or a JPEG flavour ImageIO cannot decode (CMYK).
            throw UnacceptableImage(FieldErrorType.INVALID_FORMAT).apply { initCause(e) }
        } finally {
            reader.dispose()
        }
    }
}

/** Whether the JPEG's frame is progressive (SOF2: process 2 in ImageIO's native metadata). */
private fun isProgressive(reader: ImageReader): Boolean {
    val root = reader.getImageMetadata(0)?.getAsTree("javax_imageio_jpeg_image_1.0") ?: return false
    fun find(node: Node): Node? =
        if (node.nodeName == "sof") node else generateSequence(node.firstChild) { it.nextSibling }.firstNotNullOfOrNull(::find)
    return find(root)?.attributes?.getNamedItem("process")?.nodeValue == "2"
}

/** Opaque RGB no larger than [maxEdge] on the long side; transparency becomes white. */
private fun scaleToFit(src: BufferedImage, maxEdge: Int): BufferedImage {
    val scale = minOf(1.0, maxEdge.toDouble() / max(src.width, src.height))
    val width = max(1, (src.width * scale).roundToInt())
    val height = max(1, (src.height * scale).roundToInt())
    val dst = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    val g = dst.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.color = Color.WHITE
        g.fillRect(0, 0, width, height)
        g.drawImage(src, 0, 0, width, height, null)
    } finally {
        g.dispose()
    }
    return dst
}

/** EXIF orientation 1..8 (1 when absent or unreadable). */
internal fun exifOrientation(bytes: ByteArray): Int = try {
    ImageMetadataReader.readMetadata(ByteArrayInputStream(bytes))
        .getDirectoriesOfType(ExifIFD0Directory::class.java)
        .firstOrNull { it.containsTag(ExifIFD0Directory.TAG_ORIENTATION) }
        ?.getInt(ExifIFD0Directory.TAG_ORIENTATION)
        ?.takeIf { it in 1..8 } ?: 1
} catch (_: Exception) {
    1
}

/** Applies an EXIF orientation, so the pixels are upright and the tag is no longer needed. */
private fun orient(src: BufferedImage, orientation: Int): BufferedImage {
    if (orientation == 1) return src
    val w = src.width
    val h = src.height
    val swapped = orientation >= 5
    val dw = if (swapped) h else w
    val dh = if (swapped) w else h
    val from = src.getRGB(0, 0, w, h, null, 0, w)
    val to = IntArray(from.size)
    for (y in 0 until h) {
        for (x in 0 until w) {
            // Index of the destination pixel (dx, dy) as dy * dw + dx.
            val target = when (orientation) {
                2 -> y * dw + (w - 1 - x)
                3 -> (h - 1 - y) * dw + (w - 1 - x)
                4 -> (h - 1 - y) * dw + x
                5 -> x * dw + y
                6 -> x * dw + (h - 1 - y)
                7 -> (w - 1 - x) * dw + (h - 1 - y)
                else -> (w - 1 - x) * dw + y
            }
            to[target] = from[y * w + x]
        }
    }
    return BufferedImage(dw, dh, BufferedImage.TYPE_INT_RGB).apply { setRGB(0, 0, dw, dh, to, 0, dw) }
}

/** Baseline JPEG; writing a bare bitmap carries no EXIF or other source metadata. */
private fun encodeJpeg(image: BufferedImage): ByteArray {
    val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
    val out = ByteArrayOutputStream()
    try {
        MemoryCacheImageOutputStream(out).use { stream ->
            writer.output = stream
            val param = writer.defaultWriteParam.apply {
                compressionMode = ImageWriteParam.MODE_EXPLICIT
                compressionQuality = JPEG_QUALITY
            }
            writer.write(null, IIOImage(image, null, null), param)
        }
    } finally {
        writer.dispose()
    }
    return out.toByteArray()
}
