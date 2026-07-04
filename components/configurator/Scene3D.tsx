"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DerivedRailing } from "@/lib/engine/geometry";
import type { RailingConfig } from "@/lib/engine/types";

const MM = 0.001;

const RAL: Record<RailingConfig["color"], string> = {
  ral7016: "#383e42",
  ral9005: "#0e0e0e",
  ral9010: "#efece3",
  custom: "#4d6172",
};

function v(p: { x: number; y: number; z: number }) {
  return new THREE.Vector3(p.x * MM, p.y * MM, p.z * MM);
}

/** Cylinder (or slim box) spanning two points. */
function Member({
  a,
  b,
  radius,
  color,
  box = false,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
  color: string;
  box?: boolean;
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { mid: a.clone().add(b).multiplyScalar(0.5), quat, len };
  }, [a, b]);
  return (
    <mesh position={mid} quaternion={quat}>
      {box ? (
        <boxGeometry args={[radius * 2.4, len, radius * 1.2]} />
      ) : (
        <cylinderGeometry args={[radius, radius, len, 12]} />
      )}
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.5} />
    </mesh>
  );
}

function Railing({ cfg, derived }: { cfg: RailingConfig; derived: DerivedRailing }) {
  const color = RAL[cfg.color];
  const hrColor = cfg.handrail === "round_inox" ? "#b9bdbf" : color;
  const slabColor = "#dddad2";

  return (
    <group>
      {derived.segments.map((seg, i) => {
        const start = v(seg.start);
        const end = v(seg.end);
        const perp = new THREE.Vector3(-Math.sin((seg.headingDeg * Math.PI) / 180), 0, Math.cos((seg.headingDeg * Math.PI) / 180));

        // Floor: flat slab, or steps for stair segments.
        const slabs: React.ReactNode[] = [];
        if (seg.slopeDeg === 0) {
          const mid = start.clone().add(end).multiplyScalar(0.5).add(perp.clone().multiplyScalar(0.6));
          slabs.push(
            <mesh key="slab" position={[mid.x, start.y - 0.06, mid.z]} rotation={[0, (-seg.headingDeg * Math.PI) / 180, 0]}>
              <boxGeometry args={[(seg.input.length * MM) + 0.08, 0.12, 1.3]} />
              <meshStandardMaterial color={slabColor} roughness={0.95} />
            </mesh>,
          );
        } else {
          const steps = Math.max(2, Math.round((seg.rise * MM) / 0.175));
          for (let s = 0; s < steps; s++) {
            const t0 = (s / steps) * seg.input.length;
            const t1 = ((s + 1) / steps) * seg.input.length;
            const px = seg.start.x + seg.dir.x * ((t0 + t1) / 2);
            const pz = seg.start.z + seg.dir.z * ((t0 + t1) / 2);
            const topY = seg.start.y + seg.dir.y * t1;
            slabs.push(
              <mesh
                key={`st${s}`}
                position={[px * MM + perp.x * 0.6, topY * MM - 0.09, pz * MM + perp.z * 0.6]}
                rotation={[0, (-seg.headingDeg * Math.PI) / 180, 0]}
              >
                <boxGeometry args={[((t1 - t0) * MM) * Math.cos((seg.slopeDeg * Math.PI) / 180), 0.18, 1.3]} />
                <meshStandardMaterial color={slabColor} roughness={0.95} />
              </mesh>,
            );
          }
        }

        const railTopA = start.clone().setY(start.y + cfg.height * MM);
        const railTopB = end.clone().setY(end.y + cfg.height * MM);
        const railBotA = start.clone().setY(start.y + (cfg.bottomGap + 20) * MM);
        const railBotB = end.clone().setY(end.y + (cfg.bottomGap + 20) * MM);

        return (
          <group key={seg.input.id + i}>
            {slabs}
            {/* handrail + bottom rail */}
            <Member a={railTopA} b={railTopB} radius={0.021} color={hrColor} box={cfg.handrail === "flat_steel"} />
            <Member a={railBotA} b={railBotB} radius={0.008} color={color} />
            {/* posts */}
            {seg.posts.map((p, k) => (
              <mesh key={k} position={[p.base.x * MM, (p.base.y + cfg.height / 2) * MM, p.base.z * MM]}>
                <boxGeometry args={[0.04, cfg.height * MM, 0.04]} />
                <meshStandardMaterial color={color} metalness={0.35} roughness={0.5} />
              </mesh>
            ))}
            {/* bars */}
            {seg.bars.map((b, k) => (
              <Member key={k} a={v(b.bottom)} b={v(b.top)} radius={0.006} color={color} />
            ))}
          </group>
        );
      })}
    </group>
  );
}

export default function Scene3D({ cfg, derived }: { cfg: RailingConfig; derived: DerivedRailing }) {
  const controls = useRef(null);
  const { center, dist } = useMemo(() => {
    const b = derived.bounds;
    const center = new THREE.Vector3(((b.minX + b.maxX) / 2) * MM, (b.maxY * MM) / 2 + 0.5, ((b.minZ + b.maxZ) / 2) * MM);
    const span = Math.max((b.maxX - b.minX) * MM, (b.maxZ - b.minZ) * MM, 2.5);
    return { center, dist: span * 1.15 + 2 };
  }, [derived]);

  return (
    <Canvas
      shadows={false}
      camera={{ position: [center.x + dist * 0.8, center.y + dist * 0.55, center.z + dist * 0.85], fov: 40 }}
      style={{ background: "#f1f0ec" }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 8, 5]} intensity={1.1} />
      <directionalLight position={[-6, 4, -4]} intensity={0.35} />
      <Railing cfg={cfg} derived={derived} />
      <gridHelper args={[40, 80, "#d6d3ca", "#e6e4dc"]} position={[0, -0.121, 0]} />
      <OrbitControls ref={controls} target={center} enablePan={false} maxPolarAngle={Math.PI / 2.05} minDistance={1.2} maxDistance={40} />
    </Canvas>
  );
}
