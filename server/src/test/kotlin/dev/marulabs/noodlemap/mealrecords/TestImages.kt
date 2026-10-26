package dev.marulabs.noodlemap.mealrecords

import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import javax.imageio.ImageIO

/** Left half red, right half blue. */
internal fun halves(width: Int, height: Int) = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB).apply {
    createGraphics().run {
        color = Color.RED
        fillRect(0, 0, width / 2, height)
        color = Color.BLUE
        fillRect(width / 2, 0, width - width / 2, height)
        dispose()
    }
}

internal fun jpeg(image: BufferedImage): ByteArray = ByteArrayOutputStream().also { ImageIO.write(image, "jpeg", it) }.toByteArray()

/** Inserts an EXIF APP1 segment holding only [orientation] after the JFIF APP0 segment ImageIO writes. */
internal fun withExifOrientation(jpeg: ByteArray, orientation: Int): ByteArray {
    val tiff = ByteBuffer.allocate(26)
        .put("MM".toByteArray()).putShort(42).putInt(8) // big-endian header, IFD0 at offset 8
        .putShort(1) // one entry
        .putShort(0x0112).putShort(3).putInt(1).putShort(orientation.toShort()).putShort(0) // Orientation, SHORT
        .putInt(0) // no next IFD
        .array()
    val payload = "Exif\u0000\u0000".toByteArray(Charsets.ISO_8859_1) + tiff
    val app1 = byteArrayOf(0xFF.toByte(), 0xE1.toByte()) + ByteBuffer.allocate(2).putShort((payload.size + 2).toShort()).array() + payload
    val app0End = 4 + (((jpeg[4].toInt() and 0xFF) shl 8) or (jpeg[5].toInt() and 0xFF))
    return jpeg.copyOfRange(0, app0End) + app1 + jpeg.copyOfRange(app0End, jpeg.size)
}
