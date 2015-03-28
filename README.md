# schwab
`schwab` is a command line utility that scrapes your Schwab banking transaction
history using [PhantomJS].

Install it with [npm]:

```sh
npm install -g schwab
```

### Usage
Run `schwab --help` to see the usage:

```
schwab [options] [<outfile>]

Options:
  --username, -u  your schwab.com account username                                
  --acct, -a      scrape one or more named accounts (default: scrape all accounts)
  --start, -s     the state date (inclusive) for transactions in YYYY-MM-DD       
  --end, -e       the end date (inclusive) for transactions in YYYY-MM-DD         
  --out, -o       the output file (default: stdout)                               
```

If you don't provide the `--username/-u` flag it will prompt you for your
schwab.com user ID. For security purposes, you will always be prompted for
your password interactively and it will never be shown or stored anywhere.

You may provide more than one account name like so:
```sh
schwab -a 'Personal Checking' -a 'Family Checking'
```

Transaction data is printed to `stdout` unless you provide either the
`--out/-o` flag or a single positional argument. The following are equivalent:
```sh
schwab -o transactions.json
schwab > transactions.json
```

### Data Format
The data is formatted as [newline delimited JSON], a streaming format that's
easy to parse. If you want to convert it to another format, such as comma-
or tab-separated values, try out [tito], which reads NDJSON by default:

```sh
schwab | tito --write tsv > transactions.tsv
```

Or, just pipe it into [dat] for storage:
```sh
schwab | dat import --json
```

Transactions objects should all have the following columns:

* `withdrawal`: the amount withdrawn, as a dollar-formatted string e.g. `$3,124.50`
* `deposit`: the amount deposited, also as a dollar-formatted string
* `description`: the transaction description, often in debit card shorthand e.g.
  `NY TIMES NATL SALE800-698-4637, NY #0000`
* `balance`: the running balance as of each transaction as a dollar-formatted string
* `check`: the check number, if this transaction involves a written check
* `type`: the transaction type, one of:
  * `ACH`
  * `ADJUSTMENT`
  * `ATM`
  * `ATMREBATE`
  * `CHECK`
  * `DEPOSIT`
  * `INTADJUST`
  * `TRANSFER`
  * `VISA`

[PhantomJS]: http://phantomjs.org/
[npm]: https://www.npmjs.com/
[newline delimited JSON]: http://ndjson.org/
[tito]: https://github.com/shawnbot/tito
[dat]: http://dat-data.com/
