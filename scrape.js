var page = require('webpage').create();
var system = require('system');
var fs = require('fs');

var options = {};
system.args.slice(1).forEach(function(arg) {
  var match = arg.match(/--([\w-]+)="?(.*)"?$/);
  if (match) {
    var key = match[1],
        value = match[2].replace(/(^")|("$)/g, '');
    options[key] = value;
  }
});

var state = 'login';
var accounts = [];
var currentAccount;
var urls = {
  login: 'https://www.schwab.com/public/schwab/client_home',
  loggedIn: 'https://client.schwab.com/Accounts/Summary/Summary.aspx?ShowUN=YES',
  loginError: 'https://client.schwab.com/Login/SignOn/CustomerCenterLogin.aspx?ErrorCode=ErrorInvalidCredentials'
};

page.onUrlChanged = defaultHandler;

var errorBlacklist = [
  /btn.onclick/
];
page.onError = function(msg) {
  var blacklist = errorBlacklist.some(function(pattern) { return pattern.test(msg); });
  if (blacklist) return;
  log('ERROR', msg.replace(/[\r\n]+/, ' '));
};

page.open(urls.login, function login(status) {
  if (status !== 'success') {
    die('Unable to load login page:', status);
  }

  log('logging in as', options.username, '...');

  page.evaluate(function(username, password) {
    $('#SignonAccountNumber').val(username);
    $('#SignonPassword').val(password);
    submitLogin(); // this is a global function on schwab.com
  }, options.username, options.password);

  state = 'auth';
  nextPage(function(url) {
    if (url === urls.loggedIn) {
      log('> logged in!');
      listAccounts();
    } else {
      defaultHandler(url);
    }
  });
});

function listAccounts() {
  waitFor('#tblCharlesSchwabBank', function(selector) {
    var allAccounts = getAccounts(selector);
    if (allAccounts) {
      // XXX because you can't shift() an array returned by page.evaluate()
      accounts = [].slice.call(allAccounts);
      if (options.account) {
        var lookup = makeMap(options.account.split(','));
        accounts = accounts.filter(function(d) {
          return lookup.hasOwnProperty(d.name)
              || lookup.hasOwnProperty(d.number);
        });
      }

      log('accounts:', accounts
        .map(function(d) { return d.name; })
        .join(', '));
      nextAccount();
    } else {
      return die('unable to load any accounts:', selector);
    }
  });
}

function nextPage(done) {
  page.onUrlChanged = function(url) {
    done(url);
    page.onUrlChanged = defaultHandler;
  };
}

function defaultHandler(url) {
  log('URL changed:', url);
  switch (url) {
    case urls.loginError:
      return die('Login error! Try re-typing your username and password.');
  }
};

function getAccounts(selector) {
  var accounts = page.evaluate(function(selector) {
    var table = document.querySelector(selector);
    var rows = table.querySelectorAll('tr.data-row');
    return [].map.call(rows, function(tr, i) {
      var name = tr.querySelector('td:first-child a'),
          number = tr.querySelector('td:nth-child(2) a');
      return {
        name: name.textContent,
        action: name.href.replace(/^javascript:/, ''),
        number: number.textContent.slice(-4)
      };
    });
  }, selector);
  return [].slice.call(accounts);
}

function nextAccount() {
  state = 'account';
  if (!accounts.length) {
    return exit('all done!');
  }
  log('loading next account of', accounts.length);
  var acct = accounts.shift();
  currentAccount = acct;
  log('account name:', acct.name);
  var submitted = page.evaluate(function(action) {
    return eval(action);
  }, acct.action);
  // log('submitted:', submitted);
  nextPage(function(url) {
    loadTransactions();
  });
}

function loadTransactions() {
  log('waiting for data on', page.url);
  waitFor('#tbldata', function(selector) {
    log('reading transactions...');
    var data = page.evaluate(function(selector) {
      var table = document.querySelector(selector);
      if (!table) return {error: 'not found: ' + selector};
      var rows = table.querySelectorAll('tr.data-row');
      var cols = [
        'date', 'type', 'check', 'description',
        'withdrawal', 'deposit', 'balance'
      ];
      var data = {};
      var trim = function(str) {
        return str.replace(/(^\s+)|(\s+$)/g, '');
      };
      var reformatDate = function(str) {
        var bits = str.split('/');
        bits.unshift(bits.pop());
        return bits.join('-');
      };
      // skip the first one
      data.rows = [].slice.call(rows, 1)
        .map(function(row, i) {
          var d = {};
          var cells = row.querySelectorAll('td');
          cols.forEach(function(key, j) {
            d[key] = trim(cells[j].textContent) || null;
          });
          d.date = reformatDate(d.date);
          return d;
        });

      var next = document.querySelector('a[id$=lnkNext]');
      if (next) {
        data.next = next.href.replace(/^javascript:/, '');
      }
      return data;
    }, selector);

    if (data.rows && data.rows.length) {
      var rows = [].slice.call(data.rows);
      var before = [];
      var after = [];
      log('> got', rows.length, 'rows');

      // drop rows that come after the end date
      if (options.end) {
        while (rows.length && rows[0].date > options.end) {
          after.push(rows.shift());
        }
        if (after.length) {
          log('- skipped', after.length, 'rows after', options.end);
        }
      }

      // drop rows that come before the start date
      if (options.start) {
        while (rows.length && rows[rows.length - 1].date < options.start) {
          before.push(rows.pop());
        }
        if (before.length) {
          log('- ignored', before.length, 'rows before', options.start);
        }
      }

      rows.forEach(function(d) {
        d.account = currentAccount.name;
        write(JSON.stringify(d));
      });

      // if there's a next link *and* there were no early transactions..
      if (data.next && !before.length) {
        log('loading next page...');
        var timeout = setTimeout(function() {
          die('Timed out!');
        }, 10000);
        // "evaluate" the next link and load transactions on the next page
        page.evaluate(function(action) {
          eval(action);
        }, data.next);
        return nextPage(function() {
          clearTimeout(timeout);
          loadTransactions();
        });
      }
    } else if (data.rows) {
      // zero rows should mean we're at the end of this account history
    } else {
      return die('Error parsing data:', JSON.stringify(data.error || data.rows));
    }

    // if we haven't returned yet, we're done with this account
    log('done with account:', currentAccount.name);
    nextAccount();
  });
}

function waitFor(selector, done, timeout) {
  if (!timeout) timeout = 5000;
  var start = Date.now();
  var tick = 200;
  var select = function(selector) {
    return !!document.querySelector(selector);
  };

  return (function() {
    function wait() {
      var elapsed = Date.now() - start;
      if (elapsed) log('* waiting for', selector, '(' + elapsed + 'ms)', '...');
      if (page.evaluate(select, selector)) {
        return done(selector);
      }
      if (elapsed > timeout) {
        return die('timed out waiting for', selector, 'on', page.url);
      }
      setTimeout(wait, tick);
    }
    wait();
  })();
}

function makeMap(list, accessor) {
  var map = {};
  list.forEach(function(d) {
    var key = accessor ? accessor(d) : d;
    map[key] = d;
  });
  return map;
}

function write() {
  console.log.apply(console, arguments);
}

function log() {
  var args = [].slice.call(arguments);
  args.unshift('#');
  console.log.apply(console, args);
}

function exit() {
  if (arguments.length) log.apply(null, arguments);
  phantom.exit(0);
}

function die() {
  if (arguments.length) log.apply(null, arguments);
  setTimeout(function() { phantom.exit(1); }, 0);
  page.onError = function() {};
}
