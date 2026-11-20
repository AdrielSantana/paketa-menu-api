// Medições do ADR 0009: compara três formas de guardar e ler o menu.
//
//   1. referência ao pai + $graphLookup
//   2. referência ao pai + find da coleção
//   3. array de ancestrais + find
//
// Uso: npm run bench:read            (até 100 mil itens, cerca de 1 minuto)
//      BENCH_FULL=1 npm run bench:read   (inclui 1 milhão de itens, vários minutos)
//
// Sobe um MongoDB em memória, como os testes. Os números mudam de máquina para
// máquina: servem para comparar ordens de grandeza, não como benchmark.
import { execFileSync } from 'node:child_process'

import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose, { Types } from 'mongoose'

import { buildMenuTree, serializeMenuTree } from '../src/domain/menu-tree'
import { MONGODB_VERSION } from '../test/setup/mongo-server'

interface Row {
  _id: Types.ObjectId
  name: string
  relatedId: Types.ObjectId | null
}

// Índice do pai de cada item, ou -1 para um item de primeiro nível.
type ParentOf = (index: number) => number

// Raízes com `perRoot` itens cada, em que cada item tem até 10 filhos.
const forest =
  (perRoot: number): ParentOf =>
  index => {
    const local = index % perRoot
    return local === 0 ? -1 : index - local + Math.floor((local - 1) / 10)
  }

const shapes: [label: string, total: number, parentOf: ParentOf][] = [
  ['100 raízes de 100', 10_000, forest(100)],
  ['1.000 raízes de 100', 100_000, forest(100)],
  ['1 raiz com 100 mil', 100_000, forest(100_000)],
  ['cadeia de 2.000 níveis', 2_000, index => index - 1],
]
if (process.env.BENCH_FULL)
  shapes.push(['1.000 raízes de 1.000', 1_000_000, forest(1_000)])

const megabytes = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10
const report = (record: object) => console.log(JSON.stringify(record))

