export default function Chart({ series }) {
  if (!series || !series.points.length) {
    return <p className="quiet">Select a freezer to see the last 48 hours.</p>
  }
  const width = 560
  const height = 168
  const pad = 22
  const step = Math.max(1, Math.floor(series.points.length / 180))
  const points = series.points.filter((point, index) => index % step === 0 || index === series.points.length - 1)
  const temps = points.map((point) => point.c)
  const min = Math.min(-82, ...temps)
  const max = Math.max(-40, ...temps)
  const x = (index) => pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2)
  const y = (temp) => pad + ((max - temp) / (max - min)) * (height - pad * 2)
  const line = points.map((point, index) => `${x(index)},${y(point.c)}`).join(" ")
  const area = `${x(0)},${height - pad} ${line} ${x(points.length - 1)},${height - pad}`

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.freezerId} temperature, last 48 hours`}>
        <polygon points={area} fill="rgba(228,194,122,0.13)" />
        <line x1={pad} x2={width - pad} y1={y(-50)} y2={y(-50)} stroke="#ff8f7a" strokeDasharray="4 4" />
        <text x={pad} y={y(-50) - 6} fill="#ffb0a1" fontSize="11">-50°C</text>
        <polyline points={line} fill="none" stroke="#f6f1e6" strokeWidth="1.6" />
      </svg>
      <figcaption>{series.freezerId} · 48 hours · simulated readings</figcaption>
    </figure>
  )
}
