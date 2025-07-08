export function getOrSetIfNotExists<K, V>(map: Map<K, V>, key: K, fallback: V) {
    const existingValue = map.get(key);
    if (existingValue) return existingValue;

    map.set(key, fallback);

    return fallback;
}

export function getOrThrow<K, V>(map: Map<K, V>, key: K, error: string) {
    const existingValue = map.get(key);
    if (existingValue) return existingValue;

    throw new Error(error);
}
