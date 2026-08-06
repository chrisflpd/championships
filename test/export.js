/*
 * proves that a change to the export moved nothing.
 *
 *   node test/export.js save     before you touch the export
 *   node test/export.js check    after
 *
 * the program a search finds differs every time, so the program itself is kept
 * beside the workbook it produced. the check exports that same program again and
 * compares the workbook part by part: same program in, same workbook out, or the
 * change did something it did not mean to.
 *
 * the snapshots are not committed. they are a before and after of your own
 * working copy, which is what makes them trustworthy.
 */
const fs = require('fs');
const path = require('path');
const { parse_config, schedule, browser_bits, read, configs } = require('./harness');

const caught = browser_bits();
const DIR = path.join(__dirname, '.snapshot');
const MODE = process.argv[2];

const say = console.log;
console.log = () => {};

// a workbook is a zip of parts; the bytes of the zip carry the moment it was
// written, so the parts are compared and not the file
async function parts(buf) {
	const zip = await JSZip.loadAsync(buf);
	const names = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
	const map = {};
	for (const name of names)
		map[name] = await zip.file(name).async('string');
	return map;
}

// a date does not survive a trip through json on its own
const revive = text => JSON.parse(text, (k, v) =>
	k === 'date' && typeof v === 'string' ? new Date(v) : v);

(async () => {
	if (MODE !== 'save' && MODE !== 'check') {
		say('usage: node test/export.js save|check [config ...]');
		process.exit(2);
	}
	fs.mkdirSync(DIR, { recursive: true });
	let bad = 0;

	for (const name of configs(3)) {
		const slug = name.replace(/[\\/]/g, '_');
		const progFile = path.join(DIR, slug + '.program.json');
		const bookFile = path.join(DIR, slug + '.parts.json');
		parse_config(read(name));

		let program;
		if (MODE === 'save') {
			program = schedule(40);
			if (program === null) { say(`  ${name.padEnd(26)} no program found`); bad++; continue; }
			fs.writeFileSync(progFile, JSON.stringify(program));
		} else {
			if (!fs.existsSync(progFile)) { say(`  ${name.padEnd(26)} nothing saved — run "save" first`); bad++; continue; }
			program = revive(fs.readFileSync(progFile, 'utf8'));
		}

		caught.bytes = null;
		caught.alerts.length = 0;
		window.currentProgram = program;
		await exportToExcel();
		if (caught.bytes === null) { say(`  ${name.padEnd(26)} the export produced no file`); bad++; continue; }
		const now = await parts(caught.bytes);

		if (MODE === 'save') {
			fs.writeFileSync(bookFile, JSON.stringify(now));
			say(`  ${name.padEnd(26)} kept the program and its ${Object.keys(now).length} parts`);
			continue;
		}
		const was = JSON.parse(fs.readFileSync(bookFile, 'utf8'));
		const names = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
		const differ = names.filter(n => was[n] !== now[n]);
		if (differ.length) bad++;
		say(`  ${differ.length ? 'CHANGED' : 'same   '} ${name.padEnd(26)}`
			+ (differ.length ? differ.length + ' parts differ: ' + differ.join(', ') : `all ${names.length} parts identical`));
	}

	say(bad ? `\n${bad} problem(s)` : (MODE === 'save' ? '\nsnapshot taken' : '\nthe export produces exactly what it did before'));
	process.exit(bad ? 1 : 0);
})();
