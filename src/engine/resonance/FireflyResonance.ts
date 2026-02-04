/**
 * FireflyResonance - Game logic for the firefly pattern recognition mini-game
 */

import type {
  ResonanceDifficulty,
  FireflyPattern,
  Trajectory,
  TrajectoryPoint,
  TrajectoryOption,
} from './types';

// Pattern generation parameters by difficulty
const DIFFICULTY_PARAMS = {
  easy: {
    speed: 0.8,           // Animation speed multiplier
    complexity: 1,        // Path complexity (1 = simple curves)
    fireflies: 5,
    duration: 4,          // Animation duration in seconds
    decoys: 2,            // Number of decoy options similar to correct
    distractionPatterns: 1,  // Number of false patterns that emerge but don't match options
  },
  medium: {
    speed: 1.0,
    complexity: 2,        // More complex paths
    fireflies: 5,
    duration: 3.5,
    decoys: 3,
    distractionPatterns: 2,
  },
  hard: {
    speed: 1.3,
    complexity: 3,        // Most complex paths
    fireflies: 5,
    duration: 3,
    decoys: 3,
    distractionPatterns: 3,
  },
};

// Firefly colors
const FIREFLY_COLORS = [
  '#ffeb3b',  // Yellow
  '#4caf50',  // Green
  '#2196f3',  // Blue
  '#e91e63',  // Pink
  '#ff9800',  // Orange
];

// Path pattern types
type PathType = 'line' | 'curve' | 'loop' | 'figure8' | 'spiral' | 'zigzag';

const PATH_TYPES_BY_COMPLEXITY: Record<number, PathType[]> = {
  1: ['line', 'curve'],
  2: ['curve', 'loop', 'zigzag'],
  3: ['loop', 'figure8', 'spiral', 'zigzag'],
};

/**
 * Generate a random firefly pattern for the mini-game
 */
export function generatePattern(difficulty: ResonanceDifficulty): FireflyPattern {
  const params = DIFFICULTY_PARAMS[difficulty];
  const patternId = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Generate trajectories for each firefly
  const trajectories: Trajectory[] = [];
  const availablePathTypes = PATH_TYPES_BY_COMPLEXITY[params.complexity] || ['curve'];

  for (let i = 0; i < params.fireflies; i++) {
    const pathType = availablePathTypes[Math.floor(Math.random() * availablePathTypes.length)]!;
    const trajectory = generateTrajectory(pathType, params.duration, params.speed);
    trajectory.color = FIREFLY_COLORS[i % FIREFLY_COLORS.length]!;
    trajectories.push(trajectory);
  }

  // Generate the correct answer option (based on the actual trajectory)
  const correctOption = trajectoryToOption(trajectories[0]!, 'A');

  // Generate 3 decoy options
  const decoyOptions: TrajectoryOption[] = [];
  const labels = ['B', 'C', 'D'];

  for (let i = 0; i < 3; i++) {
    const decoyPathType = availablePathTypes[Math.floor(Math.random() * availablePathTypes.length)]!;
    const decoyTrajectory = generateTrajectory(decoyPathType, params.duration, params.speed);
    decoyOptions.push(trajectoryToOption(decoyTrajectory, labels[i]!));
  }

  // Randomize option order and track correct answer index
  const allOptions = [correctOption, ...decoyOptions];
  const shuffled = shuffleArray(allOptions);
  const correctIndex = shuffled.findIndex((opt) => opt.label === 'A');

  // Relabel options after shuffle
  shuffled.forEach((opt, i) => {
    opt.label = ['A', 'B', 'C', 'D'][i]!;
  });

  // Generate distraction trajectories - patterns that emerge but don't match any option
  // These use different path types to ensure they look distinct from the options
  const distractionTrajectories: Trajectory[] = [];
  const usedPathTypes = new Set<PathType>();

  // Track what path types we've used in options to avoid them
  // (We don't have direct access but we regenerate different types)
  for (let i = 0; i < params.distractionPatterns; i++) {
    // Pick path types not commonly used, or use variations
    const distractionPathTypes: PathType[] = ['spiral', 'figure8', 'loop', 'zigzag'];
    let pathType: PathType;

    // Try to pick unique path types for each distraction
    do {
      pathType = distractionPathTypes[Math.floor(Math.random() * distractionPathTypes.length)]!;
    } while (usedPathTypes.has(pathType) && usedPathTypes.size < distractionPathTypes.length);

    usedPathTypes.add(pathType);

    const distractionTraj = generateTrajectory(pathType, params.duration, params.speed);
    // Give distraction patterns distinct colors (more muted/different)
    const distractionColors = ['#88ccff', '#ff88cc', '#ccff88', '#ffcc88'];
    distractionTraj.color = distractionColors[i % distractionColors.length]!;
    distractionTrajectories.push(distractionTraj);
  }

  return {
    id: patternId,
    difficulty,
    trajectories,
    distractionTrajectories,
    correctAnswer: correctIndex,
    options: shuffled,
  };
}

