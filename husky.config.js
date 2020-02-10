module.exports = {
  hooks: {
    'pre-commit': 'npm run lint && npm run spell && npm test && npm i',
  },
};
