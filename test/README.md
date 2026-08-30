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

**`npm run sheets`** — the three tabs, driven the way the camp drives them. It
switches between them, counts the rows of every printed day sheet against the
rounds and the fields of that day, types a score and a referee into a match and
reads them back out of the workbook, checks the standings that follow — the
played, won, lost, for, against and the points the sport pays — against what the
score should make them, and that a sport which cannot be drawn has no D column.
Then it moves a match on the plan and checks the plan, the printed sheet and the
count all follow it, opens the editor over a slot and changes who plays in it,
and puts two teams into one round twice over to see the clash marked rather than
refused.

Runs over `input26g.txt` and `configs/unnamed-zone.txt` by default, or the ones
you name.

**`npm run export-scores`** — the workbook that is handed out, read back cell by
cell. It moves a match and enters a score and a referee, exports, and checks the
score is on the pages sheet on the row of the right day and the right field, that
the plan cell above it holds that very pair, that the moved match is written
where it was moved to and not where it came from, that every match of the plan is
on the sheet as many times as it is played, and that the workbook is told to work
its formulas out when it is opened rather than showing the template's numbers.

**`npm run robust`** — configurations the camp has never used: three and four
rounds a zone, one zone, four zones, six fields, fourteen days, a sport the
program has never heard of. It checks that anything too big for the template is
refused outright rather than exported with matches missing, and that anything
that does fit exports every single one of them.

**`npm run snap` / `npm run snap:check`** — the workbook and the schedule, before
and after a change.

    npm run snap          # before you touch the export or the rules
    ...make your change...
    npm run snap:check    # after

Two snapshots are taken.

`export.js` covers the workbook. A search finds a different program every time,
so it keeps the program it found beside the workbook that program produced, and
the check exports that same program again and compares the workbook part by
part. Same program in, same workbook out — or the change did something it did
not mean to.

`schedule.js` covers the scheduler itself, which is what makes it safe to touch
the rules. Ordinarily two runs cannot be compared at all: the matches are
shuffled and the search gives up on a clock. So the shuffle is given a fixed
seed, and the clock is replaced by a count of the times the scheduler is entered
— it reads the clock exactly once per entry — which makes the budget the same on
every machine. Six orderings of each configuration are then run and fingerprinted,
**the ones that fail as well as the ones that succeed**, so a change that alters
what the rules prune shows up even where it finds no program. A refactoring meant
to keep the rules must leave every fingerprint alone; a change meant to alter them
will say exactly which configurations it moved.

The snapshots are not committed: they are a before and after of your own working
copy, which is what makes them worth trusting.

## what they cannot tell you

`page.js` runs in jsdom, which parses CSS but does not lay anything out. It can
tell you a column is not set up to be clipped; it cannot tell you the card looks
right. Look at the page for that.

jsdom also does not give a form the named properties a browser gives it, and
`parser.js` reads `form['config']`, so the page is served with that one browser
behaviour put back by a small script. Nothing else about the page is changed.
