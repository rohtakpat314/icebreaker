import { useEffect, useMemo, useRef, useState } from "react"

const COLOR = {
  red: "#e11d48",
  yellow: "#eab308",
  green: "#3ecf8e",
}

export const SHORT = {
  chemistry: "Chemistry",
  vilas: "Vilas",
  grainger: "Grainger",
  birge: "Birge",
  van_vleck: "Van Vleck",
  biochemistry: "Biochem",
  microbial: "Microbial",
  discovery: "Discovery",
  engineering_centers: "Engineering",
  hslc: "HSLC",
  msc: "Med Sci",
  bock: "Bock",
}

// 0 right, 1 above, 2 below, 3 left. South row alternates so names don't run together.
const SIDE = {
  vilas: 2,
  grainger: 1,
  chemistry: 2,
  discovery: 1,
  engineering_centers: 0,
  van_vleck: 1,
  msc: 2,
  birge: 0,
  bock: 3,
  biochemistry: 0,
  microbial: 0,
  hslc: 1,
}

function textWidth(label) {
  return label.length * 8.2
}

function labelBox(row) {
  const width = textWidth(row.short)
  const left = row.anchor === "start" ? row.lx : row.anchor === "end" ? row.lx - width : row.lx - width / 2
  return { l: left, r: left + width, t: row.ly - 13, b: row.ly + 4 }
}

function overlaps(a, b) {
  return a.l < b.r + 8 && a.r > b.l - 8 && a.t < b.b + 5 && a.b > b.t - 5
}

function layout(buildings, width, height) {
  if (!buildings.length) return { points: [], link: null }
  const main = buildings.filter((row) => row.id !== "hslc")
  const hslc = buildings.find((row) => row.id === "hslc")
  const source = main.length ? main : buildings
  const lats = source.map((row) => row.latitude)
  const lons = source.map((row) => row.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const latSpan = Math.max(maxLat - minLat, 1e-6)
  const lonSpan = Math.max(maxLon - minLon, 1e-6)
  const x0 = Math.max(168, width * 0.2)
  const x1 = width - 48
  const y0 = 132
  const y1 = height - 72

  const points = source.map((row) => ({
    ...row,
    x: x0 + ((row.longitude - minLon) / lonSpan) * (x1 - x0),
    y: y1 - ((row.latitude - minLat) / latSpan) * (y1 - y0),
    short: SHORT[row.id] || row.name,
  }))

  let link = null
  if (hslc && main.length) {
    const west = points.reduce((best, row) => (row.x < best.x ? row : best), points[0])
    const pin = {
      ...hslc,
      x: 56,
      y: west.y,
      short: "HSLC",
    }
    points.push(pin)
    link = { x1: pin.x + 14, y1: pin.y, x2: west.x - 12, y2: west.y }
  }

  const taken = []
  ;[...points].sort((a, b) => a.y - b.y || a.x - b.x).forEach((row) => {
    const options = [
      { lx: row.x + 14, ly: row.y + 4, anchor: "start" },
      { lx: row.x, ly: row.y - 18, anchor: "middle" },
      { lx: row.x, ly: row.y + 26, anchor: "middle" },
      { lx: row.x - 14, ly: row.y + 4, anchor: "end" },
    ]
    const first = SIDE[row.id] ?? 0
    const ordered = [options[first], ...options.filter((_, index) => index !== first)]
    let choice = ordered[0]
    for (const option of ordered) {
      const box = labelBox({ ...row, ...option })
      const coversDot = points.some((other) => {
        if (other === row) return false
        const cx = option.anchor === "start" ? option.lx + textWidth(row.short) / 2 : option.anchor === "end" ? option.lx - textWidth(row.short) / 2 : option.lx
        return Math.hypot(cx - other.x, option.ly - 4 - other.y) < 16
      })
      const inside = box.l > 8 && box.r < width - 8 && box.t > 88 && box.b < height - 16
      if (inside && !coversDot && !taken.some((other) => overlaps(box, other))) {
        choice = option
        break
      }
    }
    Object.assign(row, choice)
    taken.push(labelBox(row))
  })

  return { points, link }
}

export default function Map({ buildings, selectedId, onSelect }) {
  const frame = useRef(null)
  const [hot, setHot] = useState(null)
  const [size, setSize] = useState({ width: 800, height: 680 })
  const { points, link } = useMemo(
    () => layout(buildings, size.width, size.height),
    [buildings, size.width, size.height],
  )

  useEffect(() => {
    const node = frame.current
    if (!node) return undefined
    const measure = () => {
      const rect = node.getBoundingClientRect()
      const width = Math.max(320, Math.round(rect.width))
      const height = Math.max(360, Math.round(rect.height))
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <svg ref={frame} className="map" viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Campus">
      <text x="28" y="36" className="map-meta">Lake Mendota</text>
      <text x={size.width - 28} y="36" textAnchor="end" className="map-note">North</text>
      <line x1="28" y1="52" x2={size.width - 28} y2="52" className="shore" />
      {link ? (
        <g className="map-link">
          <line x1={link.x1} y1={link.y1} x2={(link.x1 + link.x2) / 2 - 26} y2={link.y1} />
          <line x1={(link.x1 + link.x2) / 2 + 26} y1={link.y2} x2={link.x2} y2={link.y2} />
          <text x={(link.x1 + link.x2) / 2} y={(link.y1 + link.y2) / 2 + 4} textAnchor="middle">1.5 km</text>
        </g>
      ) : null}
      {points.map((row) => {
        const on = row.id === selectedId
        const show = on || row.id === hot
        return (
          <g
            key={row.id}
            className="pin"
            onClick={() => onSelect(row.id)}
            onMouseEnter={() => setHot(row.id)}
            onMouseLeave={() => setHot(null)}
          >
            {row.anchor === "middle" ? <line className="leader" x1={row.x} y1={row.y} x2={row.lx} y2={row.anchor === "middle" && row.ly < row.y ? row.ly + 2 : row.ly - 12} /> : null}
            {on ? <circle cx={row.x} cy={row.y} r="15" fill="none" stroke="rgba(245,245,244,0.7)" /> : null}
            <circle cx={row.x} cy={row.y} r="16" fill="transparent" />
            <circle cx={row.x} cy={row.y} r={row.level === "red" ? 7 : on ? 6.5 : 5.5} fill={COLOR[row.level] || COLOR.green} />
            <text x={row.lx} y={row.ly} textAnchor={row.anchor} className={show ? "map-name on" : "map-name"}>
              {row.short}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
