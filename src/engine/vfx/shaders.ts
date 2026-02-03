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

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float life = instanceLife;

    // Size over lifetime
    float sizeMultiplier = mix(1.0, sizeOverLife, life);
    float finalSize = instanceSize * sizeMultiplier * baseSize;

    // Color gradient over lifetime
    vColor = mix(instanceColor, colorEnd, life);

    // Alpha fades out over lifetime
    vAlpha = opacity * (1.0 - life);

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

  void main() {
    // Soft circle from point coordinate
    vec2 center = vec2(0.5, 0.5);
    float dist = length(gl_PointCoord - center);
    float circle = 1.0 - smoothstep(0.3, 0.5, dist);

    float alpha = vAlpha * circle;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`;
