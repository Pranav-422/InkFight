# InkFight — Arena 1: Inferno Crater

**Document type:** Arena design specification  
**Version:** 1.0  
**Status:** Visual scenario and five-scene progression locked; detailed balancing and implementation values remain to be tested.  
**Match duration:** 5 minutes (300 seconds)  
**Visual direction:** Hand-drawn comic-book volcanic arena, based on the approved Volcano Crater reference.

---

## 1. Arena Overview

**Inferno Crater** is InkFight's first hazard-driven arena: a dramatic volcanic valley with towering jagged cliffs, floating rock formations, hanging chains, glowing lava rivers, and one enormous volcano in the distance. The arena should feel beautiful and imposing rather than cluttered.

The defining idea is that **the arena escalates while the fight continues**. Fighters begin on a stable combat floor under a relatively clean twilight/evening sky. The environment gradually grows hotter, the ground cracks and leaks small amounts of lava, the sky turns red-black as the volcano nears eruption, and volcanic debris falls. In the final phase, boulders rise from the ground and form a climbable route to an elevated platform where the final fight takes place while lava rises below.

This is not five separate maps. It is **one arena that changes through five scenes**, keeping a consistent visual geography so the player understands that the same place is becoming more dangerous.

### Core pillars

1. **Preserve the approved look.** Keep the tall, dramatic cliffs, jagged black rock silhouettes, chains, floating rocks, lava valley, and giant volcano from the reference.
2. **Escalate gradually.** Early effects are restrained; large eruptions and the elevated final platform arrive later.
3. **Never pause the fight for an environment phase.** The match timer, movement, attacks, defence, and player-versus-player combat continue through every scene transition.
4. **Fair hazards.** Damage-causing events must have readable visual and/or audio warnings and a dodge opportunity.
5. **Terrain matters.** Rising boulders and elevated platforms must be real gameplay geometry, not just decoration painted into the background.
6. **Constellations can alter the strategy.** A supporting constellation may bear a plausibility cost to grant a buff, such as improved movement through lava.

---

## 2. Visual Direction

### 2.1 Main environment

- A wide volcanic valley viewed from a fighting-game camera.
- Tall, steep, jagged cliffs on both sides; these should remain visually impressive throughout the match.
- One large, unmistakable volcano in the distance. It should dominate the skyline without hiding the fighters.
- Lava rivers and glowing fissures below and around the playable ground.
- Floating or suspended boulders, ruined stone structures, and chains around the outer environment.
- Large readable rock shapes with a hand-inked comic-book treatment.
- Strong silhouette contrast between the fighters, the foreground floor, and the background scenery.

### 2.2 Art style

- Graphic-novel / comic-book illustration with bold ink outlines and textured rock surfaces.
- Charcoal and black volcanic stone contrasted with molten orange, red, and gold.
- Controlled smoke, embers, and atmospheric haze. Avoid filling the whole screen with particles.
- The existing game fighters must remain the visual focus during combat.
- Keep the arena's composition consistent across all five scenes. Use lighting, weather, cracks, debris, and platforms to show progression instead of changing the entire layout randomly.

### 2.3 Weather and colour progression

| Scene | Sky and lighting direction | Intensity |
|---|---|---|
| 1 — Arrival | Clean blue twilight or warm yellow-orange evening | Calm, readable |
| 2 — Heatwave | The same sky warms slightly; visible heat shimmer | Mildly uncomfortable, still clear |
| 3 — Ground Fracture | Orange glow increases around floor cracks and lava leaks | Dangerous but controlled |
| 4 — Volcanic Warning | Red-black sky, dark cloud mass, stronger volcano glow, falling volcanic meteorites | Dramatic warning stage |
| 5 — Elevated Final Arena | Eruption-lit red/orange environment, rising lava below, elevated rock platforms | Highest intensity |

The exact initial sky variant (blue twilight versus yellow-orange evening) can be selected during final art direction. Both fit the approved concept; do not mix them into a noisy multicolour sky.

---

## 3. Five-Scene Match Structure

The full match lasts exactly **5:00**. Scene changes are environmental state changes, not pauses or rounds. The timer continues uninterrupted.

