'use strict';
const coreEvents = require('./coreEvents');

// attribute name for optional modules loaded "lazily"
const attributeName = 'webstrate-modules';

coreEvents.createEvent('modulesLoaded');

/**
 * The lazy loading modules checks for the "webstrate-modules" attribute on the document
 * element, parses its value into an array of strings, and tries to lazy load the modules
 * defined in the array. For example, the attribute webstrate-modules="[&quot;nodeApproval&quot;]"
 * loads the module node approval immediately after the document was received on the client.
 */
coreEvents.addEventListener('receivedDocument', (doc) => {

	// document does not have data property, e.g. immediately after creating the document
	if (!doc.data) {
		return;
	}

	const attr = doc.data[1];
	if (typeof attr === 'object' && attr.hasOwnProperty(attributeName)) {
		try {
			let rawValue = attr[attributeName];
			let decodedValue = rawValue.replace(/&quot;/g, '"');

			// parse decoded value
			let modules = JSON.parse(decodedValue);

			// assert that value of attributeName attribute is an array
			console.assert(Array.isArray(modules), `${attributeName} attribute must be an array`);

			// now lazy load module
			modules.forEach((m) => {
				console.log(`lazy loading "${m.name}" module`);
				try {
					let module = require(`./${m.name}`);

					// init module with options if provided
					if (typeof m.options !== 'undefined' && typeof module.init === 'function') {
						module.init(m.options);
					}
				}
				catch (error) {
					console.warn(`module ${m.name} does not exist`);
				}
			});
		}
		catch (error) {
			console.error(`could not parse ${attributeName} attribute on document element`);
		}
	}

	coreEvents.triggerEvent('modulesLoaded');

}, coreEvents.PRIORITY.IMMEDIATE);

coreEvents.addEventListener('populated', (targetElement) => {

	const observer = new MutationObserver((mutations) => {

		// only reload if value changed
		mutations.forEach((mutation) => {
			let value = targetElement.getAttribute(attributeName);
			if (value !== mutation.oldValue) {
				let result = window.confirm(`The ${attributeName} attribute on document element updated 
				(a page reload is recommended).\n\nDo you want to reload?`);
				if (result) {
					window.location.reload();
				}
			}
		});
	});

	// only observe DOM mutations on document element and only the attribute webstrate-modules
	observer.observe(targetElement, {
		attributes: true,
		attributeFilter: [attributeName],
		attributeOldValue: true
	});
});