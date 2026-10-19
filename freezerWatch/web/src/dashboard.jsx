import { useEffect, useState } from "react"
import About from "./about"
import { api } from "./api"
import Chart from "./chart"
import Campus from "./campus"
import { SHORT } from "./map"
import { END, SPAN, START, fromIndex, hourIndex, hourLabel, shift } from "./time"

const JUMPS = [
  ["deepFreeze", "Jan 30"],
  ["outage", "Feb 1"],
  ["thaw", "Feb 3"],
]

export default function Dashboard({ user, onSignedOut, onMethod }) {
  const [at, setAt] = useState(START)
  const [building, setBuilding] = useState(null)
  const [data, setData] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [freezer, setFreezer] = useState(null)
  const [series, setSeries] = useState(null)
  const [notice, setNotice] = useState("")
  const [about, setAbout] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams({ at })
    if (building) params.set("building", building)
    let cancel = false
    api(`/api/state?${params}`)
      .then((payload) => {
        if (cancel) return
        setData(payload)
        setNotice("")
        setBuilding((current) => current || payload.selectedId)
      })
      .catch((error) => {
        if (cancel) return
        if (error.status === 401) onSignedOut()
        else setNotice(error.message)
      })
    return () => {
      cancel = true
    }
  }, [at, building, onSignedOut])

  useEffect(() => {
    if (!freezer) {
      setSeries(null)
      return undefined
    }
    let cancel = false
    api(`/api/series?freezer=${encodeURIComponent(freezer)}&at=${encodeURIComponent(at)}`)
      .then((payload) => {
        if (!cancel) setSeries(payload)
      })
      .catch((error) => {
        if (!cancel && error.status === 401) onSignedOut()
      })
    return () => {
      cancel = true
    }
  }, [freezer, at, onSignedOut])

  useEffect(() => {
    if (!playing) return undefined
    const timer = setInterval(() => {
      setAt((current) => (current >= END ? current : shift(current, 1)))
    }, 900)
    return () => clearInterval(timer)
  }, [playing])

  useEffect(() => {
    if (at >= END && playing) setPlaying(false)
  }, [at, playing])

  function chooseBuilding(id) {
    setFreezer(null)
    setBuilding(id)
  }

  function go(next, pickRiskiest = false) {
    setPlaying(false)
    setFreezer(null)
    if (pickRiskiest) setBuilding(null)
    setAt(next)
  }

  async function act(path, planId, reason) {
    try {
      await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, reason: reason || "" }),
      })
      setNotice("")
      const params = new URLSearchParams({ at })
      if (building) params.set("building", building)
      setData(await api(`/api/state?${params}`))
    } catch (error) {
      if (error.status === 401) onSignedOut()
      else setNotice(error.message)
    }
  }

  const detail = data?.detail
  const weather = data?.weather
  const air = []
  if (weather && weather.tempF !== null && weather.tempF !== undefined) air.push(`${weather.tempF.toFixed(1)}°`)
  if (weather?.precipIn) air.push(`${weather.precipIn.toFixed(2)} in`)

  return (
    <div className="shell">
      <header className="bar">
        <p className="mark">IceBreaker</p>
        <p className="now">
          {data ? hourLabel(data.at) : hourLabel(at)}
          {air.length ? <span>{air.join(" · ")}</span> : null}
        </p>
        <nav className="who">
          <span>{user.name}</span>
          <button type="button" onClick={onMethod}>Method</button>
          <button type="button" onClick={() => setAbout(true)}>About</button>
          <button type="button" onClick={onSignedOut}>Log out</button>
        </nav>
      </header>
      {about ? <About onClose={() => setAbout(false)} /> : null}

      <div className="columns">
        <aside className="rail">
          <section className="stats">
            <Stat label="Red" value={data ? String(data.summary.red) : "–"} />
            <Stat label="Pending" value={data ? String(data.summary.pending) : "–"} />
            <Stat label="At risk" value={data ? data.summary.dollars : "–"} wide />
          </section>

          <div className="time">
            <div className="transport">
              <button type="button" onClick={() => go(shift(at, -1))} disabled={at === START}>Back</button>
              <button type="button" className="ink" onClick={() => setPlaying((value) => !value)}>
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={() => go(shift(at, 1))} disabled={at === END}>Forward</button>
            </div>
            <input
              aria-label="Hour"
              type="range"
              min={0}
              max={SPAN}
              value={hourIndex(at)}
              onChange={(event) => go(fromIndex(Number(event.target.value)))}
            />
            <div className="jumps">
              {JUMPS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => go(data?.jumps?.[key] || at, true)} disabled={!data}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="index">
            {(data?.buildings || []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={row.id === data?.selectedId ? "row on" : "row"}
                  onClick={() => chooseBuilding(row.id)}
                >
                  <i className={row.level} />
                  <span title={row.name}>{SHORT[row.id] || row.name}</span>
                  <strong className={row.level}>{row.score}</strong>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="stage">
          <Campus buildings={data?.buildings || []} selectedId={data?.selectedId} onSelect={chooseBuilding} />
        </main>

        <aside className="rail detail">
          {notice ? <p className="form-error" role="alert">{notice}</p> : null}
          {!detail ? <p className="quiet">Select a building.</p> : (
            <>
              <div className="place">
                <div>
                  <p className={`level level-${detail.level}`}>{detail.levelText}</p>
                  <h2>{detail.name}</h2>
                  <p className="note">{detail.onGenerator ? "On generator, assumed" : "No generator, assumed"}</p>
                </div>
                <p className={`score level-${detail.level}`}>{detail.score}</p>
              </div>
              <ul className="reasons">
                {(detail.reasons.length ? detail.reasons : ["No risk rules fired."]).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="dollars">{detail.dollars} at risk</p>
              {detail.damaged2019 === "true" ? (
                <p className="damage">
                  <a href={detail.damageSourceUrl} target="_blank" rel="noreferrer">{detail.damageType}</a>
                  <span>{detail.damageSource}</span>
                </p>
              ) : null}
              {detail.freezerMessage ? <p className="quiet">{detail.freezerMessage}</p> : (
                <>
                  <table className="freezers">
                    <thead>
                      <tr>
                        <th>Freezer</th>
                        <th>Lab</th>
                        <th>Temp</th>
                        <th>Value</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.freezers.map((row) => (
                        <tr
                          key={row.id}
                          className={freezer === row.id ? "on" : ""}
                          onClick={() => setFreezer(row.id)}
                        >
                          <td>{row.id}</td>
                          <td>{row.lab}</td>
                          <td>{row.temp || "—"}</td>
                          <td>{row.value}</td>
                          <td className={row.flagged ? "flag" : "calm"}>{row.flagged ? "Flagged" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Chart series={series} />
                </>
              )}
            </>
          )}

          <h3>Queue</h3>
          {data && !data.plans.length ? <p className="quiet">Nothing pending.</p> : null}
          {(data?.plans || []).map((plan) => (
            <Plan
              key={plan.id}
              plan={plan}
              current={plan.buildingId === data?.selectedId}
              canDecide={Boolean(data?.user?.canDecide)}
              onOpen={() => chooseBuilding(plan.buildingId)}
              onAct={act}
            />
          ))}
          {data?.decided?.length ? (
            <ul className="decided">
              {data.decided.map((row) => (
                <li key={row.id}>{row.buildingName} · {row.status}</li>
              ))}
            </ul>
          ) : null}
          <p className="fine">Readings and values are simulated. Weather stops at the hour on screen.</p>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value, wide = false }) {
  return (
    <div className={wide ? "stat wide" : "stat"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function Plan({ plan, current, canDecide, onOpen, onAct }) {
  const [reason, setReason] = useState("")
  return (
    <article className={current ? "plan on" : "plan"}>
      <header>
        <button type="button" onClick={onOpen}>{plan.rank} {plan.buildingName}</button>
        <span>{plan.dollars}</span>
      </header>
      <ol>
        {plan.steps.map((step) => (
          <li key={step.text}>
            {step.text}
            {step.citations.length ? <span className="cite">{step.citations.join(" · ")}</span> : null}
          </li>
        ))}
      </ol>
      {canDecide ? (
        <div className="actions">
          <button type="button" className="ink" onClick={() => onAct("/api/approve", plan.id)}>Approve</button>
          <button type="button" className="danger" onClick={() => onAct("/api/reject", plan.id, reason)}>Reject</button>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" aria-label="Reason" />
        </div>
      ) : null}
    </article>
  )
}
