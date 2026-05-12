import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

export function loadEnvFile() {
  const envFilePath = path.join(projectRoot, '.env')
  if (!existsSync(envFilePath)) {
    return
  }

  const content = readFileSync(envFilePath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

export function getPersistentRootDirectory() {
  if (process.env.CHALLENGER_DATA_DIR) {
    return process.env.CHALLENGER_DATA_DIR
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Challenger')
  }

  return path.join(os.homedir(), '.challenger')
}

export function getStoragePaths() {
  const rootDirectory = getPersistentRootDirectory()
  const dataDirectory = path.join(rootDirectory, 'data')
  const uploadsDirectory = path.join(rootDirectory, 'uploads')
  const backupsDirectory = path.join(
    process.env.CHALLENGER_BACKUP_DIR || rootDirectory,
    'backups',
  )
  const databasePath = path.join(dataDirectory, 'challenger.db')
  const legacyDatabasePath = path.join(__dirname, 'data', 'challenger.db')
  const legacyUploadsDirectory = path.join(__dirname, 'uploads')

  return {
    projectRoot,
    rootDirectory,
    dataDirectory,
    uploadsDirectory,
    backupsDirectory,
    databasePath,
    legacyDatabasePath,
    legacyUploadsDirectory,
  }
}

export function ensureStorageDirectories() {
  const paths = getStoragePaths()
  mkdirSync(paths.dataDirectory, { recursive: true })
  mkdirSync(paths.uploadsDirectory, { recursive: true })
  mkdirSync(paths.backupsDirectory, { recursive: true })
  return paths
}
