# checks

The app runs in a browser with no build step, so these load the very same files
the page loads — `common.js`, `parser.js`, `championships.js`,
`scheduling_algorithms.js`, `displayer.js` — into node, and drive them. Nothing
here is a copy of the app: if a check passes, it passed against the real thing.

    cd test
    npm install
    npm test

`npm install` is needed once. It brings in [jsdom](https://github.com/jsdom/jsdom),
which runs `index.html` as a real page, and `@xmldom/xmldom`, which stands in for
the browser's XML parser that the workbook export uses.

## what each one does

**`npm run page`** — serves the folder over http, opens `index.html` in jsdom and
uses it: types a configuration, submits, waits for a program, and reads the page
back. It checks the buttons and the theme switch, and then, for every day card,
that the sports and the fields are named in the right order, that a zone holds
the rounds it should, and that **every cell holds exactly what the scheduler
placed there** — which is the check worth having. It also drives the stopping of
a search, a configuration that cannot be scheduled, and a team that never plays.

Runs over every `input*.txt` in the repository plus the configurations in
`configs/`, or over the ones you name: `node page.js input26g.txt`.

**`npm run robust`** — configurations the camp has never used: three and four
rounds a zone, one zone, four zones, six fields, fourteen days, a sport the
program has never heard of. It checks that anything too big for the template is
refused outright rather than exported with matches missing, and that anything
that does fit exports every single one of them.

**`npm run snap` / `npm run snap:check`** — the workbook, byte for byte.

    npm run snap          # before you touch the export
    ...make your change...
    npm run snap:check    # after

A search finds a different program every time, so `snap` keeps the program it
found beside the workbook that program produced. `snap:check` exports that same
program again and compares the workbook part by part. Same program in, same
workbook out — or the change did something it did not mean to. The snapshots are
not committed: they are a before and after of your own working copy, which is
what makes them worth trusting.

## what they cannot tell you

`page.js` runs in jsdom, which parses CSS but does not lay anything out. It can
tell you a column is not set up to be clipped; it cannot tell you the card looks
right. Look at the page for that.

jsdom also does not give a form the named properties a browser gives it, and
`parser.js` reads `form['config']`, so the page is served with that one browser
behaviour put back by a small script. Nothing else about the page is changed.
