# ADR-SL-014: Quest-Beat Traversal and Deterministic Interaction Derivation Algorithm

## Status

Proposed

## Context

The current Sugarlang docs now say all of the following:

- the quest graph is the engine-owned source of truth
- one Sugarlang scenario is associated with one quest
- `Sync From Quest` should traverse the quest graph and derive interactions
- bounded scripted dialogue beats should generate persisted banded interaction bundles
- later human or AI refinement may polish the surface lines without owning the structure

That direction is now clear.

What is still missing is the actual method.

Until this ADR, the docs have described:

- the desired domain model
- the desired authoring loop
- the desired runtime flow

but they have not specified, in enough detail for implementation:

- how quest traversal works
- how communicative beats are selected
- how vocabulary is selected and assigned `focus`, `reinforcement`, or `ambient`
- how per-band turn bundles are generated deterministically
- how quest-success hooks are attached to the derived interaction

This ADR fills that gap.

## Decision

Sugarlang will implement a deterministic derive pipeline that walks the quest graph and generates banded interaction bundles from authored dialogue.

The pipeline is:

1. walk the quest graph in authored order, skipping non-communicative nodes inline
2. for each communicative node, resolve grounded context (NPC, world objects, attributes)
3. match dialogue vocabulary against the shared lexicon
4. for each target language and band:
   a. assign `focus`, `reinforcement`, and `ambient` roles per band budget
   b. derive turn roles from dialogue structure (NPC delivery, player delivery, learner response)
   c. render each turn via band-based lexical substitution (swap depth controlled by mixing level)
   d. generate the persisted banded interaction bundle
5. attach a quest-success hook back to the source quest node

Sugarlang does not classify dialogue into interaction families. It does not need to know whether a beat is a "greeting" or a "help request." The quest graph provides structural context (node type, prerequisites, objective type). The lexicon provides the vocabulary swap table. The band policy controls mixing depth. That is enough.

This ADR does not claim that the deterministic first pass produces perfect target-language prose. It claims that the first pass produces structurally complete, previewable, band-correct output that an LLM polish pass or human review can then improve at the surface level.

## Why This Method Exists

This method is designed to satisfy four constraints at once:

1. the writer should author the game in normal SugarEngine quest and dialogue tools
2. the first Sugarlang pass should be generated, not hand-authored band by band
3. the result should still be deterministic enough to preview, validate, and grade
4. later refinement should be able to improve surface language without silently changing the underlying interaction structure

## Scope of the Method

This ADR defines:

- quest traversal with inline communicative-beat filtering
- vocabulary resolution and lexicon matching
- per-band role assignment
- band-based lexical substitution
- turn role derivation from dialogue structure
- deterministic banded-bundle generation
- quest-success-hook derivation

This ADR does not define:

- exact TypeScript interfaces
- exact JSON field names
- exact editor UI layout
- advanced adaptive scheduling based on learner evidence
- arbitrary open-ended dialogue understanding

## Method Overview

At a high level:

1. take the associated quest
2. walk its graph, skipping non-communicative nodes as you go
3. for each surviving node, match its dialogue text against the lexicon
4. substitute vocabulary per band mixing level
5. derive turns from dialogue structure and generate the banded bundle

Everything happens in one pass over the quest graph. One quest node produces zero or one Sugarlang interactions. Cross-node merging is explicitly not supported because it would create a mismatch between the engine's quest state (which advances per node) and Sugarlang's interaction state.

The key product rule is:

- the quest beat is the source
- the interaction is the derived unit
- the banded turn bundle is the persisted learner-facing output
- one quest node = one Sugarlang interaction (or zero, if not communicative)

## Detailed Algorithm

### 1. Traverse the Quest Graph and Filter Inline

`Sync From Quest` should traverse the associated quest in authored quest order, skipping non-communicative nodes inline. There is no separate filtering pass.

For V1, traversal order should be conservative and explainable:

1. stage order
2. node order within stage
3. explicit outgoing edges where ordering matters
4. attached dialogue order within a talk beat

At each quest node, the traversal applies the inclusion test immediately:

Promote a quest node into a Sugarlang interaction candidate if at least one of the following is true:

- it is a `Talk` objective with dialogue
- it is a narrative node with NPC dialogue lines
- it is a `collect` objective with a grounded world object
- it has voiceover text with a grounded world object
- it is a completion or report-back beat expressed through dialogue or constrained language

Skip a quest node when it is only:

- a pure condition gate or branch node
- a hidden quest-plumbing node
- an inventory check with no learner-facing language exchange
- a location objective with no dialogue
- a state transition with no dialogue and no communicative choice

