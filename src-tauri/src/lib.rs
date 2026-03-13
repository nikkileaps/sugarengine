use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

const TURN_JSON_SCHEMA: &str = r#"{"type":"object","properties":{"utterance":{"type":"string"},"emotion":{"type":"string"},"intent":{"type":"string"},"proposedIntents":{"type":"array","items":{"type":"object"}},"citations":{"type":"array","items":{"type":"object","properties":{"sourceId":{"type":"string"},"snippet":{"type":"string"}},"required":["sourceId"],"additionalProperties":true}}},"required":["utterance","emotion","intent","proposedIntents","citations"],"additionalProperties":false}"#;

const MODEL_CANDIDATES: &[&str] = &[
  "runtime/models/qwen3-4b-instruct-2507-q4_k_m.gguf",
  "runtime/models/qwen3-4b-instruct-2507-q5_k_m.gguf",
  "runtime/models/qwen2.5-1.5b-instruct-q4_k_m.gguf",
  "runtime/models/qwen2.5-0.5b-instruct-q2_k.gguf",
  "src/plugins/sugaragent/runtime/bundle/models/qwen3-4b-instruct-2507-q4_k_m.gguf",
  "src/plugins/sugaragent/runtime/bundle/models/qwen3-4b-instruct-2507-q5_k_m.gguf",
  "src/plugins/sugaragent/runtime/bundle/models/qwen2.5-1.5b-instruct-q4_k_m.gguf",
  "src/plugins/sugaragent/runtime/bundle/models/qwen2.5-0.5b-instruct-q2_k.gguf",
];

const LLAMA_BIN_CANDIDATES: &[&str] = &[
  "runtime/bin/llama-completion",
  "src/plugins/sugaragent/runtime/bundle/bin/llama-completion",
  "plugins/sugaragent/runtime/bundle/bin/llama-completion",
  "sugaragent/runtime/bundle/bin/llama-completion",
  "runtime/bundle/bin/llama-completion",
  "bundle/bin/llama-completion",
];

#[derive(Default)]
struct SugarAgentRuntimeState {
  loaded_model_path: Option<PathBuf>,
  conversations: HashMap<String, Vec<ConversationTurn>>,
}

