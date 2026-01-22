# ADR 005: Core Gameplay Systems (Stamina, Resonance, Reputation, Caster, Spells)

## Status

Proposed

## Context

Sugarengine currently has well-implemented systems for dialogue, quests, inventory, and inspection. However, the CORE_GAMEPLAY_PROPOSAL.md defines five additional interconnected systems that form the mechanical backbone of the game:

1. **Stamina** - A pressure system that limits player actions
2. **Resonance** - A player-skill-based recovery and challenge system
3. **Reputation** - A disposition system that gates and modifies interactions
4. **Caster** - The exclusive interface through which spells are executed
5. **Spells** - Explicit, structured actions that interact with all other systems

These systems enforce intentional pacing: players cannot brute-force through content. Recovery requires active engagement (Resonance), and reputation builds slowly through meaningful choices. The magic system (Caster + Spells) provides an alternate action layer that still respects all core rules.

### Current State

| System | Status | Notes |
|--------|--------|-------|
| Dialogue | ✅ Implemented | Branching choices, NPC speakers, events |
| Quests | ✅ Implemented | Multi-stage, objectives, rewards |
| Inventory | ✅ Implemented | Categories, stacking, gifting |
| Inspection | ✅ Implemented | Rich content, proximity interaction |
| Stamina | ❌ Missing | No action limiting |
| Resonance | ❌ Missing | No recovery mechanic |
| Reputation | ❌ Missing | No gating/modifiers |
| Caster | ❌ Missing | No spell interface |
| Spells | ❌ Missing | No magic actions |

### Design Constraints (from CORE_GAMEPLAY_PROPOSAL.md)

These rules are binding and override all content:

- **No Bypasses**: No system may bypass stamina, reputation, or resonance rules
- **No Free Progress**: World-advancing actions must cost stamina or be unlocked by prior stamina expenditure
- **Recovery Is Intentional**: Stamina recovery only via Resonance, Rest, or explicit content
- **Reputation Is Slow**: Changes must be infrequent, explicit, and narratively justified
- **Information Is Power, Not Progress**: Inspection gives knowledge, not completion
- **Caster Is Just an Interface**: The Caster cannot generate stamina, bypass restrictions, or change state on its own
- **Spells Respect All Rules**: Spells cannot bypass Resonance to achieve effects; stamina restoration must go through Resonance

## Decision

Implement the five core gameplay systems as a combination of ECS components and managers, following existing patterns. Integration with existing systems will be done through extensions rather than rewrites.

### 1. Stamina System

#### Architecture

**StaminaManager** (new manager, similar to InventoryManager):
```typescript
class StaminaManager {
  private current: number;
  private max: number;

  canSpend(amount: number): boolean;
  spend(amount: number): boolean;  // Returns false if insufficient
  restore(amount: number): void;
  rest(): void;  // Full restore via rest action

  // Events
  onStaminaChanged: (current: number, max: number) => void;
  onStaminaDepleted: () => void;
}
```

**StaminaUI** (HUD component):
- Displays current/max stamina
- Visual feedback when stamina is low
- Flash/shake when action blocked due to insufficient stamina

#### Stamina Costs

Stamina costs are defined in content, not hardcoded:

**Dialogue options** - Add `staminaCost` field to dialogue choice schema:
```json
{
  "choices": [
    {
      "text": "Persuade the guard",
      "staminaCost": 2,
      "next": "persuade-success"
    },
    {
      "text": "Just ask politely",
      "staminaCost": 0,
      "next": "ask-politely"
    }
  ]
}
```

**Inspections** - Add optional `staminaCost` to inspection content:
```json
{
  "id": "ancient-tome",
  "title": "Ancient Tome",
  "staminaCost": 1,
  "content": "The text is difficult to decipher..."
}
```

#### Zero Stamina Behavior

When stamina is 0:
- Dialogue options with `staminaCost > 0` are shown but disabled (grayed out)
- Inspections with `staminaCost > 0` show "Too tired to focus" message
- Player can still: use Resonance, rest, idle, perform free interactions
- Quests cannot advance (enforced via dialogue/inspection gates)

### 2. Resonance System

#### What Resonance Is

A rhythm/timing-based minigame where players must hit inputs in sync with a pattern. Accuracy determines stamina recovery.

#### Architecture

