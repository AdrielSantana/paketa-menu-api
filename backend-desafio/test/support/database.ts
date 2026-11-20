import mongoose from 'mongoose'
import { inject } from 'vitest'

import { connectDatabase } from '../../src/db/connect'

// Cada worker do Vitest usa um banco próprio: arquivos de teste rodam em
// paralelo sem enxergar os dados uns dos outros. A conexão é a do serviço
// (tempos máximos, índices), com monitoramento de comandos para os testes
// que conferem o que vai para o banco.
export const connectTestDatabase = () =>
  connectDatabase(inject('mongoUri'), {
    dbName: `test-${process.env.VITEST_POOL_ID}`,
    monitorCommands: true,
  })

export const disconnectTestDatabase = () => mongoose.disconnect()
