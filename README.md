# championships
An HTML-JS application to plan championships.

## version

1.4

## the page

Once a program has been found, it is shown under four draggable tabs. The first
three are the sheets of `template.xlsx` the camp actually reads; the fourth is
the program configuration. Drag any tab to keep them in the order you prefer.
The strip stays under the title bar however far down a sheet is read, so the four
are always there to be switched between.

**Πρόγραμμα** is the plan: a card per day, a row per round, a column per field.
Every slot can be changed. Drag a match onto a free slot to move it, or onto
another match to swap the two. Click a slot to say what is played in it and by
whom, or to empty it.

Every day is drawn with the whole of its four rounds and every date from the
first to the last gets a card, whether or not the configuration asked for them.
A round the configuration left out, and a date it passes over, are time the camp
has and chose not to play in rather than time that does not exist, so they are
drawn more quietly and can be filled in by hand like any other slot. Only the
search is held to what the configuration gave; the export writes whatever the
plan ends up holding.

Nothing is refused for breaking a rule — a plan being put right by hand passes
through states that do not hold — but a slot on the wrong field for its sport, or
holding a team that already plays that round, is marked, and hovering it or
opening it reads out the rules it breaks under a red Παραβίαση κανόνα, one
sentence to a bullet. A change that breaks one says so as
soon as it is made rather than waiting to be hovered over. A field two sports
share is one field: the match stands under the column of its own sport, and the
other column is hatched to show the field taken.

**Φύλλα αγώνων** is what was printed every morning and handed out: a block per
day with the round, the field, the two teams by number and by name, and the boxes
for the two scores and the referee. The round is named on its side, as it is on
the paper, since its column is the narrow one Excel gave it. Print one day, or
tick several and print them two to a side of A4, which is how they fitted in the
workbook.

A score box takes digits and nothing else, and the boxes are walked the way a
sheet is walked while a stack of results is being typed in: tab to the score on
the right, shift and tab to the one on the left, and return down to the next
match.

What comes out of the printer is the block the workbook itself printed, measured
off a page exported from the real thing: the date across the top over a double
rule, the round named down the side of its own five field rows, the fields in
italic, and the rules that tell the parts apart — dotted between the fields of a
round, single between the rounds of a zone, double between the zones, and the
frame of the day around the lot. The round names its block from one cell merged
down the whole of it, with nothing drawn through it, which is what makes a block
read as one round rather than as five rows that happen to sit together.

There is no row naming the sports on a printed day, so a field two sports share
is named by the sport it is being played for: the baseball diamond laid out on
the football pitch reads Μπέιζμπολ on the baseball line and Π Ποδόσφαιρο on the
football one.

The screen is ruled the same way, across and down, so that the tab reads as the
sheet it prints. The rules are declared once and drawn in whichever measures the
side asks for — a row and a rule weight — and nothing else is said twice. The screen keeps the column names and the print
takes them off, as the workbook had none.

**Βαθμολογία** is the points. Each group gets a table of the template's columns —
PLD W D L GF GA GD PTS RNK — ranked inside the group, which is what a knockout
reading `kg1:1` means by it. A sport that cannot be drawn has no D column, and
what a score is worth is the sport's own, so football counts 3-1-0, basketball
and baseball 2-1 and volleyball its sets. Under each sport are its knockouts,
showing who has come through to each of them so far.

Submitting the configuration again starts the search from the beginning and
throws away the program on the page along with every change made to it by hand,
so it asks first.

A championship is kept in the browser between visits, and the page offers it back
over the head of the configuration, before any search is run: open the page the next
morning and the whole of yesterday is waiting there to be opened, plan and scores
and all. It is only offered when what is stored is the championship of the
configuration in the box, and saying no throws nothing away.

The plan and the scores are kept in the browser between visits. The scores are
kept against the match, so a fresh search that moves a match somewhere else does
not lose its result; the plan is offered back rather than forced over the program
a new search has just found.

The `teams`, `fields` and `games` sheets of the template only ever carried
numbers from one readable sheet to the next, so they have no tab: `workbook.js`
does that work. The exported workbook still has all six, and carries the plan as
it stands along with every score entered.

## the files

The page is served as it is, with no build step of any kind, so what the browser
loads is what is in the repository:

```
index.html      the page
src/js          the program: the reader, the search, the workbook and the tabs
src/css         how it is drawn
vendor          jszip, which the export needs and we did not write
assets          template.xlsx, the workbook the export fills in
examples        input*.txt, full configurations of championships that were run
test            the checks, which load the files above and drive them
```