**ResonanceManager** (new manager):
```typescript
class ResonanceManager {
  start(config: ResonanceConfig): void;
  end(): ResonanceResult;

  // For challenge resonance (quest-bound)
  startChallenge(config: ChallengeResonanceConfig): void;
}

interface ResonanceConfig {
  difficulty: 'easy' | 'normal' | 'hard';
  resonancePower: number;  // Base stamina restore on perfect
  // Reputation can modify these
}

interface ResonanceResult {
  accuracy: number;        // 0.0 to 1.0
  staminaRestored: number; // floor(accuracy * resonancePower)
  grade: 'perfect' | 'great' | 'good' | 'miss';
}

interface ChallengeResonanceConfig extends ResonanceConfig {
  questId: string;
  onSuccess?: QuestEffect[];
  onPartial?: QuestEffect[];
  onFailure?: QuestEffect[];
}
```

**ResonanceUI** (full-screen overlay):
- Timing indicators (visual cues for when to press)
- Input feedback (hit/miss visualization)
- Accuracy meter
- Result display

#### Resonance Formula

```
staminaRestored = floor(accuracy × resonancePower)
```

Where:
- `accuracy` = 0.0 to 1.0 based on player timing
- `resonancePower` = base value from config, potentially modified by reputation

#### Challenge Resonance

Special resonance tied to quest progression:
- Defined in quest content, not triggered ad-hoc
- Success/partial/failure each have explicit outcomes
- Failure must never cause hard lock (always provide alternative path)

### 3. Reputation System

#### Architecture

**ReputationManager** (new manager):
```typescript
class ReputationManager {
  private values: Map<string, number>;  // e.g., "guild-standing", "town-trust"

  get(key: string): number;
  set(key: string, value: number): void;
  modify(key: string, delta: number): void;
  meetsThreshold(key: string, required: number): boolean;

  // Events
  onReputationChanged: (key: string, oldValue: number, newValue: number) => void;
}
```

Reputation values are:
- **Discrete**: Integer values within defined bounds (e.g., -3 to +3, or 0 to 100)
- **Named**: Each reputation track has a semantic key
- **Slow to change**: Modified only by explicit content triggers

#### Reputation Gates

**Dialogue options** - Add `reputationRequired` field:
```json
{
  "choices": [
    {
      "text": "Ask about the secret passage",
      "reputationRequired": { "guild-standing": 2 },
      "next": "secret-info"
    }
  ]
}
```

**Inspections** - Add `reputationRequired` to inspection data:
```json
{
  "id": "guild-ledger",
  "reputationRequired": { "guild-standing": 3 },
  "title": "Guild Ledger",
  "content": "Financial records reveal..."
}
```

#### Reputation Modifiers

Reputation can modify other systems:
- **Stamina cost reduction**: High reputation might reduce costs
- **Resonance difficulty**: Reputation can make resonance easier/harder
- **Resonance power boost**: Higher reputation = more stamina restored

These modifiers are defined in a global config:
```json
{
  "reputationModifiers": {
    "guild-standing": {
      "3": { "staminaCostMultiplier": 0.8, "resonancePowerBonus": 2 },
      "5": { "staminaCostMultiplier": 0.6, "resonancePowerBonus": 5 }
    }
  }
}
```

### 4. Caster System

#### What the Caster Is

The Caster is the exclusive interface through which spells are executed. Players cannot cast spells without a Caster. The Caster itself is a passive conduit—it enables magic but does not generate power or bypass rules.

#### Caster Rules

- The Caster does **not** generate stamina
- The Caster does **not** bypass stamina restrictions
- The Caster does **not** change game state on its own
- The Caster **may**:
  - Restrict which spells are available
  - Modify spell stamina costs
  - Modify resonance difficulty when casting spells

#### Architecture

**CasterManager** (new manager):
```typescript
class CasterManager {
  private equippedCaster: Caster | null;
  private availableSpells: Map<string, Spell>;

  equipCaster(caster: Caster): void;
  unequipCaster(): void;

  getAvailableSpells(): Spell[];
  canCastSpell(spellId: string): CastabilityResult;
  castSpell(spellId: string): void;

  // Caster modifiers
  getStaminaCostModifier(): number;      // Multiplier for spell costs
  getResonanceDifficultyModifier(): number;

  // Events
  onCasterEquipped: (caster: Caster) => void;
  onCasterUnequipped: () => void;
  onSpellCast: (spell: Spell, result: SpellResult) => void;
}

interface Caster {
  id: string;
  name: string;
  description: string;
  allowedSpellTags?: string[];       // Only spells with these tags can be cast
  blockedSpellTags?: string[];       // Spells with these tags cannot be cast
  staminaCostMultiplier?: number;    // Default 1.0
  resonanceDifficultyModifier?: number; // Added to resonance difficulty
}

interface CastabilityResult {
  canCast: boolean;
  reason?: 'no-caster' | 'spell-blocked' | 'insufficient-stamina' | 'reputation-locked';
}
```

