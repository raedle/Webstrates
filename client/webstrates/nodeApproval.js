'use strict';
const coreEvents = require('./coreEvents');
const globalObject = require('./globalObject');
const coreUtils = require('./coreUtils');

const ELEMENT_APPROVAL_TYPE = {
	PROPERTY: 'property',
	ATTRIBUTE: 'attribute'
};

const nodeApprovalModule = {
	init(options) {

		// assign options, otherwise use default options
		this.options = Object.assign({}, {
			approval: {
				element: ELEMENT_APPROVAL_TYPE.PROPERTY,
				attribute: false
			}
		}, options);
	}
};

// overwrite config.isTransientElement to make non-approved nodes transient
config.isTransientElement = (DOMNode) => {
	return DOMNode.matches('transient') || !(DOMNode.__approved__ || DOMNode.matches('[approved]'));
};

// Overwrite config.isTransientAttribute to make approved attribute in APPROVAL_TYPE.ATTRIBUTE
// transient, otherwise that attribute gets synchronized to the server
config.isTransientAttribute = (DOMNode, attributeName) => {
	return (
		attributeName.startsWith('transient-') ||
		attributeName === 'approved' ||
		(
			nodeApprovalModule.options.approval.attribute &&
			DOMNode.__approvedAttributes__ &&
			!DOMNode.__approvedAttributes__.includes(attributeName)
		)
	);
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
		switch (nodeApprovalModule.options.approval.element) {
			case ELEMENT_APPROVAL_TYPE.ATTRIBUTE:
				// only set approved attribute if possible
				if (typeof node.setAttribute === 'function') {
					node.setAttribute('approved', '');
				}
				break;
			case ELEMENT_APPROVAL_TYPE.PROPERTY:
				node.__approved__ = true;
				break;
			default:
				break;
		}

		// overriding the innerHTML property of the node to approve its children when
		// innerHTML is used
		if (node.nodeType === Node.ELEMENT_NODE) {
			const innerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

			Object.defineProperty(node, 'innerHTML', {
				set: (value) => {

					let returnValue = innerHTMLDescriptor.set.call(node, value);

					// recursively approve all children
					coreUtils.recursiveForEach(node, (childNode) => {
						approveNode(childNode, options);
					});

					return returnValue;
				},
				get: () => {
					return innerHTMLDescriptor.get.call(node);
				},
				configurable: true
			});
		}
	}
	else {
		if (typeof node.setAttribute === 'function') {
			node.setAttribute('not-approved', '');
		}
	}
};

const approveNodeAttribute = (node, name) => {
	if (!node.__approvedAttributes__) {
		node.__approvedAttributes__ = [];
	}

	if (!node.__approvedAttributes__.includes(name)) {
		node.__approvedAttributes__.push(name);
	}
};

const removeApproveNodeAttribute = (node, name) => {
	if (!node.__approvedAttributes__) {
		return;
	}
	// filter attribute name from approved attribute names
	node.__approvedAttributes__ = node.__approvedAttributes__.filter((n) => n !== name);
};

const approveNodeAttributes = (node) => {
	// Iterate over element's attributes
	for (let name of node.getAttributeNames()) {
		approveNodeAttribute(node, name);
	}
};

coreEvents.addEventListener('modulesLoaded', () => {
	if (nodeApprovalModule.options.approval.attribute) {
		coreEvents.addEventListener('DOMAttributeSet', (element, attributeName, oldValue, newValue,
			local) => {
			approveNodeAttribute(element, attributeName);
		});
	}

	console.log('%cDO NOT USE THE DOM EDITOR IN DEVELOPER TOOLS TO CHANGE WEBSTRATE DOCUMENT!',
		'background: #222; color: #ff0000; font-weight: bold; font-size: 2em');
}, coreEvents.PRIORITY.IMMEDIATE);

coreEvents.addEventListener('beforeExecuteScripts', (rootElement, html) => {

	// approve all nodes already in the document that was delivered by the server
	coreUtils.recursiveForEach(html, (childNode) => {
		approveNode(childNode, { approved: true });

		if (nodeApprovalModule.options.attributeApproval) {
			if (typeof childNode.getAttributeNames === 'function') {
				approveNodeAttributes(childNode);
			}
		}
	});

	const createElementNS = Document.prototype.createElementNS;
	Document.prototype.createElementNS = function (namespaceURI, qualifiedName, options, ...unused) {
		let element = createElementNS.call(this, namespaceURI, qualifiedName, options, ...unused);
		approveNode(element, options);
		return element;
	};

	const createElement = Document.prototype.createElement;
	Document.prototype.createElement = function (tagName, options, ...unused) {
		let element = createElement.call(this, tagName, options, ...unused);
		approveNode(element, options);
		return element;
	};

	const importNode = Document.prototype.importNode;
	Document.prototype.importNode = function (externalNode, deep, options, ...unused) {
		var element = importNode.call(this, externalNode, deep, ...unused);
		coreUtils.recursiveForEach(element, (childNode) => {
			approveNode(childNode, options);
		});
		return element;
	};

	const cloneNode = Node.prototype.cloneNode;
	Node.prototype.cloneNode = function (deep, options, ...unused) {
		var element = cloneNode.call(this, deep, ...unused);
		coreUtils.recursiveForEach(element, (childNode) => {
			approveNode(childNode, options);
		});
		return element;
	};

	if (nodeApprovalModule.options.approval.attribute) {
		const setAttributeNS = Element.prototype.setAttributeNS;
		Element.prototype.setAttributeNS = function (namespace, name, value, ...unused) {
			let returnValue = setAttributeNS.call(this, namespace, name, value, ...unused);
			approveNodeAttribute(this, name);
			return returnValue;
		};

		const setAttribute = Element.prototype.setAttribute;
		Element.prototype.setAttribute = function (name, value, ...unused) {
			let returnValue = setAttribute.call(this, name, value, ...unused);
			approveNodeAttribute(this, name);
			return returnValue;
		};

		const removeAttribute = Element.prototype.setAttribute;
		Element.prototype.removeAttribute = function (name, ...unused) {
			let returnValue = removeAttribute.call(this, name, ...unused);
			removeApproveNodeAttribute(this, name);
			return returnValue;
		};
	}
}, coreEvents.PRIORITY.IMMEDIATE);

// In static mode, the user object is not being sent to the client.
if (!coreUtils.getLocationObject().staticMode) {

	const functions = {
		createElementNS(namespaceURI, qualifiedName, options, ...unused) {
			options = Object.assign({}, options, { approved: true });
			return document.createElementNS(namespaceURI, qualifiedName, options, ...unused);
		},
		createElement(tagName, options, ...unused) {
			options = Object.assign({}, options, { approved: true });
			return document.createElement(tagName, options, ...unused);
		},
		importNode(externalNode, deep, options, ...unused) {
			options = Object.assign({}, options, { approved: true });
			return document.importNode(externalNode, deep, options, ...unused);
		}
	};

	const documentProxy = new Proxy(document, {
		get: function (obj, prop) {
			if (functions.hasOwnProperty(prop)) {
				return functions[prop];
			}
			
			let returnValue = obj[prop];

			if (typeof returnValue === 'function') {
				return function(...args) {
					return returnValue.call(document, ...args);
				};
			}
			return returnValue;
		}
	});

	globalObject.publicObject.document = documentProxy;
}

module.exports = nodeApprovalModule;