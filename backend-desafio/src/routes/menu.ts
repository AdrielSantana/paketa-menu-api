import express from 'express'

import Menu from '../controllers/menu'
import validation from '../validation/menu'

const routes = express.Router()

routes.post('/', validation.create, Menu.create)
routes.get('/', Menu.getTree)
routes.delete('/:id', validation.delete, Menu.delete)

export default routes
