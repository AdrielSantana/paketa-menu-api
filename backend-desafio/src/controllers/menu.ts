import { Request, Response } from 'express'
import mongoose, { ClientSession, Types } from 'mongoose'

import { withTransaction } from '../db/transaction'
import { normalizeMenuName } from '../domain/menu-name'
import { buildMenuTree, MenuItem, serializeMenuTree } from '../domain/menu-tree'
import { menuHasSubmenus, menuNameTaken, menuNotFound, parentNotFound } from '../errors'
import Menu from '../models/menu'
import { ChildrenStrategy, CreateMenuBody } from '../validation/menu'

interface MenuRow {
  _id: Types.ObjectId
  name: string
  relatedId: Types.ObjectId | null
}

// Desce de um item por todos os seus descendentes, seguindo quem aponta
// para ele em `relatedId` (ADR 0003).
const descendantsLookup = {
  from: Menu.collection.name,
  startWith: '$_id',
  connectFromField: '_id',
  connectToField: 'relatedId',
  as: 'descendants',
}

const DUPLICATE_KEY = 11000
const isDuplicateKeyError = (error: unknown) =>
  error instanceof mongoose.mongo.MongoServerError && error.code === DUPLICATE_KEY

const toMenuItem = ({ _id, name, relatedId }: MenuRow): MenuItem => ({
  id: _id.toString(),
  name,
  relatedId: relatedId ? relatedId.toString() : null,
})

// Cria um sub-item garantindo que o pai existe no momento da confirmação.
// A escrita no `updatedAt` do pai é a trava: sem ela, apagar o pai em
// paralelo não conflitaria com este insert e o filho nasceria órfão (ADR 0005).
const createSubmenu = (name: string, nameKey: string, relatedId: Types.ObjectId) =>
  withTransaction(async session => {
    const parent = await Menu.findOneAndUpdate(
      { _id: relatedId },
      { $currentDate: { updatedAt: true } },
      { session, timestamps: false },
    )
    if (!parent) throw parentNotFound(relatedId.toString())

    const [menu] = await Menu.create([{ name, nameKey, relatedId }], { session })
    return menu
  })

const findDescendantIds = async (id: Types.ObjectId, session: ClientSession) => {
  const [item] = await Menu.aggregate<{ descendants: { _id: Types.ObjectId }[] }>([
    { $match: { _id: id } },
    { $graphLookup: descendantsLookup },
    { $project: { 'descendants._id': 1 } },
  ]).session(session)

  return item.descendants.map(descendant => descendant._id)
}

export default {
  create: async (req: Request, res: Response): Promise<Response> => {
    // Corpo já validado em validation/menu.ts.
    const body = req.body as CreateMenuBody
    const { name, nameKey } = normalizeMenuName(body.name)

    try {
      const menu = body.relatedId
        ? await createSubmenu(name, nameKey, new Types.ObjectId(body.relatedId))
        : await Menu.create({ name, nameKey, relatedId: null })

      return res.status(201).json({ id: menu.id })
    } catch (error) {
      // O índice único em `nameKey` é quem decide, não uma consulta prévia:
      // duas criações simultâneas do mesmo nome não passam as duas.
      if (isDuplicateKeyError(error)) throw menuNameTaken(name)
      throw error
    }
  },

  getTree: async (_req: Request, res: Response): Promise<Response> => {
    const roots = await Menu.aggregate<MenuRow & { descendants: MenuRow[] }>([
      { $match: { relatedId: null } },
      { $graphLookup: descendantsLookup },
      {
        $project: {
          name: 1,
          relatedId: 1,
          'descendants._id': 1,
          'descendants.name': 1,
          'descendants.relatedId': 1,
        },
      },
    ])

    const items = roots.flatMap(root => [root, ...root.descendants]).map(toMenuItem)

    // Serialização própria, sem recursão: ver serializeMenuTree.
    return res.type('json').send(serializeMenuTree(buildMenuTree(items)))
  },

  delete: async (req: Request, res: Response): Promise<Response> => {
    // Parâmetros já validados em validation/menu.ts.
    const id = new Types.ObjectId(String(req.params.id))
    const strategy = req.query.children as ChildrenStrategy | undefined

    const deletedCount = await withTransaction(async session => {
      const item = await Menu.findById(id).session(session)
      if (!item) throw menuNotFound(id.toString())

      const submenus = await Menu.countDocuments({ relatedId: id }).session(session)
      if (submenus > 0 && !strategy) throw menuHasSubmenus(id.toString(), submenus)

      if (strategy === 'promote') {
        // Os filhos diretos passam a apontar para o avô; o resto da subárvore
        // não muda, porque cada item só conhece o próprio pai.
        await Menu.updateMany(
          { relatedId: id },
          { $set: { relatedId: item.relatedId } },
          { session },
        )
      }

      const idsToDelete =
        strategy === 'cascade' ? [id, ...(await findDescendantIds(id, session))] : [id]
      const result = await Menu.deleteMany({ _id: { $in: idsToDelete } }, { session })

      return result.deletedCount
    })

    return res.status(200).json({ id: id.toString(), deletedCount })
  },
}
