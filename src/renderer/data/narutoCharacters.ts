/**
 * Generic avatar system: loads character definitions from avatars.json.
 * To add/remove avatars, just edit avatars.json — no code changes needed.
 * Characters are assigned randomly (shuffled) per app session.
 */
import avatarData from './avatars.json'

export interface NarutoCharacter {
  id: string
  name: string
  shortName: string
  color: string
  initials: string
  trait: string
  image: string
}

/** All available avatars loaded from JSON. */
export const NARUTO_CHARACTERS: NarutoCharacter[] = avatarData as NarutoCharacter[]

/** Seeded shuffle for consistent random order per app session. */
const shuffled = [...NARUTO_CHARACTERS].sort(() => Math.random() - 0.5)

/** Get character by sequential index using shuffled order (cycles on overflow). */
export function getNextCharacter(usedCount: number): NarutoCharacter {
  return shuffled[usedCount % shuffled.length]
}

/** Lookup character by id. */
export function getCharacterById(id: string): NarutoCharacter | undefined {
  return NARUTO_CHARACTERS.find((c) => c.id === id)
}
