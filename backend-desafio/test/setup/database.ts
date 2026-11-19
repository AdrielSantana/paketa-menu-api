import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, inject } from 'vitest'

// Cada worker do Vitest usa um banco próprio: arquivos de teste rodam em
// paralelo sem enxergar os dados uns dos outros.
beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'), {
    dbName: `test-${process.env.VITEST_POOL_ID}`,
  })
  // Garante que os índices (ex.: unicidade) existem antes do primeiro teste.
  await Promise.all(Object.values(mongoose.models).map(model => model.init()))
})

// Limpa os documentos, mas preserva as coleções e seus índices.
beforeEach(async () => {
  const collections = Object.values(mongoose.connection.collections)
  await Promise.all(collections.map(collection => collection.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
})
