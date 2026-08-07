import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'

const globalForPrisma = globalThis
const getDb = () => {
  if (!process.env.DATABASE_URL) return null
  if (!globalForPrisma.__loopPrisma) globalForPrisma.__loopPrisma = new PrismaClient()
  return globalForPrisma.__loopPrisma
}
const json = (body, status = 200) => NextResponse.json(body, { status })
const signupSchema = z.object({ name: z.string().min(2), workspaceName: z.string().min(2), email: z.string().email(), password: z.string().min(8) })
const feedbackSchema = z.object({ content: z.string().min(3), channel: z.string().min(2), customerLabel: z.string().optional(), sourceRef: z.string().optional() })

async function sessionUser() {
  const session = await getServerSession(authOptions)
  return session?.user || null
}

async function handle(request, { params }) {
  const path = `/${(await params).path?.join('/') || ''}`
  const method = request.method
  try {
    if (path === '/auth/signup' && method === 'POST') {
      const db = getDb()
      if (!db) return json({ error: 'DATABASE_URL is not configured.' }, 503)
      const parsed = signupSchema.safeParse(await request.json())
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400)
      const { name, workspaceName, email, password } = parsed.data
      const normalized = email.toLowerCase()
      const existing = await db.user.findUnique({ where: { email: normalized } })
      if (existing) return json({ error: 'An account with that email already exists.' }, 409)
      const workspace = await db.workspace.create({ data: { name: workspaceName, users: { create: { name, email: normalized, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } } }, include: { users: true } })
      return json({ ok: true, workspaceId: workspace.id }, 201)
    }
    if (path === '/auth/login' && method === 'POST') {
      const db = getDb()
      if (!db) return json({ error: 'DATABASE_URL is not configured.' }, 503)
      const body = await request.json()
      const user = await db.user.findUnique({ where: { email: String(body.email || '').toLowerCase() } })
      if (!user || !(await bcrypt.compare(body.password || '', user.passwordHash))) return json({ error: 'Invalid email or password.' }, 401)
      return json({ ok: true })
    }
    const user = await sessionUser()
    if (!user) return json({ error: 'Authentication required.' }, 401)
    const db = getDb()
    if (!db) return json({ setupRequired: true })

    if (path === '/feedback' && method === 'POST') {
      if (!['ADMIN', 'ANALYST'].includes(user.role)) return json({ error: 'Analysts and admins can ingest feedback.' }, 403)
      const parsed = feedbackSchema.safeParse(await request.json())
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400)
      const feedback = await db.feedback.create({ data: { ...parsed.data, customerLabel: parsed.data.customerLabel || null, workspaceId: user.workspaceId, sentiment: 'NEU', sentimentScore: 0, status: 'NEW' } })
      return json({ ok: true, feedback }, 201)
    }
    if (path === '/feedback' && method === 'GET') {
      const url = new URL(request.url)
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
      const where = { workspaceId: user.workspaceId }
      const q = url.searchParams.get('q')
      if (q) where.content = { contains: q, mode: 'insensitive' }
      const [items, total] = await Promise.all([
        db.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { themes: { include: { theme: true } } } }),
        db.feedback.count({ where }),
      ])
      return json({ items, total, page, pages: Math.ceil(total / limit) })
    }
    if (path === '/dashboard/stats' && method === 'GET') {
      const base = { workspaceId: user.workspaceId }
      const [total, negative, newThisWeek, sentiments, topThemes, recent] = await Promise.all([
        db.feedback.count({ where: base }),
        db.feedback.count({ where: { ...base, sentiment: 'NEG' } }),
        db.feedback.count({ where: { ...base, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
        db.feedback.groupBy({ by: ['sentiment'], where: base, _count: true }),
        db.feedbackTheme.groupBy({ by: ['themeId'], where: { feedback: { workspaceId: user.workspaceId } }, _count: true, orderBy: { _count: { themeId: 'desc' } }, take: 1 }),
        db.feedback.findMany({ where: { ...base, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      ])
      const theme = topThemes[0] ? await db.theme.findUnique({ where: { id: topThemes[0].themeId } }) : null
      const bySentiment = (key) => Math.round(((sentiments.find((s) => s.sentiment === key)?._count || 0) / Math.max(total, 1)) * 100)
      const grouped = recent.reduce((all, item) => { const label = new Date(item.createdAt).toLocaleDateString('en', { weekday: 'short' }); all[label] = (all[label] || 0) + 1; return all }, {})
      return json({ total, negativePercent: Math.round((negative / Math.max(total, 1)) * 100), newThisWeek, topTheme: theme?.name || null, sentiment: [{ label: 'Positive', value: bySentiment('POS'), color: 'bg-emerald-500' }, { label: 'Neutral', value: bySentiment('NEU'), color: 'bg-amber-400' }, { label: 'Negative', value: bySentiment('NEG'), color: 'bg-red-400' }], volume: Object.entries(grouped).map(([label, value]) => ({ label, value })) })
    }
    return json({ error: `Route ${path} not found` }, 404)
  } catch (error) {
    console.error('LOOP API error', error)
    return json({ error: 'Internal server error.' }, 500)
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
