'use strict';
const coreConfig = require('./coreConfig');
const coreEvents = require('./coreEvents');
const coreDatabase = require('./coreDatabase');
const corePathTree = require('./corePathTree');
const coreUtils = require('./coreUtils');
const coreJsonML = require('./coreJsonML');
const diffMatchPatch = require('diff-match-patch');

const coreOpCreator = {};

coreEvents.createEvent('createdOps');

// The 'idempotent' option allows these events to be created even if they already
// exists. We do this, because these events also are used (and created) in coreOpApplier.
coreEvents.createEvent('DOMAttributeSet', { idempotent: true });
coreEvents.createEvent('DOMAttributeRemoved', { idempotent: true });
coreEvents.createEvent('DOMNodeInserted', { idempotent: true });
coreEvents.createEvent('DOMNodeDeleted', { idempotent: true });
coreEvents.createEvent('DOMAttributeTextInsertion', { idempotent: true });
coreEvents.createEvent('DOMTextNodeInsertion', { idempotent: true });
coreEvents.createEvent('DOMAttributeTextDeletion', { idempotent: true });
coreEvents.createEvent('DOMTextNodeDeletion', { idempotent: true });

// The attribute's index into a JsonML element array.
const ATTRIBUTE_INDEX = 1;

// Instantiate the DiffMatchPatch library used for creating ops from text mutations.
const dmp = new diffMatchPatch();

/**
 * Convert a number of string patches to OT operations.
 * @param  {JsonMLPath} path Base path for patches to apply to.
 * @param  {string} oldValue Old value.
 * @param  {string} newValue New value.
 * @return {Ops}             List of resulting operations.
 */
function patchesToOps(path, oldValue, newValue) {
	const ops = [];

	var patches = dmp.patch_make(oldValue, newValue);

	Object.keys(patches).forEach(function(i) {
		var patch = patches[i], offset = patch.start1;
		patch.diffs.forEach(function([type, value]) {
			switch (type) {
				case diffMatchPatch.DIFF_DELETE:
					ops.push({ sd: value, p: [...path, offset] });
					break;
				case diffMatchPatch.DIFF_INSERT:
					ops.push({ si: value, p: [...path, offset] });
					// falls through intentionally
				case diffMatchPatch.DIFF_EQUAL:
					offset += value.length;
					break;
				default: throw Error(`Unsupported operation type: ${type}`);
			}
		});
	});

	return ops;
}

/**
 * Creates attribute operation (object insertion) from mutation.
 * @param  {MutationRecord} mutation MutationRecord created by MutationObserver.
 * @param  {PathNode} targetPathNode The PathNode from PathTree that is the target of the
 *                                   mutation.
 */
function attributeMutation(mutation, targetPathNode) {
	if (!targetPathNode || config.isTransientAttribute(mutation.target, mutation.attributeName)) {
		return;
	}

	// MongoDB doesn't support periods (.) i nkeys, so we store them as &dot; instead.
	const cleanAttributeName = coreUtils.escapeDots(mutation.attributeName);
	const targetPathNodeJsonML = targetPathNode.toPath();
	const path = [...targetPathNodeJsonML, ATTRIBUTE_INDEX, cleanAttributeName];
	const oldValue = mutation.oldValue;
	const newValue = coreUtils.escape(mutation.target.getAttribute(mutation.attributeName));
	const jsonmlAttrs = coreDatabase.elementAtPath([...targetPathNodeJsonML, ATTRIBUTE_INDEX]);

	// If the new value is null, we are removing the attribute.
	if (newValue === null) {
		coreEvents.triggerEvent('DOMAttributeRemoved', mutation.target, mutation.attributeName,
			oldValue, newValue, true);
		return [{ od: oldValue, p: path }];
	}

	if (newValue === jsonmlAttrs[cleanAttributeName]) {
		return [];
	}

	// dmp.patch_make does not accept empty strings, so if we are creating a new attribute (or
	// setting an attribute's value for the first time), we have to create the operation manually.
	// The second condition should not be true without the first one, but it will if the changes
	// happen so rapidly, that the browser skipped a MutationRecord. Or that's my theory, at least.
	// We are lose about checking jsonmlAttrs[attributeName], because we don't want to
	// diff, regardless of whether it's an empty string or it's null.
	// Also, if the newValue is short, it's easier and faster to just send it rather than patch it.
	let ops;
	if (oldValue === null || newValue.length < 50 || !jsonmlAttrs[cleanAttributeName]
		|| !coreConfig.attributeValueDiffing) {
		ops = [{ oi: newValue, p: path }];
	} else {
		ops = patchesToOps(path, jsonmlAttrs[cleanAttributeName], newValue);
	}

	coreEvents.triggerEvent('DOMAttributeSet', mutation.target, mutation.attributeName, oldValue,
		newValue, true);
	return ops;
}

/**
 * Creates string insertion and string deletion operations from mutation.
 * @param  {MutationRecord} mutation MutationRecord created by MutationObserver.
 * @param  {PathNode} targetPathNode The PathNode from PathTree that is the target of the
 *                                   mutation.
 */
