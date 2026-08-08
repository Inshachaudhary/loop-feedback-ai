'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSession, signIn, signOut, useSession } from 'next-auth/react'
import { Activity, ArrowUpRight, BarChart3, Check, ChevronDown, ChevronRight, CircleHelp, Download, FileText, Filter, Inbox, LayoutDashboard, Loader2, LogOut, MessageSquare, Plus, Printer, RefreshCw, Search, Send, Settings, Sparkles, Upload, Users, X, Zap } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, Legend, Line, LineChart, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// ─────────────────────── SHARED HELPERS ───────────────────────
const nav = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'feedback', label: 'Feedback inbox', icon: Inbox },
  { id: 'themes', label: 'Themes & trends', icon: BarChart3 },
  { id: 'ask', label: 'Ask LOOP', icon: MessageSquare, accent: true },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const SENTIMENT_META = {
  POS: { label: 'Positive', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', color: '#10b981' },
  NEU: { label: 'Neutral', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-800 border-amber-200', color: '#f59e0b' },
  NEG: { label: 'Negative', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200', color: '#ef4444' },
}
const STATUS_META = {
  NEW: { label: 'New', chip: 'bg-foreground text-background' },
  REVIEWED: { label: 'Reviewed', chip: 'bg-muted text-foreground' },
  ACTIONED: { label: 'Actioned', chip: 'bg-emerald-600 text-white' },
}
const CHART_COLORS = ['#1f2937', '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9']
const fmtDate = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const fmtRelative = (value) => {
  const diff = Date.now() - new Date(value).getTime()
  const d = Math.floor(diff / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  return fmtDate(value)
}

// ─────────────────────── AUTH SCREEN ───────────────────────
function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', workspaceName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'signup') {
        const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to sign up.')
      }
      const res = await signIn('credentials', { email: form.email, password: form.password, redirect: false })
      // Trust NextAuth's own signal. `signIn` sets `error` when authorize() returned null
      // and `ok=true` only when the Set-Cookie for the session-token was returned by the
      // callback endpoint. Anything more (extra getSession round-trips) races with cookie
      // propagation on cold Neon Postgres starts and gives false "session not established"
      // errors even though the login actually succeeded.
      if (res?.error) throw new Error(res.error === 'CredentialsSignin' ? 'Invalid email or password.' : res.error)
      if (!res?.ok) throw new Error('Sign in did not complete. Please try again.')
      // Hard navigate so SessionProvider hydrates fresh with the just-set cookie.
      window.location.href = res.url || '/'
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }
  return <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
    <div className="hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between">
      <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center bg-background text-sm font-bold text-foreground">L</div><span className="text-xl font-semibold">LOOP</span></div>
      <div>
        <p className="max-w-lg text-5xl font-semibold leading-[1.03] tracking-[-0.06em]">Know what customers want.<br /><span className="text-background/50">Know what to do next.</span></p>
        <p className="mt-7 max-w-md text-sm leading-6 text-background/60">LOOP turns scattered customer feedback into a ranked, evidence-backed list of what to do next.</p>
        <div className="mt-10 grid max-w-md gap-3 border border-background/20 p-5 text-sm text-background/70">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-background/50">Demo workspace</p>
          <p><span className="text-background/50">Admin</span> · admin@loop.demo</p>
          <p><span className="text-background/50">Analyst</span> · analyst@loop.demo</p>
          <p><span className="text-background/50">Viewer</span> · viewer@loop.demo</p>
          <p className="text-background/50">Password: <span className="font-mono text-background/80">loop-demo-2025</span></p>
        </div>
      </div>
      <p className="text-xs text-background/40">Feedback intelligence for teams that listen closely.</p>
    </div>
    <div className="flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-12 flex items-center gap-3 lg:hidden"><div className="grid h-8 w-8 place-items-center bg-foreground text-sm font-bold text-background">L</div><span className="text-lg font-semibold">LOOP</span></div>
        <p className="text-sm text-muted-foreground">{mode === 'login' ? 'Welcome back' : 'Start your workspace'}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{mode === 'login' ? 'Sign in to LOOP' : 'Create your workspace'}</h1>
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'signup' && <>
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Your name" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input required value={form.workspaceName} onChange={(event) => setForm({ ...form, workspaceName: event.target.value })} placeholder="Workspace name" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </>}
          <input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@company.com" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Password (8+ characters)" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="w-full bg-foreground p-3 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create workspace'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === 'login' ? 'New to LOOP?' : 'Already have an account?'}{' '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} className="font-medium text-foreground underline underline-offset-4">
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  </div>
}

// ─────────────────────── DASHBOARD VIEW ───────────────────────
function Stat({ label, value, note, tone = 'ink' }) {
  return <div className="border border-border bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <span className={`h-2 w-2 rounded-full ${tone === 'red' ? 'bg-red-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-foreground/30'}`} />
    </div>
    <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
    <p className="mt-2 text-sm text-muted-foreground">{note}</p>
  </div>
}

function DashboardView({ stats, loading, onExplore }) {
  const volume = stats?.volume || []
  return <>
    {loading ? <div className="mt-8 grid h-64 place-items-center border border-dashed border-border text-sm text-muted-foreground">Loading workspace intelligence…</div>
      : stats?.setupRequired ? <div className="mt-8 border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-semibold">Connect PostgreSQL to load your workspace.</p></div>
      : <>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total feedback" value={stats?.total ?? '—'} note="Across all channels" />
          <Stat label="Negative sentiment" value={`${stats?.negativePercent ?? 0}%`} note="Share of all-time signals" tone="red" />
          <Stat label="New this week" value={stats?.newThisWeek ?? '—'} note="Last 7 days of ingest" tone="green" />
          <Stat label="Top theme" value={stats?.topTheme || '—'} note="Most mentioned recently" />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
          <section className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div><h2 className="font-semibold tracking-[-0.02em]">Feedback volume</h2><p className="mt-1 text-sm text-muted-foreground">Last 30 days</p></div>
            </div>
            <div className="mt-6 h-56">
              {volume.length ? <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volume} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1f2937" stopOpacity={0.35} /><stop offset="100%" stopColor="#1f2937" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={30} />
                  <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 0, fontSize: 12 }} />
                  <Area type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} fill="url(#volFill)" />
                </AreaChart>
              </ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-muted-foreground">No feedback in this range.</div>}
            </div>
          </section>
          <section className="border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div><h2 className="font-semibold tracking-[-0.02em]">Sentiment pulse</h2><p className="mt-1 text-sm text-muted-foreground">All feedback</p></div>
              <Activity size={18} className="text-muted-foreground" />
            </div>
            <div className="mt-6 space-y-4">
              {(stats?.sentiment || []).map((item) => <div key={item.label}>
                <div className="mb-2 flex justify-between text-sm"><span>{item.label}</span><span className="font-medium">{item.value}%</span></div>
                <div className="h-2 bg-muted"><div className={`h-2 ${item.color}`} style={{ width: `${item.value}%` }} /></div>
              </div>)}
            </div>
            <button onClick={onExplore} className="mt-6 text-sm font-medium underline underline-offset-4">Explore inbox <ArrowUpRight className="ml-1 inline" size={14} /></button>
          </section>
        </div>
      </>}
  </>
}

