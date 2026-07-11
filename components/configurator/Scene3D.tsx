"use client";

import { createContext, memo, useContext, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";
import { railDepth, type DerivedRailing } from "@/lib/engine/geometry";
import { WALL_CLEARANCE, type RailingConfig, type TypeProfile } from "@/lib/engine/types";
import { INOX, RAL_HEX as RAL } from "@/lib/theme";

const MM = 0.001;


function v(p: { x: number; y: number; z: number }) {
  return new THREE.Vector3(p.x * MM, p.y * MM, p.z * MM);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Technical view: white shaded-with-edges rendering, like a CAD viewport. */
const TechCtx = createContext(false);

function Steel({ color, metalness = 0.35, roughness = 0.5 }: { color: string; metalness?: number; roughness?: number }) {
  const tech = useContext(TechCtx);
  return tech ? (
    <meshStandardMaterial color="#f4f3ee" metalness={0} roughness={0.92} />
  ) : (
    <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
  );
}

function Ink() {
  const tech = useContext(TechCtx);
  return tech ? <Edges threshold={40} color="#3f3f3a" /> : null;
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
      <Steel color={color} />
      <Ink />
    </mesh>
  );
}

/** Vertical post from base to top (stair posts run longer, down to the tread). */
function Post({
  base,
  top,
  size,
  depth,
  round,
  headingDeg,
  color,
}: {
  base: { x: number; y: number; z: number };
  top: { x: number; y: number; z: number };
  size: number;
  /** Rect tubes: dimension perpendicular to the railing plane. */
  depth?: number;
  round: boolean;
  headingDeg: number;
  color: string;
}) {
  const len = (top.y - base.y) * MM;
  return (
    <mesh
      position={[base.x * MM, ((base.y + top.y) / 2) * MM, base.z * MM]}
      rotation={[0, -rad(headingDeg), 0]}
    >
      {round ? (
        <cylinderGeometry args={[(size / 2) * MM, (size / 2) * MM, len, 16]} />
      ) : (
        <boxGeometry args={[size * MM, len, (depth ?? size) * MM]} />
      )}
      <Steel color={color} />
      <Ink />
    </mesh>
  );
}

/**
 * Rectangular-tube rail spanning two points: cross-section stays upright
 * (w vertical × d perpendicular to the run), length follows heading + slope.
 */
function RectRail({
  a,
  b,
  w,
  d,
  headingDeg,
  color,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  w: number;
  d: number;
  headingDeg: number;
  color: string;
}) {
  const { mid, quat, len } = useMemo(() => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const run = Math.hypot(dir.x, dir.z);
    const slope = Math.atan2(dir.y, run);
    const quat = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rad(headingDeg))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope));
    return { mid: a.clone().add(b).multiplyScalar(0.5), quat, len };
  }, [a, b, headingDeg]);
  return (
    <mesh position={mid} quaternion={quat}>
      <boxGeometry args={[len, w * MM, d * MM]} />
      <Steel color={color} />
      <Ink />
    </mesh>
  );
}

/** Flat bar between bottom rail and handrail, rotated in plan (as-built barreaudage). */
function FlatBar({
  bottom,
  top,
  w,
  t,
  angleDeg,
  headingDeg,
  color,
}: {
  bottom: { x: number; y: number; z: number };
  top: { x: number; y: number; z: number };
  w: number;
  t: number;
  angleDeg: number;
  headingDeg: number;
  color: string;
}) {
  const len = (top.y - bottom.y) * MM;
  return (
    <mesh
      position={[bottom.x * MM, ((bottom.y + top.y) / 2) * MM, bottom.z * MM]}
      rotation={[0, -rad(headingDeg + angleDeg), 0]}
    >
      <boxGeometry args={[w * MM, len, t * MM]} />
      <Steel color={color} />
      <Ink />
    </mesh>
  );
}

