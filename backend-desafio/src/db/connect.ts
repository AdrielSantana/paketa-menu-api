import mongoose, { ConnectOptions } from 'mongoose'

import { config } from '../config'

// Conecta com os tempos máximos do ADR 0010 e garante coleções e índices.
// É o único ponto de conexão: servidor, testes e qualquer outro adaptador.
export const connectDatabase = async (uri: string, options: ConnectOptions = {}) => {
  // Toda consulta e toda agregação leva maxTimeMS. A contagem estimada é a
  // exceção: recebe o valor na própria chamada.
  mongoose.set('maxTimeMS', config.dbTimeoutMs)
  // Com a conexão caída, uma operação espera na fila no máximo esse tempo.
  mongoose.set('bufferTimeoutMS', config.dbTimeoutMs)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: config.dbTimeoutMs,
    ...options,
  })

  // O índice único é o que sustenta a unicidade do nome, e transações não
  // criam coleções no DocumentDB (ADR 0005).
  await Promise.all(Object.values(mongoose.models).map(model => model.init()))
}
