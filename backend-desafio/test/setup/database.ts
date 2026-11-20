import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach } from 'vitest'

import { connectTestDatabase, disconnectTestDatabase } from '../support/database'

// Conecta pelo mesmo caminho do serviço, o que também garante os índices
// (ex.: unicidade) antes do primeiro teste.
beforeAll(connectTestDatabase)

// Limpa os documentos, mas preserva as coleções e seus índices.
beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections)
  await Promise.all(collections.map(collection => collection.deleteMany({})))
})

afterAll(disconnectTestDatabase)