/** Base plate with anchor bolts under a post. */
function BasePlate({
  at,
  headingDeg,
  postSize,
  plate,
  color,
}: {
  at: { x: number; y: number; z: number };
  headingDeg: number;
  postSize: number;
  /** Real plate dims (w along the run, l across, t thick), mm. */
  plate?: { w: number; l: number; t: number };
  color: string;
}) {
  if (plate) {
    // As-built fixing detail: plate w×l×t with two anchors across the run,
    // one each side of the tube.
    const t = plate.t * MM;
    const off = (plate.l / 2 - 28) * MM;
    return (
      <group position={[at.x * MM, at.y * MM + t / 2, at.z * MM]} rotation={[0, -rad(headingDeg), 0]}>
        <mesh>
          <boxGeometry args={[plate.w * MM, t, plate.l * MM]} />
          <Steel color={color} />
          <Ink />
        </mesh>
        {[1, -1].map((sz, b) => (
          <mesh key={b} position={[0, t / 2 + 0.002, sz * off]}>
            <cylinderGeometry args={[0.006, 0.006, 0.01, 10]} />
            <Steel color="#8f9498" />
            <Ink />
          </mesh>
        ))}
      </group>
    );
  }
  const ps = Math.max(0.1, postSize * 2.2 * MM);
  const off = ps / 2 - 0.016;
  return (
    <group position={[at.x * MM, at.y * MM + 0.004, at.z * MM]} rotation={[0, -rad(headingDeg), 0]}>
      <mesh>
        <boxGeometry args={[ps, 0.008, ps]} />
        <Steel color={color} />
        <Ink />
      </mesh>
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz], b) => (
        <mesh key={b} position={[sx * off, 0.009, sz * off]}>
          <cylinderGeometry args={[0.007, 0.007, 0.012, 10]} />
          <Steel color="#8f9498" />
          <Ink />
        </mesh>
      ))}
    </group>
  );
}

/** Side-mount fixing: vertical plate on the slab edge face, horizontal anchors. */
function SidePlate({
  at,
  headingDeg,
  face,
  plate,
  color,
}: {
  at: { x: number; y: number; z: number };
  headingDeg: number;
  /** Slab face distance from the railing axis, m. */
  face: number;
  plate?: { w: number; l: number; t: number };
  color: string;
}) {
  const w = (plate?.w ?? 100) * MM;
  const l = Math.max((plate?.l ?? 160) * MM, 0.14);
  const t = (plate?.t ?? 10) * MM;
  return (
    <group position={[at.x * MM, at.y * MM, at.z * MM]} rotation={[0, -rad(headingDeg), 0]}>
      <mesh position={[0, 0.02 - l / 2, face - t / 2]}>
        <boxGeometry args={[w, l, t]} />
        <Steel color={color} />
        <Ink />
      </mesh>
      {[0.02 - l * 0.25, 0.02 - l * 0.8].map((dy, b) => (
        <mesh key={b} position={[0, dy, face - t - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.007, 0.007, 0.012, 10]} />
          <Steel color="#8f9498" />
          <Ink />
        </mesh>
      ))}
    </group>
  );
}

/** Adjoining building wall at a connected run end (customer measures to it). */
function WallBlock({
  at,
  headingDeg,
  baseY,
  railH,
}: {
  at: THREE.Vector3;
  headingDeg: number;
  baseY: number;
  railH: number;
}) {
  const h = railH + 0.95;
  return (
    <group position={[at.x, baseY, at.z]} rotation={[0, -rad(headingDeg), 0]}>
      <mesh position={[0, -0.12 + h / 2, 0.35]}>
        <boxGeometry args={[0.12, h, 2.2]} />
        <Steel color="#e6e2d8" metalness={0} roughness={0.96} />
        <Ink />
      </mesh>
    </group>
  );
}

const GLASS: Record<RailingConfig["glassType"], { color: string; opacity: number }> = {
  clear: { color: "#a9c0cc", opacity: 0.22 },
  satin: { color: "#e9ebe9", opacity: 0.6 },
  tinted: { color: "#4f5e66", opacity: 0.38 },
};

