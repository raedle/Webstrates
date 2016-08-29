"use strict";

var shortId = require('shortid');

/**
 * ClientManager constructor.
 * @constructor
 */
module.exports = (function() {
	var module = {};

	// One-to-one mapping from socketIds to client sockets as well as one-to-many mapping from
	// socketId to webstrateIds.
	var clients = {};

	// One-to-many mapping from webstrateIds to clientIds. This could be derived from `clients`, but
	// this is faster.
	var webstrates = {};

	// One-to-many mapping from webstrateIds to nodeIds as well as one-to-many mapping from nodeIds
	// to socketIds.
	var nodeIds = {};

	/**
	 * Add client to ClientManager.
	 * @param  {Socket} client Client socket.
	 * @return {string}        Generated socketId.
	 * @public
	 */
	module.addClient = function(client) {
		var socketId = shortId.generate();
		clients[socketId] = {
			socket: client,
			webstrates: {} // contains a one-to-many mapping from webstrateIds to nodeIds.
		};

		return socketId;
	};

	/**
	 * Remove client from all webstrates (and broadcast departure) and remove client itself from
	 * ClientManager.
	 * @param {string} socketId SocketId.
	 * @public
	 */
	module.removeClient = function(socketId) {
		if (!clients[socketId]) {
			return;
		}

		Object.keys(clients[socketId].webstrates).forEach(function(webstrateId) {
			module.removeClientFromWebstrate(socketId, webstrateId);
		});

		delete clients[socketId];
	};

	/**
	 * Add client to Webstrate and broadcast join.
	 * @param {string} socketId    socketId.
	 * @param {string} webstrateId webstrateId.
	 * @public
	 */
	module.addClientToWebstrate = function(socketId, webstrateId) {
		if (!webstrates[webstrateId]) {
			webstrates[webstrateId] = [];
		}

		sendToClient(socketId, {
			wa: "hello",
			id: socketId,
			c: "webstrates",
			d: webstrateId,
			clients: webstrates[webstrateId]
		});

		broadcastToWebstrateClients(webstrateId, {
			wa: "clientJoin",
			id: socketId,
			c: "webstrates",
			d: webstrateId
		});

		webstrates[webstrateId].push(socketId);
		clients[socketId].webstrates[webstrateId] = [];
	};

	/**
	 * Remove client from webstrate and broadcast departure.
	 * @param {string} socketId    SocketId.
	 * @param {string} webstrateId WebstrateId.
	 * @public
	 */
	module.removeClientFromWebstrate = function(socketId, webstrateId) {
		var socketIdIdx = webstrates[webstrateId].indexOf(socketId);
		webstrates[webstrateId].splice(socketIdIdx, 1);

		clients[socketId].webstrates[webstrateId].forEach(function(nodeId) {
			unsubscribe(socketId, webstrateId, nodeId);
		});

		broadcastToWebstrateClients(webstrateId, {
			wa: "clientPart",
			id: socketId,
			c: "webstrates",
			d: webstrateId
		});
	};

	/**
	 * Subscribe client to signals on a node in a webstrate.
	 * @param  {string} socketId    SocketId.
	 * @param  {string} webstrateId WebstrateId.
	 * @param  {string} nodeId      NodeId.
	 * @public
	 */
	module.subscribe = function(socketId, webstrateId, nodeId) {
		// Make sure the client is connected to the webstrate.
		if (!clients[socketId].webstrates[webstrateId]) {
			return;
		}

		if (!nodeIds[webstrateId]) {
			nodeIds[webstrateId] = {};
		}

		if (!nodeIds[webstrateId][nodeId]) {
			nodeIds[webstrateId][nodeId] = [];
		}

		nodeIds[webstrateId][nodeId].push(socketId);
	};

	/**
	 * Unsubscribe client from signals on a node in a webstrate.
	 * @param {string} socketId    SocketId.
	 * @param {string} webstrateId WebstrateId.
	 * @param {string} nodeId      NodeId.
	 * @public
	 */
	module.unsubscribe = function(socketId, webstrateId, nodeId) {
		if (!nodeIds[webstrateId] || !nodeIds[webstrateId][nodeId]) {
			return;
		}

		var socketIdIdx = nodeIds[webstrateId][nodeId].indexOf(socketId);
		nodeIds[webstrateId][nodeId].splice(socketIdIdx, 1);

		var nodeIdIdx = clients[socketId].webstrates[webstrateId].indexOf(nodeId);
		clients[socketId].webstrates[webstrateId].splice(nodeIdIdx, 1);
	};

	/**
	 * Send signal to a list of clients (or a all clients) subscribed to a node in a webstrate.
	 * @param {string} senderSocketId SocketId of sender.
	 * @param {string} socketId       SocketId.
	 * @param {string} webstrateId    WebstrateId.
	 * @param {string} nodeId         NodeId.
	 * @public
	 */
	module.publish = function(senderSocketId, webstrateId, nodeId, message, recipients) {
		if (!nodeIds[webstrateId]) {
			return;
		}

		// Messages should be sent to everybody listening on the nodeId and the "document". We use a
		// Set, so we don't send to the same socketId twice.
		var listeners = new Set([...(nodeIds[webstrateId][nodeId] || []),
			...nodeIds[webstrateId]["document"]]);

		// If recipients is defined, make sure we only send to the recipients, and only the recipients
		// that are actually listening.
		if (recipients) {
			recipients = recipients.filter(function(recipientId) {
				return listeners.includes(recipientId);
			});
		} else {
			recipients = listeners;
		}

		recipients.forEach(function(recipientSocketId) {
			sendToClient(recipientSocketId, {
				wa: "publish",
				id: nodeId,
				c: "webstrates",
				d: webstrateId,
				s: senderSocketId,
				msg: message
			});
		});
	};

	/**
	 * Send message to all clients currently connected to a webstrate.
	 * @param  {string} webstrateId WebstrateId.
	 * @param  {string} message     Message.
	 * @private
	 */
	function broadcastToWebstrateClients(webstrateId, message) {
		if (!webstrates[webstrateId]) {
			return;
		}
		webstrates[webstrateId].forEach(function(socketId) {
			sendToClient(socketId, message);
		});
	}

	/**
	 * Send message to client by socketId.
	 * @param  {string} socketId SocketId.
	 * @param  {string} message  Message.
	 * @return {bool}            True on success, false on failure.
	 * @private
	 */
	function sendToClient(socketId, message) {
		try {
			clients[socketId].socket.send(JSON.stringify(message));
		} catch (e) {
			module.removeClient(socketId);
			return false;
		}
		return true;
	}

	return module;
}());