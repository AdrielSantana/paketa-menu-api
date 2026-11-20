import express from 'express'

import { REQUEST_BODY_LIMIT } from './config'
import { errorHandler, notFoundHandler } from './middlewares/error-handler'
import menuRoutes from './routes/menu'
import userRoutes from './routes/user'

const app = express()
// Não anuncia a tecnologia do servidor.
app.disable('x-powered-by')
app.use(express.json({ limit: REQUEST_BODY_LIMIT }))
app.use('/user', userRoutes)
app.use('/api/v1/menu', menuRoutes)

// Sempre por último: o que não casou com nenhuma rota e o que deu erro.
app.use(notFoundHandler)
app.use(errorHandler)

export default app