Each surviving node produces exactly one Sugarlang interaction. Cross-node merging is not supported because the quest engine owns per-node progression — Sugarlang cannot hold two quest nodes in a single interaction without fighting the engine's advancement model.

If an author wants related dialogue to feel like one conversational moment, they should author it as one `Talk` node with one dialogue tree. That is an authoring decision, not a derivation decision.

### 2. Resolve Grounded Context

For each interaction, resolve a grounding record containing:

- `npcId` — primary NPC id from the beat's target or dialogue speaker
- `npcName` — display name for the NPC
- `worldObjectRefs` — array of `{ objectId, label, category }` from the beat's world-object refs
- `attributes` — array of `{ key, value, lexicalEntryId? }` for learner-visible properties (color, size, role badge, inventory identity)
- `questBindingRefs` — array of stable quest binding ids when the scenario defines cross-interaction referent tracking
- `entries` — array of `{ lexicalEntryId }` for grounding-derived vocabulary (object labels, attribute words) that should feed into vocabulary resolution

The grounding record is built from the beat's `targetNpcId`, `targetNpcName`, `worldObjectRefs`, and scenario-level quest bindings. It is passed to vocabulary resolution, role assignment, and bundle generation so that the same referent stays consistent across:

- NPC line
- highlight or pointing repair
- object interaction
- quest success

### 3. Resolve Vocabulary Rows

For each interaction, construct a candidate vocabulary set from:

1. explicit English dialogue text
2. source node and quest objective semantics
3. bound world-object labels and attributes
4. repair chunks needed by the band policy

Vocabulary resolution should happen in this order:

1. direct lexicon lookup by stable row id when already bound
2. lookup by English gloss or alias (exact, lowercased, slash-variant split)
3. lookup by grounded world-object category or attribute
4. if unresolved, leave in English (correct band behavior for V1 direction)

Example:

For `Hello. My name is Bippity. I am the Station Master.` the likely candidate rows are:

- `hello`
- `my name is`
- `I am`
- `station manager` or `station master`

### 4. Assign Vocabulary Roles Per Band

Each interaction should then assign the resolved vocabulary rows per band as:

- `focus`
- `reinforcement`
- `ambient`

Role assignment is deterministic and budgeted.

Base rules:

1. `focus`
   - interaction-central vocabulary
   - introduced at or before the current band
   - new or currently emphasized for this interaction
2. `reinforcement`
   - already introduced earlier
   - still central enough to reuse visibly
   - preferred over fresh synonyms when possible
3. `ambient`
   - relevant but not required for learner success at this band
   - may be carried in support language or richer target-language wording

Use the default focus budgets from the language content model:

- `B0`: `2-4`
- `B1`: `4-6`
- `B2`: `6-8`
- `B3`: `8-10`
- `B4`: `8-12` with a smaller explicit focus subset

Role-assignment algorithm:

1. collect all candidate vocabulary rows for the interaction
2. mark rows essential to communicative success (grounded objects, quest-critical nouns, dialogue-central verbs)
3. sort essential rows by:
   - grounding strength
   - quest centrality
   - introduction band
4. fill `focus` up to the band budget using rows with `introductionBand <= currentBand`
5. assign remaining essential lower-band rows to `reinforcement`
6. assign non-essential or above-band rows to `ambient`

If a row is above the current band but narratively useful, prefer:

- support-language carry
- grounded visual support
- ambient mention

over making it `focus`.

### 5. Choose the Band Response Profile

Each band should render the same interaction differently.

The deterministic generator should use the learner-band matrix and band policy to select:

- response mode
- scaffold visibility
- repair posture
- support-language posture
- grounding intensity

V1 default shape:

- `B0`
  - anchored recognition
  - chip composition
  - strong visible grounding
- `B1`
  - guided response
  - word-bank or frame support
- `B2`
  - constrained exchange
  - typed response plus staged repair support
- `B3`
  - independent task dialogue
  - short free text with delayed stronger repair
- `B4`
  - natural interaction
  - lighter support and freer response

### 6. Derive Turn Roles From Dialogue Structure

A dialogue tree produces an ordered sequence of nodes. Each node becomes a turn in the interaction bundle, but not every turn is a learner interaction point. The generator must assign a turn role to each dialogue node based on who speaks and what the node's structural purpose is.

#### Turn roles

- **`npc_delivery`** — an NPC speaks. The learner reads and absorbs vocabulary. The next turn is either a learner response opportunity or another delivery. This turn carries the full band treatment: mixed-language rendering at the band's mixing level, vocabulary role assignment, and ambient vocabulary exposure. No response contract, no evaluation target, no repair ladder.

