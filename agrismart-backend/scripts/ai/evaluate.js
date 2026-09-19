'use strict';
require('dotenv').config();
// npm run ai:evaluate
require('../../ai/evaluation/evaluate').run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ai:evaluate failed:', err);
    process.exit(1);
  });
