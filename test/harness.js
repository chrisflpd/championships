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

load('src/js/storage.js');
load('src/js/common.js');
load('src/js/parser.js');
load('src/js/championships.js');
load('src/js/scheduling_algorithms.js');

// the page draws the program; a test only wants to be handed it
global.displayer = program => { global.__program = program; };

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
	vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'vendor/jszip.min.js'), 'utf8'), { filename: 'jszip.min.js' });
	global.JSZip = global.JSZip || global.window.JSZip;
	global.fetch = async url => ({ ok: true, arrayBuffer: async () => fs.readFileSync(path.join(ROOT, url)) });
	global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
	global.document.createElement = () => ({ style: {}, classList: { add() {} }, click() {}, set href(v) {}, set download(v) { caught.filename = v; } });
	global.document.body = { appendChild() {}, removeChild() {} };
	// the export writes the workbook and not the program, so what stands behind
	// the three tabs comes with it
	load('src/js/workbook.js');
	load('src/js/displayer.js');
	// jszip cannot build a Blob outside a browser, so it is asked for bytes
	const generate = JSZip.prototype.generateAsync;
	const caught = { bytes: null, alerts: [], filename: null };
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
	return fs.readdirSync(path.join(ROOT, 'examples')).filter(f => /^input.*\.txt$/.test(f))
		.map(f => 'examples/' + f)
		.concat(fs.readdirSync(path.join(__dirname, 'configs')).map(f => 'test/configs/' + f));
}

module.exports = { parse_config: text => global.parse_config(text), schedule, browser_bits, read, configs, load, ROOT };