- **`player_delivery`** — the player character (Holly) speaks as part of scripted narrative. The learner did not choose or produce this line. The game shows it and advances. This turn gets the same band-based lexical substitution as an NPC delivery (so the learner sees vocabulary in context at the appropriate mixing level) but carries no active learning apparatus: no response contract, no evaluation target, no repair ladder, no chips or scaffolds. Vocabulary from player delivery turns feeds into `reinforcement` or `ambient` for the interaction — the learner sees it but is not tested on it.

- **`learner_response`** — the learner must produce or select something. This is the active interaction point. It carries the full band treatment: response contract, visible scaffold, repair ladder, and evaluation target. There are two sub-cases for how the response content is derived:

  1. **Explicit choice source.** The preceding NPC delivery node had multiple `DialogueNext` edges with `text` labels. Those choice labels are the English-language source material for the learner response. They get the same band-based lexical substitution as any other line. At B0 they become translated chips. At B1 they become word-bank-assisted options or blank-fill frames. At B2+ they inform the evaluation intents and accepted answers.

  2. **Generic acknowledgement.** The dialogue advances without player choices and there is no player dialogue node after the NPC line. The response expectation is a generic acknowledgement using focus vocabulary. The generated turn is flagged with `responseSource: 'generic'` so the author knows the response was not sourced from authored dialogue and can be refined.

#### Dialogue node to turn role mapping

```text
function assignTurnRole(dialogueLine, nextEdges):
  if dialogueLine.isNarrator or dialogueLine.isExcerpt:
    return null  // skip, but extract ambient vocabulary

  if dialogueLine.isPlayerLine:
    return 'player_delivery'

  // NPC line — check whether this node presents choices to the learner
  choiceLabels = nextEdges.filter(e => e.text).map(e => e.text)

  if choiceLabels.length > 0:
    // This NPC delivery is followed by a learner choice point.
    // Emit the NPC delivery turn, then a learner_response turn
    // whose source material is the choice labels.
    return 'npc_delivery_with_choice'

  return 'npc_delivery'
```

When `npc_delivery_with_choice` is returned, the generator emits two sequential turns for that dialogue node:

1. an `npc_delivery` turn with the NPC line rendered at the band's mixing level
2. a `learner_response` turn whose evaluation target and scaffold are derived from the choice labels

When a dialogue tree has no explicit choices and no player dialogue nodes following an NPC line, the generator emits a generic `learner_response` turn after the final NPC delivery. The response uses focus vocabulary as accepted answers and is flagged with `responseSource: 'generic'` for author review.

#### Choice label translation

Explicit choice labels from `DialogueNext.text` are translated per band using the same lexical substitution rules as NPC and player delivery lines:

```text
function translateChoiceLabels(choiceLabels, targetLanguage, band, rolePlan):
  mixingLevel = getBandPolicy(band).supportLanguagePolicy.mixingLevel
  translatedChoices = []

  for label in choiceLabels:
    if mixingLevel in {'full_support', 'heavy_support'}:
      // Only swap focus vocabulary, keep rest in English
      translated = label
      for entry in rolePlan.focus:
        translated = translated.replaceAllCaseInsensitive(entry.gloss, entry.targetForm)
      translatedChoices.append(translated)

    else if mixingLevel == 'light_support':
      // Swap all matched vocabulary, keep unmatched in English
      translated = substituteAllMatched(label, rolePlan, targetLanguage)
      translatedChoices.append(translated)

    else:
      // target_dominant / target_only — full substitution
      translated = substituteAllMatched(label, rolePlan, targetLanguage)
      translated = substituteFunctionWords(translated, targetLanguage)
      translatedChoices.append(translated)

  return translatedChoices
```

At B0, these translated choices become chips in a `chip_composition` response contract. At B1, they become word-bank entries or blank-fill frames. At B2+, the original English choice labels inform the evaluation intents while the translated forms are used as accepted answers.

### 7. Generate the Banded Turn Bundle

For each target language and band, generate a persisted interaction bundle containing an ordered list of turns. Each turn has a role and only carries the apparatus appropriate to that role.

The generator uses band-based lexical substitution on the original English dialogue text. The band's mixing level controls how many words are swapped to target language. Unmatched words stay in English (correct for V1 direction). The LLM polish pass fixes word order and surface quality afterward.

### 8. Derive the Repair Ladder

Repair is part of the generated structure, not an afterthought.

Repair-ladder generation rules:

1. start from the band default ladder
2. keep the sequence deterministic

Example:

- `B0`
  - repeat with highlighted focus rows
  - point to grounded referent
  - support-language paraphrase
- `B2`
  - show more words
  - say it more simply
  - say it in support language

### 9. Derive the Evaluation Target

The evaluator should grade against focus vocabulary and explicit choices, not against raw English narrative text.

