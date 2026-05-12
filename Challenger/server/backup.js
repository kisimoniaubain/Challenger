import { createBackup, listBackups } from './backups.js'

const command = process.argv[2] || 'create'

if (command === 'list') {
  console.log(JSON.stringify(listBackups(), null, 2))
  process.exit(0)
}

const reason = process.argv[3] || 'cli'
const metadata = createBackup(reason)
console.log(JSON.stringify(metadata, null, 2))
