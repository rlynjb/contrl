export default function ProgressRing({ done, total, color, size = 34 }: { done: number; total: number; color: string; size?: number }) {
  const s = 2.5, r = (size - s) / 2, c = 2 * Math.PI * r
  return (
    <svg className="progress-ring" width={size} height={size}>
      <circle className="progress-ring__track" cx={size/2} cy={size/2} r={r} fill="none" stroke="#141420" strokeWidth={s} />
      <circle className="progress-ring__fill" cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
        strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done/total : 0))}
        strokeLinecap="round" />
    </svg>
  )
}
