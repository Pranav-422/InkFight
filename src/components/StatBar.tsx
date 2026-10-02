import { Heart, Shield, Swords, Zap, type LucideIcon } from "lucide-react";
import { STAT_CAPS, type StatKey } from "@/lib/stats";

const META: Record<StatKey, { label: string; icon: LucideIcon; color: string }> = {
  hp: { label: "HP", icon: Heart, color: "bg-ink" },
  atk: { label: "ATK", icon: Swords, color: "bg-hit" },
  def: { label: "DEF", icon: Shield, color: "bg-guard" },
  spd: { label: "SPD", icon: Zap, color: "bg-gold" },
};

export function StatBar({ stat, value, compact = false }: { stat: StatKey; value: number; compact?: boolean }) {
  const { label, icon: Icon, color } = META[stat];
  const [, max] = STAT_CAPS[stat];
  const pct = Math.max(4, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <Icon className={`${compact ? "size-3" : "size-4"} shrink-0 text-muted`} />
      <span className={`w-8 shrink-0 font-semibold ${compact ? "text-[10px]" : "text-xs"} text-muted`}>{label}</span>
      <div className={`relative flex-1 overflow-hidden rounded-full bg-line ${compact ? "h-1.5" : "h-2.5"}`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-8 shrink-0 text-right tabular-nums font-semibold ${compact ? "text-xs" : "text-sm"}`}>{value}</span>
    </div>
  );
}