For `learner_response` turns with explicit choices: the evaluation accepts any translated choice label. At B0 these are chips, at B1 word-bank entries, at B2+ intent-based keyword matching.

For `learner_response` turns with `responseSource: 'generic'`: the evaluation accepts any response containing focus vocabulary from the current role plan.

### 10. Attach the Quest-Success Hook

The generated interaction must state how success can recommend quest progression.

Quest-hook derivation rules:

1. if the interaction maps directly to one quest objective node, attach that node's completion or advancement recommendation
2. if the beat is informational only, attach no progression hook
3. the engine remains the final authority on whether the recommendation is applied

### 11. Persist and Validate

After generation:

1. persist the interaction bundle
2. persist source bindings
3. persist any newly drafted missing vocabulary rows as explicit review items
4. validate:
   - binding integrity
   - legal band usage
   - missing vocabulary
   - response-contract completeness
   - quest-hook legality

## Implementation Method

### Dialogue Tree Walking

A `DialogueTree` is a directed graph of `DialogueNode` entries linked by `DialogueNext` edges. When a quest node has an attached dialogue tree, the traversal walks the tree to extract lines, speakers, and choice points. This is an internal utility used during traversal, not a separate pipeline stage.

Walking algorithm:

```text
function walkDialogueTree(tree):
  visited = set()
  result = []
  queue = [tree.startNode]

  while queue is not empty:
    nodeId = queue.shift()
    if nodeId in visited:
      continue
    visited.add(nodeId)

    node = tree.nodeMap.get(nodeId)
    if node is null:
      continue

    nextEdges = node.next ?? []
    choiceLabels = nextEdges.filter(n => n.text).map(n => n.text)

    result.append({
      nodeId: node.id,
      speaker: node.speaker,
      speakerId: node.speakerId,
      text: node.text,
      isPlayerLine: node.speakerId == PLAYER.id or node.speaker == "Player",
      isNarrator: node.speakerId == NARRATOR.id,
      isExcerpt: node.speakerId == EXCERPT.id,
      choiceLabels,
      hasChoicePoint: choiceLabels.length > 1,
      nextEdges,
    })

    // Follow all outgoing edges in authored order (breadth-first).
    // For player-choice branches, all branches are included
    // and marked as choice variants.
    for edge in (node.next ?? []):
      queue.append(edge.nodeId)

  return result
```

Important constraints:

- NPC lines become `npc_delivery` turns — the learner reads them, absorbs vocabulary at the band's mixing level, but does not respond to them directly
- player lines (speaker == PLAYER or PLAYER_VO) become `player_delivery` turns — scripted narrative where the player character speaks. These get the same band-based lexical substitution but carry no active learning apparatus (no response contract, no evaluation, no repair). The learner reads them passively.
- narrator and excerpt lines are skipped for turn generation but their vocabulary may feed into `ambient` role assignment
- when an NPC node has multiple `DialogueNext` edges with `text` labels, the choice labels are the source material for a `learner_response` turn. The NPC node becomes an `npc_delivery` turn followed by a `learner_response` turn whose scaffold and evaluation are derived from translating those choice labels per band.
- when a dialogue ends after NPC delivery with no player choice and no player line, the generator emits a generic `learner_response` turn (acknowledge using focus vocabulary) and flags it with `responseSource: 'generic'` for author review
- conditional edges (`DialogueNext.condition`) are included in the flat list because the derive pass needs the full authored content, not the runtime-filtered subset

### Beat Record

Each surviving quest node produces a beat record inline during traversal. The fields map directly to `QuestObjective` and resolved dialogue. See the `beat = { ... }` block in the Top-Level Sync pseudocode for the concrete field list.

## Pseudocode

### Top-Level Sync

