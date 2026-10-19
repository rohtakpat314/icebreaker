export const START = "2019-01-25T00:00"
export const END = "2019-02-08T23:00"

const START_MS = Date.UTC(2019, 0, 25, 0)

export function hourIndex(at) {
  const [date, time] = at.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hour] = time.split(":").map(Number)
  return Math.round((Date.UTC(year, month - 1, day, hour) - START_MS) / 3600000)
}

export function fromIndex(index) {
  const next = new Date(START_MS + index * 3600000)
  const pad = (value) => String(value).padStart(2, "0")
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:00`
}

export const SPAN = hourIndex(END)

export function hourLabel(at) {
  const [date, time] = at.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const weekday = days[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday} ${months[month - 1]} ${day}, ${year} · ${time}`
}

export function shift(at, delta) {
  const next = hourIndex(at) + delta
  if (next < 0) return START
  if (next > SPAN) return END
  return fromIndex(next)
}