/**
 * Check if the player's answer is correct
 */
export function checkAnswer(pattern: FireflyPattern, selectedIndex: number): boolean {
  return selectedIndex === pattern.correctAnswer;
}

/**
 * Generate a trajectory based on path type
 */
function generateTrajectory(
  pathType: PathType,
  duration: number,
  speedMult: number
): Trajectory {
  const points: TrajectoryPoint[] = [];
  const numPoints = 20;
  const effectiveDuration = duration / speedMult;

  // Canvas normalized coordinates (0-1)
  const centerX = 0.5;
  const centerY = 0.5;
  const radius = 0.3;

  switch (pathType) {
    case 'line': {
      const angle = Math.random() * Math.PI * 2;
      const startX = centerX + Math.cos(angle) * radius;
      const startY = centerY + Math.sin(angle) * radius;
      const endX = centerX + Math.cos(angle + Math.PI) * radius;
      const endY = centerY + Math.sin(angle + Math.PI) * radius;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        points.push({
          x: startX + (endX - startX) * t,
          y: startY + (endY - startY) * t,
          t: t * effectiveDuration,
        });
      }
      break;
    }

    case 'curve': {
      const startAngle = Math.random() * Math.PI * 2;
      const endAngle = startAngle + Math.PI * (0.5 + Math.random());
      const controlOffset = (Math.random() - 0.5) * 0.4;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = startAngle + (endAngle - startAngle) * t;
        const r = radius * (1 + Math.sin(t * Math.PI) * controlOffset);
        points.push({
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
          t: t * effectiveDuration,
        });
      }
      break;
    }

    case 'loop': {
      const startAngle = Math.random() * Math.PI * 2;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = startAngle + t * Math.PI * 2;
        const r = radius * (0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * 2)));
        points.push({
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
          t: t * effectiveDuration,
        });
      }
      break;
    }

    case 'figure8': {
      const scale = radius * 0.8;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = t * Math.PI * 2;
        points.push({
          x: centerX + Math.sin(angle) * scale,
          y: centerY + Math.sin(angle * 2) * scale * 0.5,
          t: t * effectiveDuration,
        });
      }
      break;
    }

    case 'spiral': {
      const turns = 1.5 + Math.random();
      const startAngle = Math.random() * Math.PI * 2;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const angle = startAngle + t * Math.PI * 2 * turns;
        const r = radius * (0.2 + 0.8 * t);
        points.push({
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
          t: t * effectiveDuration,
        });
      }
      break;
    }

    case 'zigzag': {
      const segments = 3 + Math.floor(Math.random() * 2);
      const amplitude = radius * 0.6;
      const direction = Math.random() > 0.5 ? 1 : -1;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const segment = Math.floor(t * segments);
        const segmentT = (t * segments) % 1;
        const zigzag = direction * (segment % 2 === 0 ? segmentT : 1 - segmentT);
        points.push({
          x: centerX - radius + t * radius * 2,
          y: centerY + zigzag * amplitude - amplitude * 0.5,
          t: t * effectiveDuration,
        });
      }
      break;
    }
  }

  return { points, color: '#ffffff' };
}

/**
 * Convert a trajectory to a simplified option preview
 */
function trajectoryToOption(trajectory: Trajectory, label: string): TrajectoryOption {
  // Sample every 4th point for the preview
  const previewPath = trajectory.points
    .filter((_, i) => i % 4 === 0)
    .map((p) => ({ x: p.x, y: p.y }));

  return { previewPath, label };
}

/**
 * Shuffle an array (Fisher-Yates)
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Get animation duration for a pattern
 */
export function getPatternDuration(pattern: FireflyPattern): number {
  const params = DIFFICULTY_PARAMS[pattern.difficulty];
  return params.duration / params.speed;
}

/**
 * Interpolate position along a trajectory at time t
 */
export function interpolateTrajectory(
  trajectory: Trajectory,
  time: number
): { x: number; y: number } {
  const points = trajectory.points;
  if (points.length === 0) return { x: 0.5, y: 0.5 };

  // Clamp time to trajectory duration
  const duration = points[points.length - 1]!.t;
  const loopedTime = time % duration;

  // Find surrounding keyframes
  let i = 0;
  while (i < points.length - 1 && points[i + 1]!.t < loopedTime) {
    i++;
  }

  if (i >= points.length - 1) {
    return { x: points[points.length - 1]!.x, y: points[points.length - 1]!.y };
  }

  const p0 = points[i]!;
  const p1 = points[i + 1]!;
  const t = (loopedTime - p0.t) / (p1.t - p0.t);

  return {
    x: p0.x + (p1.x - p0.x) * t,
    y: p0.y + (p1.y - p0.y) * t,
  };
}
