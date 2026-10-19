import { useEffect } from "react"

export default function About({ onClose }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="about-root">
      <button type="button" className="about-scrim" aria-label="Close about" onClick={onClose} />
      <aside className="about" role="dialog" aria-labelledby="about-title">
        <header>
          <p className="kicker">About</p>
          <button type="button" className="text" onClick={onClose}>Close</button>
        </header>
        <h2 id="about-title">IceBreaker</h2>
        <p className="about-lead">A replay of the February 2019 freeze at UW–Madison. One campus. One hour at a time.</p>

        <h3>What it is</h3>
        <p>Buildings are scored as the cold deepens and the thaw arrives. A facilities officer can approve or reject the protection plans that show up.</p>

        <h3>What is real</h3>
        <ul>
          <li>Building names and locations on the UW–Madison campus.</li>
          <li>The February 2019 weather, never past the hour on screen.</li>
          <li>Damage notes for Vilas Hall and the Chemistry Building, from the Wisconsin State Journal.</li>
        </ul>

        <h3>What is simulated</h3>
        <ul>
          <li>Freezer temperatures and the dollars attached to them.</li>
          <li>Whether a building is on generator power.</li>
        </ul>

        <h3>Who sees what</h3>
        <ul>
          <li>Facilities Officer. Every building and freezer. Can approve or reject.</li>
          <li>Chemistry Lab Manager. Freezer rows in Chemistry only.</li>
          <li>Viewer. Risk levels and dollar ranges. No freezer rows.</li>
        </ul>
      </aside>
    </div>
  )
}
