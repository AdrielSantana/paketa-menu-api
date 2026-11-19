import { model, Schema, Types } from 'mongoose'

export interface IMenu {
  name: string
  /** Chave de unicidade derivada do nome (ADR 0006). */
  nameKey: string
  /** Pai do item; `null` em itens de primeiro nível (ADR 0003). */
  relatedId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMenu>(
  {
    name: { type: String, required: true },
    nameKey: { type: String, required: true, unique: true },
    relatedId: { type: Schema.Types.ObjectId, ref: 'menu', default: null, index: true },
  },
  { timestamps: true },
)

export default model<IMenu>('menu', schema, 'menus')