```text
function syncFromQuest(questId):
  quest = loadQuestGraph(questId)
  scenario = ensureScenarioForQuest(questId)

  // Single pass: traverse, filter, and generate
  interactions = []

  stageId = quest.startStage
  while stageId is not null:
    stage = quest.stageMap.get(stageId)
    if stage is null:
      break

    sorted = topologicalSort(stage.objectives, stage.startObjectives)

    for objective in sorted:

      // --- Inline filter: skip non-communicative nodes ---

      // Skip condition gates and branch nodes
      nodeType = objective.nodeType ?? 'objective'
      if nodeType == 'condition' or nodeType == 'branch':
        continue

      // Resolve dialogue tree if this node references one
      dialogueId = objective.dialogue ?? objective.dialogueId ?? null
      dialogueLines = []
      if dialogueId:
        tree = loadDialogueTree(dialogueId)
        if tree:
          dialogueLines = walkDialogueTree(tree)
      else if objective.type == 'talk' and objective.target:
        npc = loadNpc(objective.target)
        if npc and npc.dialogueId:
          tree = loadDialogueTree(npc.dialogueId)
          if tree:
            dialogueLines = walkDialogueTree(tree)

      worldObjectRefs = resolveWorldObjectRefs(objective, quest, regionData)

      // Inclusion rules
      isCommunicative = false

      // Talk objective with dialogue
      if objective.type == 'talk' and dialogueLines.length > 0:
        isCommunicative = true

      // Narrative node with NPC lines
      else if nodeType == 'narrative' and dialogueLines.length > 0:
        npcLines = dialogueLines.filter(line => not line.isPlayerLine and not line.isNarrator)
        if npcLines.length > 0:
          isCommunicative = true

      // Collect objective with grounded world object
      else if objective.type == 'collect' and worldObjectRefs.length > 0:
        isCommunicative = true

      // Voiceover with grounded world object
      else if objective.voiceoverText and worldObjectRefs.length > 0:
        isCommunicative = true

      if not isCommunicative:
        continue

      // --- This node survives: build a beat and generate ---

      beat = {
        questId: quest.id,
        stageId: stage.id,
        nodeId: objective.id,
        nodeType,
        objectiveType: objective.type,
        description: objective.description,
        targetNpcId: objective.target if objective.type == 'talk' else null,
        targetNpcName: resolveNpcName(objective.target),
        dialogueId,
        dialogueLines,
        completeOn: objective.completeOn ?? 'dialogueEnd',
        onEnterActions: objective.onEnter ?? [],
        onCompleteActions: objective.onComplete ?? [],
        prerequisites: objective.prerequisites ?? [],
        worldObjectRefs,
        voiceoverText: objective.voiceoverText ?? null,
      }

      grounding = resolveGroundedContext(beat)
      vocabCandidates = resolveVocabularyRows(beat, grounding)
      questHook = deriveQuestSuccessHook(beat)

      interaction = persistOrUpdateInteraction(
        scenario, beat, grounding, questHook
      )

      for targetLanguage in scenario.supportedTargetLanguages:
        for band in scenario.supportedBands:
          rolePlan = assignVocabularyRoles(
            vocabCandidates, targetLanguage, band, grounding
          )
          bundle = generateBandedTurnBundle(
            interaction, targetLanguage, band, rolePlan, grounding, questHook
          )
          persistInteractionBundle(interaction, targetLanguage, band, bundle)

      interactions.append(interaction)

    stageId = stage.next

  validateScenario(scenario)
  return scenario
```

### Vocabulary Extraction and Lexicon Matching

```text
function resolveVocabularyRows(beat, grounding):
  // 1. Collect all English words from dialogue lines
  allText = beat.dialogueLines
    .filter(line => not line.isNarrator and not line.isExcerpt)
    .map(line => line.text)
    .join(" ")
    .toLowerCase()

  // 2. Match multi-word lexicon glosses first (compound phrases take priority)
  matches = []
  matchedEntryIds = set()

  for entry in lexicon.entries:
    glossVariants = entry.gloss.toLowerCase().split('/')  // handle "is / is located"
    for variant in glossVariants:
      if variant.trim() in allText and entry.lexicalEntryId not in matchedEntryIds:
        matches.append(entry)
        matchedEntryIds.add(entry.lexicalEntryId)

  // 3. Match single words against lexicon by English gloss
  words = allText.split(/\s+/)
  for word in words:
    normalized = word.replace(/[^a-z']/g, '')
    entry = lexicon.entries.find(e =>
      e.lexicalEntryId not in matchedEntryIds
      and (normalize(e.gloss) == normalized
           or normalize(e.gloss).split('/').any(g => g.trim() == normalized))
    )
    if entry:
      matches.append(entry)
      matchedEntryIds.add(entry.lexicalEntryId)

  // 4. Add grounding-derived vocabulary (object labels, colors)
  for ref in grounding.entries:
    entry = lexicon.entries.find(e => e.lexicalEntryId == ref.lexicalEntryId)
    if entry and entry.lexicalEntryId not in matchedEntryIds:
      matches.append(entry)
      matchedEntryIds.add(entry.lexicalEntryId)

  return matches
```

### Vocabulary Role Assignment

```text
function assignVocabularyRoles(vocabCandidates, targetLanguage, band, grounding):
  rows = resolveTargetLanguageRows(vocabCandidates, targetLanguage)
  essential = markInteractionEssentialRows(rows, grounding)

  focusBudget = getFocusBudgetForBand(band)

  focus = []
  reinforcement = []
  ambient = []

  rankedEssential = sortBy(
    essential,
    groundingStrength desc,
    questCentrality desc,
    introductionBand asc
  )

  for row in rankedEssential:
    if row.introductionBand <= band and len(focus) < focusBudget:
      focus.append(row)
    else if row.introductionBand < band:
      reinforcement.append(row)
    else:
      ambient.append(row)

  for row in rows not already assigned:
    ambient.append(row)

  return { focus, reinforcement, ambient }
```

