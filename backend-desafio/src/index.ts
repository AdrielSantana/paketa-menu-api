import * as dotenv from 'dotenv'
dotenv.config()
import app from './app'
import { connectDatabase } from './db/connect'

const HOST = process.env.HOST || 'http://localhost'
const PORT = process.env.PORT || 8000
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/menu?replicaSet=rs0'
const LOGMSG = '⚡️[Paketá Credito Live-Coding BoilerPlate]:'

const start = async () => {
  // Conecta e garante coleções e índices antes de atender.
  await connectDatabase(MONGO_URL)
  console.log(`${LOGMSG} MongoDB connection established successfully`)

  app.listen(PORT, () => {
    console.log(`${LOGMSG} Server is running at ${HOST}:${PORT}`)
  })
}

start().catch(error => {
  console.error(`${LOGMSG} Failed to start: ${error}`)
  process.exit(1)
})