#[derive(Clone)]
struct ConversationTurn {
  role: String,
  text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBridgeRequest {
  op: String,
  runtime_mode: Option<String>,
  game_id: Option<String>,
  model_id: Option<String>,
  request: Option<RuntimeGenerateStructuredRequest>,
  texts: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeGenerateStructuredRequest {
  npc_id: String,
  npc_name: String,
  player_message: String,
  attempt: Option<u32>,
  repair: Option<bool>,
  npc_profile: Option<RuntimeNpcProfile>,
  global_safety_bounds: Option<Vec<String>>,
  context: Option<RuntimeGenerateContext>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeNpcProfile {
  persona: Option<String>,
  tone: Option<String>,
  constraints: Option<Vec<String>>,
  lore_scopes: Option<Vec<String>>,
  self_entity_id: Option<String>,
  self_lore_scopes: Option<Vec<String>>,
  related_lore_scopes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeGenerateContext {
  game_id: Option<String>,
  runtime_mode: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBridgeResponse {
  ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  detail: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  json_text: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  diagnostics: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  vectors: Option<Vec<Vec<f32>>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LoreChunk {
  chunk_id: Option<String>,
  page_id: Option<String>,
  content: Option<String>,
  summary: Option<String>,
  tokens: Option<Vec<String>>,
  metadata: Option<LoreChunkMetadata>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
struct LoreChunkMetadata {
  id: Option<String>,
  entity_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct LoreMatch {
  source_id: String,
  snippet: String,
  score: f32,
}

fn is_runtime_mode_mock(value: Option<&str>) -> bool {
  matches!(value.unwrap_or("llama").trim().to_lowercase().as_str(), "mock")
}

fn project_root() -> PathBuf {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest
    .parent()
    .map_or(manifest.clone(), Path::to_path_buf)
}

fn resolve_candidate_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  if let Ok(current) = std::env::current_dir() {
    roots.push(current);
  }
  if let Some(active_root) = read_active_game_root() {
    roots.push(active_root);
  }
  roots.push(project_root());
  if let Ok(resource_dir) = app.path().resource_dir() {
    roots.push(resource_dir);
  }

  let mut deduped = Vec::new();
  let mut seen = HashSet::new();
  for root in roots {
    let key = root.to_string_lossy().to_string();
    if seen.contains(&key) {
      continue;
    }
    seen.insert(key);
    deduped.push(root);
  }
  deduped
}

fn read_active_game_root() -> Option<PathBuf> {
  let active_game_file = project_root().join(".sugarengine/active-game.json");
  let Ok(raw) = fs::read_to_string(active_game_file) else {
    return None;
  };
  let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
    return None;
  };
  let root = parsed.get("rootPath")?.as_str()?.trim();
  if root.is_empty() {
    return None;
  }
  Some(PathBuf::from(root))
}

fn resolve_bundle_binary_path(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Ok(from_env) = std::env::var("SUGARAGENT_LLAMA_BIN") {
    let candidate = PathBuf::from(from_env);
    if candidate.exists() {
      return Some(candidate);
    }
  }

  let roots = resolve_candidate_roots(app);
  let mut relative_candidates: Vec<String> = LLAMA_BIN_CANDIDATES.iter().map(|entry| (*entry).to_string()).collect();
  relative_candidates.extend(load_lockfile_path_candidates(app, "runtime.binaryPath"));
  for root in roots {
    for rel in &relative_candidates {
      let candidate = root.join(rel);
      if candidate.exists() {
        return Some(candidate);
      }
    }
  }
  None
}

fn resolve_bundle_model_path(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Ok(from_env) = std::env::var("SUGARAGENT_MODEL_PATH") {
    let candidate = PathBuf::from(from_env);
    if candidate.exists() {
      return Some(candidate);
    }
  }

  let roots = resolve_candidate_roots(app);
  let mut relative_candidates: Vec<String> = MODEL_CANDIDATES.iter().map(|entry| (*entry).to_string()).collect();
  relative_candidates.extend(load_lockfile_path_candidates(app, "model.modelPath"));
  for root in roots {
    for rel in &relative_candidates {
      let candidate = root.join(rel);
      if candidate.exists() {
        return Some(candidate);
      }
    }
  }
  None
}

fn load_lockfile_path_candidates(app: &tauri::AppHandle, pointer: &str) -> Vec<String> {
  let roots = resolve_candidate_roots(app);
  let mut candidates = Vec::new();
  for root in roots {
    let lock = root.join("src/plugins/sugaragent/runtime/bundle/bundle.lock.json");
    let Ok(raw) = fs::read_to_string(lock) else {
      continue;
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
      continue;
    };
    let mut cursor = &parsed;
    for token in pointer.split('.') {
      let Some(next) = cursor.get(token) else {
        cursor = &Value::Null;
        break;
      };
      cursor = next;
    }
    if let Some(path) = cursor.as_str() {
      let trimmed = path.trim();
      if !trimmed.is_empty() {
        candidates.push(trimmed.to_string());
      }
    }
  }
  candidates
}

fn resolve_lore_chunks_path(app: &tauri::AppHandle, game_id: &str) -> Option<PathBuf> {
  let roots = resolve_candidate_roots(app);
  let mut game_candidates = Vec::new();
  if !game_id.trim().is_empty() {
    game_candidates.push("plugins/sugaragent/lore/generated/chunks.json".to_string());
    game_candidates.push(format!("public/games/{game_id}/plugins/sugaragent/lore/generated/chunks.json"));
  }

  for root in roots {
    for candidate in &game_candidates {
      let path = root.join(candidate);
      if path.exists() {
        return Some(path);
      }
    }
  }
  None
}

fn tokenize(text: &str) -> Vec<String> {
  let stop_words = [
    "a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from", "how", "i", "in", "is",
    "it", "its", "me", "my", "of", "on", "or", "that", "the", "to", "was", "what", "when", "where",
    "who", "why", "with", "you", "your",
  ];
  let stop: HashSet<&str> = stop_words.into_iter().collect();
  text
    .to_lowercase()
    .chars()
    .map(|ch| if ch.is_alphanumeric() || ch == '-' || ch == '\'' { ch } else { ' ' })
    .collect::<String>()
    .split_whitespace()
    .map(str::trim)
    .filter(|token| token.len() > 2 && !stop.contains(*token))
    .map(ToString::to_string)
    .collect()
}

fn normalize_string_list(values: Option<&Vec<String>>) -> Vec<String> {
  values
    .map(|entries| {
      entries
        .iter()
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<String>>()
    })
    .unwrap_or_default()
}

fn chunk_matches_scopes(chunk: &LoreChunk, scopes: &[String]) -> bool {
  if scopes.is_empty() {
    return true;
  }
  let chunk_id = chunk.chunk_id.as_deref().unwrap_or_default();
  let page_id = chunk.page_id.as_deref().unwrap_or_default();
  let metadata_id = chunk
    .metadata
    .as_ref()
    .and_then(|meta| meta.id.as_deref())
    .unwrap_or_default();

  scopes.iter().any(|scope| {
    chunk_id.starts_with(scope) || page_id.starts_with(scope) || metadata_id.starts_with(scope)
  })
}

fn score_chunk(chunk: &LoreChunk, query_tokens: &[String], self_entity_id: Option<&str>) -> f32 {
  if query_tokens.is_empty() {
    return 0.0;
  }
  let mut score = 0.0_f32;

  let mut chunk_tokens: HashSet<String> = HashSet::new();
  if let Some(tokens) = &chunk.tokens {
    for token in tokens {
      chunk_tokens.insert(token.to_lowercase());
    }
  } else if let Some(content) = &chunk.content {
    for token in tokenize(content) {
      chunk_tokens.insert(token);
    }
  }

  for token in query_tokens {
    if chunk_tokens.contains(token) {
      score += 1.0;
    } else if let Some(content) = &chunk.content {
      if content.to_lowercase().contains(token) {
        score += 0.35;
      }
    }
  }

  if let Some(entity_id) = self_entity_id {
    if let Some(entity_ids) = chunk
      .metadata
      .as_ref()
      .and_then(|metadata| metadata.entity_ids.as_ref())
    {
      if entity_ids.iter().any(|value| value == entity_id) {
        score += 0.6;
      }
    }
  }

  score
}

fn retrieve_lore_matches(
  app: &tauri::AppHandle,
  game_id: &str,
  request: &RuntimeGenerateStructuredRequest,
  max_results: usize,
) -> Vec<LoreMatch> {
  let query_tokens = tokenize(&request.player_message);
  if query_tokens.is_empty() {
    return Vec::new();
  }

  let Some(path) = resolve_lore_chunks_path(app, game_id) else {
    return Vec::new();
  };
  let Ok(raw) = fs::read_to_string(path) else {
    return Vec::new();
  };
  let Ok(chunks) = serde_json::from_str::<Vec<LoreChunk>>(&raw) else {
    return Vec::new();
  };

  let profile = request.npc_profile.as_ref();
  let mut scopes = Vec::new();
  scopes.extend(normalize_string_list(profile.and_then(|entry| entry.self_lore_scopes.as_ref())));
  scopes.extend(normalize_string_list(profile.and_then(|entry| entry.related_lore_scopes.as_ref())));
  scopes.extend(normalize_string_list(profile.and_then(|entry| entry.lore_scopes.as_ref())));
  let self_entity_id = profile.and_then(|entry| entry.self_entity_id.as_deref());

  let mut scored: Vec<LoreMatch> = chunks
    .into_iter()
    .filter(|chunk| chunk_matches_scopes(chunk, &scopes))
    .filter_map(|chunk| {
      let score = score_chunk(&chunk, &query_tokens, self_entity_id);
      if score <= 0.0 {
        return None;
      }
      let source_id = chunk.chunk_id.unwrap_or_else(|| "unknown".to_string());
      let base_text = chunk
        .summary
        .or(chunk.content)
        .unwrap_or_else(|| "".to_string());
      let snippet = base_text
        .trim()
        .chars()
        .take(220)
        .collect::<String>();
      if snippet.is_empty() {
        return None;
      }
      Some(LoreMatch {
        source_id,
        snippet,
        score,
      })
    })
    .collect();

  scored.sort_by(|a, b| {
    b.score
      .partial_cmp(&a.score)
      .unwrap_or(std::cmp::Ordering::Equal)
  });
  scored.truncate(max_results);
  scored
}

fn build_prompt(
  request: &RuntimeGenerateStructuredRequest,
  history: &[ConversationTurn],
  lore_matches: &[LoreMatch],
) -> String {
  let mut lines = Vec::new();
  lines.push(format!("You are {}, an NPC in a game.", request.npc_name.trim()));
  lines.push("Reply naturally to the player message.".to_string());
  lines.push("Respond in the same language as the player message unless asked to switch languages.".to_string());
  lines.push("If the player message is English, respond in English.".to_string());
  lines.push("Never mirror the player message verbatim.".to_string());
  lines.push("Keep utterance concise (1-2 sentences).".to_string());

  if let Some(profile) = &request.npc_profile {
    if let Some(persona) = &profile.persona {
      if !persona.trim().is_empty() {
        lines.push(format!("Persona: {}", persona.trim()));
      }
    }
    if let Some(tone) = &profile.tone {
      if !tone.trim().is_empty() {
        lines.push(format!("Tone: {}", tone.trim()));
      }
    }
    let constraints = normalize_string_list(profile.constraints.as_ref());
    if !constraints.is_empty() {
      lines.push(format!("Constraints: {}", constraints.join(" | ")));
    }
  }

  let global_bounds = normalize_string_list(request.global_safety_bounds.as_ref());
  if !global_bounds.is_empty() {
    lines.push(format!("Global safety bounds: {}", global_bounds.join(" | ")));
  }

  if !lore_matches.is_empty() {
    lines.push("Relevant lore evidence (use only when applicable):".to_string());
    for lore in lore_matches {
      lines.push(format!("- [{}] {}", lore.source_id, lore.snippet));
    }
    lines.push("If evidence is weak or absent, say you are not sure instead of inventing facts.".to_string());
  }

  if !history.is_empty() {
    lines.push("Recent conversation:".to_string());
    for turn in history.iter().rev().take(8).rev() {
      lines.push(format!("{}: {}", turn.role, turn.text));
    }
  }

  lines.push("Return ONLY valid JSON with these keys:".to_string());
  lines.push("- utterance: NPC reply text".to_string());
  lines.push("- emotion: short lowercase tag".to_string());
  lines.push("- intent: short lowercase tag".to_string());
  lines.push("- proposedIntents: array (use [] when none)".to_string());
  lines.push("- citations: array of { sourceId, snippet? } (use [] when none)".to_string());
  lines.push("Do not wrap JSON in markdown. Return one JSON object only.".to_string());

  if request.repair.unwrap_or(false) {
    lines.push("Previous attempt was invalid JSON/schema. Rewrite and return strict JSON only.".to_string());
  }
  lines.push(format!("attempt={}", request.attempt.unwrap_or(1)));
  lines.push(format!("Current player message: {}", request.player_message.trim()));
  lines.join("\n")
}

fn extract_json_candidates(text: &str) -> Vec<String> {
  let bytes = text.as_bytes();
  let mut candidates = Vec::new();
  let mut start: Option<usize> = None;
  let mut depth = 0_i32;
  let mut in_string = false;
  let mut escaped = false;

  for (index, byte) in bytes.iter().enumerate() {
    let ch = *byte as char;
    if in_string {
      if escaped {
        escaped = false;
      } else if ch == '\\' {
        escaped = true;
      } else if ch == '"' {
        in_string = false;
      }
      continue;
    }

    match ch {
      '"' => in_string = true,
      '{' => {
        if depth == 0 {
          start = Some(index);
        }
        depth += 1;
      }
      '}' => {
        if depth > 0 {
          depth -= 1;
          if depth == 0 {
            if let Some(open) = start {
              let slice = &text[open..=index];
              candidates.push(slice.to_string());
            }
            start = None;
          }
        }
      }
      _ => {}
    }
  }

  candidates
}

fn make_fallback_turn() -> Value {
  json!({
    "utterance": "I cannot respond right now. Please try again.",
    "emotion": "neutral",
    "intent": "abstain",
    "proposedIntents": [],
    "citations": []
  })
}

fn normalize_turn_json(raw: &str, lore_matches: &[LoreMatch]) -> String {
  let candidates = extract_json_candidates(raw);
  let mut parsed = candidates
    .iter()
    .find_map(|candidate| serde_json::from_str::<Value>(candidate).ok())
    .or_else(|| serde_json::from_str::<Value>(raw).ok())
    .unwrap_or_else(make_fallback_turn);

  if !parsed.is_object() {
    parsed = make_fallback_turn();
  }
  let object = parsed.as_object_mut().expect("turn output should be object");

  let utterance = object
    .get("utterance")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|entry| !entry.is_empty())
    .map(ToString::to_string)
    .unwrap_or_else(|| "I am not sure right now.".to_string());
  object.insert("utterance".to_string(), Value::String(utterance));

  let emotion = object
    .get("emotion")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|entry| !entry.is_empty())
    .map(ToString::to_string)
    .unwrap_or_else(|| "neutral".to_string());
  object.insert("emotion".to_string(), Value::String(emotion));

  let intent = object
    .get("intent")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|entry| !entry.is_empty())
    .map(ToString::to_string)
    .unwrap_or_else(|| "conversation".to_string());
  object.insert("intent".to_string(), Value::String(intent));

  let proposed_intents = object
    .get("proposedIntents")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  object.insert("proposedIntents".to_string(), Value::Array(proposed_intents));

  let mut citations = object
    .get("citations")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default()
    .into_iter()
    .filter_map(|entry| {
      if let Some(source_id) = entry.get("sourceId").and_then(Value::as_str) {
        if source_id.trim().is_empty() {
          return None;
        }
        return Some(json!({
          "sourceId": source_id.trim(),
          "snippet": entry.get("snippet").and_then(Value::as_str).unwrap_or("").trim(),
        }));
      }
      if let Some(as_str) = entry.as_str() {
        if as_str.trim().is_empty() {
          return None;
        }
        return Some(json!({ "sourceId": as_str.trim() }));
      }
      None
    })
    .collect::<Vec<Value>>();

  if citations.is_empty() && !lore_matches.is_empty() {
    citations = lore_matches
      .iter()
      .take(2)
      .map(|entry| {
        json!({
          "sourceId": entry.source_id,
          "snippet": entry.snippet,
        })
      })
      .collect();
  }
  object.insert("citations".to_string(), Value::Array(citations));

  object.remove("beatEvidence");
  serde_json::to_string(&parsed).unwrap_or_else(|_| "{\"utterance\":\"I am not sure right now.\",\"emotion\":\"neutral\",\"intent\":\"conversation\",\"proposedIntents\":[],\"citations\":[]}".to_string())
}

fn extract_utterance(json_text: &str) -> Option<String> {
  let parsed = serde_json::from_str::<Value>(json_text).ok()?;
  parsed
    .get("utterance")
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|entry| !entry.is_empty())
    .map(ToString::to_string)
}

fn run_llama_generate(command_path: &Path, model_path: &Path, prompt: &str, attempt: u32) -> Result<String, String> {
  let mut args = vec![
    "-m".to_string(),
    model_path.to_string_lossy().to_string(),
    "--device".to_string(),
    "none".to_string(),
    "--single-turn".to_string(),
    "--no-display-prompt".to_string(),
    "--color".to_string(),
    "off".to_string(),
    "--json-schema".to_string(),
    TURN_JSON_SCHEMA.to_string(),
    "-n".to_string(),
    "140".to_string(),
    "--ctx-size".to_string(),
    "2048".to_string(),
    "--temp".to_string(),
    if attempt >= 3 {
      "0.95".to_string()
    } else if attempt == 2 {
      "0.75".to_string()
    } else {
      "0.55".to_string()
    },
    "--top-k".to_string(),
    "60".to_string(),
    "--top-p".to_string(),
    "0.92".to_string(),
    "--repeat-penalty".to_string(),
    "1.15".to_string(),
    "--presence-penalty".to_string(),
    "0.3".to_string(),
    "--frequency-penalty".to_string(),
    "0.25".to_string(),
    "--no-warmup".to_string(),
  ];

  let command_name = command_path
    .file_name()
    .and_then(|entry| entry.to_str())
    .unwrap_or_default();
  if command_name == "llama-completion" {
    args.push("--no-conversation".to_string());
  }

  args.push("-p".to_string());
  args.push(prompt.to_string());

  let output = Command::new(command_path)
    .args(args)
    .output()
    .map_err(|error| format!("failed to run llama runtime: {error}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  let combined = format!("{stdout}\n{stderr}");
  if combined.trim().is_empty() {
    return Err("llama runtime returned empty output".to_string());
  }
  Ok(combined)
}

fn build_mock_response(player_message: &str) -> String {
  serde_json::to_string(&json!({
    "utterance": format!("I heard you say: \"{}\".", player_message.trim()),
    "emotion": "warm",
    "intent": "conversation",
    "proposedIntents": [],
    "citations": [],
  }))
  .unwrap_or_else(|_| "{\"utterance\":\"I heard you.\",\"emotion\":\"warm\",\"intent\":\"conversation\",\"proposedIntents\":[],\"citations\":[]}".to_string())
}

fn conversation_key(game_id: &str, npc_id: &str) -> String {
  format!("{}::{}", game_id.trim(), npc_id.trim())
}

fn trim_history(entries: &mut Vec<ConversationTurn>) {
  const MAX_HISTORY_TURNS: usize = 16;
  if entries.len() > MAX_HISTORY_TURNS {
    let start = entries.len() - MAX_HISTORY_TURNS;
    entries.drain(0..start);
  }
}

#[tauri::command]
async fn sugaragent_runtime_bridge(
  app: tauri::AppHandle,
  state: tauri::State<'_, Mutex<SugarAgentRuntimeState>>,
  request: RuntimeBridgeRequest,
) -> Result<RuntimeBridgeResponse, String> {
  let runtime_mode_input = request
    .runtime_mode
    .as_deref()
    .or_else(|| request.request.as_ref().and_then(|inner| inner.context.as_ref()).and_then(|ctx| ctx.runtime_mode.as_deref()));
  let mock_mode = is_runtime_mode_mock(runtime_mode_input);

  match request.op.trim() {
    "health" => {
      if mock_mode {
        return Ok(RuntimeBridgeResponse {
          ok: true,
          detail: Some("mock-runtime-ready".to_string()),
          json_text: None,
          diagnostics: None,
          vectors: None,
        });
      }
      let Some(command_path) = resolve_bundle_binary_path(&app) else {
        return Ok(RuntimeBridgeResponse {
          ok: false,
          detail: Some("llama binary not found".to_string()),
          json_text: None,
          diagnostics: None,
          vectors: None,
        });
      };
      let Some(model_path) = resolve_bundle_model_path(&app) else {
        return Ok(RuntimeBridgeResponse {
          ok: false,
          detail: Some("model file not found".to_string()),
          json_text: None,
          diagnostics: None,
          vectors: None,
        });
      };
      Ok(RuntimeBridgeResponse {
        ok: command_path.exists() && model_path.exists(),
        detail: Some("llama-runtime-ready".to_string()),
        json_text: None,
        diagnostics: None,
        vectors: None,
      })
    }
    "loadModel" => {
      let _ = request.model_id;
      if mock_mode {
        let mut guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
        guard.loaded_model_path = Some(PathBuf::from("__mock__"));
        return Ok(RuntimeBridgeResponse {
          ok: true,
          detail: Some("mock model loaded".to_string()),
          json_text: None,
          diagnostics: None,
          vectors: None,
        });
      }
      let Some(model_path) = resolve_bundle_model_path(&app) else {
        return Err("model file not found".to_string());
      };
      if !model_path.exists() {
        return Err(format!("model file not found: {}", model_path.to_string_lossy()));
      }
      let mut guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
      guard.loaded_model_path = Some(model_path);
      Ok(RuntimeBridgeResponse {
        ok: true,
        detail: Some("model ready".to_string()),
        json_text: None,
        diagnostics: None,
        vectors: None,
      })
    }
    "generateStructured" => {
      let Some(inner) = request.request else {
        return Err("Missing request for generateStructured".to_string());
      };
      if inner.player_message.trim().is_empty() {
        return Err("Missing playerMessage".to_string());
      }

      let context_game_id = inner
        .context
        .as_ref()
        .and_then(|ctx| ctx.game_id.as_deref())
        .unwrap_or_else(|| request.game_id.as_deref().unwrap_or("default"));
      let session_key = conversation_key(context_game_id, &inner.npc_id);

      let history_snapshot = {
        let guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
        guard.conversations.get(&session_key).cloned().unwrap_or_default()
      };

      let lore_bundle_available = resolve_lore_chunks_path(&app, context_game_id).is_some();
      let lore_matches = retrieve_lore_matches(&app, context_game_id, &inner, 3);
      let prompt = build_prompt(&inner, &history_snapshot, &lore_matches);
      let attempt = inner.attempt.unwrap_or(1);

      let normalized_json = if mock_mode {
        normalize_turn_json(&build_mock_response(&inner.player_message), &lore_matches)
      } else {
        let command_path = resolve_bundle_binary_path(&app)
          .ok_or_else(|| "llama binary not found".to_string())?;
        let model_path = {
          let mut guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
          if guard.loaded_model_path.is_none() {
            guard.loaded_model_path = resolve_bundle_model_path(&app);
          }
          guard
            .loaded_model_path
            .clone()
            .ok_or_else(|| "model file not found".to_string())?
        };
        let raw_output = tauri::async_runtime::spawn_blocking(move || {
          run_llama_generate(&command_path, &model_path, &prompt, attempt)
        })
        .await
        .map_err(|join_error| format!("llama runtime task failed: {join_error}"))??;
        normalize_turn_json(&raw_output, &lore_matches)
      };

      let npc_utterance = extract_utterance(&normalized_json);
      {
        let mut guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
        let entry = guard.conversations.entry(session_key).or_default();
        entry.push(ConversationTurn {
          role: "player".to_string(),
          text: inner.player_message.trim().to_string(),
        });
        if let Some(utterance) = npc_utterance {
          entry.push(ConversationTurn {
            role: "npc".to_string(),
            text: utterance,
          });
        }
        trim_history(entry);
      }

      let diagnostics = json!({
        "runtime": "tauri-llama",
        "loreMatchCount": lore_matches.len(),
        "mode": inner.context.as_ref().and_then(|ctx| ctx.runtime_mode.clone()).unwrap_or_else(|| "llama".to_string()),
        "retrieval": {
          "attempted": true,
          "candidateCount": lore_matches.len(),
          "selectedCount": lore_matches.len(),
          "qualityPath": if !lore_bundle_available { "error" } else if lore_matches.is_empty() { "abstain" } else { "single_pass" },
          "qualityReason": if !lore_bundle_available { "missing_game_lore_bundle" } else if lore_matches.is_empty() { "no-lore-selected" } else { "lore-selected" },
          "correctiveAttempted": false,
        },
      });
      Ok(RuntimeBridgeResponse {
        ok: true,
        detail: Some("provider-ok".to_string()),
        json_text: Some(normalized_json),
        diagnostics: Some(diagnostics),
        vectors: None,
      })
    }
    "embed" => {
      let texts = request.texts.unwrap_or_default();
      Ok(RuntimeBridgeResponse {
        ok: true,
        detail: None,
        json_text: None,
        diagnostics: None,
        vectors: Some(texts.iter().map(|_| vec![0.0, 0.0, 0.0]).collect()),
      })
    }
    "unloadModel" => {
      let _ = request.model_id;
      let mut guard = state.lock().map_err(|_| "runtime state lock poisoned".to_string())?;
      guard.loaded_model_path = None;
      guard.conversations.clear();
      Ok(RuntimeBridgeResponse {
        ok: true,
        detail: Some("runtime cache cleared".to_string()),
        json_text: None,
        diagnostics: None,
        vectors: None,
      })
    }
    _ => Err("Unknown op".to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(SugarAgentRuntimeState::default()))
    .invoke_handler(tauri::generate_handler![sugaragent_runtime_bridge])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