### Line Rendering: Band-Based Lexical Substitution

The generator does not translate. It performs lexical substitution on the original English dialogue text. The band's mixing level controls how many words get swapped from English to target language. The lexicon provides the swap table.

```text
function renderLineForBand(englishLine, targetLanguage, band, rolePlan):
  mixingLevel = getBandPolicy(band).supportLanguagePolicy.mixingLevel

  // B0 (full_support): swap only focus vocabulary, rest stays English
  // B1 (heavy_support): swap focus + reinforcement, rest stays English
  // B2 (light_support): swap all matched vocabulary, unmatched stays English
  // B3-B4 (target_dominant, target_only): swap everything possible

  substitutions = []

  if mixingLevel == 'full_support':
    // Only focus entries
    for entry in rolePlan.focus:
      substitutions.append({ english: entry.gloss, target: entry.targetForm })

  else if mixingLevel == 'heavy_support':
    // Focus + reinforcement
    for entry in [...rolePlan.focus, ...rolePlan.reinforcement]:
      substitutions.append({ english: entry.gloss, target: entry.targetForm })

  else:
    // All matched vocabulary
    for entry in [...rolePlan.focus, ...rolePlan.reinforcement, ...rolePlan.ambient]:
      substitutions.append({ english: entry.gloss, target: entry.targetForm })

  // Sort longest-first to handle compound phrases before single words
  substitutions.sortBy(s => -s.english.length)

  result = englishLine
  for sub in substitutions:
    result = result.replaceAllCaseInsensitive(sub.english, sub.target)

  // For B3-B4, also substitute function words (articles, pronouns, copulas)
  if mixingLevel in {'target_dominant', 'target_only'}:
    result = substituteFunctionWords(result, targetLanguage)

  return result
```

#### Function Word Table

The function-word table is a small per-language lookup (not part of the teaching lexicon) that handles articles, pronouns, copulas, and prepositions. These are structural glue, not teaching vocabulary.

```text
// Example entries for Spanish:
FUNCTION_WORDS['es'] = {
  "the":    { default: "el", feminine: "la", plural: "los", femPlural: "las" },
  "a":      { default: "un", feminine: "una" },
  "I am":   { default: "soy" },
  "I'm":    { default: "soy" },
  "is":     { default: "es", locative: "está" },
  "my":     { default: "mi" },
  "your":   { default: "tu" },
  "in":     { default: "en" },
  "on":     { default: "en", surface: "sobre" },
  "of":     { default: "de" },
  "to":     { default: "a" },
  // ~50-80 entries total per language
}
```

For V1, defaulting to the lexicon entry's primary form and accepting rough gender agreement is acceptable. The LLM polish pass fixes article agreement, word order, and surface quality.

### Banded Bundle Generation

The generator walks the dialogue lines, assigns a turn role to each, and emits an ordered list of turns. Each turn only carries the apparatus appropriate to its role.

