"use client"

import { useState } from "react"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatMessages } from "@/components/chat/chat-messages"
import { ChatInput } from "@/components/chat/chat-input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { PanelLeftClose, PanelLeft } from "lucide-react"

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [persona, setPersona] = useState("jiki")

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {sidebarOpen && <ChatSidebar />}
      
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="size-5" />
              ) : (
                <PanelLeft className="size-5" />
              )}
            </Button>
            <h1 className="text-lg font-semibold">웹챗</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">페르소나:</span>
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jiki">지키</SelectItem>
                  <SelectItem value="buddy">버디</SelectItem>
                  <SelectItem value="assistant">어시스턴트</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary">스킬: 28/33 활성</Badge>
          </div>
        </div>

        <ChatMessages />
        <ChatInput />
      </div>
    </div>
  )
}