**CasterUI** (HUD/Menu component):
- Shows equipped caster (if any)
- Spell selection radial/menu
- Spell costs and availability indicators
- Caster swap interface (if multiple casters owned)

#### Caster Data Format

Casters are defined in `/public/casters/`:
```json
{
  "id": "apprentice-wand",
  "name": "Apprentice's Wand",
  "description": "A simple wand for beginners. Increases stamina costs slightly.",
  "staminaCostMultiplier": 1.2,
  "resonanceDifficultyModifier": -1,
  "allowedSpellTags": ["basic", "utility"]
}
```

```json
{
  "id": "master-staff",
  "name": "Staff of the Archmage",
  "description": "A powerful staff that reduces all spell costs.",
  "staminaCostMultiplier": 0.7,
  "resonanceDifficultyModifier": 0,
  "blockedSpellTags": ["forbidden"]
}
```

#### Caster Acquisition

Casters are inventory items with type `caster`. When a caster item is used/equipped from inventory, it becomes the active caster:
```json
{
  "id": "item-apprentice-wand",
  "name": "Apprentice's Wand",
  "category": "caster",
  "casterId": "apprentice-wand",
  "description": "Equip to cast basic spells."
}
```

### 5. Spells System

#### What Spells Are

Spells are explicit, structured actions initiated via the Caster. They represent intentional magical actions that interact with all game systems while respecting core rules.

#### What Spells Can Do

Every spell does one or more of:
- Initiate Resonance
- Modify stamina (costs, never free restoration without Resonance)
- Modify reputation
- Unlock dialogue, inspection, or quest outcomes

#### Spell Rules

- All spells have a stamina cost **or** are explicitly marked as `staminaNeutral: true`
- Spells may require reputation thresholds
- Spells may initiate Resonance
- Spells may **never** bypass Resonance to achieve their effects
- Spell effects that restore stamina **must** resolve through Resonance

#### Spell & Stamina Interaction

- Spells with `staminaCost > 0` cannot be cast when stamina is 0
- Spells marked `staminaNeutral: true` may be cast at 0 stamina
- A spell cannot directly restore stamina; it must initiate Resonance which then restores stamina

#### Spells & Quests

Spells do **not** advance quests by default. A spell may advance a quest only if:
- It initiates Challenge Resonance, **or**
- It explicitly sets a quest-bound effect

Spells may function as:
- Quest gates (required to proceed)
- Quest solutions (one way to complete an objective)
- Alternate approaches to dialogue or inspection

#### Architecture

**SpellManager** (new manager):
```typescript
class SpellManager {
  private spells: Map<string, Spell>;
  private cooldowns: Map<string, number>;

  loadSpells(): Promise<void>;
  getSpell(id: string): Spell | undefined;

  canCast(spellId: string): SpellCastability;
  cast(spellId: string, target?: SpellTarget): SpellResult;

  // Events
  onSpellCastStart: (spell: Spell) => void;
  onSpellCastComplete: (spell: Spell, result: SpellResult) => void;
  onSpellFailed: (spell: Spell, reason: string) => void;
}

interface Spell {
  id: string;
  name: string;
  description: string;
  tags: string[];                    // For caster filtering

  // Cost & Requirements
  staminaCost: number;               // 0 if staminaNeutral
  staminaNeutral?: boolean;          // Can cast at 0 stamina
  reputationRequired?: Record<string, number>;

  // Effects
  effects: SpellEffect[];
}

interface SpellEffect {
  type: 'resonance' | 'reputation' | 'unlock' | 'quest' | 'world';

  // For type: 'resonance'
  resonanceConfig?: {
    difficulty: 'easy' | 'normal' | 'hard';
    resonancePower: number;
    isChallenge?: boolean;
    challengeConfig?: ChallengeResonanceConfig;
  };

  // For type: 'reputation'
  reputationChange?: {
    key: string;
    delta: number;
  };

  // For type: 'unlock'
  unlock?: {
    dialogueOptions?: string[];      // Unlock specific dialogue choices
    inspections?: string[];          // Unlock inspections
    questObjectives?: string[];      // Mark objectives completable
  };

  // For type: 'quest'
  questEffect?: {
    questId: string;
    action: 'start' | 'advance' | 'complete-objective';
    objectiveId?: string;
  };

  // For type: 'world'
  worldEffect?: {
    flag: string;
    value: boolean | string | number;
  };
}

interface SpellResult {
  success: boolean;
  staminaSpent: number;
  resonanceResult?: ResonanceResult;
  effectsApplied: SpellEffect[];
}

type SpellTarget = {
  type: 'self' | 'npc' | 'object' | 'location';
  entityId?: string;
  position?: { x: number; y: number; z: number };
};
```

