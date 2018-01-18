'use strict';
const coreConfig = require('./coreConfig');
const coreUtils = require('./coreUtils');
const coreEvents = require('./coreEvents');

const nodeApprovalModule = {
	enabled: true
};

const approvalType = {
	PROPERTY: 0,
	ATTRIBUTE: 1
};

nodeApprovalModule.TYPE = new Proxy(approvalType, {
	get: (target, name) => {
		if (name in target) return target[name];
		throw new Error(`Invalid approval type ${name}`);
	}
});

coreConfig.nodeApproval = {
	TYPE: nodeApprovalModule.TYPE,
	type: nodeApprovalModule.TYPE.PROPERTY,
	enable() {
		nodeApprovalModule.enabled = true;
	},
	disable() {
		nodeApprovalModule.enabled = false;
	}
};

/******************************************/
// @deprecated, will be removed soon
const getParameterByName = function (name, url) {
	if (!url) {
		url = window.top.location.href;
	}
	name = name.replace(/[\[\]]/g, '\\$&');
	let regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
	let results = regex.exec(url);
	if (!results) return null;
	if (!results[2]) return '';
	return decodeURIComponent(results[2].replace(/\+/g, ' '));
};

if (getParameterByName('verbose')) {
	coreConfig.nodeApproval.type = approvalType.ATTRIBUTE;
	console.log('verbose', true);
}
/******************************************/

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

const approveNode = (node, options) => {

	if (node.nodeType !== Node.ELEMENT_NODE || !nodeApprovalModule.enabled) return;

	if (!isApproved(options)) {
		switch (coreConfig.nodeApproval.type) {
			case approvalType.ATTRIBUTE:
				node.setAttribute('not-approved', '');
				break;
			case approvalType.PROPERTY:
				node.__isNotApproved__ = true;
				break;
			default:
				break;
		}
	}
};

coreEvents.addEventListener('beforeExecuteScripts', () => {

	console.log('execute node approval');

	const _createElementNS = Document.prototype.createElementNS;
	Document.prototype.createElementNS = function (namespaceURI, qualifiedName, options, ...unused) {
		let element = _createElementNS.call(this, namespaceURI, qualifiedName, options, unused);
		approveNode(element, options);
		return element;
	};

	const _createElement = Document.prototype.createElement;
	Document.prototype.createElement = function (tagName, options, ...unused) {
		let element = _createElement.call(this, tagName, options, unused);
		approveNode(element, options);
		return element;
	};

	const importNode = Document.prototype.importNode;
	Document.prototype.importNode = function (externalNode, deep, options, ...unused) {
		var element = importNode.call(this, externalNode, deep, ...unused);
		coreUtils.recursiveForEach(element, childNode => {
			approveNode(childNode, options);
		});
		return element;
	};

	const cloneNode = Node.prototype.cloneNode;
	Node.prototype.cloneNode = function (deep, options, ...unused) {
		var element = cloneNode.call(this, deep, ...unused);
		coreUtils.recursiveForEach(element, childNode => {
			approveNode(childNode, options);
		});
		return element;
	};
}, coreEvents.PRIORITY.IMMEDIATE);

module.exports = nodeApprovalModule;