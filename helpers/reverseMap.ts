export function reverseMap<K, V>(map: Map<K, V>): Map<V, K> {
    return new Map(Array.from(map, ([key, value]) => [value, key]));
}