`index.html` carries a version on every stylesheet and script it links, so that a
browser holding an old one does not draw a new page with it. Bump it whenever one
of them changes.

## checks

`test/` holds checks that load these very files into node and drive them: the page
in a headless browser, configurations the camp has never used, and the exported
workbook compared part by part before and after a change. Run them with
`cd test && npm install && npm test`, and read `test/README.md` before changing
the export.

## configuration

A configuration string is provided through a `textarea` element.

A word in square brackets defines the type of the following lines.

#### examples

`[sports]`

`[teams]`

Full realistic examples are given in text files named `input*.txt`.

Detailed syntax is explained in the subsections below.

### sports

A sport line contains the sport name (a single word), optionally followed by a points definition, optionally followed by a court list definition.

A points definition consists of three numbers joined by hyphens (`-`), giving what a win, a draw and a loss are worth.

A court list definition consists of a colon (`:`) and a comma (`,`) separated list of courts.

Sports with the same name are not allowed.

If no court list definition is provided, a court named by the sport will be considered.

Any sport name is accepted. If no points definition is provided, the sport keeps the scoring the program already knows for that name, and a name the program does not know scores 3 for a win, 1 for a draw and 0 for a loss.

#### examples

`Soccer: Old Soccer Court, New Soccer Court`

`Volleyball`

`Baseball: Old Soccer Court`

`Handball 3-1-0: Old Soccer Court`

### zones

A zone line contains the zone name.

Zones are ranked according to their declaration order.

If no zones are provided, a single zone will be considered. The zone name will be set to `null`.

After a day line, zones can't be added.

#### examples

`Morning`

`Afternoon`

### days

A day line contains a date (given in the format `YYYY-mm-dd`) and a list of integers indicating the number of rounds per zone.

The length of the integer list should match the number of the zones.

Days with the same date are not allowed.

#### examples

```
2023-08-10 3
```

```
2023-08-10 1 2
2023-08-11 2 0
```

### teams

A team line contains the team name.

#### note

Teams are numbered starting from `1`.

### groups

A group line contains the group code, the sport name, a positive integer indicating the number of matches each team will play and a collection of teams.

The group code is a single word. Groups with the same code are not allowed.

A collection of teams consists of a colon (`:`) and a comma (`,`) separated list of integers or integer ranges.

An integer range is formed by two integers separated by a dash (`-`).

In case the number of teams in the group is odd, the number of matches each team will play must be even.

The matches of the group are produced automatically out of this collection.

#### examples

```
sg  Soccer     8: 1-5
```

```
vg1 Volleyball 4: 1, 4-5, 7, 10
vg2 Volleyball 4: 2-3, 6, 8-9
```

```
bg  Baseball   1: 2-5
```

#### given matches

Alternatively, a collection of matches may be given in place of the collection of teams. Then no matches are produced and exactly the given ones are scheduled.

A collection of matches consists of a colon (`:`) and a comma (`,`) separated list of matches. A match is formed by the indices of the two opponents separated by the letter `v`.

The teams of the group are the ones appearing in the given matches. A team may play any number of matches, or the same opponent more than once.

The two collection types can't be mixed within a group line.

The integer indicating the number of matches each team will play is optional here, as the given matches already define it. If provided, it is ignored.

#### examples

```
pg1 Soccer     4: 1v2, 1v3, 1v4, 5v6, 8v9
```

```
kg  Basketball  : 1v2, 3v4, 1v3, 2v4
```

### knockouts

A knockout line contains the knockout code, the sport name and two expressions describing the selection algorithm of each opponent.

The knockout code is a single word. Knockouts with the same code are not allowed.

An expression may take one of the following three forms:

+ a single integer: The team with this index is selected.
+ a group code and an integer separated by a colon (`:`): The team with the corresponding ranking within the group is selected.
+ a knockout code and one of the uppercase letters `W` or `L`: Winner or loser of the corresponding knockout match is selected.

#### examples

```
pf  Soccer    pg:1  pg:2
```

```
vq1 Volleyball vg1:1 vg2:4
vq2 Volleyball vg1:2 vg2:3
vq3 Volleyball vg1:3 vg2:2
vq4 Volleyball vg1:4 vg2:1
vs1 Volleyball vq1:W vq3:W
vs2 Volleyball vq2:W vq4:W
vfw Volleyball vs1:W vs2:W
vfl Volleyball vs1:L vs2:L
```

```
bs1 Baseball       1  bg:2
bs2 Baseball    bg:1  bg:3
bf  Baseball   bs1:W bs2:W
```
