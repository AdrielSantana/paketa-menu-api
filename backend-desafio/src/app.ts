import express from 'express'

import { REQUEST_BODY_LIMIT } from './config'
import Health from './controllers/health'
import { errorHandler, notFoundHandler } from './middlewares/error-handler'
import { requestContext } from './middlewares/request-context'
import menuRoutes from './routes/menu'
import userRoutes from './routes/user'

const app = express()
// Não anuncia a tecnologia do servidor.
app.disable('x-powered-by')
// Antes de tudo: até um JSON malformado sai com request id e linha de log.
app.use(requestContext)
app.use(express.json({ limit: REQUEST_BODY_LIMIT }))
app.get('/health', Health.check)
app.use('/user', userRoutes)
app.use('/api/v1/menu', menuRoutes)

// Sempre por último: o que não casou com nenhuma rota e o que deu erro.
app.use(notFoundHandler)
app.use(errorHandler)

export default app
