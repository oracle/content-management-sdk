/**
 * Copyright (c) 2017, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl/
 */
/* eslint-disable import/named */
/* eslint-disable import/no-extraneous-dependencies */

/*
 * This file contains the TokenManager class, which contains methods used to create and maintain
 * authentication tokens to access to an instance of Oracle Content Management.
 *
 * The constructor of the class takes in OAUTHValues and a tokenString, which represent an object
 * containing the clientId, clientSecret, clientScopeUrl, and idpUrl used to create
 * access tokens and the direct access token, respectively. If both are provided, the
 * OAUTHValues take precedence.
 *
 * The AUTH environment variable is used to specify the Authentication header value
 * (including "Basic"/"Bearer") when the value does not change, corresponding to the tokenString
 * in the constructor.
 *
 * The AUTH_PARAMS environment variable is used to specify the Authentication object values
 * to get a new access token on expiry of the old one, corresponding to the OAUTHValues
 * in the constructor.
 *
 * A "delivery client" is used to view content which has been published to a public
 * channel or published to a secure channel.  The "preview client" is used to view content
 * which has been assigned to a channel but has not yet been published.
 *
 * The minimal information which needs to be specified is the server URL, the rest API version
 * to use and the channel token for the channel which contains the data to display in the app.
 *
 * When previewing content or using content in a secure channel, authentication is required.
 * @ignore
 */

class TokenManager {
  constructor(oauthValues, tokenString) {
    if (oauthValues !== undefined && oauthValues !== null) {
      this.clientId = oauthValues.clientId;
      this.clientSecret = oauthValues.clientSecret;
      this.clientScopeUrl = oauthValues.clientScopeUrl;
      this.idpUrl = oauthValues.idpUrl;
    } else {
      this.clientId = null;
      this.clientSecret = null;
      this.clientScopeUrl = null;
      this.idpUrl = null;
    }
    this.expiry = -1;
    this.currentToken = tokenString;
  }

  /**
     * Gets the Bearer authorization needed when using preview content or
     * content published to a secure channel.
     *
     * This will create a NEW access_token with a new expiry
     *
     * This is only called when rendering on the server, therefore we are safe
     * to use node-fetch and do not have to have a client version
     */
  async getBearerAuth() {
    // base64 encode CLIENT_ID:CLIENT_SECRET
    const authString = `${this.clientId}:${this.clientSecret}`;
    const authValue = (Buffer.from(authString)).toString('base64');

    // URL encode the CLIENT_SCOPE_URL
    const encodedScopeUrl = encodeURIComponent(this.clientScopeUrl);

    // build the full REST end point URL for getting the access token
    const restURL = new URL('/oauth2/v1/token', this.idpUrl);

    // make a request to the server to get the access token
    const body = `grant_type=client_credentials&scope=${encodedScopeUrl}`;

    const options = {
      hostname: restURL.hostname,
      port: 443,
      path: restURL.pathname,
      method: 'POST',
      headers: {
        Authorization: `Basic ${authValue}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': body.length,
      },
    };

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line global-require
      const https = require('https');
      const req = https.request(options, (res) => {
        let returnData = '';

        res.on('data', (chunk) => {
          returnData += chunk;
        });

        res.on('end', () => {
          const responseJSON = JSON.parse(returnData);

          const accessToken = responseJSON.access_token;
          const expiry = responseJSON.expires_in;

          resolve({
            authHeaderValue: `Bearer ${accessToken}`,
            expiry,
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(body);
      req.end();
    });
  }

  /**
     * Returns the auth value for any requests
     */
  async getAuthValue() {
    // if no token exists, create one if OAUTH values given OR
    // if the auth token has expired, refresh it, otherwise existing value will be returned
    // add a 5 second buffer to the expiry time

    // This code only runs if it has the object with the OAUTH server details
    if (this.clientId !== null) {
      if (this.expiry - 5000 < Date.now()) {
        const authDetails = await this.getBearerAuth();
        const globalAuthValue = authDetails.authHeaderValue;
        // Auth Expiry
        // calculate expiry, get the current date (in ms), add the expiry ms, then
        // create a new Date object, using the adjusted milliseconds time
        let currDateMS = Date.now();
        currDateMS += authDetails.expiry;
        this.expiry = new Date(currDateMS);
        this.currentToken = globalAuthValue;
      }
    }
    return this.currentToken;
  }
}

export default TokenManager;