// Memoized: the scene subtree only rebuilds when the config/geometry actually
// change, not when the parent re-renders for unrelated reasons (checkout fields,
// share input). The tech-view toggle flows through TechCtx, so material changes
// still propagate to the context consumers below.
const Railing = memo(function Railing({ cfg, derived, tp }: { cfg: RailingConfig; derived: DerivedRailing; tp?: TypeProfile }) {
  // Galvanized-only finish renders as zinc grey regardless of the RAL choice.
  const color = cfg.finish === "galvanized" ? "#a6abae" : RAL[cfg.color];
  const hrColor = cfg.handrail === "round_inox" ? INOX : color;
  const substrate = cfg.substrate ?? "concrete_top";
  const sideMount = (cfg.mounting ?? "top") === "side";
  const parapet = substrate === "concrete_parapet";
  // Substrate material: concrete grey, sandstone, or wood joist edge.
  const slabColor = substrate === "wood_side" ? "#a87f55" : substrate === "stone_top" ? "#c6bfae" : "#dddad2";
  // Side mounting: the slab's edge face sits at the railing line (with the
  // configured offset variant); top mounting keeps the slab under the posts.
  const faceOffset = sideMount ? (substrate === "concrete_side_offset" ? 0.1 : 0.04) : -0.05;
  const glass = GLASS[cfg.glassType];
  const recipe = tp?.recipe;
  const hrDepth = recipe ? railDepth(recipe.handrail.profile, recipe.handrail.size) : 0;
  const brDepth = recipe ? railDepth(recipe.bottomRail.profile, recipe.bottomRail.size) : 0;
  const walls = cfg.walls ?? "none";

  return (
    <group>
      {derived.segments.map((seg, i) => {
        const start = v(seg.start);
        const end = v(seg.end);
        const perp = new THREE.Vector3(-Math.sin(rad(seg.headingDeg)), 0, Math.cos(rad(seg.headingDeg)));

        // Floor: flat slab, or treads for stair segments. The segment axis is
        // the nosing line, so treads sit below it and members never clip them.
        const slabs: React.ReactNode[] = [];
        if (!seg.steps) {
          // Parapet: the main slab sits lower; a concrete band rises to the
          // railing base and carries the side fixing.
          const slabTop = parapet ? start.y - 0.35 : start.y;
          const mid = start.clone().add(end).multiplyScalar(0.5).add(perp.clone().multiplyScalar(faceOffset + 0.65));
          slabs.push(
            <mesh key="slab" position={[mid.x, slabTop - 0.06, mid.z]} rotation={[0, -rad(seg.headingDeg), 0]}>
              <boxGeometry args={[(seg.input.length * MM) + 0.08, 0.12, 1.3]} />
              <Steel color={slabColor} metalness={0} roughness={0.95} />
              <Ink />
            </mesh>,
          );
          if (parapet) {
            const pmid = start.clone().add(end).multiplyScalar(0.5).add(perp.clone().multiplyScalar(faceOffset + 0.09));
            slabs.push(
              <mesh key="parapet" position={[pmid.x, start.y - 0.175, pmid.z]} rotation={[0, -rad(seg.headingDeg), 0]}>
                <boxGeometry args={[(seg.input.length * MM) + 0.08, 0.35, 0.18]} />
                <Steel color={slabColor} metalness={0} roughness={0.95} />
                <Ink />
              </mesh>,
            );
          }
        } else {
          const { count, len } = seg.steps;
          for (let s = 0; s < count; s++) {
            const t0 = s * len;
            const t1 = (s + 1) * len;
            const px = seg.start.x + seg.dir.x * ((t0 + t1) / 2);
            const pz = seg.start.z + seg.dir.z * ((t0 + t1) / 2);
            const topY = seg.start.y + seg.dir.y * t0;
            slabs.push(
              <mesh
                key={`st${s}`}
                position={[px * MM + perp.x * 0.6, topY * MM - 0.09, pz * MM + perp.z * 0.6]}
                rotation={[0, -rad(seg.headingDeg), 0]}
              >
                <boxGeometry args={[((t1 - t0) * MM) * Math.cos(rad(seg.slopeDeg)), 0.18, 1.3]} />
                <Steel color={slabColor} metalness={0} roughness={0.95} />
                <Ink />
              </mesh>,
            );
          }
        }

        const railTopA = start.clone().setY(start.y + cfg.height * MM);
        const railTopB = end.clone().setY(end.y + cfg.height * MM);
        const railBotA = start.clone().setY(start.y + (cfg.bottomGap + 20) * MM);
        const railBotB = end.clone().setY(end.y + (cfg.bottomGap + 20) * MM);

        const panelH = (cfg.height - cfg.bottomGap - (cfg.handrail === "none" ? 0 : 40)) * MM;

        if (recipe) {
          const inf = recipe.infill;
          const memberR = Math.max(0.002, (inf.memberSize / 2) * MM);
          const infColor = inf.kind === "cables" ? INOX : color;
          const panelMat =
            inf.kind === "glass" ? (
              <meshStandardMaterial color={glass.color} transparent opacity={glass.opacity} roughness={0.15} metalness={0.05} />
            ) : (
              <Steel color={color} metalness={0.4} roughness={0.55} />
            );
          const recipePanelH = (cfg.height - cfg.bottomGap - hrDepth) * MM;
          // Handrail centred under the guard height, bottom rail on top of the gap.
          const hrA = start.clone().setY(start.y + (cfg.height - hrDepth / 2) * MM);
          const hrB = end.clone().setY(end.y + (cfg.height - hrDepth / 2) * MM);
          const brA = start.clone().setY(start.y + (cfg.bottomGap + brDepth / 2) * MM);
          const brB = end.clone().setY(end.y + (cfg.bottomGap + brDepth / 2) * MM);

          return (
            <group key={seg.input.id + i}>
              {slabs}
              {/* handrail / bottom rail per recipe */}
              {recipe.handrail.profile === "rect" ? (
                <RectRail a={hrA} b={hrB} w={recipe.handrail.size} d={recipe.handrail.depth ?? recipe.handrail.size} headingDeg={seg.headingDeg} color={hrColor} />
              ) : (
                recipe.handrail.profile !== "none" && (
                  <Member a={hrA} b={hrB} radius={(recipe.handrail.size / 2) * MM} color={hrColor} box={recipe.handrail.profile === "flat"} />
                )
              )}
              {recipe.bottomRail.profile === "rect" ? (
                <RectRail a={brA} b={brB} w={recipe.bottomRail.size} d={recipe.bottomRail.depth ?? recipe.bottomRail.size} headingDeg={seg.headingDeg} color={color} />
              ) : (
                recipe.bottomRail.profile !== "none" && (
                  <Member a={brA} b={brB} radius={Math.max(0.006, (recipe.bottomRail.size / 3) * MM)} color={color} box={recipe.bottomRail.profile === "flat"} />
                )
              )}
              {/* base profile when the design has no posts */}
              {recipe.post.profile === "none" && (
                <Member a={start.clone().setY(start.y + 0.055)} b={end.clone().setY(end.y + 0.055)} radius={0.048} color={color} box />
              )}
              {/* posts, welded between base plate and handrail underside;
                  side mounting runs them down the slab edge to the plate */}
              {seg.posts.map((p, k) => (
                <Post
                  key={k}
                  base={sideMount ? { ...p.base, y: p.base.y - (recipe.plate?.l ?? 160) + 25 } : p.base}
                  top={p.top}
                  size={recipe.post.size}
                  depth={recipe.post.depth}
                  round={recipe.post.profile === "round"}
                  headingDeg={seg.headingDeg}
                  color={color}
                />
              ))}
              {/* fixing: base plates on the slab, or vertical side plates */}
              {seg.plates.map((pl, k) =>
                sideMount ? (
                  <SidePlate key={`pl${k}`} at={pl.at} headingDeg={pl.headingDeg} face={faceOffset} plate={recipe.plate} color={color} />
                ) : (
                  <BasePlate key={`pl${k}`} at={pl.at} headingDeg={pl.headingDeg} postSize={recipe.post.size} plate={recipe.plate} color={color} />
                ),
              )}
              {/* post caps (designs without a handrail) */}
              {seg.caps.map((c, k) => (
                <mesh key={`c${k}`} position={[c.x * MM, c.y * MM + 0.003, c.z * MM]} rotation={[0, -rad(seg.headingDeg), 0]}>
                  {recipe.post.profile === "round" ? (
                    <cylinderGeometry args={[(recipe.post.size / 2) * MM * 1.08, (recipe.post.size / 2) * MM * 1.08, 0.006, 16]} />
                  ) : (
                    <boxGeometry args={[recipe.post.size * MM * 1.08, 0.006, recipe.post.size * MM * 1.08]} />
                  )}
                  <Steel color={color} />
                  <Ink />
                </mesh>
              ))}
              {/* vertical bars / 45° flats */}
              {seg.bars.map((b, k) =>
                inf.kind === "vertical_flats" ? (
                  <FlatBar
                    key={k}
                    bottom={b.bottom}
                    top={b.top}
                    w={inf.flatW ?? 40}
                    t={inf.flatT ?? inf.memberSize}
                    angleDeg={inf.angleDeg ?? 45}
                    headingDeg={seg.headingDeg}
                    color={infColor}
                  />
                ) : (
                  <Member key={k} a={v(b.bottom)} b={v(b.top)} radius={memberR} color={infColor} />
                ),
              )}
              {/* horizontal rails / cables, framed per field */}
              {seg.rails.map((r, k) => (
                <Member key={`r${k}`} a={v(r.bottom)} b={v(r.top)} radius={memberR} color={infColor} />
              ))}
              {/* swaged cable terminals + tensioners at end posts */}
              {seg.tensioners.map((tn, k) => (
                <Member key={`t${k}`} a={v(tn.at)} b={v(tn.end)} radius={Math.max(0.007, memberR * 2.6)} color="#9a9ea1" />
              ))}
              {/* glass point-fixing clamps */}
              {seg.clamps.map((cl, k) => (
                <mesh key={`cl${k}`} position={v(cl.at)} rotation={[0, -rad(cl.headingDeg), 0]}>
                  <boxGeometry args={[0.03, 0.055, 0.042]} />
                  <Steel color={INOX} metalness={0.5} roughness={0.35} />
                  <Ink />
                </mesh>
              ))}
              {/* glass / sheet panels */}
              {seg.panels.map((p, k) => {
                const mid = v(p.a).add(v(p.b)).multiplyScalar(0.5);
                return (
                  <mesh key={`p${k}`} position={[mid.x, mid.y + recipePanelH / 2, mid.z]} rotation={[0, -rad(seg.headingDeg), 0]}>
                    <boxGeometry args={[p.width * MM, recipePanelH, Math.max(0.008, inf.memberSize * MM)]} />
                    {panelMat}
                    <Ink />
                  </mesh>
                );
              })}
            </group>
          );
        }

        return (
          <group key={seg.input.id + i}>
            {slabs}
            {cfg.system === "bars" ? (
              <>
                {/* handrail + bottom rail */}
                <Member a={railTopA} b={railTopB} radius={0.021} color={hrColor} box={cfg.handrail === "flat_steel"} />
                <Member a={railBotA} b={railBotB} radius={0.008} color={color} />
                {/* posts */}
                {seg.posts.map((p, k) => (
                  <mesh key={k} position={[p.base.x * MM, (p.base.y + cfg.height / 2) * MM, p.base.z * MM]}>
                    <boxGeometry args={[0.04, cfg.height * MM, 0.04]} />
                    <Steel color={color} />
                    <Ink />
                  </mesh>
                ))}
                {/* bars */}
                {seg.bars.map((b, k) => (
                  <Member key={k} a={v(b.bottom)} b={v(b.top)} radius={0.006} color={color} />
                ))}
              </>
            ) : (
              <>
                {/* continuous base profile */}
                <Member
                  a={start.clone().setY(start.y + 0.055)}
                  b={end.clone().setY(end.y + 0.055)}
                  radius={0.048}
                  color={color}
                  box
                />
                {/* optional handrail */}
                {cfg.handrail !== "none" && <Member a={railTopA} b={railTopB} radius={0.021} color={hrColor} />}
                {/* VSG panels */}
                {seg.panels.map((p, k) => {
                  const mid = v(p.a).add(v(p.b)).multiplyScalar(0.5);
                  return (
                    <mesh
                      key={k}
                      position={[mid.x, mid.y + panelH / 2, mid.z]}
                      rotation={[0, -rad(seg.headingDeg), 0]}
                    >
                      <boxGeometry args={[p.width * MM, panelH, 0.017]} />
                      <meshStandardMaterial color={glass.color} transparent opacity={glass.opacity} roughness={0.15} metalness={0.05} />
                      <Ink />
                    </mesh>
                  );
                })}
              </>
            )}
          </group>
        );
      })}
      {/* adjoining walls at connected run ends (5 cm clearance is deducted) */}
      {(walls === "start" || walls === "both") && derived.segments.length > 0 && (
        <WallBlock
          at={v(derived.segments[0].start).addScaledVector(
            new THREE.Vector3(Math.cos(rad(derived.segments[0].headingDeg)), 0, Math.sin(rad(derived.segments[0].headingDeg))),
            -(WALL_CLEARANCE * MM + 0.06),
          )}
          headingDeg={derived.segments[0].headingDeg}
          baseY={derived.segments[0].start.y * MM}
          railH={cfg.height * MM}
        />
      )}
      {(walls === "end" || walls === "both") && derived.segments.length > 0 && (
        <WallBlock
          at={v(derived.segments[derived.segments.length - 1].end).addScaledVector(
            new THREE.Vector3(
              Math.cos(rad(derived.segments[derived.segments.length - 1].headingDeg)),
              0,
              Math.sin(rad(derived.segments[derived.segments.length - 1].headingDeg)),
            ),
            WALL_CLEARANCE * MM + 0.06,
          )}
          headingDeg={derived.segments[derived.segments.length - 1].headingDeg}
          baseY={derived.segments[derived.segments.length - 1].end.y * MM}
          railH={cfg.height * MM}
        />
      )}

      {/* handrail miter elbows / stair bends at segment junctions */}
      {recipe &&
        recipe.handrail.profile !== "none" &&
        derived.joints.map((j, k) => (
          <mesh key={`j${k}`} position={v(j.at)}>
            {recipe.handrail.profile === "round" ? (
              <sphereGeometry args={[(recipe.handrail.size / 2) * MM * 1.12, 16, 16]} />
            ) : recipe.handrail.profile === "rect" ? (
              <boxGeometry
                args={[(recipe.handrail.depth ?? recipe.handrail.size) * MM * 1.05, hrDepth * MM * 1.1, (recipe.handrail.depth ?? recipe.handrail.size) * MM * 1.05]}
              />
            ) : (
              <boxGeometry args={[recipe.handrail.size * MM * 1.3, hrDepth * MM * 1.3, recipe.handrail.size * MM * 0.65]} />
            )}
            <Steel color={hrColor} />
            <Ink />
          </mesh>
        ))}
    </group>
  );
});

