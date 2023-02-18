/**
 * Copyright (c) 2017, 2023, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl/
 */
/* eslint-disable import/named */

import ContentDeliveryClientImpl from './deliveryAPI';
import { restAPIFactory, logger, utils } from './utils';

/**
 * Client object to interact with draft content in
 * Oracle Content Preview:
 * <ul>
 * <li>Authenticated connection to the Content Server.</li>
 * <li>Read content types.</li>
 * <li>Read draft content items.</li>
 * <li>Render draft content using named content layouts.</li>
 * </ul>
 * The content preview client SDK object uses the "/preview/" Content
 * REST API calls.  This requires the user to be logged in to the system.
 * alias ContentPreviewClient
 * @alias ContentPreviewClient
 * @augments ContentDeliveryClient
 */
class ContentPreviewClientImpl extends ContentDeliveryClientImpl {
  /**
   * @hideconstructor
   */
  constructor(args) {
    super(args);

    this.restAPI = restAPIFactory.createRestAPI(args.contentVersion);

    // update the logger entries
    logger.updateLogger(args.logger);

    // store the given properties
    Object.assign(this.info, {
      accessToken: args.channelToken || args.accessToken,
      channelToken: args.channelToken || args.accessToken,
      beforeSend: args.beforeSend,
      cacheBuster: args.cacheBuster,
      clientType: 'preview',
      contentServer: this.restAPI.extractServer(args.contentServer),
      contentType: 'preview',
      secureContent: args.secureContent || false,
      timeout: args.timeout || 0,
      contentVersion:
        this.restAPI.requestedContentVersion || this.restAPI.contentVersion,
      authorization: args.authorization,
    });

    // store if running in compiler
    this.isCompiler = args.isCompiler;

    // note supported content types
    this.validContentTypes = ['preview'];
    this.validLayoutTypes = this.validContentTypes;

    // define the external API
    this.publicSDK = {
      getInfo: utils.bind(this.getInfo, this),
      getItem: utils.bind(this.getItem, this),
      getItems: utils.bind(this.getItems, this),
      getAuthorizationHeaderValue: utils.bind(this.getAuthorizationHeaderValue, this),
      searchItems: utils.bind(this.queryItems, this),
      queryItems: utils.bind(this.queryItems, this),
      getRenditionURL: utils.bind(this.getRenditionURL, this),
      getLayoutInfo: utils.bind(this.getLayoutInfo, this),
      getRecommendationResults: utils.bind(this.getRecommendationResults, this),
      graphql: utils.bind(this.graphql, this),
      loadContentLayout: utils.bind(this.loadContentLayout, this),
      renderItem: utils.bind(this.renderItem, this),
      expandMacros: utils.bind(this.expandMacros, this),
      getTypes: utils.bind(this.getTypes, this),
      getType: utils.bind(this.getType, this),
      getTaxonomies: utils.bind(this.getTaxonomies, this),
      queryTaxonomies: utils.bind(this.queryTaxonomies, this),
      queryTaxonomyCategories: utils.bind(this.queryTaxonomyCategories, this),
    };

    logger.debug('ContentClient.create: Content Info:');
    logger.debug(this.info);
  }

  /**
   * Get a list of item types based on the search criteria.
   * <b>Not yet implemented for Preview API</b>
   * @param {object} args A JavaScript object containing the "getTypes"
   * parameters. If empty, it will return all content types.
   * @param {number} [args.limit] - Limit the number of content types returned.
   * @param {number} [args.offset] - Return results starting at this number in
   * the results.
   * @param {function} [args.beforeSend=undefined] - A callback passing in the
   * xhr (browser) or options (node) object before making the REST call.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * contentClient.getTypes().then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   * @example
   * contentClient.getTypes({
   *     limit: 10
   * }).then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  getTypes(params) {
    throw new Error('Unimplemented');
  }

  /**
   * Get a single item type given it's name. <br/>
   * The name can be found from the search results. <b>Not yet implemented for Preview API</b>
   * @param {object} args A JavaScript object containing the "getType" parameters.
   * @param {string} args.typeName The name of the content type to return.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed
   * @example
   * contentClient.getType({
   *     'typeName': 'Customer'
   * }).then(
   *     function (data) {
   *         console.log(data);
   *     }).catch(function (error) {
   *         console.log(error);
   *     });
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  getType(params) {
    throw new Error('Unimplemented');
  }

  /**
   * Get taxonomies for the channel.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   * <b>Not yet implemented for Preview API</b>
   *
   * @param {object} params - A JavaScript object containing the "queryTaxonomies" parameters.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * // get all taxonomies in draft status
   * client.queryTaxonomies({
   *      'q': '(status eq "' + draft + '")',
   * }).then(function (topLevelItem) {
   *      return topLevelItem;
   * }, function (xhr, status, error) {
   *      console.log(xhr.responseText);
   * });
   */
  queryTaxonomies(params) {
    return this.getTaxonomies(params);
  }

  /**
   * Get taxonomies for the channel.<br/>
   * All arguments are passed through to the Content Delivery REST API call.
   * <b>Not yet implemented for Preview API</b>
   *
   * @param {object} params - A JavaScript object containing the "getTaxonomies" parameters.
   * @returns {Promise} A JavaScript Promise object that can be used to retrieve
   * the data after the call has completed.
   * @example
   * // get all taxonomies
   * client.getTaxonomies().then(function (topLevelItem) {
   *      console.log(topLevelItem);
   *      return topLevelItem;
   * }, function (xhr, status, error) {
   *      console.log(xhr.responseText);
   * });
   */
  // eslint-disable-next-line no-unused-vars, class-methods-use-this
  getTaxonomies(params) {
    throw new Error('Unimplemented');
  }
}

export default ContentPreviewClientImpl;
