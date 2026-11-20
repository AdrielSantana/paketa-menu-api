import './env'

import { Server } from 'node:http'

import mongoose from 'mongoose'

import app from './app'
import { config } from './config'
import { connectDatabase } from './db/connect'
import { logger, serializeError } from './logger'

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/menu?replicaSet=rs0'

// No Express 5, o callback do listen também recebe o erro (porta ocupada,
// por exemplo). Sem tratar, o serviço registraria que está ouvindo.
const listen = () =>
  new Promise<Server>((resolve, reject) => {
    const server = app.listen(config.port, error =>
      error ? reject(error) : resolve(server),
    )
  })

const start = async () => {
  // Conecta e garante coleções e índices antes de atender.
  await connectDatabase(MONGO_URL)
  logger.info('database connected')

  const server = await listen()
  logger.info('server listening', { port: config.port })

  // Encerramento limpo: para de aceitar conexões, termina as requisições em
  // andamento e fecha o banco (ADR 0011).
  const shutdown = (signal: NodeJS.Signals) => {
    logger.info('shutting down', { signal })
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0))
    })
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

start().catch((error: unknown) => {
  logger.error('failed to start', { error: serializeError(error) })
  process.exit(1)
})
