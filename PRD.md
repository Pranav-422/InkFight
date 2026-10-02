# Inkfight — Product Requirements Document

## 1. Summary
Inkfight turns a hand-drawn stick-figure character into a battle-ready fighter. A user photographs their drawing, uploads it to the web app, and an AI engine analyzes the artwork to generate a character — class, stats, and a special move. Two characters then auto-battle in an animated arena, and results feed a shared leaderboard.

## 2. Problem
- Hand-drawn characters have no path into an interactive, competitive experience — they stay on paper.
- Existing "AI draws your character" apps (Draw Brawl, Image Battle, DrawFighters) assign stats in a way that feels arbitrary — the link between what you drew and how strong you are isn't transparent.
- No simple browser-based way exists for friends to scan drawings and compete on one shared leaderboard.

## 3. Goals
- Let anyone turn a photo of a stick-figure drawing into a playable fighter in under a minute.
- Make the stat-generation logic feel fair and explainable, not random.
- Deliver a fun, shareable, friend-vs-friend loop (draw → scan → battle → rank).

## 4. Non-Goals (v1)
- No real-time multiplayer (battles are async: two already-generated characters fight, not live PvP input).
- No mobile native app — browser only.
- No user accounts/auth system beyond a simple name/handle for the leaderboard (unless stated otherwise later).
- No monetization.

## 5. Core User Flow
1. **Upload** — User photographs their stick-figure drawing and uploads it via the web app.
2. **Analyze** — The app sends the image to the hybrid stat engine:
   - Rule-based detection reads size/proportions, held items/props, pose/stance, and color.
   - Claude Vision interprets the same image and assigns a class, a named special move, and flavor text (personality blurb).
   - Item-based class mapping: book → Mage, sword → Warrior, no item → Brawler (extensible to more items/classes).
3. **Reveal** — User sees their generated character card: name, class, stats (HP, ATK, DEF, SPD), special move, flavor text.
4. **Battle** — User picks an opponent (a friend's previously generated character, or any character on the leaderboard) and starts a battle.
   - Battle is auto-resolved by a deterministic combat engine using both characters' stats.
   - The stick-figure arena animates the fight; AI-generated narration is shown move-by-move, synced to the animation beats (attack, special move, block, KO).
5. **Rank** — The result updates a shared leaderboard (wins/losses, ranking).

## 6. Features — Must-Have (v1)
- Photo upload (drag-and-drop or file picker)
- Hybrid stat-generation pipeline (rules + Claude Vision), returning a structured character object
- Character reveal screen
- Battle arena with basic animation (lunge, attack, hit reaction, KO) driven by combat-engine state, not hand-authored frame animation
- AI move-by-move narration during battle
- Persistent leaderboard (friend-based, shared) with win/loss record
- Character gallery (view previously generated characters)

## 7. Features — Nice-to-Have (later)
- More item → class mappings (staff → Caster, shield → Tank, bow → Ranger, etc.)
- Color-based elemental affinity (red → fire, blue → ice)
- Character "level up" / stat growth after wins
- Shareable battle replay link
- Seasonal leaderboard resets

## 8. Key Risks
- **Battle animation complexity** is the primary time-sink — keep v1 to simple state-driven CSS/Canvas motion, not frame-by-frame sprite animation.
- **Vision-model consistency** — two similar drawings could get wildly different stats if not constrained. Stats must be capped to fixed ranges (e.g., ATK: 40–90) regardless of what the model returns.
- **Demo/live reliability** — camera scans can fail on bad lighting; always support plain file upload as the primary path, not just a live camera capture.

## 9. Success Criteria (v1)
- A user can go from photo upload to seeing a generated character in under 15 seconds.
- Two characters can battle and produce a result + updated leaderboard without manual intervention.
- Stats feel consistent and explainable — same kind of drawing shouldn't produce wildly different power levels.
