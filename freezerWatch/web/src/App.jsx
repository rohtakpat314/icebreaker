import { useEffect, useState } from "react"
import { login, logout, me } from "./api"
import Dashboard from "./dashboard"
import Login from "./login"

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null))
  }, [])

  if (user === undefined) {
    return (
      <div className="boot">
        <p>Freezer Watch</p>
      </div>
    )
  }

  if (!user) {
    return <Login onSuccess={(payload) => setUser(payload.user)} signIn={login} />
  }

  return (
    <Dashboard
      user={user}
      onSignedOut={async () => {
        try {
          await logout()
        } catch {
          /* session already gone */
        }
        setUser(null)
      }}
    />
  )
}