function characterDataMutation(mutation, targetPathNode) {
	const oldValue = mutation.oldValue;
	const newValue = mutation.target.data;

	// No pathNode means transient, therefore not in the JsonML, so creating an op isn't possible and
	// also doesn't make sense.
	if (!targetPathNode) {
		return;
	}

	const isComment = mutation.target.nodeType === document.COMMENT_NODE;
	const path = targetPathNode.toPath();


	if (!isComment && coreDatabase.elementAtPath(path) !== oldValue) {
		// This should not happen, but it will if a text node is inserted and then altered right
		// after. If this happens, we can ignore it.
		return;
	}

	let ops = patchesToOps(path, oldValue, newValue);
	if (isComment) {
		ops[0].p.splice(ops[0].p.length - 1, 0, 1);
	}

	// In most cases, we could use mutation.target.parentElement to determine the parentElement, but
	// when deleting a node from the DOM, the target will no longer have a parentElement. Therefore,
	// we instead look at our path tree.
	const parentElement = targetPathNode.parent.DOMNode;

	ops.forEach((op) => {
		let type, value, charIndex = op.p[op.p.length - 1];
		if ('si' in op) {
			type = 'DOMTextNodeInsertion';
			value = op.si;
		} else if ('sd' in op) {
			type = 'DOMTextNodeDeletion';
			value = op.sd;
		}
		coreEvents.triggerEvent(type, mutation.target, parentElement, charIndex, value, true);
	});

	return ops;
}

/**
 * Creates node insertion and deletion operations from mutation.
 * @param  {MutationRecord} mutation MutationRecord created by MutationObserver.
 * @param  {PathNode} targetPathNode The PathNode from PathTree that is the target of the
 *                                   mutation.
 */
function childListMutation(mutation, targetPathNode) {
	let ops = [];

	Array.from(mutation.addedNodes).forEach(function(addedNode) {
		// Sanitizes all nodes (i.e. ensures valid tag names and attributes) and set wids on all nodes.
		const parentNode = mutation.target;

		let addedPathNode = corePathTree.getPathNode(addedNode, parentNode);

		// If an element already has a pathNode, it means it's already in the DOM. This could still
		// generate an op if the element is being moved. However, if the element is already in the DOM,
		// and it has the same parent as before, then it hasn't moved, so there's no reason to generate
		// an op.
		//
		// NOTE: I think there might be a bug here: If moving a text node around, it could have a
		// pathNode, but also have the same parent, in which case the move wouldn't create an op.
		// I am, however, unable to reproduce this...
		if (addedPathNode && targetPathNode.id === addedPathNode.parent.id) {
			return;
		}

		coreUtils.recursiveForEach(addedNode, (childNode, parentNode) => {
			if (childNode.nodeType === document.ELEMENT_NODE) {
				let sanitizedTagName = coreUtils.sanitizeString(childNode.tagName);
				// If the name is unsanitized, we remove the element and replace it with an identical
				// element with a sanitized tag name.
				if (sanitizedTagName !== childNode.tagName) {
					let replacementNode = document.createElementNS(childNode.tagName.namespaceURI,
						sanitizedTagName, { approved: true });

					// Move all children.
					while (childNode.firstChild) {
						coreUtils.appendChildWithoutScriptExecution(replacementNode, childNode.firstChild);
					}

					// Copy all attributes and sanitize them as well.
					for (let i = 0; i < childNode.attributes.length; i++) {
						let attr = childNode.attributes[i];
						replacementNode.setAttribute(coreUtils.sanitizeString(attr.nodeName),
							attr.nodeValue);
					}

					// Insert the element before childNode.
					coreUtils.appendChildWithoutScriptExecution(childNode.parentElement,
						replacementNode, childNode);
					childNode.remove();
					childNode = replacementNode;
				} else {
					// If we haven't replaced the element, we still have to sanitize the attributes.
					for (let i = 0; i < childNode.attributes.length; i++) {
						let attr = childNode.attributes[i];
						let sanitizedNodeName = coreUtils.sanitizeString(attr.nodeName);
						if (sanitizedNodeName !== attr.nodeName) {
							childNode.removeAttribute(attr.nodeName);
							childNode.setAttribute(sanitizedNodeName, attr.nodeValue);
						}
					}
				}

				// The element may being moved, and thus already is in the DOM and has a wid. We don't want
				// to redefine this. Also, the element can't be transient, i.e. its parent has to be in
				// the JsonML (targetPathNode must exist) and the element itself can't be transient.
				if (!childNode.__wid && targetPathNode && !config.isTransientElement(childNode)) {
					const wid = coreUtils.randomString();
					coreUtils.setWidOnElement(childNode, wid);
				}
			}
		}, parentNode);

		// The above wid/sanitization, we do recursively on each node, so one might naturally wonder why
		// we don't need to do the same here: Creating a PathTree (as below) happens recursively on all
		// child nodes automatically. When it comes to inserting the newly created PathTree afterwards,
		// that shouldn't happen recursively; we just need to add the newly created PathTree one place
		// in the existing tree.

		// If we can't create path node, it can't been registered in the JsonML at all, so creating
		// an op for it doesn't make sense. This happens for instance with transient elements.
		var newPathNode = corePathTree.create(addedNode, targetPathNode);
		if (!newPathNode) {
			coreEvents.triggerEvent('DOMNodeInserted', addedNode, mutation.target, true);
			return;
		}

		// We use the previous sibling to insert the new element in the correct position in the path
		// tree. However, if the previous sibling doesn't have a webstrate object, it won't be in the
		// path tree, so it will appear that the element has no previous element. Therefore, we
		// traverse the list of previous siblings until we find one that does have a webstrate object.
		// Transient elements (outside of template tags) will righfully be absent from the pathtree,
		// and thus not have webstrate objects.
		var previousSibling = mutation.previousSibling;
		var previousSiblingPathNode = corePathTree.getPathNode(previousSibling, parentNode);
		while (previousSibling && !previousSiblingPathNode) {
			previousSibling = previousSibling.previousSibling;
			previousSiblingPathNode = corePathTree.getPathNode(previousSibling, parentNode);
		}

		if (previousSibling) {
			var previousSiblingIndex = targetPathNode.children.indexOf(previousSiblingPathNode);
			targetPathNode.children.splice(previousSiblingIndex + 1, 0, newPathNode);
		} else if (mutation.nextSibling) {
			targetPathNode.children.unshift(newPathNode);
		} else {
			targetPathNode.children.push(newPathNode);
		}

		const path = corePathTree.getPathNode(addedNode, parentNode).toPath();
		const op = { li: coreJsonML.fromHTML(addedNode), p: path };
		ops.push(op);

		coreEvents.triggerEvent('DOMNodeInserted', addedNode, mutation.target, true);
	});

	Array.from(mutation.removedNodes).forEach(function(removedNode) {
		var removedPathNode = corePathTree.getPathNode(removedNode, mutation.target);

		// If an element has no path node, it hasn't been registered in the JsonML at all, so it won't
		// exist on other clients, and therefore creating an op to delete it wouldn't make sense.
		if (!removedPathNode) {
			coreEvents.triggerEvent('DOMNodeDeleted', removedNode, mutation.target, true);
			return;
		}

		const path = removedPathNode.toPath();
		removedPathNode.remove();
		var jsonmlElement = coreDatabase.elementAtPath(path);
		// If the element doesn't exist in the JsonML, we can't create an op for its deletion, and we
		// shouldn't either, so we return. This happens when we replace an unsanitized tag with a
		// sanitized one.
		if (!jsonmlElement) {
			return;
		}

		const op = { ld: jsonmlElement, p: path };
		ops.push(op);

		coreEvents.triggerEvent('DOMNodeDeleted', removedNode, mutation.target, true);
	});

	return ops;
}

