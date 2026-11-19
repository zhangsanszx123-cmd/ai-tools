import 'server-only'
import { Pool } from 'pg'
import { postgresConfig } from './postgres-config'
import { createDirectoryStore } from './directory-store'

const globalPool = globalThis as typeof globalThis & { directoryPool?: Pool }
export const pool = globalPool.directoryPool ?? new Pool(process.env.DATABASE_URL ? postgresConfig() : { max: 4 })
if (!globalPool.directoryPool) pool.on('error', () => console.error('Directory database connection interrupted'))
if (process.env.NODE_ENV !== 'production') globalPool.directoryPool = pool

export const directoryStore = createDirectoryStore(pool)
export const { getCategories, getCatalog, getTool } = directoryStore