| Scene | Match time | Duration | Main event |
|---|---:|---:|---|
| 1. Arrival | 00:00–00:30 | 30 sec | Normal combat on stable ground |
| 2. Heatwave | 00:30–01:00 | 30 sec | Heat distortion and heat-related effects |
| 3. Ground Fracture | 01:00–01:45 | 45 sec | Gradually spreading cracks and small lava leaks |
| 4. Volcanic Warning | 01:45–02:30 | 45 sec | Red-black sky, near-eruption mood, volcanic meteorites/debris |
| 5. Elevated Final Arena | 02:30–05:00 | 150 sec | Boulder platforms rise; fighters climb to a higher arena; lava rises below |

**Important interpretation:** “Break” between phases means the previous hazard subsides or the arena enters a transition state. It does **not** mean the fighters stop fighting, controls are disabled, or the match timer pauses.

---

## 4. Scene Details

### Scene 1 — Arrival (00:00–00:30)

**Purpose:** Establish the arena's beauty and let players start fighting under normal conditions.

**Visuals**
- The full volcanic valley is visible and relatively calm.
- Towering black cliffs, floating rocks, chains, and the large distant volcano establish the environment.
- The sky uses clean blue twilight or warm evening yellow-orange.
- Lava rivers may glow in the far background, but the playable ground is stable.
- Ambient particles should be sparse: a few embers or subtle smoke are enough.

**Gameplay**
- Normal movement, jumps, attacks, blocks, combos, and constellation abilities are available according to the existing combat rules.
- No active environmental damage is required in this opening scene.
- Both fighters should have a fair opportunity to approach and engage.

**Scene exit**
- At 00:30, introduce heat shimmer and the colour temperature shift that signals Scene 2.
- Do not hard-cut to a different map.

### Scene 2 — Heatwave (00:30–01:00)

**Purpose:** Communicate that the volcano is beginning to affect the arena without overwhelming the match.

**Visuals**
- Subtle heat distortion near the ground and lava channels.
- Warmer highlights on stone edges; a slight increase in haze and embers.
- Keep the distant cliffs and volcano recognisable.
- Avoid heavy blur, full-screen distortion, or an unreadable orange overlay.

**Gameplay**
- Combat continues normally.
- Heat can affect fighters, but its exact implementation remains a balancing decision: for example, small periodic health damage, a temporary stat effect, or a heat-related vulnerability.
- Do not silently decide final damage values in the art layer. Gameplay rules must be configured and tested separately.
- A heat-resistant constellation buff may reduce the effect, if that buff is enabled in the final design.

**Scene exit**
- At 01:00, the visible heat shimmer can ease slightly while the ground begins to tremble and faint cracks appear.
- The fight and timer continue through this transition.

### Scene 3 — Ground Fracture (01:00–01:45)

**Purpose:** Make the ground itself a growing, readable threat.

**Visual progression**
1. Fine cracks appear in a few visible areas of the stone floor.
2. The cracks gradually widen and glow orange from below.
3. Small amounts of lava leak or bubble through the cracks.
4. Over the 45-second scene, the amount and frequency of leakage increase gradually.
5. The floor should not immediately become a full lava sea. The effect is deliberately restrained and incremental.

**Gameplay**
- Lava contact can damage health and reduce attack power, as proposed by the player. Whether attack reduction is temporary, cumulative, or capped is not yet locked.
- Keep hazardous areas clearly marked before they become damaging.
- Players should have enough room to move away, jump over a crack, or reposition.
- Do not allow random cracks to appear directly under a fighter with no warning.
- Avoid repeated unavoidable damage that prevents a player from recovering or counterattacking.

**Visual readability**
- Use bright orange glow against dark stone to show where lava is leaking.
- Restrict active cracks to a manageable number of zones at once.
- The floor and fighter silhouettes must remain readable.

**Scene exit**
- Near 01:45, the sky begins losing its warm evening colour and transitions towards deep red and black.
- Volcanic rumble increases, indicating the volcano is nearing eruption.

### Scene 4 — Volcanic Warning (01:45–02:30)

**Purpose:** Deliver the dramatic pre-eruption sequence and prepare players for the vertical escape.

**Visuals**
- The environment shifts to a dark red-black sky.
- The volcano glows more intensely and releases a thick plume of smoke and ash.
- Volcanic meteorites or debris begin falling through the arena space.
- The original tall cliffs, chains, floating rocks, and valley remain visible where possible.
- The overall scene should be dramatic, but the fighters and landing zones cannot disappear into darkness.

**Gameplay**
- Combat continues throughout the 45 seconds.
- Falling debris must have readable telegraphs: a shadow, ground marker, brief glint, warning sound, or a combination of these.
- Impacts should happen in defined areas with a fair dodge window.
- Avoid covering every safe route with debris simultaneously.
- The purpose is to build pressure and signal escalation, not to end the match with unavoidable environmental damage.

