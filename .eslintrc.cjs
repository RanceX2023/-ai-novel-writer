/* eslint-env node */
module.exports = {
  root: true,
  env: {
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react/jsx-runtime',
    'prettier',
  ],
  rules: {
    'import/order': [
      'error',
      {
        groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
  },
  overrides: [
    {
      files: ['server/**/*.ts'],
      env: {
        node: true,
      },
      parserOptions: {
        project: ['./server/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
      extends: ['plugin:@typescript-eslint/recommended-requiring-type-checking'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': [
          'error',
          {
            checksVoidReturn: {
              attributes: false,
            },
          },
        ],
      },
    },
    {
      files: ['client/**/*.{ts,tsx}'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        project: ['./client/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
      extends: ['plugin:@typescript-eslint/recommended-requiring-type-checking'],
      rules: {
        'react/jsx-no-useless-fragment': ['warn', { allowExpressions: true }],
      },
    },
    {
      files: ['**/__tests__/**/*.{ts,tsx,js,jsx}', '**/*.test.{ts,tsx,js,jsx}'],
      env: {
        jest: true,
      },
      globals: {
        vi: 'readonly',
      },
    },
    {
      files: ['**/*.config.{js,ts,cjs,mjs}', '**/*.config.js'],
      env: {
        node: true,
      },
      parserOptions: {
        project: null,
      },
    },
  ],
};
