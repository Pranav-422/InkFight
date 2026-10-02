# Inkfight — Design Brief

## 1. Vibe
Scrappy, hand-drawn energy meeting a polished game UI — think a sketchbook character sheet brought to life inside a clean, modern fighting-game interface. The drawings themselves (rough, personal, imperfect) should feel like the hero of the visual design, framed by a confident, minimal UI around them — not buried under heavy chrome.

## 2. Screens Needed

### a. Upload Screen
- Large, obvious drag-and-drop zone / file picker
- Short instructional copy: what makes a good scan (clear lines, decent lighting, plain background)
- Preview of the uploaded image before submitting
- Loading state while the vision analysis runs (this call takes a few seconds — needs a real loading state, not a blank screen)

### b. Character Reveal Screen
- The uploaded drawing shown prominently (this is the character's "portrait")
- Class name + icon
- Stat block (HP/ATK/DEF/SPD) — use bars or a simple radial/segmented display, not raw numbers alone
- Special move name + one-line description
- Flavor text styled like a trading-card quote
- Clear CTA to save to gallery / pick an opponent

### c. Battle Arena Screen
- Split-screen or side-by-side stage with both characters' drawings as the "sprites"
- HP bars above each character, updating live as the battle plays
- Narration text stream (move-by-move), styled like a commentary box — not a wall of text, one line visible at a time with a brief animation
- Simple motion per state: windup, lunge/attack, hit-flash, KO fall
- Clear winner announcement at the end

### d. Leaderboard Screen
- Ranked list: character thumbnail (the drawing), name, class, win/loss record
- Highlight top 3 distinctly (not just a plain table row)
- Filter/sort by wins is enough for v1

### e. Gallery Screen
- Grid of previously generated characters (thumbnail = the drawing)
- Click through to character detail / start a battle from here

## 3. Visual Style Direction
- **Background**: clean, near-white or very dark neutral — let the hand-drawn art provide the color/texture contrast, don't compete with it
- **Typography**: one confident display font for character names/titles, a plain readable font for body/stats — avoid generic "gamer" fonts (no faux-metal, no excessive glow)
- **Color**: a small, deliberate accent palette (2–3 colors max) used for stat bars, buttons, and class tags — don't theme the whole UI around "fantasy game" clichés (no gradients-on-everything, no parchment textures)
- **Cards**: character cards should feel like trading cards — a clear frame around the drawing, consistent stat layout, subtle shadow/depth, no heavy borders or accent stripes
- **Icons**: simple, flat icons for classes/stats (a sword, a book, a shield) rather than illustrated fantasy icons — keep the hand-drawn art as the only "illustrated" element on screen

## 4. Explicitly Avoid
- Generic AI-app look: no purple-gradient hero sections, no glassmorphism stacked everywhere, no decorative accent stripes/bars under headers
- Don't make the UI compete visually with the drawings — they're the content, not decoration
- Don't over-animate; the battle arena is the one place motion should be the focus, everything else should be calm and fast

## 5. Component List (for shadcn/Tailwind build)
- `UploadDropzone`
- `CharacterCard` (used in reveal, gallery, and leaderboard thumbnail)
- `StatBar` (reusable for HP/ATK/DEF/SPD)
- `BattleStage` (two-character layout + HP bars + motion states)
- `NarrationFeed` (scrolling/typewriter move-by-move text)
- `LeaderboardTable` / `LeaderboardRow`
- `ClassBadge` (small tag: icon + class name)

## 6. Tone of Copy
Light, playful, a little competitive — like trash talk between friends, not formal game-UI copy. Loading states, empty states, and error messages should match this tone rather than reading as generic system text.
