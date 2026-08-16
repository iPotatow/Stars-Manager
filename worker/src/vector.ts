import { ApiError, json, readJson } from './http';

interface VectorRequest extends Record<string, unknown> {
  vectors?: VectorizeVector[];
  vector?: number[];
  ids?: string[];
  topK?: number;
  threshold?: number;
}

function requireNumberVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new ApiError(400, 'INVALID_VECTOR', 'vector must be a non-empty array of finite numbers');
  }
  return value;
}

function requireIds(value: unknown, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item)) {
    throw new ApiError(400, 'INVALID_VECTOR_IDS', 'ids must be an array of non-empty strings');
  }
  return value;
}

function requireVectors(value: unknown): VectorizeVector[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, 'INVALID_VECTORS', 'vectors must be a non-empty array');
  }
  for (const vector of value) {
    if (!vector || typeof vector !== 'object' || typeof vector.id !== 'string') {
      throw new ApiError(400, 'INVALID_VECTORS', 'each vector must include a string id');
    }
    requireNumberVector(vector.values);
  }
  return value as VectorizeVector[];
}

export async function handleVectorRoute(
  request: Request,
  index: VectorizeIndex,
  url: URL,
): Promise<Response | null> {
  const base = '/api/vector';
  if (!url.pathname.startsWith(base)) return null;

  if (url.pathname === `${base}/status` && request.method === 'GET') {
    const info = await index.describe();
    return json({
      success: true,
      vectorCount: info.vectorsCount ?? 0,
      dimensions: 'dimensions' in info.config ? info.config.dimensions : 0,
    });
  }

  if (request.method !== 'POST') {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Vector operations require POST');
  }
  const body = await readJson<VectorRequest>(request);

  if (url.pathname === `${base}/upsert`) {
    const vectors = requireVectors(body.vectors);
    await index.upsert(vectors);
    return json({ success: true, upserted: vectors.length });
  }

  if (url.pathname === `${base}/query`) {
    const vector = requireNumberVector(body.vector);
    const topK = Number.isInteger(body.topK) ? Math.min(50, Math.max(1, Number(body.topK))) : 20;
    const threshold = typeof body.threshold === 'number' && Number.isFinite(body.threshold)
      ? Math.min(1, Math.max(0, body.threshold))
      : 0.35;
    const matches = await index.query(vector, { topK, returnMetadata: 'all' });
    return json({
      success: true,
      matches: matches.matches.filter((match) => match.score >= threshold),
    });
  }

  if (url.pathname === `${base}/delete`) {
    const ids = requireIds(body.ids);
    await index.deleteByIds(ids);
    return json({ success: true, deleted: ids.length });
  }

  throw new ApiError(404, 'NOT_FOUND', 'Vector endpoint not found');
}
