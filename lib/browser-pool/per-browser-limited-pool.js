'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const Pool = require('./pool');
const LimitedPool = require('./limited-pool');
const log = require('debug')('gemini:pool:per-browser-limited');

module.exports = class PerBrowserLimitedPool extends Pool {
    constructor(config, underlyingPool) {
        super();

        const ids = config.getBrowserIds();
        this._browserPools = _.zipObject(
            ids,
            ids.map((id) => LimitedPool.create(config.forBrowser(id).sessionsPerBrowser, underlyingPool))
        );
    }

    getBrowser(id) {
        log(`request ${id}`);
        return this._browserPools[id].getBrowser(id);
    }

    freeBrowser(browser, opts) {
        log('free %o', browser);
        return this._browserPools[browser.id].freeBrowser(browser, opts);
    }

    cancel() {
        log('cancel');
        return Promise.map(_.values(this._browserPools), (pool) => pool.cancel());
    }
};
