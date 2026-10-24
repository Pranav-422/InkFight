import { Hammer, Hand, Shield, Sparkles, Sword, type LucideIcon } from "lucide-react";
import { normClass, type CharacterClass } from "@/lib/stats";

const ICONS: Record<CharacterClass, LucideIcon> = {
  Sword,
  Mace: Hammer,
  Tank: Shield,
  Attacker: Sparkles,
  Fighter: Hand,
};

export function ClassBadge({ cls, size = "sm" }: { cls: string; size?: "sm" | "md" }) {
  const Icon = ICONS[normClass(cls)] ?? Hand;
  const big = size === "md";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-ink text-white font-medium ${
        big ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Icon className={big ? "size-4" : "size-3"} strokeWidth={2.25} />
      {cls}
    </span>
  );
}