coreOpCreator.emitOpsFromMutations = () => {
	coreEvents.addEventListener('mutation', (mutation) => {
		const targetPathNode = corePathTree.getPathNode(mutation.target);

		let ops;
		switch (mutation.type) {
			case 'attributes':
				ops = attributeMutation(mutation, targetPathNode); break;
			case 'characterData':
				ops = characterDataMutation(mutation, targetPathNode); break;
			case 'childList':
				ops = childListMutation(mutation, targetPathNode); break;
		}

		// In rare cases, what happens doesn't amount to an operation, so we ignore it.
		if (!ops || ops.length === 0) {
			return;
		}

		coreEvents.triggerEvent('createdOps', ops);
	}, coreEvents.PRIORITY.IMMEDIATE);
};

function addWidToElement(node) {
	if (node.nodeType === document.ELEMENT_NODE && !node.__wid) {
		const pathNode = corePathTree.getPathNode(node);
		// Anything without a pathNode is transient and therefore doesn't need a wid.
		if (pathNode) {
			const wid = coreUtils.randomString();
			coreUtils.setWidOnElement(node, wid);
			const ops = [{ oi: wid, p: [...pathNode.toPath(), ATTRIBUTE_INDEX, '__wid' ]}];
			coreEvents.triggerEvent('createdOps', ops);
		}
	}
}

coreOpCreator.ensureExistenceOfWids = (targetElement) => {
	coreUtils.recursiveForEach(targetElement, node => addWidToElement(node));
};

coreEvents.addEventListener('DOMNodeInserted', (node, parentElement, local) => {
	// If local is set, this node was inserted by ourself and thus already has a wid (if it needs to).
	if (!local) addWidToElement(node);
}, coreEvents.PRIORITY.IMMEDIATE);

coreEvents.addEventListener('DOMNodeDeleted', node => {
	if (node.__wid) {
		coreUtils.removeWidFromElement(node.__wid);
	}
});

module.exports = coreOpCreator;