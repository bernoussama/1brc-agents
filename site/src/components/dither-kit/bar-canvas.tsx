"use client"

import { useEffect, useMemo, useRef } from "react"
import { useChart } from "./chart-context"
import {
  backingSize,
  bloomLayerStyle,
  clamp01,
  easeOutCubic,
  paintColumn,
  paintRow,
  prefersReducedMotion,
} from "./dither-paint"

type Bars = { tip: number[]; base: number[] } // per data index, in backing cells along the value axis

// Fraction of the timeline spent staggering bar starts — the rest is each bar's
// own grow window, so the rise sweeps across the chart as a wave.
const STAGGER = 0.55

/**
 * Dither canvas for bar charts. Each category owns a band; grouped series split
 * it into side-by-side bars, stacked series share its full width and pile in y.
 * Every bar is filled with the shared ordered dither. Bars grow from their base
 * toward the value in a staggered wave (eased), and the hovered category lifts
 * while the rest dim.
 *
 * Vertical layout: categories on X, values on Y, grow upward.
 * Horizontal layout: categories on Y, values on X, grow rightward.
 */
export function BarCanvas() {
  const ctx = useChart()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)

  const { width, height } = ctx.plot
  const { cols, rows } = backingSize(width, height)
  const { ready, configKeys, bands, y } = ctx
  const horizontal = ctx.layout === "horizontal"

  // Memoized: per-series tip/base along the value axis in backing cells.
  const targets = useMemo(() => {
    const out: Record<string, Bars> = {}
    if (!ready) return out
    const span = horizontal ? width || 1 : height || 1
    const cells = horizontal ? cols : rows
    for (const key of configKeys) {
      const band = bands[key]
      if (!band) continue
      out[key] = {
        tip: band.map((b) => (y(b[1]) / span) * (cells - 1)),
        base: band.map((b) => (y(b[0]) / span) * (cells - 1)),
      }
    }
    return out
  }, [ready, configKeys, bands, y, height, width, rows, cols, horizontal])

  const state = useRef(ctx)
  const targetsRef = useRef(targets)
  useEffect(() => {
    state.current = ctx
    targetsRef.current = targets
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const c = canvas?.getContext("2d")
    if (!(canvas && c) || cols <= 0 || rows <= 0) return
    canvas.width = cols
    canvas.height = rows

    const bloomCanvas = bloomRef.current
    const bloomCtx = bloomCanvas?.getContext("2d") ?? null
    if (bloomCanvas) {
      bloomCanvas.width = cols
      bloomCanvas.height = rows
    }

    const reduce = prefersReducedMotion()
    const animate = state.current.animate && !reduce
    const duration = state.current.animationDuration
    const fx = cols / Math.max(width, 1)
    const fy = rows / Math.max(height, 1)
    const isHorizontal = state.current.layout === "horizontal"

    const barProgress = (i: number, len: number, prog: number) => {
      if (!animate) return 1
      const start = len > 1 ? (i / (len - 1)) * STAGGER : 0
      return easeOutCubic(clamp01((prog - start) / (1 - STAGGER)))
    }

    const paint = (prog: number) => {
      const s = state.current
      c.clearRect(0, 0, cols, rows)
      const stacked = s.stackType === "stacked" || s.stackType === "percent"
      const keys = s.configKeys
      keys.forEach((key, si) => {
        const t = targetsRef.current[key]
        if (!t) return
        const seed = s.seedOf(key)
        const variant = s.seriesSpecs[key]?.variant ?? "gradient"
        const emphasis = s.selectedDataKey ?? s.focusDataKey
        const selDim = emphasis !== null && emphasis !== key ? 0.3 : 1
        for (let i = 0; i < s.dataLength; i++) {
          const bp = barProgress(i, s.dataLength, prog)
          const base = t.base[i] ?? (isHorizontal ? 0 : rows - 1)
          const grown = base + ((t.tip[i] ?? base) - base) * bp
          const active = s.hoverIndex === i
          const hoverDim =
            s.hoverIndex != null && !active && s.isMouseInChart ? 0.5 : 1
          const slot = s.barSlot(i, si, keys.length)

          if (isHorizontal) {
            const left = Math.min(grown, base)
            const right = Math.max(grown, base)
            const r0 = Math.round(slot.y * fy)
            const r1 = Math.round((slot.y + slot.height) * fy)
            for (let row = r0; row < r1; row++) {
              paintRow(c, row, left, right, seed, {
                variant,
                intensity: intensity + (active ? 0.4 : 0),
                dim: selDim * hoverDim,
                stacked,
              })
            }
          } else {
            const top = Math.min(grown, base)
            const bottom = Math.max(grown, base)
            const c0 = Math.round(slot.x * fx)
            const c1 = Math.round((slot.x + slot.width) * fx)
            for (let x = c0; x < c1; x++) {
              paintColumn(c, x, top, bottom, seed, {
                variant,
                intensity: intensity + (active ? 0.4 : 0),
                dim: selDim * hoverDim,
                stacked,
              })
            }
          }
        }
      })
    }

    let raf = 0
    let animStart = 0
    let lastProg = -1
    let lastRevision = state.current.revision
    let entranceReported = !animate
    let intensity = 0
    let needsFill = true
    let lastPaintSig = ""
    let lastSelected: string | null | undefined = Symbol() as never
    let lastHover: number | null | undefined = Symbol() as never

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const s = state.current
      if (!s.ready) return
      if (bloomCtx) {
        const on =
          s.bloom !== "off" &&
          (!s.bloomOnHover || s.isMouseInChart || s.hovered)
        if (on) {
          bloomCtx.clearRect(0, 0, cols, rows)
          bloomCtx.drawImage(canvas, 0, 0)
        }
      }
      if (s.revision !== lastRevision) {
        lastRevision = s.revision
        animStart = 0
        lastProg = -1
        entranceReported = false
      }
      if (!animStart) animStart = now
      const prog = animate ? Math.min(1, (now - animStart) / duration) : 1
      if (prog >= 1 && !entranceReported) {
        entranceReported = true
        s.markEntranceDone()
      }

      if (prog !== lastProg) {
        lastProg = prog
        needsFill = true
      }
      const emphasisNow = s.selectedDataKey ?? s.focusDataKey
      if (emphasisNow !== lastSelected) {
        lastSelected = emphasisNow
        needsFill = true
      }
      if (s.hoverIndex !== lastHover) {
        lastHover = s.hoverIndex
        needsFill = true
      }
      const itTarget = s.isMouseInChart || s.hovered ? 1 : 0
      if (Math.abs(intensity - itTarget) > 0.001) {
        intensity += (itTarget - intensity) * (reduce ? 1 : 0.16)
        needsFill = true
      } else intensity = itTarget

      const paintSig = `${s.layout}|${s.stackType}|${s.configKeys
        .map((k) => s.seriesSpecs[k]?.variant ?? "")
        .join(",")}`
      if (paintSig !== lastPaintSig) {
        lastPaintSig = paintSig
        needsFill = true
      }

      if (!needsFill) return
      paint(prog)
      needsFill = false
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [cols, rows, width, height, horizontal])

  const bloomActive = ctx.bloomOnHover
    ? ctx.isMouseInChart || ctx.hovered
    : true
  const bloom = bloomLayerStyle(ctx.bloom, bloomActive)
  const pos = {
    left: ctx.margins.left,
    top: ctx.margins.top,
    width,
    height,
  } as const

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ ...pos, imageRendering: "pixelated" }}
      />
      <canvas
        ref={bloomRef}
        className="pointer-events-none absolute"
        style={{
          ...pos,
          transition: "opacity 220ms ease",
          ...(bloom ?? { opacity: 0 }),
        }}
      />
    </>
  )
}
