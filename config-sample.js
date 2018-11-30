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
		const folder = process.env.UPLOADS_FOLDER || `${__dirname}/uploads/`;
		return path.resolve(folder);
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
			github: {
				node_module: 'passport-github',
				config: {
					clientID: '83d8dab56afbc353f16a',
					clientSecret: 'b0c405f4f9ec05f34fd5e0c0f71b765e02b7319d',
					callbackURL: 'http://localhost:7007/auth/github/callback'
				}
			}
		}
	},
	tagging: {
		autotagInterval: 3600,
		tagPrefix: 'Session of '
	}
};