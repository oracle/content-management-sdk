/**
 * Copyright (c) 2017, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl/
 */


import ContentManagementClientImpl from './managementAPI';
import ContentDeliveryClientImpl from './deliveryAPI';
import ContentPreviewClientImpl from './previewAPI';
import { logger, OptionsValidation } from './utils';

//
// ------------------------------- Content SDK -------------------------------------
//

/**
  * @typedef {object} ClientParameters
  * A JavaScript object containing the parameters to create the content client instance.
  * @property {string} [contentServer='protocol://host:port'] - URL to the
  * Oracle Content Management instance providing content.  The default
  * assumes the current '<i>protocol</i>://<i>host</i>:<i>port</i>'.
  * @property {('v1' | 'v1.1')} [contentVersion='v1.1'] - The version of the
  * content delivery REST API to use.
  * @property {string} [timeout=0] - Timeout for the AJAX calls, defaults to no timeout.
  * @property {string} [cacheBuster] - The URL parameter used to control
  * whether or not content is fetched from the browser cache.
  * @property {boolean} [secureContent=false] - Content is secured and requires sign-in to view.
  * @property {string} channelToken - The Oracle Content Management instance
  * token for accessing published content.
  * @property {string} [authorization] - Authorization header to include in the request.
  * @property {object} [options] - define which family of REST API calls should be used to connect
  * to the Content server.
  * @property {string} [options.deliveryClientAPI]  - Currently, only "deliveryREST" is supported and is the default value.
  * @property {string} [options.previewClientAPI]  - This can be set to "managementREST" (the default) or "previewREST".
  * @property {object} [authorizationParams] - Object containing application credentials. See {@link https://docs.oracle.com/en/cloud/paas/content-cloud/solutions/integrate-oracle-content-management-using-oauth.html}
  * @property {string} [authorizationParams.CLIENT_ID] - Id of client application
  * @property {string} [authorizationParams.CLIENT_SECRET] - Secret of client application
  * @property {string} [authorizationParams.CLIENT_SCOPE_URL] - Scope of application
  * @property {string} [authorizationParams.IDP_URL] - URL of Identity provider.
  * @property {function}[assetTransform=undefined] - optional function that can modify assets returned by getItem, getItems, and queryItems
  * TODO: Document the mod function modifying getItem(), getItems(), queryItems()
  * This will be used to generate new OAuth tokens on demand.
  * @property {function} [beforeSend=undefined] - Callback passing in the xhr
  * (browser) or options (NodeJS) object before making the REST call.
  * @property {object} logger - An object that implements the standard log functions:
  * ['error', 'warn', 'info', 'debug', 'log'].
 */

/**
 * @constructor
 * @alias contentSDK
 */

