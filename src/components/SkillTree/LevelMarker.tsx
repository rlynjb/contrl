export default function LevelMarker({ lv, filled, color }: { lv: number; filled: boolean; color: string }) {
  return (
    <div
      className={`level-marker${filled ? ' level-marker--filled' : ''}`}
      style={filled ? {
        background: color,
        borderColor: color,
        boxShadow: `0 0 12px ${color}40`,
      } : undefined}
    >{lv}</div>
  )
}