// ─────────────────────── FEEDBACK INBOX ───────────────────────
function StatusPill({ status }) { const meta = STATUS_META[status] || STATUS_META.NEW; return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${meta.chip}`}>{meta.label}</span> }
function SentimentPill({ sentiment }) { const meta = SENTIMENT_META[sentiment] || SENTIMENT_META.NEU; return <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span> }

function FeedbackDetail({ item, onClose, onStatusChange, onReclassify, canEdit }) {
  const [busy, setBusy] = useState(false)
  const setStatus = async (status) => { setBusy(true); await onStatusChange(item.id, status); setBusy(false) }
  const reclassify = async () => { setBusy(true); await onReclassify(item.id); setBusy(false) }
  return <div className="fixed inset-0 z-50 flex justify-end bg-foreground/25" onClick={onClose}>
    <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-8 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.channel}{item.customerLabel ? ` · ${item.customerLabel}` : ''}</p>
          <p className="mt-1 text-xs text-muted-foreground">{fmtDate(item.createdAt)}</p>
        </div>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <SentimentPill sentiment={item.sentiment} />
        <StatusPill status={item.status} />
        {item.featureArea && <span className="border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{item.featureArea}</span>}
      </div>
      <p className="mt-6 whitespace-pre-wrap text-base leading-relaxed text-foreground">{item.content}</p>
      {item.rationale && <div className="mt-6 border border-border bg-muted/40 p-4 text-sm text-muted-foreground"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/60">LOOP rationale</p><p className="mt-2 leading-6">{item.rationale}</p></div>}
      {item.themes?.length ? <div className="mt-6"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Themes</p><div className="mt-3 flex flex-wrap gap-2">{item.themes.map((link) => <span key={link.theme.id} className="border border-border bg-card px-2.5 py-1 text-xs">{link.theme.name}</span>)}</div></div> : null}
      {canEdit && <div className="mt-8 border-t border-border pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Move to</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['NEW', 'REVIEWED', 'ACTIONED'].map((status) => <button key={status} disabled={busy || item.status === status} onClick={() => setStatus(status)} className={`px-3 py-2 text-xs font-medium disabled:opacity-40 ${item.status === status ? 'border border-foreground text-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}>{STATUS_META[status].label}</button>)}
          <button disabled={busy} onClick={reclassify} className="ml-auto inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"><RefreshCw size={12} />Re-classify with LOOP</button>
        </div>
      </div>}
    </div>
  </div>
}