**SpellUI** (casting interface):
- Spell selection (from available spells via Caster)
- Stamina cost display (with Caster modifier applied)
- Reputation requirement indicators
- Targeting interface (if spell requires target)
- Cast confirmation

#### Spell Data Format

Spells are defined in `/public/spells/`:

**Basic stamina-restoring spell (via Resonance):**
```json
{
  "id": "meditate",
  "name": "Meditate",
  "description": "Enter a focused state to restore stamina through resonance.",
  "tags": ["basic", "recovery"],
  "staminaCost": 0,
  "staminaNeutral": true,
  "effects": [
    {
      "type": "resonance",
      "resonanceConfig": {
        "difficulty": "easy",
        "resonancePower": 5
      }
    }
  ]
}
```

**Reputation-modifying spell:**
```json
{
  "id": "blessing-of-light",
  "name": "Blessing of Light",
  "description": "Invoke a blessing that improves your standing with the temple.",
  "tags": ["holy", "social"],
  "staminaCost": 3,
  "effects": [
    {
      "type": "reputation",
      "reputationChange": { "key": "temple-favor", "delta": 1 }
    }
  ]
}
```

**Quest-advancing spell (via Challenge Resonance):**
```json
{
  "id": "dispel-barrier",
  "name": "Dispel Barrier",
  "description": "Attempt to break through a magical barrier. Requires concentration.",
  "tags": ["advanced", "utility"],
  "staminaCost": 5,
  "reputationRequired": { "arcane-knowledge": 2 },
  "effects": [
    {
      "type": "resonance",
      "resonanceConfig": {
        "difficulty": "hard",
        "resonancePower": 3,
        "isChallenge": true,
        "challengeConfig": {
          "questId": "forbidden-library",
          "onSuccess": [{ "action": "complete-objective", "objectiveId": "break-barrier" }],
          "onPartial": [{ "action": "set-flag", "flag": "barrier-weakened" }],
          "onFailure": []
        }
      }
    }
  ]
}
```

**Unlock spell (alternate path):**
```json
{
  "id": "detect-secrets",
  "name": "Detect Secrets",
  "description": "Reveal hidden information in your surroundings.",
  "tags": ["utility", "investigation"],
  "staminaCost": 2,
  "effects": [
    {
      "type": "unlock",
      "unlock": {
        "inspections": ["hidden-compartment", "secret-message"],
        "dialogueOptions": ["ask-about-hidden-room"]
      }
    }
  ]
}
```

#### Spell Casting Flow

