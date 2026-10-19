import { Html, Line, OrbitControls } from "@react-three/drei"
import { Canvas, useThree } from "@react-three/fiber"
import { useLayoutEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { SHORT } from "./map"

const COLOR = {
  red: "#e11d48",
  yellow: "#eab308",
  green: "#3ecf8e",
}

const ORIGIN = { lat: 43.0752, lon: -89.412 }
const M_LAT = 111320
const M_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180)
const SCALE = 1 / 280
const LAT_EX = 2.35
const SHORE_LAT = 43.079

function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * M_LON * SCALE
  const z = -(lat - ORIGIN.lat) * M_LAT * SCALE * LAT_EX
  return [x, z]
}

const SHORE_Z = project(SHORE_LAT, ORIGIN.lon)[1]
const LAND = { x0: -12, x1: 8, z1: 7 }

const NUDGE = {
  chemistry: [-0.42, 0.05],
  grainger: [0.08, 0.34],
  vilas: [0.46, 0.02],
  discovery: [-0.08, -0.32],
  van_vleck: [0.36, -0.08],
  msc: [-0.28, 0.22],
  bock: [-0.34, 0.02],
  microbial: [0.28, -0.16],
  engineering_centers: [0.05, 0.28],
  biochemistry: [0.3, 0.12],
}

function layout(buildings) {
  if (!buildings.length) return { points: [], link: null, center: [0, 0] }
  const points = buildings.map((row) => {
    const [x, z] = project(row.latitude, row.longitude)
    const score = Number(row.score) || 0
    return {
      ...row,
      x,
      z,
      h: 0.16 + (score / 100) * 2.35,
      short: SHORT[row.id] || row.name,
    }
  })
  const hslc = points.find((row) => row.id === "hslc")
  const west = points.filter((row) => row.id !== "hslc").reduce((best, row) => (row.x < best.x ? row : best), points[0])
  const link = hslc && west ? [[hslc.x, 0.04, hslc.z], [west.x, 0.04, west.z]] : null
  const xs = points.map((row) => row.x)
  const zs = points.map((row) => row.z)
  const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
  return { points, link, center }
}

function Ground() {
  const grid = useMemo(() => {
    const verts = []
    for (let lon = -89.434; lon <= -89.396; lon += 0.004) {
      const [x] = project(ORIGIN.lat, lon)
      verts.push(x, 0.02, SHORE_Z, x, 0.02, LAND.z1)
    }
    for (let lat = 43.0712; lat < SHORE_LAT; lat += 0.0014) {
      const [, z] = project(lat, ORIGIN.lon)
      verts.push(LAND.x0, 0.02, z, LAND.x1, 0.02, z)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3))
    return geometry
  }, [])
  const landW = LAND.x1 - LAND.x0
  const landH = LAND.z1 - SHORE_Z
  const waterH = 8

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(LAND.x0 + LAND.x1) / 2, 0, (SHORE_Z + LAND.z1) / 2]}>
        <planeGeometry args={[landW, landH]} />
        <meshStandardMaterial color="#121412" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(LAND.x0 + LAND.x1) / 2, -0.03, SHORE_Z - waterH / 2]}>
        <planeGeometry args={[landW, waterH]} />
        <meshStandardMaterial color="#0c1218" metalness={0.35} roughness={0.42} />
      </mesh>
      <Line
        points={[[LAND.x0, 0.03, SHORE_Z], [LAND.x1, 0.03, SHORE_Z]]}
        color="#6d7c8a"
        lineWidth={1}
      />
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#2c2e2a" />
      </lineSegments>
      <Line
        points={[[-4.6, 0.04, 1.35], [-4.6 + 500 * SCALE, 0.04, 1.35]]}
        color="#8a8a86"
        lineWidth={1}
      />
      <Html position={[-1.6, 0.05, SHORE_Z - 0.55]} center style={{ pointerEvents: "none" }} zIndexRange={[2, 0]}>
        <span className="pin-meta">Lake Mendota</span>
      </Html>
      <Html position={[3.15, 0.05, SHORE_Z - 0.55]} center style={{ pointerEvents: "none" }} zIndexRange={[2, 0]}>
        <span className="pin-meta">N</span>
      </Html>
    </group>
  )
}

function Hall({ row, selected, hot, onSelect, onHot }) {
  const color = COLOR[row.level] || COLOR.green
  const lit = selected || hot
  const height = Math.max(row.h, 0.18)
  return (
    <group position={[row.x, 0, row.z]}>
      <mesh
        position={[0, height / 2, 0]}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(row.id)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHot(row.id)
        }}
        onPointerOut={() => onHot(null)}
      >
        <boxGeometry args={[0.26, height, 0.26]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.04} emissive={color} emissiveIntensity={lit ? 0.22 : 0.04} />
      </mesh>
      {selected ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.2, 0.28, 40]} />
          <meshBasicMaterial color="#f5f5f4" />
        </mesh>
      ) : null}
      <Html position={[NUDGE[row.id]?.[0] || 0, height + 0.34, NUDGE[row.id]?.[1] || 0]} center distanceFactor={12} style={{ pointerEvents: "none" }} zIndexRange={[8, 0]}>
        <span className={lit ? "pin-label on" : "pin-label"}>{row.short}</span>
      </Html>
    </group>
  )
}

function Scene({ buildings, selectedId, onSelect }) {
  const [hot, setHot] = useState(null)
  const { points, link, center } = useMemo(() => layout(buildings), [buildings])
  const mid = link ? [(link[0][0] + link[1][0]) / 2, 0.08, (link[0][2] + link[1][2]) / 2] : null

  return (
    <>
      <color attach="background" args={["#090909"]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[-8, 12, 6]} intensity={1.7} />
      <hemisphereLight args={["#d5d8d2", "#0c1014", 0.35]} />
      <Ground />
      {link ? <Line points={link} color="#5c5e58" lineWidth={1} dashed dashSize={0.12} gapSize={0.08} /> : null}
      {mid ? (
        <Html position={mid} center style={{ pointerEvents: "none" }} zIndexRange={[4, 0]}>
          <span className="pin-meta distance">1.5 km</span>
        </Html>
      ) : null}
      <Html position={[-4.6 + 250 * SCALE, 0.08, 1.62]} center style={{ pointerEvents: "none" }} zIndexRange={[4, 0]}>
        <span className="pin-meta distance">500 m</span>
      </Html>
      {points.map((row) => (
        <Hall
          key={row.id}
          row={row}
          selected={row.id === selectedId}
          hot={row.id === hot}
          onSelect={onSelect}
          onHot={setHot}
        />
      ))}
      <Frame center={center} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.45}
        maxPolarAngle={1.15}
        minDistance={6}
        maxDistance={28}
        target={[center[0], 0.15, center[1]]}
      />
    </>
  )
}

function Frame({ center }) {
  const { camera, size, controls } = useThree()
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const dist = aspect < 0.9 ? 19 : 13.4
    camera.position.set(center[0], dist * 0.7, center[1] + dist * 0.78)
    camera.fov = aspect < 0.9 ? 50 : 36
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(center[0], 0.15, center[1])
      controls.update()
    }
  }, [camera, center, controls, size])
  return null
}

export default function Campus({ buildings, selectedId, onSelect }) {
  return (
    <Canvas
      className="campus"
      camera={{ position: [-1, 14, 12], fov: 40, near: 0.1, far: 80 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: 0 }}
    >
      <Scene buildings={buildings} selectedId={selectedId} onSelect={onSelect} />
    </Canvas>
  )
}
