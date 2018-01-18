'use strict';
const coreEvents = require('./coreEvents');

const nodeApprovalModule = {
	enabled: true
};

/**
 * Checks if the options parameter is an object, if it has the approved property, and
 * if the approved property is set to true.
 * 
 * @param {*} options An object eventually having a property approved set to true.
 * 
 * @returns True if the options object has a property approved and set to true.
 */
const isApproved = (options) => {
	return (
		typeof options === 'object' &&
		options.hasOwnProperty('approved') &&
		options.approved
	);
};

const approveElement = (element, options) => {

	if (!nodeApprovalModule.enabled && isApproved(options)) {
		console.warn('document.createElement(tagName, { approved: true }) used, but not necessary');
	}

	if (nodeApprovalModule.enabled && !isApproved(options)) {
		if (config.approveVerbose) {
			element.setAttribute('not-approved', '');
		}
		else {
			element.__isNotApproved__ = true;
		}
	}
};

coreEvents.createEvent('enableApprove');
coreEvents.createEvent('disableApprove');

coreEvents.addEventListener('enableApprove', () => {
	// console.log('enable approve');
	// nodeApprovalModule.enabled = true;
}, coreEvents.PRIORITY.IMMEDIATE);

coreEvents.addEventListener('disableApprove', () => {
	// console.log('disable approve');
	// nodeApprovalModule.enabled = false;
}, coreEvents.PRIORITY.IMMEDIATE);

coreEvents.addEventListener('populatedBeforeScriptExecution', () => {

	console.log('execute node approval');

	const _createElement = Document.prototype.createElement;
	Document.prototype.createElement = function (tagName, options, ...unused) {
		let element = _createElement.call(this, tagName, options, unused);
		approveElement(element, options);
		return element;
	};

	const _createElementNS = Document.prototype.createElementNS;
	Document.prototype.createElementNS = function (namespaceURI, qualifiedName, options, ...unused) {
		let element = _createElementNS.call(this, namespaceURI, qualifiedName, options, unused);
		approveElement(element, options);
		return element;
	};

	// document.___createElementNS = document.createElementNS;
	// document.createElementNS = function(namespaceURI, qualifiedName, options, ...unused) {
	// 	let element = document.___createElementNS(namespaceURI, qualifiedName, options, unused);
	// 	approveElement(element, options);
	// 	return element;
	// };

	// document.___createElement = document.createElement;
	// document.createElement = function(tagName, options, ...unused) {
	// 	let element = document.___createElement(tagName, options, unused);
	// 	approveElement(element, options);
	// 	return element;
	// };
}, coreEvents.PRIORITY.IMMEDIATE);

module.exports = nodeApprovalModule;