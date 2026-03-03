import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock } from "lucide-react"

const schedules = [
  {
    id: 1,
    time: "09:00",
    title: "팀 미팅",
    type: "meeting",
  },
  {
    id: 2,
    time: "12:00",
    title: "점심 예산 ₩15,000",
    type: "budget",
  },
  {
    id: 3,
    time: "18:00",
    title: "운동",
    type: "goal",
  },
]

export function TodaySchedule() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="size-5" />
          오늘 일정
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {schedules.map((schedule) => (
            <div
              key={schedule.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-primary">
                <Clock className="size-4" />
                <span className="text-sm font-medium">{schedule.time}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <span className="text-sm">{schedule.title}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
