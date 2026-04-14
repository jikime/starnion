'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Category, Connection } from '@/lib/connect-data'
import { createConnection, ConnectApiError } from '@/lib/connect-api'

const CATEGORY_OPTIONS: Category[] = ['business', 'friend', 'family', 'acquaintance']

interface NewConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (connection: Connection) => void
}

export default function NewConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: NewConnectionDialogProps) {
  const t = useTranslations('connect.newDialog')
  const tc = useTranslations('connect.category')

  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('acquaintance')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setCategory('acquaintance')
    setEmail('')
    setPhone('')
    setCompany('')
    setRole('')
    setError(null)
    setSubmitting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('nameRequired'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await createConnection({
        name: name.trim(),
        category,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        role: role.trim() || undefined,
      })
      onCreated(created)
      reset()
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ConnectApiError) {
        setError(err.message)
      } else {
        setError(t('createFailed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!submitting) {
          if (!next) reset()
          onOpenChange(next)
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            {t('title')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="new-conn-name" className="text-xs text-muted-foreground">
              {t('name')}
            </label>
            <Input
              id="new-conn-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('category')}</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(value => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setCategory(value)}
                  disabled={submitting}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {tc(value)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="new-conn-role" className="text-xs text-muted-foreground">
                {t('role')}
              </label>
              <Input
                id="new-conn-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder={t('rolePlaceholder')}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-conn-company" className="text-xs text-muted-foreground">
                {t('company')}
              </label>
              <Input
                id="new-conn-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder={t('companyPlaceholder')}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-conn-email" className="text-xs text-muted-foreground">
              {t('email')}
            </label>
            <Input
              id="new-conn-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-conn-phone" className="text-xs text-muted-foreground">
              {t('phone')}
            </label>
            <Input
              id="new-conn-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('phonePlaceholder')}
              disabled={submitting}
            />
          </div>

          {error && (
            <p className="text-xs text-star-red bg-star-red/10 border border-star-red/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              {t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