```text
function generateBandedTurnBundle(interaction, targetLanguage, band, rolePlan, grounding, questHook):
  turns = []
  sequenceNumber = 1
  dialogueLines = interaction.dialogueLines
  hasEmittedLearnerResponse = false

  for i, line in enumerate(dialogueLines):
    role = assignTurnRole(line, line.nextEdges)

    if role is null:
      continue

    turnId = "{band.lower()}-{targetLanguage}-{String(sequenceNumber).padStart(2, '0')}"

    if role == 'player_delivery':
      renderedLine = renderLineForBand(line.text, targetLanguage, band, rolePlan)
      supportText = null
      if band in {'B0', 'B1', 'B2'}:
        supportText = line.text

      turns.append({
        turnId,
        turnRole: 'player_delivery',
        targetText: renderedLine,
        supportText,
        focusLexicalEntryIds: [],
        reinforcementLexicalEntryIds: extractMatchedEntryIds(line.text, rolePlan),
        ambientLexicalEntryIds: [],
        responseMode: null,
        evaluation: null,
        speakerName: "Holly",
      })
      sequenceNumber++
      continue

    if role == 'npc_delivery' or role == 'npc_delivery_with_choice':
      npcLine = renderLineForBand(line.text, targetLanguage, band, rolePlan)
      supportText = null
      if band in {'B0', 'B1', 'B2'}:
        supportText = line.text

      turns.append({
        turnId,
        turnRole: 'npc_delivery',
        targetText: npcLine,
        supportText,
        focusLexicalEntryIds: rolePlan.focus.map(e => e.lexicalEntryId),
        reinforcementLexicalEntryIds: rolePlan.reinforcement.map(e => e.lexicalEntryId),
        ambientLexicalEntryIds: rolePlan.ambient.map(e => e.lexicalEntryId),
        responseMode: null,
        evaluation: null,
        speakerName: grounding.npcName,
      })
      sequenceNumber++

      if role == 'npc_delivery_with_choice':
        responseTurnId = "{band.lower()}-{targetLanguage}-{String(sequenceNumber).padStart(2, '0')}"
        translatedChoices = translateChoiceLabels(line.choiceLabels, targetLanguage, band, rolePlan)
        evaluationTarget = deriveEvaluationFromChoices(band, rolePlan, line.choiceLabels, translatedChoices)
        repairLadder = selectRepairLadder(band, rolePlan, grounding)

        turns.append({
          turnId: responseTurnId,
          turnRole: 'learner_response',
          responseSource: 'explicit_choice',
          focusLexicalEntryIds: rolePlan.focus.map(e => e.lexicalEntryId),
          responseMode: evaluationTarget.mode,
          responseData: evaluationTarget.scaffold,
          repairOptions: repairLadder,
          evaluation: evaluationTarget,
          questSuccessHook: questHook,
        })
        sequenceNumber++
        hasEmittedLearnerResponse = true

  // If no explicit choices existed, emit a generic learner response
  if not hasEmittedLearnerResponse:
    responseTurnId = "{band.lower()}-{targetLanguage}-{String(sequenceNumber).padStart(2, '0')}"
    repairLadder = selectRepairLadder(band, rolePlan, grounding)

    turns.append({
      turnId: responseTurnId,
      turnRole: 'learner_response',
      responseSource: 'generic',
      focusLexicalEntryIds: rolePlan.focus.map(e => e.lexicalEntryId),
      responseMode: selectResponseModeForBand(band),
      responseData: { acceptedAnswers: rolePlan.focus.map(e => e.targetForm) },
      repairOptions: repairLadder,
      evaluation: { acceptedForms: rolePlan.focus.map(e => e.targetForm) },
      questSuccessHook: questHook,
    })

  return turns
```

### Evaluation Target Derivation

For explicit choice responses, the evaluation derives from the translated choice labels:

```text
function deriveEvaluationFromChoices(band, rolePlan, englishChoices, translatedChoices):
  if band == 'B0':
    return {
      mode: 'chip_composition',
      scaffold: translatedChoices,
      acceptedCompositions: translatedChoices,
    }

  if band == 'B1':
    return {
      mode: 'word_bank',
      scaffold: extractFocusFormsFromChoices(translatedChoices, rolePlan),
      acceptedAnswers: translatedChoices,
    }

  // B2-B4: accept any translated choice form or its focus content words
  return {
    mode: 'short_text',
    acceptedAnswers: translatedChoices,
    acceptedForms: rolePlan.focus.map(e => e.targetForm),
  }
```

For generic responses (no authored choices), the evaluation accepts any response containing focus vocabulary. See the generic `learner_response` block in the banded bundle generation pseudocode.

## Deterministic vs Heuristic Boundaries

This method is deterministic in the sense that:

- the same quest input should produce the same interaction bundle output
- the inclusion/exclusion rules are explicit
- the role-assignment budgets are explicit
- the substitution rules are explicit
- the quest-hook rules are explicit

It is still heuristic in the sense that:

- vocabulary centrality ranking is a weighted engineering rule, not a mathematically proven optimum

That is acceptable for V1.

The important thing is that the heuristics are:

- inspectable
- reviewable
- testable
- replayable

## Research Basis and Limits

This algorithm is an engineering method informed by language-learning research.

It is not copied from a single paper.

The research basis is:

1. derive interactions from meaningful quest tasks rather than isolated sentences
   - aligned with task-based and interaction-oriented language teaching approaches.[1][2]
2. make repair and negotiation of meaning part of the interaction instead of treating them as a detached help menu
   - aligned with interaction and corrective-feedback research.[2][3]
3. deliberately recycle vocabulary across bands and interactions instead of introducing words once and abandoning them
   - aligned with repetition and retrieval findings in vocabulary learning.[4]
4. keep the first pass bounded and deterministic for beginner and intermediate bands
   - aligned with the product need for low-cost, transparent evaluation and with the existing deterministic-first evaluation ADR.[5]

The parts that are still product and engineering decisions rather than direct research conclusions are:

- the exact focus budgets by band
- the exact quest-hook derivation rules

Those choices should be treated as explicit V1 product decisions, validated through preview and playtest.

## Engineering Assessment: Implementation Gaps and Open Questions

This section identifies areas that require further product or engineering decision before implementation can begin. Each item is either too vague to implement, depends on an unstated assumption, or requires a design decision that has not been recorded.

