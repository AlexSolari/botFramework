export function inverseRecord<T extends PropertyKey, U extends PropertyKey>(
    input: Record<T, U>
) {
    return Object.fromEntries(
        Object.entries(input).map(([key, value]) => [value, key])
    ) as Record<U, T>;
}
