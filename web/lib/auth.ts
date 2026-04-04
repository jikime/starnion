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
    jwt({ token, user, trigger, session }) {
      if (user?.id) token.userId = user.id
      if (user && "token" in user && user.token) {
        token.gatewayToken = user.token as string
      }
      // Allow session update to refresh userId after account linking.
      if (trigger === "update" && session?.userId) {
        token.userId = session.userId as string
      }
      return token
    },
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string
      if (token.gatewayToken) (session as typeof session & { gatewayToken: string }).gatewayToken = token.gatewayToken as string
      return session
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 365 * 24 * 60 * 60 * 100, // effectively no expiry — logout only
  },

  pages: {
    signIn: "/login",
  },
})