**Preparation for Scene 5**
- Show stronger ground tremors and visible movement in large rocks near the arena.
- A few boulders may shift or begin rising near the end of this scene, foreshadowing the platform route.
- Do not move players automatically or disable their inputs during the transition.

### Scene 5 — Elevated Final Arena (02:30–05:00)

**Purpose:** Move the battle into a higher, more dangerous space above the rising lava and make the final two-and-a-half minutes feel distinct from the opening.

**Core visual event**
- Large boulders and rock columns emerge upwards from the ground.
- They form a climbable sequence of platforms leading to a broad elevated arena.
- The two fighters climb or jump across the rising rocks while still being able to fight.
- The elevated arena becomes the primary location for the final duel.
- Lava below continues rising gradually, increasing pressure without instantly filling the entire playable space.

**Platform types**
- **Rising boulders:** Moving or emerging stepping stones used to gain height.
- **Narrow / tilted platforms:** Optional, more challenging landing surfaces. Use sparingly so they remain fair.
- **Large shared platform:** A wide enough elevated surface for both fighters to fight at once. This is the intended final-combat space.
- **Lower remaining surfaces:** Temporary fallback options, not permanent safe locations.

**Gameplay requirements**
- Platform tops must have real collision surfaces and support landing, jumping, and movement.
- Fighters must not be able to pass through a platform that is intended to be solid.
- Jumping and air control can receive a temporary boost during this phase to make climbing feasible. Exact values are not yet decided.
- The elevated platform should be large enough for both players to approach, retreat, and use normal combat moves.
- The camera must keep both fighters visible during climbing and final combat. It should not zoom or pan so aggressively that a player loses track of their character.
- Rising lava is a pressure mechanic. Provide enough time and route clarity to reach the elevated platform.

**Scene exit / end of match**
- The scene continues to 05:00 unless a normal knockout ends the match earlier.
- If the timer expires with neither fighter knocked out, the fighter with the higher remaining health wins.
- The rising lava must not override the health-based timeout rule through a scripted instant kill at exactly 05:00.

---

## 5. Terrain and Movement Requirements

The arena must not behave like a single flat strip if the design includes climbable platforms and forward/back movement.

### Recommended movement model

Use a bounded side-view / 2.5D combat space:

- **Horizontal axis:** move left and right across the fighting arena.
- **Depth axis:** move a limited distance forward and backward within the rectangular combat area.
- **Vertical motion:** jump and land on the floor or raised platforms.

This is a recommended implementation approach, not a claim that the existing game already supports it. Inspect the existing renderer and physics before choosing how to integrate it.

### Platform behaviour

- Platforms must have a defined position, height, width/depth, collision surface, and active state.
- A platform must not visually look solid while being non-collidable unless this is intentional and clearly communicated.
- Falling off a ledge needs a defined outcome: recovery, damage, respawn/return, or knockout. This rule remains to be decided before implementation.
- Moving platforms should have predictable movement timing.
- If a platform collapses, show a warning before collision is removed.
- Both fighters should be able to reach the final shared platform through a valid route.

### Camera and visibility

- Keep the same broad volcanic valley composition between scenes.
- Permit modest camera follow if required by the wider combat area, but keep both fighters visible as much as possible.
- Use depth scaling or layering only if compatible with the current renderer.
- Foreground rocks can frame the arena, but they must not obscure fighter silhouettes or critical hazard warnings.

---

## 6. Supporting Constellation and Plausibility

A fighter may select a supporting constellation before the battle. The constellation can be willing to bear a **plausibility cost** to grant a combat buff. This system connects character build choices with the arena's environmental challenges.

### Arena-specific example

**Lava Adaptation:** A supporting constellation accepts the plausibility cost and grants temporary improved movement on or near lava-affected surfaces. This could help a fighter navigate the ground-fracture phase or cross the route to the elevated arena.

### Design guardrails

- The buff should provide a meaningful strategic advantage without making the fighter completely immune to the arena.
- The cost and activation method must be shown clearly to the player.
- Avoid giving a buff a hidden or unpredictable penalty.
- Constellation effects must be communicated with a distinct but brief visual treatment, such as a star-shaped aura or trail, without hiding attack animations.
- The exact rules are still open: when the plausibility cost is paid, how long the buff lasts, whether it can be activated more than once, and whether all players have access to comparable options.

