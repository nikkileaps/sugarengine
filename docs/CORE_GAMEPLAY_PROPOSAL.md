Core Gameplay Rules

(Authoritative Rules Reference)

This section defines how each gameplay system mechanically impacts the others.
These rules are binding. Content may not bypass them. Narrative and curiosity should be the driving forces for players and these systems should enhance that.

SYSTEMS DEFINED

The game has the following gameplay systems:

Stamina

Resonance

Reputation

Dialogue

Inspection

Quests

Inventory

Caster

Each system may only interact with others as described below.

1. STAMINA (Core Pressure System)
1.1 What Stamina Represents

Stamina represents the player’s capacity to continue engaging with demanding actions.

1.2 Stamina Rules

All demanding actions cost stamina.

Stamina does not regenerate passively.

Stamina cannot go below 0.

Stamina cannot cause death or game over.

1.3 When Stamina Is 0

When stamina reaches 0:

The player may not initiate demanding dialogue options.

The player may not advance quests.

The player may:

use Resonance

rest

idle

perform non-demanding interactions

2. RESONANCE (Stamina Recovery & Challenge System)
2.1 What Resonance Is

Resonance is a player-skill-based interaction used to:

recover stamina, and/or

resolve explicitly defined narrative or quest challenges.

2.2 Resonance Rules

Resonance restores stamina based on player accuracy.

Resonance may be initiated at any stamina value.

Resonance does not advance quests by default.

Resonance may advance quests only when explicitly configured to do so.

Resonance never changes world state implicitly.

2.3 Resonance Outcome Formula
staminaRestored = floor(accuracy × resonancePower)

2.4 Resonance & Reputation

Certain reputation thresholds may:

increase resonance effectiveness

reduce resonance difficulty

Resonance may shift reputation only if explicitly specified by content.

2.5 Challenge Resonance (Quest-Bound Resonance)

A Resonance interaction may be designated as a Challenge Resonance.

When so designated:

Success, partial success, or failure may:

advance a quest

complete a quest objective

set world or quest flags

All quest effects must be explicitly defined.

Failure must never result in a hard lock or game over.

3. REPUTATION (Disposition System)
3.1 What Reputation Represents

Reputation represents the player’s established behavioral tendencies.

3.2 Reputation Rules

Reputation values are discrete and bounded.

Reputation does not change frequently.

Reputation does not directly cost stamina.

3.3 Reputation Impacts

Reputation may:

gate dialogue options

gate inspection options

modify stamina costs

modify resonance difficulty

Reputation may not:

restore stamina directly

complete quests directly

override stamina restrictions

4. DIALOGUE (Choice System)
4.1 What Dialogue Is

Dialogue is a choice-based interaction with NPCs.

4.2 Dialogue Rules

Each dialogue option:

has a stamina cost or

is explicitly marked as free

Dialogue options may require reputation thresholds.

Dialogue options may trigger:

quest flags

inventory changes

inspection unlocks

4.3 Dialogue & Stamina

Dialogue options costing stamina are unavailable at 0 stamina.

Dialogue options that restore stamina must use Resonance rules.

5. INSPECTION (Information System)
5.1 What Inspection Is

Inspection is an interaction used to gain information about the world.

5.2 Inspection Rules

Inspections may cost stamina.

Inspections may require reputation thresholds.

Inspections may unlock dialogue or quests.

Inspections do not directly complete quests.

6. QUESTS (Progress System)
6.1 What Quests Are

Quests represent tracked narrative progress.

6.2 Quest Rules

Quests advance only via:

dialogue outcomes

inspection outcomes

explicit quest-bound Resonance outcomes

explicit quest triggers

Quests may require:

reputation thresholds

inventory items

Quests never:

cost stamina directly

restore stamina directly

7. INVENTORY (Capability System)
7.1 What Inventory Is

Inventory represents persistent items that modify interactions.

7.2 Inventory Rules

Inventory items may:

unlock dialogue options

unlock inspection options

reduce stamina costs

satisfy quest requirements

Inventory items may not:

bypass stamina restrictions

bypass reputation requirements

complete quests automatically

8. CASTER (Magic System)
8.1 What Caster Is

A Caster is a device that allows the user to cast spells. Spells are purchased as apps and installed on the Caster. The Caster is powered by a crystal dragon bone battery.

Magic in this world is semi-sentient. It has a will of its own and does not always behave as expected.

Note: Rare individuals can cast spells without a Caster. This is not common knowledge.

8.2 Caster Rules

Spells are cast through the Caster device.

Each spell has an intended effect and a chaos threshold.

Spell reliability depends on battery charge level.

Casting a spell consumes battery charge.

8.3 Battery & Chaos

The battery charge level determines spell reliability across discrete tiers:

Full (75-100%): Spell behaves as intended. No chaos.

Unstable (25-74%): Spell may behave unexpectedly. Moderate chaos chance.

Critical (1-24%): Spell will likely misbehave. High chaos chance.

Empty (0%): Caster cannot cast. It just sticks its tongue out at you.

Chaos is not failure. A chaotic spell still produces an effect, but the effect may differ from intent. Magic decides.

8.4 Chaos Resolution

When a spell is cast:

Calculate chaos chance based on current battery level.

If chaos triggers, the spell effect is modified or replaced.

Chaos effects are defined per spell or drawn from a general chaos table.

Chaos may be beneficial, neutral, or detrimental.

8.5 Battery Recharge

The battery is recharged through Resonance.

Resonance accuracy determines charge restored.

Recharging is intentional and costs time.

8.6 Caster & Other Systems

Caster & Stamina:

Casting spells may cost stamina in addition to battery.

Stamina cost is separate from battery cost.

Caster & Reputation:

Certain spells may require reputation thresholds.

Spell effects may shift reputation if explicitly defined.

Caster & Quests:

Spells may be required to complete quest objectives.

Spells do not automatically complete quests.

Caster & Inventory:

Spell apps are inventory items.

Battery upgrades may be inventory items.

Items may reduce chaos chance or battery cost.

CROSS-SYSTEM RULES (MOST IMPORTANT)

These rules override all content.

Rule A: No Bypasses

No system may bypass stamina, reputation, or resonance rules.

Rule B: No Free Progress

Any action that advances the world must either:

cost stamina, or

be unlocked by prior stamina expenditure.

Rule C: Recovery Is Intentional

Stamina recovery must always be the result of:

Resonance

Rest

Explicit content-defined recovery

Rule D: Reputation Is Slow

Reputation changes must be:

infrequent

explicit

narratively justified

Rule E: Information Is Power, Not Progress

Inspection gives knowledge, not completion.

TL;DR (Designer Reference)
System	What It Can Do
Stamina	Limits action
Resonance	Restores stamina; resolves explicit challenges
Reputation	Gates & modifies
Dialogue	Triggers change
Inspection	Reveals info
Quests	Track progress
Inventory	Unlocks options
Caster	Executes spells; chaos = the dice roll