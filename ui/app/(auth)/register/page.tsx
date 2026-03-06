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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

type FormData = { name: string; email: string; password: string; confirmPassword: string }

export default function RegisterPage() {
  const t = useTranslations("auth")
  const router = useRouter()
  const [error, setError] = useState("")

  const schema = useMemo(() => z
    .object({
      name: z.string().min(1, t("register.nameRequired")).max(50),
      email: z.string().email(t("register.emailInvalid")),
      password: z.string().min(8, t("register.passwordTooShort")).max(100),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t("register.passwordMismatch"),
      path: ["confirmPassword"],
    }), [t])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setError("")

    // 1. Register via Gateway
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        password: data.password,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? t("register.failed"))
      return
    }

    // 2. Auto-login after successful registration
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    if (result?.error) {
      // Registration succeeded but login failed — redirect to login
      router.push("/login")
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="text-2xl font-bold">{t("register.title")}</CardTitle>
        <CardDescription>{t("register.description")}</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">{t("register.nameLabel")}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t("register.namePlaceholder")}
              autoComplete="name"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("register.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("register.passwordLabel")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("register.passwordPlaceholder")}
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("register.confirmPasswordLabel")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("register.submit")}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            {t("register.hasAccount")}{" "}
            <Link href="/login" className="underline text-primary font-medium">
              {t("register.login")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
