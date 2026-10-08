export function copyPersistentData(data: object, captureName: string) {
    try {
        const json = JSON.stringify(data) as string | undefined;
        if (json == undefined) throw new Error('data is not an object');

        return JSON.parse(json) as object;
    } catch (error) {
        throw new Error(
            `Data of persistent capture ${captureName} must be JSON-serializable.`,
            { cause: error }
        );
    }
}
