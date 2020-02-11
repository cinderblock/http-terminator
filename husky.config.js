module.exports = {
  hooks: {
    'pre-commit':
      'npm run lint && npm run spell && npm run format-check && npm i',
  },
};
