export function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function weekKey(date: Date = new Date()): string {
  // ISO week: YYYY-WNN
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const year = d.getUTCFullYear()
  const week = Math.ceil((((d.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function quarterKey(date: Date = new Date()): string {
  const q = Math.ceil((date.getMonth() + 1) / 3)
  return `${date.getFullYear()}-Q${q}`
}

export function yearKey(date: Date = new Date()): string {
  return `${date.getFullYear()}`
}