export default function Scene3D({
  cfg,
  derived,
  tp,
  techLabel = "CAD",
  sceneLabel = "3D view",
}: {
  cfg: RailingConfig;
  derived: DerivedRailing;
  tp?: TypeProfile;
  techLabel?: string;
  sceneLabel?: string;
}) {
  const controls = useRef(null);
  const [tech, setTech] = useState(false);
  const { center, dist } = useMemo(() => {
    const b = derived.bounds;
    const center = new THREE.Vector3(((b.minX + b.maxX) / 2) * MM, (b.maxY * MM) / 2 + 0.5, ((b.minZ + b.maxZ) / 2) * MM);
    const span = Math.max((b.maxX - b.minX) * MM, (b.maxZ - b.minZ) * MM, 2.5);
    return { center, dist: span * 1.15 + 2 };
  }, [derived]);

  return (
    <div className="relative h-full w-full">
      <button
        type="button"
        onClick={() => setTech((x) => !x)}
        className={`absolute right-3 top-3 z-10 border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${
          tech ? "border-ink bg-ink text-paper" : "border-hairline bg-white/85 text-graphite hover:border-stone"
        }`}
      >
        {techLabel}
      </button>
      <Canvas
        shadows={false}
        camera={{ position: [center.x + dist * 0.8, center.y + dist * 0.55, center.z + dist * 0.85], fov: 40 }}
        style={{ background: tech ? "#fcfcfa" : "#f1f0ec" }}
        role="img"
        aria-label={sceneLabel}
      >
        <ambientLight intensity={tech ? 1.05 : 0.85} />
        <directionalLight position={[4, 8, 5]} intensity={tech ? 0.75 : 1.1} />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} />
        <TechCtx.Provider value={tech}>
          <Railing cfg={cfg} derived={derived} tp={tp} />
        </TechCtx.Provider>
        <gridHelper args={[40, 80, "#d6d3ca", "#e6e4dc"]} position={[0, -0.121, 0]} />
        <OrbitControls ref={controls} target={center} enablePan={false} maxPolarAngle={Math.PI / 2.05} minDistance={1.2} maxDistance={40} />
      </Canvas>
    </div>
  );
}