const main = async () => {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_VERSION },
    replSet: { count: 1 },
  })
  // O mongod que acabou de subir é o processo mais novo com esse nome.
  const mongodPid = execFileSync('pgrep', ['-n', 'mongod']).toString().trim()
  const mongodCpuMs = () =>
    execFileSync('ps', ['-o', 'cputime=', '-p', mongodPid])
      .toString()
      .trim()
      .split(':')
      .reduce((total, part) => total * 60 + Number(part), 0) * 1000

  await mongoose.connect(replSet.getUri(), { dbName: 'bench', monitorCommands: true })
  let roundTrips = 0
  mongoose.connection.getClient().on('commandStarted', event => {
    if (['aggregate', 'find', 'getMore'].includes(event.commandName)) roundTrips++
  })

  const db = mongoose.connection.db!
  const parentOnly = db.collection<Row>('menus')
  const withAncestors = db.collection<Row & { ancestors: Types.ObjectId[] }>(
    'menus_ancestors',
  )
  const projection = { name: 1, relatedId: 1 }
  const descendantsOf = (extra: object = {}) => ({
    $graphLookup: {
      from: 'menus',
      startWith: '$_id',
      connectFromField: '_id',
      connectToField: 'relatedId',
      as: 'descendants',
      ...extra,
    },
  })

  // Os mesmos índices do model, mais o do array de ancestrais.
  const seed = async (total: number, parentOf: ParentOf) => {
    await parentOnly.drop().catch(() => undefined)
    await withAncestors.drop().catch(() => undefined)
    await parentOnly.createIndex({ nameKey: 1 }, { unique: true })
    await parentOnly.createIndex({ relatedId: 1 })
    await withAncestors.createIndex({ nameKey: 1 }, { unique: true })
    await withAncestors.createIndex({ relatedId: 1 })
    await withAncestors.createIndex({ ancestors: 1 })

    const ids = Array.from({ length: total }, () => new Types.ObjectId())
    const ancestors: Types.ObjectId[][] = []
    const now = new Date()
    const batchSize = total <= 5_000 ? 200 : 20_000
    for (let start = 0; start < total; start += batchSize) {
      const documents = []
      for (let index = start; index < Math.min(start + batchSize, total); index++) {
        const parent = parentOf(index)
        ancestors[index] = parent < 0 ? [] : [...ancestors[parent], ids[parent]]
        documents.push({
          _id: ids[index],
          name: `Item ${index}`,
          nameKey: `item ${index}`,
          relatedId: parent < 0 ? null : ids[parent],
          createdAt: now,
          updatedAt: now,
          __v: 0,
        })
      }
      await parentOnly.insertMany(documents, { ordered: false })
      await withAncestors.insertMany(
        documents.map((document, offset) => ({
          ...document,
          ancestors: ancestors[start + offset],
        })),
        { ordered: false },
      )
    }
    await db.admin().command({ fsync: 1 })
    return ids
  }

  const storage = async (collection: string) => {
    const stats = await db.command({ collStats: collection })
    return {
      averageDocumentBytes: stats.avgObjSize,
      dataMb: megabytes(stats.size),
      onDiskMb: megabytes(stats.storageSize),
      indexesMb: megabytes(stats.totalIndexSize),
    }
  }

  // Mediana de três execuções (uma só acima de 100 mil itens).
  const measure = async (total: number, read: () => Promise<number>) => {
    const runs = []
    for (let run = 0; run < (total > 100_000 ? 1 : 3); run++) {
      const tripsBefore = roundTrips
      const cpuBefore = mongodCpuMs()
      const start = performance.now()
      const rows = await read()
      runs.push({
        ms: Math.round(performance.now() - start),
        mongodCpuMs: Math.round(mongodCpuMs() - cpuBefore),
        roundTrips: roundTrips - tripsBefore,
        rows,
      })
    }
    return runs.sort((a, b) => a.ms - b.ms)[runs.length >> 1]
  }

  const countNested = (roots: { descendants: unknown[] }[]) =>
    roots.reduce((total, root) => total + 1 + root.descendants.length, 0)

  for (const [shape, total, parentOf] of shapes) {
    const [rootId] = await seed(total, parentOf)

    report({
      shape,
      total,
      storage: {
        parentOnly: await storage('menus'),
        withAncestors: await storage('menus_ancestors'),
      },
    })

    report({
      shape,
      read: 'menu inteiro',
      graphLookup: await measure(total, async () =>
        countNested(
          await parentOnly
            .aggregate<{ descendants: Row[] }>([
              { $match: { relatedId: null } },
              descendantsOf(),
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
            .toArray(),
        ),
      ),
      find: await measure(
        total,
        async () => (await parentOnly.find({}, { projection }).toArray()).length,
      ),
      findWithAncestors: await measure(
        total,
        async () => (await withAncestors.find({}, { projection }).toArray()).length,
      ),
    })

    // A parte que roda na aplicação em qualquer um dos três desenhos.
    {
      const rows = await parentOnly.find({}, { projection }).toArray()
      const start = performance.now()
      const json = serializeMenuTree(
        buildMenuTree(
          rows.map(row => ({
            id: row._id.toString(),
            name: row.name,
            relatedId: row.relatedId ? row.relatedId.toString() : null,
          })),
        ),
      )
      report({
        shape,
        application: 'montar e serializar',
        ms: Math.round(performance.now() - start),
        responseMb: megabytes(Buffer.byteLength(json)),
      })
    }

    // O que a exclusão em cascata precisa: os ids da subárvore de um item.
    report({
      shape,
      read: 'ids da subárvore da primeira raiz',
      graphLookup: await measure(total, async () =>
        countNested(
          await parentOnly
            .aggregate<{ descendants: Row[] }>([
              { $match: { _id: rootId } },
              descendantsOf(),
              { $project: { 'descendants._id': 1 } },
            ])
            .toArray(),
        ),
      ),
      findByAncestor: await measure(
        total,
        async () =>
          (
            await withAncestors
              .find({ ancestors: rootId }, { projection: { _id: 1 } })
              .toArray()
          ).length,
      ),
    })

    // Promover os filhos da primeira raiz: quantos documentos cada modelo reescreve.
    {
      let start = performance.now()
      const direct = await parentOnly.updateMany(
        { relatedId: rootId },
        { $set: { relatedId: null } },
      )
      const parentOnlyMs = Math.round(performance.now() - start)

      start = performance.now()
      const children = await withAncestors.updateMany(
        { relatedId: rootId },
        { $set: { relatedId: null } },
      )
      const descendants = await withAncestors.updateMany(
        { ancestors: rootId },
        { $pull: { ancestors: rootId } },
      )
      report({
        shape,
        write: 'promover os filhos da primeira raiz',
        parentOnly: { ms: parentOnlyMs, documentsWritten: direct.modifiedCount },
        withAncestors: {
          ms: Math.round(performance.now() - start),
          documentsWritten: children.modifiedCount + descendants.modifiedCount,
        },
      })
    }
  }

  // Onde o $graphLookup gasta o tempo: uma raiz com N filhos diretos, com a
  // busca completa e parando no primeiro nível (maxDepth: 0).
  for (const total of [50_000, 100_000, 200_000]) {
    await seed(total, index => (index === 0 ? -1 : 0))
    const time = async (extra: object) => {
      const start = performance.now()
      await parentOnly
        .aggregate([
          { $match: { relatedId: null } },
          descendantsOf(extra),
          { $project: { count: { $size: '$descendants' } } },
        ])
        .toArray()
      return Math.round(performance.now() - start)
    }
    report({
      diagnostic: '1 raiz com N filhos diretos',
      total,
      fullMs: await time({}),
      firstLevelOnlyMs: await time({ maxDepth: 0 }),
    })
  }

  await mongoose.disconnect()
  await replSet.stop()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
