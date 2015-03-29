#!/usr/bin/env node
var yargs = require('yargs')
  .usage('schwab [-u <username>] [-a "Account Name"]* [<output.csv>]')
  .describe('username', 'your schwab.com account username')
  .describe('account', 'only get accounts with this name or last 4 digits of account number')
  .describe('start', 'the state date (inclusive) in YYYY-MM-DD form')
  .describe('end', 'the end date (inclusive) in YYYY-MM-DD form')
  .describe('after', 'the start date (exclusive) in YYYY-MM-DD form')
  .describe('before', 'the end date (exclusive) in YYYY-MM-DD form')
  .describe('out', 'the output file (default: stdout)')
  .alias('username', 'u')
  .alias('account', 'a')
  .alias('start', 's')
  .alias('end', 'e')
  .alias('out', 'o')
  .alias('help', 'h');
var options = yargs.argv;
var args = options._;

if (options.help) {
  return yargs.showHelp();
}

delete options.$0;
delete options._;

// console.log(options);
// return process.exit();

var fs = require('fs');
var prompt = require('prompt');
var child = require('child_process');
var es = require('event-stream');
var colors = require('colors');

var output = args.length
  ? fs.createWriteStream(args.shift())
  : options.out 
    ? fs.createWriteStream(options.out)
    : process.stdout;

prompt.override = options;
prompt.addProperties(options, [
  {
    name: 'username',
    default: options.username,
    required: true
  },
  {
    name: 'password',
    required: true,
    hidden: true
  }
], function(error, options) {
  if (error) return console.error('\n' + String(error).red);

  var phantomjs = __dirname + '/node_modules/.bin/phantomjs';
  var args = Object.keys(options)
    .filter(function(opt) {
      return opt.length > 1;
    })
    .map(function(opt) {
      return '--' + opt + '="' + options[opt] + '"';
    });
  // console.log('args:', args);
  // process.exit();

  console.warn('Spawning phantomjs...'.green);
  var proc = child.spawn(phantomjs, ['scrape.js'].concat(args));
  proc.stdout
    .pipe(es.split())
    .pipe(es.map(function(line, next) {
      if (line.charAt(0) === '#') {
        process.stderr.write(line.yellow);
        process.stderr.write('\n');
      } else if (line.match(/^Unsafe JavaScript/)) {
        // squash these errors: <https://github.com/ariya/phantomjs/issues/12697>
        // process.stderr.write(line.red);
        // process.stderr.write('\n');
      } else if (!line.match(/^\s*$/)) {
        line += '\n';
        return next(null, line);
      }
      next();
    }))
    .pipe(output);

});
