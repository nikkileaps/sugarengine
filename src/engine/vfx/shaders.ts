/**
 * Particle Shaders
 *
 * Vertex shader handles billboarding and instance attributes.
 * Fragment shader handles color blending and alpha.
 */

/**
 * Vertex shader for instanced particle rendering
 *
 * Instance attributes:
 * - instancePosition: vec3 - Particle world position
 * - instanceColor: vec3 - Particle color (RGB 0-1)
 * - instanceData: vec2 - [size, lifeProgress (0-1)]
 */
export const particleVertexShader = /* glsl */ `
  attribute vec3 instancePosition;
  attribute vec3 instanceColor;
  attribute vec2 instanceData; // x = size, y = lifeProgress

  uniform float sizeOverLife;
  uniform vec3 colorEnd;
  uniform float opacity;

  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    float size = instanceData.x;
    float life = instanceData.y;

    // Size over lifetime
    float sizeMultiplier = mix(1.0, sizeOverLife, life);
    float finalSize = size * sizeMultiplier;

    // Color gradient over lifetime
    vColor = mix(instanceColor, colorEnd, life);

    // Alpha fades out over lifetime
    vAlpha = opacity * (1.0 - life);

    // Billboard: make quad always face camera
    vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    // Offset from center based on vertex position
    vec3 vertexOffset = cameraRight * position.x * finalSize + cameraUp * position.y * finalSize;
    vec3 worldPos = instancePosition + vertexOffset;

    // UV for potential sprite/circle rendering
    vUv = uv;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

/**
 * Fragment shader for particle rendering
 *
 * Renders a soft circle with color and alpha from vertex shader.
 */
export const particleFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;

  uniform bool useCircle;

  void main() {
    float alpha = vAlpha;

    if (useCircle) {
      // Soft circle based on UV distance from center
      vec2 center = vec2(0.5, 0.5);
      float dist = length(vUv - center);
      float circle = 1.0 - smoothstep(0.3, 0.5, dist);
      alpha *= circle;
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;

/**
 * Simple vertex shader for THREE.Points
 */
export const pointsVertexShader = /* glsl */ `
  attribute float instanceSize;
  attribute vec3 instanceColor;
  attribute float instanceLife;

  uniform float sizeOverLife;
  uniform vec3 colorEnd;
  uniform float opacity;
  uniform float baseSize;
  uniform bool useSparkle;
  uniform float time;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSparkle;

  // Simple hash for per-particle randomness
  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    float life = instanceLife;

    // Size over lifetime
    float sizeMultiplier = mix(1.0, sizeOverLife, life);
    float finalSize = instanceSize * sizeMultiplier * baseSize;

    // Color gradient over lifetime
    vColor = mix(instanceColor, colorEnd, life);

    // Alpha fades out over lifetime
    float baseAlpha = opacity * (1.0 - life * life); // Quadratic fade for longer visibility

    if (useSparkle) {
      // Create unique random seed from position
      float seed = position.x * 12.9898 + position.y * 78.233 + position.z * 45.164;

      // Twinkle: oscillate size and brightness with sine waves
      float twinkleSpeed1 = 8.0 + hash(seed) * 12.0; // 8-20 Hz
      float twinkleSpeed2 = 15.0 + hash(seed + 1.0) * 10.0; // 15-25 Hz

      float twinkle1 = sin(time * twinkleSpeed1 + hash(seed + 2.0) * 6.28) * 0.5 + 0.5;
      float twinkle2 = sin(time * twinkleSpeed2 + hash(seed + 3.0) * 6.28) * 0.3 + 0.7;

      float twinkle = twinkle1 * twinkle2;

      // Apply twinkle to size
      finalSize *= (0.5 + twinkle * 0.8);

      // Pass twinkle to fragment for brightness
      vSparkle = twinkle;
      vAlpha = baseAlpha * (0.6 + twinkle * 0.4);
    } else {
      vSparkle = 1.0;
      vAlpha = baseAlpha;
    }

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = finalSize * (300.0 / -mvPosition.z);
  }
`;

/**
 * Fragment shader for THREE.Points
 */
export const pointsFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSparkle;

  uniform bool useSparkle;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);

    float shape;

    if (useSparkle) {
      // Sparkle: bright center + cross rays that twinkle
      float center = 1.0 - smoothstep(0.0, 0.12, dist);

      // Cross rays (+ shape) - intensity varies with twinkle
      float rayIntensity = 0.5 + vSparkle * 0.5;
      float rayX = exp(-abs(uv.y) * 12.0) * exp(-abs(uv.x) * 2.5) * rayIntensity;
      float rayY = exp(-abs(uv.x) * 12.0) * exp(-abs(uv.y) * 2.5) * rayIntensity;

      // Diagonal rays (× shape)
      vec2 uvRot = vec2(uv.x + uv.y, uv.x - uv.y) * 0.707;
      float rayD1 = exp(-abs(uvRot.y) * 18.0) * exp(-abs(uvRot.x) * 4.0) * rayIntensity * 0.6;
      float rayD2 = exp(-abs(uvRot.x) * 18.0) * exp(-abs(uvRot.y) * 4.0) * rayIntensity * 0.6;

      // Soft glow
      float glow = exp(-dist * 5.0) * 0.25;

      shape = center + rayX + rayY + rayD1 + rayD2 + glow;
      shape = clamp(shape, 0.0, 1.0);

      // Boost brightness for sparkle
      shape *= (0.8 + vSparkle * 0.4);
    } else {
      // Soft circle
      shape = 1.0 - smoothstep(0.3, 0.5, dist);
    }

    float alpha = vAlpha * shape;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;
