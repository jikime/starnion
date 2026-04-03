"use client"

import { X } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

export default function ImagePreviewDialog({ open, onClose, imageUrl, fileName }: {
  open: boolean
  onClose: () => void
  imageUrl: string
  fileName: string
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-black/95 border-none">
        <DialogHeader className="absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <DialogTitle className="text-sm font-medium text-white truncate pr-8">
            {fileName}
          </DialogTitle>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="size-4 text-white" />
          </button>
        </DialogHeader>
        <div className="flex items-center justify-center w-full h-full min-h-[300px] max-h-[85vh] p-4 pt-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
