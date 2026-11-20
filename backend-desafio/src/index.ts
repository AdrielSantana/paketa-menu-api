import * as dotenv from 'dotenv'
// quiet: o dotenv não escreve na saída padrão, que é só de logs em JSON.
dotenv.config({ quiet: true })
import mongoose from 'mongoose'

import app from './app'
import { connectDatabase } from './db/connect'
import { logger, serializeError } from './logger'

const PORT = process.env.PORT || 8000
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/menu?replicaSet=rs0'

const start = async () => {
  // Conecta e garante coleções e índices antes de atender.
  await connectDatabase(MONGO_URL)
  logger.info('database connected')

  const server = app.listen(PORT, () => {
    logger.info('server listening', { port: Number(PORT) })
  })

  // Encerramento limpo: para de aceitar conexões, termina as requisições em
  // andamento e fecha o banco (ADR 0011).
  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal })
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0))
    })
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error: unknown) => {
  logger.error('failed to start', { error: serializeError(error) })
  process.exit(1)
})
