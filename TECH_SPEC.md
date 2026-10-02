# Inkfight — Technical Specification

## 1. Stack
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Next.js API routes (no separate server needed for v1)
- **AI**: Claude Vision (Anthropic API) for drawing analysis + move narration
- **Database**: SQLite (via Prisma) for local/dev; swappable to Postgres for deployment
- **Animation**: CSS transforms / Canvas 2D for the battle arena — no external game engine needed for v1
- **Image storage**: Local filesystem (`/public/uploads`) for v1; swappable to S3-compatible storage later

> Adjust freely if Claude Code scaffolds a different but equivalent stack — the contracts below (data models, JSON schema, API routes) are what matter, not the specific framework.

## 2. Data Models

```prisma
model Character {
  id            String   @id @default(cuid())
  name          String
  ownerHandle   String   // simple display name, no auth required for v1
  imageUrl      String
  class         String   // "Mage" | "Warrior" | "Brawler" | ...
  hp            Int
  atk           Int
  def           Int
  spd           Int
  specialMove   String
  flavorText    String
  detectedItems String   // JSON string: raw rule-based detection output
  createdAt     DateTime @default(now())

  battlesAsA    Battle[] @relation("CharacterA")
  battlesAsB    Battle[] @relation("CharacterB")
}

model Battle {
  id              String   @id @default(cuid())
  characterAId    String
  characterBId    String
  characterA      Character @relation("CharacterA", fields: [characterAId], references: [id])
  characterB      Character @relation("CharacterB", fields: [characterBId], references: [id])
  winnerId        String
  log             String   // JSON string: array of narrated move events
  createdAt       DateTime @default(now())
}
```

Leaderboard is derived (not stored separately): aggregate wins/losses per `Character` via query, ordered by win count or a simple rating score.

## 3. Stat Engine — Hybrid Pipeline

### Step 1 — Rule-based feature pass (cheap, deterministic)
Before calling the vision model, run lightweight heuristics on the image (can also be folded into the vision prompt itself for v1 — see note below):
- Bounding-box size relative to canvas → rough "scale" signal
- Dominant colors present → elemental tag candidate
- Aspect ratio / stroke density → rough "aggressive vs defensive" pose signal

**Simplification for v1**: Instead of building real CV, ask Claude Vision to report these detected features explicitly as part of its structured output (see JSON schema below). This collapses two passes into one API call. Revisit true rule-based CV only if time allows.

### Step 2 — Claude Vision creative pass
Single prompt, single image, structured JSON output. The model must:
1. Identify held items/props → map to a class (book → Mage, sword → Warrior, empty-handed → Brawler, staff → Caster, shield → Tank — extend as needed)
2. Report detected features (size, pose, color, items) explicitly
3. Propose stats within **fixed caps** (enforced server-side after the call, not trusted blindly):
   - HP: 60–140
   - ATK: 40–90
   - DEF: 40–90
   - SPD: 40–90
4. Name a special move tied to something specific in the drawing
5. Write a one-line flavor/personality blurb

### Required JSON contract (response schema)
```json
{
  "class": "Mage",
  "detected_items": ["book"],
  "detected_features": {
    "size": "medium",
    "pose": "aggressive",
    "dominant_colors": ["blue"]
  },
  "stats": { "hp": 100, "atk": 65, "def": 55, "spd": 70 },
  "special_move": {
    "name": "Static Rage",
    "description": "A lightning-charged lunge drawn from the figure's spiky hair"
  },
  "flavor_text": "A wiry scholar who reads faster than they fight."
}
```
Server-side validation: clamp every stat field into its cap range; reject/retry if `class` or `special_move` is missing.

## 4. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/characters` | POST | Upload image → runs vision analysis → creates `Character` → returns character object |
| `/api/characters` | GET | List all characters (gallery) |
| `/api/characters/[id]` | GET | Get one character |
| `/api/battle` | POST | Body: `{ characterAId, characterBId }` → runs combat engine → creates `Battle` → returns result + narration log |
| `/api/leaderboard` | GET | Returns characters ranked by win count/rating |

## 5. Combat Engine (deterministic, server-side)
Pure function, not AI-driven, so results are reproducible and explainable:
```
turn order: higher SPD acts first each round
damage = max(1, ATK_attacker - DEF_defender/2) ± small randomness (seeded per battle for reproducibility)
repeat until one character's HP <= 0
```
After the deterministic result is computed, send the turn-by-turn event list to Claude to generate flavorful narration text per event (not to decide the outcome) — this keeps combat fair while AI adds the "voice."

## 6. Battle Arena Animation (frontend)
- State machine per character: `idle → windup → attack → hit/block → idle`, plus `ko` terminal state
- Driven entirely by the narration log's event list (already computed server-side) — the frontend just plays through events in sequence with CSS transitions (translateX for lunges, opacity/scale for hit flashes, rotate for KO fall)
- No frame-by-frame sprite work needed for v1 — state-driven transforms are enough to read as a "fight"

## 7. Environment / Config
- `ANTHROPIC_API_KEY` — required for vision analysis + narration generation
- `DATABASE_URL` — Prisma connection string

## 8. Open Items for Claude Code to Decide During Build
- Exact shadcn components to use for upload/gallery/battle screens
- Whether narration is generated in one batched call (full battle log at once) or per-turn — batched is simpler and recommended for v1
- Retry/fallback behavior if the vision call fails validation twice