### 1. Dialogue Branching — Resolved

Resolved by section 6 (Derive Turn Roles From Dialogue Structure). All branches within one dialogue tree produce one interaction. The walker traverses all branches breadth-first, choice labels become a `learner_response` turn with `responseSource: 'explicit_choice'`, and the evaluation accepts any choice. May need revisiting if practice reveals cases where branches diverge enough to warrant separate interactions, but the 1:1 node-to-interaction rule makes this the only safe default.

### 2. Report-Back Detection — Resolved

Resolved by quest graph structure. Sugarlang does not need to infer communicative purpose from text. A `talk` node whose prerequisites include a `collect` or `location` node is structurally a report-back beat. The traversal reads `beat.prerequisites` and the referenced nodes' objective types directly.

### 3. Function Word Substitution Cannot Handle Word Order — Resolved

The deterministic first pass produces blunt word order at B2+ (e.g. "roja maleta" instead of "maleta roja"). This is expected and acceptable. The LLM polish pass fixes word order as part of its normal surface-language rewriting. No special flagging or programmatic reordering needed.

### 4. Lexicon Gloss Matching — Resolved for V1

For the V1 direction (English-authored dialogue, non-English target language), unmatched English words simply stay in English in the generated line. This is correct band behavior — lower bands are already designed to leave support-language words in place. An unmatched word is indistinguishable from a word intentionally kept in English for scaffolding.

The only cost of a missed match is that the word won't be tracked as focus/reinforcement/ambient and won't feed into evaluation or learner progression. The interaction still works and the line is still readable.

A basic matcher (exact gloss, lowercased, slash-variant split) is sufficient. The 6-step priority chain with lemma-aware compound matching is not needed for V1.

**Future concern — directionality:** The entire rendering pipeline assumes one direction: English is the authored/support language, the target language is non-English. If the target language is English (e.g. a Spanish speaker learning English), the substitution model reverses and unmatched English words staying in the line is wrong — they'd be accidentally in the target language at low bands. Supporting English-as-target will likely require the narrative to be re-authored in each support language, not just the lexicon. This is out of scope for V1.

### 5. Generic Learner Response When No Choices Exist — Accepted

When a dialogue tree has no explicit player choices, the generator emits a generic `learner_response` turn that accepts focus vocabulary. This is flagged with `responseSource: 'generic'` so the author can refine it. For V1 this is sufficient — the author can add explicit choices to the dialogue tree if they want a more specific learner response.

### 6. Quest-Hook Derivation Is Now Simple

With the 1:1 node-to-interaction rule, each interaction maps to exactly one quest node. The quest-success hook should reference the single source objective ID. Section 10 makes this explicit: the hook always carries the one `nodeId` from the source beat. No multi-ID or split-ordering logic is needed.

### 7. Idempotency of Sync From Quest — Resolved

Each turn carries a `generationSource: 'derived' | 'polished' | 'manual'` field.

- `derived` — generated by Sync From Quest. Safe to overwrite on re-sync.
- `polished` — LLM pass has rewritten surface language. Preserved on re-sync.
- `manual` — human edited directly. Preserved on re-sync.

Re-sync only overwrites turns where `generationSource == 'derived'`. If the source dialogue has changed and a turn is `polished` or `manual`, flag it as stale (so the author knows the source moved under it) but do not overwrite.

## Consequences

### Positive

- the derive method becomes implementable without guesswork
- no NLP dependency, no family classification — just lexicon matching and substitution
- the editor, runtime, and external refinement workflow can all point at the same structured output
- the system becomes testable at the quest-beat level
- later surface-polish operations can safely operate on persisted bundles instead of inventing structure ad hoc

### Negative

- the first generated wording will feel blunt (LLM polish pass fixes this)
- word order will be wrong for languages that differ from English (LLM polish pass fixes this)
- generic learner responses need author refinement for interesting interaction

## References

[1] Ellis, Rod. *Task-based Language Learning and Teaching*. Oxford University Press, 2003.  
[2] Long, Michael H. "The role of the linguistic environment in second language acquisition." In *Handbook of Second Language Acquisition*, 1996.  
[3] Lyster, Roy, and Kazuya Saito. "Oral feedback in classroom SLA: A meta-analysis." *Studies in Second Language Acquisition* 32, no. 2 (2010): 265-302.  
[4] Webb, Stuart. "The effects of repetition on vocabulary knowledge." *Applied Linguistics* 28, no. 1 (2007): 46-65.  
[5] [ADR-SL-005: Deterministic-First Evaluation, Feedback, and Support Architecture](./005-deterministic-first-evaluation-feedback-and-support-architecture.md)
