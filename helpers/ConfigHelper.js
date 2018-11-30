'use strict';

const fs = require('fs');

/** Create config file if it doesn't already exist by copying config-sample. */
const createConfig = () => {
	if (!fs.existsSync(APP_PATH + '/config.js')) {
		console.warn('No config file present, creating one now');
		if (!fs.existsSync(APP_PATH + '/config-sample.js')) {
			console.error('Sample config not present either, terminating');
			process.exit(1);
		} else {
			fs.copyFileSync(APP_PATH + '/config-sample.js', APP_PATH + '/config.js');
		}
	}
};

/** Read config file from disk. */
const getConfig = () => {
	try {
		return require(APP_PATH + '/config.js');
	} catch (e) {
		console.error('Unable to parse config file.');
		process.exit(1);
	}
};

/**
 * Merge two objects. Use target object with filler as a prototype, e.g. use the property on
 * target if it exists, otherwise copy over the property from filler to the target object.
 * @param  {Object} target Object to base result on.
 * @param  {Object} filler Object to copy missing properties from onto target.
 * @return {Object}        target object with missing properties from filler object.
 */
const mergeJSON = (target, filler) => {
	if (!target) return filler;

	if (typeof filler === 'object') {
		Object.entries(filler).forEach(([key, value]) => {
			target[key] = mergeJSON(target[key], filler[key]);
		});
	}

	return target || filler;
};

/**
 * Get merge configs from disk as object.
 * @return {Object} Config.
 */
exports.getConfig = () => {
	createConfig();
	return getConfig();
};