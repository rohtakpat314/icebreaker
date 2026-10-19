import { useState } from "react"
import About from "./about"
import Campus, { canUseWebGL } from "./campus"

const DEMOS = [
  ["officer", "capitol-2019", "Facilities Officer", "Approves plans. Sees every freezer."],
  ["labmgr-chemistry", "babcock-2019", "Chemistry Lab Manager", "Freezers in Chemistry only."],
  ["viewer", "lakeshore", "Viewer", "Risk levels and dollar ranges."],
]

export default function Login({ onSuccess, signIn }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [about, setAbout] = useState(false)
  const webgl = canUseWebGL()

  async function submit(event, nextUser = username, nextPassword = password) {
    event?.preventDefault()
    setPending(true)
    setError("")
    try {
      const payload = await signIn(nextUser.trim(), nextPassword)
      onSuccess(payload)
    } catch (err) {
      setError(err.message || "Sign-in failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="login">
      <div className="stage" aria-hidden="true">
        {webgl ? <Campus lobby /> : null}
        <div className="vignette" />
      </div>
      <form className="login-card" onSubmit={(event) => submit(event)}>
        <div className="login-top">
          <p className="eyebrow">UW–Madison · February 2019</p>
          <button type="button" className="text" onClick={() => setAbout(true)}>About</button>
        </div>
        <img src="/capitol.jpg" alt="The Wisconsin State Capitol at night in heavy snow" />
        <h1>Freezer Watch</h1>
        <p className="lede">Sign in to walk the campus through the freeze, hour by hour.</p>
        <label>
          User
          <input
            name="username"
            autoComplete="username"
            placeholder="officer"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <div className="demos">
          <p>Demo accounts</p>
          {DEMOS.map(([id, pass, name, note]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setUsername(id)
                setPassword(pass)
                submit(null, id, pass)
              }}
            >
              <strong>{name}</strong>
              <span>{id} · {pass}</span>
              <small>{note}</small>
            </button>
          ))}
        </div>
      </form>
      {about ? <About onClose={() => setAbout(false)} /> : null}
    </div>
  )
}
