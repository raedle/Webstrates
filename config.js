const path = require('path');
const crypto = require('crypto');

module.exports = {
	listeningAddress: '0.0.0.0',
	get listeningPort() {
		return process.env.PORT || 7007;
	},
	get db() {
		return process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/webstrate';
	},
	get uploadsFolder() {
		const uploadsPath = process.env.UPLOADS_FOLDER || `${__dirname}/uploads/`;
		return path.resolve(uploadsPath);
	},
	niceWebstrateIds: true,
	maxAge: '1d',
	maxAssetSize: 100,
	auth: {
		cookie: {
			get secret() {
				// Generate secret and save it somewhere so it is not recreated on
				// server restart.
				return crypto.randomBytes(16).toString('base64');
			},
			duration: 31536000000
		},
		permissionTimeout: 300,
		defaultPermissions: [
			{
				username: 'anonymous',
				provider: '',
				permissions: 'rw'
			}
		],
		providers: {
		}
	},
	tagging: {
		autotagInterval: 3600,
		tagPrefix: 'Session of '
	}
};