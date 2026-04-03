import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

import { gatewayFetch } from "@/lib/gateway"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const res = await gatewayFetch(
    `/api/v1/channels/telegram`,
    { cache: "no-store" }
  )

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "gateway error" }))
    console.error("[channels/telegram] gateway error", res.status, errBody)
    return NextResponse.json(
      { error: errBody.error ?? "gateway error" },
      { status: res.status }
    )
  }

  const raw = await res.json()

  // Transform gateway snake_case → frontend camelCase and derive computed fields.
  const configured = !!(raw.bot_token)
  const statusStr = raw.enabled ? "running" : (configured ? "configured" : "not-configured")

  return NextResponse.json({
    configured,
    enabled:     raw.enabled     ?? false,
    status:      statusStr,
    botUsername: raw.bot_username ?? undefined,
    dmPolicy:    raw.dm_policy   ?? "allow",
    groupPolicy: raw.group_policy ?? "allow",
    accounts:    raw.accounts    ?? [],
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 })
  }

  // Transform frontend action format → gateway snake_case format.
  const { action, botToken, enabled, dmPolicy, groupPolicy, ...rest } = body
  const gatewayBody: Record<string, unknown> = { ...rest }
  if (action === "set-token"   && botToken    !== undefined) gatewayBody.bot_token   = botToken
  if (action === "set-enabled" && enabled     !== undefined) gatewayBody.enabled     = enabled
  if (action === "set-policy") {
    if (dmPolicy    !== undefined) gatewayBody.dm_policy    = dmPolicy
    if (groupPolicy !== undefined) gatewayBody.group_policy = groupPolicy
  }
  // Pass through if no action (direct snake_case body)
  if (!action) {
    if (botToken    !== undefined) gatewayBody.bot_token    = botToken
    if (enabled     !== undefined) gatewayBody.enabled      = enabled
    if (dmPolicy    !== undefined) gatewayBody.dm_policy    = dmPolicy
    if (groupPolicy !== undefined) gatewayBody.group_policy = groupPolicy
  }

  const res = await gatewayFetch(
    `/api/v1/channels/telegram`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gatewayBody),
    }
  )

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: (data as { error?: string }).error ?? "요청에 실패했어요" },
      { status: res.status }
    )
  }

  return NextResponse.json(data)
}
