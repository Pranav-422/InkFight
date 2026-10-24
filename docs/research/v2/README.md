# V2 Research Index

Index of fighting mechanics, archetype references, and animation research for InkFight v2.

## Used in

| File | Roadmap Target | Description |
|---|---|---|
| techniques.json | Sprint 2 | Multi-keyframe moves and frame data |
| specials.json | Sprint 2-3, Sprint 3 FX | New SpecialKinds implementation and VFX storyboards |
| animation.json | Sprint 2, Sprint 3 | Keyframes, idle loops, cosmetics, and hit recoil |
| bosses.json | Sprint 5 | 10-floor Dungeon boss progression and rewards |

## Files

### specials.json
- Contents: 35 special move archetypes across 7 categories.
- Key fields: id, name, mechanic_class, engine_block, timing_ticks, element_affinity, vfx_storyboard, inspired_by.
- Top recommendations:
  - Top 8 new blocks: command_grab, parry_counter, hook_pull, dash_through, crescent_projectile, mark_detonate, spin_drill, aura_boost.
  - Dungeon rewards: time_stop (page_freeze), domain (domain_page), volley (sky_volley), clone_strike (clone_rush), summon_strike (giant_palm).

### bosses.json
- Contents: 10 floor boss encounter designs with difficulty scaling, AI profiles, and passives.
- Key fields: floor, title, epithet, class, style, element, special, stats, cpu, passive, ai_personality, counterplay, teaches, reward, phase2.
- 10 floor titles:
  - Floor 1: Smudge
  - Floor 2: Cinder Knuckle
  - Floor 3: Volt Nib
  - Floor 4: Whiteout
  - Floor 5: Prince Vellum
  - Floor 6: Dawnstroke
  - Floor 7: Ferrule
  - Floor 8: Hardcover Atlas
  - Floor 9: Asymptote
  - Floor 10: The Redline Regent
- Top recommendations: Stat curve budget = 350 + 15*(floor-1) (cap 100 on floors 1-5, 115 on floors 6-10); Floor 10 dual-phase at 50% HP.

### animation.json
- Contents: 14 combat animation principles, 5 class idle breathing loops, 7 recoil profiles, and 6 cosmetic attachments.
- Key fields: keyframe_model, principles, idle_loops, recoil, cosmetics, references.
- Keyframe model: Array of keyframes `{ t, pose }` with easing curves (linear, easeIn, easeOut, easeInOut) replacing two-point wind/hit poses, with backwards-compatible auto-conversion.
- Hit-stop advice: Weight-scaled freeze frames on contact (blocked: 3, light: 5-6, medium: 7-9, heavy: 10-13, special: 14-16, KO: 18-20). Formula: freeze = clamp(round(4 + dealt * 0.35), 4, 13); special: 15.

### techniques.json
- Contents: 12 styles and 93 techniques: our 6 styles (Boxing, Taekwondo, Muay Thai, Karate, Street, Systema) plus 6 candidates (Capoeira, Wing Chun, Judo, Kung Fu, Kickboxing, Savate). There are 7-8 techniques per style.
- Key fields:
  - per technique: startup, active and recovery ticks; reach, height, damage multiplier, knock, launch, lunge and tip; 3-4 keyframes in the poses.ts angle convention
  - per style: stance pose, punch and kick chains, a mixed J-J-K / K-J-K finisher, and sources
- Frame data:
  - Every technique cites an analogous fighting-game move.
  - SF6 and SF5 numbers come from the FAT data export.
  - Tekken 8 numbers come from wavu.wiki, scaled by 0.42 to our tempo.
  - 19 techniques were adjusted by hand, and each adjustment is noted.
- Gaps:
  - Savate and Systema use stand-in characters.
  - Tekken moves have no range data, so their reach is estimated.
  - Throws need grab rules the sim doesn't have yet.
  - Knock, launch and lunge are design guesses, not frame data.
- Used for: multi-keyframe MOVE_POSES and new chain moves in Sprint 2. Re-tune with scripts/balance.ts after adding moves.
