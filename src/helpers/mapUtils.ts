type KeyedReadonlyCollection<K, V> = { get: (key: K) => V | undefined };
type KeyedWriteableCollection<K, V> = KeyedReadonlyCollection<K, V> & {
    set: (key: K, value: V) => KeyedWriteableCollection<K, V>;
};

export function getOrSetIfNotExists<K, V>(
    map: KeyedWriteableCollection<K, V>,
    key: K,
    fallback: V
) {
    const existingValue = map.get(key);
    if (existingValue) return existingValue;

    map.set(key, fallback);

    return fallback;
}

export function getOrThrow<K, V>(
    map: KeyedReadonlyCollection<K, V>,
    key: K,
    error: string = 'Key not found in collection'
) {
    const existingValue = map.get(key);
    if (existingValue) return existingValue;

    throw new Error(error);
}
