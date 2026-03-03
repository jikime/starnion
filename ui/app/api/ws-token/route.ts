import { auth } from "@/auth"
import { SignJWT } from "jose"

export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "change-me-in-production"
  )

  // Issue a short-lived (1h) HS256 JWT compatible with the Gateway's validator.
  const token = await new SignJWT({ plat: "web" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret)

  return Response.json({ token })
}
