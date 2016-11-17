const spawn = require('./spawn');

const sourceDirectory = 'js';
const args = [sourceDirectory, ...process.argv.slice(2)];

spawn('jest', args, { BABEL_DISABLE_CACHE: 1 });
