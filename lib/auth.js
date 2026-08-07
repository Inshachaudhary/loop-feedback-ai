import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const globalForPrisma = globalThis
const db = process.env.DATABASE_URL ? (globalForPrisma.__loopPrisma || (globalForPrisma.__loopPrisma = new PrismaClient())) : null

export const authOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  providers: [CredentialsProvider({ name: 'Credentials', credentials: { email: {}, password: {} }, async authorize(credentials) { if (!db) throw new Error('DATABASE_URL is not configured.'); const user = await db.user.findUnique({ where: { email: String(credentials?.email || '').toLowerCase() } }); if (!user || !(await bcrypt.compare(credentials?.password || '', user.passwordHash))) return null; return { id: user.id, name: user.name, email: user.email, role: user.role, workspaceId: user.workspaceId } } })],
  callbacks: { async jwt({ token, user }) { if (user) Object.assign(token, { id: user.id, role: user.role, workspaceId: user.workspaceId }); return token }, async session({ session, token }) { if (session.user) Object.assign(session.user, { id: token.id, role: token.role, workspaceId: token.workspaceId }); return session } },
  pages: { signIn: '/' },
  secret: process.env.NEXTAUTH_SECRET,
}
