#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { previewRestaurantImport } = require('../lib/restaurant_import');

function main(args) {
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--expected-sha256' ||
      !/^[a-f0-9]{64}$/.test(args[3])) {
    throw new Error('Usage: node scripts/preview_restaurant_import.js --input <file> --expected-sha256 <reviewed SHA-256>');
  }
  const bytes = fs.readFileSync(args[1]);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== args[3]) throw new Error('Input does not match the reviewed SHA-256');
  const preview = previewRestaurantImport(JSON.parse(bytes.toString('utf8')));
  return { ...preview, input_sha256: digest };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
