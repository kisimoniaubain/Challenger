import sharp from 'sharp'
import path from 'node:path'
import { writeFileSync, existsSync } from 'node:fs'

/**
 * Process and optimize images for different sizes
 * - Original: Keep full size
 * - Thumbnail: 200x200 for avatars
 * - Medium: 800x800 for posts/stories
 * - Optimized: Compressed version
 */
export async function processImage(filePath, filename) {
  try {
    const fileExt = path.extname(filename).toLowerCase()
    const baseName = path.basename(filename, fileExt)
    const directory = path.dirname(filePath)

    // Skip SVG files (already optimized)
    if (fileExt === '.svg') {
      return {
        ok: true,
        original: filename,
        sizes: {
          thumb: `${baseName}-thumb${fileExt}`,
          medium: `${baseName}-medium${fileExt}`,
          optimized: filename,
        },
      }
    }

    // Create thumbnail (200x200) for avatars
    const thumbName = `${baseName}-thumb.webp`
    const thumbPath = path.join(directory, thumbName)
    await sharp(filePath)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .webp({ quality: 80 })
      .toFile(thumbPath)

    // Create medium size (800x800) for posts/stories
    const mediumName = `${baseName}-medium.webp`
    const mediumPath = path.join(directory, mediumName)
    await sharp(filePath)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(mediumPath)

    // Optimize original
    const optimizedPath = filePath
    const isJpegOrPng = ['.jpg', '.jpeg', '.png'].includes(fileExt)

    if (isJpegOrPng) {
      // Convert to WebP for better compression
      const optimizedName = `${baseName}.webp`
      const finalPath = path.join(directory, optimizedName)
      await sharp(filePath)
        .resize(4000, 4000, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88 })
        .toFile(finalPath)

      return {
        ok: true,
        original: optimizedName,
        sizes: {
          thumb: thumbName,
          medium: mediumName,
          optimized: optimizedName,
        },
      }
    }

    return {
      ok: true,
      original: filename,
      sizes: {
        thumb: thumbName,
        medium: mediumName,
        optimized: filename,
      },
    }
  } catch (error) {
    console.error('Image processing error:', error?.message || error)
    return {
      ok: false,
      error: error?.message || 'Image processing failed',
      original: filename,
    }
  }
}

/**
 * Create image metadata for tracking processing status
 */
export function createImageMetadata(filename, status = 'processing') {
  return {
    filename,
    status, // 'processing' | 'completed' | 'failed'
    createdAt: new Date().toISOString(),
    processedAt: null,
    sizes: {
      thumb: null,
      medium: null,
      optimized: null,
    },
  }
}
