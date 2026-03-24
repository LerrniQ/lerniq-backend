const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateRefId(): string {
  const random = Array.from({ length: 5 }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join('')
  return `LNQ-${random}`
}