export default class contentSDK {
  /**
   * Create a delivery client to interact with content published
   * in Oracle Content Management.  A delivery client can
   * <ul>
   * <li>read published content items</li>
   * <li>download published digital assets</li>
   * <li>render published content using named content layouts</li>
   * </ul
   * @memberof contentSDK
   * @param {ClientParameters} args - A JavaScript object containing the parameters to
   * create the content delivery client instance.
   * @returns {ContentDeliveryClient}
   *
   * @example
   * import { contentSDK } from '@oracle/content-management-sdk';
   * // create a delivery client and output logging 'info' messages to the console
   * var deliveryClient = contentSDK.createDeliveryClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
  static createDeliveryClient(params) {
    // create the delivery client with the given args
    params.options = OptionsValidation.processOptions(params.options);

    let newSDK = null;
    if (params.options.deliveryClientAPI === OptionsValidation.deliveryREST) {
      logger.debug('Create a ContentDeliveryClient');
      newSDK = new ContentDeliveryClientImpl(
        typeof params === 'object' ? params : {},
      );
    } else {
      logger.error('Unknown type of delivery client');
    }

    logger.debug(
      'ContentSDK.createDelivery: created new Content SDK client object:',
    );
    logger.debug(newSDK);

    // expose public SDK if it was created or undefined if it failed
    return newSDK ? newSDK.publicSDK : undefined;
  }

  /**
   * Create a preview client to view draft (unpublished) content.
   * Preview clients can:
   * <ul>
   * <li>read content types.</li>
   * <li>read draft content items.</li>
   * <li>render draft content using named content layouts.</li>
   * </ul>
   * The preview client uses either the [management]{@link https://docs.oracle.com/en/cloud/paas/content-cloud/solutions/rest-api-content-management.html#GUID-D02A4CDF-7386-46FF-AD56-67ABE3E5A16F}
   * or [preview]{@link https://docs.oracle.com/en/cloud/paas/content-cloud/solutions/rest-api-content-preview.html#GUID-3875FFF1-27EC-4B5A-8EFE-A87FA47E5261}
   * REST API calls.  These APIs require authentication which
   * can be achieved by any of:
   * <ul>
   * <li>providing a beforeSend function to inject an Authorization header
   * <li>providing an Authorization header value via an authorization property of the arguments
   * <li>providing an authorizationParams object containing credentials to generate an OAuth
   * token from the specified identity provider.
   * </ul>
   * @memberof contentSDK
   * @param {ClientParameters} args - A JavaScript object containing the parameters to create
   * the content preview client instance.
   * @returns {ContentPreviewClient|ContentManagementClient}
   *
   * @example
   * import { contentSDK } from '@oracle/content-management-sdk';
   * // create a preview client (using preview REST API)
   * // and output logging 'info' messages to the console
   * var previewClient = contentSDK.createPreviewClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     options: {
   *         previewClientAPI: "previewREST",
   *     },
   *     authorizationParams: {
   *         CLIENT_ID: "123456ABC",
   *         CLIENT_SECRET: "7890123DEF",
   *         CLIENT_SCOPE_URL: "https://<ServiceInstanceBaseURL>:443/urn:opc:cec:all",
   *         IDP_URL: "https://idcs-123456.example.com",
   *     },
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   * @example
   * import { contentSDK } from '@oracle/content-management-sdk';
   * // create a legacy preview client (using Management REST API)
   * // and output logging 'info' messages to the console
   * var previewClient = contentSDK.createPreviewClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     authorization: 'Bearer A1234B5678C9012',
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
  static createPreviewClient(params) {
    params.options = OptionsValidation.processOptions(params.options);
    let newSDK = null;
    if (params.options.previewClientAPI === OptionsValidation.managementREST) {
      newSDK = new ContentManagementClientImpl(
        typeof params === 'object' ? params : {},
      );
    } else if (params.options.previewClientAPI === OptionsValidation.previewREST) {
      newSDK = new ContentPreviewClientImpl(
        typeof params === 'object' ? params : {},
      );
    }

    logger.debug(
      'ContentSDK.createPreviewClient: created new Content SDK client object:',
    );
    logger.debug(newSDK);

    // expose public SDK if it was created or undefined if it failed
    return newSDK ? newSDK.publicSDK : undefined;
  }
}

/**
   * Create a delivery client to interact with content published
   * in Oracle Content Management.  A delivery client can
   * <ul>
   * <li>read published content items</li>
   * <li>download published digital assets</li>
   * <li>render published content using named content layouts</li>
   * </ul
   * @param {ClientParameters} args - A JavaScript object containing the parameters to
   * create the content delivery client instance.
   * @returns {ContentDeliveryClient}
   *
   * @example
   * import { createDeliveryClient } from '@oracle/content-management-sdk';
   * // create a delivery client and output logging 'info' messages to the console
   * var deliveryClient = createDeliveryClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
function createDeliveryClient(param) {
  return contentSDK.createDeliveryClient(param);
}

/**
   * Create a preview client to view draft (unpublished) content.
   * Preview clients can:
   * <ul>
   * <li>read content types.</li>
   * <li>read draft content items.</li>
   * <li>render draft content using named content layouts.</li>
   * </ul>
   * The preview client uses either the [management]{@link https://docs.oracle.com/en/cloud/paas/content-cloud/solutions/rest-api-content-management.html#GUID-D02A4CDF-7386-46FF-AD56-67ABE3E5A16F}
   * or [preview]{@link https://docs.oracle.com/en/cloud/paas/content-cloud/solutions/rest-api-content-preview.html#GUID-3875FFF1-27EC-4B5A-8EFE-A87FA47E5261}
   * REST API calls.  These APIs require authentication which
   * can be achieved by any of:
   * <ul>
   * <li>providing a beforeSend function to inject an Authorization header
   * <li>providing an Authorization header value via an authorization property of the arguments
   * <li>providing an authorizationParams object containing credentials to generate an OAuth
   * token from the specified identity provider.
   * </ul>
   * @param {ClientParameters} args - A JavaScript object containing the parameters to create
   * the content preview client instance.
   * @returns {ContentPreviewClient|ContentManagementClient}
   *
   * @example
   * import { createPreviewClient } from '@oracle/content-management-sdk';
   * // create a preview client (using preview REST API)
   * // and output logging 'info' messages to the console
   * var previewClient = createPreviewClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     options: {
   *         previewClientAPI: "previewREST",
   *     },
   *     authorizationParams: {
   *         CLIENT_ID: "123456ABC",
   *         CLIENT_SECRET: "7890123DEF",
   *         CLIENT_SCOPE_URL: "https://<ServiceInstanceBaseURL>:443/urn:opc:cec:all",
   *         IDP_URL: "https://idcs-123456.example.com",
   *     },
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   * @example
   * import { createPreviewClient } from '@oracle/content-management-sdk';
   * // create a legacy preview client (using Management REST API)
   * // and output logging 'info' messages to the console
   * var previewClient = createPreviewClient({
   *     contentServer: contentServer,
   *     channelToken: channelToken,
   *     authorization: 'Bearer A1234B5678C9012',
   *     logger: {
   *         info: function (message) {
   *             console.log(message);
   *         }
   *     }
   * });
   */
function createPreviewClient(param) {
  return contentSDK.createPreviewClient(param);
}

export { contentSDK, createDeliveryClient, createPreviewClient };
