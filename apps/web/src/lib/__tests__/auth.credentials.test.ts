import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { authConfig } from '../auth.config.js'

// Replicates the authorize logic from auth.ts — tested as a pure function with mocked Prisma
function makeAuthorize(prismaUser: unknown) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(prismaUser) } }
  return async (credentials: Record<string, string | undefined>) => {
    if (!credentials?.email || !credentials?.password) return null
    if (credentials.email !== process.env.DEMO_CAREGIVER_EMAIL) return null
    const hash = process.env.DEMO_CAREGIVER_PASSWORD_HASH
    if (!hash) return null
    const valid = await bcrypt.compare(credentials.password, hash)
    if (!valid) return null
    return prisma.user.findUnique({ where: { email: credentials.email } })
  }
}

const seededUser = { id: 'u1', email: 'caregiver@demo.naiber.app', name: 'Demo Caregiver' }
const CORRECT_PASSWORD = 'correctpassword'

describe('credentials authorize', () => {
  const hash = bcrypt.hashSync(CORRECT_PASSWORD, 10)

  beforeEach(() => {
    process.env.DEMO_CAREGIVER_EMAIL = 'caregiver@demo.naiber.app'
    process.env.DEMO_CAREGIVER_PASSWORD_HASH = hash
  })

  afterEach(() => {
    delete process.env.DEMO_CAREGIVER_EMAIL
    delete process.env.DEMO_CAREGIVER_PASSWORD_HASH
  })

  it('returns user on matching email + password', async () => {
    const authorize = makeAuthorize(seededUser)
    const result = await authorize({ email: 'caregiver@demo.naiber.app', password: CORRECT_PASSWORD })
    expect(result).toEqual(seededUser)
  })

  it('returns null on wrong password', async () => {
    const authorize = makeAuthorize(seededUser)
    const result = await authorize({ email: 'caregiver@demo.naiber.app', password: 'wrongpassword' })
    expect(result).toBeNull()
  })

  it('returns null on wrong email', async () => {
    const authorize = makeAuthorize(seededUser)
    const result = await authorize({ email: 'other@example.com', password: CORRECT_PASSWORD })
    expect(result).toBeNull()
  })

  it('returns null when DEMO_CAREGIVER_PASSWORD_HASH is absent', async () => {
    delete process.env.DEMO_CAREGIVER_PASSWORD_HASH
    const authorize = makeAuthorize(seededUser)
    const result = await authorize({ email: 'caregiver@demo.naiber.app', password: CORRECT_PASSWORD })
    expect(result).toBeNull()
  })
})

describe('authConfig providers (Google unchanged)', () => {
  it('authConfig still contains a Google provider', () => {
    const providerIds = authConfig.providers.map((p) =>
      typeof p === 'function' ? p({}).id : (p as { id: string }).id
    )
    expect(providerIds).toContain('google')
  })

  it('authConfig does not contain credentials provider', () => {
    const providerIds = authConfig.providers.map((p) =>
      typeof p === 'function' ? p({}).id : (p as { id: string }).id
    )
    expect(providerIds).not.toContain('credentials')
  })
})
