import type { DefaultSession, DefaultJWT } from "next-auth"

declare module "next-auth" {
  interface User {
    token?: string
  }
  interface Session {
    gatewayToken?: string
    user: {
      id: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string
    gatewayToken?: string
  }
}
