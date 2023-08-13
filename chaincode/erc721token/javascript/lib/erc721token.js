/*
SPDX-License-Identifier: Apache-2.0
*/

'use strict';

const { Contract } = require('fabric-contract-api');

// Define objectType names for prefix
const balancePrefix = 'balance';
const nftPrefix = 'nft';
const approvalPrefix = 'approval';

// Define name and symbol for the token
const setName = 'My Token';
const setSymbol = 'MTY';
const setTokenId = '0';

class erc721token extends Contract {

    /**
     * To initialize the ledger, called to set name and symbol of the token.
     */
    async initLedger(ctx) {
        console.log('---------- START : Initialize Ledger --------------');
        // Check minter authorization - this sample assumes Org1 is the issuer with privilege to initialize contract (set the name and symbol)
        // const clientMSPID = ctx.clientIdentity.getMSPID();

        // Check contract options are not already set, client is not authorized to change them once intitialized
        const nameBytes = await ctx.stub.getState('name');
        if (nameBytes && nameBytes.length > 0) {
            throw new Error('contract options are already set, client is not authorized to change them');
        }

        await ctx.stub.putState('name', Buffer.from(setName));
        await ctx.stub.putState('symbol', Buffer.from(setSymbol));
        await ctx.stub.putState('tokenID', Buffer.from(setTokenId));
        console.info('============= END : Initialize Ledger ===========');
        return true;
    }

    async checkAccess(ctx) {
        let cid = new ClientIdentity(ctx.stub);
        console.log("cid: ", cid);
        if (!cid.assertAttributeValue('role', 'minter')) { 
            throw new Error('Not a valid user');
        }
        return true;
    }

    /**
     * balanceOf counts all non-fungible tokens assigned to an owner
     */
    async balanceOf(ctx, owner) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // There is a key record for every non-fungible token in the format of balancePrefix.owner.tokenId.
        // balanceOf() queries for and counts all records matching balancePrefix.owner.*
        const iterator = await ctx.stub.getStateByPartialCompositeKey(balancePrefix, [owner]);

