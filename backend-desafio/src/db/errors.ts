import mongoose from 'mongoose'

const { MongoNetworkError, MongoServerError, MongoServerSelectionError } = mongoose.mongo

const DUPLICATE_KEY = 11000
const MAX_TIME_MS_EXPIRED = 50
const GRAPH_LOOKUP_MEMORY_EXCEEDED = 40099

const hasServerCode = (error: unknown, code: number) =>
  error instanceof MongoServerError && error.code === code

export const isDuplicateKeyError = (error: unknown) => hasServerCode(error, DUPLICATE_KEY)

// O $graphLookup passou do limite de 100 MB de memória (medido no ADR 0003).
export const isGraphLookupMemoryExceeded = (error: unknown) =>
  hasServerCode(error, GRAPH_LOOKUP_MEMORY_EXCEEDED)

// O banco está lento ou fora do ar: o problema é da dependência, não da
// requisição nem do código. Com a conexão caída, o mongoose devolve um erro
// genérico de fila de espera, por isso o estado da conexão também conta.
export const isDatabaseUnavailable = (error: unknown) =>
  hasServerCode(error, MAX_TIME_MS_EXPIRED) ||
  error instanceof MongoServerSelectionError ||
  error instanceof MongoNetworkError ||
  mongoose.connection.readyState !== mongoose.ConnectionStates.connected
