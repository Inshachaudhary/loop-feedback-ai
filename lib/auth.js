import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const globalForPrisma = globalThis
const db = process.env.DATABASE_URL ? (globalForPrisma.__loopPrisma || (globalForPrisma.__loopPrisma = new PrismaClient())) : null

/*
 * Emergent Preview embeds the app in a cross-site iframe (see next.config.js:
 * `frame-ancestors *`). Browsers block `SameSite=Lax` cookies from being sent
 * on subresource requests inside a cross-site iframe (Safari ITP, Firefox
 * strict, Chrome default in most modern versions). That was making
 * /api/auth/session return `{}` on every request from inside the iframe even
 * after a successful login, which bounced the user back to the Sign In screen.
 *
 * The NextAuth cookie names below use the `__Host-` and `__Secure-` prefixes,
 * which are compatible with `SameSite=None` as long as `Secure=true` and
 * (for `__Host-`) `Path=/` with no `Domain` attribute — matching the config
 * NextAuth generates by default.
 */
const iframeCookie = (name, hostPrefix = false) => ({
  name,
  options: {
    httpOnly: true,
    sameSite: 'none',
    path: '/',
    secure: true,
    // __Host- prefix disallows a Domain attribute; leave it unset either way.
    ...(hostPrefix ? {} : {}),
  },
})

export const authOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [CredentialsProvider({
    name: 'Credentials',
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      if (!db) throw new Error('DATABASE_URL is not configured.')
      const user = await db.user.findUnique({ where: { email: String(credentials?.email || '').toLowerCase() } })
      if (!user || !(await bcrypt.compare(credentials?.password || '', user.passwordHash))) return null
      return { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId }
    },
  })],
  callbacks: {
    async jwt({ token, user }) { if (user) Object.assign(token, { id: user.id, role: user.role, workspaceId: user.workspaceId }); return token },
    async session({ session, token }) { if (session.user) Object.assign(session.user, { id: token.id, role: token.role, workspaceId: token.workspaceId }); return session },
  },
  pages: { signIn: '/' },
  secret: process.env.NEXTAUTH_SECRET,
  // Explicit cookies with SameSite=None so they survive cross-site iframe contexts.
  cookies: {
    sessionToken: iframeCookie('__Secure-next-auth.session-token'),
    callbackUrl: iframeCookie('__Secure-next-auth.callback-url'),
    csrfToken: iframeCookie('__Host-next-auth.csrf-token', true),
  },
}
