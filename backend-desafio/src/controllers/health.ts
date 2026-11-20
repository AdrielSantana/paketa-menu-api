import { Request, Response } from 'express'
import mongoose from 'mongoose'

import { config } from '../config'
import { serviceUnavailable } from '../errors'

export default {
  // Apto a atender = o banco responde. Qualquer falha no ping é
  // indisponibilidade, não erro interno (ADR 0011).
  check: async (_req: Request, res: Response): Promise<Response> => {
    try {
      const { db } = mongoose.connection
      if (!db) throw new Error('database connection not established')
      await db.command({ ping: 1, maxTimeMS: config.dbTimeoutMs })
    } catch (error) {
      throw serviceUnavailable(error)
    }

    return res.status(200).json({ status: 'ok' })
  },
}
