// V is constrained to exclude undefined, since these helpers use `undefined` to mean "key not present".
type KeyedReadonlyCollection<K, V extends {}> = {
    get: (key: K) => V | undefined;
};
type KeyedWriteableCollection<K, V extends {}> = KeyedReadonlyCollection<
    K,
    V
> & {
    set: (key: K, value: V) => KeyedWriteableCollection<K, V>;
};

export function getOrCreateIfNotExists<K, V extends {}>(
    map: KeyedWriteableCollection<K, V>,
    key: K,
    fallbackFactory: () => V
) {
    const existingValue = map.get(key);
    if (existingValue !== undefined) return existingValue;

    const fallback = fallbackFactory();
    map.set(key, fallback);

    return fallback;
}

export function getOrSetIfNotExists<K, V extends {}>(
    map: KeyedWriteableCollection<K, V>,
    key: K,
    fallback: V
) {
    const existingValue = map.get(key);
    if (existingValue !== undefined) return existingValue;

    map.set(key, fallback);

    return fallback;
}

export function getOrThrow<K, V extends {}>(
    map: KeyedReadonlyCollection<K, V>,
    key: K,
    error: string = 'Key not found in collection'
) {
    const existingValue = map.get(key);
    if (existingValue !== undefined) return existingValue;

    throw new Error(error);
}
