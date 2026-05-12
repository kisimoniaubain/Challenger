import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  listMessages,
  listPosts,
  listStories,
  listUsers,
  replaceMessages,
  replacePosts,
  replaceStories,
  replaceUsers,
} from './db.js'
import { ensureStorageDirectories, loadEnvFile } from './storagePaths.js'

loadEnvFile()

function getRetentionDays() {
  const value = Number(process.env.CHALLENGER_BACKUP_RETENTION_DAYS || 14)
  return Number.isFinite(value) && value > 0 ? value : 14
}

function getTimestampLabel() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function getBackupDirectory(backupId) {
  const paths = ensureStorageDirectories()
  return path.join(paths.backupsDirectory, backupId)
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJsonFile(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function pruneOldBackups() {
  const paths = ensureStorageDirectories()
  const now = Date.now()
  const maxAgeMs = getRetentionDays() * 24 * 60 * 60 * 1000

  for (const name of readdirSync(paths.backupsDirectory, { withFileTypes: true })) {
    if (!name.isDirectory()) {
      continue
    }

    const backupPath = path.join(paths.backupsDirectory, name.name)
    const ageMs = now - statSync(backupPath).mtimeMs
    if (ageMs > maxAgeMs) {
      rmSync(backupPath, { recursive: true, force: true })
    }
  }
}

export function listBackups() {
  const paths = ensureStorageDirectories()
  const entries = readdirSync(paths.backupsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const backupId = entry.name
      const backupPath = path.join(paths.backupsDirectory, backupId)
      const metadataPath = path.join(backupPath, 'metadata.json')
      const metadata = existsSync(metadataPath)
        ? readJsonFile(metadataPath)
        : { backupId, createdAt: new Date(statSync(backupPath).mtimeMs).toISOString() }

      return {
        backupId,
        ...metadata,
      }
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return entries
}

export function createBackup(reason = 'manual') {
  const paths = ensureStorageDirectories()
  const backupId = getTimestampLabel()
  const backupDirectory = getBackupDirectory(backupId)
  const uploadsBackupDirectory = path.join(backupDirectory, 'uploads')

  mkdirSync(backupDirectory, { recursive: true })

  const users = listUsers()
  const posts = listPosts()
  const stories = listStories()
  const messages = listMessages()

  writeJsonFile(path.join(backupDirectory, 'users.json'), users)
  writeJsonFile(path.join(backupDirectory, 'posts.json'), posts)
  writeJsonFile(path.join(backupDirectory, 'stories.json'), stories)
  writeJsonFile(path.join(backupDirectory, 'messages.json'), messages)

  if (existsSync(paths.uploadsDirectory)) {
    cpSync(paths.uploadsDirectory, uploadsBackupDirectory, { recursive: true })
  } else {
    mkdirSync(uploadsBackupDirectory, { recursive: true })
  }

  const metadata = {
    backupId,
    reason,
    createdAt: new Date().toISOString(),
    counts: {
      users: users.length,
      posts: posts.length,
      stories: stories.length,
      messages: messages.length,
      uploads: existsSync(uploadsBackupDirectory)
        ? readdirSync(uploadsBackupDirectory).length
        : 0,
    },
  }

  writeJsonFile(path.join(backupDirectory, 'metadata.json'), metadata)
  pruneOldBackups()

  return metadata
}

export function restoreBackup(backupId) {
  const paths = ensureStorageDirectories()
  const backupDirectory = getBackupDirectory(backupId)
  if (!existsSync(backupDirectory)) {
    throw new Error(`Backup not found: ${backupId}`)
  }

  const safetyBackup = createBackup(`pre-restore:${backupId}`)
  const users = readJsonFile(path.join(backupDirectory, 'users.json'))
  const posts = readJsonFile(path.join(backupDirectory, 'posts.json'))
  const stories = readJsonFile(path.join(backupDirectory, 'stories.json'))
  const messages = readJsonFile(path.join(backupDirectory, 'messages.json'))
  const uploadsBackupDirectory = path.join(backupDirectory, 'uploads')

  replaceUsers(users)
  replacePosts(posts)
  replaceStories(stories)
  replaceMessages(messages)

  rmSync(paths.uploadsDirectory, { recursive: true, force: true })
  mkdirSync(paths.uploadsDirectory, { recursive: true })
  if (existsSync(uploadsBackupDirectory)) {
    cpSync(uploadsBackupDirectory, paths.uploadsDirectory, { recursive: true })
  }

  return {
    restoredBackupId: backupId,
    safetyBackupId: safetyBackup.backupId,
    restoredAt: new Date().toISOString(),
  }
}
