export function cosineSimilarity(left: unknown, right: unknown): number {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
    return 0;
  }

  const dimension = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < dimension; index += 1) {
    const leftValue = typeof left[index] === 'number' && Number.isFinite(left[index]) ? Number(left[index]) : 0;
    const rightValue = typeof right[index] === 'number' && Number.isFinite(right[index]) ? Number(right[index]) : 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude <= 0 || rightMagnitude <= 0) return 0;
  const similarity = dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
  return Number(Math.max(-1, Math.min(1, similarity)).toFixed(6));
}

export function maxCosineSimilarity(
  queryVector: unknown,
  candidateVectors: unknown,
): number {
  if (!Array.isArray(candidateVectors) || candidateVectors.length === 0) return 0;
  let best = -1;
  for (const vector of candidateVectors) {
    const similarity = cosineSimilarity(queryVector, vector);
    if (similarity > best) best = similarity;
  }
  return Number(Math.max(0, best).toFixed(6));
}
