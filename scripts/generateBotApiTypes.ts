/**
 * Generates `src/types/botApi.generated.ts` from the community-maintained,
 * machine-readable Telegram Bot API spec:
 * https://github.com/PaulSonOfLars/telegram-bot-api-spec
 *
 * Usage: bun run generate:types [spec url or local path]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_SPEC_URL =
    'https://raw.githubusercontent.com/PaulSonOfLars/telegram-bot-api-spec/main/api.json';
const OUTPUT_PATH = resolve(import.meta.dirname, '../src/types/botApi.generated.ts');

/** Types provided by the framework itself instead of being generated. */
const EXTERNAL_TYPES: Record<string, string> = {
    InputFile: "import type { InputFile } from './inputFile';"
};

/**
 * String fields whose description lists every allowed value and where a literal
 * union is worth the risk of Telegram adding new values later.
 */
const ENUM_FIELDS = new Set([
    'ReactionTypeEmoji.emoji',
    'Chat.type',
    'ChatFullInfo.type'
]);

/** Discriminator descriptions: `..., always "user"` and `..., must be article`. */
const ALWAYS_LITERAL = /always "([^"]+)"/;
const MUST_BE_LITERAL = /must be ([a-z0-9_]+)$/;

interface SpecField {
    name: string;
    types: string[];
    required: boolean;
    description: string;
}

interface SpecEntry {
    name: string;
    href: string;
    description?: string[];
    fields?: SpecField[];
    subtypes?: string[];
    returns?: string[];
}

interface Spec {
    version: string;
    release_date: string;
    types: Record<string, SpecEntry>;
    methods: Record<string, SpecEntry>;
}

async function loadSpec(source: string): Promise<Spec> {
    if (!/^https?:\/\//.test(source)) {
        return JSON.parse(await readFile(source, 'utf8')) as Spec;
    }

    const response = await fetch(source);
    if (!response.ok) {
        throw new Error(
            `Failed to download spec: ${response.status} ${response.statusText}`
        );
    }

    return (await response.json()) as Spec;
}

function quote(value: string) {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function propertyName(name: string) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : quote(name);
}

function pascalCase(name: string) {
    return name[0].toUpperCase() + name.slice(1);
}

function docComment(lines: string[], indent = '') {
    const body = lines
        .flatMap((line) => line.split('\n'))
        .map((line) => line.replace(/\*\//g, '*\\/').trimEnd());

    return [
        `${indent}/**`,
        ...body.map((line) => `${indent} *${line ? ` ${line}` : ''}`),
        `${indent} */`
    ].join('\n');
}

class Generator {
    private readonly spec: Spec;

    constructor(spec: Spec) {
        this.spec = spec;
    }

    private mapTypeExpression(expression: string, context: string): string {
        const array = /^Array of (.+)$/.exec(expression);
        if (array) {
            const inner = this.mapTypeExpression(array[1], context);
            return /[ |]/.test(inner) ? `(${inner})[]` : `${inner}[]`;
        }

        switch (expression) {
            case 'Integer':
            case 'Float':
                return 'number';
            case 'String':
                return 'string';
            case 'Boolean':
                return 'boolean';
        }

        if (!(expression in this.spec.types)) {
            throw new Error(`Unknown type "${expression}" in ${context}`);
        }

        return expression;
    }

    private mapUnion(expressions: string[], context: string) {
        return [
            ...new Set(
                expressions.map((x) => this.mapTypeExpression(x, context))
            )
        ].join(' | ');
    }

    private fieldType(owner: string, field: SpecField) {
        const context = `${owner}.${field.name}`;
        const isString = field.types.length == 1 && field.types[0] == 'String';

        if (isString && ENUM_FIELDS.has(context)) {
            const values = [...field.description.matchAll(/"([^"]+)"/g)].map(
                (x) => x[1]
            );
            if (values.length < 2) {
                throw new Error(`Could not extract enum values for ${context}`);
            }

            return [...new Set(values)].map(quote).join(' | ');
        }

        const literal =
            ALWAYS_LITERAL.exec(field.description) ??
            MUST_BE_LITERAL.exec(field.description);
        if (isString && literal) {
            return quote(literal[1]);
        }

        return this.mapUnion(field.types, context);
    }

    private renderFields(owner: string, fields: SpecField[]) {
        return fields
            .map((field) => {
                const optional = field.required ? '' : '?';
                return [
                    docComment([field.description], '    '),
                    `    ${propertyName(field.name)}${optional}: ${this.fieldType(owner, field)};`
                ].join('\n');
            })
            .join('\n');
    }

    private renderType(type: SpecEntry) {
        const doc = docComment([
            ...(type.description ?? []),
            '',
            `@see ${type.href}`
        ]);

        if (type.subtypes) {
            const members = type.subtypes.map(
                (x) => `    | ${this.mapTypeExpression(x, type.name)}`
            );
            return `${doc}\nexport type ${type.name} =\n${members.join('\n')};`;
        }

        if (!type.fields || type.fields.length == 0) {
            return `${doc}\nexport type ${type.name} = Record<string, never>;`;
        }

        return `${doc}\nexport interface ${type.name} {\n${this.renderFields(type.name, type.fields)}\n}`;
    }

    private renderMethodParams(method: SpecEntry) {
        const name = `${pascalCase(method.name)}Params`;
        const doc = docComment([`Parameters of \`${method.name}\`.`, '', `@see ${method.href}`]);

        if (!method.fields || method.fields.length == 0) {
            return `${doc}\nexport type ${name} = Record<string, never>;`;
        }

        return `${doc}\nexport interface ${name} {\n${this.renderFields(method.name, method.fields)}\n}`;
    }

    private renderMethodMap(methods: SpecEntry[]) {
        const entries = methods.map((method) => {
            if (!method.returns) {
                throw new Error(`Method ${method.name} has no return type`);
            }

            return [
                docComment([...(method.description ?? []), '', `@see ${method.href}`], '    '),
                `    ${method.name}: {`,
                `        params: ${pascalCase(method.name)}Params;`,
                `        result: ${this.mapUnion(method.returns, method.name)};`,
                '    };'
            ].join('\n');
        });

        return [
            '/** Every Bot API method with its parameters and result type. */',
            'export interface BotApiMethods {',
            entries.join('\n'),
            '}'
        ].join('\n');
    }

    render() {
        const types = Object.values(this.spec.types);
        const methods = Object.values(this.spec.methods);

        const imports = types
            .filter((x) => x.name in EXTERNAL_TYPES)
            .map((x) => EXTERNAL_TYPES[x.name]);

        return [
            '// This file is generated by scripts/generateBotApiTypes.ts. Do not edit it by hand.',
            `// Source: ${this.spec.version}, released ${this.spec.release_date}.`,
            '/* eslint-disable */',
            '',
            ...imports,
            '',
            `export const BOT_API_VERSION = ${quote(this.spec.version)};`,
            '',
            ...types
                .filter((x) => !(x.name in EXTERNAL_TYPES))
                .map((x) => `${this.renderType(x)}\n`),
            ...methods.map((x) => `${this.renderMethodParams(x)}\n`),
            this.renderMethodMap(methods),
            ''
        ].join('\n');
    }
}

const source = process.argv[2] ?? DEFAULT_SPEC_URL;
const spec = await loadSpec(source);
await writeFile(OUTPUT_PATH, new Generator(spec).render());

console.log(
    `Generated ${OUTPUT_PATH} from ${spec.version}: ${Object.keys(spec.types).length} types, ${Object.keys(spec.methods).length} methods.`
);
