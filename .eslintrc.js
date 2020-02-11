module.exports = {
  root: true,
  env: { node: true },
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
  },
  plugins: ['json'],
  rules: {
    'json/*': ['error', 'allowComments'],
    // or the equivalent:
    'json/*': ['error', { allowComments: true }],
  },
  extends: ['eslint:recommended'],
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
      },
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier/@typescript-eslint',
      ],
    },
  ],
};
