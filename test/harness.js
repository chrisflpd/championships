// loads the browser scripts into node with the little of a page they ask for,
// so that the parser, the scheduler and the export can be driven from a test
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

global.window = global;
global.alert = msg => { throw new Error('ALERT: ' + msg); };
global.document = {
	addEventListener: () => {},
	dispatchEvent: () => {},
	getElementById: () => null,
	querySelector: () => null,
	forms: [],
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function load(file) {
	vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

load('common.js');
load('parser.js');
load('championships.js');
load('scheduling_algorithms.js');

// the page draws the program; a test only wants to be handed it
global.displayer = program => { global.__program = program; };

/**
 * mirrors the submit handler of parser.js, without the page around it
 *
 * @param {string} text - the contents of the configuration box
 */
function parse_config(text) {
	config.courts = [];
	config.sports = [];
	config.zones = [];
	config.days = [];
	config.teams = [];
	config.groups = {};
	config.knockouts = {};
	let config_var = null;
	text.replaceAll('\r\n', '\n').split('\n').forEach(line => {
		if (line.length === 0 || line.startsWith('#')) return;
		const ma = line.match(/^\[(.*)\]$/);
		if (ma !== null) {
			config_var = ma[1].toLowerCase();
			return;
		}
		switch (config_var) {
			case 'sports': return parse_sport_line(line);
			case 'zones': return parse_zone_line(line);
			case 'days': return parse_day_line(line);
			case 'teams': return parse_team_line(line);
			case 'groups': return parse_group_line(line);
			case 'knockouts': return parse_knockout_line(line);
		}
	});
	config.days.sort((d1, d2) => d1.date.getTime() - d2.date.getTime());
	config.days.forEach(day => day.dzones.forEach(dzone => dzone.rounds.forEach(round => {
		config.courts.forEach(court => {
			round.slots[court] = { court: court, match: null };
		});
	})));
}

/**
 * the page keeps trying until it finds a program; a test gives up eventually
 *
 * @param {number} tries
 * @returns {?day[]}
 */
function schedule(tries) {
	for (let i = 0; i < (tries || 25); i++) {
		try {
			const program = search_run_window();
			if (program) return program;
		} catch (error) {
			if (!/TIMEOUT/.test(error.message)) throw error;
		}
	}
	return null;
}

/**
 * everything the export needs that only a browser has
 *
 * @returns {object} - bytes: the workbook the export last built, or null;
 *                     alerts: what it said along the way
 */
function browser_bits() {
	const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
	global.DOMParser = DOMParser;
	global.XMLSerializer = XMLSerializer;
	vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'jszip.min.js'), 'utf8'), { filename: 'jszip.min.js' });
	global.JSZip = global.JSZip || global.window.JSZip;
	global.fetch = async url => ({ ok: true, arrayBuffer: async () => fs.readFileSync(path.join(ROOT, url)) });
	global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
	global.document.createElement = () => ({ style: {}, classList: { add() {} }, click() {}, set href(v) {}, set download(v) {} });
	global.document.body = { appendChild() {}, removeChild() {} };
	load('displayer.js');
	// jszip cannot build a Blob outside a browser, so it is asked for bytes
	const generate = JSZip.prototype.generateAsync;
	const caught = { bytes: null, alerts: [] };
	JSZip.prototype.generateAsync = function (opts) {
		return generate.call(this, { ...opts, type: 'nodebuffer' }).then(b => { caught.bytes = b; return b; });
	};
	// the export says what it has to say through alert, warnings and refusals
	// alike, so they are collected rather than thrown the way the default does
	global.alert = msg => { caught.alerts.push(String(msg)); };
	return caught;
}

function read(file) {
	return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/**
 * the configurations a test runs over unless it is told otherwise
 *
 * @param {?number} from - the argument the names start at, past any command
 * @returns {string[]} - paths relative to the repository
 */
function configs(from) {
	const given = process.argv.slice(from || 2).filter(a => !a.startsWith('-'));
	if (given.length) return given;
	return fs.readdirSync(ROOT).filter(f => /^input.*\.txt$/.test(f))
		.concat(fs.readdirSync(path.join(__dirname, 'configs')).map(f => 'test/configs/' + f));
}

module.exports = { parse_config, schedule, browser_bits, read, configs, load, ROOT };
