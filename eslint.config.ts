import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import parser from '@typescript-eslint/parser';

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            parser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
                sourceType: 'module'
            }
        },
        rules: {
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true
                }
            ],
            '@typescript-eslint/no-misused-promises': [
                'error',
                {
                    checksVoidReturn: true,
                    checksConditionals: true
                }
            ],
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                {
                    allowNumber: true
                }
            ],
            '@typescript-eslint/unbound-method': [
                'error',
                {
                    ignoreStatic: true
                }
            ]
        },
        ignores: ['dist/*']
    }
);
