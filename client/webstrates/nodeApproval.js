'use strict';
const coreUtils = require('./coreUtils');
const coreEvents = require('./coreEvents');

const APPROVAL_TYPE = {
	PROPERTY: 'property',
	ATTRIBUTE: 'attribute'
};

const nodeApprovalModule = {
	init(options) {

		// assign options, otherwise use default options
		this.options = Object.assign({}, {
			approvalType: APPROVAL_TYPE.PROPERTY
		}, options);
	}
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

const approveNode = (node, options) => {
	if (node.nodeType !== Node.ELEMENT_NODE) return;

	if (!isApproved(options)) {
		switch (nodeApprovalModule.options.approvalType) {
			case APPROVAL_TYPE.ATTRIBUTE:
				node.setAttribute('not-approved', '');
				break;
			case APPROVAL_TYPE.PROPERTY:
				node.__isNotApproved__ = true;
				break;
			default:
				break;
		}
	}
};

coreEvents.addEventListener('beforeExecuteScripts', () => {

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