import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import Papa from 'papaparse'
import { classifyFeedback, askLoop, generateVoiceOfCustomer, isLLMEnabled } from '@/lib/llm'

const globalForPrisma = globalThis
const getDb = () => {
  if (!process.env.DATABASE_URL) return null
  if (!globalForPrisma.__loopPrisma) globalForPrisma.__loopPrisma = new PrismaClient()
  return globalForPrisma.__loopPrisma
}
const json = (body, status = 200) => NextResponse.json(body, { status })

const SENTIMENTS = ['POS', 'NEU', 'NEG']
const STATUSES = ['NEW', 'REVIEWED', 'ACTIONED']

const signupSchema = z.object({
  name: z.string().min(2),
  workspaceName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
})

const feedbackSchema = z.object({
  content: z.string().min(3),
  channel: z.string().min(2),
  customerLabel: z.string().optional().nullable(),
  sourceRef: z.string().optional().nullable(),
  createdAt: z.string().optional(),
})

const classificationSchema = z.object({
  sentiment: z.enum(['POS', 'NEU', 'NEG']),
  sentimentScore: z.number().min(-1).max(1),
  themes: z.array(z.string()).min(0).max(5),
  featureArea: z.string().optional().nullable(),
  rationale: z.string().optional().nullable(),
})

async function sessionUser() {
  const session = await getServerSession(authOptions)
  return session?.user || null
}

function requireRole(user, roles) {
  return roles.includes(user.role)
}

async function ensureThemes(db, workspaceId, names) {
  const cleaned = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))].slice(0, 5)
  const themes = []
  for (const name of cleaned) {
    const theme = await db.theme.upsert({
      where: { workspaceId_name: { workspaceId, name } },
      update: {},
      create: { name, workspaceId },
    })
    themes.push(theme)
  }
  return themes
}

/**
 * Run Claude classification for a single feedback item and persist the result.
 * Falls back to a neutral placeholder if the LLM is not configured or errors.
 */
async function classifyAndPersist(db, feedbackId, workspaceId) {
  const feedback = await db.feedback.findFirst({ where: { id: feedbackId, workspaceId } })
  if (!feedback) return null
  if (!isLLMEnabled()) return feedback
  try {
    const knownThemes = await db.theme.findMany({ where: { workspaceId }, select: { name: true } })
    const raw = await classifyFeedback({ content: feedback.content, knownThemes })
    const parsed = classificationSchema.safeParse(raw)
    if (!parsed.success) throw new Error(`Invalid classification JSON: ${parsed.error.issues[0].message}`)
    const { sentiment, sentimentScore, themes, featureArea, rationale } = parsed.data
    const themeRows = await ensureThemes(db, workspaceId, themes)
    await db.$transaction([
      db.feedbackTheme.deleteMany({ where: { feedbackId } }),
      ...(themeRows.length
        ? [db.feedbackTheme.createMany({ data: themeRows.map((t) => ({ feedbackId, themeId: t.id, confidence: 0.9 })), skipDuplicates: true })]
        : []),
      db.feedback.update({
        where: { id: feedbackId },
        data: { sentiment, sentimentScore, featureArea: featureArea || null, rationale: rationale || null },
      }),
    ])
    return db.feedback.findUnique({ where: { id: feedbackId }, include: { themes: { include: { theme: true } } } })
  } catch (error) {
    console.error('classify error', error.message)
    await db.feedback.update({
      where: { id: feedbackId },
      data: { rationale: `Classification skipped: ${error.message.slice(0, 240)}` },
    })
    return db.feedback.findUnique({ where: { id: feedbackId }, include: { themes: { include: { theme: true } } } })
  }
}

