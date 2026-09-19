'use strict';
require('dotenv').config();
// npm run ai:train
require('../../ai/training/train').run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ai:train failed:', err);
    process.exit(1);
  });
