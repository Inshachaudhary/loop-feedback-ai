'use client'

import { useEffect, useMemo, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { Activity, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, FileText, Inbox, LayoutDashboard, LogOut, MessageSquare, Plus, Search, Settings, Sparkles, Users, X } from 'lucide-react'

const nav = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'feedback', label: 'Feedback inbox', icon: Inbox, count: '128' },
  { id: 'themes', label: 'Themes & trends', icon: BarChart3 },
  { id: 'ask', label: 'Ask LOOP', icon: MessageSquare, accent: true },
  { id: 'reports', label: 'Reports', icon: FileText },
]

function Stat({ label, value, note, tone = 'ink' }) {
  return <div className="border border-border bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between"><p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p><span className={`h-2 w-2 rounded-full ${tone === 'red' ? 'bg-red-400' : tone === 'green' ? 'bg-emerald-500' : 'bg-foreground/30'}`} /></div>
    <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</p>
    <p className="mt-2 text-sm text-muted-foreground">{note}</p>
  </div>
}

function VolumeChart({ points = [] }) {
  const max = Math.max(...points.map((p) => p.value), 1)
  return <div className="flex h-44 items-end gap-2 px-2 pb-1">
    {points.length ? points.map((p) => <div className="group flex flex-1 flex-col items-center gap-2" key={p.label}><div className="relative w-full rounded-t-sm bg-foreground/80 transition-all group-hover:bg-primary" style={{ height: `${Math.max(10, (p.value / max) * 132)}px` }}><span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 text-[10px] font-medium group-hover:block">{p.value}</span></div><span className="text-[10px] text-muted-foreground">{p.label}</span></div>) : <div className="flex w-full items-center justify-center text-sm text-muted-foreground">Add feedback to see volume trends.</div>}
  </div>
}

function App() {
  const { data: session, status } = useSession()
  const [active, setActive] = useState('dashboard')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCapture, setShowCapture] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ content: '', channel: 'INTERCOM', customerLabel: '' })

  useEffect(() => {
    if (session) {
      setLoading(true)
      fetch('/api/dashboard/stats').then((r) => r.json()).then(setStats).catch(() => setStats({ setupRequired: true })).finally(() => setLoading(false))
    } else if (status !== 'loading') setLoading(false)
  }, [session, status])

  const greeting = useMemo(() => session?.user?.name ? `Good morning, ${session.user.name.split(' ')[0]}` : 'Good morning', [session])
  const ingest = async (event) => {
    event.preventDefault(); setNotice('')
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await response.json()
    if (!response.ok) return setNotice(data.error || 'Could not save feedback.')
    setNotice('Feedback captured. Classification will run when Claude is configured.'); setForm({ content: '', channel: 'INTERCOM', customerLabel: '' }); setTimeout(() => setShowCapture(false), 800)
  }

  if (status === 'loading') return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading LOOP…</div>
  if (!session) return <AuthScreen />

  return <div className="min-h-screen bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-card px-4 py-5 lg:block">
      <div className="flex items-center gap-3 px-3"><div className="grid h-8 w-8 place-items-center bg-foreground text-sm font-bold text-background">L</div><span className="text-lg font-semibold tracking-[-0.03em]">LOOP</span><span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Beta</span></div>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</div>
      <button className="mt-3 flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted"><span className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center bg-[#e7e2d8] text-xs font-bold">A</span>Acme, Inc.</span><ChevronDown size={14} /></button>
      <nav className="mt-8 space-y-1">{nav.map(({ id, label, icon: Icon, count, accent }) => <button key={id} onClick={() => setActive(id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm transition ${active === id ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${accent && active !== id ? 'text-foreground' : ''}`}><Icon size={16} strokeWidth={1.8} />{label}{count && <span className="ml-auto text-xs opacity-60">{count}</span>}</button>)}</nav>
      <div className="absolute bottom-5 left-4 right-4 border-t border-border pt-4"><button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"><Settings size={16} />Settings</button><button onClick={() => signOut()} className="mt-1 flex w-full items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"><LogOut size={16} />Sign out</button></div>
    </aside>
    <main className="lg:pl-64"><header className="flex h-16 items-center justify-between border-b border-border bg-card px-6 lg:px-10"><div className="flex items-center gap-3 lg:hidden"><div className="grid h-7 w-7 place-items-center bg-foreground text-xs font-bold text-background">L</div><span className="font-semibold">LOOP</span></div><div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><Search size={15} /> <span>Search feedback</span><kbd className="ml-2 border border-border px-1.5 py-0.5 text-[10px]">⌘ K</kbd></div><div className="flex items-center gap-4"><button className="text-muted-foreground hover:text-foreground"><CircleHelp size={18} /></button><div className="h-6 w-px bg-border" /><div className="flex items-center gap-2 text-sm"><span className="grid h-7 w-7 place-items-center bg-[#d8e2d8] text-xs font-semibold">{session.user?.name?.[0] || 'U'}</span><span className="hidden sm:block">{session.user?.name || 'User'}</span></div></div></header>
      <div className="mx-auto max-w-[1440px] px-6 py-8 lg:px-10"><div className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end"><div><p className="text-sm text-muted-foreground">Tuesday, June 24, 2025</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">{active === 'dashboard' ? greeting : nav.find((item) => item.id === active)?.label}</h1><p className="mt-2 max-w-xl text-sm text-muted-foreground">{active === 'dashboard' ? 'Here is what customers are telling you this week.' : 'Turn customer signals into confident product decisions.'}</p></div><button onClick={() => setShowCapture(true)} className="inline-flex items-center justify-center gap-2 bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:bg-foreground/85"><Plus size={16} />Capture feedback</button></div>
        {loading ? <div className="mt-8 grid h-64 place-items-center border border-dashed border-border text-sm text-muted-foreground">Loading workspace intelligence…</div> : stats?.setupRequired ? <div className="mt-8 border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-semibold">Connect PostgreSQL to load your workspace.</p><p className="mt-1">Set <code>DATABASE_URL</code> and run the Prisma migration + seed commands. The UI is ready for live data.</p></div> : <><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Total feedback" value={stats?.total ?? '—'} note="Across all channels" /><Stat label="Negative sentiment" value={`${stats?.negativePercent ?? 0}%`} note="↓ 4.2% from last period" tone="red" /><Stat label="New this week" value={stats?.newThisWeek ?? '—'} note="12 awaiting review" tone="green" /><Stat label="Top theme" value={stats?.topTheme || '—'} note="Most mentioned recently" /></div><div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]"><section className="border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="font-semibold tracking-[-0.02em]">Feedback volume</h2><p className="mt-1 text-sm text-muted-foreground">Last 30 days</p></div><button className="border border-border px-3 py-1.5 text-xs text-muted-foreground">Last 30 days <ChevronDown className="ml-2 inline" size={12} /></button></div><div className="mt-8"><VolumeChart points={stats?.volume || []} /></div></section><section className="border border-border bg-card p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="font-semibold tracking-[-0.02em]">Sentiment pulse</h2><p className="mt-1 text-sm text-muted-foreground">All feedback</p></div><Activity size={18} className="text-muted-foreground" /></div><div className="mt-8 space-y-5">{(stats?.sentiment || [{ label: 'Positive', value: 0, color: 'bg-emerald-500' }, { label: 'Neutral', value: 0, color: 'bg-amber-400' }, { label: 'Negative', value: 0, color: 'bg-red-400' }]).map((item) => <div key={item.label}><div className="mb-2 flex justify-between text-sm"><span>{item.label}</span><span className="font-medium">{item.value}%</span></div><div className="h-2 bg-muted"><div className={`h-2 ${item.color}`} style={{ width: `${item.value}%` }} /></div></div>)}</div><button onClick={() => setActive('feedback')} className="mt-8 text-sm font-medium underline underline-offset-4">Explore inbox <ArrowUpRight className="ml-1 inline" size={14} /></button></section></div></>}
      </div>
    </main>
    {showCapture && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4"><div className="w-full max-w-lg border border-border bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Capture feedback</h2><p className="mt-1 text-sm text-muted-foreground">Add a customer signal to the LOOP inbox.</p></div><button onClick={() => setShowCapture(false)}><X size={18} /></button></div><form onSubmit={ingest} className="mt-6 space-y-4"><textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What did the customer say?" className="min-h-32 w-full resize-none border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><div className="grid grid-cols-2 gap-3"><select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="border border-border bg-background p-3 text-sm"><option>INTERCOM</option><option>EMAIL</option><option>APP_STORE</option><option>SIMULATED</option></select><input value={form.customerLabel} onChange={(e) => setForm({ ...form, customerLabel: e.target.value })} placeholder="Customer label" className="border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>{notice && <p className="text-sm text-emerald-700">{notice}</p>}<button className="w-full bg-foreground px-4 py-3 text-sm font-medium text-background">Save feedback</button></form></div></div>}
  </div>
}

function AuthScreen() {
  const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name: '', workspaceName: '', email: '', password: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e) => { e.preventDefault(); setBusy(true); setError(''); const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup'; const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) { setError(data.error || 'Unable to continue.'); setBusy(false); return } await signIn('credentials', { email: form.email, password: form.password, redirect: false }); window.location.reload() }
  return <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]"><div className="hidden bg-foreground p-12 text-background lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center bg-background text-sm font-bold text-foreground">L</div><span className="text-xl font-semibold">LOOP</span></div><div><p className="max-w-lg text-5xl font-semibold leading-[1.03] tracking-[-0.06em]">Know what customers want.<br /><span className="text-background/50">Know what to do next.</span></p><p className="mt-7 max-w-md text-sm leading-6 text-background/60">LOOP turns scattered customer feedback into a ranked, evidence-backed list of what to do next.</p></div><p className="text-xs text-background/40">Feedback intelligence for teams that listen closely.</p></div><div className="flex items-center justify-center bg-background p-6"><div className="w-full max-w-sm"><div className="mb-12 flex items-center gap-3 lg:hidden"><div className="grid h-8 w-8 place-items-center bg-foreground text-sm font-bold text-background">L</div><span className="text-lg font-semibold">LOOP</span></div><p className="text-sm text-muted-foreground">{mode === 'login' ? 'Welcome back' : 'Start your workspace'}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{mode === 'login' ? 'Sign in to LOOP' : 'Create your workspace'}</h1><form onSubmit={submit} className="mt-8 space-y-4">{mode === 'signup' && <><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><input required value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} placeholder="Workspace name" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></>}<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /><input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (8+ characters)" className="w-full border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />{error && <p className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="w-full bg-foreground p-3 text-sm font-medium text-background disabled:opacity-50">{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create workspace'}</button></form><p className="mt-6 text-center text-sm text-muted-foreground">{mode === 'login' ? 'New to LOOP?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} className="font-medium text-foreground underline underline-offset-4">{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p></div></div></div>
}

export default App;
