# Lexicon, World Object, and Grounding Glossary

## Purpose

This is the plain-English domain glossary and thin logical API contract for the words we keep using in Sugarlang.

It exists so product docs, editor UI, and implementation docs all mean the same thing when they say:

- `lexicon row`
- `world object`
- `grounding`

This is not a final storage schema.

It is the shared naming contract.

## Plain-English Definitions

### Lexicon row

A lexicon row is a vocabulary entry the game tracks.

Examples:

- `suitcase`
- `maleta`
- `where is`
- `dónde está`

What makes it tracked:

- the game knows its stable id
- the game knows its language form
- the game knows when it is first introduced
- scenes can mark it as `focus`, `reinforcement`, or `ambient`
- learner evidence can be stored against it

### World object

A world object is the actual thing in the scene.

Examples:

- the red suitcase by the platform
- the station counter
- the side door
- the newsstand

This may be a concrete object, a region, a landmark, or another visible in-world anchor.

### Grounding

Grounding is the link between the vocabulary entry and the actual thing in the scene.

Examples:

- the vocabulary entry `maleta` is grounded to the red suitcase object
- the vocabulary entry `mostrador` is grounded to the counter region
- the vocabulary entry `puerta` is grounded to the nearby door

Grounding is what lets the game point, highlight, inspect, or otherwise connect language to the world.

### Scene role

Scene role is how the current scene is using a vocabulary entry right now.

The three core roles are:

- `focus`
  - the scene is deliberately teaching or strongly re-teaching this entry
- `reinforcement`
  - the scene is deliberately bringing this entry back
- `ambient`
  - the entry may appear in the language environment, but is not the current teaching target

Most `SceneVocabularyUse` rows should point at tracked lexicon rows.

But not every ambient word that appears in prose or flavor text needs its own tracked row or scene-use record.

## Relationship Between the Three

The clean split is:

- lexicon row = the vocabulary entry
- world object = the actual thing in the scene
- grounding = the connection between the two

Example:

- lexicon row: `maleta`
- world object: the red suitcase on the platform
- grounding: this scene links `maleta` to that suitcase

## Thin Logical Shapes

These are not final code types.

They are the minimum logical shapes the system should be able to talk about.

```ts
type LexiconRow = {
  rowId: string;
  language: string;
  surfaceForm: string;
  gloss: string;
  introductionBand: "B0" | "B1" | "B2" | "B3" | "B4";
  groundable: boolean;
};

type WorldObjectRef = {
  worldObjectId: string;
  kind: "object" | "region" | "landmark" | "npc";
  label?: string;
};

type GroundingLink = {
  rowId: string;
  worldObjectId: string;
  sceneId: string;
  notes?: string;
};

type SceneVocabularyUse = {
  rowId: string;
  role: "focus" | "reinforcement" | "ambient";
  highlighted?: boolean;
  requiredForSuccess?: boolean;
};
```

This shape is for tracked scene vocabulary use.

Additional untracked ambient language may still appear in the authored text without creating a `SceneVocabularyUse` row.

## Product Rules

### 1. One shared lexicon per target language

Sugarlang owns one lexicon per target language for the whole game or content bundle.

### 2. Vocabulary entries are not world objects

`maleta` is the vocabulary entry.

The red suitcase on the platform is the world object.

They are related through grounding, but they are not the same thing.

### 3. Scene role is not the same thing as introduction band

`introductionBand` is a stable property of the lexicon row.

`focus`, `reinforcement`, and `ambient` are scene-level usage roles.

### 4. Learner evidence belongs to the vocabulary entry

The system should remember what the learner has seen, recognized, or produced for the vocabulary entry.

It should not only remember that a scene happened.

## Example

```json
{
  "lexiconRow": {
    "rowId": "object.suitcase",
    "language": "es",
    "surfaceForm": "maleta",
    "gloss": "suitcase",
    "introductionBand": "B0",
    "groundable": true
  },
  "worldObject": {
    "worldObjectId": "luggage_red_01",
    "kind": "object",
    "label": "red suitcase"
  },
  "groundingLink": {
    "rowId": "object.suitcase",
    "worldObjectId": "luggage_red_01",
    "sceneId": "station-introductions"
  },
  "sceneUse": {
    "rowId": "object.suitcase",
    "role": "focus",
    "highlighted": true,
    "requiredForSuccess": true
  }
}
```
