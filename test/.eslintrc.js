module.exports = {
  parserOptions: {
    project: './test/tsconfig.json',
  },
  rules: {
    'no-console': 'error',
  },
  plugins: ['jasmine'],
  env: {
    jasmine: true,
  },
  extends: 'plugin:jasmine/recommended',
};