function FeedbackInbox({ session, onCaptureOpen, onImportOpen, refreshKey }) {
  const canEdit = ['ADMIN', 'ANALYST'].includes(session.user?.role)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [channel, setChannel] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [status, setStatus] = useState('')
  const [channels, setChannels] = useState([])
  const [active, setActive] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => { fetch('/api/feedback/channels').then((r) => r.json()).then((data) => setChannels(data.channels || [])).catch(() => {}) }, [refreshKey])

  const load = useCallback(async () => {
    setLoading(true)
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController(); abortRef.current = controller
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (q) params.set('q', q); if (channel) params.set('channel', channel); if (sentiment) params.set('sentiment', sentiment); if (status) params.set('status', status)
    try {
      const response = await fetch(`/api/feedback?${params.toString()}`, { signal: controller.signal })
      const data = await response.json()
      setItems(data.items || []); setPages(data.pages || 1); setTotal(data.total || 0)
    } catch (error) { if (error.name !== 'AbortError') console.error(error) }
    finally { setLoading(false) }
  }, [page, q, channel, sentiment, status])

  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { setPage(1) }, [q, channel, sentiment, status])

  const updateStatus = async (id, next) => {
    const response = await fetch(`/api/feedback/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    const data = await response.json()
    if (response.ok) {
      setItems((current) => current.map((it) => it.id === id ? data.feedback : it))
      setActive((current) => current?.id === id ? data.feedback : current)
    }
  }
  const reclassify = async (id) => {
    const response = await fetch(`/api/feedback/${id}/classify`, { method: 'POST' })
    const data = await response.json()
    if (response.ok) {
      setItems((current) => current.map((it) => it.id === id ? data.feedback : it))
      setActive((current) => current?.id === id ? data.feedback : current)
    }
  }

  return <section className="mt-8">
    <div className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
      <div className="flex flex-1 items-center gap-2 border border-transparent bg-muted/50 px-3 py-2">
        <Search size={15} className="text-muted-foreground" />
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search feedback, customers, features…" className="w-full bg-transparent text-sm outline-none" />
      </div>
      <select value={channel} onChange={(event) => setChannel(event.target.value)} className="border border-border bg-background px-3 py-2 text-sm">
        <option value="">All channels</option>
        {channels.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={sentiment} onChange={(event) => setSentiment(event.target.value)} className="border border-border bg-background px-3 py-2 text-sm">
        <option value="">All sentiments</option>
        <option value="POS">Positive</option><option value="NEU">Neutral</option><option value="NEG">Negative</option>
      </select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="border border-border bg-background px-3 py-2 text-sm">
        <option value="">All statuses</option>
        <option value="NEW">New</option><option value="REVIEWED">Reviewed</option><option value="ACTIONED">Actioned</option>
      </select>
      {canEdit && <>
        <button onClick={onImportOpen} className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"><Upload size={14} />Import CSV</button>
        <button onClick={onCaptureOpen} className="inline-flex items-center gap-2 bg-foreground px-3 py-2 text-sm font-medium text-background"><Plus size={14} />New</button>
      </>}
    </div>

    <div className="mt-4 border border-border bg-card">
      <div className="grid grid-cols-[1fr] gap-0 sm:grid-cols-[1.9fr_0.9fr_0.7fr_0.7fr_0.6fr] items-center border-b border-border bg-muted/30 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <div>Feedback</div><div className="hidden sm:block">Themes</div><div className="hidden sm:block">Sentiment</div><div className="hidden sm:block">Status</div><div className="hidden text-right sm:block">Received</div>
      </div>
      {loading ? <div className="grid h-52 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline animate-spin" size={14} />Loading feedback…</div>
        : items.length === 0 ? <div className="grid h-52 place-items-center text-sm text-muted-foreground">No feedback matches those filters.</div>
        : items.map((item) => <button key={item.id} onClick={() => setActive(item)} className="grid w-full grid-cols-1 items-start gap-2 border-b border-border px-4 py-4 text-left transition hover:bg-muted/40 sm:grid-cols-[1.9fr_0.9fr_0.7fr_0.7fr_0.6fr] sm:items-center">
          <div>
            <p className="line-clamp-2 text-sm text-foreground">{item.content}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.channel}{item.customerLabel ? ` · ${item.customerLabel}` : ''}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(item.themes || []).slice(0, 2).map((link) => <span key={link.theme.id} className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{link.theme.name}</span>)}
            {(item.themes?.length || 0) > 2 && <span className="text-[10px] text-muted-foreground">+{item.themes.length - 2}</span>}
          </div>
          <div><SentimentPill sentiment={item.sentiment} /></div>
          <div><StatusPill status={item.status} /></div>
          <div className="text-right text-[11px] text-muted-foreground">{fmtRelative(item.createdAt)}</div>
        </button>)}
    </div>

    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <span>{total.toLocaleString()} feedback · Page {page} of {pages}</span>
      <div className="flex gap-2">
        <button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="border border-border bg-card px-3 py-1.5 disabled:opacity-40">Previous</button>
        <button disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} className="border border-border bg-card px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>

    {active && <FeedbackDetail item={active} onClose={() => setActive(null)} onStatusChange={updateStatus} onReclassify={reclassify} canEdit={canEdit} />}
  </section>
}

// ─────────────────────── THEMES & TRENDS ───────────────────────
function ThemesView({ session }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [drill, setDrill] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/themes?days=${days}`).then((r) => r.json()).then(setData).finally(() => setLoading(false))
  }, [days])

  const openDrill = async (theme) => {
    setDrill({ theme, items: null })
    const response = await fetch(`/api/themes/${theme.id}/feedback`)
    const payload = await response.json()
    setDrill({ theme: payload.theme, items: payload.items })
  }

  if (loading) return <div className="mt-8 grid h-64 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={14} />Analyzing themes…</div>
  if (!data?.themes?.length) return <div className="mt-8 border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No themes yet. Ingest feedback and LOOP will auto-classify it.</div>

  const barData = data.themes.slice(0, 8).map((t) => ({ name: t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name, current: t.current, previous: t.previous }))

  return <section className="mt-8 space-y-6">
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">Trend window</p>
      <div className="flex gap-1 border border-border bg-card p-1">
        {[7, 30, 90].map((n) => <button key={n} onClick={() => setDays(n)} className={`px-3 py-1 text-xs ${days === n ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>{n} days</button>)}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <div className="border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold tracking-[-0.02em]">Theme mentions vs previous period</h2>
        <p className="mt-1 text-sm text-muted-foreground">Compare current {days}-day window against the prior {days} days.</p>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" angle={-25} textAnchor="end" height={60} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={30} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 0, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="previous" name={`Previous ${days}d`} fill="#d1d5db" />
              <Bar dataKey="current" name={`Last ${days}d`} fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold tracking-[-0.02em]">Top-5 theme volume over time</h2>
        <p className="mt-1 text-sm text-muted-foreground">Daily mentions for the leading themes.</p>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} stroke="#6b7280" interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="#6b7280" width={26} />
              <Tooltip contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 0, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.topThemes.map((name, index) => <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    <div className="border border-border bg-card">
      <div className="border-b border-border px-5 py-4"><h2 className="font-semibold tracking-[-0.02em]">All themes</h2><p className="mt-1 text-sm text-muted-foreground">Click a theme to see the feedback behind it.</p></div>
      <div className="divide-y divide-border">
        {data.themes.map((theme) => <button key={theme.id} onClick={() => openDrill(theme)} className="grid w-full grid-cols-[1.6fr_0.7fr_0.7fr_1.2fr_0.4fr] items-center gap-3 px-5 py-4 text-left transition hover:bg-muted/40">
          <div>
            <div className="flex items-center gap-2"><p className="text-sm font-medium">{theme.name}</p>{theme.spike && <span className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-700"><Zap size={10} /> Spike</span>}</div>
            <p className="mt-1 text-xs text-muted-foreground">{theme.total} total mentions</p>
          </div>
          <div><p className="text-lg font-semibold tracking-[-0.03em]">{theme.current}</p><p className="text-[11px] text-muted-foreground">this period</p></div>
          <div><p className={`text-sm font-medium ${theme.change > 0 ? 'text-emerald-600' : theme.change < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{theme.change > 0 ? '+' : ''}{theme.change}%</p><p className="text-[11px] text-muted-foreground">vs previous</p></div>
          <div>
            <div className="flex h-1.5 overflow-hidden bg-muted">
              {['POS', 'NEU', 'NEG'].map((key) => { const value = key === 'POS' ? theme.sentiment.pos : key === 'NEU' ? theme.sentiment.neu : theme.sentiment.neg; return <div key={key} className={SENTIMENT_META[key].dot} style={{ width: `${(value / Math.max(theme.total, 1)) * 100}%` }} /> })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{theme.sentiment.negPct}% negative</p>
          </div>
          <ChevronRight size={16} className="ml-auto text-muted-foreground" />
        </button>)}
      </div>
    </div>

    {drill && <div className="fixed inset-0 z-50 flex justify-end bg-foreground/25" onClick={() => setDrill(null)}>
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background p-8" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Theme</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{drill.theme?.name}</h2></div>
          <button onClick={() => setDrill(null)}><X size={18} /></button>
        </div>
        {drill.items === null ? <div className="mt-10 grid place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={14} /> Loading feedback…</div>
          : drill.items.length === 0 ? <p className="mt-10 text-sm text-muted-foreground">No feedback yet.</p>
          : <div className="mt-6 space-y-4">{drill.items.map((item) => <div key={item.id} className="border border-border bg-card p-4">
            <div className="flex items-center gap-2"><SentimentPill sentiment={item.sentiment} /><span className="text-[11px] text-muted-foreground">{item.channel}{item.customerLabel ? ` · ${item.customerLabel}` : ''}</span><span className="ml-auto text-[11px] text-muted-foreground">{fmtRelative(item.createdAt)}</span></div>
            <p className="mt-3 text-sm leading-6 text-foreground">{item.content}</p>
          </div>)}</div>}
      </div>
    </div>}
  </section>
}

// ─────────────────────── ASK LOOP ───────────────────────
const SUGGESTED_QUESTIONS = [
  'What are customers saying about onboarding?',
  'Why are customers unhappy this month?',
  'What features are customers requesting most?',
  'Which parts of the product are working well?',
]

function AskView() {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const ask = async (event) => {
    event?.preventDefault?.()
    if (!question.trim()) return
    setBusy(true); setError(''); setResult(null)
    try {
      const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Ask LOOP failed.')
      setResult(data)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
    <div>
      <div className="border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center bg-foreground text-background"><Sparkles size={16} /></div><div><h2 className="text-xl font-semibold tracking-[-0.03em]">Ask LOOP</h2><p className="mt-1 text-sm text-muted-foreground">Ask a question in plain English. LOOP answers only from your workspace feedback and shows the evidence.</p></div></div>
        <form onSubmit={ask} className="mt-6">
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. What are customers saying about onboarding?" className="min-h-24 w-full resize-none border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">Grounded in your workspace only · Powered by Claude Sonnet 4.5</p>
            <button disabled={busy} className="inline-flex items-center gap-2 bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50">{busy ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><Send size={14} /> Ask LOOP</>}</button>
          </div>
        </form>
      </div>
      {error && <div className="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {result && <div className="mt-6 border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">LOOP's answer</p>
          <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[11px] ${result.confidence === 'high' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : result.confidence === 'low' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-border bg-muted text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${result.confidence === 'high' ? 'bg-emerald-500' : result.confidence === 'low' ? 'bg-amber-500' : 'bg-foreground/60'}`} />{result.confidence} confidence</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{result.answer}</p>
        <p className="mt-6 text-[11px] text-muted-foreground">Retrieved {result.retrieved} feedback items · Used {result.evidence?.length || 0} as evidence.</p>
      </div>}
    </div>
    <div className="space-y-6">
      <div className="border border-border bg-card p-5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Try one of these</p>
        <div className="mt-3 space-y-2">
          {SUGGESTED_QUESTIONS.map((q) => <button key={q} onClick={() => setQuestion(q)} className="block w-full border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted">{q}</button>)}
        </div>
      </div>
      {result?.evidence?.length ? <div className="border border-border bg-card p-5 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Evidence used</p>
        <div className="mt-3 space-y-3">
          {result.evidence.map((item, index) => <div key={item.id} className="border border-border bg-background p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="font-mono">[{index + 1}]</span><SentimentPill sentiment={item.sentiment} /><span>{item.channel}{item.customerLabel ? ` · ${item.customerLabel}` : ''}</span></div>
            <p className="mt-2 line-clamp-4 text-sm leading-6">{item.content}</p>
          </div>)}
        </div>
      </div> : null}
    </div>
  </section>
}

// ─────────────────────── REPORTS ───────────────────────
function ReportsView({ session }) {
  const canGenerate = ['ADMIN', 'ANALYST'].includes(session.user?.role)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [days, setDays] = useState(30)
  const [current, setCurrent] = useState(null)
  const printRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/reports').then((r) => r.json()).then((data) => setReports(data.reports || [])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!current && reports[0]) setCurrent(reports[0]) }, [reports, current])

  const generate = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) })
      const data = await response.json()
      if (response.ok) { await load(); setCurrent(data.report) }
    } finally { setGenerating(false) }
  }

  const printReport = () => {
    if (!current) return
    const html = printRef.current?.innerHTML || ''
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>${current.title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:48px;color:#111827;line-height:1.6;max-width:820px;margin:0 auto}h1{font-size:28px;letter-spacing:-0.03em;margin:0 0 8px}h2{font-size:16px;text-transform:uppercase;letter-spacing:0.14em;color:#6b7280;margin-top:32px}.stat{display:inline-block;margin-right:32px;margin-top:8px}.stat b{display:block;font-size:24px}blockquote{border-left:3px solid #111827;padding:8px 16px;margin:16px 0;color:#374151;font-style:italic}ul{padding-left:20px}li{margin:6px 0}.meta{color:#6b7280;font-size:12px;margin-bottom:24px}</style></head><body>${html}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),400)}<\/script></body></html>`)
    win.document.close()
  }

  return <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.5fr]">
    <div>
      <div className="border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center bg-foreground text-background"><FileText size={16} /></div><div><h2 className="text-lg font-semibold tracking-[-0.03em]">Voice of Customer</h2><p className="mt-1 text-sm text-muted-foreground">Generate an executive-ready report from real workspace data.</p></div></div>
        {canGenerate ? <div className="mt-5 space-y-3">
          <div className="flex gap-1 border border-border p-1">{[7, 30, 90].map((n) => <button key={n} onClick={() => setDays(n)} className={`flex-1 py-1.5 text-xs ${days === n ? 'bg-foreground text-background' : 'text-muted-foreground'}`}>Last {n} days</button>)}</div>
          <button disabled={generating} onClick={generate} className="inline-flex w-full items-center justify-center gap-2 bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-50">{generating ? <><Loader2 size={14} className="animate-spin" /> Composing report…</> : <><Sparkles size={14} /> Generate report</>}</button>
        </div> : <p className="mt-4 text-sm text-muted-foreground">Only admins and analysts can generate reports.</p>}
      </div>
      <div className="mt-5 border border-border bg-card shadow-sm">
        <p className="border-b border-border px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Previous reports</p>
        <div className="divide-y divide-border">
          {loading ? <div className="grid h-24 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={14} />Loading…</div>
            : reports.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">No reports yet — generate your first Voice-of-Customer above.</p>
            : reports.map((report) => <button key={report.id} onClick={() => setCurrent(report)} className={`grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/40 ${current?.id === report.id ? 'bg-muted/50' : ''}`}>
              <div><p className="text-sm font-medium">{report.title}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(report.createdAt)} · {report.generatedBy?.name}</p></div>
              <ChevronRight size={14} className="text-muted-foreground" />
            </button>)}
        </div>
      </div>
    </div>
    <div className="border border-border bg-card shadow-sm">
      {current ? <>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Report</p><h3 className="mt-1 text-lg font-semibold tracking-[-0.02em]">{current.title}</h3></div>
          <button onClick={printReport} className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><Printer size={13} /> Export PDF</button>
        </div>
        <div ref={printRef} className="max-h-[75vh] overflow-y-auto px-6 py-6 text-sm leading-7 text-foreground">
          <p className="meta text-xs text-muted-foreground">Generated {fmtDate(current.createdAt)} · Period: {fmtDate(current.periodStart)} → {fmtDate(current.periodEnd)}</p>
          <h1>{current.title}</h1>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {Object.entries(current.contentJson?.stats || {}).map(([key, value]) => <div key={key} className="stat"><b>{typeof value === 'number' ? value.toLocaleString() : value}{key === 'percentNegative' ? '%' : ''}</b><span className="text-xs text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</span></div>)}
          </div>
          <h2>Executive summary</h2>
          <p>{current.contentJson?.narrative?.executiveSummary}</p>
          <h2>Sentiment</h2>
          <p>{current.contentJson?.narrative?.sentimentNarrative}</p>
          <h2>Top themes</h2>
          <ul>
            {(current.contentJson?.narrative?.themeInsights || []).map((insight, index) => <li key={index}><b>{insight.theme}</b> — {insight.insight}</li>)}
          </ul>
          <h2>Notable quotes</h2>
          {(current.contentJson?.quotes || []).map((quote, index) => <blockquote key={index}>"{quote.text}" — <em>{quote.customer || 'Customer'}, {quote.channel}</em></blockquote>)}
          <h2>Recommended actions</h2>
          <ul>
            {(current.contentJson?.narrative?.recommendedActions || []).map((action, index) => <li key={index}>{action}</li>)}
          </ul>
        </div>
      </> : <div className="grid h-96 place-items-center px-6 text-center text-sm text-muted-foreground">Generate a report to see it here.</div>}
    </div>
  </section>
}

// ─────────────────────── SETTINGS / MEMBERS ───────────────────────
function SettingsView({ session }) {
  const isAdmin = session.user?.role === 'ADMIN'
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/workspace/members').then((r) => r.json()).then((data) => setMembers(data.members || [])).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])
  const setRole = async (userId, role) => {
    const response = await fetch('/api/workspace/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) })
    if (response.ok) load()
  }
  return <section className="mt-8 space-y-5">
    <div className="border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-[-0.03em]">Workspace members</h2>
      <p className="mt-1 text-sm text-muted-foreground">Admins can change roles. Analysts can ingest and manage feedback. Viewers have read-only access.</p>
      <div className="mt-6 divide-y divide-border">
        {loading ? <div className="grid h-24 place-items-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={14} />Loading…</div>
          : members.map((member) => <div key={member.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-4">
            <div>
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-[12px] text-muted-foreground">{member.email}</p>
            </div>
            {isAdmin ? <select value={member.role} onChange={(event) => setRole(member.id, event.target.value)} className="border border-border bg-background px-3 py-1.5 text-xs">
              <option>ADMIN</option><option>ANALYST</option><option>VIEWER</option>
            </select> : <span className="border border-border bg-background px-2.5 py-1 text-[11px] font-medium">{member.role}</span>}
          </div>)}
      </div>
    </div>
  </section>
}

// ─────────────────────── CAPTURE / IMPORT MODALS ───────────────────────
function CaptureModal({ onClose, onDone }) {
  const [form, setForm] = useState({ content: '', channel: 'INTERCOM', customerLabel: '' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setNotice('')
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await response.json()
    if (!response.ok) { setNotice(data.error || 'Could not save feedback.'); setBusy(false); return }
    setNotice('Captured and classified by LOOP.'); onDone(); setTimeout(onClose, 700)
  }
  const simulate = async () => {
    setBusy(true); setNotice('')
    const response = await fetch('/api/feedback/simulate', { method: 'POST' })
    if (response.ok) { setNotice('Pulled a signal from the simulated channel.'); onDone(); setTimeout(onClose, 700) }
    setBusy(false)
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4" onClick={onClose}>
    <div className="w-full max-w-lg border border-border bg-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">Capture feedback</h2><p className="mt-1 text-sm text-muted-foreground">LOOP will classify sentiment and themes automatically.</p></div>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <textarea required minLength={3} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="What did the customer say?" className="min-h-32 w-full resize-none border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <div className="grid grid-cols-2 gap-3">
          <select value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} className="border border-border bg-background p-3 text-sm">
            <option>INTERCOM</option><option>EMAIL</option><option>APP_STORE</option><option>NPS</option><option>FEATURE_REQUEST</option><option>SIMULATED</option>
          </select>
          <input value={form.customerLabel} onChange={(event) => setForm({ ...form, customerLabel: event.target.value })} placeholder="Customer label (optional)" className="border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={simulate} disabled={busy} className="flex-1 border border-border bg-background py-3 text-sm font-medium hover:bg-muted disabled:opacity-50">Pull from simulated channel</button>
          <button disabled={busy} className="flex-1 bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Saving…' : 'Save & classify'}</button>
        </div>
      </form>
    </div>
  </div>
}

function ImportModal({ onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const submit = async (event) => {
    event.preventDefault()
    if (!file) return
    setBusy(true); setResult(null)
    const form = new FormData(); form.append('file', file)
    const response = await fetch('/api/feedback/csv', { method: 'POST', body: form })
    const data = await response.json()
    setResult(data); setBusy(false)
    if (response.ok) onDone()
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4" onClick={onClose}>
    <div className="w-full max-w-xl border border-border bg-card p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">Import feedback CSV</h2><p className="mt-1 text-sm text-muted-foreground">Columns supported: <code>content</code>, <code>channel</code>, <code>customer_label</code>, <code>created_at</code>.</p></div>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="grid cursor-pointer place-items-center border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground hover:bg-muted/50">
          <Upload size={20} />
          <span className="mt-2">{file ? file.name : 'Choose a CSV file or drop it here'}</span>
          <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className="hidden" />
        </label>
        {result && (result.ok ? <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">Imported {result.importedCount} rows{result.failedCount ? ` · ${result.failedCount} failed` : ''}.</p>
          {result.classifying > 0 && <p className="mt-1 text-xs">LOOP is classifying {result.classifying} rows in the background — refresh in a few seconds.</p>}
          {result.errors?.length ? <ul className="mt-2 space-y-0.5 text-xs">{result.errors.slice(0, 5).map((error, index) => <li key={index}>Row {error.row}: {error.error}</li>)}</ul> : null}
        </div> : <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{result.error || 'Import failed.'}</div>)}
        <button disabled={busy || !file} className="w-full bg-foreground p-3 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Uploading…' : 'Import'}</button>
      </form>
    </div>
  </div>
}

// ─────────────────────── ROOT APP ───────────────────────
function App() {
  const { data: session, status } = useSession()
  const [active, setActive] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCapture, setShowCapture] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (status === 'authenticated') {
      // Only show the loader on the very first fetch; subsequent session re-hydrations
      // (which change the session object identity) should not blank out the dashboard.
      setStats((current) => { if (!current) setLoading(true); return current })
      fetch('/api/dashboard/stats').then((r) => r.json()).then(setStats).catch(() => setStats({ setupRequired: true })).finally(() => setLoading(false))
    } else if (status === 'unauthenticated') setLoading(false)
  }, [status, session?.user?.email, refreshKey])

  const greeting = useMemo(() => session?.user?.name ? `Good morning, ${session.user.name.split(' ')[0]}` : 'Good morning', [session])
  const canIngest = ['ADMIN', 'ANALYST'].includes(session?.user?.role)

  if (status === 'loading' && !session) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading LOOP…</div>
  if (status === 'unauthenticated') return <AuthScreen />

  const pageMeta = nav.find((item) => item.id === active)
  const description = {
    dashboard: 'Here is what customers are telling you this week.',
    feedback: 'Every customer signal — searchable, filterable, and classified.',
    themes: 'Turn recurring signals into a ranked list of what to do next.',
    ask: 'Ask questions in plain English, grounded in your customers.',
    reports: 'Executive-ready Voice-of-Customer reports from real feedback.',
    settings: 'Manage workspace members and roles.',
  }[active]

  return <div className="min-h-screen bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-30 w-64 border-r border-border bg-card px-4 py-5 block">
      <div className="flex items-center gap-3 px-3">
        <div className="grid h-8 w-8 place-items-center bg-foreground text-sm font-bold text-background">L</div>
        <span className="text-lg font-semibold tracking-[-0.03em]">LOOP</span>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Beta</span>
      </div>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</div>
      <div className="mt-3 flex items-center gap-3 px-3 py-2 text-sm font-medium">
        <span className="grid h-6 w-6 place-items-center bg-[#e7e2d8] text-xs font-bold">{(session?.user?.name || 'W')[0]}</span>
        <span>Acme, Inc.</span>
      </div>
      <nav className="mt-8 space-y-1">
        {nav.map(({ id, label, icon: Icon, accent }) => <button key={id} onClick={() => setActive(id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition ${active === id ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${accent && active !== id ? 'text-foreground' : ''}`}>
          <Icon size={16} strokeWidth={1.8} />{label}
          {id === 'feedback' && stats?.total ? <span className="ml-auto text-xs opacity-60">{stats.total}</span> : null}
        </button>)}
      </nav>
      <div className="absolute bottom-5 left-4 right-4">
        <div className="mb-2 px-3 text-[11px] text-muted-foreground">Signed in as <span className="font-medium text-foreground">{session?.user?.role}</span></div>
        <button onClick={() => {
          // Iframe-safe logout: plain top-level navigation to our server-side
          // /api/logout endpoint, which expires the NextAuth cookies and 302s to /.
          // No fetch, no CSRF token dance — impossible for the browser to stall.
          window.location.href = '/api/logout'
        }} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"><LogOut size={16} />Sign out</button>
      </div>
    </aside>
    <main className="pl-64">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 lg:px-10">
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <Search size={15} /><span>Search feedback</span>
          <kbd className="ml-2 border border-border px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
        </div>
        <div className="relative ml-auto flex items-center gap-4">
          <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-3 border border-transparent px-2 py-1.5 hover:border-border" aria-haspopup="menu" aria-expanded={profileOpen}>
            <div className="hidden text-right text-xs sm:block">
              <p className="font-medium">{session?.user?.name}</p>
              <p className="text-muted-foreground">{session?.user?.role}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center bg-[#d8e2d8] text-xs font-semibold">{(session?.user?.name || 'U')[0]}</span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
          {profileOpen && <>
            {/* backdrop to close on outside click */}
            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-56 border border-border bg-card shadow-lg" role="menu">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{session?.user?.role}</p>
              </div>
              <button onClick={() => { setProfileOpen(false); setActive('settings') }} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted"><Settings size={14} />Settings</button>
              <button onClick={() => { window.location.href = '/api/logout' }} className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-foreground hover:bg-muted"><LogOut size={14} />Sign out</button>
            </div>
          </>}
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10">
        <div className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">{active === 'dashboard' ? greeting : pageMeta?.label}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>
          </div>
          {canIngest && active !== 'settings' && <div className="flex gap-2">
            {(active === 'feedback' || active === 'dashboard') && <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2.5 text-sm font-medium hover:bg-muted"><Upload size={14} />Import CSV</button>}
            <button onClick={() => setShowCapture(true)} className="inline-flex items-center gap-2 bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85"><Plus size={16} />Capture feedback</button>
          </div>}
        </div>

        {active === 'dashboard' && <DashboardView stats={stats} loading={loading} onExplore={() => setActive('feedback')} />}
        {active === 'feedback' && <FeedbackInbox session={session} refreshKey={refreshKey} onCaptureOpen={() => setShowCapture(true)} onImportOpen={() => setShowImport(true)} />}
        {active === 'themes' && <ThemesView session={session} />}
        {active === 'ask' && <AskView />}
        {active === 'reports' && <ReportsView session={session} />}
        {active === 'settings' && <SettingsView session={session} />}
      </div>
    </main>

    {showCapture && canIngest && <CaptureModal onClose={() => setShowCapture(false)} onDone={() => setRefreshKey((current) => current + 1)} />}
    {showImport && canIngest && <ImportModal onClose={() => setShowImport(false)} onDone={() => setRefreshKey((current) => current + 1)} />}
  </div>
}

export default App;
