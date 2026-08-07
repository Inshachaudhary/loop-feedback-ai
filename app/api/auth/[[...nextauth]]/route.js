import NextAuth from 'next-auth'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'

const globalForPrisma = globalThis
const getDb = () => {
  if (!process.env.DATABASE_URL) return null
  if (!globalForPrisma.__loopPrisma) globalForPrisma.__loopPrisma = new PrismaClient()
  return globalForPrisma.__loopPrisma
}
const nextAuthHandler = NextAuth(authOptions)
const signupSchema = z.object({ name: z.string().min(2), workspaceName: z.string().min(2), email: z.string().email(), password: z.string().min(8) })

async function customAuth(request) {
  const path = request.nextUrl.pathname
  const db = getDb()
  if (!db) return Response.json({ error: 'DATABASE_URL is not configured.' }, { status: 503 })
  if (path.endsWith('/signup')) {
    const parsed = signupSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { name, workspaceName, email, password } = parsed.data
    const normalized = email.toLowerCase()
    if (await db.user.findUnique({ where: { email: normalized } })) return Response.json({ error: 'An account with that email already exists.' }, { status: 409 })
    const workspace = await db.workspace.create({ data: { name: workspaceName, users: { create: { name, email: normalized, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } } } })
    return Response.json({ ok: true, workspaceId: workspace.id }, { status: 201 })
  }
  if (path.endsWith('/login')) {
    const body = await request.json()
    const user = await db.user.findUnique({ where: { email: String(body.email || '').toLowerCase() } })
    if (!user || !(await bcrypt.compare(body.password || '', user.passwordHash))) return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    return Response.json({ ok: true })
  }
  return null
}

async function route(request, context) {
  if (request.method === 'POST' && (request.nextUrl.pathname.endsWith('/signup') || request.nextUrl.pathname.endsWith('/login'))) {
    return customAuth(request)
  }
  return nextAuthHandler(request, context)
}

export const GET = (request, context) => nextAuthHandler(request, context)
export const POST = route
