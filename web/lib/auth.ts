import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { GATEWAY_API_URL } from "@/lib/starnion"

const API_URL = GATEWAY_API_URL

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: false,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials)
        if (!parsed.success) return null

        try {
          const res = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
          })

          if (!res.ok) return null

          const user = await res.json()
          return {
            id: user.user_id ?? user.userId,
            name: user.name,
            email: user.email,
            token: user.token as string | undefined,
          }
        } catch {
          return null
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.id) token.userId = user.id
      if (user && "token" in user && user.token) {
        token.gatewayToken = user.token as string
        token.gatewayTokenExp = Date.now() + 23 * 60 * 60 * 1000 // ~23h (1h before 24h expiry)
      }
      // Allow session update to refresh userId after account linking.
      if (trigger === "update" && session?.userId) {
        token.userId = session.userId as string
      }
      // Auto-refresh gateway token when it's about to expire.
      //
      // Failure semantics: if the refresh POST fails — whether the
      // gateway rejected the token (`res.ok === false`) or the network
      // call itself errored — we DROP the gateway credentials from the
      // token. The alternative (silently keeping a stale token) leaves
      // the user in a zombie state where NextAuth thinks they're
      // logged in but every API call 401s. The session() callback
      // below then sees no gatewayToken and blanks out session.user
      // so `proxy.ts` redirects to /login on the next request.
      if (token.gatewayToken && token.gatewayTokenExp && Date.now() > (token.gatewayTokenExp as number)) {
        let refreshed = false
        try {
          const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token.gatewayToken}` },
          })
          if (res.ok) {
            const data = await res.json()
            token.gatewayToken = data.token as string
            token.gatewayTokenExp = Date.now() + 23 * 60 * 60 * 1000
            refreshed = true
          }
        } catch {
          /* network error — fall through to clearing */
        }
        if (!refreshed) {
          delete token.gatewayToken
          delete token.gatewayTokenExp
          delete token.userId
        }
      }
      return token
    },
    session({ session, token }) {
      // No gateway token → the session is effectively unauthenticated.
      // Blank out session.user so proxy.ts's `!!req.auth?.user` check
      // fails and the user is redirected to /login on the next hop.
      if (!token.gatewayToken) {
        session.user = undefined as unknown as typeof session.user
        return session
      }
      if (token.userId) session.user.id = token.userId as string
      ;(session as typeof session & { gatewayToken: string }).gatewayToken = token.gatewayToken as string
      return session
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days session, gateway token refreshed automatically
  },

  pages: {
    signIn: "/login",
  },
})
