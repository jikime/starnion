"use client"

import { useState, useMemo } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, User, Mail, Lock } from "lucide-react"

const SUPPORTED_LANGUAGES = ["en", "ko", "ja", "zh"] as const

type FormData = { name: string; email: string; password: string; confirmPassword: string }

function detectBrowserLanguage(): string {
  if (typeof navigator === "undefined") return "en"
  const code = navigator.language.slice(0, 2).toLowerCase()
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code) ? code : "en"
}

export default function RegisterPage() {
  const t = useTranslations("auth")
  const router = useRouter()
  const [error, setError] = useState("")
  const browserLanguage = useMemo(() => detectBrowserLanguage(), [])

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t("register.nameRequired")).max(50),
          email: z.string().email(t("register.emailInvalid")),
          password: z.string().min(8, t("register.passwordTooShort")).max(100),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t("register.passwordMismatch"),
          path: ["confirmPassword"],
        }),
    [t]
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setError("")

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        password: data.password,
        language: browserLanguage,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? t("register.failed"))
      return
    }

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    if (result?.error) {
      router.push("/login")
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          {t("register.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("register.description")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive" className="py-3">
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium">
            {t("register.nameLabel")}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="name"
              type="text"
              placeholder={t("register.namePlaceholder")}
              autoComplete="name"
              className="pl-10 h-11"
              {...register("name")}
            />
          </div>
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium">
            {t("register.emailLabel")}
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              className="pl-10 h-11"
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium">
            {t("register.passwordLabel")}
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="password"
              type="password"
              placeholder={t("register.passwordPlaceholder")}
              autoComplete="new-password"
              className="pl-10 h-11"
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">
            {t("register.confirmPasswordLabel")}
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              className="pl-10 h-11"
              {...register("confirmPassword")}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-11 font-semibold mt-1"
          style={{ background: "oklch(0.48 0.20 260.47)" }}
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t("register.submit")}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-3 text-muted-foreground">
            {t("register.hasAccount")}
          </span>
        </div>
      </div>

      <Link href="/login">
        <Button variant="outline" className="w-full h-11 font-medium">
          {t("register.login")}
        </Button>
      </Link>
    </div>
  )
}
