import { useEffect, useState } from "react"
import { login, logout, me, register } from "./api"
import Dashboard from "./dashboard"
import Login from "./login"
import Method from "./method"

export default function App() {
  const [user, setUser] = useState(undefined)
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  function openMethod() {
    window.history.pushState({}, "", "/method")
    setPath("/method")
  }

  function leaveMethod() {
    window.history.pushState({}, "", "/")
    setPath("/")
  }

  if (path === "/method") {
    return <Method onBack={leaveMethod} />
  }

  if (user === undefined) {
    return (
      <div className="boot">
        <p>IceBreaker</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Login
        onSuccess={(payload) => setUser(payload.user)}
        signIn={login}
        register={register}
        onMethod={openMethod}
      />
    )
  }

  return (
    <Dashboard
      user={user}
      onMethod={openMethod}
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
