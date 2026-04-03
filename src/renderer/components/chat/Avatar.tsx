/**
 * Generic avatar component: colored square with initials fallback,
 * optional image, and status dot. Driven by avatars.json data.
 */
import { getCharacterById, type NarutoCharacter } from '../../data/narutoCharacters'

type AvatarSize = 'sm' | 'md' | 'lg'
type StatusDotColor = 'green' | 'gray' | 'red' | 'blue'

const SIZE_MAP: Record<AvatarSize, { box: string; text: string; dot: string }> = {
  sm: { box: 'w-8 h-8', text: 'text-xs', dot: 'w-2.5 h-2.5' },
  md: { box: 'w-10 h-10', text: 'text-sm', dot: 'w-3 h-3' },
  lg: { box: 'w-12 h-12', text: 'text-base', dot: 'w-3.5 h-3.5' },
}

const DOT_COLORS: Record<StatusDotColor, string> = {
  green: 'bg-green-500',
  gray: 'bg-gray-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
}

interface AvatarProps {
  characterId?: string
  character?: NarutoCharacter
  size?: AvatarSize
  statusDot?: StatusDotColor
  className?: string
}

export function Avatar({ characterId, character: charProp, size = 'md', statusDot, className = '' }: AvatarProps) {
  const character = charProp ?? (characterId ? getCharacterById(characterId) : undefined)

  if (!character) {
    return (
      <div className={`${SIZE_MAP[size].box} rounded-full bg-bg-tertiary flex items-center justify-center ${className}`}>
        <span className={`${SIZE_MAP[size].text} text-text-secondary font-medium`}>?</span>
      </div>
    )
  }

  const hasImage = character.image && character.image.length > 0

  return (
    <div className={`relative inline-flex flex-shrink-0 ${className}`}>
      {hasImage ? (
        <img
          src={character.image}
          alt={character.name}
          title={character.name}
          className={`${SIZE_MAP[size].box} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${SIZE_MAP[size].box} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: character.color }}
          title={character.name}
        >
          <span className={`${SIZE_MAP[size].text} font-bold text-white drop-shadow-sm`}>
            {character.initials}
          </span>
        </div>
      )}
      {statusDot && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${SIZE_MAP[size].dot} ${DOT_COLORS[statusDot]} rounded-full border-2 border-bg-primary`}
        />
      )}
    </div>
  )
}
