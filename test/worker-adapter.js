// jsdom has no Worker. Run the real browser worker in a separate Node thread,
// providing only the worker messaging and importScripts APIs it requires.
const { Worker } = require('node:worker_threads');
const path = require('node:path');
class BrowserWorker {
	constructor(url) {
		this.thread = new Worker(`
			const {parentPort, workerData} = require('node:worker_threads');
			const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
			global.self = global;
			global.location = new URL(workerData.url);
			console.log = () => {};
			global.postMessage = data => parentPort.postMessage(data);
			global.importScripts = (...files) => files.forEach(file => vm.runInThisContext(
				fs.readFileSync(path.join(workerData.root, file.split('?')[0]), 'utf8'), {filename:file}));
			importScripts('search-worker.js');
			parentPort.on('message', data => self.onmessage({data}));
		`, {eval:true, workerData:{url:String(url), root:path.join(__dirname, '../src/js')}});
		this.thread.on('message', data => this.onmessage?.({data}));
		this.thread.on('error', error => this.onerror?.({message:error.message}));
	}
	postMessage(data) { this.thread.postMessage(data); }
	terminate() { this.thread.terminate(); }
}
module.exports = { BrowserWorker };
