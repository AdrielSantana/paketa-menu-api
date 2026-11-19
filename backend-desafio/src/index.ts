import * as dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'

import app from './app'

const HOST = process.env.HOST || 'http://localhost'
const PORT = process.env.PORT || 8000
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/menu?replicaSet=rs0'
const LOGMSG = '⚡️[Paketá Credito Live-Coding BoilerPlate]:'

const start = async () => {
  await mongoose.connect(MONGO_URL)
  // Garante coleções e índices antes de atender: o índice único é o que
  // sustenta a unicidade do nome, e transações não criam coleções no
  // DocumentDB (ADR 0005).
  await Promise.all(Object.values(mongoose.models).map(model => model.init()))
  console.log(`${LOGMSG} MongoDB connection established successfully`)

  app.listen(PORT, () => {
    console.log(`${LOGMSG} Server is running at ${HOST}:${PORT}`)
  })
}

start().catch(error => {
  console.error(`${LOGMSG} Failed to start: ${error}`)
  process.exit(1)
})
