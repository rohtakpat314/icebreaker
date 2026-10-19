import { useState } from "react"
import About from "./about"

export default function Login({ onSuccess, signIn, register, onMethod }) {
  const [mode, setMode] = useState("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [about, setAbout] = useState(false)
  const creating = mode === "create"

  async function submit(event) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const payload = creating
        ? await register(email.trim(), password)
        : await signIn(email.trim(), password)
      onSuccess(payload)
    } catch (err) {
      setError(err.message || "Sign-in failed")
    } finally {
      setPending(false)
    }
  }

  function switchMode() {
    setMode(creating ? "sign-in" : "create")
    setError("")
  }

  return (
    <div className="gate">
      <form className="gate-copy" onSubmit={submit}>
        <p className="kicker">UW–Madison · February 2019</p>
        <h1>IceBreaker</h1>
        <p className="lede">{creating ? "Create an account." : "The freeze, hour by hour."}</p>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            minLength={creating ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {creating ? <p className="quiet">New accounts are viewers.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="gate-actions">
          <button className="solid" type="submit" disabled={pending}>
            {pending ? "Please wait" : creating ? "Create account" : "Sign in"}
          </button>
          <button type="button" onClick={switchMode}>{creating ? "Sign in" : "Create an account"}</button>
          <button type="button" onClick={onMethod}>Method</button>
          <button type="button" onClick={() => setAbout(true)}>About</button>
        </div>
      </form>
      <img src="/capitol.jpg" alt="The Wisconsin State Capitol at night in heavy snow" />
      {about ? <About onClose={() => setAbout(false)} /> : null}
    </div>
  )
}
