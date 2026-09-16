import { validateCardImage } from '../../domain/cards/cardImage'

export const demoCardImageRepository = {
  upload(file: File) {
    const error = validateCardImage(file)
    if (error) throw new Error(error)
    return URL.createObjectURL(file)
  },
  remove(imageUrl: string) {
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl)
  },
}
