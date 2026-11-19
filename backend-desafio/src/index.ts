import * as dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'

import app from './app'

const HOST = process.env.HOST || 'https://localhost'
const PORT = process.env.PORT || 8000
const LOGMSG = '⚡️[Paketá Credito Live-Coding BoilerPlate]:'

mongoose
    .connect(process.env.MONGO_URL || 'mongodb://localhost:27017/local')
    .then(() => console.log(`${LOGMSG} MongoDB connection established successfully`))
    .catch(err => console.log(`${LOGMSG} Failed to connect to MongoDB: ${err}`))

app.listen(PORT, () => {
    console.log(`${LOGMSG} Server is running at ${HOST}:${PORT}`)
})
