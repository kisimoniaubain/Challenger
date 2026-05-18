import Queue from 'bull'
import { processImage } from './imageWorker.js'

let uploadQueue = null
let redisConfig = null

/**
 * Initialize Bull queue with Redis configuration
 */
export function initUploadQueue(redis) {
  redisConfig = redis

  uploadQueue = new Queue('image-uploads', {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    },
  })

  // Process image upload jobs
  uploadQueue.process('optimize-image', 5, async (job) => {
    console.log(`[Worker] Processing image: ${job.data.filename}`)
    
    try {
      const result = await processImage(job.data.filePath, job.data.filename)
      
      if (!result.ok) {
        throw new Error(result.error || 'Image processing failed')
      }

      console.log(`[Worker] ✓ Image optimized: ${job.data.filename}`)
      return {
        success: true,
        filename: job.data.filename,
        sizes: result.sizes,
        processedAt: new Date().toISOString(),
      }
    } catch (error) {
      console.error(`[Worker] ✗ Failed to process ${job.data.filename}:`, error?.message)
      throw error
    }
  })

  // Job completion handler
  uploadQueue.on('completed', (job) => {
    console.log(`[Queue] Job ${job.id} completed successfully`)
  })

  // Job failure handler
  uploadQueue.on('failed', (job, error) => {
    console.warn(`[Queue] Job ${job.id} failed:`, error?.message)
  })

  return uploadQueue
}

/**
 * Queue an image for background processing
 */
export async function queueImageOptimization(filePath, filename, metadata = {}) {
  if (!uploadQueue) {
    throw new Error('Upload queue not initialized')
  }

  try {
    const job = await uploadQueue.add('optimize-image', {
      filePath,
      filename,
      ...metadata,
    })

    console.log(`[Queue] Job ${job.id} queued for ${filename}`)
    
    return {
      ok: true,
      jobId: job.id,
      filename,
    }
  } catch (error) {
    console.error('[Queue] Failed to queue image:', error?.message)
    return {
      ok: false,
      error: error?.message || 'Failed to queue image',
    }
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId) {
  if (!uploadQueue) {
    throw new Error('Upload queue not initialized')
  }

  try {
    const job = await uploadQueue.getJob(jobId)
    if (!job) {
      return { status: 'unknown' }
    }

    const progress = job._progress
    const state = await job.getState()
    const data = job.data
    const returnValue = job.returnvalue

    return {
      id: job.id,
      status: state,
      progress,
      data,
      result: returnValue,
    }
  } catch (error) {
    console.error('[Queue] Error getting job status:', error?.message)
    return { status: 'error', error: error?.message }
  }
}

/**
 * Close queue gracefully
 */
export async function closeUploadQueue() {
  if (uploadQueue) {
    await uploadQueue.close()
    uploadQueue = null
  }
}

export function getUploadQueue() {
  return uploadQueue
}
