import { ContactShadows, Html, OrbitControls, RoundedBox } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useMemo, useRef, useState } from "react"
import * as THREE from "three"

const LEVEL = {
  red: "#ff6b57",
  yellow: "#e2b340",
  green: "#3ecf8e",
}

const SHORT = {
  chemistry: "Chemistry",
  vilas: "Vilas",
  grainger: "Grainger",
  birge: "Birge",
  van_vleck: "Van Vleck",
  biochemistry: "Biochem",
  microbial: "Microbial",
  discovery: "Discovery",
  engineering_centers: "Engr Centers",
  hslc: "HSLC",
  msc: "Med Sci",
  bock: "Bock",
}

function prefersStill() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function layout(buildings) {
  if (!buildings.length) return []
  const lats = buildings.map((row) => row.latitude)
  const lons = buildings.map((row) => row.longitude)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const latSpan = Math.max(maxLat - minLat, 1e-6)
  const lonSpan = Math.max(maxLon - minLon, 1e-6)
  const placed = buildings.map((row) => {
    const score = Number(row.score) || 0
    const h = 0.9 + (score / 100) * 4.6
    const footprint = 0.92 + (score / 100) * 0.28
    const turn = ((row.id.charCodeAt(0) + row.id.length) % 7 - 3) * 0.04
    return {
      ...row,
      x: ((row.longitude - minLon) / lonSpan - 0.5) * 8,
      z: ((maxLat - row.latitude) / latSpan - 0.5) * 5,
      h,
      w: footprint,
      d: footprint * 0.84,
      turn,
      color: LEVEL[row.level] || LEVEL.green,
      short: SHORT[row.id] || row.name,
    }
  })
  for (let pass = 0; pass < 48; pass += 1) {
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const dx = placed[j].x - placed[i].x
        const dz = placed[j].z - placed[i].z
        const dist = Math.hypot(dx, dz) || 0.001
        if (dist < 1.85) {
          const push = (1.85 - dist) / 2
          placed[i].x -= (dx / dist) * push
          placed[i].z -= (dz / dist) * push
          placed[j].x += (dx / dist) * push
          placed[j].z += (dz / dist) * push
        }
      }
    }
  }
  const cx = placed.reduce((sum, row) => sum + row.x, 0) / placed.length
  const cz = placed.reduce((sum, row) => sum + row.z, 0) / placed.length
  placed.forEach((row) => {
    row.x -= cx
    row.z -= cz
  })
  const maxR = Math.max(...placed.map((row) => Math.hypot(row.x, row.z)), 1)
  const fit = 4.6 / maxR
  placed.forEach((row) => {
    row.x *= fit
    row.z *= fit
  })
  return placed
}

function Snow({ still }) {
  const points = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const count = 520
    const array = new Float32Array(count * 3)
    for (let index = 0; index < count; index += 1) {
      array[index * 3] = (Math.random() - 0.5) * 28
      array[index * 3 + 1] = Math.random() * 16
      array[index * 3 + 2] = (Math.random() - 0.5) * 24
    }
    geo.setAttribute("position", new THREE.BufferAttribute(array, 3))
    const material = new THREE.PointsMaterial({
      color: "#f6f3ec",
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    })
    return new THREE.Points(geo, material)
  }, [])

  useFrame((_, delta) => {
    if (still) return
    const position = points.geometry.attributes.position
    for (let index = 0; index < position.count; index += 1) {
      let y = position.getY(index) - delta * (0.45 + (index % 5) * 0.12)
      if (y < 0) y = 15
      position.setY(index, y)
      position.setX(index, position.getX(index) + Math.sin(index + y) * delta * 0.05)
    }
    position.needsUpdate = true
  })

  return <primitive object={points} />
}

function Grid() {
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(24, 24, "#3c4558", "#222836")
    helper.material.transparent = true
    helper.material.opacity = 0.14
    return helper
  }, [])
  return <primitive object={grid} position={[0, 0.01, 0]} />
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.38} />
      <hemisphereLight args={["#d5e2f5", "#1a140f", 0.55]} />
      <directionalLight position={[8, 16, 8]} intensity={1.25} color="#f7f1e4" />
      <directionalLight position={[-12, 6, -6]} intensity={0.4} color="#8eafef" />
    </>
  )
}