async function handle(request, { params }) {
  const path = `/${(await params).path?.join('/') || ''}`
  const method = request.method
  try {
    // ─────────────────────── PUBLIC ROUTES ───────────────────────
    if (path === '/auth/signup' && method === 'POST') {
      const db = getDb()
      if (!db) return json({ error: 'DATABASE_URL is not configured.' }, 503)
      const parsed = signupSchema.safeParse(await request.json())
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400)
      const { name, workspaceName, email, password } = parsed.data
      const normalized = email.toLowerCase()
      const existing = await db.user.findUnique({ where: { email: normalized } })
      if (existing) return json({ error: 'An account with that email already exists.' }, 409)
      const workspace = await db.workspace.create({
        data: {
          name: workspaceName,
          users: { create: { name, email: normalized, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } },
        },
        include: { users: true },
      })
      return json({ ok: true, workspaceId: workspace.id }, 201)
    }
    if (path === '/auth/login' && method === 'POST') {
      const db = getDb()
      if (!db) return json({ error: 'DATABASE_URL is not configured.' }, 503)
      const body = await request.json()
      const user = await db.user.findUnique({ where: { email: String(body.email || '').toLowerCase() } })
      if (!user || !(await bcrypt.compare(body.password || '', user.passwordHash))) {
        return json({ error: 'Invalid email or password.' }, 401)
      }
      return json({ ok: true })
    }

    // ─────────────────────── AUTHENTICATED ROUTES ───────────────────────
    const user = await sessionUser()
    if (!user) return json({ error: 'Authentication required.' }, 401)
    const db = getDb()
    if (!db) return json({ setupRequired: true })

    // Single feedback ingest with automatic classification.
    if (path === '/feedback' && method === 'POST') {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Analysts and admins can ingest feedback.' }, 403)
      const parsed = feedbackSchema.safeParse(await request.json())
      if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400)
      const created = await db.feedback.create({
        data: {
          content: parsed.data.content,
          channel: parsed.data.channel,
          customerLabel: parsed.data.customerLabel || null,
          sourceRef: parsed.data.sourceRef || null,
          workspaceId: user.workspaceId,
          sentiment: 'NEU',
          sentimentScore: 0,
          status: 'NEW',
          ...(parsed.data.createdAt ? { createdAt: new Date(parsed.data.createdAt) } : {}),
        },
      })
      const classified = await classifyAndPersist(db, created.id, user.workspaceId)
      return json({ ok: true, feedback: classified || created }, 201)
    }

    // CSV bulk ingest. Accepts multipart/form-data or raw text/csv.
    if (path === '/feedback/csv' && method === 'POST') {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Analysts and admins can ingest feedback.' }, 403)
      let csvText = ''
      const contentType = request.headers.get('content-type') || ''
      if (contentType.includes('multipart/form-data')) {
        const form = await request.formData()
        const file = form.get('file')
        if (!file || typeof file === 'string') return json({ error: 'Attach a CSV file under the "file" field.' }, 400)
        csvText = await file.text()
      } else {
        csvText = await request.text()
      }
      if (!csvText.trim()) return json({ error: 'CSV body is empty.' }, 400)

      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() })
      const rows = parsed.data || []
      const errors = []
      const created = []
      const shouldClassify = new URL(request.url).searchParams.get('classify') !== 'false'

      for (const [index, row] of rows.entries()) {
        const content = (row.content || row.text || row.message || '').toString().trim()
        const channel = (row.channel || row.source || 'IMPORT').toString().trim().toUpperCase().slice(0, 32)
        if (!content) { errors.push({ row: index + 2, error: 'content is required' }); continue }
        if (content.length < 3) { errors.push({ row: index + 2, error: 'content too short' }); continue }
        try {
          const parsedDate = row.created_at || row.createdat || row.date ? new Date(row.created_at || row.createdat || row.date) : null
          const feedback = await db.feedback.create({
            data: {
              content: content.slice(0, 4000),
              channel: channel || 'IMPORT',
              customerLabel: (row.customer_label || row.customer || row.customerlabel || null) ? String(row.customer_label || row.customer || row.customerlabel).slice(0, 120) : null,
              sourceRef: row.source_ref || row.sourceref || null,
              workspaceId: user.workspaceId,
              sentiment: 'NEU',
              sentimentScore: 0,
              status: 'NEW',
              ...(parsedDate && !isNaN(parsedDate.getTime()) ? { createdAt: parsedDate } : {}),
            },
          })
          created.push(feedback.id)
        } catch (error) {
          errors.push({ row: index + 2, error: error.message.slice(0, 200) })
        }
      }

      // Classify asynchronously so the API returns quickly. Cap to avoid runaway usage.
      if (shouldClassify && isLLMEnabled() && created.length) {
        const toClassify = created.slice(0, 25)
        Promise.allSettled(toClassify.map((id) => classifyAndPersist(db, id, user.workspaceId))).catch(() => {})
      }

      return json({
        ok: true,
        importedCount: created.length,
        failedCount: errors.length,
        errors: errors.slice(0, 25),
        classifying: shouldClassify && isLLMEnabled() ? Math.min(created.length, 25) : 0,
      }, 201)
    }

    // Feedback inbox — server-side paged, filtered, searched.
    if (path === '/feedback' && method === 'GET') {
      const url = new URL(request.url)
      const page = Math.max(1, Number(url.searchParams.get('page') || 1))
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
      const q = url.searchParams.get('q')
      const channel = url.searchParams.get('channel')
      const sentiment = url.searchParams.get('sentiment')
      const status = url.searchParams.get('status')
      const themeId = url.searchParams.get('themeId')
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')

      const where = { workspaceId: user.workspaceId }
      if (q) where.OR = [
        { content: { contains: q, mode: 'insensitive' } },
        { customerLabel: { contains: q, mode: 'insensitive' } },
        { featureArea: { contains: q, mode: 'insensitive' } },
      ]
      if (channel) where.channel = channel
      if (sentiment && SENTIMENTS.includes(sentiment)) where.sentiment = sentiment
      if (status && STATUSES.includes(status)) where.status = status
      if (themeId) where.themes = { some: { themeId } }
      if (from || to) where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      }

      const [items, total] = await Promise.all([
        db.feedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { themes: { include: { theme: true } } },
        }),
        db.feedback.count({ where }),
      ])
      return json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
    }

    // Update a feedback's status (workflow) — analyst+.
    const patchMatch = path.match(/^\/feedback\/([^/]+)$/)
    if (patchMatch && (method === 'PATCH' || method === 'PUT')) {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Read-only role cannot modify feedback.' }, 403)
      const body = await request.json()
      const data = {}
      if (body.status && STATUSES.includes(body.status)) data.status = body.status
      if (Object.keys(data).length === 0) return json({ error: 'Nothing to update.' }, 400)
      const feedback = await db.feedback.findFirst({ where: { id: patchMatch[1], workspaceId: user.workspaceId } })
      if (!feedback) return json({ error: 'Feedback not found.' }, 404)
      const updated = await db.feedback.update({
        where: { id: feedback.id },
        data,
        include: { themes: { include: { theme: true } } },
      })
      return json({ ok: true, feedback: updated })
    }

    // Manual reclassification — analyst+.
    const reclassifyMatch = path.match(/^\/feedback\/([^/]+)\/classify$/)
    if (reclassifyMatch && method === 'POST') {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Read-only role cannot classify.' }, 403)
      const feedback = await db.feedback.findFirst({ where: { id: reclassifyMatch[1], workspaceId: user.workspaceId } })
      if (!feedback) return json({ error: 'Feedback not found.' }, 404)
      if (!isLLMEnabled()) return json({ error: 'LLM is not configured.' }, 503)
      const classified = await classifyAndPersist(db, feedback.id, user.workspaceId)
      return json({ ok: true, feedback: classified })
    }

    // Simulated channel ingest — creates a demo feedback entry from a canned pool.
    if (path === '/feedback/simulate' && method === 'POST') {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Analysts and admins can ingest feedback.' }, 403)
      const pool = [
        { content: 'The onboarding is confusing — I could not find how to invite my team on day one.', channel: 'INTERCOM', customerLabel: 'Acme Corp' },
        { content: 'Love the new dashboard! It replaced three of our internal spreadsheets.', channel: 'EMAIL', customerLabel: 'Beacon Labs' },
        { content: 'Exports keep failing when the file is larger than 20MB. This is a blocker for us.', channel: 'APP_STORE', customerLabel: 'Northwind' },
        { content: 'Can you add Slack notifications when a report is generated?', channel: 'FEATURE_REQUEST', customerLabel: 'Delta Ops' },
        { content: 'Pricing feels steep for a small team of 3. A starter tier would help us adopt this properly.', channel: 'INTERCOM', customerLabel: 'Kite Studio' },
        { content: 'The mobile experience needs work — swiping between feedback items is jumpy.', channel: 'APP_STORE', customerLabel: 'Peak & Co' },
        { content: 'Search does not find matches when there are typos. Very frustrating on long lists.', channel: 'EMAIL', customerLabel: 'Foundry' },
        { content: 'Great support team. They helped us migrate 4 workspaces in a day. Truly stellar.', channel: 'INTERCOM', customerLabel: 'Ridgeway' },
      ]
      const item = pool[Math.floor(Math.random() * pool.length)]
      const created = await db.feedback.create({
        data: { ...item, workspaceId: user.workspaceId, sentiment: 'NEU', sentimentScore: 0, status: 'NEW' },
      })
      const classified = await classifyAndPersist(db, created.id, user.workspaceId)
      return json({ ok: true, feedback: classified || created }, 201)
    }

    // Distinct channel list for filter dropdowns.
    if (path === '/feedback/channels' && method === 'GET') {
      const rows = await db.feedback.findMany({
        where: { workspaceId: user.workspaceId },
        distinct: ['channel'],
        select: { channel: true },
        orderBy: { channel: 'asc' },
      })
      return json({ channels: rows.map((r) => r.channel) })
    }

    // Dashboard stats (kept backward compatible + filterable by period).
    if (path === '/dashboard/stats' && method === 'GET') {
      const url = new URL(request.url)
      const days = Math.min(180, Math.max(1, Number(url.searchParams.get('days') || 30)))
      const since = new Date(Date.now() - days * 86400000)
      const base = { workspaceId: user.workspaceId }
      const scoped = { ...base, createdAt: { gte: since } }
      const [total, negative, newThisWeek, sentiments, topThemes, recent] = await Promise.all([
        db.feedback.count({ where: base }),
        db.feedback.count({ where: { ...base, sentiment: 'NEG' } }),
        db.feedback.count({ where: { ...base, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
        db.feedback.groupBy({ by: ['sentiment'], where: base, _count: true }),
        db.feedbackTheme.groupBy({
          by: ['themeId'],
          where: { feedback: { workspaceId: user.workspaceId } },
          _count: true,
          orderBy: { _count: { themeId: 'desc' } },
          take: 1,
        }),
        db.feedback.findMany({
          where: scoped,
          select: { createdAt: true, sentiment: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])
      const theme = topThemes[0] ? await db.theme.findUnique({ where: { id: topThemes[0].themeId } }) : null
      const bySentiment = (key) => Math.round(((sentiments.find((s) => s.sentiment === key)?._count || 0) / Math.max(total, 1)) * 100)
      // Weekly buckets for the volume chart.
      const buckets = new Map()
      for (const item of recent) {
        const day = new Date(item.createdAt)
        const key = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        buckets.set(key, (buckets.get(key) || 0) + 1)
      }
      const volume = Array.from(buckets.entries()).map(([label, value]) => ({ label, value })).slice(-14)
      return json({
        total,
        negativePercent: Math.round((negative / Math.max(total, 1)) * 100),
        newThisWeek,
        topTheme: theme?.name || null,
        sentiment: [
          { label: 'Positive', value: bySentiment('POS'), color: 'bg-emerald-500' },
          { label: 'Neutral', value: bySentiment('NEU'), color: 'bg-amber-400' },
          { label: 'Negative', value: bySentiment('NEG'), color: 'bg-red-400' },
        ],
        volume,
      })
    }

    // Themes list with counts, sentiment breakdown, and trend deltas.
    if (path === '/themes' && method === 'GET') {
      const url = new URL(request.url)
      const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days') || 30)))
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000)
      const previousStart = new Date(now.getTime() - days * 2 * 86400000)

      const themes = await db.theme.findMany({
        where: { workspaceId: user.workspaceId },
        include: {
          feedback: {
            include: { feedback: { select: { id: true, sentiment: true, createdAt: true } } },
          },
        },
      })

      const summary = themes.map((theme) => {
        let total = 0, current = 0, previous = 0, pos = 0, neu = 0, neg = 0
        for (const link of theme.feedback) {
          const created = new Date(link.feedback.createdAt).getTime()
          total += 1
          if (link.feedback.sentiment === 'POS') pos += 1
          if (link.feedback.sentiment === 'NEU') neu += 1
          if (link.feedback.sentiment === 'NEG') neg += 1
          if (created >= periodStart.getTime()) current += 1
          else if (created >= previousStart.getTime()) previous += 1
        }
        const change = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100)
        return {
          id: theme.id,
          name: theme.name,
          description: theme.description || null,
          total,
          current,
          previous,
          change,
          spike: previous > 0 && current > previous * 1.6 && current >= 4,
          sentiment: { pos, neu, neg, negPct: Math.round((neg / Math.max(total, 1)) * 100) },
        }
      }).sort((a, b) => b.current - a.current || b.total - a.total)

      // Volume-over-time buckets per theme (top 5 by current count).
      const topSlice = summary.slice(0, 5)
      const bucketKeys = []
      for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000)
        bucketKeys.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      }
      const seriesById = new Map(topSlice.map((t) => [t.id, Object.fromEntries(bucketKeys.map((k) => [k, 0]))]))
      const themeFeedback = await db.feedbackTheme.findMany({
        where: { themeId: { in: topSlice.map((t) => t.id) }, feedback: { workspaceId: user.workspaceId, createdAt: { gte: new Date(now.getTime() - Math.min(days, 30) * 86400000) } } },
        include: { feedback: { select: { createdAt: true } } },
      })
      for (const link of themeFeedback) {
        const key = new Date(link.feedback.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        const bucket = seriesById.get(link.themeId)
        if (bucket && key in bucket) bucket[key] += 1
      }
      const series = bucketKeys.map((label) => {
        const row = { label }
        for (const theme of topSlice) row[theme.name] = seriesById.get(theme.id)?.[label] || 0
        return row
      })

      return json({ themes: summary, topThemes: topSlice.map((t) => t.name), series })
    }

    // Theme drill-down: return recent feedback tagged with the theme.
    const themeDrillMatch = path.match(/^\/themes\/([^/]+)\/feedback$/)
    if (themeDrillMatch && method === 'GET') {
      const url = new URL(request.url)
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
      const theme = await db.theme.findFirst({ where: { id: themeDrillMatch[1], workspaceId: user.workspaceId } })
      if (!theme) return json({ error: 'Theme not found.' }, 404)
      const items = await db.feedback.findMany({
        where: { workspaceId: user.workspaceId, themes: { some: { themeId: theme.id } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { themes: { include: { theme: true } } },
      })
      return json({ theme, items })
    }

    // Ask LOOP — grounded question answering.
    if (path === '/ask' && method === 'POST') {
      const body = await request.json()
      const question = String(body.question || '').trim()
      if (question.length < 3) return json({ error: 'Ask a question with at least 3 characters.' }, 400)
      if (!isLLMEnabled()) return json({ error: 'LLM is not configured.' }, 503)

      // Lexical retrieval: keyword-overlap + ILIKE matching, then diversify.
      const words = Array.from(new Set(question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)))
      const orClauses = words.length
        ? words.map((w) => ({ OR: [{ content: { contains: w, mode: 'insensitive' } }, { featureArea: { contains: w, mode: 'insensitive' } }, { themes: { some: { theme: { name: { contains: w, mode: 'insensitive' } } } } }] }))
        : []

      const candidateCount = 80
      const candidates = await db.feedback.findMany({
        where: {
          workspaceId: user.workspaceId,
          ...(orClauses.length ? { OR: orClauses.flatMap((c) => c.OR) } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: candidateCount,
        include: { themes: { include: { theme: true } } },
      })

      // Fallback: if lexical match is thin, backfill with recent feedback so Claude has *something* to consider.
      let pool = candidates
      if (pool.length < 12) {
        const backfill = await db.feedback.findMany({
          where: { workspaceId: user.workspaceId, id: { notIn: pool.map((p) => p.id) } },
          orderBy: { createdAt: 'desc' },
          take: 20 - pool.length,
          include: { themes: { include: { theme: true } } },
        })
        pool = [...pool, ...backfill]
      }

      // Score by word overlap and negative-sentiment weight (users often ask about pain points).
      const scored = pool.map((item) => {
        const bag = `${item.content} ${item.featureArea || ''} ${item.themes.map((t) => t.theme.name).join(' ')}`.toLowerCase()
        const overlap = words.reduce((acc, w) => acc + (bag.includes(w) ? 1 : 0), 0)
        const boost = item.sentiment === 'NEG' ? 0.4 : item.sentiment === 'POS' ? 0.2 : 0
        return { item, score: overlap + boost }
      }).sort((a, b) => b.score - a.score)

      const passages = scored.slice(0, 18).map(({ item }) => ({
        id: item.id,
        content: item.content,
        channel: item.channel,
        sentiment: item.sentiment,
        customerLabel: item.customerLabel,
        createdAt: item.createdAt,
        themes: item.themes.map((t) => t.theme.name),
      }))

      const result = await askLoop({ question, passages })
      const evidence = (result.evidenceIndices || [])
        .map((n) => passages[n - 1])
        .filter(Boolean)
        .slice(0, 8)
      return json({
        answer: result.answer,
        confidence: result.confidence || 'medium',
        evidence,
        retrieved: passages.length,
      })
    }

    // Reports — list.
    if (path === '/reports' && method === 'GET') {
      const reports = await db.report.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { generatedBy: { select: { name: true, email: true } } },
      })
      return json({ reports })
    }

    // Reports — generate a new Voice-of-Customer report from real workspace stats.
    if (path === '/reports' && method === 'POST') {
      if (!requireRole(user, ['ADMIN', 'ANALYST'])) return json({ error: 'Read-only role cannot generate reports.' }, 403)
      const body = await request.json().catch(() => ({}))
      const days = Math.min(180, Math.max(7, Number(body.days || 30)))
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000)
      const previousStart = new Date(now.getTime() - days * 2 * 86400000)

      const [currentItems, previousItems, themes] = await Promise.all([
        db.feedback.findMany({
          where: { workspaceId: user.workspaceId, createdAt: { gte: periodStart, lte: now } },
          include: { themes: { include: { theme: true } } },
        }),
        db.feedback.findMany({
          where: { workspaceId: user.workspaceId, createdAt: { gte: previousStart, lt: periodStart } },
          select: { sentiment: true },
        }),
        db.theme.findMany({ where: { workspaceId: user.workspaceId } }),
      ])

      const total = currentItems.length
      const negCurrent = currentItems.filter((i) => i.sentiment === 'NEG').length
      const negPrev = previousItems.filter((i) => i.sentiment === 'NEG').length
      const negPct = Math.round((negCurrent / Math.max(total, 1)) * 100)
      const negPctPrev = Math.round((negPrev / Math.max(previousItems.length, 1)) * 100)
      const sentimentShift = negPct - negPctPrev

      const themeCounts = new Map()
      for (const item of currentItems) for (const link of item.themes) {
        themeCounts.set(link.theme.name, (themeCounts.get(link.theme.name) || 0) + 1)
      }
      const topThemes = Array.from(themeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }))

      // Prefer negative quotes as most actionable; fall back to any.
      const quotes = [...currentItems]
        .sort((a, b) => (a.sentiment === 'NEG' ? -1 : 1) - (b.sentiment === 'NEG' ? -1 : 1))
        .slice(0, 6)
        .map((i) => ({ text: i.content.slice(0, 260), sentiment: i.sentiment, customer: i.customerLabel || null, channel: i.channel }))

      const stats = {
        totalFeedback: total,
        percentNegative: negPct,
        newFeedback: currentItems.filter((i) => i.createdAt >= new Date(now.getTime() - 7 * 86400000)).length,
        distinctThemes: themeCounts.size,
      }

      let narrative
      if (!isLLMEnabled() || total === 0) {
        narrative = {
          executiveSummary: total ? `LOOP captured ${total} customer signals in the last ${days} days.` : 'No feedback in this period.',
          sentimentNarrative: `Negative sentiment is ${negPct}% (previous period ${negPctPrev}%).`,
          themeInsights: topThemes.map((t) => ({ theme: t.name, insight: `${t.count} mentions in this period.` })),
          recommendedActions: ['Ingest more customer feedback to unlock deeper insights.'],
        }
      } else {
        try {
          narrative = await generateVoiceOfCustomer({
            periodLabel: `${periodStart.toDateString()} – ${now.toDateString()}`,
            stats,
            topThemes,
            quotes,
            sentimentShift,
          })
        } catch (error) {
          console.error('report narrative error', error.message)
          narrative = {
            executiveSummary: `LOOP captured ${total} customer signals across ${themeCounts.size} themes in the last ${days} days.`,
            sentimentNarrative: `Negative sentiment moved from ${negPctPrev}% to ${negPct}% (${sentimentShift >= 0 ? '+' : ''}${sentimentShift} pp).`,
            themeInsights: topThemes.map((t) => ({ theme: t.name, insight: `${t.count} mentions this period.` })),
            recommendedActions: ['Review the top negative theme first.', 'Follow up on the most-quoted customer signals.'],
          }
        }
      }

      const report = await db.report.create({
        data: {
          title: `Voice of Customer — ${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          periodStart,
          periodEnd: now,
          workspaceId: user.workspaceId,
          generatedById: user.id,
          contentJson: { stats, topThemes, quotes, sentimentShift, narrative, days },
        },
      })
      return json({ ok: true, report }, 201)
    }

    // Single report fetch.
    const reportMatch = path.match(/^\/reports\/([^/]+)$/)
    if (reportMatch && method === 'GET') {
      const report = await db.report.findFirst({
        where: { id: reportMatch[1], workspaceId: user.workspaceId },
        include: { generatedBy: { select: { name: true, email: true } } },
      })
      if (!report) return json({ error: 'Report not found.' }, 404)
      return json({ report })
    }

    // Workspace members (RBAC UI).
    if (path === '/workspace/members' && method === 'GET') {
      const members = await db.user.findMany({
        where: { workspaceId: user.workspaceId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      return json({ members, currentUserId: user.id })
    }
    if (path === '/workspace/members' && method === 'PATCH') {
      if (!requireRole(user, ['ADMIN'])) return json({ error: 'Only admins can change member roles.' }, 403)
      const body = await request.json()
      if (!body.userId || !['ADMIN', 'ANALYST', 'VIEWER'].includes(body.role)) return json({ error: 'Invalid payload.' }, 400)
      const target = await db.user.findFirst({ where: { id: body.userId, workspaceId: user.workspaceId } })
      if (!target) return json({ error: 'Member not found.' }, 404)
      const updated = await db.user.update({ where: { id: target.id }, data: { role: body.role } })
      return json({ ok: true, member: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } })
    }

    return json({ error: `Route ${path} not found` }, 404)
  } catch (error) {
    console.error('LOOP API error', error)
    return json({ error: 'Internal server error.', detail: error.message?.slice(0, 200) }, 500)
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
export const PATCH = handle
