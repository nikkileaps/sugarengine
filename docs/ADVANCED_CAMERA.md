Technical Proposal: Perspective “Isometric-Style” Camera System
Status

Proposed

Context

The current camera implementation uses an OrthographicCamera wrapped in a custom IsometricCamera class. This worked well for a static or near-static isometric view but is no longer sufficient due to new requirements:

Player-controlled zoom in / out within a bounded range

Camera yaw rotation to reveal obscured geometry (e.g., “other side of the street”)

Limited pitch adjustment, while preserving an isometric-like feel

Smooth camera follow with inertia (no rigid locking)

Future need for occlusion handling (buildings, trees, props)

Orthographic projection becomes increasingly brittle as rotation, zoom, and occlusion are introduced. A constrained PerspectiveCamera provides a more robust long-term foundation while still supporting an isometric-like presentation.

Goals

Preserve the readability and vibe of an isometric camera

Enable controlled freedom (rotation, zoom, pitch)

Support modern camera behaviors (occlusion, collision, smoothing)

Keep camera math understandable, debuggable, and modular

Allow a smooth migration path from existing IsometricCamera

Non-Goals

Full free-look / action-camera behavior

Over-the-shoulder or low-angle perspectives

Complex cinematic camera cuts (for now)

Proposed Architecture
Camera Rig Hierarchy
Player
 └── CameraTarget        // smoothed follow point
      └── YawPivot      // rotates around Y axis
           └── PitchPivot  // rotates around X axis (clamped)
                └── Camera // PerspectiveCamera

Responsibilities

CameraTarget

Follows player position using smoothing (lerp / damping)

Acts as the anchor point (“long rope” metaphor)

YawPivot

Handles horizontal orbit (left/right rotation)

Controlled by player input or future auto-framing logic

PitchPivot

Handles vertical tilt

Strictly clamped to preserve isometric feel

Camera

Offset backward from target

Perspective projection

Zoom via FOV or distance adjustment

Camera Configuration (Initial Values)

These values are starting points, not absolutes.

Projection

PerspectiveCamera

FOV: 25°–35°

Lower than typical third-person cameras

Reduces distortion and preserves isometric readability

Pitch Limits

Minimum: 35° downward

Maximum: 55° downward

Default resting pitch: 45°

This keeps the camera visually “isometric-ish” while allowing slight tilt.

Yaw

Full 360° allowed (configurable)

Optional future constraint: snap or bias to cardinal angles

Distance / Zoom

Option A (recommended):

Adjust camera distance from target

Min distance: tuned for close-town interaction

Max distance: tuned to see intersections / plazas

Option B (alternate):

Fixed distance + FOV zoom

Slightly less intuitive for collision, but acceptable

Camera Follow & Smoothing
Position Follow

CameraTarget position updates via exponential smoothing:

cameraTarget.position.lerp(
  player.position,
  1 - Math.exp(-followStrength * deltaTime)
);


followStrength: ~6–10

Frame-rate independent

Produces “rope-like” lag without oscillation

Rotation Smoothing (Optional)

Yaw and pitch changes may be:

Immediate (for mouse input)

Or smoothed via angular lerp for controller / cinematic feel

Rotation smoothing should be separate from positional smoothing.

Input Binding

Default yaw rotation is manual and player-driven. The camera does not auto-rotate based on movement direction.

Mouse right-drag controls yaw rotation, with Q / R as keyboard alternatives (E is reserved for interact).

Rotation is deliberately slow and clamped to preserve an isometric-style feel.

This mirrors modern cozy RPGs such as Palia, avoids the disorientation of auto-rotation, and keeps camera orientation a conscious player choice rather than an implicit system behavior.

Snap-to-Cardinal (Optional)

The camera supports free yaw rotation via mouse drag or keyboard input.

An optional snap-to-cardinal system (45° increments) is supported and will be prototyped early.

Snapping behavior is applied only when rotation input ends, smoothly interpolating to the nearest cardinal angle if within a configurable threshold.

Keyboard rotation (Q / R) rotates the camera by fixed 45° steps.

This preserves a classic isometric feel while retaining player agency and avoiding forced camera motion.

System Integration (Future)

The camera will support special behaviors during dialogue and inspection sequences.

These behaviors are deferred until the base camera system is stable.

Planned integration points include NPC framing during dialogue and focus adjustments during inspection.

Occlusion Strategy (Future-Proofed)

Perspective camera enables multiple strategies:

Phase 1: Fade Occluders

Raycast from camera → player

Any intersecting meshes fade opacity or switch material

Common in cozy / RPG games

Phase 2: Camera Collision

Sphere cast from target backward along camera vector

Push camera closer if geometry blocks the view

The rig architecture supports both without refactoring.

Migration Plan
Step 1 — Parallel Implementation

Introduce PerspectiveIsometricCamera alongside existing IsometricCamera

Share input plumbing (zoom, rotate, follow)

Step 2 — Visual Parity

Match default ortho framing as closely as possible

Validate scale, UI readability, grid alignment

Step 3 — Switch Default

Make perspective camera the primary gameplay camera

Keep ortho as a fallback / debug mode if desired

Risks & Mitigations
Risk	Mitigation
Perspective “breaks” isometric look	Low FOV + pitch clamps
Motion sickness	Conservative smoothing + no camera roll
Over-engineering	Keep camera logic isolated in one module
Art assumptions	Test rotation early with real props
Why This Is the Right Long-Term Choice

Perspective scales better with 3D environments

Rotation feels natural instead of uncanny

Occlusion handling becomes tractable

Matches player expectations from modern cozy / RPG games

Keeps your isometric vibe as a stylistic constraint, not a technical limitation

Summary

Switching to a constrained PerspectiveCamera:

Solves real problems you are already encountering

Does not abandon your isometric identity

Unlocks better usability, clarity, and future features

This is not a risky pivot — it’s a controlled evolution.