Other potential effects, such as ground-shake resistance or improved aerial control, may be considered later. They are proposals, not locked abilities.

---

## 7. Hazard Fairness and Combat Balance

These principles apply to every scene.

1. **Telegraph first, damage second.** Cracks glow before lava leakage becomes dangerous; debris is marked before impact; rising platforms show where they will emerge.
2. **Keep a viable route.** Do not make every floor section or platform hazardous at once.
3. **Limit unavoidable damage.** Hazards should reward awareness and movement rather than randomly deciding the winner.
4. **Prevent camping without forcing unfair movement.** The rising lava can gradually reduce safe ground, but should leave a feasible path to the final platform.
5. **Protect comeback opportunities.** If lava reduces attack power, define a cap or recovery rule so a player cannot become permanently unable to fight back.
6. **Respect player control.** Scene transitions and environmental animations must not silently lock input for long periods.
7. **Maintain readability.** Warning flashes and screen shake should be controllable/reduced for players who need it.

### Still to be balanced

- Whether heatwave deals health damage, applies a stat effect, or both.
- Lava-contact damage amount and tick interval.
- Attack-power reduction amount, duration, and maximum stack.
- Meteorite/debris spawn frequency, warning time, impact radius, and damage.
- Number and dimensions of rising platforms.
- Jump/air-control boost amount and duration.
- Lava rise speed and what happens if a fighter falls below the playable area.
- Exact constellation plausibility cost and buff duration.

Do not hardcode assumed values as final design decisions without playtesting.

---

## 8. Arena Audio and Feedback

Audio should communicate danger without drowning out combat sounds.

| Event | Suggested cue |
|---|---|
| Heatwave begins | Soft rising hiss / heat roar |
| Ground fractures | Low tremor followed by crisp stone cracks |
| Lava leaks | Bubbling or brief molten hiss |
| Volcanic warning | Deep distant rumble and increasing roar |
| Meteorite incoming | Short descending whistle or warning cue |
| Boulder/platform rises | Grinding rock and heavy stone movement |
| Elevated final arena | Strong eruption impact followed by ongoing volcanic ambience |
| Constellation buff activates | Short distinctive star-like tone plus visual cue |

These are recommendations. Every damaging event must also have a visual warning so players are not dependent on sound alone.

---

## 9. Asset and Renderer Plan

The five-scene storyboard is a **visual reference**, not a final, game-ready sprite sheet. It communicates progression and composition. It should not be used as one flattened gameplay background with the panels, labels, or scene dividers baked in.

### Suggested asset groups

1. **Base background:** distant sky, volcano, and far mountains/cliffs.
2. **Midground layers:** nearer rock formations, floating stones, ruins, and chains, separated when practical for parallax.
3. **Base fighting floor:** the normal starting ground and its visible top surface.
4. **Crack/lava overlay:** cracks and small lava leaks for Scene 3, animated or state-switched.
5. **Red-black warning atmosphere:** sky tint, ash, smoke and volcano glow changes for Scene 4.
6. **Meteorites/debris:** separate animated or reusable effect assets and impact indicators.
7. **Rising boulders/platforms:** separate sprites or scene objects with collision geometry for Scene 5.
8. **Elevated final platform:** a broad platform with a matching visible top surface and collision shape.
9. **Rising lava:** separate animated background/foreground treatment for the final phase, with gameplay boundaries defined independently.
10. **Constellation effect:** a separate, short-duration buff effect that does not cover combat readability.

### Layering principles

- Keep the fighter layer, foreground effects, hazards, and environment separate.
- Decorative background cliffs must not automatically become collidable objects.
- Every gameplay platform must have explicit collision data.
- Keep the ground reference consistent across scenes unless a deliberate terrain transition moves the active combat surface.
- Effects should be lightweight enough to preserve responsive combat and multiplayer synchronization.

---

## 10. Suggested Arena State Model

Implement this as a deterministic state progression rather than a collection of unrelated timers.

```text
SCENE_1_ARRIVAL       00:00–00:30
        ↓
SCENE_2_HEATWAVE      00:30–01:00
        ↓
SCENE_3_GROUND_FRACTURE 01:00–01:45
        ↓
SCENE_4_VOLCANIC_WARNING 01:45–02:30
        ↓
SCENE_5_ELEVATED_FINAL 02:30–05:00
        ↓
MATCH_END             At knockout or 05:00 timeout
```

