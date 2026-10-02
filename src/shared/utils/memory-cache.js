/**
 * Scaled for 10k/50k users: Lightweight, zero-dependency in-memory TTL cache.
 * Eliminates redundant database hits for high-read static data (chapters, categories, settings).
 */

const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 5000;

export const memoryCache = {
  /**
   * Retrieves an item from cache if fresh, otherwise runs fetchFn, caches result, and returns it.
   * @param {string} key - Unique cache key
   * @param {number} ttlMs - Time to live in milliseconds
   * @param {Function} fetchFn - Async function returning fresh data
   */
  getOrSet: async (key, ttlMs, fetchFn) => {
    const entry = cacheStore.get(key);
    if (entry && Date.now() - entry.timestamp < ttlMs) {
      return entry.data;
    }

    const freshData = await fetchFn();

    // Prevent runaway memory usage
    if (cacheStore.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cacheStore.keys().next().value;
      if (firstKey) cacheStore.delete(firstKey);
    }

    cacheStore.set(key, { data: freshData, timestamp: Date.now() });
    return freshData;
  },

  /**
   * Invalidates cached keys matching an optional prefix/pattern
   * @param {string} [pattern] - Key or prefix to invalidate. If omitted, clears all.
   */
  invalidate: (pattern) => {
    if (!pattern) {
      cacheStore.clear();
      return;
    }
    for (const key of cacheStore.keys()) {
      if (key.includes(pattern)) {
        cacheStore.delete(key);
      }
    }
  },

  /**
   * Directly get cached data if valid
   */
  get: (key, ttlMs) => {
    const entry = cacheStore.get(key);
    if (entry && Date.now() - entry.timestamp < ttlMs) {
      return entry.data;
    }
    return null;
  },

  /**
   * Directly set cached data
   */
  set: (key, data) => {
    cacheStore.set(key, { data, timestamp: Date.now() });
  },
};

export default memoryCache;
