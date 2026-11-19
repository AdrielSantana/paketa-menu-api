import mongoose, { ClientSession } from 'mongoose'

/**
 * Roda `work` em uma transação e devolve o resultado.
 *
 * Usa a API de callback do driver: ela confirma no fim, desfaz se `work`
 * lançar e refaz a transação inteira em erro transitório (conflito de
 * escrita com outra transação). Por isso `work` pode rodar mais de uma vez
 * e não deve ter efeito fora do banco.
 */
export const withTransaction = async <T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(work)
  } finally {
    await session.endSession()
  }
}
