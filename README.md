# schwab
Scrape your Schwab banking transaction history!

Install it with [npm]:

```sh
npm install -g schwab
```

### Usage
```
schwab [-u <username>] [-a "Account Name"]* [<output.json>]

Options:
  --username, -u  your schwab.com account username                                
  --acct, -a      scrape one or more named accounts (default: scrape all accounts)
  --start, -s     the state date (inclusive) for transactions in YYYY-MM-DD       
  --end, -e       the end date (inclusive) for transactions in YYYY-MM-DD         
  --out, -o       the output file (default: stdout)                               
```
