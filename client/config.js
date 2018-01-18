module.exports = {
	VERBOSE_MODE: false,
	modules: [
		'globalObject',
		'loadedEvent',
		'userObject',
		'cookies',
		'nodeObjects',
		'databaseErrors',
		'dataSavedEvent',
		'domEvents',
		'transclusionEvent',
		'connectionEvents',
		'permissions',
		'tagging',
		'clientManager',
		'signaling',
		'signalStream',
		'assets',
		'messages',
		'keepAlive',
		'nodeApproval'
	],
	// Reuse the parent's websocket when doing transclusion. Very experimental.
	reuseWebsocket: false,
	// Keep alive message interval in seconds. A falsy value disables keep alive.
	keepAliveInterval: 25,
	// Adds a not-approved attribute to DOM nodes that are not created with approved option
	approveVerbose: true,
	// Supports selector syntax, i.e. 'div.not-persisted' to not persist all DIV elements with the
	// class 'not-persisted'.
	isTransientElement: (DOMNode) => {
		return DOMNode.matches('transient,[not-approved]') || DOMNode.__isNotApproved__;
	},
	// Any attributeName starting with 'transient-' should be transient.
	isTransientAttribute: (DOMNode, attributeName) => attributeName.startsWith('transient-'),
	// Peer Connection configuration used for the WebRTC-based signal streaming.
	peerConnectionConfig: {
		'iceServers': [
			{ urls: 'stun:stun.services.mozilla.com' },
			{ urls: 'stun:stun.l.google.com:19302' }
		]
	}
};

