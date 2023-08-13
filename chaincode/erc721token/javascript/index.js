/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const erc20token = require('./lib/erc721token');

module.exports.erc20token = erc721token;
module.exports.contracts = [ erc721token ];
