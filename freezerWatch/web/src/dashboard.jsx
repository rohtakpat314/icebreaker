import { useEffect, useState } from "react"
import About from "./about"
import { api } from "./api"
import Campus, { canUseWebGL } from "./campus"
import Chart from "./chart"
import { END, SPAN, START, fromIndex, hourIndex, hourLabel, shift } from "./time"

const JUMPS = [
  ["deepFreeze", "Jan 30 deep freeze"],
  ["outage", "Feb 1 Chemistry outage"],
  ["thaw", "Feb 3 thaw"],
]

export default function Dashboard({ user, onSignedOut }) {
  const [at, setAt] = useState(START)
  const [building, setBuilding] = useState(null)
  const [data, setData] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [freezer, setFreezer] = useState(null)
  const [series, setSeries] = useState(null)
  const [notice, setNotice] = useState("")
  const [about, setAbout] = useState(false)
  const webgl = canUseWebGL()

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
  if (weather && weather.tempF !== null && weather.tempF !== undefined) air.push(`${weather.tempF.toFixed(1)}°F outside`)
  if (weather?.precipIn) air.push(`${weather.precipIn.toFixed(2)} in precip`)

  return (
    <div className="app">
      <div className="stage">
        {webgl ? (
          <Campus buildings={data?.buildings || []} selectedId={data?.selectedId} onSelect={chooseBuilding} />
        ) : (
          <div className="stage-fallback">This browser cannot draw the 3D campus. The building list still works.</div>
        )}
        <div className="vignette" />
      </div>

      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">UW–Madison · February 2019</p>
          <strong>Freezer Watch</strong>
        </div>
        <div className="now">
          <p>{data ? hourLabel(data.at) : hourLabel(at)}</p>
          <span>{air.join(" · ")}</span>
        </div>
        <div className="who">
          <span>{user.name}</span>
          <em>{user.roleLabel || user.role}</em>
          <button type="button" className="text" onClick={() => setAbout(true)}>About</button>
          <button type="button" className="text" onClick={onSignedOut}>Log out</button>
        </div>
      </header>
      {about ? <About onClose={() => setAbout(false)} /> : null}

      <div className="workspace">
        <aside className="panel">
          <section className="stats">
            <Stat label="Red buildings" value={data ? String(data.summary.red) : "–"} />
            <Stat label="Dollars at risk" value={data ? data.summary.dollars : "–"} tag="Simulated" />
            <Stat label="Pending plans" value={data ? String(data.summary.pending) : "–"} />
          </section>

          <div className="transport">
            <button type="button" onClick={() => go(shift(at, -1))} disabled={at === START}>Back</button>
            <button type="button" className="primary" onClick={() => setPlaying((value) => !value)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => go(shift(at, 1))} disabled={at === END}>Forward</button>
          </div>
          <label className="scrub">
            Hour
            <input
              type="range"
              min={0}
              max={SPAN}
              value={hourIndex(at)}
              onChange={(event) => go(fromIndex(Number(event.target.value)))}
            />
          </label>
          <div className="jumps">
            {JUMPS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => go(data?.jumps?.[key] || at, true)} disabled={!data}>
                {label}
              </button>
            ))}
          </div>

          <h2>Campus</h2>
          <div className="legend">
            <span><i className="swatch red" /> Red</span>
            <span><i className="swatch yellow" /> Yellow</span>
            <span><i className="swatch green" /> Green</span>
          </div>
          <ul className="buildings">
            {(data?.buildings || []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={row.id === data?.selectedId ? "bldg on" : "bldg"}
                  onClick={() => chooseBuilding(row.id)}
                >
                  <i className={`swatch ${row.level}`} />
                  <span>{row.name}</span>
                  <strong>{row.score}</strong>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="spacer">
          <p className="orbit-hint">Drag to orbit · click a building</p>
        </div>

        <aside className="panel detail-panel">
          {notice ? <p className="form-error" role="alert">{notice}</p> : null}
          {!detail ? <p className="quiet">Select a building</p> : (
            <>
              <div className="detail-head">
                <div>
                  <h2 className="place">{detail.name}</h2>
                  <div className="meta">
                    <span className={`badge level-${detail.level}`}>{detail.levelText}</span>
                    <span className="tag">{detail.onGenerator ? "Generator · assumed" : "No generator · assumed"}</span>
                  </div>
                </div>
                <p className={`score level-${detail.level}`}>{detail.score}</p>
              </div>
              <ul className="reasons">
                {(detail.reasons.length ? detail.reasons : ["No risk rules fired"]).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="dollars">Dollars at risk {detail.dollars}</p>
              <span className="tag">Simulated values</span>
              {detail.damaged2019 === "true" ? (
                <p className="damage-line">
                  <a href={detail.damageSourceUrl} target="_blank" rel="noreferrer">
                    Damaged in Feb 2019 · {detail.damageType}
                  </a>
                  <span>{detail.damageSource}</span>
                </p>
              ) : null}
              {detail.freezerMessage ? <p className="quiet">{detail.freezerMessage}</p> : (
                <>
                  <ul className="freezers">
                    {detail.freezers.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={freezer === row.id ? "freezer on" : "freezer"}
                          onClick={() => setFreezer(row.id)}
                        >
                          <strong>{row.id}</strong>
                          <span>{row.lab}</span>
                          <span>{row.temp || "—"}</span>
                          <span>{row.value}</span>
                          <em className={row.flagged ? "flag" : "calm"}>{row.flagged ? "Flagged" : "OK"}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Chart series={series} />
                </>
              )}
            </>
          )}

          <h2 className="queue-title">Approval queue</h2>
          {data && !data.plans.length ? <p className="quiet">No pending plans</p> : null}
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
            <>
              <h2 className="queue-title">Decided</h2>
              <ul className="decided">
                {data.decided.map((row) => (
                  <li key={row.id}>{row.buildingName} · {row.status} · {row.decidedBy}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="fine">Freezer readings and values are simulated. Generator status is assumed. Weather never looks past the selected hour.</p>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value, tag }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {tag ? <em>{tag}</em> : null}
    </div>
  )
}

function Plan({ plan, current, canDecide, onOpen, onAct }) {
  const [reason, setReason] = useState("")
  return (
    <article className={current ? "card current" : "card"}>
      <header>
        <button type="button" className="linkish" onClick={onOpen}>
          {plan.rank}. {plan.buildingName}
        </button>
        <span>{plan.dollars}</span>
      </header>
      <ol>
        {plan.steps.map((step) => (
          <li key={step.text}>
            {step.text}
            <div className="chips">
              {step.citations.map((citation) => <span key={citation}>{citation}</span>)}
            </div>
          </li>
        ))}
      </ol>
      {canDecide ? (
        <div className="actions">
          <button type="button" className="primary" onClick={() => onAct("/api/approve", plan.id)}>Approve</button>
          <button type="button" className="danger" onClick={() => onAct("/api/reject", plan.id, reason)}>Reject</button>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason" />
        </div>
      ) : null}
    </article>
  )
}
