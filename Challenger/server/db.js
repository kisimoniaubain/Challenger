import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { users as seedUsers } from '../src/data/users.js'
import { posts as seedPosts } from '../src/data/posts.js'
import { messages as seedMessages } from '../src/data/messages.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getPersistentRootDirectory() {
  if (process.env.CHALLENGER_DATA_DIR) {
    return process.env.CHALLENGER_DATA_DIR
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Challenger')
  }

  return path.join(os.homedir(), '.challenger')
}

const rootDirectory = getPersistentRootDirectory()
const dataDirectory = path.join(rootDirectory, 'data')
const databasePath = path.join(dataDirectory, 'challenger.db')
const legacyDatabasePath = path.join(__dirname, 'data', 'challenger.db')

mkdirSync(dataDirectory, { recursive: true })

if (!existsSync(databasePath) && existsSync(legacyDatabasePath)) {
  copyFileSync(legacyDatabasePath, databasePath)
}

const database = new DatabaseSync(databasePath)

database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT DEFAULT '',
    avatar TEXT,
    coverPhoto TEXT,
    totalVotes INTEGER DEFAULT 0,
    googleId TEXT,
    gender TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    text TEXT,
    mediaType TEXT,
    mediaUrl TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    challengeVotes INTEGER DEFAULT 0,
    challengeTitle TEXT
  );

  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY,
    userId INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    createdAt TEXT,
    text TEXT,
    mediaType TEXT,
    mediaUrl TEXT,
    musicUrl TEXT,
    musicName TEXT,
    challengeTitle TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    fromUserId INTEGER NOT NULL,
    toUserId INTEGER NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`)

const userColumns = database.prepare('PRAGMA table_info(users)').all()
if (!userColumns.some((column) => column.name === 'coverPhoto')) {
  database.exec('ALTER TABLE users ADD COLUMN coverPhoto TEXT')
}
if (!userColumns.some((column) => column.name === 'gender')) {
  database.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT ''")
}

const storyColumns = database.prepare('PRAGMA table_info(stories)').all()
if (!storyColumns.some((column) => column.name === 'createdAt')) {
  database.exec('ALTER TABLE stories ADD COLUMN createdAt TEXT')
}
if (!storyColumns.some((column) => column.name === 'musicUrl')) {
  database.exec('ALTER TABLE stories ADD COLUMN musicUrl TEXT')
}
if (!storyColumns.some((column) => column.name === 'musicName')) {
  database.exec('ALTER TABLE stories ADD COLUMN musicName TEXT')
}

function tableHasRows(tableName) {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count > 0
}

function runReplace(tableName, items, insertItem) {
  database.exec('BEGIN')

  try {
    database.prepare(`DELETE FROM ${tableName}`).run()
    for (const item of items) {
      insertItem(item)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function dedupeBy(items, keyFn) {
  const map = new Map()
  for (const item of items || []) {
    const key = keyFn(item)
    if (key === null || key === undefined || key === '') {
      continue
    }
    map.set(String(key), item)
  }
  return Array.from(map.values())
}

function normalizeUsers(users) {
  const byId = dedupeBy(users, (user) => user?.id)
  return dedupeBy(byId, (user) => user?.email?.trim().toLowerCase())
}

function normalizeRows(rows) {
  return dedupeBy(rows, (row) => row?.id)
}

function replaceUsers(users) {
  const insertUser = database.prepare(`
    INSERT INTO users (id, name, email, password, avatar, coverPhoto, totalVotes, googleId, gender)
    VALUES (@id, @name, @email, @password, @avatar, @coverPhoto, @totalVotes, @googleId, @gender)
  `)

  runReplace('users', normalizeUsers(users), (user) => {
      insertUser.run({
        id: toSafeNumber(user.id),
        name: user.name || '',
        email: (user.email || '').trim().toLowerCase(),
        password: user.password || '',
        avatar: user.avatar || '',
        coverPhoto: user.coverPhoto || '',
        totalVotes: toSafeNumber(user.totalVotes),
        googleId: user.googleId || null,
        gender: user.gender || '',
      })
  })
}

function replacePosts(posts) {
  const insertPost = database.prepare(`
    INSERT INTO posts (id, userId, timestamp, text, mediaType, mediaUrl, likes, comments, shares, challengeVotes, challengeTitle)
    VALUES (@id, @userId, @timestamp, @text, @mediaType, @mediaUrl, @likes, @comments, @shares, @challengeVotes, @challengeTitle)
  `)

  runReplace('posts', normalizeRows(posts), (post) => {
      insertPost.run({
        id: toSafeNumber(post.id),
        userId: toSafeNumber(post.userId),
        timestamp: post.timestamp,
        text: post.text || '',
        mediaType: post.mediaType || null,
        mediaUrl: post.mediaUrl || null,
        likes: toSafeNumber(post.likes),
        comments: toSafeNumber(post.comments),
        shares: toSafeNumber(post.shares),
        challengeVotes: toSafeNumber(post.challengeVotes),
        challengeTitle: post.challengeTitle || '',
      })
  })
}

function replaceStories(stories) {
  const insertStory = database.prepare(`
    INSERT INTO stories (id, userId, timestamp, createdAt, text, mediaType, mediaUrl, musicUrl, musicName, challengeTitle)
    VALUES (@id, @userId, @timestamp, @createdAt, @text, @mediaType, @mediaUrl, @musicUrl, @musicName, @challengeTitle)
  `)

  runReplace('stories', normalizeRows(stories), (story) => {
      insertStory.run({
        id: toSafeNumber(story.id),
        userId: toSafeNumber(story.userId),
        timestamp: story.timestamp,
        createdAt: story.createdAt || new Date().toISOString(),
        text: story.text || '',
        mediaType: story.mediaType || null,
        mediaUrl: story.mediaUrl || null,
        musicUrl: story.musicUrl || null,
        musicName: story.musicName || '',
        challengeTitle: story.challengeTitle || '',
      })
  })
}

function replaceMessages(messages) {
  const insertMessage = database.prepare(`
    INSERT INTO messages (id, fromUserId, toUserId, text, timestamp)
    VALUES (@id, @fromUserId, @toUserId, @text, @timestamp)
  `)

  runReplace('messages', normalizeRows(messages), (message) => {
      insertMessage.run({
        id: toSafeNumber(message.id),
        fromUserId: toSafeNumber(message.fromUserId),
        toUserId: toSafeNumber(message.toUserId),
        text: message.text,
        timestamp: message.timestamp,
      })
  })
}

if (!tableHasRows('users')) {
  replaceUsers(seedUsers)
}

if (!tableHasRows('posts')) {
  replacePosts(seedPosts)
}

if (!tableHasRows('stories')) {
  replaceStories(
    seedPosts.slice(0, 5).map((post) => ({
      id: post.id,
      userId: post.userId,
      timestamp: post.timestamp,
      createdAt: new Date().toISOString(),
      text: post.text,
      mediaType: post.mediaType,
      mediaUrl: post.mediaUrl,
      musicUrl: null,
      musicName: '',
      challengeTitle: post.challengeTitle,
    })),
  )
}

if (!tableHasRows('messages')) {
  replaceMessages(seedMessages)
}

export function listUsers() {
  return database.prepare('SELECT * FROM users ORDER BY id').all()
}

export function listPosts() {
  return database.prepare('SELECT * FROM posts ORDER BY id DESC').all()
}

export function listStories() {
  return database.prepare('SELECT * FROM stories ORDER BY id DESC').all()
}

export function listMessages() {
  return database.prepare('SELECT * FROM messages ORDER BY id').all()
}

export { replaceUsers, replacePosts, replaceStories, replaceMessages }