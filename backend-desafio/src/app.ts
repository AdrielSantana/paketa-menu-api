import express from 'express'

import { errorHandler, notFoundHandler } from './middlewares/error-handler'
import menuRoutes from './routes/menu'
import userRoutes from './routes/user'

const app = express()
app.use(express.json())
app.use('/user', userRoutes)
app.use('/api/v1/menu', menuRoutes)

// Sempre por último: o que não casou com nenhuma rota e o que deu erro.
app.use(notFoundHandler)
app.use(errorHandler)

export default app
