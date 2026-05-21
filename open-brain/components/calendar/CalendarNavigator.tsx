'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { todayKey, weekKey, monthKey, quarterKey, yearKey } from '@/lib/period'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type PeriodTab = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'

const TAB_LABELS: Record<PeriodTab, string> = {
  DAY: 'Day',
  WEEK: 'Week',
  MONTH: 'Month',
  QUARTER: 'Quarter',
  YEAR: 'Year',
}

const TABS: PeriodTab[] = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isoDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CalendarNavigator() {
  const today = new Date()
  const [tab, setTab] = useState<PeriodTab>('DAY')
  const [viewDate, setViewDate] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1))
  const router = useRouter()
  const utils = trpc.useUtils()
  const getOrCreate = trpc.note.getOrCreatePeriodic.useMutation({
    onSuccess: () => utils.note.list.invalidate(),
  })
  const { data: notes } = trpc.note.list.useQuery()

  const periodicNotes = notes?.filter(n => n.periodType) ?? []
  const noteKeys = new Set(periodicNotes.map(n => n.periodKey).filter(Boolean))

  const navigate = async (periodType: PeriodTab, periodKey: string) => {
    try {
      const note = await getOrCreate.mutateAsync({ periodType, periodKey })
      router.push(`/notes/${note.slug}`)
    } catch (err) {
      console.error('Failed to open periodic note', err)
    }
  }

  // ---- Day Tab: monthly grid ----
  function renderDayTab() {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const todayStr = todayKey()

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

    const cells: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="px-1 text-muted-foreground hover:text-foreground">&lt;</button>
          <span className="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="px-1 text-muted-foreground hover:text-foreground">&gt;</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-xs text-muted-foreground py-0.5">{d}</div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />
            const key = isoDateKey(new Date(year, month, day))
            const isToday = key === todayStr
            const hasNote = noteKeys.has(key)
            return (
              <button
                key={key}
                onClick={() => navigate('DAY', key)}
                className={cn(
                  'text-xs rounded py-1 hover:bg-accent transition-colors',
                  isToday && 'bg-primary text-primary-foreground font-bold hover:bg-primary/80',
                  !isToday && hasNote && 'font-semibold text-primary underline',
                  !isToday && !hasNote && 'text-foreground',
                )}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Week Tab: weeks in the current month view ----
  function renderWeekTab() {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const weeksInMonth = new Set<string>()

    for (let d = 1; d <= daysInMonth; d++) {
      weeksInMonth.add(weekKey(new Date(year, month, d)))
    }

    const weeks = Array.from(weeksInMonth).sort()
    const currentWeek = weekKey(today)

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="px-1 text-muted-foreground hover:text-foreground">&lt;</button>
          <span className="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="px-1 text-muted-foreground hover:text-foreground">&gt;</button>
        </div>
        <div className="space-y-1">
          {weeks.map(wk => {
            const isCurrent = wk === currentWeek
            const hasNote = noteKeys.has(wk)
            return (
              <button
                key={wk}
                onClick={() => navigate('WEEK', wk)}
                className={cn(
                  'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors',
                  isCurrent && 'bg-primary text-primary-foreground font-bold hover:bg-primary/80',
                  !isCurrent && hasNote && 'font-semibold text-primary',
                )}
              >
                {wk}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Month Tab: months of the current year ----
  function renderMonthTab() {
    const year = viewDate.getFullYear()
    const currentMonth = monthKey(today)

    const prevYear = () => setViewDate(new Date(year - 1, 0, 1))
    const nextYear = () => setViewDate(new Date(year + 1, 0, 1))

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevYear} className="px-1 text-muted-foreground hover:text-foreground">&lt;</button>
          <span className="text-sm font-medium">{year}</span>
          <button onClick={nextYear} className="px-1 text-muted-foreground hover:text-foreground">&gt;</button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTH_NAMES.map((name, i) => {
            const mk = `${year}-${String(i + 1).padStart(2, '0')}`
            const isCurrent = mk === currentMonth
            const hasNote = noteKeys.has(mk)
            return (
              <button
                key={mk}
                onClick={() => navigate('MONTH', mk)}
                className={cn(
                  'text-xs px-1 py-1.5 rounded hover:bg-accent transition-colors',
                  isCurrent && 'bg-primary text-primary-foreground font-bold hover:bg-primary/80',
                  !isCurrent && hasNote && 'font-semibold text-primary',
                )}
              >
                {name}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Quarter Tab: 4 quarters of the current year ----
  function renderQuarterTab() {
    const year = viewDate.getFullYear()
    const currentQuarter = quarterKey(today)

    const prevYear = () => setViewDate(new Date(year - 1, 0, 1))
    const nextYear = () => setViewDate(new Date(year + 1, 0, 1))

    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevYear} className="px-1 text-muted-foreground hover:text-foreground">&lt;</button>
          <span className="text-sm font-medium">{year}</span>
          <button onClick={nextYear} className="px-1 text-muted-foreground hover:text-foreground">&gt;</button>
        </div>
        <div className="space-y-1">
          {[1, 2, 3, 4].map(q => {
            const qk = `${year}-Q${q}`
            const isCurrent = qk === currentQuarter
            const hasNote = noteKeys.has(qk)
            return (
              <button
                key={qk}
                onClick={() => navigate('QUARTER', qk)}
                className={cn(
                  'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors',
                  isCurrent && 'bg-primary text-primary-foreground font-bold hover:bg-primary/80',
                  !isCurrent && hasNote && 'font-semibold text-primary',
                )}
              >
                {qk}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- Year Tab: current ±2 years ----
  function renderYearTab() {
    const currentYear = yearKey(today)
    const baseYear = today.getFullYear()
    const years = [baseYear - 2, baseYear - 1, baseYear, baseYear + 1, baseYear + 2]

    return (
      <div>
        <div className="space-y-1">
          {years.map(y => {
            const yk = `${y}`
            const isCurrent = yk === currentYear
            const hasNote = noteKeys.has(yk)
            return (
              <button
                key={yk}
                onClick={() => navigate('YEAR', yk)}
                className={cn(
                  'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors',
                  isCurrent && 'bg-primary text-primary-foreground font-bold hover:bg-primary/80',
                  !isCurrent && hasNote && 'font-semibold text-primary',
                )}
              >
                {yk}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderContent = () => {
    switch (tab) {
      case 'DAY': return renderDayTab()
      case 'WEEK': return renderWeekTab()
      case 'MONTH': return renderMonthTab()
      case 'QUARTER': return renderQuarterTab()
      case 'YEAR': return renderYearTab()
    }
  }

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex border-b mb-3">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 text-xs py-1.5 transition-colors',
              tab === t
                ? 'border-b-2 border-primary font-semibold text-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {/* Content */}
      <div>{renderContent()}</div>
    </div>
  )
}