1. Player opens spell menu (requires equipped Caster)
2. Available spells shown (filtered by Caster's allowed/blocked tags)
3. Player selects spell
4. System checks:
   - Stamina sufficient? (spell cost × Caster modifier)
   - Reputation requirements met?
   - Target valid? (if targeting required)
5. If checks pass:
   - Deduct stamina (cost × Caster modifier)
   - Execute spell effects in order
   - If Resonance effect: launch Resonance minigame
   - Apply results
6. If checks fail:
   - Show reason why spell cannot be cast

### 6. Integration with Existing Systems

#### DialogueManager Changes

```typescript
// Before showing choices, filter/disable based on stamina and reputation
getAvailableChoices(node: DialogueNode): DialogueChoice[] {
  return node.choices.map(choice => ({
    ...choice,
    disabled: !this.canSelectChoice(choice),
    disabledReason: this.getDisabledReason(choice)
  }));
}

canSelectChoice(choice: DialogueChoice): boolean {
  if (choice.staminaCost && !staminaManager.canSpend(choice.staminaCost)) {
    return false;
  }
  if (choice.reputationRequired && !reputationManager.meetsThreshold(...)) {
    return false;
  }
  return true;
}

// On choice selection, deduct stamina
selectChoice(choice: DialogueChoice): void {
  if (choice.staminaCost) {
    staminaManager.spend(choice.staminaCost);
  }
  // ... existing logic
}
```

#### InspectionManager Changes

```typescript
canInspect(inspection: InspectionContent): boolean {
  if (inspection.staminaCost && !staminaManager.canSpend(inspection.staminaCost)) {
    return false;
  }
  if (inspection.reputationRequired && !reputationManager.meetsThreshold(...)) {
    return false;
  }
  return true;
}

start(inspectionId: string): void {
  const content = this.getContent(inspectionId);
  if (!this.canInspect(content)) {
    // Show "cannot inspect" feedback
    return;
  }
  if (content.staminaCost) {
    staminaManager.spend(content.staminaCost);
  }
  // ... existing logic
}
```

#### QuestManager Changes

Quests themselves don't cost stamina (per rules), but quest advancement is gated through dialogue/inspection which do. Add support for:
- Challenge Resonance objectives
- Reputation requirements on quest availability
- Reputation rewards on quest completion

#### InventoryManager Changes

Items can modify stamina costs but cannot bypass restrictions:
```json
{
  "id": "scholars-glasses",
  "effects": {
    "inspectionStaminaCostReduction": 1
  }
}
```

### 7. Save/Load Integration

Extend SaveData to include:
```typescript
interface SaveData {
  // ... existing fields
  stamina: {
    current: number;
    max: number;
  };
  reputation: Record<string, number>;
  equippedCasterId: string | null;
  learnedSpells: string[];           // Spells the player has learned
  spellUnlocks: string[];            // Unlocks granted by spells (dialogue options, inspections)
}
```

Resonance state is transient (not saved mid-resonance).

### 8. Rest Mechanic

Rest fully restores stamina. Implementation options:
1. **Rest zones**: Specific locations (beds, benches) trigger rest
2. **Rest action**: Menu option available anywhere
3. **Timed rest**: World time passes during rest

Recommend starting with **rest zones** using existing TriggerZone system:
```json
{
  "triggers": [
    {
      "id": "inn-bed",
      "type": "rest",
      "position": { "x": 5, "y": 0, "z": 3 },
      "size": { "x": 2, "y": 1, "z": 2 }
    }
  ]
}
```

## Implementation Order

1. **Phase 1: Stamina Foundation**
   - StaminaManager
   - StaminaUI (HUD display)
   - Save/load integration
   - Rest zones

2. **Phase 2: Dialogue Integration**
   - Extend dialogue schema with staminaCost
   - DialogueManager stamina checks
   - DialogueBox disabled choice UI

3. **Phase 3: Inspection Integration**
   - Extend inspection schema with staminaCost
   - InspectionManager stamina checks
   - Blocked inspection feedback

4. **Phase 4: Reputation System**
   - ReputationManager
   - Dialogue reputation gates
   - Inspection reputation gates
   - Save/load integration

5. **Phase 5: Resonance System**
   - ResonanceManager
   - ResonanceUI (minigame interface)
   - Basic stamina recovery flow
   - Reputation modifiers on resonance

6. **Phase 6: Challenge Resonance**
   - Quest-bound resonance
   - Success/partial/failure outcomes
   - Quest objective type: `resonance`

7. **Phase 7: Caster System**
   - CasterManager
   - CasterLoader (load caster definitions)
   - Caster inventory item type
   - CasterUI (equipped caster display)
   - Equip/unequip flow from inventory
   - Save/load integration

8. **Phase 8: Spells System**
   - SpellManager
   - SpellLoader (load spell definitions)
   - SpellUI (spell selection and casting)
   - Stamina cost application (with Caster modifiers)
   - Reputation requirement checks
   - Save/load integration (learned spells)

9. **Phase 9: Spell Effects**
   - Resonance effect (triggers Resonance minigame)
   - Reputation effect (modifies reputation)
   - Unlock effect (unlocks dialogue/inspection options)
   - Quest effect (advances quests via Challenge Resonance)
   - World effect (sets world flags)

10. **Phase 10: Item Modifiers**
    - Inventory item effects on stamina costs
    - Inventory item effects on resonance

## Consequences

### Positive

- **Enforced pacing**: Players must engage with systems, can't brute-force content
- **Meaningful choices**: Stamina creates real trade-offs in dialogue
- **Skill expression**: Resonance rewards player skill with faster recovery
- **Narrative integration**: Reputation gates create earned story moments
- **Content flexibility**: All costs/gates defined in JSON, not code
- **Alternate paths**: Spells provide alternative solutions to puzzles and challenges
- **Build variety**: Different Casters enable different playstyles
- **Rule consistency**: Magic respects the same rules as dialogue/inspection (no bypasses)

### Negative

- **Complexity**: Five new interconnected systems to maintain
- **Content burden**: Every dialogue choice needs stamina cost consideration; spells need balancing
- **Balancing required**: Stamina economy needs careful tuning across all systems
- **UI overhead**: Multiple new HUD elements (stamina, reputation, caster, spell menu, resonance)
- **Learning curve**: Players need to understand how magic integrates with other systems

### Risks

- **Frustration potential**: If stamina is too restrictive, players feel blocked
- **Resonance skill floor**: If minigame is too hard, some players can't recover
- **Reputation confusion**: Players may not understand why options are locked
- **Magic feels restrictive**: Players may expect magic to bypass normal limitations
- **Caster gating frustration**: Players may find desired spells blocked by Caster limitations

### Mitigations

- Start with generous stamina pools, tune down based on testing
- Multiple resonance difficulty levels, reputation can reduce difficulty
- Clear UI feedback explaining why options are unavailable
- Tutorial/early game teaches systems gradually
- Early Caster has few restrictions, gated Casters are rewards for progression
- "Meditate" spell available early as reliable stamina recovery path
- Spells positioned as "alternate approaches" not "required paths" in early content

## Files Changed

**New:**
- `src/stamina/StaminaManager.ts`
- `src/stamina/types.ts`
- `src/stamina/index.ts`
- `src/ui/StaminaUI.ts`
- `src/reputation/ReputationManager.ts`
- `src/reputation/types.ts`
- `src/reputation/index.ts`
- `src/resonance/ResonanceManager.ts`
- `src/resonance/ResonanceUI.ts`
- `src/resonance/types.ts`
- `src/resonance/index.ts`
- `src/caster/CasterManager.ts`
- `src/caster/CasterLoader.ts`
- `src/caster/types.ts`
- `src/caster/index.ts`
- `src/ui/CasterUI.ts`
- `src/spells/SpellManager.ts`
- `src/spells/SpellLoader.ts`
- `src/spells/SpellEffects.ts` - Effect handlers for each effect type
- `src/spells/types.ts`
- `src/spells/index.ts`
- `src/ui/SpellUI.ts`
- `public/casters/` - Directory for caster definition files
- `public/spells/` - Directory for spell definition files

**Modified:**
- `src/dialogue/DialogueManager.ts` - Stamina/reputation checks, spell unlock integration
- `src/dialogue/types.ts` - Extended choice schema
- `src/ui/DialogueBox.ts` - Disabled choice rendering
- `src/inspection/InspectionManager.ts` - Stamina/reputation checks, spell unlock integration
- `src/inspection/types.ts` - Extended inspection schema
- `src/ui/InspectionUI.ts` - Blocked inspection feedback
- `src/quests/QuestManager.ts` - Resonance objectives, reputation rewards, spell quest effects
- `src/quests/types.ts` - New objective types
- `src/inventory/InventoryManager.ts` - Caster equip/unequip handling
- `src/inventory/types.ts` - Item effect modifiers, caster item category
- `src/ui/InventoryUI.ts` - Caster equip action
- `src/save/types.ts` - Extended save data (stamina, reputation, caster, spells)
- `src/save/SaveManager.ts` - Save/load new systems
- `src/systems/TriggerSystem.ts` - Rest zone handling
- `src/core/Engine.ts` - Initialize new managers
- `src/main.ts` - Wire up new systems, spell hotkey handling

**Documentation:**
- `docs/api/` - Document new systems (stamina, resonance, reputation, caster, spells)
- Update existing API docs with new fields