function Tower({ row, selected, onSelect }) {
  const [hot, setHot] = useState(false)
  const mesh = useRef(null)
  const glow = selected || hot

  useFrame(() => {
    if (!mesh.current) return
    const next = glow ? 1.04 : 1
    mesh.current.scale.y += (next - mesh.current.scale.y) * 0.12
  })

  return (
    <group position={[row.x, 0, row.z]} rotation={[0, row.turn, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <circleGeometry args={[glow ? 0.95 : 0.62, 24]} />
        <meshBasicMaterial color={row.color} transparent opacity={glow ? 0.34 : 0.12} />
      </mesh>
      <RoundedBox
        ref={mesh}
        args={[row.w, row.h, row.d]}
        radius={0.08}
        smoothness={4}
        position={[0, row.h / 2, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(row.id)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHot(true)
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          setHot(false)
          document.body.style.cursor = ""
        }}
      >
        <meshStandardMaterial
          color="#1b2433"
          emissive={row.color}
          emissiveIntensity={selected ? 0.72 : hot ? 0.4 : 0.16}
          roughness={0.55}
          metalness={0.22}
        />
      </RoundedBox>
      <mesh position={[0, row.h + 0.02, 0]}>
        <boxGeometry args={[row.w * 0.86, 0.1, row.d * 0.86]} />
        <meshStandardMaterial color={row.color} emissive={row.color} emissiveIntensity={selected ? 1.3 : 0.75} roughness={0.3} />
      </mesh>
      {(selected || hot) && (
        <Html position={[0, row.h + 0.45, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}>
          <div className={`pin level-${row.level}${selected ? " on" : ""}`}>
            {row.short}
            <small>{row.levelText} {row.score}</small>
          </div>
        </Html>
      )}
      {selected && <pointLight position={[0, row.h + 0.4, 0]} color={row.color} intensity={6} distance={7} />}
    </group>
  )
}

function Lobby() {
  const towers = [
    { position: [-3.2, 1.1, -1.2], args: [1.1, 2.2, 0.9], color: "#ff6b57" },
    { position: [-1.2, 0.7, 0.8], args: [0.9, 1.4, 0.8], color: "#e2b340" },
    { position: [0.8, 1.5, -0.4], args: [1.2, 3, 1], color: "#3ecf8e" },
    { position: [2.8, 0.9, 1.1], args: [0.85, 1.8, 0.75], color: "#e4c27a" },
  ]
  return towers.map((tower) => (
    <RoundedBox key={tower.color} args={tower.args} radius={0.08} position={tower.position}>
      <meshStandardMaterial color="#141b28" emissive={tower.color} emissiveIntensity={0.55} roughness={0.4} metalness={0.2} />
    </RoundedBox>
  ))
}

export function canUseWebGL() {
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export default function Campus({ buildings = [], selectedId, onSelect, lobby = false }) {
  const still = useMemo(prefersStill, [])
  const placed = useMemo(() => layout(buildings), [buildings])

  return (
    <Canvas
      camera={{ position: lobby ? [6, 5, 8] : [0, 11, 15], fov: lobby ? 42 : 34 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#07080d"]} />
      <fog attach="fog" args={["#07080d", 18, 42]} />
      <Lights />
      <Grid />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[13.5, 72]} />
        <meshStandardMaterial color="#10151f" roughness={1} metalness={0} />
      </mesh>
      <ContactShadows position={[0, 0.02, 0]} opacity={0.45} scale={28} blur={2.4} far={5} color="#000000" />
      <Snow still={still} />
      {lobby
        ? <Lobby />
        : placed.map((row) => (
          <Tower key={row.id} row={row} selected={row.id === selectedId} onSelect={onSelect} />
        ))}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={!lobby}
        autoRotate={lobby && !still}
        autoRotateSpeed={0.45}
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={0.45}
        minDistance={lobby ? 8 : 8}
        maxDistance={lobby ? 16 : 26}
        target={[0, 1.4, 0]}
      />
    </Canvas>
  )
}
