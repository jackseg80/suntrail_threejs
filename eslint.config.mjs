import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: [
            '**/node_modules/**',
            'dist/**',
            'android/**',
            'coverage/**',
            'output/**',
            'playwright-report/**',
            'test-results/**',
            'screenshots/**',
            'public/**',
            '**/*.d.ts',
            'tools/**',
            'scripts/**',
        ],
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
            globals: {
                ...globals.browser,
                ...globals.es2021,
                __APP_VERSION__: 'readonly',
                Buffer: 'readonly',
                global: 'readonly',
                RequestInit: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': ts,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...ts.configs.recommended.rules,
            ...prettier.rules,
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'no-unused-expressions': 'error',
            'no-empty': 'error',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/ban-ts-comment': [
                'error',
                {
                    'ts-ignore': 'allow-with-description',
                    'ts-expect-error': 'allow-with-description',
                },
            ],
        },
    },
    {
        files: ['src/workers/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.worker,
                ...globals.es2021,
                Transferable: 'readonly',
            },
        },
    },
    {
        files: ['src/test/**/*.ts', 'src/**/*.test.ts'],
        languageOptions: {
            globals: {
                Buffer: 'readonly',
                global: 'readonly',
            },
        },
    },
];