### State-system requirements

- Use the authoritative match clock, not separate drifting countdowns for each visual effect.
- All clients in an online match must see the same scene phase and hazard events.
- Keep combat simulation active during every state transition.
- Make environmental hazard events deterministic or server-authoritative in multiplayer.
- Ensure that a knockout takes precedence over future scheduled arena events.
- Stop spawning new damaging hazards once the match has ended.
- At time-out, compare remaining health and award the match to the fighter with higher health.
- Define a tie case if both fighters have the same remaining health. Proposed default: a draw or a separately designed tiebreaker; this is not yet locked.

---

## 11. Acceptance Checklist

### Visual consistency
- [ ] The arena still looks like the approved Volcano Crater reference.
- [ ] Towering jagged cliffs, a large volcano, floating rocks/chains, and glowing lava remain identifiable.
- [ ] Scene 1 starts with a clean, readable twilight/evening palette.
- [ ] Scene 4 clearly transitions to red-black pre-eruption conditions.
- [ ] Effects do not overwhelm fighters or the combat HUD.

### Scene progression
- [ ] Total match duration is five minutes.
- [ ] All five scenes transition at the specified timestamps.
- [ ] The timer and combat continue through transitions.
- [ ] Scene 3's cracks and lava leakage build gradually rather than flooding the floor immediately.
- [ ] Scene 4 meteorites/debris provide fair warning.
- [ ] Scene 5 creates a climbable route to a shared elevated final platform.
- [ ] Lava rises gradually during the final scene.

### Gameplay correctness
- [ ] Platforms have proper collision and landing behaviour.
- [ ] Both fighters can reach and fight on the elevated platform.
- [ ] No environmental hazard causes unavoidable repeated damage.
- [ ] Jump or air-control changes are temporary and explicitly configured if implemented.
- [ ] Constellation buffs and their plausibility costs are communicated clearly.
- [ ] Knockout ends the match immediately.
- [ ] At 05:00, the fighter with higher remaining health wins if neither has been knocked out.

### Multiplayer and resilience
- [ ] Both clients see the same scene and hazard timing.
- [ ] Scene transitions do not desynchronise fighter positions or platforms.
- [ ] Disconnect/reconnect behaviour is consistent with the existing game.
- [ ] Ended matches do not continue to receive damaging hazard events.
- [ ] Performance remains stable with both fighters, platforms, particles and combat effects active.

---

## 12. Decisions Locked vs. Open

### Locked for this version

- Arena name: **Arena 1 — Inferno Crater**.
- Visual identity: comic-book volcanic valley with towering jagged cliffs, floating rocks/chains, lava, and a massive distant volcano.
- Match duration: five minutes.
- Five scenes and their durations: 30 sec, 30 sec, 45 sec, 45 sec, and 150 sec.
- Scene 1 is normal combat under a clean blue-twilight or warm evening look.
- Scene 2 is the heatwave phase.
- Scene 3 gradually introduces floor cracks and small amounts of leaking lava that can affect fighters.
- Scene 4 is a red-black pre-eruption warning with falling volcanic meteorites/debris.
- Scene 5 has boulders/platforms rising to make a climbable route toward an elevated arena, where the final battle continues while lava rises.
- Combat and the match timer never pause just because the environment changes.
- If the match reaches five minutes without a knockout, highest remaining health wins.
- Supporting constellations may bear a plausibility cost to grant buffs; improved lava movement is one intended example.

### Open for later balancing / technical design

- Exact damage amounts and tick rates.
- Whether heatwave damages health or changes stats, and by how much.
- Whether attack-power reduction from lava is temporary or stackable.
- Debris frequency and impact parameters.
- Platform size, movement, stability, and collapse rules.
- Exact jump/air-control boost.
- Lava rise curve and out-of-bounds handling.
- Constellation activation, plausibility cost, duration and cooldown.
- Tie-break rule if remaining HP is exactly equal.
- Exact blue-twilight versus warm-evening starting palette.
- Final engine-specific approach for collision, camera/depth movement, and multiplayer authority.

---

## Final Design Intent

Inferno Crater should start as a beautiful, readable volcanic arena, then become increasingly unstable in five clear stages. The player should feel the volcano's escalation through lighting, sound, cracks, meteorites, rising terrain, and lava—not through excessive visual clutter. The climax is the climb to the elevated shared platform, where both fighters must finish their duel above the rising lava.
