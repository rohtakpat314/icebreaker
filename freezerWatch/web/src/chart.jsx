export default function Chart({ series }) {
  if (!series || !series.points.length) {
    return <p className="quiet">Choose a freezer.</p>
  }
  const width = 520
  const height = 120
  const pad = 16
  const step = Math.max(1, Math.floor(series.points.length / 160))
  const points = series.points.filter((point, index) => index % step === 0 || index === series.points.length - 1)
  const temps = points.map((point) => point.c)
  const min = Math.min(-82, ...temps)
  const max = Math.max(-40, ...temps)
  const x = (index) => pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2)
  const y = (temp) => pad + ((max - temp) / (max - min)) * (height - pad * 2)
  const line = points.map((point, index) => `${x(index)},${y(point.c)}`).join(" ")

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${series.freezerId}, last 48 hours`}>
        <line x1={pad} x2={width - pad} y1={y(-50)} y2={y(-50)} stroke="rgba(225,29,72,0.45)" />
        <text x={width - pad} y={y(-50) - 6} textAnchor="end" fill="#a3a3a3" fontSize="10">−50°</text>
        <polyline points={line} fill="none" stroke="#f5f5f4" strokeWidth="1.25" />
      </svg>
      <figcaption>{series.freezerId} · 48 hours</figcaption>
    </figure>
  )
}
