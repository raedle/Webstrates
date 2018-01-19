'use strict';
const coreUtils = require('./coreUtils');
const coreEvents = require('./coreEvents');

// overwrite config.isTransientElement to make non-approved nodes transient
config.isTransientElement = (DOMNode) => {
	return DOMNode.matches('transient') || !(DOMNode.__approved__ || DOMNode.matches('[approved]'));
};

// Overwrite config.isTransientAttribute to make approved attribute in APPROVAL_TYPE.ATTRIBUTE
// transient, otherwise that attribute gets synchronized to the server
config.isTransientAttribute = (DOMNode, attributeName) => {
	return attributeName.startsWith('transient-') || attributeName === 'approved';
};

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
	if (isApproved(options)) {
		switch (nodeApprovalModule.options.approvalType) {
			case APPROVAL_TYPE.ATTRIBUTE:
				// only set approved attribute if possible
				if (typeof node.setAttribute === 'function') {
					node.setAttribute('approved', '');
				}
				break;
			case APPROVAL_TYPE.PROPERTY:
				node.__approved__ = true;
				break;
			default:
				break;
		}
	}
};

coreEvents.addEventListener('beforeExecuteScripts', (rootElement, html) => {

	// approve all nodes already in the document that was delivered by the server
	coreUtils.recursiveForEach(html, (childNode) => {
		approveNode(childNode, { approved: true });
	});

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