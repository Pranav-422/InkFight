import { Brain, Heart, Shield, Swords, Wind, Zap, type LucideIcon } from "lucide-react";
import { STAT_CAPS, type StatKey } from "@/lib/stats";

const META: Record<StatKey, { label: string; icon: LucideIcon; color: string }> = {
  hp: { label: "HP", icon: Heart, color: "#171717" },
  atk: { label: "STR", icon: Swords, color: "#e5482d" }, // strength: physical damage
  def: { label: "DUR", icon: Shield, color: "#2f5be0" }, // durability: how little damage it takes
  spd: { label: "SPD", icon: Zap, color: "#f2b705" },
  agi: { label: "AGI", icon: Wind, color: "#16a34a" }, // jump, air control, hit recovery
  iq: { label: "IQ", icon: Brain, color: "#7c3aed" }, // energy gain, magic damage
};

export function StatBar({ stat, value, compact = false }: { stat: StatKey; value: number; compact?: boolean }) {
  const { label, icon: Icon, color } = META[stat];
  const [, max] = STAT_CAPS[stat];
  const pct = Math.max(4, (value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <Icon className={`${compact ? "size-3" : "size-4"} shrink-0 text-muted`} />
      <span className={`w-8 shrink-0 font-display font-extrabold tracking-wider ${compact ? "text-[10px]" : "text-xs"}`}>{label}</span>
      {/* A segmented meter in an ink track. */}
      <div className={`relative flex-1 overflow-hidden border-2 border-ink bg-white ${compact ? "h-2.5" : "h-3.5"}`}>
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 7px, transparent 7px 9px)` }}
        />
      </div>
      <span className={`w-8 shrink-0 text-right font-display font-extrabold tabular-nums ${compact ? "text-xs" : "text-sm"}`} style={{ color }}>
        {value}
      </span>
    </div>
  );
}
