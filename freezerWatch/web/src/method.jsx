const RULES = [
  ["a", "Deep freeze", "Tmin ≤ −15°F", 30],
  ["b", "Rapid thaw", "Tmin ≤ 0°F and Tnow ≥ 32°F", 30],
  ["c", "No generator", "taken from the building record", 15],
  ["d", "Before 1975", "year the building was built", 10],
  ["e", "Warming freezer", "β̂ > 0.5°C/h or latest median > −70°C", 15],
]

const HOURS = [0, 1, 2, 3, 4, 5]
const MEDIANS = [-82, -80.6, -79.2, -77.8, -76.4, -75]

function ScoreBars() {
  const width = 640
  const row = 36
  const label = 168
  const bar = 360
  const height = RULES.length * row + 8
  return (
    <svg className="fig-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Points each rule can add">
      {RULES.map(([key, name, , points], index) => {
        const y = index * row + 8
        const w = (points / 100) * bar
        return (
          <g key={key}>
            <text x="0" y={y + 16} className="fig-label">{key}  {name}</text>
            <rect x={label} y={y} width={bar} height="14" fill="rgba(255,255,255,0.06)" />
            <rect x={label} y={y} width={w} height="14" fill="#f5f5f4" />
            <text x={label + w + 8} y={y + 12} className="fig-num">{points}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Bands() {
  const width = 640
  const x0 = 28
  const x1 = 612
  const y = 36
  const scale = (score) => x0 + (score / 100) * (x1 - x0)
  const cuts = [
    [0, 40, "#3ecf8e"],
    [40, 70, "#eab308"],
    [70, 100, "#e11d48"],
  ]
  return (
    <svg className="fig-svg" viewBox={`0 0 ${width} 88`} role="img" aria-label="Green below 40, yellow through 69, red from 70">
      {cuts.map(([a, b, color]) => (
        <rect key={a} x={scale(a)} y={y} width={scale(b) - scale(a)} height="16" fill={color} />
      ))}
      {[0, 40, 70, 100].map((mark) => (
        <g key={mark}>
          <line x1={scale(mark)} x2={scale(mark)} y1={y - 6} y2={y + 22} stroke="rgba(255,255,255,0.35)" />
          <text x={scale(mark)} y="78" textAnchor="middle" className="fig-num">{mark}</text>
        </g>
      ))}
      <text x={scale(20)} y="28" textAnchor="middle" className="fig-label">green</text>
      <text x={scale(55)} y="28" textAnchor="middle" className="fig-label">yellow</text>
      <text x={scale(85)} y="28" textAnchor="middle" className="fig-label">red</text>
    </svg>
  )
}

function Slope() {
  const width = 640
  const height = 260
  const left = 46
  const right = 24
  const top = 16
  const bottom = 32
  const yMin = -84
  const yMax = -68
  const xOf = (hour) => left + (hour / 5) * (width - left - right)
  const yOf = (temp) => top + ((yMax - temp) / (yMax - yMin)) * (height - top - bottom)
  const line = HOURS.map((hour, index) => `${xOf(hour)},${yOf(MEDIANS[index])}`).join(" ")
  const guide = [0, 5].map((hour) => `${xOf(hour)},${yOf(-82 + 0.5 * hour)}`).join(" ")
  return (
    <svg className="fig-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Six hourly medians and the fitted slope">
      {[-80, -75, -70].map((temp) => (
        <g key={temp}>
          <line x1={left} x2={width - right} y1={yOf(temp)} y2={yOf(temp)} stroke="rgba(255,255,255,0.08)" />
          <text x={left - 8} y={yOf(temp) + 4} textAnchor="end" className="fig-num">{temp}</text>
        </g>
      ))}
      <line x1={left} x2={width - right} y1={yOf(-70)} y2={yOf(-70)} stroke="#e11d48" strokeDasharray="3 4" />
      <text x={width - right} y={yOf(-70) - 6} textAnchor="end" className="fig-num" fill="#e11d48">−70°C</text>
      <polyline points={guide} fill="none" stroke="#8a8a86" strokeDasharray="4 4" />
      <polyline points={line} fill="none" stroke="#f5f5f4" strokeWidth="1.5" />
      {HOURS.map((hour, index) => (
        <circle key={hour} cx={xOf(hour)} cy={yOf(MEDIANS[index])} r="3.5" fill="#3ecf8e" />
      ))}
      {HOURS.map((hour) => (
        <text key={`h${hour}`} x={xOf(hour)} y={height - 8} textAnchor="middle" className="fig-num">{hour}</text>
      ))}
      <text x={xOf(3.2)} y={yOf(-78.2)} className="fig-label">β̂ = 1.40</text>
      <text x={xOf(3.2)} y={yOf(-80.6)} className="fig-label">0.50</text>
    </svg>
  )
}

function Dollars() {
  const width = 640
  const height = 180
  const left = 36
  const right = 16
  const top = 16
  const bottom = 28
  const xOf = (score) => left + (score / 100) * (width - left - right)
  const y0 = height - bottom
  const y1 = top + 10
  const step = `${xOf(0)},${y0} ${xOf(40)},${y0} ${xOf(40)},${y1} ${xOf(100)},${y1}`
  return (
    <svg className="fig-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dollars stay zero until the score reaches 40">
      <rect x={xOf(0)} y={top} width={xOf(40) - xOf(0)} height={y0 - top} fill="rgba(62,207,142,0.08)" />
      <rect x={xOf(40)} y={top} width={xOf(70) - xOf(40)} height={y0 - top} fill="rgba(234,179,8,0.1)" />
      <rect x={xOf(70)} y={top} width={xOf(100) - xOf(70)} height={y0 - top} fill="rgba(225,29,72,0.1)" />
      <polyline points={step} fill="none" stroke="#f5f5f4" strokeWidth="1.5" />
      <text x={xOf(20)} y={y0 - 10} textAnchor="middle" className="fig-label">D = 0</text>
      <text x={xOf(70)} y={y1 + 18} textAnchor="middle" className="fig-label">D = V</text>
      {[0, 40, 70, 100].map((mark) => (
        <text key={mark} x={xOf(mark)} y={height - 8} textAnchor="middle" className="fig-num">{mark}</text>
      ))}
    </svg>
  )
}

function Window() {
  const width = 640
  const y = 28
  const past = 430
  return (
    <svg className="fig-svg" viewBox={`0 0 ${width} 78`} role="img" aria-label="The score may read 72 hours back and nothing after the selected hour">
      <rect x="0" y={y} width={past} height="14" fill="rgba(245,245,244,0.85)" />
      <rect x={past} y={y} width={width - past} height="14" fill="rgba(255,255,255,0.08)" />
      <line x1={past} x2={past} y1="12" y2="58" stroke="#e11d48" />
      <text x="8" y="22" className="fig-label">t − 72h</text>
      <text x={past - 8} y="22" textAnchor="end" className="fig-label">selected hour</text>
      <text x={past + 12} y="62" className="fig-label">later hours are not read</text>
      <text x={past / 2} y="62" textAnchor="middle" className="fig-num">weather window and freezer medians</text>
    </svg>
  )
}

export default function Method({ onBack }) {
  return (
    <article className="method">
      <header>
        <p className="kicker">Method</p>
        <button type="button" onClick={onBack}>Back</button>
      </header>
      <h1>How a score is made</h1>
      <p className="lede">A fixed sum, a six-hour slope, and a hard stop at the hour on screen. Nothing here is fitted to the 2019 damage.</p>

      <h2>The score</h2>
      <p className="eq">S = min(100, 30a + 30b + 15c + 10d + 15e)</p>
      <p>Each letter is 1 when its rule is true and 0 when it is not. The same inputs always give the same S.</p>
      <figure className="fig">
        <ScoreBars />
        <figcaption>Points available from each term. They add. They do not multiply.</figcaption>
      </figure>
      <ul>
        {RULES.map(([key, name, test, points]) => (
          <li key={key}><strong>{key}</strong> {name}. {test}. {points} points.</li>
        ))}
      </ul>
      <div className="cases">
        <p><span className="swatch red" /> a through e on. 30 + 30 + 15 + 10 + 15 = 100. Red.</p>
        <p><span className="swatch green" /> only c and d. 15 + 10 = 25. Green, and the dollars stay 0.</p>
      </div>

      <h2>Where the colors change</h2>
      <p className="eq">green if S &lt; 40, yellow if 40 ≤ S &lt; 70, red if S ≥ 70</p>
      <figure className="fig">
        <Bands />
        <figcaption>The cut points are fixed. A score of 39 and a score of 40 are different colors.</figcaption>
      </figure>

      <h2>The freezer slope</h2>
      <p>For each freezer, take the median temperature in each of the six hours ending at the selected hour. Fit a line by least squares. Flag the freezer when the slope is steeper than half a degree an hour, or when the latest median is warmer than −70°C.</p>
      <p className="eq">β̂ = Σ(xᵢ − x̄)(yᵢ − ȳ) / Σ(xᵢ − x̄)²</p>
      <figure className="fig">
        <Slope />
        <figcaption>Hours 0 through 5. Medians fall on y = −82 + 1.4x, so β̂ = 1.40. The dashed line is the 0.50 cutoff. The latest median is −75°C, still under −70, so this freezer is flagged by the slope alone.</figcaption>
      </figure>
      <p>For these six points, x̄ = 2.5 and ȳ = −78.5. The denominator Σ(xᵢ − x̄)² is 17.5. The numerator is 24.5. 24.5 / 17.5 = 1.40, which is above 0.50.</p>

      <h2>Dollars</h2>
      <p className="eq">D = V · 1{"{S ≥ 40}"}</p>
      <p>V is the sum of the freezer values in the building. Below 40, D is 0 no matter how large V is.</p>
      <figure className="fig">
        <Dollars />
        <figcaption>The loss turns on at yellow. It does not grow again at red. Red and yellow carry the same V.</figcaption>
      </figure>

      <h2>What an hour is allowed to see</h2>
      <figure className="fig">
        <Window />
        <figcaption>Weather is the 72 hours up to and including the selected hour. Freezer medians use the last six of those hours. A later hour is never an input.</figcaption>
      </figure>
      <p>Real inputs: building names and locations, the 2019 hourly weather, and the year each building was built. The Wisconsin State Journal notes for Vilas Hall, Chemistry, and Grainger are a check after the fact. They do not enter S.</p>
      <p>Simulated inputs: freezer temperatures, the dollars in V, and whether a building is on generator power. A precise D can still be wrong if those are wrong.</p>

      <h2>What keeps a bad number from spreading</h2>
      <ul>
        <li>Every term that fired is written on the building, so S can be added back up by hand.</li>
        <li>The weights are the same for every building. A wrong weight shifts the campus together. It cannot single out one lab in secret.</li>
        <li>Green cannot invent a loss. D stays 0 until S reaches 40.</li>
        <li>A viewer sees a dollar range, not V, and no freezer rows. A lab manager sees freezer rows for one building. Only a facilities officer can approve or reject.</li>
        <li>An approval stores the decision, who made it, and when. It does not rewrite the rest of the plan.</li>
        <li>A new account is a viewer.</li>
      </ul>
      <p>What this does not catch: the weights are judgments, and the simulated temperatures can look exact. The 2019 damage notes stay outside the score so they can still disagree with it.</p>
    </article>
  )
}
