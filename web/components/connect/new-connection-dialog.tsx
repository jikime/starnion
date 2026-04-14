'use client'

import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
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

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'business', label: '비즈니스' },
  { value: 'friend', label: '친구' },
  { value: 'family', label: '가족' },
  { value: 'acquaintance', label: '지인' },
]

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
      setError('이름은 필수 입력입니다')
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
        setError('인맥을 추가하지 못했습니다')
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
            <UserPlus className="w-4 h-4 text-primary" />새 인연 추가
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="new-conn-name" className="text-xs text-muted-foreground">
              이름 *
            </label>
            <Input
              id="new-conn-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="홍길동"
              required
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">카테고리</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setCategory(opt.value)}
                  disabled={submitting}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    category === opt.value
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="new-conn-role" className="text-xs text-muted-foreground">
                직함
              </label>
              <Input
                id="new-conn-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="디자이너"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-conn-company" className="text-xs text-muted-foreground">
                회사
              </label>
              <Input
                id="new-conn-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="스타니온"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-conn-email" className="text-xs text-muted-foreground">
              이메일
            </label>
            <Input
              id="new-conn-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="hong@example.com"
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-conn-phone" className="text-xs text-muted-foreground">
              전화번호
            </label>
            <Input
              id="new-conn-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="010-0000-0000"
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
              취소
            </Button>
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
