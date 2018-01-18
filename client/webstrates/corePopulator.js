'use strict';
const coreEvents = require('./coreEvents');
const coreUtils = require('./coreUtils');
const coreJsonML = require('./coreJsonML');
const corePathTree = require('./corePathTree');

const corePopulator = {};

coreEvents.createEvent('beforeExecuteScripts');
coreEvents.createEvent('populated');

/**
 * Reinsert and execute an array of scripts in order.
 * @param {array}    scripts  Array of script DOM elements.
 * @param {Function} callback Function to call once all scripts have been executed.
 * @public
 */
const executeScripts = (scripts, callback) => {
	var script = scripts.shift();
	if (!script) {
		return callback();
	}

	var executeImmediately = !script.src;
	var newScript = document.createElementNS(script.namespaceURI, 'script', { approved: true });
	if (!executeImmediately) {
		newScript.onload = newScript.onerror = function () {
			executeScripts(scripts, callback);
		};
	}

	// Copy over all attribtues.
	for (var i = 0; i < script.attributes.length; i++) {
		var attr = script.attributes[i];
		newScript.setAttribute(attr.nodeName, attr.nodeValue);
	}

	// Copy over all other properties.
	Object.assign(newScript, script);

	// We're defining the wid with defineProperty to make it non-modifiable, but assign will just copy
	// over the value, leaving it modifiable otherwise.
	coreUtils.setWidOnElement(newScript, script.__wid);

	newScript.innerHTML = script.innerHTML;

	script.parentElement.insertBefore(newScript, script);
	script.remove();

	if (executeImmediately) {
		executeScripts(scripts, callback);
	}
};

corePopulator.populate = function (rootElement, doc) {
	// Empty the document, so we can use it.
	while (rootElement.firstChild) {
		rootElement.removeChild(rootElement.firstChild);
	}

	const webstrateId = doc.id;
	const staticMode = coreUtils.getLocationObject().staticMode;
	// If the document doesn't exist (no type) or is empty (no data), we should recreate it, unless
	// we're in static mode. We should never modify the document from static mode.
	if ((!doc.type || doc.data.length === 0) && !staticMode) {
		if (!doc.type) {
			console.log(`Creating new sharedb document: "${webstrateId}".`);
			doc.create('json0');
		} else {
			console.warn(`Document: "${webstrateId}" exists, but was empty. Recreating basic document.`);
		}

		const op = [{
			'p': [], 'oi': [
				'html', {},
				['head', {},
					['title', {}, webstrateId]],
				['body', {}]
			]
		}];
		doc.submitOp(op);
	}

	// All documents are persisted as JsonML, so we only know how to work with JSON documents.
	if ((!staticMode && doc.type.name !== 'json0')
		|| (staticMode && doc.type !== 'http://sharejs.org/types/JSONv0')) {
		console.error(staticMode, doc.type);
		throw `Unsupported document type: ${doc.type.name}`;
	}


	// In order to execute scripts synchronously, we insert them all without execution, and then
	// execute them in order afterwards.
	const scripts = [];
	const html = coreJsonML.toHTML(doc.data, undefined, scripts);
	coreUtils.appendChildWithoutScriptExecution(rootElement, html);

	// Trigger event before scripts are executed.
	coreEvents.triggerEvent('beforeExecuteScripts');

	return new Promise((resolve) => {
		executeScripts(scripts, () => {
			// Do not include the parent element in the path, i.e. create corePathTree on the <html>
			// element rather than the document element.
			const targetElement = rootElement.childNodes[0];
			const pathTree = corePathTree.create(targetElement, null, true);
			pathTree.check();
			resolve();
			coreEvents.triggerEvent('populated', targetElement, webstrateId);
		});
	});
};

module.exports = corePopulator;