        // Count the number of returned composite keys
        let balance = 0;
        let result = await iterator.next();
        while (!result.done) {
            balance++;
            result = await iterator.next();
        }
        return balance;
    }

    
    async _readNFT(ctx, tokenId) {
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        const nftBytes = await ctx.stub.getState(nftKey);
        if (!nftBytes || nftBytes.length === 0) {
            throw new Error(`The tokenId ${tokenId} is invalid. It does not exist`);
        }
        const nft = JSON.parse(nftBytes.toString());
        return nft;
    }

    /**
     * ownerOf finds the owner of a non-fungible token
     */
    async ownerOf(ctx, tokenId) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const nft = await this._readNFT(ctx, tokenId);
        const owner = nft.owner;
        if (!owner) {
            throw new Error('No owner is assigned to this token');
        }

        return owner;
    }

    /**
     * transferFrom transfers the ownership of a non-fungible token
     * from one owner to another owner
     */
    async transferFrom(ctx, from, to, tokenId) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const sender = ctx.clientIdentity.getID();

        const nft = await this._readNFT(ctx, tokenId);

        // Check if the sender is the current owner, an authorized operator,
        // or the approved client for this non-fungible token.
        const owner = nft.owner;
        const tokenApproval = nft.approved;
        const operatorApproval = await this.isApprovedForAll(ctx, owner, sender);
        if (owner !== sender && tokenApproval !== sender && !operatorApproval) {
            throw new Error('The sender is not allowed to transfer the non-fungible token');
        }

        // Check if `from` is the current owner
        if (owner !== from) {
            throw new Error('The from is not the current owner.');
        }

        // Clear the approved client for this non-fungible token
        nft.approved = '';

        // Overwrite a non-fungible token to assign a new owner.
        nft.owner = to;
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        await ctx.stub.putState(nftKey, Buffer.from(JSON.stringify(nft)));

        // Remove a composite key from the balance of the current owner
        const balanceKeyFrom = ctx.stub.createCompositeKey(balancePrefix, [from, tokenId]);
        await ctx.stub.deleteState(balanceKeyFrom);

        // Save a composite key to count the balance of a new owner
        const balanceKeyTo = ctx.stub.createCompositeKey(balancePrefix, [to, tokenId]);
        await ctx.stub.putState(balanceKeyTo, Buffer.from('\u0000'));

        // Emit the Transfer event
        const tokenIdInt = parseInt(tokenId);
        const transferEvent = { from: from, to: to, tokenId: tokenIdInt };
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify(transferEvent)));

        return true;
    }

    /**
     * approve changes or reaffirms the approved client for a non-fungible token
     */
    async approve(ctx, approved, tokenId) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const sender = ctx.clientIdentity.getID();

        const nft = await this._readNFT(ctx, tokenId);

        // Check if the sender is the current owner of the non-fungible token
        // or an authorized operator of the current owner
        const owner = nft.owner;
        const operatorApproval = await this.IsApprovedForAll(ctx, owner, sender);
        if (owner !== sender && !operatorApproval) {
            throw new Error('The sender is not the current owner nor an authorized operator');
        }

        // Update the approved client of the non-fungible token
        nft.approved = approved;
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        await ctx.stub.putState(nftKey, Buffer.from(JSON.stringify(nft)));

        // Emit the Approval event
        const tokenIdInt = parseInt(tokenId);
        const approvalEvent = { owner: owner, approved: approved, tokenId: tokenIdInt };
        ctx.stub.setEvent('Approval', Buffer.from(JSON.stringify(approvalEvent)));

        return true;
    }

    /**
     * setApprovalForAll enables or disables approval for a third party ("operator")
     * to manage all of message sender's assets
     *
     */
    async setApprovalForAll(ctx, operator, approved) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const sender = ctx.clientIdentity.getID();

        const approval = { owner: sender, operator: operator, approved: approved };
        const approvalKey = ctx.stub.createCompositeKey(approvalPrefix, [sender, operator]);
        await ctx.stub.putState(approvalKey, Buffer.from(JSON.stringify(approval)));

        // Emit the ApprovalForAll event
        const approvalForAllEvent = { owner: sender, operator: operator, approved: approved };
        ctx.stub.setEvent('ApprovalForAll', Buffer.from(JSON.stringify(approvalForAllEvent)));

        return true;
    }

    /**
     * getApproved returns the approved client for a single non-fungible token
     */
    async getApproved(ctx, tokenId) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const nft = await this._readNFT(ctx, tokenId);
        return nft.approved;
    }

    /**
     * IsApprovedForAll returns if a client is an authorized operator for another client
     */
    async isApprovedForAll(ctx, owner, operator) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const approvalKey = ctx.stub.createCompositeKey(approvalPrefix, [owner, operator]);
        const approvalBytes = await ctx.stub.getState(approvalKey);
        let approved;
        if (approvalBytes && approvalBytes.length > 0) {
            const approval = JSON.parse(approvalBytes.toString());
            approved = approval.approved;
        } else {
            approved = false;
        }

        return approved;
    }

    // ============== ERC721 metadata extension ===============

    /**
     * Name returns a descriptive name for a collection of non-fungible tokens in this contract
     *
     * @param {Context} ctx the transaction context
     * @returns {String} Returns the name of the token
     */
    async Name(ctx) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const nameAsBytes = await ctx.stub.getState('name');
        return nameAsBytes.toString();
    }

    /**
     * Symbol returns an abbreviated name for non-fungible tokens in this contract.
     *
     * @param {Context} ctx the transaction context
     * @returns {String} Returns the symbol of the token
    */
    async Symbol(ctx) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const symbolAsBytes = await ctx.stub.getState('symbol');
        return symbolAsBytes.toString();
    }

    /**
     * TokenURI returns a distinct Uniform Resource Identifier (URI) for a given token.
     *
     * @param {Context} ctx the transaction context
     * @param {string} tokenId The identifier for a non-fungible token
     * @returns {String} Returns the URI of the token
    */
    async TokenURI(ctx, tokenId) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const nft = await this._readNFT(ctx, tokenId);
        return nft.tokenURI;
    }

    // ============== ERC721 enumeration extension ===============

    /**
     * TotalSupply counts non-fungible tokens tracked by this contract.
     *
     * @param {Context} ctx the transaction context
     * @returns {Number} Returns a count of valid non-fungible tokens tracked by this contract,
     * where each one of them has an assigned and queryable owner.
     */
    async TotalSupply(ctx) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // There is a key record for every non-fungible token in the format of nftPrefix.tokenId.
        // TotalSupply() queries for and counts all records matching nftPrefix.*
        const iterator = await ctx.stub.getStateByPartialCompositeKey(nftPrefix, []);

        // Count the number of returned composite keys
        let totalSupply = 0;
        let result = await iterator.next();
        while (!result.done) {
            totalSupply++;
            result = await iterator.next();
        }
        return totalSupply;
    }

    // ============== Extended Functions for this sample ===============

    /**
     * Mint a new non-fungible token
     *
     * @param {Context} ctx the transaction context
     * @param {String} tokenId Unique ID of the non-fungible token to be minted
     * @param {String} tokenURI URI containing metadata of the minted non-fungible token
     * @returns {Object} Return the non-fungible token object
    */
    async MintWithTokenURI(ctx, tokenURI) {
        // Check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);
        const tokenIDAsBytes = await ctx.stub.getState('tokenID');
        const tokenId = tokenIDAsBytes.toString();
        // Check minter authorization - this sample assumes Org1 is the issuer with privilege to mint a new token
        // const clientMSPID = ctx.clientIdentity.getMSPID();
        // if (clientMSPID !== 'Org1MSP') {
        //     throw new Error('client is not authorized to mint new tokens');
        // }

        // Get ID of submitting client identity
        const minter = ctx.clientIdentity.getID();

        // Check if the token to be minted does not exist
        const exists = await this._nftExists(ctx, tokenId);
        if (exists) {
            throw new Error(`The token ${tokenId} is already minted.`);
        }

        // Add a non-fungible token
        const tokenIdInt = parseInt(tokenId);
        if (isNaN(tokenIdInt)) {
            throw new Error(`The tokenId ${tokenId} is invalid. tokenId must be an integer`);
        }
        const nft = {
            tokenId: tokenIdInt,
            owner: minter,
            tokenURI: tokenURI
        };
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        await ctx.stub.putState(nftKey, Buffer.from(JSON.stringify(nft)));
        await ctx.stub.putState('tokenID', Buffer.from((tokenIdInt+1).toString()));
        // A composite key would be balancePrefix.owner.tokenId, which enables partial
        // composite key query to find and count all records matching balance.owner.*
        // An empty value would represent a delete, so we simply insert the null character.
        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [minter, tokenId]);
        await ctx.stub.putState(balanceKey, Buffer.from('\u0000'));

        // Emit the Transfer event
        const transferEvent = { from: '0x0', to: minter, tokenId: tokenIdInt };
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify(transferEvent)));

        return nft;
    }

    /**
     * Burn a non-fungible token
     *
     * @param {Context} ctx the transaction context
     * @param {String} tokenId Unique ID of a non-fungible token
     * @returns {Boolean} Return whether the burn was successful or not
     */
    async Burn(ctx, tokenId) {
        // check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        const owner = ctx.clientIdentity.getID();

        // Check if a caller is the owner of the non-fungible token
        const nft = await this._readNFT(ctx, tokenId);
        if (nft.owner !== owner) {
            throw new Error(`Non-fungible token ${tokenId} is not owned by ${owner}`);
        }

        // Delete the token
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        await ctx.stub.deleteState(nftKey);

        // Remove a composite key from the balance of the owner
        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [owner, tokenId]);
        await ctx.stub.deleteState(balanceKey);

        // Emit the Transfer event
        const tokenIdInt = parseInt(tokenId);
        const transferEvent = { from: owner, to: '0x0', tokenId: tokenIdInt };
        ctx.stub.setEvent('Transfer', Buffer.from(JSON.stringify(transferEvent)));

        return true;
    }

    async _nftExists(ctx, tokenId) {
        const nftKey = ctx.stub.createCompositeKey(nftPrefix, [tokenId]);
        const nftBytes = await ctx.stub.getState(nftKey);
        return nftBytes && nftBytes.length > 0;
    }

    /**
     * ClientAccountBalance returns the balance of the requesting client's account.
     *
     * @param {Context} ctx the transaction context
     * @returns {Number} Returns the account balance
     */
    async ClientAccountBalance(ctx) {
        // check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Get ID of submitting client identity
        const clientAccountID = ctx.clientIdentity.getID();
        return this.balanceOf(ctx, clientAccountID);
    }

    // ClientAccountID returns the id of the requesting client's account.
    // In this implementation, the client account ID is the clientId itself.
    // Users can use this function to get their own account id, which they can then give to others as the payment address
    async ClientAccountID(ctx) {
        // check contract options are already set first to execute the function
        await this.CheckInitialized(ctx);

        // Get ID of submitting client identity
        const clientAccountID = ctx.clientIdentity.getID();
        return clientAccountID;
    }

    // Checks that contract options have been already initialized
    async CheckInitialized(ctx){
        const nameBytes = await ctx.stub.getState('name');
        if (!nameBytes || nameBytes.length === 0) {
            throw new Error('contract options need to be set before calling any function, call initLedger() to initialize contract');
        }
    }
}

module.exports = erc721token;