'use strict';
const coreEvents = require('./coreEvents');
const coreUtils = require('./coreUtils');
const coreWebsocket = require('./coreWebsocket');
const globalObject = require('./globalObject');

const importModule = {};

// Create internal event that other modules may subscribe to
coreEvents.createEvent('import');

// Create event in userland.
globalObject.createEvent('import');

const websocket = coreWebsocket.copy((event) => event.data.startsWith('{"wa":'));
const webstrateId = coreUtils.getLocationObject().webstrateId;

websocket.onjsonmessage = (message) => {
	if (message.d !== webstrateId) return;
	switch (message.wa) {
		case 'import':
			coreEvents.triggerEvent('import', message.import);
			globalObject.triggerEvent('import', message.import);
			break;
	}
};

/**
 * Makes it possible to select and upload an archive .
 * @param  {Function} callback Callback with two arguments, error and response. First argument will
 *                             be null on success.
 * @public
 */
globalObject.publicObject.import = (callback = () => {}, options = {}) => {
	const input = document.createElement('input');
	input.setAttribute('multiple', false);
	input.setAttribute('type', 'file');

	input.addEventListener('change', event => {
		const formData = new FormData();
		Object.entries(options).forEach(([key, value]) => formData.append(key, value));

		for (let i=0; i < input.files.length; i++) {
			formData.append('file[]', input.files.item(i));
		}
        
		let url = '/import';

		// Append user-defined webstrate id, which will be used as target webstrate id
		// when importing the archive.
		if (options.webstrateId) {
			url += `?id=${options.webstrateId}`;
		}

		fetch(url, {
			method: 'post',
			credentials: 'include',
			body: formData
		})
			.then(res => res.json()
				.then(json => callback(null, json))
				.catch(err => callback(err)))
			.catch(err => callback(err));
	});

	input.click();
};

module.exports = importModule;